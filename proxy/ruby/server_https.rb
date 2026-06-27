#!/usr/bin/env ruby
# frozen_string_literal: true

require 'base64'
require 'fileutils'
require 'json'
require 'net/http'
require 'open3'
require 'openssl'
require 'time'
require 'uri'
require 'webrick'
require 'webrick/https'

DEFAULT_ALLOWED_ORIGINS = ['*'].freeze
DEFAULT_CERT_DIR = File.expand_path('.certs', __dir__)
DEFAULT_CERT_FILE = File.join(DEFAULT_CERT_DIR, 'localhost.pem')
DEFAULT_KEY_FILE = File.join(DEFAULT_CERT_DIR, 'localhost-key.pem')
LOCAL_CERT_NAMES = ['localhost', '127.0.0.1', '::1'].freeze

BLOCKED_HEADERS = %w[
  connection
  content-length
  cookie
  host
  origin
  referer
  sec-fetch-dest
  sec-fetch-mode
  sec-fetch-site
  transfer-encoding
].freeze

# Net::HTTP transparently decodes gzip/deflate response bodies, so headers
# describing the original (encoded) representation no longer match
# `bodyBase64` and would cause url.el to misread the response.
STALE_RESPONSE_HEADERS = %w[
  content-encoding
  content-length
  transfer-encoding
].freeze

def allowed_origins
  raw = ENV.fetch('WASMACS_PROXY_ALLOWED_ORIGINS', '')
  values = raw.strip.empty? ? DEFAULT_ALLOWED_ORIGINS : raw.split(',')
  values.map(&:strip).reject(&:empty?)
end

def assert_allowed_url(raw_url)
  target = URI.parse(raw_url.to_s)
  raise 'invalid URL' unless target.scheme && target.host
  raise "unsupported URL scheme: #{target.scheme}" unless %w[http https].include?(target.scheme)

  origin = "#{target.scheme}://#{target.host}"
  origin += ":#{target.port}" if target.port && target.port != target.default_port
  origins = allowed_origins
  raise "URL origin is not allowed: #{origin}" unless origins.include?('*') || origins.include?(origin)

  target
end

def normalize_headers(headers)
  source = case headers
           when Array then headers
           when Hash then headers.to_a
           else []
           end
  source.each_with_object({}) do |pair, normalized|
    name, value = pair
    name = name.to_s.downcase
    next if name.empty? || BLOCKED_HEADERS.include?(name)

    normalized[name] = value.to_s
  end
end

def request_body(payload, method)
  return nil if %w[GET HEAD].include?(method)
  return Base64.decode64(payload['bodyBase64']) if payload['bodyBase64'].is_a?(String)
  return payload['body'].to_s if payload.key?('body')

  nil
end

def log_proxy_event(request, message)
  origin = request['Origin'].to_s
  origin = '-' if origin.empty?
  $stderr.puts "[#{Time.now.utc.iso8601}] #{request.request_method} #{request.path} origin=#{origin} #{message}"
end

def apply_cors(response, request)
  origin = request['Origin']
  response['Access-Control-Allow-Headers'] = 'content-type'
  response['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
  response['Access-Control-Allow-Origin'] = origin.to_s.empty? ? '*' : origin
  response['Access-Control-Allow-Private-Network'] = 'true'
  response['Vary'] = 'Origin' unless origin.to_s.empty?
end

def json_response(request, response, status, payload)
  response.status = status
  apply_cors(response, request)
  response['Cache-Control'] = 'no-store'
  response['Content-Type'] = 'application/json; charset=utf-8'
  response.body = JSON.generate(payload)
end

def fetch_upstream(payload)
  target = assert_allowed_url(payload['url'])
  method = payload.fetch('method', 'GET').to_s.upcase
  request_class = Net::HTTP.const_get(method.capitalize)
  request = request_class.new(target)
  normalize_headers(payload['headers']).each { |name, value| request[name] = value }
  request.body = request_body(payload, method)

  response = Net::HTTP.start(target.host, target.port, use_ssl: target.scheme == 'https') do |http|
    http.request(request)
  end
  {
    url: target.to_s,
    status: response.code.to_i,
    statusText: response.message.to_s,
    headers: response.each_header.reject { |name, _| STALE_RESPONSE_HEADERS.include?(name.downcase) }
                     .map { |name, value| { name: name.downcase, value: value } },
    bodyBase64: Base64.strict_encode64(response.body || '')
  }
end

def find_mkcert
  candidates = [ENV['MKCERT'], '/opt/homebrew/bin/mkcert', '/usr/local/bin/mkcert', 'mkcert'].compact
  candidates.find do |candidate|
    if candidate.include?('/')
      File.executable?(candidate)
    else
      ENV.fetch('PATH', '').split(File::PATH_SEPARATOR).any? do |dir|
        File.executable?(File.join(dir, candidate))
      end
    end
  end
end

def ensure_tls_certificate(cert_file, key_file)
  return if File.file?(cert_file) && File.file?(key_file)

  mkcert = find_mkcert
  raise "TLS certificate is missing and mkcert was not found. Set TLS_CERT_FILE and TLS_KEY_FILE, or install mkcert." unless mkcert

  FileUtils.mkdir_p(File.dirname(cert_file))
  FileUtils.mkdir_p(File.dirname(key_file))
  command = [
    mkcert,
    '-cert-file', cert_file,
    '-key-file', key_file,
    *LOCAL_CERT_NAMES
  ]
  stdout, stderr, status = Open3.capture3(*command)
  return if status.success? && File.file?(cert_file) && File.file?(key_file)

  detail = [stdout, stderr].map(&:strip).reject(&:empty?).join("\n")
  raise "mkcert failed to create a localhost certificate#{detail.empty? ? '' : ":\n#{detail}"}"
end

def tls_certificate(cert_file, key_file)
  ensure_tls_certificate(cert_file, key_file)
  [OpenSSL::X509::Certificate.new(File.read(cert_file)), OpenSSL::PKey.read(File.read(key_file))]
end

class ProxyServlet < WEBrick::HTTPServlet::AbstractServlet
  def do_OPTIONS(request, response)
    log_proxy_event(request, 'preflight')
    response.status = 204
    apply_cors(response, request)
    response['Cache-Control'] = 'no-store'
  end

  def do_GET(request, response)
    log_proxy_event(request, 'method-not-allowed')
    response.status = 405
    apply_cors(response, request)
    response['Allow'] = 'POST'
    response.body = 'method not allowed'
  end

  def do_POST(request, response)
    payload = JSON.parse(request.body)
    log_proxy_event(request, "fetch #{payload['url']}")
    result = fetch_upstream(payload)
    log_proxy_event(request, "ok status=#{result[:status]} url=#{result[:url]}")
    json_response(request, response, 200, result)
  rescue StandardError => e
    log_proxy_event(request, "error #{e.message}")
    json_response(request, response, 400, { error: e.message })
  end
end

host = ENV.fetch('HOST', '127.0.0.1')
port = Integer(ENV.fetch('PORT', '8788'))
cert_file = File.expand_path(ENV.fetch('TLS_CERT_FILE', DEFAULT_CERT_FILE))
key_file = File.expand_path(ENV.fetch('TLS_KEY_FILE', DEFAULT_KEY_FILE))
certificate, private_key = tls_certificate(cert_file, key_file)

server = WEBrick::HTTPServer.new(
  BindAddress: host,
  Port: port,
  SSLEnable: true,
  SSLCertificate: certificate,
  SSLPrivateKey: private_key,
  AccessLog: [],
  Logger: WEBrick::Log.new($stderr, WEBrick::Log::WARN)
)

server.mount('/', ProxyServlet)

trap('TERM') { server.shutdown }
trap('INT') { server.shutdown }
puts "wasmacs fetch proxy listening at https://#{host}:#{port}/"
puts "TLS cert: #{cert_file}"
server.start

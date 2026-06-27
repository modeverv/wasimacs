# wasmacs fetch proxies

These examples provide a self-hosted network gateway for browser-hosted Emacs
package downloads. They implement the same request/response shape used by the
development `__wasmacs_network_fetch` route.

The proxy accepts only `POST` requests with JSON:

```json
{
  "url": "https://elpa.gnu.org/packages/archive-contents",
  "method": "GET",
  "headers": [["accept", "text/plain"]]
}
```

It returns JSON:

```json
{
  "url": "https://elpa.gnu.org/packages/archive-contents",
  "status": 200,
  "statusText": "OK",
  "headers": [{"name": "content-type", "value": "text/plain"}],
  "bodyBase64": "..."
}
```

For browser-hosted wasmacs to call a localhost proxy from a different page
origin, each sample answers CORS preflight requests with `OPTIONS` and includes
`Access-Control-Allow-Origin` on JSON responses. When the browser sends an
`Origin` header, the samples echo that exact origin instead of `*`; this keeps
Chrome's worker and Private/Local Network Access checks happy. The samples do
not use cookies or credentials. When a public HTTPS page, such as GitHub Pages,
calls `127.0.0.1`, modern browsers can also require a Private Network Access
preflight; the samples answer it with
`Access-Control-Allow-Private-Network: true`.

All samples require an allowlist. By default they allow GNU ELPA and MELPA:

```text
https://elpa.gnu.org
https://melpa.org
https://stable.melpa.org
```

Override this with `WASMACS_PROXY_ALLOWED_ORIGINS`, using a comma-separated
origin list:

```sh
WASMACS_PROXY_ALLOWED_ORIGINS=https://elpa.gnu.org,https://melpa.org
```

The samples also accept `PORT`, defaulting to `8787`.

## Node

```sh
PORT=8787 node proxy/node/server.mjs
```

## PHP

```sh
PORT=8787 php -S 127.0.0.1:8787 proxy/php/proxy.php
```

## Rust

```sh
PORT=8787 cargo run --manifest-path proxy/rust/Cargo.toml
```

## Perl

```sh
PORT=8787 perl proxy/perl/server.pl
```

## Ruby

```sh
PORT=8787 ruby proxy/ruby/server.rb
```

The Ruby sample binds to `127.0.0.1` and defaults to
`WASMACS_PROXY_ALLOWED_ORIGINS=*` for local development. Set
`WASMACS_PROXY_ALLOWED_ORIGINS` explicitly to restore an allowlist:

```sh
WASMACS_PROXY_ALLOWED_ORIGINS=https://elpa.gnu.org,https://melpa.org \
PORT=8787 \
ruby proxy/ruby/server.rb
```

For a Chrome-trusted local HTTPS endpoint on macOS, use the Ruby HTTPS sample.
It uses `mkcert` to create a local certificate under `proxy/ruby/.certs/` on
first start, unless `TLS_CERT_FILE` and `TLS_KEY_FILE` are set:

```sh
PORT=8788 ruby proxy/ruby/server_https.rb
```

Then pass the HTTPS endpoint to wasmacs:

```text
https://modeverv.github.io/wasmacs/app/xterm-atomics-pdump.html?network-proxy=https%3A%2F%2F127.0.0.1%3A8788%2F
```

If Chrome does not trust the generated certificate yet, run `mkcert -install`
once for the current macOS user, then restart Chrome.

## Python

```sh
PORT=8787 python3 proxy/python/server.py
```

On Windows with the Python launcher:

```powershell
$env:PORT = "8787"; py -3 proxy/python/server.py
```

## PowerShell

```sh
PORT=8787 pwsh -NoProfile -File proxy/powershell/server.ps1
```

PowerShell 7 is the most convenient built-in-adjacent option on Windows. On
macOS and Linux, install `pwsh` or use one of the other samples.

## Local runtime coverage

With these samples, a local proxy can usually be started without adding a web
server:

- macOS: Ruby and Perl are commonly present; Python 3 is present on many
  developer machines, but may need Command Line Tools, Homebrew, or mise.
- Linux: Python 3 is commonly present; Perl is also common; distro packages can
  provide the rest.
- Windows: PowerShell is the native path. Python works when the Python launcher
  or `python`/`python3` is installed.

For repeatable development, `mise` can install missing runtimes.

## Using a local proxy from wasmacs

Start one proxy locally:

```sh
WASMACS_PROXY_ALLOWED_ORIGINS=https://elpa.gnu.org,https://melpa.org \
PORT=8787 \
python3 proxy/python/server.py
```

If a browser reports `Failed to load 'http://127.0.0.1:8787/'`, first confirm
that the running proxy is the current version and answers preflight requests:

```sh
curl -i -X OPTIONS \
  -H 'Origin: https://modeverv.github.io' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Private-Network: true' \
  http://127.0.0.1:8787/
```

The response should be `204` or `200` and include
`Access-Control-Allow-Origin: https://modeverv.github.io` plus
`Access-Control-Allow-Private-Network: true`. Restart the proxy process after
pulling wasmacs changes; an old process can keep the port open while still
missing the required headers.

The Ruby sample writes request diagnostics to stderr. During a browser smoke
test, watch the terminal where the proxy is running:

```text
[2026-06-07T15:33:12Z] OPTIONS / origin=https://modeverv.github.io preflight
[2026-06-07T15:33:12Z] POST / origin=https://modeverv.github.io fetch https://elpa.gnu.org/packages/archive-contents
[2026-06-07T15:33:13Z] POST / origin=https://modeverv.github.io ok status=200 url=https://elpa.gnu.org/packages/archive-contents
```

No log line means the browser did not reach the proxy process. `OPTIONS` without
`POST` means the browser stopped after preflight. `POST ... error ...` means the
request reached the proxy and then failed at allowlist or upstream fetch time.

Then open wasmacs with the proxy endpoint in the query string:

```text
http://127.0.0.1:5173/app/xterm-atomics-pdump.html?network-proxy=http%3A%2F%2F127.0.0.1%3A8787%2F
```

`network-proxy` is stored in `localStorage` as `wasmacs.networkProxyUrl`, so the
same browser profile can keep using that endpoint until it is changed. The
alias `wasmacs-network-proxy` is accepted too.

The proxy can also be selected from Emacs Lisp:

```elisp
(require 'wasmacs-url-fetch)
(setq wasmacs-url-fetch-proxy-url "http://127.0.0.1:8787/")
(wasmacs-url-fetch-enable)
```

That variable is included in each `url.el` request and overrides the page-level
proxy default for that request.

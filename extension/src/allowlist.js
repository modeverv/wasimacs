import { ErrorCodes, makeError } from "./errors.js";

export const DEFAULT_TARGET_ALLOWLIST = Object.freeze([
  "https://elpa.gnu.org/*",
  "https://melpa.org/*",
  "https://raw.githubusercontent.com/*",
  "https://github.com/*",
]);

export const DEFAULT_CALLER_ORIGINS = Object.freeze([
  "http://localhost:*",
  "http://127.0.0.1:*",
  "https://modeverv.github.io",
]);

export const DEFAULT_OPTIONS = Object.freeze({
  allowedCallerOrigins: [...DEFAULT_CALLER_ORIGINS],
  targetAllowlist: [...DEFAULT_TARGET_ALLOWLIST],
  maxResponseBytes: 25 * 1024 * 1024,
  timeoutMs: 30_000,
  allowCredentials: false,
  allowPrivateNetworkTargets: false,
  auditLogLimit: 100,
});

export function normalizeOptions(options = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    allowedCallerOrigins: normalizeStringList(
      options.allowedCallerOrigins,
      DEFAULT_OPTIONS.allowedCallerOrigins,
    ),
    targetAllowlist: normalizeStringList(options.targetAllowlist, DEFAULT_OPTIONS.targetAllowlist),
    maxResponseBytes: normalizePositiveInteger(
      options.maxResponseBytes,
      DEFAULT_OPTIONS.maxResponseBytes,
    ),
    timeoutMs: normalizePositiveInteger(options.timeoutMs, DEFAULT_OPTIONS.timeoutMs),
    auditLogLimit: normalizePositiveInteger(options.auditLogLimit, DEFAULT_OPTIONS.auditLogLimit),
    allowCredentials: Boolean(options.allowCredentials),
    allowPrivateNetworkTargets: Boolean(options.allowPrivateNetworkTargets),
  };
}

function normalizeStringList(value, fallback) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

export function validateTargetPattern(pattern) {
  if (pattern === "<all_urls>" || pattern === "*://*/*") {
    return makeError(ErrorCodes.TARGET_NOT_ALLOWED, "Broad target patterns are disabled by default", {
      pattern,
    });
  }
  if (!/^(https?):\/\/[^/]+\/.*$/.test(pattern)) {
    return makeError(ErrorCodes.TARGET_NOT_ALLOWED, "Target pattern must be an http(s) URL pattern", {
      pattern,
    });
  }
  return null;
}

export function isCallerOriginAllowed(origin, patterns = DEFAULT_CALLER_ORIGINS) {
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  return patterns.some((pattern) => matchOriginPattern(parsed, pattern));
}

export function isTargetUrlAllowed(url, patterns = DEFAULT_TARGET_ALLOWLIST) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  return patterns.some((pattern) => matchUrlPattern(parsed, pattern));
}

export function isPrivateNetworkTarget(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }

  if (["file:", "chrome:", "chrome-extension:"].includes(parsed.protocol)) {
    return true;
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "0.0.0.0" || host === "::1") {
    return true;
  }
  if (/^127\./.test(host)) {
    return true;
  }

  const octets = host.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a, b] = octets;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function hasExactTargetOrigin(url, patterns = DEFAULT_TARGET_ALLOWLIST) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return patterns.some((pattern) => {
    const parts = parseUrlPattern(pattern);
    return (
      parts
      && !parts.host.startsWith("*.")
      && parts.port !== "*"
      && parts.scheme === parsed.protocol.slice(0, -1)
      && parts.host === parsed.hostname
      && normalizePort(parts.port, parts.scheme) === normalizePort(parsed.port, parts.scheme)
    );
  });
}

function matchOriginPattern(url, pattern) {
  const match = pattern.match(/^(https?):\/\/([^/:]+|\*\.[^/:]+)(?::(\*|\d+))?$/);
  if (!match) {
    return false;
  }
  const [, scheme, host, port = ""] = match;
  return (
    url.protocol === `${scheme}:`
    && matchHost(url.hostname, host)
    && (port === "*" || normalizePort(url.port, scheme) === normalizePort(port, scheme))
  );
}

function matchUrlPattern(url, pattern) {
  const parts = parseUrlPattern(pattern);
  if (!parts) {
    return false;
  }
  return (
    url.protocol === `${parts.scheme}:`
    && matchHost(url.hostname, parts.host)
    && (parts.port === "*" || normalizePort(url.port, parts.scheme) === normalizePort(parts.port, parts.scheme))
    && wildcardPathToRegExp(parts.path).test(`${url.pathname}${url.search}`)
  );
}

function parseUrlPattern(pattern) {
  const match = pattern.match(/^(https?):\/\/([^/]+)(\/.*)$/);
  if (!match) {
    return null;
  }
  const [, scheme, hostPort, path] = match;
  const [host, port = ""] = hostPort.split(":");
  return { scheme, host: host.toLowerCase(), port, path };
}

function matchHost(hostname, patternHost) {
  const host = hostname.toLowerCase();
  const pattern = patternHost.toLowerCase();
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === pattern;
}

function normalizePort(port, scheme) {
  if (port) {
    return port;
  }
  return scheme === "https" ? "443" : "80";
}

function wildcardPathToRegExp(pathPattern) {
  const escaped = pathPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

import { arrayBufferToBase64 } from "./base64.js";
import {
  DEFAULT_OPTIONS,
  hasExactTargetOrigin,
  isCallerOriginAllowed,
  isPrivateNetworkTarget,
  isTargetUrlAllowed,
  normalizeOptions,
} from "./allowlist.js";
import { appendAuditEntry, storageGet } from "./audit-log.js";
import { ErrorCodes, makeError, proxyErrorResponse } from "./errors.js";
import { makePong, validateBridgeMessage } from "./protocol.js";

const CHANNEL = "WASMACS_COMPANION";
const SAFE_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-type",
  "if-none-match",
  "if-modified-since",
  "range",
]);
const RESPONSE_HEADERS = new Set([
  "content-type",
  "content-length",
  "etag",
  "last-modified",
  "cache-control",
  "expires",
  "location",
]);

export async function handleRuntimeMessage(envelope, deps = {}) {
  const storage = deps.storage ?? globalThis.chrome?.storage?.local;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const options = normalizeOptions(await loadOptions(storage));

  if (!envelope || envelope.channel !== CHANNEL) {
    return proxyErrorResponse(null, makeError(ErrorCodes.BAD_MESSAGE, "Bad extension channel"));
  }

  const { callerOrigin, message } = envelope;
  const requestId = message?.requestId;
  const validationError = validateBridgeMessage(message);
  if (validationError) {
    return proxyErrorResponse(
      requestId,
      validationError,
      message?.type === "WASMACS_PROXY_PING" ? "WASMACS_PROXY_PONG" : "WASMACS_PROXY_RESPONSE",
    );
  }

  if (!isCallerOriginAllowed(callerOrigin, options.allowedCallerOrigins)) {
    return proxyErrorResponse(
      requestId,
      makeError(ErrorCodes.CALLER_NOT_ALLOWED, "Caller origin is not allowed", { callerOrigin }),
      message.type === "WASMACS_PROXY_PING" ? "WASMACS_PROXY_PONG" : "WASMACS_PROXY_RESPONSE",
    );
  }

  if (message.type === "WASMACS_PROXY_PING") {
    return makePong(requestId);
  }

  return handleProxyRequest({ message, callerOrigin, options, fetchImpl, storage });
}

async function handleProxyRequest({ message, callerOrigin, options, fetchImpl, storage }) {
  const { requestId, request } = message;
  const method = String(request.method || "GET").toUpperCase();
  const url = request.url;
  const credentials = request.credentials || "omit";
  const started = new Date().toISOString();

  const fail = async (error, status = null, bytes = 0) => {
    await audit(storage, options, {
      time: started,
      callerOrigin,
      method,
      url,
      status,
      bytes,
      credentials,
      result: error.code,
    });
    return proxyErrorResponse(requestId, error);
  };

  if (method !== "GET" && method !== "HEAD") {
    return fail(makeError(ErrorCodes.METHOD_NOT_ALLOWED, "Only GET and HEAD are supported", { method }));
  }
  if (!options.allowPrivateNetworkTargets && isPrivateNetworkTarget(url)) {
    return fail(makeError(ErrorCodes.PRIVATE_NETWORK_BLOCKED, "Private network targets are disabled", { url }));
  }
  if (!isTargetUrlAllowed(url, options.targetAllowlist)) {
    return fail(makeError(ErrorCodes.TARGET_NOT_ALLOWED, "Target URL is not in the allowlist", { url }));
  }
  if (
    credentials === "include"
    && (!options.allowCredentials || !hasExactTargetOrigin(url, options.targetAllowlist))
  ) {
    return fail(makeError(ErrorCodes.CREDENTIALS_NOT_ALLOWED, "Credentialed requests are disabled", { url }));
  }
  if (!fetchImpl) {
    return fail(makeError(ErrorCodes.INTERNAL_ERROR, "No fetch implementation is available"));
  }

  let headers;
  try {
    headers = filterRequestHeaders(request.headers || {});
  } catch (error) {
    return fail(error);
  }

  const timeoutMs = Math.min(Number(request.timeoutMs || options.timeoutMs), options.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method,
      headers,
      credentials,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });

    const contentLength = Number(response.headers?.get?.("content-length") || 0);
    if (contentLength > options.maxResponseBytes) {
      return fail(
        makeError(ErrorCodes.RESPONSE_TOO_LARGE, "Response exceeds configured size limit", {
          maxResponseBytes: options.maxResponseBytes,
          contentLength,
        }),
        response.status,
        0,
      );
    }

    const buffer = method === "HEAD" ? new ArrayBuffer(0) : await response.arrayBuffer();
    if (buffer.byteLength > options.maxResponseBytes) {
      return fail(
        makeError(ErrorCodes.RESPONSE_TOO_LARGE, "Response exceeds configured size limit", {
          maxResponseBytes: options.maxResponseBytes,
          byteLength: buffer.byteLength,
        }),
        response.status,
        buffer.byteLength,
      );
    }

    const result = {
      type: "WASMACS_PROXY_RESPONSE",
      version: 1,
      requestId,
      ok: true,
      response: {
        url: response.url || url,
        status: response.status,
        statusText: response.statusText,
        headers: filterResponseHeaders(response.headers),
        bodyBase64: method === "HEAD" ? null : arrayBufferToBase64(buffer),
        bodyText: null,
      },
      error: null,
    };
    await audit(storage, options, {
      time: started,
      callerOrigin,
      method,
      url,
      status: response.status,
      bytes: buffer.byteLength,
      credentials,
      result: "ok",
    });
    return result;
  } catch (error) {
    const code = error?.name === "AbortError" ? ErrorCodes.FETCH_TIMEOUT : ErrorCodes.FETCH_FAILED;
    return fail(makeError(code, error?.message || "Fetch failed", { url }));
  } finally {
    clearTimeout(timeout);
  }
}

async function loadOptions(storage) {
  if (!storage) {
    return DEFAULT_OPTIONS;
  }
  const stored = await storageGet(storage, [
    "allowedCallerOrigins",
    "targetAllowlist",
    "maxResponseBytes",
    "timeoutMs",
    "allowCredentials",
    "allowPrivateNetworkTargets",
    "auditLogLimit",
  ]);
  return { ...DEFAULT_OPTIONS, ...stored };
}

function filterRequestHeaders(headers) {
  const accepted = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    if (!SAFE_REQUEST_HEADERS.has(normalized) || normalized.startsWith("sec-")) {
      throw makeError(ErrorCodes.HEADER_NOT_ALLOWED, "Request header is not allowed", { header: name });
    }
    accepted[normalized] = String(value);
  }
  return accepted;
}

function filterResponseHeaders(headers) {
  const filtered = {};
  if (!headers?.forEach) {
    return filtered;
  }
  headers.forEach((value, name) => {
    const normalized = name.toLowerCase();
    if (RESPONSE_HEADERS.has(normalized)) {
      filtered[normalized] = value;
    }
  });
  return filtered;
}

async function audit(storage, options, entry) {
  await appendAuditEntry(storage, entry, options.auditLogLimit);
}

if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((envelope, _sender, sendResponse) => {
    handleRuntimeMessage(envelope).then(sendResponse, (error) => {
      sendResponse(proxyErrorResponse(null, makeError(ErrorCodes.INTERNAL_ERROR, error.message)));
    });
    return true;
  });
}

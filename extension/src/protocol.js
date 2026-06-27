import { ErrorCodes, makeError } from "./errors.js";

export const PROTOCOL_VERSION = 1;
export const REQUEST_TYPES = Object.freeze([
  "WASMACS_PROXY_PING",
  "WASMACS_PROXY_REQUEST",
]);

export function isProxyMessage(message) {
  return Boolean(message && typeof message === "object" && REQUEST_TYPES.includes(message.type));
}

export function validateBridgeMessage(message) {
  if (!message || typeof message !== "object") {
    return makeError(ErrorCodes.BAD_MESSAGE, "Message must be an object");
  }
  if (!REQUEST_TYPES.includes(message.type)) {
    return makeError(ErrorCodes.BAD_MESSAGE, "Unsupported message type", { type: message.type });
  }
  if (message.version !== PROTOCOL_VERSION) {
    return makeError(ErrorCodes.UNSUPPORTED_VERSION, "Unsupported protocol version", {
      version: message.version,
    });
  }
  if (typeof message.requestId !== "string" || message.requestId.length === 0) {
    return makeError(ErrorCodes.BAD_MESSAGE, "requestId must be a non-empty string");
  }
  if (message.type === "WASMACS_PROXY_REQUEST") {
    return validateProxyRequest(message.request);
  }
  return null;
}

export function validateProxyRequest(request) {
  if (!request || typeof request !== "object") {
    return makeError(ErrorCodes.BAD_MESSAGE, "request must be an object");
  }
  if (typeof request.url !== "string" || request.url.length === 0) {
    return makeError(ErrorCodes.BAD_MESSAGE, "request.url must be a non-empty string");
  }
  if (request.method !== undefined && typeof request.method !== "string") {
    return makeError(ErrorCodes.BAD_MESSAGE, "request.method must be a string");
  }
  if (request.headers !== undefined && !isPlainObject(request.headers)) {
    return makeError(ErrorCodes.BAD_MESSAGE, "request.headers must be an object");
  }
  if (
    request.credentials !== undefined
    && request.credentials !== "omit"
    && request.credentials !== "include"
  ) {
    return makeError(ErrorCodes.BAD_MESSAGE, "request.credentials must be omit or include");
  }
  if (request.timeoutMs !== undefined) {
    const timeout = Number(request.timeoutMs);
    if (!Number.isSafeInteger(timeout) || timeout <= 0) {
      return makeError(ErrorCodes.BAD_MESSAGE, "request.timeoutMs must be a positive integer");
    }
  }
  return null;
}

export function makePong(requestId) {
  return {
    type: "WASMACS_PROXY_PONG",
    version: PROTOCOL_VERSION,
    requestId,
    ok: true,
  };
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

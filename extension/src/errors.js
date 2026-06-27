export const ErrorCodes = Object.freeze({
  BAD_MESSAGE: "BAD_MESSAGE",
  UNSUPPORTED_VERSION: "UNSUPPORTED_VERSION",
  CALLER_NOT_ALLOWED: "CALLER_NOT_ALLOWED",
  TARGET_NOT_ALLOWED: "TARGET_NOT_ALLOWED",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  HEADER_NOT_ALLOWED: "HEADER_NOT_ALLOWED",
  PRIVATE_NETWORK_BLOCKED: "PRIVATE_NETWORK_BLOCKED",
  CREDENTIALS_NOT_ALLOWED: "CREDENTIALS_NOT_ALLOWED",
  FETCH_FAILED: "FETCH_FAILED",
  FETCH_TIMEOUT: "FETCH_TIMEOUT",
  RESPONSE_TOO_LARGE: "RESPONSE_TOO_LARGE",
  SERIALIZATION_FAILED: "SERIALIZATION_FAILED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
});

export function makeError(code, message, details = {}) {
  return { code, message, details };
}

export function proxyErrorResponse(requestId, error, type = "WASMACS_PROXY_RESPONSE") {
  return {
    type,
    version: 1,
    requestId: typeof requestId === "string" ? requestId : null,
    ok: false,
    response: null,
    error,
  };
}

(function wasmacsCompanionContentScript() {
  const CHANNEL = "WASMACS_COMPANION";
  const VERSION = 1;
  const REQUEST_TYPES = new Set(["WASMACS_PROXY_PING", "WASMACS_PROXY_REQUEST"]);

  function makeErrorResponse(message, code, text) {
    const type = message && message.type === "WASMACS_PROXY_PING"
      ? "WASMACS_PROXY_PONG"
      : "WASMACS_PROXY_RESPONSE";
    return {
      type,
      version: VERSION,
      requestId: typeof message?.requestId === "string" ? message.requestId : null,
      ok: false,
      response: null,
      error: {
        code,
        message: text,
        details: {},
      },
    };
  }

  function postToPage(response) {
    window.postMessage(response, window.location.origin);
  }

  function validateMessage(message) {
    if (!message || typeof message !== "object") {
      return "Message must be an object";
    }
    if (!REQUEST_TYPES.has(message.type)) {
      return "Unsupported message type";
    }
    if (message.version !== VERSION) {
      return "Unsupported protocol version";
    }
    if (typeof message.requestId !== "string" || message.requestId.length === 0) {
      return "requestId must be a non-empty string";
    }
    return null;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }
    const message = event.data;
    if (!message || typeof message !== "object" || !REQUEST_TYPES.has(message.type)) {
      return;
    }

    const validationError = validateMessage(message);
    if (validationError) {
      postToPage(makeErrorResponse(message, "BAD_MESSAGE", validationError));
      return;
    }

    chrome.runtime.sendMessage({
      channel: CHANNEL,
      callerOrigin: window.location.origin,
      message,
    }, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        postToPage(makeErrorResponse(message, "INTERNAL_ERROR", runtimeError.message));
        return;
      }
      postToPage(response);
    });
  });
}());

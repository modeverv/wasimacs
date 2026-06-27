import test from "node:test";
import assert from "node:assert/strict";
import { isProxyMessage, makePong, validateBridgeMessage } from "../src/protocol.js";

test("protocol accepts v1 ping", () => {
  const message = { type: "WASMACS_PROXY_PING", version: 1, requestId: "ping-1" };
  assert.equal(isProxyMessage(message), true);
  assert.equal(validateBridgeMessage(message), null);
  assert.deepEqual(makePong("ping-1"), {
    type: "WASMACS_PROXY_PONG",
    version: 1,
    requestId: "ping-1",
    ok: true,
  });
});

test("protocol rejects unknown version and malformed request", () => {
  assert.equal(validateBridgeMessage({ type: "WASMACS_PROXY_PING", version: 2, requestId: "x" }).code, "UNSUPPORTED_VERSION");
  assert.equal(validateBridgeMessage({ type: "WASMACS_PROXY_REQUEST", version: 1, requestId: "x" }).code, "BAD_MESSAGE");
});

test("protocol accepts safe proxy request shape", () => {
  const message = {
    type: "WASMACS_PROXY_REQUEST",
    version: 1,
    requestId: "fetch-1",
    request: {
      url: "https://elpa.gnu.org/packages/archive-contents",
      method: "GET",
      headers: { Accept: "text/plain" },
      credentials: "omit",
      timeoutMs: 30000,
    },
  };
  assert.equal(validateBridgeMessage(message), null);
});

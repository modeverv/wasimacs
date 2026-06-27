import test from "node:test";
import assert from "node:assert/strict";
import { handleRuntimeMessage } from "../src/service-worker.js";

function memoryStorage(initial = {}) {
  const state = { ...initial };
  return {
    state,
    get(keys, callback) {
      const result = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        result[key] = state[key];
      }
      callback(result);
    },
    set(value, callback) {
      Object.assign(state, value);
      callback();
    },
  };
}

function envelope(message, callerOrigin = "http://localhost:8175") {
  return {
    channel: "WASMACS_COMPANION",
    callerOrigin,
    message,
  };
}

test("service worker answers ping through allowed caller origin", async () => {
  const response = await handleRuntimeMessage(envelope({
    type: "WASMACS_PROXY_PING",
    version: 1,
    requestId: "ping-1",
  }), { storage: memoryStorage() });

  assert.deepEqual(response, {
    type: "WASMACS_PROXY_PONG",
    version: 1,
    requestId: "ping-1",
    ok: true,
  });
});

test("service worker fetches allowed GET and returns base64 response", async () => {
  const storage = memoryStorage();
  const response = await handleRuntimeMessage(envelope({
    type: "WASMACS_PROXY_REQUEST",
    version: 1,
    requestId: "fetch-1",
    request: {
      url: "https://elpa.gnu.org/packages/archive-contents",
      method: "GET",
      headers: { Accept: "text/plain,*/*" },
      credentials: "omit",
    },
  }), {
    storage,
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://elpa.gnu.org/packages/archive-contents");
      assert.equal(init.credentials, "omit");
      assert.deepEqual(init.headers, { accept: "text/plain,*/*" });
      return new Response("archive-data", {
        status: 200,
        statusText: "OK",
        headers: {
          "content-type": "text/plain",
          "set-cookie": "secret=1",
        },
      });
    },
  });

  assert.equal(response.ok, true);
  assert.equal(response.response.status, 200);
  assert.equal(response.response.headers["content-type"], "text/plain");
  assert.equal(response.response.headers["set-cookie"], undefined);
  assert.equal(Buffer.from(response.response.bodyBase64, "base64").toString("utf8"), "archive-data");
  assert.equal(storage.state.auditLog.length, 1);
  assert.equal(storage.state.auditLog[0].result, "ok");
});

test("service worker rejects disallowed targets and private network URLs", async () => {
  const disallowed = await handleRuntimeMessage(envelope({
    type: "WASMACS_PROXY_REQUEST",
    version: 1,
    requestId: "bad-target",
    request: { url: "https://example.com/", method: "GET" },
  }), { storage: memoryStorage(), fetchImpl: async () => new Response("") });
  assert.equal(disallowed.ok, false);
  assert.equal(disallowed.error.code, "TARGET_NOT_ALLOWED");

  const privateTarget = await handleRuntimeMessage(envelope({
    type: "WASMACS_PROXY_REQUEST",
    version: 1,
    requestId: "private-target",
    request: { url: "http://127.0.0.1:8080/private", method: "GET" },
  }), { storage: memoryStorage(), fetchImpl: async () => new Response("") });
  assert.equal(privateTarget.ok, false);
  assert.equal(privateTarget.error.code, "PRIVATE_NETWORK_BLOCKED");
});

test("service worker rejects dangerous headers and credentialed mode by default", async () => {
  const badHeader = await handleRuntimeMessage(envelope({
    type: "WASMACS_PROXY_REQUEST",
    version: 1,
    requestId: "bad-header",
    request: {
      url: "https://elpa.gnu.org/packages/archive-contents",
      method: "GET",
      headers: { Cookie: "secret=1" },
    },
  }), { storage: memoryStorage(), fetchImpl: async () => new Response("") });
  assert.equal(badHeader.ok, false);
  assert.equal(badHeader.error.code, "HEADER_NOT_ALLOWED");

  const credentialed = await handleRuntimeMessage(envelope({
    type: "WASMACS_PROXY_REQUEST",
    version: 1,
    requestId: "credentialed",
    request: {
      url: "https://elpa.gnu.org/packages/archive-contents",
      method: "GET",
      credentials: "include",
    },
  }), { storage: memoryStorage(), fetchImpl: async () => new Response("") });
  assert.equal(credentialed.ok, false);
  assert.equal(credentialed.error.code, "CREDENTIALS_NOT_ALLOWED");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  hasExactTargetOrigin,
  isCallerOriginAllowed,
  isPrivateNetworkTarget,
  isTargetUrlAllowed,
  validateTargetPattern,
} from "../src/allowlist.js";

test("caller origin allowlist accepts local wasmacs origins", () => {
  assert.equal(isCallerOriginAllowed("http://localhost:8175"), true);
  assert.equal(isCallerOriginAllowed("http://127.0.0.1:5173"), true);
  assert.equal(isCallerOriginAllowed("https://example.com"), false);
});

test("target allowlist matches explicit hosts without substring tricks", () => {
  assert.equal(isTargetUrlAllowed("https://elpa.gnu.org/packages/archive-contents"), true);
  assert.equal(isTargetUrlAllowed("https://melpa.org/packages/archive-contents"), true);
  assert.equal(isTargetUrlAllowed("https://raw.githubusercontent.com/modeverv/wasmacs/main/README.md"), true);
  assert.equal(isTargetUrlAllowed("https://elpa.gnu.org.evil.test/packages/archive-contents"), false);
  assert.equal(isTargetUrlAllowed("javascript:alert(1)"), false);
});

test("private network guard rejects local and RFC1918 targets", () => {
  assert.equal(isPrivateNetworkTarget("http://localhost:8080/"), true);
  assert.equal(isPrivateNetworkTarget("http://127.0.0.1:8080/"), true);
  assert.equal(isPrivateNetworkTarget("http://10.0.0.5/"), true);
  assert.equal(isPrivateNetworkTarget("http://172.16.1.10/"), true);
  assert.equal(isPrivateNetworkTarget("http://192.168.1.2/"), true);
  assert.equal(isPrivateNetworkTarget("https://elpa.gnu.org/"), false);
});

test("broad target patterns are rejected", () => {
  assert.equal(validateTargetPattern("<all_urls>").code, "TARGET_NOT_ALLOWED");
  assert.equal(validateTargetPattern("*://*/*").code, "TARGET_NOT_ALLOWED");
  assert.equal(validateTargetPattern("https://elpa.gnu.org/*"), null);
});

test("credentialed requests require exact target origins", () => {
  assert.equal(hasExactTargetOrigin("https://elpa.gnu.org/packages/archive-contents"), true);
  assert.equal(hasExactTargetOrigin("https://sub.elpa.gnu.org/packages/archive-contents", ["https://*.gnu.org/*"]), false);
});

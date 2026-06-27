# PLAN.md — wasmacs Chrome Companion CORS Proxy Extension

## Purpose

Build a user-installed Chrome Extension companion for wasmacs that provides a controlled network proxy capability.

The goal is to let wasmacs request network resources that normal in-page `fetch()` cannot access because of browser CORS restrictions. This extension must not silently weaken the browser security model. It should behave as an explicit user-granted Network Capability Service.

The extension is intended for local/dev/self-hosted use first. It may later become a packaged `.crx`, but the first milestone targets an unpacked Manifest V3 extension that the user manually loads into Chrome.

## Design Principle

Do not implement “disable CORS globally”.

Implement:

```text
wasmacs page
  -> content-script bridge
  -> extension service worker
  -> fetch with host_permissions
  -> response copied back to wasmacs
```

The extension is a companion network broker. It is not a transparent browser-wide proxy, not a credential harvester, and not a generic header-rewriting extension.

## Non-goals

* Do not modify arbitrary web responses to inject `Access-Control-Allow-Origin`.
* Do not intercept all browser traffic by default.
* Do not read DOM contents from arbitrary pages.
* Do not read or export cookies.
* Do not forward credentials by default.
* Do not create a public HTTP proxy server.
* Do not implement malware-like persistence, obfuscation, stealth, or auto-install behavior.
* Do not use remote code loading.
* Do not require Chrome flags such as `--disable-web-security`.

## Initial Use Cases

The first supported wasmacs use cases are:

1. Fetch ELPA package metadata and tarballs.
2. Fetch MELPA package metadata and tarballs.
3. Fetch raw files from GitHub.
4. Fetch user-approved arbitrary URLs from a manually configured allowlist.
5. Return response bytes to wasmacs so the wasm filesystem can write them into `/home/user`.

Example target resources:

```text
https://elpa.gnu.org/*
https://melpa.org/*
https://raw.githubusercontent.com/*
https://github.com/*
```

## Threat Model

This extension is powerful. Treat it as a user-granted network capability.

Risks:

* A malicious page could try to use the extension as an arbitrary cross-origin fetch proxy.
* A malicious wasmacs workspace or Elisp package could request sensitive internal URLs.
* Credentialed fetches could leak private data.
* A wildcard host permission could surprise the user.
* Large downloads could exhaust memory or browser storage.

Mitigations:

* Only accept messages from allowed wasmacs origins.
* Use an explicit allowlist for target URLs.
* Default to `credentials: "omit"`.
* Require a separate advanced setting for credentialed requests.
* Reject private network targets by default unless explicitly enabled.
* Limit response size.
* Log requests in an extension-visible audit panel.
* Return structured errors instead of failing silently.
* Keep dangerous modes disabled by default.

## Architecture

```text
app/
  wasmacs page
    window.postMessage({ type: "WASMACS_PROXY_REQUEST", ... })

extension/
  content-script.js
    validates message source
    forwards request to service worker
    returns result to page

  service-worker.js
    validates request schema
    validates caller origin
    validates target URL allowlist
    performs fetch()
    serializes response
    returns response or structured error

  options.html/options.js
    configure allowed wasmacs origins
    configure allowed target URL patterns
    configure max response size
    configure credentials policy
    view audit log

  manifest.json
    Manifest V3
    service_worker background
    content_scripts for wasmacs origins
    host_permissions for target domains
```

## Communication Model

Use `window.postMessage` between the wasmacs page and the content script.

Use `chrome.runtime.sendMessage` between the content script and the service worker.

Do not require the page to know the extension ID in Milestone 1. This avoids a hard dependency on a packed extension ID during unpacked development.

Later, optionally support `externally_connectable` for direct page-to-extension messaging.

## Request Protocol v1

### Page to content script

```json
{
  "type": "WASMACS_PROXY_REQUEST",
  "version": 1,
  "requestId": "uuid-or-monotonic-id",
  "request": {
    "url": "https://elpa.gnu.org/packages/archive-contents",
    "method": "GET",
    "headers": {
      "Accept": "text/plain,*/*"
    },
    "bodyBase64": null,
    "responseType": "arrayBuffer",
    "credentials": "omit",
    "timeoutMs": 30000
  }
}
```

### Content script to page

```json
{
  "type": "WASMACS_PROXY_RESPONSE",
  "version": 1,
  "requestId": "same-id",
  "ok": true,
  "response": {
    "url": "https://elpa.gnu.org/packages/archive-contents",
    "status": 200,
    "statusText": "OK",
    "headers": {
      "content-type": "text/plain"
    },
    "bodyBase64": "...",
    "bodyText": null
  },
  "error": null
}
```

### Error response

```json
{
  "type": "WASMACS_PROXY_RESPONSE",
  "version": 1,
  "requestId": "same-id",
  "ok": false,
  "response": null,
  "error": {
    "code": "TARGET_NOT_ALLOWED",
    "message": "Target URL is not in the allowlist",
    "details": {
      "url": "https://example.com/private"
    }
  }
}
```

## Supported Methods

Milestone 1:

```text
GET
HEAD
```

Milestone 2:

```text
POST
PUT
DELETE
PATCH
```

Do not add non-GET methods until allowlist and audit logging are implemented.

## Header Policy

Allow safe request headers:

```text
Accept
Accept-Language
Content-Type
If-None-Match
If-Modified-Since
Range
User-Agent-like custom header is not allowed
```

Reject or ignore dangerous/forbidden headers:

```text
Cookie
Authorization
Proxy-Authorization
Host
Origin
Referer
Sec-*
Connection
Content-Length
```

Response headers should be filtered before returning to wasmacs. Return useful metadata only:

```text
content-type
content-length
etag
last-modified
cache-control
expires
location
```

## Credential Policy

Default:

```text
credentials: "omit"
```

Allowed values:

```text
omit
include
```

Rules:

* `include` is disabled by default.
* `include` requires an explicit option toggle.
* `include` is only allowed for exact target origins, not wildcard patterns.
* Audit log must record when credentialed mode was used.
* Never expose cookies directly to wasmacs.

## URL Allowlist Policy

Milestone 1 default target allowlist:

```json
[
  "https://elpa.gnu.org/*",
  "https://melpa.org/*",
  "https://raw.githubusercontent.com/*",
  "https://github.com/*"
]
```

Allowed wasmacs origins:

```json
[
  "http://localhost:*",
  "http://127.0.0.1:*",
  "https://<user-configured-wasmacs-origin>/*"
]
```

Do not default to:

```json
[
  "<all_urls>",
  "*://*/*"
]
```

Advanced mode may allow user-defined patterns, but the UI must warn clearly.

## Private Network Guard

Reject by default:

```text
http://localhost/*
http://127.0.0.1/*
http://0.0.0.0/*
http://10.0.0.0/8
http://172.16.0.0/12
http://192.168.0.0/16
file:///*
chrome:///*
chrome-extension:///*
```

Reason:

A browser extension that can fetch arbitrary private network URLs can become a local network exfiltration tool.

Add a later explicit “Allow private network targets” option only for local development.

## Response Size Policy

Milestone 1 defaults:

```text
maxResponseBytes = 25 MiB
timeoutMs = 30 seconds
```

If response exceeds limit, abort and return:

```text
RESPONSE_TOO_LARGE
```

Later:

* streaming mode
* chunked response protocol
* direct write into wasmacs virtual filesystem
* progress events

## File Tree

This repository uses a root-level `extension/` directory for the implementation
requested in this checkout:

```text
extension/
  manifest.json
  src/
    content-script.js
    service-worker.js
    protocol.js
    allowlist.js
    base64.js
    audit-log.js
    errors.js
  options/
    options.html
    options.js
    options.css
  tests/
    allowlist.test.js
    protocol.test.js
    service-worker-fetch.test.js
  README.md
  PLAN.md
  package.json
```

Avoid build complexity at first. Plain JavaScript is acceptable.

If using TypeScript, compile into `dist/` and keep extension source maps local only.

## Manifest v3 Skeleton

```json
{
  "manifest_version": 3,
  "name": "wasmacs CORS Companion",
  "version": "0.1.0",
  "description": "User-granted network capability provider for wasmacs.",
  "permissions": [
    "storage"
  ],
  "host_permissions": [
    "https://elpa.gnu.org/*",
    "https://melpa.org/*",
    "https://raw.githubusercontent.com/*",
    "https://github.com/*"
  ],
  "background": {
    "service_worker": "src/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "http://localhost/*",
        "http://127.0.0.1/*",
        "https://<replace-with-wasmacs-origin>/*"
      ],
      "js": ["src/content-script.js"],
      "run_at": "document_start"
    }
  ],
  "options_page": "options/options.html"
}
```

Do not ship `<replace-with-wasmacs-origin>` as-is. The agent must replace it or document how the user edits it.

## Milestone 0 — Repository Bootstrap

Status: complete

Tasks:

1. Create the extension project directory.
2. Add `manifest.json`.
3. Add minimal `src/content-script.js`.
4. Add minimal `src/service-worker.js`.
5. Add `README.md` with unpacked install instructions.
6. Add `PLAN.md`.

Validation:

* Load the extension in Chrome Developer Mode.
* Confirm no manifest errors.
* Confirm content script loads only on configured wasmacs origin.

Exit criteria:

* Chrome accepts the extension as unpacked.
* Service worker appears in extension inspection UI.

Validation notes:

* 2026-06-27: created root `extension/` with Manifest V3 metadata, content
  script, service worker, README, directory-local PLAN, and Node test runner.
  Automated validation passed with `npm --prefix extension test`. Manual Chrome
  evidence shows the content script/service worker route active on a local
  wasmacs origin because a page-posted `WASMACS_PROXY_REQUEST` returned a
  `WASMACS_PROXY_RESPONSE`.

## Milestone 1 — Message Bridge

Status: complete

Tasks:

1. Implement `WASMACS_PROXY_PING`.
2. Implement page-to-content-script bridge.
3. Implement content-script-to-service-worker bridge.
4. Implement response routing by `requestId`.
5. Reject messages from non-window sources.
6. Reject unknown protocol versions.
7. Reject malformed payloads.

Example ping:

```json
{
  "type": "WASMACS_PROXY_PING",
  "version": 1,
  "requestId": "ping-1"
}
```

Expected response:

```json
{
  "type": "WASMACS_PROXY_PONG",
  "version": 1,
  "requestId": "ping-1",
  "ok": true
}
```

Validation:

* Open wasmacs page.
* In DevTools console, send a ping message.
* Confirm page receives pong.
* Confirm unrelated pages cannot use the bridge.

Exit criteria:

* wasmacs can detect whether the companion extension is installed and reachable.

Validation notes:

* 2026-06-27: implemented `WASMACS_PROXY_PING` / `WASMACS_PROXY_PONG`,
  page-to-content-script forwarding, content-script-to-service-worker
  forwarding, requestId preservation, version checks, and malformed payload
  rejection. Automated validation passed with `npm --prefix extension test`.
  Chrome DevTools evidence shows response routing by `requestId` working for a
  `WASMACS_PROXY_REQUEST`; ping-specific `WASMACS_PROXY_PONG` validation remains
  worth checking separately.

## Milestone 2 — Safe GET Proxy

Status: complete

Tasks:

1. Implement `WASMACS_PROXY_REQUEST`.
2. Support `GET` and `HEAD`.
3. Validate target URL against allowlist.
4. Force `credentials: "omit"` by default.
5. Filter request headers.
6. Perform fetch in service worker.
7. Return status, filtered headers, and body.
8. Encode binary body as base64.
9. Add timeout with `AbortController`.
10. Add max response size check.

Validation targets:

```text
https://elpa.gnu.org/packages/archive-contents
https://melpa.org/packages/archive-contents
https://raw.githubusercontent.com/<known-public-repo>/<branch>/<file>
```

Exit criteria:

* wasmacs can fetch ELPA archive metadata.
* wasmacs can fetch MELPA archive metadata.
* wasmacs can fetch a GitHub raw text file.
* Requests to non-allowlisted targets are rejected.

Validation notes:

* 2026-06-27: implemented GET/HEAD in the service worker with target allowlist
  checks, private-network rejection by default, credential rejection by default,
  safe request header filtering, response header filtering, timeout,
  max-response-size guard, and base64 response serialization. Automated
  validation passed with `npm --prefix extension test`. Chrome DevTools evidence
  shows the live ELPA target
  `https://elpa.gnu.org/packages/archive-contents` returning `ok: true`, status
  `200`, filtered headers, and a base64 body; MELPA, raw GitHub, and blocked URL
  manual checks remain.

## Milestone 3 — Options UI

Status: in progress

Tasks:

1. Add options page.
2. Show current allowed wasmacs origins.
3. Show current target allowlist.
4. Allow adding/removing target patterns.
5. Allow setting max response size.
6. Allow setting timeout.
7. Add disabled-by-default credentialed mode.
8. Add disabled-by-default private network mode.
9. Persist options in `chrome.storage.local`.

Validation:

* Change allowlist in options page.
* Reload wasmacs page.
* Confirm new allowlist applies.
* Confirm invalid patterns are rejected.

Exit criteria:

* User can configure extension without editing source files.
* Dangerous settings are visible and disabled by default.

Validation notes:

* 2026-06-27: added an options page backed by `chrome.storage.local` for caller
  origins, target allowlist, max response bytes, timeout, credential mode,
  private-network mode, and audit log viewing. Manual Chrome validation remains.

## Milestone 4 — Audit Log

Status: in progress

Tasks:

1. Record timestamp, caller origin, target URL, method, status, byte size, and credential mode.
2. Do not record body contents.
3. Store a bounded log in `chrome.storage.local`.
4. Expose log in options UI.
5. Add “clear log” button.
6. Add structured error counters.

Example audit entry:

```json
{
  "time": "2026-06-27T00:00:00.000Z",
  "callerOrigin": "http://localhost:5173",
  "method": "GET",
  "url": "https://elpa.gnu.org/packages/archive-contents",
  "status": 200,
  "bytes": 123456,
  "credentials": "omit",
  "result": "ok"
}
```

Exit criteria:

* User can see which network requests wasmacs caused.
* Credentialed requests are visibly marked.

Validation notes:

* 2026-06-27: service worker records bounded audit entries in
  `chrome.storage.local` without response bodies; options UI can display and
  clear the log. Structured error counters remain future work.

## Milestone 5 — wasmacs Integration Contract

Status: in progress

Tasks:

1. Add a small JS client library for wasmacs page side.
2. Expose `window.wasmacsCompanion.fetch(request)`.
3. Implement installed detection.
4. Implement timeout and request cancellation.
5. Convert base64 response body into `Uint8Array`.
6. Add adapter point for Emacs-side `url-retrieve` or package download path.

Page-side API:

```js
const response = await window.wasmacsCompanion.fetch({
  url: "https://elpa.gnu.org/packages/archive-contents",
  method: "GET",
  responseType: "arrayBuffer"
});
```

Expected result:

```js
{
  ok: true,
  status: 200,
  headers: { "content-type": "text/plain" },
  body: Uint8Array
}
```

Exit criteria:

* wasmacs can call the companion using a small stable API.
* wasmacs can store the returned bytes in its virtual filesystem.

Validation notes:

* 2026-06-27: after a `use-package rainbow-mode` smoke hit CORS on
  `https://elpa.gnu.org/packages/rainbow-mode-1.0.6.tar`, the Atomics pdump
  page-side `hostNetworkFetch` was wired to the content-script bridge. It now
  sends `WASMACS_PROXY_REQUEST`, accepts `WASMACS_PROXY_RESPONSE`, normalizes
  response headers back to the Elisp-friendly list shape, and then falls back to
  direct browser fetch / configured proxies if the companion is unavailable.
  Validation passed with `node --test tests/runtime/wasmacs-url-fetch-lisp.test.js`.

## Milestone 6 — Optional Direct Page Messaging

Status: not started

Tasks:

1. Evaluate `externally_connectable`.
2. Add direct page-to-extension messaging only if extension ID stability is solved.
3. Keep content-script bridge as the default dev path.
4. Document the tradeoff.

Do not remove the content-script bridge unless direct messaging is strictly better.

Exit criteria:

* Either direct messaging is implemented safely, or the reason for rejecting it is documented.

## Milestone 7 — Streaming / Large Downloads

Status: not started

Tasks:

1. Design chunked response protocol.
2. Add `WASMACS_PROXY_CHUNK`.
3. Add progress events.
4. Avoid keeping very large files fully in memory.
5. Add cancellation.
6. Test package tarball downloads.

Chunk message:

```json
{
  "type": "WASMACS_PROXY_CHUNK",
  "version": 1,
  "requestId": "id",
  "index": 0,
  "bodyBase64": "...",
  "done": false
}
```

Exit criteria:

* Extension can download package archives without excessive memory use.
* wasmacs can write chunks into its user filesystem.

## Milestone 8 — Security Hardening

Status: not started

Tasks:

1. Add strict schema validation for every message.
2. Add target URL canonicalization.
3. Prevent URL parser confusion.
4. Reject non-http/non-https schemes.
5. Reject private network targets unless option enabled.
6. Reject credentialed requests unless exact-origin allowlist permits it.
7. Add rate limiting per caller origin.
8. Add test cases for malicious payloads.
9. Add review checklist.

Security tests:

```text
javascript:alert(1)
file:///etc/passwd
chrome://extensions
http://127.0.0.1:8080/private
https://example.com@evil.test/
https://allowed.example.evil.test/
```

Exit criteria:

* Extension rejects unsafe or ambiguous URLs.
* Extension cannot be used as a silent arbitrary local network reader by default.

## Milestone 9 — Packaging

Status: not started

Tasks:

1. Add instructions for unpacked install.
2. Add instructions for packing into `.crx`.
3. Document that Chrome Web Store distribution is not required for the first version.
4. Document how to update host permissions.
5. Document how to inspect the service worker logs.
6. Add versioned release zip.

Manual install instructions:

```text
1. Open chrome://extensions
2. Enable Developer mode
3. Click “Load unpacked”
4. Select the extension directory
5. Open wasmacs
6. Confirm companion status is connected
```

Exit criteria:

* A user can download the source, load it as an unpacked extension, and use it with wasmacs.

## Required Tests

Use simple Node-based unit tests where possible.

Test categories:

```text
allowlist matching
URL canonicalization
message schema validation
header filtering
response serialization
error serialization
private network rejection
credential policy
audit log truncation
```

Browser manual tests:

```text
extension loads
service worker starts
wasmacs ping works
ELPA GET works
MELPA GET works
GitHub raw GET works
blocked URL fails
oversized response fails
audit log records request
options page changes allowlist
```

## Error Codes

Use stable error codes:

```text
BAD_MESSAGE
UNSUPPORTED_VERSION
CALLER_NOT_ALLOWED
TARGET_NOT_ALLOWED
METHOD_NOT_ALLOWED
HEADER_NOT_ALLOWED
PRIVATE_NETWORK_BLOCKED
CREDENTIALS_NOT_ALLOWED
FETCH_FAILED
FETCH_TIMEOUT
RESPONSE_TOO_LARGE
SERIALIZATION_FAILED
INTERNAL_ERROR
```

## Implementation Notes

### content-script.js

Responsibilities:

* Listen for `window.postMessage`.
* Accept only messages from the same window.
* Accept only `WASMACS_*` messages.
* Forward validated messages to service worker.
* Return service worker response to page.
* Never perform the actual fetch.

### service-worker.js

Responsibilities:

* Load options from storage.
* Validate caller origin.
* Validate target URL.
* Validate method and headers.
* Execute fetch.
* Enforce timeout and response size.
* Serialize response.
* Write audit entry.
* Return structured result.

### allowlist.js

Responsibilities:

* Parse allow patterns.
* Normalize URLs.
* Match scheme, host, port, and path.
* Avoid naive substring checks.
* Support explicit wildcard patterns only.

Bad:

```js
url.includes("github.com")
```

Good:

```js
const u = new URL(url);
u.protocol === "https:" && u.hostname === "raw.githubusercontent.com";
```

## wasmacs-side Integration Sketch

The wasmacs page should detect the companion:

```js
async function detectCompanion() {
  const requestId = crypto.randomUUID();
  window.postMessage({
    type: "WASMACS_PROXY_PING",
    version: 1,
    requestId
  }, window.location.origin);
}
```

Then expose a host capability:

```text
host.network.fetch(url, options) -> bytes/status/headers
```

The Emacs wasm side should not know Chrome extension APIs. It should only see a network capability result.

## Security Review Checklist

Before marking Milestone 2 complete, verify:

* The extension does not fetch arbitrary URLs by default.
* The extension does not include cookies by default.
* The extension does not expose response bodies to unrelated pages.
* The extension does not inject scripts into arbitrary pages.
* The extension does not use `<all_urls>` unless the user explicitly configures it.
* The extension does not log response bodies.
* The extension rejects local/private network targets by default.
* The extension has bounded memory use.
* The extension can be disabled or removed normally from Chrome.

## Acceptance Criteria for v0.1

v0.1 is complete when:

* User can load the unpacked extension.
* wasmacs can detect the companion.
* wasmacs can request allowed GET URLs.
* ELPA and MELPA archive metadata can be fetched.
* Non-allowlisted URLs are rejected.
* Credentials are omitted by default.
* Requests are visible in an audit log.
* Options page can change the allowlist.
* README explains the security model clearly.

## README Requirements

The README must explain:

1. This extension gives wasmacs user-approved network access.
2. It is not a global CORS disable switch.
3. It is powerful and should be installed only from trusted source.
4. How to load unpacked extension.
5. How to configure allowed wasmacs origins.
6. How to configure allowed target URLs.
7. Why credentials are disabled by default.
8. How to inspect logs.
9. How to remove the extension.

## Future Work

Possible later features:

* Streaming downloads.
* Package-install integration.
* Caching with ETag and Last-Modified.
* OPFS-backed package cache.
* Optional remote repository mirror.
* Support for Firefox extension variant.
* Signed `.crx` package.
* Stable `externally_connectable` mode.
* Fine-grained per-workspace network capability manifest.
* UI prompt per new target origin.
* Import/export of extension policy.

## Agent Rules

The implementation agent must follow these rules:

1. Prefer safe defaults.
2. Do not broaden permissions unless a milestone explicitly requires it.
3. Do not add `<all_urls>` in the default manifest.
4. Do not add credentialed fetch by default.
5. Do not read cookies.
6. Do not add response-header rewriting as the main approach.
7. Do not modify unrelated pages.
8. Keep wasmacs integration behind a narrow protocol.
9. Keep protocol versioned.
10. Update this PLAN.md whenever a milestone is completed, blocked, or changed.

## Current Next Step

Load the root `extension/` directory in Chrome and manually verify:

```text
chrome://extensions
Developer mode ON
Load unpacked
No manifest errors
Service worker visible
Content script active on wasmacs origin
README ping test returns WASMACS_PROXY_PONG
MELPA GET test returns WASMACS_PROXY_RESPONSE
raw GitHub GET test returns WASMACS_PROXY_RESPONSE
blocked URL returns TARGET_NOT_ALLOWED
```

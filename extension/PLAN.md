# PLAN.md - wasmacs Chrome Companion CORS Proxy Extension

This directory implements `../CHROME_EXTENSION_PLAN.md` in a root-level `extension/` project, as requested.

## Status Legend

```text
[ ] not started
[/] in progress
[x] complete
[!] blocked
```

## Milestone 0 - Repository Bootstrap

Status: [x] complete

Deliverables:

```text
manifest.json
src/content-script.js
src/service-worker.js
README.md
PLAN.md
```

Validation:

```sh
npm --prefix extension test
```

Manual validation:

```text
chrome://extensions
Developer mode ON
Load unpacked
No manifest errors
Service worker visible
Content script active on wasmacs origin
```

Notes:

- 2026-06-27: Chrome DevTools evidence shows the content script and service
  worker route active on a local wasmacs origin because a page-posted
  `WASMACS_PROXY_REQUEST` reached the extension and returned a
  `WASMACS_PROXY_RESPONSE`.

## Milestone 1 - Message Bridge

Status: [x] complete

Deliverables:

```text
src/protocol.js
src/content-script.js
src/service-worker.js
tests/protocol.test.js
```

Validation:

```sh
npm --prefix extension test
```

Manual validation:

- 2026-06-27: Chrome DevTools evidence shows `WASMACS_PROXY_REQUEST` response
  routing by `requestId` working for request
  `74fc1b7c-337b-4de1-9f32-ef261fd41ee3`.
- Ping-specific `WASMACS_PROXY_PONG` validation is still worth checking
  separately.

Manual validation:

```js
window.postMessage({
  type: "WASMACS_PROXY_PING",
  version: 1,
  requestId: crypto.randomUUID()
}, window.location.origin);
```

Expected response type:

```text
WASMACS_PROXY_PONG
```

## Milestone 2 - Safe GET Proxy

Status: [x] complete

Deliverables:

```text
src/allowlist.js
src/base64.js
src/errors.js
src/service-worker.js
tests/allowlist.test.js
tests/service-worker-fetch.test.js
```

Implemented:

- GET and HEAD only.
- Default target allowlist for ELPA, MELPA, raw GitHub, and GitHub.
- Credentials omitted by default.
- Request and response header filtering.
- Timeout with `AbortController`.
- Max response size guard.
- Private network target rejection by default.

Validation:

```sh
npm --prefix extension test
```

Manual validation:

- 2026-06-27: Chrome DevTools evidence shows an allowed GET for
  `https://elpa.gnu.org/packages/archive-contents` returning
  `WASMACS_PROXY_RESPONSE` with `ok: true`, status `200`, status text `OK`,
  filtered headers, and a base64 body.

## Milestone 3 - Options UI

Status: [/] in progress

Implemented:

- Options page for caller origins, target allowlist, max response bytes, timeout, credentials mode, private network mode, and audit log viewing.
- Settings persist in `chrome.storage.local`.

Remaining:

- Manual Chrome validation.
- More browser-level validation for invalid pattern UX.

## Milestone 4 - Audit Log

Status: [/] in progress

Implemented:

- Bounded audit log in `chrome.storage.local`.
- Timestamp, caller origin, method, URL, status, bytes, credentials, and result are recorded.
- Response bodies are not logged.
- Options UI can clear the log.

Remaining:

- Structured error counters.
- Manual Chrome validation.

## Current Next Step

Run the README ping test, then manually check MELPA, raw GitHub, blocked URL,
options persistence, and audit log visibility in Chrome.

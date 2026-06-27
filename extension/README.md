# wasmacs CORS Companion

This is an unpacked Manifest V3 Chrome extension that gives wasmacs a user-granted network capability for package archives and raw files that normal page `fetch()` cannot read because of CORS.

It is not a global CORS disable switch. It does not intercept all browser traffic, rewrite arbitrary response headers, read cookies, or forward credentials by default.

## Load Unpacked

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this `extension/` directory.
5. Open a local wasmacs page from `http://localhost/...` or `http://127.0.0.1/...`.
6. Inspect the extension service worker if Chrome reports any errors.

## Ping Test

On a local wasmacs page, run this in DevTools:

```js
window.addEventListener("message", (event) => {
  if (event.data?.type === "WASMACS_PROXY_PONG") console.log(event.data);
});
window.postMessage({
  type: "WASMACS_PROXY_PING",
  version: 1,
  requestId: crypto.randomUUID()
}, window.location.origin);
```

## Safe GET Test

```js
window.addEventListener("message", (event) => {
  if (event.data?.type === "WASMACS_PROXY_RESPONSE") console.log(event.data);
});
window.postMessage({
  type: "WASMACS_PROXY_REQUEST",
  version: 1,
  requestId: crypto.randomUUID(),
  request: {
    url: "https://elpa.gnu.org/packages/archive-contents",
    method: "GET",
    headers: { "Accept": "text/plain,*/*" },
    responseType: "arrayBuffer",
    credentials: "omit",
    timeoutMs: 30000
  }
}, window.location.origin);
```

The response body is returned as `bodyBase64`.

## Defaults

Allowed page origins:

- `http://localhost:*`
- `http://127.0.0.1:*`

Allowed network targets:

- `https://elpa.gnu.org/*`
- `https://melpa.org/*`
- `https://raw.githubusercontent.com/*`
- `https://github.com/*`

Credentials and private network targets are disabled by default. The extension keeps a bounded audit log in `chrome.storage.local` without storing response bodies.

## Options

Open the extension options page from `chrome://extensions` to edit:

- allowed wasmacs origins
- allowed target URL patterns
- max response size
- timeout
- credentialed request mode
- private network target mode
- audit log

Adding non-local wasmacs origins may also require editing `manifest.json` content script `matches`, because Chrome decides content script injection before this extension reads its own options.

## Remove

Open `chrome://extensions`, find `wasmacs CORS Companion`, and click Remove.

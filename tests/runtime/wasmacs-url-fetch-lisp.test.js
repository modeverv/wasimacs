import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

test("wasmacs url.el loader is an overlay, not a vendor/emacs patch", async () => {
  const source = await readFile(join(repoRoot, "src/emacs-lisp/wasmacs-url-fetch.el"), "utf8");

  assert.match(source, /\(provide 'wasmacs-url-fetch\)/);
  assert.match(source, /\(defun wasmacs-url-fetch-enable/);
  assert.match(source, /puthash "http"/);
  assert.match(source, /puthash "https"/);
  assert.match(source, /'loader 'wasmacs-url-fetch/);
  assert.doesNotMatch(source, /'loader #'wasmacs-url-fetch/);
  assert.match(source, /wasmacs-url-fetch-function/);
  assert.match(source, /wasmacs-url-fetch-proxy-url/);
  assert.match(source, /:proxyUrl wasmacs-url-fetch-proxy-url/);
  assert.match(source, /wasmacs-os-network-fetch-json/);
  assert.match(source, /body-base64/);
  assert.match(source, /bodyBase64/);
  assert.match(source, /statusText/);
  assert.match(source, /url-scheme-registry/);
  assert.doesNotMatch(source, /\(make-network-process\b/);
  assert.doesNotMatch(source, /\(open-network-stream\b/);
});

test("Emacs patch script registers the host network fetch primitive", async () => {
  const source = await readFile(join(repoRoot, "tools/scripts/patch-emacs-host-entrypoint-spike.sh"), "utf8");

  assert.match(source, /EM_JS \(const char \*, wasmacs_host_network_fetch_json/);
  assert.match(source, /DEFUN \("wasmacs-os-network-fetch-json"/);
  assert.match(source, /Swasmacs_os_network_fetch_json/);
  assert.match(source, /wasmacs_os_url_fetch_loader_state/);
  assert.match(source, /function returnJson/);
  assert.match(source, /_malloc\(size\)/);
  assert.match(source, /stringToUTF8\(json, ptr, size\)/);
  assert.match(source, /function proxyFetch/);
  assert.match(source, /function configuredProxyUrls\(request\)/);
  assert.match(source, /function isLocalHostName\(name\)/);
  assert.match(source, /request && request\.proxyUrl/);
  assert.match(source, /wasmacsNetworkProxyUrl/);
  assert.match(source, /__wasmacsNetworkProxyUrl/);
  assert.match(source, /__wasmacs_network_fetch/);
  assert.match(source, /returned invalid JSON/);
  assert.match(source, /continue;/);
  assert.doesNotMatch(source, /proxy\.setRequestHeader\("content-type"/);
  assert.match(source, /xfree \(\(void \*\) response\)/);
  assert.doesNotMatch(source, /stringToNewUTF8/);
});

test("checked-in Emacs C patch carries the host network fetch primitive", async () => {
  const source = await readFile(
    join(repoRoot, "src/c/patches/0001-wasmacs-host-entrypoint-and-terminal.patch"),
    "utf8",
  );

  assert.match(source, /EM_JS \(const char \*, wasmacs_host_network_fetch_json/);
  assert.match(source, /DEFUN \("wasmacs-os-network-fetch-json"/);
  assert.match(source, /wasmacs_os_url_fetch_loader_state/);
  assert.match(source, /function returnJson/);
  assert.match(source, /_malloc\(size\)/);
  assert.match(source, /stringToUTF8\(json, ptr, size\)/);
  assert.match(source, /function proxyFetch/);
  assert.match(source, /function configuredProxyUrls\(request\)/);
  assert.match(source, /function isLocalHostName\(name\)/);
  assert.match(source, /request && request\.proxyUrl/);
  assert.match(source, /wasmacsNetworkProxyUrl/);
  assert.match(source, /__wasmacsNetworkProxyUrl/);
  assert.match(source, /__wasmacs_network_fetch/);
  assert.match(source, /returned invalid JSON/);
  assert.match(source, /continue;/);
  assert.doesNotMatch(source, /proxy\.setRequestHeader\("content-type"/);
  assert.match(source, /xfree \(\(void \*\) response\)/);
  assert.doesNotMatch(source, /stringToNewUTF8/);
});

test("system Lisp image builder copies the wasmacs Lisp overlay", async () => {
  const source = await readFile(join(repoRoot, "src/build/build-system-lisp-image.sh"), "utf8");

  assert.match(source, /src\/emacs-lisp/);
  assert.match(source, /\$staging_root\/system\/lisp/);
  assert.match(source, /--include='\*\.el'/);
});

test("Atomics pdump browser builder preloads the wasmacs Lisp overlay", async () => {
  const source = await readFile(
    join(repoRoot, "src/build/build-emacs-browser-atomics-pdump-profile.sh"),
    "utf8",
  );

  assert.match(source, /src\/emacs-lisp/);
  assert.match(source, /\$\{pdump_src\}\/lisp/);
  assert.match(source, /--include='\*\.el'/);
  assert.match(source, /--preload-file \$\{pdump_src\}\/lisp@\/usr\/local\/share\/emacs\/30\.2\/lisp/);
});

test("Atomics pdump browser builder leaves wasm stack headroom for DevTools", async () => {
  const source = await readFile(
    join(repoRoot, "src/build/build-emacs-browser-atomics-pdump-profile.sh"),
    "utf8",
  );

  assert.match(source, /WASMACS_ATOMICS_PDUMP_STACK_SIZE:-67108864/);
  assert.match(source, /-sSTACK_SIZE=\$\{wasmacs_wasm_stack_size\}/);
});

test("Atomics pdump browser builder can strip link debug info separately", async () => {
  const source = await readFile(
    join(repoRoot, "src/build/build-emacs-browser-atomics-pdump-profile.sh"),
    "utf8",
  );

  assert.match(source, /EMACS_WASM_CFLAGS:--O3 -g0/);
  assert.match(source, /EMACS_WASM_LINKFLAGS:-\$\{emacs_wasm_cflags\}/);
  assert.match(source, /emacs_atomics_pdump_ldflags="\$\{emacs_wasm_linkflags\}/);
});

test("Atomics pdump preloads fetch-backed url.el dependencies before dump", async () => {
  const source = await readFile(
    join(repoRoot, "src/build/build-emacs-browser-atomics-pdump-profile.sh"),
    "utf8",
  );

  assert.match(source, /wasmacs pbootstrap: preload url fetch lisp/);
  assert.match(source, /\(equal dump-mode "pbootstrap"\)/);
  assert.match(source, /lisp\\\/url/);
  assert.match(source, /\(require \(quote json\)\)/);
  assert.match(source, /\(require \(quote url-methods\)\)/);
  assert.match(source, /\(require \(quote url-parse\)\)/);
  assert.match(source, /\(require \(quote url-vars\)\)/);
  assert.match(source, /\(require \(quote url\)\)/);
  assert.match(source, /\(require \(quote wasmacs-url-fetch\)\)/);
});

test("Atomics pdump browser runtime enables fetch-backed url.el by default", async () => {
  const source = await readFile(
    join(repoRoot, "src/wasm/src/emacs-atomics-pdump-worker.js"),
    "utf8",
  );

  assert.match(source, /WASMACS_DEFAULT_LISP_INIT/);
  assert.match(source, /\(require 'wasmacs-url-fetch\)/);
  assert.match(source, /\(wasmacs-url-fetch-enable\)/);
  assert.match(source, /WASMACS-URL-FETCH=%S/);
  assert.match(source, /if \(!debugOptions\.noDefaultInit\)/);
  assert.match(source, /COMMON_EVALS\.splice\(8, 0, "--eval", WASMACS_DEFAULT_LISP_INIT\)/);
  assert.match(source, /debugOptions\.extraEvals/);
});

test("Atomics pdump browser runtime forwards configured local network proxy to wasm host fetch", async () => {
  const page = await readFile(join(repoRoot, "src/wasm/xterm-atomics-pdump.html"), "utf8");
  const worker = await readFile(
    join(repoRoot, "src/wasm/src/emacs-atomics-pdump-worker.js"),
    "utf8",
  );

  assert.match(page, /pageParams\.get\("network-proxy"\)/);
  assert.match(page, /pageParams\.get\("wasmacs-network-proxy"\)/);
  assert.match(page, /wasmacs\.networkProxyUrl/);
  assert.match(page, /debugBootOptions\.networkProxyUrl/);
  assert.match(worker, /__wasmacsNetworkProxyUrl = typeof debugOptions\.networkProxyUrl/);
  assert.match(worker, /wasmacsNetworkProxyUrl: globalThis\.__wasmacsNetworkProxyUrl/);
});

test("Atomics pdump host network fetch relays through the main page", async () => {
  const page = await readFile(join(repoRoot, "src/wasm/xterm-atomics-pdump.html"), "utf8");
  const worker = await readFile(
    join(repoRoot, "src/wasm/src/emacs-atomics-pdump-worker.js"),
    "utf8",
  );

  assert.match(worker, /NETWORK_RESPONSE_SAB/);
  assert.match(worker, /installMainThreadNetworkFetchBridge/);
  assert.match(worker, /type: "host-network-fetch"/);
  assert.match(worker, /Atomics\.wait\(signal,\s*0,\s*1,\s*120000\)/);
  assert.match(page, /async function handleHostNetworkFetch/);
  assert.match(page, /async function hostNetworkFetch/);
  assert.match(page, /configuredProxyUrls\(request\)/);
  assert.match(page, /Atomics\.notify\(signal,\s*0,\s*1\)/);
});

test("Atomics pdump host network fetch can use the Chrome companion extension", async () => {
  const page = await readFile(join(repoRoot, "src/wasm/xterm-atomics-pdump.html"), "utf8");

  assert.match(page, /async function companionNetworkFetch/);
  assert.match(page, /function detectCompanionExtension/);
  assert.match(page, /WASMACS_PROXY_PING/);
  assert.match(page, /WASMACS_PROXY_PONG/);
  assert.match(page, /WASMACS_PROXY_REQUEST/);
  assert.match(page, /WASMACS_PROXY_RESPONSE/);
  assert.match(page, /window\.postMessage\(/);
  assert.match(page, /normalizeCompanionResponse/);
  assert.match(page, /companion extension failed/);
  assert.match(page, /bodyBase64: response\?\.bodyBase64/);
  assert.match(page, /Object\.entries\(headersObject\)\.map/);
});

test("Pages temacs artifact patches host network fetch to the relay", async () => {
  const builder = await readFile(join(repoRoot, "src/build/build-site.mjs"), "utf8");
  const temacs = await readFile(
    join(repoRoot, "docs/artifacts/emacs-browser-atomics-pdump/temacs.js"),
    "utf8",
  );
  const functionStart = temacs.indexOf("function wasmacs_host_network_fetch_json");
  const functionEnd = temacs.indexOf("function _wasmacs_host_network_fetch", functionStart);
  const hostFetchFunction = temacs.slice(functionStart, functionEnd);

  assert.match(builder, /patchTemacsJsForHostNetworkRelay/);
  assert.match(builder, /replaceFunction\(source, "wasmacs_host_network_fetch_json"/);
  assert.match(hostFetchFunction, /type: "host-network-fetch"/);
  assert.match(hostFetchFunction, /Atomics\.wait\(signal,\s*0,\s*1,\s*120000\)/);
  assert.match(hostFetchFunction, /TextDecoder\(\)\.decode\(new Uint8Array\(data\.subarray\(0, length\)\)\)/);
  assert.doesNotMatch(hostFetchFunction, /new XMLHttpRequest/);
});

test("Atomics pdump worker suppresses Emscripten run dependency stderr spam", async () => {
  const source = await readFile(
    join(repoRoot, "src/wasm/src/emacs-atomics-pdump-worker.js"),
    "utf8",
  );

  assert.match(source, /function createRunDependencyLogFilter/);
  assert.match(source, /still waiting on run dependencies:/);
  assert.match(source, /text\.startsWith\("dependency: "\)/);
  assert.match(source, /loading Emacs preload data\.\.\. \(\$\{pendingCount\} pending files\)/);
  assert.match(source, /if \(!shouldPostStderr\(String\(text\)\)\) return/);
});

test("Atomics pdump diagnostics are opt-in for DevTools stability", async () => {
  const page = await readFile(join(repoRoot, "src/wasm/xterm-atomics-pdump.html"), "utf8");
  const worker = await readFile(join(repoRoot, "src/wasm/src/emacs-atomics-pdump-worker.js"), "utf8");
  const hostLibrary = await readFile(join(repoRoot, "tools/scripts/wasmacs-atomics-host-library.js"), "utf8");

  assert.match(page, /pageParams\.get\("debug-log"\) === "1"/);
  assert.match(page, /debugBootOptions\.debugLog && msg\.type === "timing-wait-enter"/);
  assert.match(page, /debugBootOptions\.debugLog && \(msg\.type === "scheduler-checkpoint"/);
  assert.match(worker, /__wasmacsDiagnosticLog = debugOptions\.debugLog === true/);
  assert.match(worker, /if \(globalThis\.__wasmacsDiagnosticLog\)\s+post\("stderr", \{ text: `JS-BEFORE-CALLMAIN/);
  assert.match(hostLibrary, /__wasmacsDiagnosticLog && typeof self !== "undefined"/);
});

test("Atomics pdump worker loads split preload data parts", async () => {
  const source = await readFile(
    join(repoRoot, "src/wasm/src/emacs-atomics-pdump-worker.js"),
    "utf8",
  );

  assert.match(source, /async function fetchSplitPreloadedPackage/);
  assert.match(source, /\$\{packageUrl\.pathname\}\.parts\/manifest\.json/);
  assert.match(source, /Promise\.all\(manifest\.parts\.map/);
  assert.match(source, /getPreloadedPackage\(packageName, packageSize\)/);
  assert.match(source, /return fetchSplitPreloadedPackage\(packageName, packageSize\)/);
});

test("Pages builder splits temacs.data and patches async preload hook", async () => {
  const source = await readFile(join(repoRoot, "src/build/build-site.mjs"), "utf8");

  assert.match(source, /async function splitLargeDataFile/);
  assert.match(source, /\$\{filePath\}\.parts/);
  assert.match(source, /String\(index\)\.padStart\(3, "0"\)/);
  assert.match(source, /patchTemacsJsForAsyncPreload/);
  assert.match(source, /await fetched/);
  assert.match(source, /await processPackageData\(fetched\)/);
  assert.match(source, /await rm\(filePath, \{ force: true \}\)/);
});

test("dev server exposes the local host network fetch proxy", async () => {
  const source = await readFile(join(repoRoot, "tools/scripts/serve-app.mjs"), "utf8");

  assert.match(source, /__wasmacs_network_fetch/);
  assert.match(source, /handleNetworkFetchProxy/);
  assert.match(source, /normalizeProxyHeaders/);
  assert.match(source, /bodyBase64/);
  assert.match(source, /unsupported URL scheme/);
  assert.match(source, /docs", "artifacts"/);
  assert.match(source, /existsSync\(docsArtifact\)/);
});

test("Pages CI deploys checked-in docs without rebuilding wasm artifacts", async () => {
  const source = await readFile(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
  const policy = await readFile(join(repoRoot, "tools/scripts/validate-git-artifact-policy.sh"), "utf8");

  assert.match(source, /Test runtime contracts/);
  assert.match(source, /path: docs/);
  assert.match(source, /git ls-files -z docs\/artifacts/);
  assert.doesNotMatch(source, /mymindstorm\/setup-emsdk/);
  assert.doesNotMatch(source, /make build/);
  assert.match(policy, /temacs\.data\.parts/);
  assert.match(policy, /unsplit temacs\.data must not be tracked/);
});

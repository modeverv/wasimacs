# wasmacs Architecture

## 目的

`wasmacs` は、Emacs の編集体験をブラウザ上で動かしつつ、編集対象のファイルシステムも含めて 1 つの可搬アーティファクトとして持ち運べる環境を目指す。

直感的な構成は次の 3 つの合成である。

```text
emacs-core.wasm
  + Emacs C core
  + Elisp interpreter / bytecode runtime / built-in primitives
  + basic WASI-like environment
  + browser GUI protocol

system-lisp.wasifs
  + GNU Emacs lisp/ for a fixed Emacs release
  + .el source files
  + .elc byte-compiled files
  + generated autoload/loaddefs artifacts

user-filesystem.wasifs
  + user files
  + init.el / ELPA packages / site-lisp
  + lock/journal/snapshot metadata

browser gui
  + display / input / clipboard / drag-and-drop
  + persistence adapter
  + import/export adapter
```

目標は「ブラウザで Emacs っぽい何かを書く」ではなく、Elisp エンジンを中心に据えた Emacs を、ブラウザ UI と WASI 系 filesystem capability の組み合わせで成立させることにある。

## 検討結果

結論として、この夢は段階的に実現できる。ただし、最初から `emacs.wasm - filesystem.wasi` という二分構成に固定するより、`emacs-core.wasm`、`system-lisp.wasifs`、`user-filesystem.wasifs` の三分割にする方が Emacs らしさと可搬性を両立しやすい。

初期アーキテクチャは次を採用する。

1. Emacs core は WebAssembly module/component として隔離する。
2. `system-lisp.wasifs` は Emacs release と対応する read-only image として固定する。
3. `user-filesystem.wasifs` は init.el、packages、作業ファイルを含む writable portable image とする。
4. GUI は JavaScript/TypeScript 側に置き、Emacs core とは narrow protocol で接続する。
5. ファイルシステムは抽象化し、初期実装は browser storage backed VFS とする。
6. 可搬性は「生の OPFS を持ち運ぶ」ではなく、export/import 可能な filesystem image として実現する。
7. WASI Preview 2 / Component Model は最終形の設計軸に置くが、ブラウザ実行の初期版では互換レイヤを許す。

この方針なら、Emacs core、標準 Elisp distribution、ユーザー環境、browser GUI、filesystem image の境界を保ったまま、小さく動くものから育てられる。

## なぜ完全な WASI FS 直結では始めないか

ブラウザの WebAssembly は、ローカル OS のファイルシステムへ自由にアクセスできない。これは欠点というより、Web の安全境界そのものに近い。

ブラウザで永続化する現実的な候補は次の 3 つ。

- IndexedDB backed VFS
- Origin Private File System, OPFS
- ユーザー操作を伴う File System Access API / drag-and-drop / file picker

OPFS はブラウザ origin に閉じた private filesystem で、Wasm や大きめのローカルデータには相性がよい。一方で、origin に紐づくため、そのまま `filesystem.wasi` ファイルとして他の端末へ持ち出せるわけではない。したがって「永続ストア」と「可搬イメージ」は分ける必要がある。

## システム構成

```text
┌─────────────────────────────────────────────────────────┐
│ Browser App                                              │
│                                                         │
│  ┌─────────────────────┐    protocol    ┌───────────────┐ │
│  │ GUI Frontend         │ <────────────> │ Emacs Core    │ │
│  │                      │                │ emacs-core.wasm│ │
│  │ - frames/windows     │                │               │ │
│  │ - text rendering     │                │ - buffers     │ │
│  │ - input events       │                │ - commands    │ │
│  │ - minibuffer UI      │                │ - Elisp VM    │ │
│  │ - clipboard          │                │ - redisplay   │ │
│  └──────────┬──────────┘                └───────┬───────┘ │
│             │                                   │          │
│             │                                   │ WASI-ish │
│             │                                   │ host ABI │
│             │                                   │          │
│  ┌──────────▼───────────────────────────────────▼──────┐  │
│  │ Runtime Host                                         │  │
│  │                                                      │  │
│  │ - filesystem adapter                                 │  │
│  │ - clock / random / env                               │  │
│  │ - stdio/log                                          │  │
│  │ - process substitutes                                │  │
│  │ - image import/export                                │  │
│  └───────┬───────────────────────────────┬──────────────┘  │
│          │                               │                 │
│  ┌───────▼───────────┐           ┌───────▼──────────────┐  │
│  │ system-lisp.wasifs │           │ user-filesystem.wasifs│ │
│  │ read-only image    │           │ writable image        │ │
│  └───────┬───────────┘           └───────┬──────────────┘  │
│          │                               │                 │
│  ┌───────▼───────────────────────────────▼──────────────┐  │
│  │ OPFS / IndexedDB local persistence                    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 三分割の合成モデル

`wasmacs` の基本単位は、次の 3 つである。

```text
runtime image
  emacs-core.wasm
  host ABI definition
  browser GUI protocol definition

system Lisp image
  system-lisp.wasifs
  /system/lisp/*.el
  /system/lisp/*.elc
  /system/lisp/loaddefs.el
  /system/etc

user filesystem image
  user-filesystem.wasifs
  /home/user/init.el
  /home/user/.emacs.d/
  /home/user/projects/
  /tmp, or volatile tmp mount
```

`emacs-core.wasm` と `system-lisp.wasifs` は Emacs release と ABI の組として扱う。初期固定対象は GNU Emacs 30.2 である。

`user-filesystem.wasifs` は runtime から独立して持ち運べる writable image とする。ユーザーが編集したファイル、init.el、ELPA packages、履歴、session metadata はここに入る。

VS Code extension integration treats a `.wasifs` file as this writable user
image, not as a VS Code-native text workspace. Opening `foo.wasifs` should
create a custom editor/webview host that mounts the image at `/home/user` and
hands the runtime an initial `(dired "/home/user")` command. VS Code owns the
outer document lifecycle, Save/Save As, and asset loading policy; Emacs owns
Dired, buffers, command loop, keymaps, and filesystem semantics inside the
mounted image. VS Code webviews may expose local runtime assets as
`vscode-resource`/CDN URLs that can be fetched but cannot always be passed
directly to `new Worker(...)` from the `vscode-webview` origin. The VS Code
host surface should therefore treat webview worker startup as a separate asset
loading step and wrap fetched worker source in a `blob:` worker when needed.
The same rule applies to Emscripten-generated runtime entrypoints loaded from a
worker: the JS glue can be imported from a `blob:` URL, while `locateFile()`
maps `.wasm` and `.data` payload names to blob URLs. When a VS Code webview
worker rejects a blob URL created by the outer webview, pass source text and
binary payloads into the worker and create those blob URLs inside the worker's
own global scope. If Emscripten's wasm or preload-data fallback tries to use
`XMLHttpRequest` for those blob URLs, provide `Module.wasmBinary` and
`Module.getPreloadedPackage()` from the transferred bytes instead of relying on
runtime URL loading. Keyboard handoff follows the same ownership split: while
the `.wasifs` custom editor is active, VS Code may contribute explicit
keybindings that inject terminal bytes into the webview, but those bindings are
transport only. They must not reinterpret Emacs keymaps, minibuffer semantics,
Dired behavior, or buffer editing outside the Emacs runtime.

起動時の mount は次を基本形にする。

```text
/system    read-only  system-lisp.wasifs
/home/user writable   user-filesystem.wasifs
/tmp       volatile   memory filesystem
```

`load-path` は user image を system image より優先する。

```text
/home/user/.emacs.d/lisp
/home/user/.emacs.d/elpa/*/
/system/lisp
```

この設計では、`emacs-core.wasm` はなるべく変えない。標準 Elisp 更新は `system-lisp.wasifs` の差し替えで扱い、個人環境は `user-filesystem.wasifs` の export/import で扱う。

## コンポーネント責務

### Small Compatibility OS Layer

`wasmacs` の wasm/browser porting layer は、個別 shim の集合ではなく、
Emacs が生きるための小さな compatibility OS として扱う。これは汎用 OS を
ブラウザ内に作るという意味ではない。Emacs C core と Lisp machine が期待
する lifecycle、memory/root safety、control-flow、blocking input、
filesystem/persistence、preloaded state、host capability、browser GUI
boundary を、矛盾しない substrate contract として提供するという意味である。

Milestone 13.5 以降の substrate contract は `doc/small-os-for-emacs.md` に置く。
新しい shim、probe、workaround を追加する前に、その変更がどの service に
属し、どの cross-service invariant を守るのかを明示する。特に Asyncify
pending command、GC inhibit、`stack_bottom` / `current_thread->stack_top`
refresh、`specpdl` / backtrace args pin、pdump/preloaded state、pure space、
`.wasifs` reverse sync、browser-worker protocol、browser UI unavailable
boundary は同じ compatibility OS 上の相互依存問題として扱う。

Product behavior と diagnostic behavior は分けて記録する。forced
minibuffer probe、`specpdl` scrub、copied-source backtrace pin、cold
`loadup.el` split、pdump/purecopy instrumentation は、acceptance test が
service contract を満たすまで normal browser runtime の意味論に昇格しない。

低レイヤ substrate は C/wasm-first とする。`src/wasm/src/small-os-services.js`
と `src/wasm/src/small-os-runtime.js` は service contract の mirror、browser-side
coordinator、diagnostic/test scaffold であり、raw `Lisp_Object`、GC roots、
`specpdl`、pure space、relocation table、preloaded-state object identity の
owner ではない。lifecycle、entrypoint root refresh、GC permission、
pending-command guard、backtrace/root ownership、preloaded-state/pdump、
segment/root/relocation は、まず `wasmacs_os_*` 形の C/wasm facade として
設計し、JS には copied snapshot、status code、protocol message、または
host capability provider として必要な範囲だけを渡す。

### Repository Layout

Runtime source and generated outputs are separated:

```text
src/wasm/   browser wasm app source
src/assets/ source assets copied into generated docs output
src/build/  docs and generated artifact build scripts
src/c/      Emacs C-side patch layer
src/runtime/ host/runtime libraries used by tests and tools
tools/      build, validation, probe, prototype, and inspection tools
tools/probs/ prototype and exploratory probe code
build/      copied Emacs source/build workspaces and generated artifacts
build/artifacts/ generated wasm, pdmp, and wasifs build products
build2/     VS Code-only copied Emacs workspaces and generated runtime artifacts
doc/        architecture and planning notes
docs/       GitHub Pages output
vscode/     generated VS Code webview app bundle
logs/       ignored runtime logs
tests/      automated tests
archive/    old or superseded files
```

The browser development server maps the historical `/app/...` URL prefix to
`src/wasm/...`, so existing smoke URLs remain valid while the repo source lives
under `src/`.

The browser development server also maps the runtime URL prefix `/artifacts/...`
to local files under `build/artifacts/...`. Root `artifacts/` is not a source
directory and should not be recreated.

`host-abi.wit` is generated as `build/artifacts/host-abi.wit` by
`src/build/generate-host-abi-wit.mjs`; it is not checked-in source under
`src/`.

`dist/` is retired from the active layout. The maintained Pages bundle is
`docs/`; `make clean` removes any legacy `dist/`, empties `build/` and `docs/`,
and a fresh `make build` recreates the publishable `docs/` tree.

The VS Code extension lane is deliberately outside that Pages lane. VS Code
runtime experiments build under `build2/` and copy webview app assets under
`vscode/app/`. The extension must not point local resource roots at `docs/app`,
`docs/artifacts`, or `build/artifacts`; those remain owned by the browser
docs/Pages build. `make clean-vscode` removes only `build2/` and `vscode/`,
while `make clean` removes only the docs/browser generated lane.

For GitHub Pages, `docs/index.html` is a lightweight redirect to the canonical
Atomics/pdump xterm entrypoint at `docs/app/xterm-atomics-pdump.html`. Keeping
the root URL as a redirect avoids maintaining a second HTML shell with rewritten
relative paths, which reduces stale browser cache and service-worker mismatch
risk. `docs/coi-serviceworker.js` is copied to the Pages root so its default
scope covers `/`, `/app/`, and `/artifacts/` even on project pages such as
`/wasmacs/`. The publish step also provides
`emacs-browser-atomics-pdump/temacs.js`, a JavaScript-MIME alias of Emscripten's
extensionless `temacs` glue, because static servers reject
`importScripts()` when that file is served as an opaque binary or text file.

Runtime, validation, and probe logs may be written under `logs/`, but log files
are not source and are ignored by Git. Historical evidence logs that predate
this layout are kept under `archive/old-logs/`.

`vendor/emacs` remains read-only. C/wasm changes are represented as unified diff
patches under `src/c/patches/` and are applied to copied Emacs trees in
`build/`.

### Emacs Core

Emacs core は editor state の所有者である。

- buffer, marker, point, window state
- command loop
- keymap dispatch
- Elisp evaluation
- bytecode execution
- redisplay model
- WASI-like host ABI boundary

DOM、Canvas、IndexedDB、OPFS などの browser API を直接知ってはいけない。Emacs core が知るのは、狭い host interface だけにする。

初期実装では既存 Emacs C core の wasm build を狙うか、Elisp runtime を優先する小さな core を別実装するかを選ぶ必要がある。

第一候補は「既存 Emacs を wasm 化する」だが、GUI なし・process なし・pty なし・制限付き file/process API という制約を前提にする。第二候補は「Elisp subset engine から始める」案で、初動は軽いが本物の Emacs から遠ざかる危険がある。

このプロジェクトの夢には、第一候補の方が合っている。既存の `lisp/` をそのまま使いたいなら、単なる Elisp subset engine ではなく、Emacs C core が提供している Lisp machine 全体を wasm 化するのが本筋である。

Emacs の editor semantics は browser UI 側で偽装しない。undo、
kill-ring、region、minibuffer、buffer/window identity など、既存 Emacs
が内部状態として所有する機能は、Emacs 側の persistent state と command
loop を安定させて実現する。MVP で未対応の機能は browser 側の簡易再実装で
ごまかさず、明示的な unavailable boundary として表示する。最近の
cross-eval probe では named buffer は host eval 境界をまたいで生存するが、
`find-file` file-visiting buffer と undo-list state は GC marking 中に
落ちるため、次の本筋は host-entrypoint の stack/GC root safety と
file-visiting buffer lifetime の安定化である。

minibuffer は `read_minibuf` を browser reader へ置き換えない。最初の real
minibuffer route は、Emacs の command loop が input waitpoint で suspend
し、browser が Emacs input events を投入して同じ C stack を resume する
形にする。active minibuffer 中は reentrant host eval や二重 command start
を `unavailable:busy` として拒否し、prompt/input/history/result ownership
は Emacs 側に残す。

### Browser GUI

GUI は Emacs core の状態を描画する host であり、editor semantics の所有者ではない。

- keydown/composition/input events を Emacs protocol へ変換する
- text grid / proportional rendering / overlays を描画する
- minibuffer, echo area, mode line を表示する
- clipboard, IME, drag-and-drop, file picker を受け持つ
- worker 上の wasm core と message channel で通信する

描画方式は最終的には Canvas/WebGL text atlas を優先したい。Emacs の redisplay は細かい invalidation が多く、DOM ノード大量更新は早めに苦しくなる可能性が高い。ただし MVP では DOM textarea と overlay で始める余地はある。

Milestone 15 では High-Performance Renderer として Canvas/WebGL renderer
を独立フェーズに切る。DOM renderer は correctness baseline と
accessibility 補助として残し、Canvas/WebGL renderer は同じ
`text-grid-draw` 系 protocol を消費する実装差し替えにする。Emacs core
は引き続き DOM、Canvas、WebGL を直接知らない。

### Filesystem Adapter

Filesystem Adapter はこの構想の中核である。

責務は 3 つに分かれる。

1. 実行中の Emacs core に、WASI 風の capability based filesystem を見せる。
2. read-only system image と writable user image を同時に mount する。
3. writable filesystem を、可搬な image として export/import できるようにする。

内部表現は次を検討する。

- `filesystem.wasi.tar.zst`
- `filesystem.wasi.sqlite`
- `filesystem.wasi.squashfs-like`
- content-addressed tree + manifest

最初の実装は `tar` 互換の image がよい。単純で、デバッグしやすく、他ツールからも覗ける。将来的に差分同期、圧縮、重複排除が必要になったら content-addressed tree へ移行する。

### System Lisp Image

System Lisp Image は GNU Emacs の `lisp/` distribution を read-only image として保持する。

初期方針は B 案、つまり `.el + .elc image` である。

```text
system-lisp.wasifs
  manifest.json
  root tar payload
  /system/lisp/*.el
  /system/lisp/*.elc
  /system/lisp/loaddefs.el
  /system/etc/
```

この image は raw `.el` だけではない。Emacs の Lisp 層は build 時に生成される autoloads、loaddefs、byte-compiled files、場合によっては dumped state と関係する。初期版では dumped state には踏み込まず、`.el` と `.elc` と生成済み autoload/loaddefs を release image として同梱する。

system image は user image から書き換えない。ユーザーによる override は `/home/user/.emacs.d/` 以下に置き、`load-path` の優先順で解決する。

Milestone 4 の spike では、`.wasifs` 本体を圧縮なしの tar 互換ファイルとして扱う。manifest は sidecar JSON として置き、schema version、Emacs version、source commit、root prefix、read-only mount metadata、file counts、sha256 content hash を記録する。この形は最終形式ではなく、まず `tar tf` と通常の checksum で検証できることを優先したデバッグしやすい中間形式である。

`--with-dumping=none` の native baseline で full `make lisp` を行うと、各 byte-compile が `loadup.el` を読み直すため非常に遅い。MVP の system image builder は、まず native baseline が生成した `.elc` と loaddefs を同梱し、完全な release-grade byte-compilation は後続の performance/release pass に分ける。

## 可搬ファイル形式

最終的な配布単位は次の 3 つに分ける。

```text
wasmacs-app/
  index.html
  app.js
  emacs-core.wasm
  host-abi.wit?

system-lisp.wasifs
  manifest.json
  root.tar.zst
  release.txt

user-filesystem.wasifs
  manifest.json
  root.tar.zst
  journal.jsonl
  packages/
  metadata/
```

`emacs-core.wasm`、`system-lisp.wasifs`、`user-filesystem.wasifs` を分ける理由は、Emacs runtime、標準 Lisp distribution、ユーザー workspace の更新サイクルが違うからである。

ただし、配布や共有の体験としては 1 ファイル化も用意する。

```text
portable-emacs.wasmpack
  app/
  system-lisp.wasifs
  user-filesystem.wasifs
```

この `wasmpack` は zip 互換にしておくとよい。ブラウザ内で展開しやすく、ユーザーにも説明しやすい。

Milestone 5 の user image spike も、system image と同じく圧縮なし tar と sidecar JSON manifest で始める。初期 image は `home/user/` を root に持ち、runtime では `/home/user` に writable mount する。journal は `/home/user/.local/share/wasmacs/journal.jsonl` に空ファイルとして作成し、snapshots は `/home/user/.local/share/wasmacs/snapshots/` を予約する。実際の replay、compaction、snapshot generation は runtime host 実装時に決める。

Milestone 8 の runtime prototype は、この `.wasifs` spike format を Node 側で直接 parse/export する。`/system` は read-only mount として扱い、`/home/user` は writable in-memory mount として扱う。GUI はまだ実装しない。runtime host の責務は filesystem、clock/random/env、stdio/log、process-unavailable shim に留め、browser rendering とは別フェーズに残す。

## 起動シーケンス

```text
1. Browser app starts.
2. Worker loads emacs-core.wasm.
3. Runtime Host mounts system-lisp.wasifs at /system as read-only.
4. Runtime Host mounts empty or imported user-filesystem.wasifs at /home/user as writable.
5. Runtime Host exposes preopened directories and clock/random/env/stdio to the Emacs core.
6. Emacs core sets load-path with user paths before /system/lisp.
7. Emacs core reads init.el from /home/user.
8. GUI sends initial frame metrics and input capabilities.
9. Emacs core enters command loop.
10. User filesystem mutations are journaled.
11. Snapshot/export writes user-filesystem.wasifs.
```

重要なのは、標準 Elisp は `/system`、`init.el` と package は `/home/user` に置くこと。これにより Emacs release と個人環境の境界を保ちながら、「環境ごと持ち運ぶ」という感覚が出る。

## Protocol

Emacs core と GUI の間は、意図的に狭い protocol にする。

```text
GUI -> Core
  input.key
  input.text
  input.composition_start/update/end
  frame.resize
  clipboard.paste
  file.import_request

Core -> GUI
  frame.invalidate
  text.draw_runs
  cursor.set
  mode_line.set
  minibuffer.set
  clipboard.write
  dialog.open_file
```

Filesystem は GUI protocol とは別にする。

```text
Core -> FS Host
  path_open
  read
  write
  stat
  readdir
  rename
  unlink
  mkdir
  symlink?
  sync

FS Host -> Core
  result
  error
  capability_denied
```

GUI と filesystem を混ぜないことで、将来 Node, Wasmtime, Tauri, Electron, native shell に移植しやすくなる。

WASI-like host ABI は filesystem だけでは足りない。初期から次を最小 surface とする。

```text
host.fs
  path_open / read / write / stat / readdir / rename / unlink / mkdir / sync

host.clock
  now / monotonic_now / sleep_or_timer

host.random
  get_random_bytes

host.env
  getenv / environ / current_directory

host.stdio
  stdout / stderr / debug_log

host.process
  unavailable by default
  optional browser/remote substitute later
```

Milestone 6 ではこの境界を `doc/host-abi.md` と、ビルド時に生成される `build/artifacts/host-abi.wit` に落とす。`host-abi.wit` は checked-in source ではなく、`src/build/generate-host-abi-wit.mjs` が出力する build artifact である。WIT world は `emacs-core-host` とし、filesystem、clock、random、environment、stdio、process、gui を別 interface として import する。GUI は input event、frame metrics、redisplay/draw、clipboard に限定し、filesystem host calls とは混ぜない。

Dired の初期 route は `host.process` を開けず、`ls-lisp` を使う。
`loadup.el` のコピーソース patch で `(load "ls-lisp" nil t)`、
`ls-lisp-use-insert-directory-program nil`、`insert-directory-program nil`
を設定し、`insert-directory` が外部 `ls` ではなく Emacs の
`directory-files` / `directory-files-and-attributes` / `file-attributes`
系 primitive に落ちるようにする。このため Dired MVP の OS compatible
条件は subprocess ではなく、`readdir`、`stat/lstat`、`readlink`、
`access` 相当の filesystem capability を安定させることに置く。
pdump 復元を使う Atomics xterm route では、古い pdmp cache や復元済み
Lisp state に左右されないよう、worker 起動時にも同じ `ls-lisp`
設定を idempotent に再適用する。

Atomics/pdump route の wasm restore では、Emacs の pdumper semantics は
C/wasm 側が所有する。`vendor/emacs/src/pdumper.c` の native VM mapping
path は通常 OS の address-space reservation を前提にするため、
Emscripten build では copied source に限定して `dump_mmap_contiguous_heap`
へ落とす。JS は pdmp bytes を fetch して MEMFS に置く coordinator であり、
pdump section mapping、relocation、static root semantics の owner には
しない。

初期 build route は Emscripten-first なので、WIT をそのまま toolchain に食わせられない可能性がある。その場合でも WIT は契約であり、JS glue や Emscripten FS hooks は adapter 層でこの意味論へ寄せる。`emacs-core.wasm` が DOM、OPFS、IndexedDB、Clipboard API、Canvas、File System Access API を直接呼ぶ構造にはしない。

## 実装フェーズ

### Phase 0: Research Spike

- Emacs の wasm build 可能性を確認する
- 既存 Emscripten build と WASI build の差分を調べる
- `--without-x --without-ns --without-pgtk` 相当の最小 core を試す
- batch mode で Elisp evaluation が動くところまで確認する
- Emacs 30.2 の `.el + .elc` system image を作れるか確認する

成功条件:

- wasm 上で `(message "hello")` 相当が動く
- wasm 側から host FS adapter のファイルを read/write できる
- `/system/lisp` から基本 Elisp を load できる

### Phase 1: Browser MVP

- wasm core を Web Worker で起動する
- browser GUI は単一 buffer の表示に限定する
- key input -> command loop -> buffer mutation -> redraw を通す
- IndexedDB or OPFS backed VFS に保存する
- `/system` read-only と `/home/user` writable の mount を分ける

成功条件:

- ブラウザでファイルを開き、編集し、reload 後も残る
- `init.el` を `/home/user` から読む
- 標準 Lisp は `/system/lisp` から読む

### Phase 2: Portable Workspace

- `user-filesystem.wasifs` を export/import する
- workspace manifest を定義する
- journal + snapshot を実装する
- package/site-lisp を workspace に含める
- `system-lisp.wasifs` は read-only release artifact として生成する

成功条件:

- 別ブラウザ profile / 別端末で workspace を import して同じ状態で起動できる
- 同じ `emacs-core.wasm + system-lisp.wasifs` に別 user image を mount できる

### Phase 3: Emacs Fidelity

- minibuffer
- multiple windows
- mode line
- overlays / text properties
- IME
- clipboard
- package loading
- basic TRAMP 代替方針

成功条件:

- 日常的な text editing と Elisp customization が成立する

### Phase 4: Component Model

- WASI Preview 2 / Component Model の interface に寄せる
- filesystem, clock, random, environment, stdio の host calls を明示する
- GUI protocol も WIT 化を検討する

成功条件:

- browser host 以外でも同じ `emacs.wasm` core を起動できる

## 技術的な難所

### 0. Emacs Lisp は C primitive を前提にしている

既存 Emacs の `lisp/` をそのまま使うには、Elisp evaluator だけでは足りない。`fileio.c`、`keyboard.c`、`window.c`、`xdisp.c`、`callproc.c` などが登録する primitive が既存 Lisp 層の前提になっている。

したがって、wasmacs の core は「小さな Elisp 処理系」ではなく「Emacs C core が提供する Lisp machine」を wasm 化する方針を取る。

### 1. Emacs の process model

Emacs は subprocess, pty, shell, compiler, grep, language server との連携に強く依存する。ブラウザ単体ではこれは成立しない。

初期版では次を明確に切る。

- shell-command は未対応または remote worker へ委譲
- LSP は browser reachable な language service へ接続
- grep/find は VFS 内実装
- package install は archive download + VFS write として実装

Package install の Phase 1 は `host.process` や `make-network-process` を
開けず、`host.network.fetch` を `url.el` の HTTP(S) loader に見せる。
これにより `package.el`、`package-refresh-contents`、
`package-install`、`use-package :ensure` の download path を先に通す。
raw TCP stream、STARTTLS、server socket、process filter/sentinel 前提の
通信はこの Phase 1 の非目標である。

### 2. IME と key handling

Emacs の key event は細かく、ブラウザの IME/composition event と完全には一致しない。特に日本語入力は MVP の品質を左右する。

初期から `keydown` だけでなく composition events を protocol に含める。

### 3. Redisplay

Emacs redisplay は単純なテキスト描画ではない。overlays, text properties, variable pitch, images, fringe, mode line, cursor, region などが絡む。

MVP では「monospace text grid + attributes」に制限し、そこから広げる。

### 4. Filesystem consistency

ブラウザ永続ストレージは quota, eviction, multi-tab concurrency, async write などの問題を持つ。

そのため、filesystem adapter は常に journal を持つ。

- mutation は journal に追記
- 一定間隔で snapshot
- export 時は snapshot + journal を materialize
- crash recovery は manifest の generation で判定

### 5. Security

Elisp は強力であり、ユーザー設定や package は任意コードに近い。ブラウザ sandbox の中でも、ネットワーク、clipboard、file picker、storage をどう許可するかを設計する必要がある。

方針:

- workspace ごとに capability manifest を持つ
- network access は明示許可
- host file import/export はユーザー操作必須
- package install は source と checksum を記録

Network access is a host capability, not an Emacs raw socket in the MVP.
`wasmacs-url-fetch` presents HTTP(S) archive downloads to `url.el` through
`host.network.fetch`. Browser direct fetch is used when CORS permits it. When an
archive does not expose readable cross-origin responses, users may configure a
self-hosted fetch proxy under their own control. The project must not operate a
central proxy by default; sample proxies are allowlist-based and preserve the
same request/response contract as `host.network.fetch`. Browser entrypoints pass
an optional `network-proxy` endpoint into the worker; the wasm host bridge tries
direct fetch first, then the configured proxy, then the same-origin development
proxy only on local development origins. Static public hosts such as GitHub
Pages do not provide `__wasmacs_network_fetch`, so they must not be treated as a
same-origin development proxy. Localhost proxy samples must answer CORS
preflight because they are usually a different origin from the wasmacs page.
When a public HTTPS origin calls `127.0.0.1`, modern browsers can also require a
Private Network Access preflight, so local proxy samples answer
`Access-Control-Allow-Private-Network: true` and echo the requesting `Origin`
instead of wildcard CORS.

The Chrome companion extension lane under `extension/` is another transport
for the same explicit network capability. It is not a global CORS-disable
mechanism and must not rewrite arbitrary web responses. The wasmacs page talks
to a content-script bridge with versioned `WASMACS_PROXY_*` messages, the
extension service worker validates caller origins and target allowlists, and the
response is copied back as status, filtered headers, and base64 bytes. This
keeps Chrome extension APIs and host permissions outside `emacs-core.wasm`;
C/wasm still observes only the `host.network.fetch` request/response boundary.

On the Atomics pdump route, C/wasm still observes `host.network.fetch` as a
synchronous primitive, but the browser transport is owned by the main page. The
worker posts a `host-network-fetch` request and waits on a SharedArrayBuffer
result slot; the page performs direct `fetch` or localhost proxy `fetch` and
wakes the worker. This avoids worker-local synchronous XHR being blocked before
Chrome sends a request to `127.0.0.1`.
- workspace image は信頼境界として扱う

## 採用候補

### Build

- Emscripten: browser integration と既存 C/C++ porting の現実解
- WASI SDK: host interface をきれいに保ちやすい
- Wasmtime: browser 外の検証ランタイム
- wasm-tools: Component Model / WIT の検査

初期は Emscripten 寄りでよい。WASI 純度を最初から上げるより、browser で動く editor loop を先に確保する。

### Storage

- OPFS: 本命。Wasm と大きな workspace に向く
- IndexedDB: fallback として有効
- File System Access API: 明示的 import/export に使う

### UI

- Web Worker: Emacs core を main thread から分離する
- Canvas: text grid の描画候補、M15 の比較基準
- WebGL: glyph atlas と quad batching による高性能 renderer 候補
- DOM: MVP やアクセシビリティ補助
- xterm.js: terminal 表示を先に作る場合の暫定案。ただし最終 GUI ではない

## 非目標

初期版では次を目標にしない。

- OS の任意ディレクトリを透明に mount する
- 完全な native Emacs 互換
- subprocess / pty の完全再現
- TRAMP の完全再現
- 複数ユーザー同時編集
- package ecosystem の完全互換
- native-comp の wasm 初期対応
- normal browser runtime としての pdumper/dumped image 常用

これらは夢の否定ではなく、最初の動く核を守るための境界である。なお
pdump/preloaded-state は、通常 UI 機能としては非目標のままだが、Asyncify
browser-worker path が cold `loadup.el` で詰まる場合には Preloaded-State
Service の diagnostic / substrate probe として扱う。その場合も
generated/copied-source artifact lane に限定し、`vendor/emacs` は read-only
に保つ。

## Open Questions

- 既存 Emacs core を wasm 化する場合、どこまで `src/` の platform assumptions を削れるか
- Elisp bytecode/native-comp 周りを wasm でどう扱うか
- `.el + .elc` system image を既存 build pipeline からどの粒度で切り出すか
- `loaddefs.el` や generated autoload artifacts を system image にどう固定するか
- package install 時の TLS/network を browser host に寄せるか、core に見せるか
- `.wasifs` の正規形式を tar 系にするか sqlite/content-addressed tree にするか
- OPFS と image export の同期タイミングを user-driven にするか autosave にするか
- GUI protocol を独自 JSON/CBOR で始めるか、最初から WIT/interface 定義にするか

## 現時点の決定

- プロジェクトの核は Emacs C core が提供する Lisp machine であり、browser GUI は host である。
- `emacs-core.wasm`、`system-lisp.wasifs`、`user-filesystem.wasifs` の 3 合成を基本モデルとする。
- `system-lisp.wasifs` は B 案、つまり `.el + .elc + generated autoload/loaddefs` の read-only release image とする。
- 初期固定対象は GNU Emacs 30.2 とする。
- filesystem は runtime persistence と portable image を分ける。
- `user-filesystem.wasifs` をユーザー環境の可搬単位とし、runtime と system Lisp image から分離する。
- 初期実装は Emscripten/browser integration を許容する。
- WASI Preview 2 / Component Model は最終的な interface の整理先として追う。
- MVP は single frame, single buffer, read-only `/system`, writable `/home/user`, VFS backed editing から始める。

## 参考

- WASI.dev: https://wasi.dev/
- WASI interfaces: https://wasi.dev/interfaces
- Emscripten File System API: https://emscripten.org/docs/api_reference/Filesystem-API.html
- MDN Origin Private File System: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- web.dev OPFS overview: https://web.dev/origin-private-file-system/

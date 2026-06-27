# PLAN.md

## Purpose

This plan turns the `wasmacs` architecture into implementation milestones that an LLM agent can follow without re-deciding the project from scratch.

Always read this file before implementation work. Update it when a milestone is completed, blocked, split, or invalidated by evidence from `vendor/emacs`.

## Ground Rules

- Follow `ARCHITECTURE.md`: the project is a three-part composition of `emacs-core.wasm`, `system-lisp.wasifs`, and `user-filesystem.wasifs`.
- GNU Emacs is pinned at 30.2 under `vendor/emacs`.
- Treat `vendor/emacs` as read-only unless a task explicitly asks for an experiment patch.
- Prefer the real Emacs C core over a new Elisp subset engine.
- Use B for system Lisp: `.el + .elc + generated autoload/loaddefs`.
- Do not start with native-comp or pdumper.
- Record concrete findings with exact source paths and commands.

## Status Legend

```text
[ ] not started
[/] in progress
[x] complete
[!] blocked
```

## Milestone 0: Repo Control Plane

Goal: make the repo self-guiding before code appears.

Status:

- [x] Create `ARCHITECTURE.md`.
- [x] Add GNU Emacs source as `vendor/emacs`.
- [x] Pin `vendor/emacs` to Emacs 30.2.
- [x] Create `AGENTS.md`.
- [x] Create this `PLAN.md`.
- [x] Add `.gitignore` once generated artifact directories are chosen.
- [x] Add `LOG.md` when the first implementation or build experiment starts.

Validation:

```sh
git submodule status --recursive
git -C vendor/emacs describe --tags --exact-match HEAD
```

Expected:

```text
vendor/emacs is at emacs-30.2
```

## Milestone 1: Emacs 30.2 Source Inventory

Goal: identify the minimum Emacs C/Lisp surfaces needed for a wasm/browser MVP.

Status: [x] complete

Deliverable:

```text
doc/emacs-30.2-source-inventory.md
```

Steps:

1. Read `vendor/emacs/README` and confirm the `src` vs `lisp` split.
2. Inventory startup and dump flow:
   - `vendor/emacs/src/emacs.c`
   - `vendor/emacs/lisp/loadup.el`
   - `vendor/emacs/src/pdumper.c`
3. Inventory Elisp evaluator and loader:
   - `vendor/emacs/src/eval.c`
   - `vendor/emacs/src/lread.c`
   - `vendor/emacs/src/bytecode.c`
   - `vendor/emacs/src/fns.c`
4. Inventory file primitives:
   - `vendor/emacs/src/fileio.c`
   - `vendor/emacs/src/coding.c`
5. Inventory input and command loop:
   - `vendor/emacs/src/keyboard.c`
   - `vendor/emacs/src/callint.c`
6. Inventory frame/window/redisplay:
   - `vendor/emacs/src/frame.c`
   - `vendor/emacs/src/window.c`
   - `vendor/emacs/src/xdisp.c`
   - `vendor/emacs/src/dispnew.c`
7. Inventory process surfaces to stub or defer:
   - `vendor/emacs/src/process.c`
   - `vendor/emacs/src/callproc.c`
8. Write a table with columns:
   - area
   - source files
   - required for MVP
   - wasm/browser risk
   - proposed first treatment

Validation:

```sh
rg -n "DEFUN|defsubr|syms_of_" vendor/emacs/src/{eval,lread,bytecode,fileio,keyboard,window,xdisp,callproc,process}.c
tools/scripts/validate-source-inventory.sh
```

Exit criteria:

- The inventory names the initial MVP-required C modules.
- The inventory explicitly separates required, stubbed, and deferred surfaces.
- Any conclusion is grounded in source paths.

Validation notes:

- 2026-06-01: `doc/emacs-30.2-source-inventory.md` added with a required /
  stubbed / deferred MVP table.
- 2026-06-01: `tools/scripts/validate-source-inventory.sh` wraps the milestone
  source search and asserts the inventory names all relevant Emacs source
  files and treatment categories.
- 2026-06-01: validation passed with `tools/scripts/validate-source-inventory.sh`.

## Milestone 2: Build Strategy Spike

Goal: choose the first practical build path for `emacs-core.wasm`.

Status: [x] complete

Deliverable:

```text
doc/build-strategy.md
```

Steps:

1. Inspect Emacs configure options relevant to a terminal-less build:
   - `--without-x`
   - `--without-ns`
   - `--without-pgtk`
   - `--without-sound`
   - `--without-dbus`
   - `--without-gsettings`
   - `--without-native-compilation`
2. Compare two build routes:
   - Emscripten-first browser route.
   - WASI SDK / wasi-libc route.
3. Decide the first route by these criteria:
   - gets a wasm artifact fastest
   - can run in browser or worker
   - can expose a filesystem adapter
   - minimizes early Emacs source patches
4. Identify expected compile blockers:
   - signals
   - subprocesses
   - pty
   - sockets
   - termios
   - mmap
   - setjmp/longjmp assumptions
   - dumping/pdump
5. Create a scratch command file only after the route is chosen:
   - `tools/scripts/build-emacs-core-spike.sh`

Validation:

```sh
test -f doc/build-strategy.md
test -f tools/scripts/build-emacs-core-spike.sh
tools/scripts/validate-build-strategy.sh
```

Exit criteria:

- One route is selected as the first implementation route.
- The alternative route is documented, not forgotten.
- The build script is clearly marked as a spike and does not write into `vendor/emacs` except through an ignored build directory.

Validation notes:

- 2026-06-01: selected Emscripten-first as the first implementation route.
- 2026-06-01: documented WASI SDK / wasi-libc as the alternative route.
- 2026-06-01: `tools/scripts/build-emacs-core-spike.sh` copies the pinned Emacs
  source into `build/emacs-core-spike/src` before running Autogen/configure, so
  generated files stay out of `vendor/emacs`.
- 2026-06-01: validation passed with `tools/scripts/validate-build-strategy.sh`.

## Milestone 3: Native Baseline Before Wasm

Goal: establish a known-good Emacs 30.2 baseline before cross-compilation.

Status: [x] complete

Deliverables:

```text
build/native-emacs-30.2/
logs/native-baseline.txt
```

Steps:

1. Configure a local native build in `build/native-emacs-30.2`.
2. Disable nonessential features where possible to mirror the wasm target.
3. Build enough to run batch mode.
4. Run simple batch Elisp:
   - `(message "hello wasmacs")`
   - `(princ emacs-version)`
   - `(byte-code-function-p (symbol-function 'byte-code))` if applicable
5. Record exact configure flags, build command, and output in `logs/native-baseline.txt`.

Validation:

```sh
build/native-emacs-30.2/src/src/emacs --batch --eval '(princ emacs-version)'
tools/scripts/validate-native-baseline.sh
```

Exit criteria:

- Native batch mode works.
- The baseline command and output are logged.
- Any feature disabled for native baseline is listed.

Validation notes:

- 2026-06-01: `src/build/build-native-baseline.sh` builds from an ignored copy
  at `build/native-emacs-30.2/src`, leaving `vendor/emacs` untouched.
- 2026-06-01: the first out-of-tree attempt failed during Lisp generation with
  missing `build/lisp/lisp` paths and `debug-early--handler` errors, so the
  baseline now uses an in-tree build inside the copied source.
- 2026-06-01: native baseline configured with GUI, sound, D-Bus, GSettings,
  native compilation, pdumper, and unexec disabled; dumping strategy is `none`.
- 2026-06-01: `logs/native-baseline.txt` records the configure flags, build
  command, source commit/tag, and batch-mode output.
- 2026-06-01: validation passed with `tools/scripts/validate-native-baseline.sh`;
  batch mode printed Emacs version `30.2`.

## Milestone 4: System Lisp Image Builder

Goal: create the first `system-lisp.wasifs` release image using B: `.el + .elc + generated autoload/loaddefs`.

Status: [x] complete

Deliverables:

```text
src/build/build-system-lisp-image.sh
tools/wasifs/
build/artifacts/system-lisp-emacs-30.2.wasifs
build/artifacts/system-lisp-emacs-30.2.manifest.json
```

Steps:

1. Define the initial `.wasifs` container format for the spike.
   - Prefer tar-compatible contents first.
   - Use compression only if the toolchain is already available.
2. Decide exactly what to copy from the Emacs build/source tree:
   - `lisp/**/*.el`
   - generated `.elc`
   - generated autoload/loaddefs files
   - minimal `etc/` files required by Lisp help/doc lookup
3. Define image manifest fields:
   - schema version
   - Emacs version
   - source commit
   - created timestamp
   - root prefix `/system`
   - file count
   - content hash
4. Build the image into `build/artifacts/`.
5. Add an inspect command for the image.

Validation:

```sh
tar tf build/artifacts/system-lisp-emacs-30.2.wasifs | rg '^system/lisp/.+\\.elc?$'
test -f build/artifacts/system-lisp-emacs-30.2.manifest.json
tools/scripts/validate-system-lisp-image.sh
```

Exit criteria:

- The image contains both `.el` and `.elc`.
- The manifest records Emacs 30.2 and commit `636f166cfc86aa90d63f592fd99f3fdd9ef95ebd`.
- The image can be listed without custom runtime code.

Validation notes:

- 2026-06-01: `.wasifs` is a tar-compatible spike container rooted at
  `system/`, intended to mount read-only at `/system`.
- 2026-06-01: `src/build/build-system-lisp-image.sh` builds
  `build/artifacts/system-lisp-emacs-30.2.wasifs` and
  `build/artifacts/system-lisp-emacs-30.2.manifest.json` from the native baseline
  tree.
- 2026-06-01: manifest fields include schema version, kind, tar format, Emacs
  version, source commit/tag, created timestamp, root prefix, read-only mount
  metadata, file counts, and sha256 content hash.
- 2026-06-01: current image contains 1651 `.el` files, 142 `.elc` files, 20
  generated `*loaddefs.el` files, and selected `etc/` support files.
- 2026-06-01: validation passed with `tools/scripts/validate-system-lisp-image.sh`;
  image hash is
  `ecb842aedd96a73b71eed63305d739c4a9b6c07b43d35fa79ddb89221c673ae9`.
- 2026-06-01: a full `make lisp` attempt under `--with-dumping=none` proved
  too slow for this milestone because each byte-compile reloads `loadup.el`;
  full byte-compilation is deferred to a later release/performance pass.

## Milestone 5: User Filesystem Image Builder

Goal: create a writable user image format with a simple journal/snapshot story.

Status: [x] complete

Deliverables:

```text
src/build/create-user-filesystem-image.sh
build/artifacts/user-filesystem-empty.wasifs
build/artifacts/user-filesystem-empty.manifest.json
doc/wasifs-format.md
```

Steps:

1. Define the initial user image tree:
   - `/home/user/init.el`
   - `/home/user/.emacs.d/`
   - `/home/user/projects/`
   - `/home/user/.local/share/wasmacs/`
2. Define journal files:
   - location inside image or next to image
   - append format
   - snapshot generation
3. Create an empty image builder.
4. Create an image inspector.
5. Document import/export rules in `doc/wasifs-format.md`.

Validation:

```sh
tar tf build/artifacts/user-filesystem-empty.wasifs | rg '^home/user/'
test -f doc/wasifs-format.md
tools/scripts/validate-user-filesystem-image.sh
```

Exit criteria:

- The empty user image can be created and inspected.
- The format doc explains which parts are stable and which are spike-only.

Validation notes:

- 2026-06-01: `doc/wasifs-format.md` documents tar-compatible spike images,
  sidecar manifests, stable vs spike-only rules, empty journal semantics, and
  reserved snapshot location.
- 2026-06-01: `src/build/create-user-filesystem-image.sh` builds
  `build/artifacts/user-filesystem-empty.wasifs` and
  `build/artifacts/user-filesystem-empty.manifest.json`.
- 2026-06-01: initial image contains `/home/user/init.el`,
  `/home/user/.emacs.d/lisp`, `/home/user/.emacs.d/elpa`,
  `/home/user/projects`, an empty journal at
  `/home/user/.local/share/wasmacs/journal.jsonl`, and a reserved snapshots
  directory.
- 2026-06-01: validation passed with
  `tools/scripts/validate-user-filesystem-image.sh`; image hash is
  `d564ab223a470c4beda0c39763a4f726ce8e51cbd89796f13903d722b8e7f055`.
- 2026-06-07: added npm-runnable `.wasifs` pack/list/unpack tooling:
  `npm run wasifs`, `npm run wasifs:list`, `npm run wasifs:pack`, and
  `npm run wasifs:unpack`. The CLI is dependency-free, uses the repo tar
  parser/writer, hides `PaxHeader`, AppleDouble `._*`, and `.DS_Store`
  metadata during normal list/unpack, and preserves longer USTAR paths through
  the tar prefix field. Validation passed with
  `node --test tests/runtime/wasifs-cli.test.js tests/runtime/browser-wasifs.test.js`.

## Milestone 6: Host ABI Draft

Goal: define the boundary between `emacs-core.wasm` and the browser/runtime host before implementing browser UI.

Status: [x] complete

Deliverables:

```text
doc/host-abi.md
build/artifacts/host-abi.wit
```

Steps:

1. Draft filesystem calls:
   - open
   - read
   - write
   - stat
   - readdir
   - rename
   - unlink
   - mkdir
   - sync
2. Draft non-filesystem calls:
   - clock
   - monotonic clock
   - random
   - environment
   - stdio/log
3. Draft GUI protocol separately:
   - input event messages
   - frame metrics
   - redisplay/draw messages
   - clipboard messages
4. Mark `process` as unavailable by default.
5. Add a compatibility note for Emscripten if the first build path cannot consume WIT directly.

Validation:

```sh
test -f doc/host-abi.md
node src/build/generate-host-abi-wit.mjs
test -f build/artifacts/host-abi.wit
tools/scripts/validate-host-abi.sh
```

Exit criteria:

- Filesystem and GUI protocols are separate.
- The ABI names the exact first MVP calls.
- There is no hidden dependency on browser DOM inside `emacs-core.wasm`.

Validation notes:

- 2026-06-01: `doc/host-abi.md` defines separate `wasmacs:host/*` and
  `wasmacs:gui/*` surfaces and states that `emacs-core.wasm` must not call DOM,
  OPFS, IndexedDB, Clipboard API, Canvas, or File System Access API directly.
- 2026-06-01: `host-abi.wit` defines filesystem, clock, random,
  environment, stdio, process, and GUI interfaces in `world emacs-core-host`.
- 2026-06-01: `host.process` is explicitly unavailable by default; process-like
  behavior must cross a later deliberate service boundary.
- 2026-06-01: Emscripten compatibility is documented as an adapter layer over
  the WIT contract, not a replacement for the boundary.
- 2026-06-01: validation passed with `tools/scripts/validate-host-abi.sh`.

## Milestone 7: Wasm Batch Evaluation Spike

Goal: prove that some form of `emacs-core.wasm` can evaluate Elisp in batch mode.

Status: [x] complete

Deliverables:

```text
build/artifacts/emacs-core-spike.wasm
logs/wasm-batch-eval.txt
```

Steps:

1. Run the build spike selected in Milestone 2.
2. Keep all build output outside `vendor/emacs`.
3. Disable or stub subprocess, pty, and native GUI surfaces as narrowly as possible.
4. Run a minimal wasm invocation in Node, Wasmtime, or browser worker.
5. Evaluate:
   - `(princ "hello wasmacs")`
   - `(princ (+ 1 2 3))`
   - `(load "/system/lisp/subr.el" nil t)` if filesystem is ready
6. Record failures exactly.

Validation:

```sh
test -f build/artifacts/emacs-core-spike.wasm
test -f logs/wasm-batch-eval.txt
tools/scripts/validate-wasm-batch-eval.sh
```

Exit criteria:

- Either batch Elisp evaluation works, or the blocker is reduced to one or more exact source files/functions.
- The result is logged with commands and output.

Validation notes:

- 2026-06-01: Emscripten 5.0.7 was installed with Homebrew; `emconfigure`,
  `emmake`, and `emcc` are now available.
- 2026-06-01: upstream Emacs configure rejects
  `wasm32-unknown-emscripten`, so the spike currently uses
  `wasm32-unknown-linux-gnu` as a configure fallback to reach the next
  blockers.
- 2026-06-01: the spike requires native build helpers for `make-docfile` and
  `make-fingerprint`; target wasm/JS helpers cannot be run directly by the
  build host.
- 2026-06-01: the spike also requires temporary feature corrections for this
  configure fallback: internal termcap object, no external ncurses link, no
  Linux `sysinfo`, no pthread signal forwarding, no `malloc_trim`, wide Emacs
  integers, and `NODERAWFS` for Node smoke runs.
- 2026-06-01: `tools/scripts/build-emacs-core-spike.sh` now reproduces a
  `temacs.wasm` build; copied output is
  `build/artifacts/emacs-core-spike.wasm`.
- 2026-06-01: Node can start `temacs` and read source-tree `lisp/` via
  `NODERAWFS`, but batch loadup does not complete. Current blocker:
  `invalid-function ("")`, `Wrong type argument: listp, 11185520` while loading
  `loadup.el` / `subr.el`.
- 2026-06-01: running bare `temacs -nl --batch --eval ...` reaches primitive
  startup but fails with `Symbol's function definition is void:
  internal-timer-start-idle`, confirming standard Lisp loadup is still needed.
- 2026-06-01: narrowed the loadup failure with a custom `loadup.el`. Full
  `subr.el` loads successfully when the standard pre-`subr.el` load-path
  message is omitted, but `(message "Using load-path %s" load-path)` and
  similar long-list `%s` / `%S` messages reproduce the later
  `invalid-function ("")` failure while loading `subr.el`.
- 2026-06-01: source-level blocker candidates are now
  `vendor/emacs/src/editfns.c` (`Fmessage`, `Fformat_message`,
  `styled_format`) and `vendor/emacs/src/print.c` (`Fprin1_to_string`,
  `print_object`). Evidence is recorded in
  `logs/wasm-debug-format-loadup.txt`.
- 2026-06-01: `gc-cons-threshold` / explicit `garbage-collect` tests show the
  failure is GC-sensitive: raising `gc-cons-threshold` lets the focused
  `format` case pass, while `(garbage-collect)` after the format reproduces
  the failure. Under that condition, `subr.el` prefix 5697 passes and 5717
  fails at `combine-and-quote-strings`, a `mapconcat` / `lambda` closure form.
- 2026-06-01: added `tools/scripts/debug-wasm-format-gc.sh` to reproduce the focused
  GC-sensitive failure and the 5697/5717 `subr.el` prefix split.
- 2026-06-01: negative copied-tree experiments ruled out three narrower
  causes: `print_object`'s local `stack_top` update, stack-allocated temporary
  Lisp objects via `USE_STACK_LISP_OBJECTS`, and GC only inside
  `Fmake_interpreted_closure`.
- 2026-06-01: instrumentation of `maybe_garbage_collect` shows automatic GC
  fires during `subr.el` loading immediately before the focused
  `invalid-function ("")` failure. Raising `gc-cons-threshold` after an
  explicit GC and before loading `subr.el` lets the focused case pass.
- 2026-06-01: with `-sINITIAL_MEMORY=1024MB`, higher thresholds move the
  failure later: 16MB reaches `cl-preloaded.el` and then fails in
  `mem_insert -> allocate_vectorlike -> Fvector -> Fmake_interpreted_closure`;
  64MB reaches `files.el` and fails with eager macro-expansion
  `(invalid-function "")`.
- 2026-06-01: Emscripten stack-boundary marking and `GC_SETJMP_WORKS` /
  `__builtin_unwind_init` toggles did not fix the focused failure. Rebuilding
  the copied spike tree with `CFLAGS=-g3 -O0` did: `tools/scripts/debug-wasm-format-gc.sh`
  now passes all focused cases, including the `subr.el` 5717 prefix.
- 2026-06-01: `tools/scripts/build-emacs-core-spike.sh` now defaults the wasm spike
  profile to `EMACS_WASM_CFLAGS="-g3 -O0"` and copies `temacs.wasm` / JS glue
  into `build/artifacts/emacs-core-spike.*`.
- 2026-06-01: clean `-O0` standard loadup gets past the original `subr.el`
  blocker and reaches `files.el`, then fails with wasm
  `memory access out of bounds` in `styled_format -> Fformat -> eval_sub`.
- 2026-06-01: raising the Emscripten stack to 1MB changes the next failure from
  `styled_format` memory access to an initial wasm heap OOM around
  `international/characters.el`, confirming the `files.el` blocker was stack
  budget, not an `easy-mmode.el` source-form failure.
- 2026-06-01: the current reproducible wasm batch profile is
  `CFLAGS=-g3 -O0` plus `-sSTACK_SIZE=1048576`,
  `-sSTACK_OVERFLOW_CHECK=2`, `-sINITIAL_MEMORY=268435456`, and
  `-sALLOW_MEMORY_GROWTH=1`.
- 2026-06-01: standard `loadup.el` now completes far enough for Node wasm
  `temacs --batch --eval` to print both `hello wasmacs` and `6`; evidence is
  recorded in `logs/wasm-batch-eval.txt`.
- 2026-06-01: validation passed with `tools/scripts/validate-wasm-batch-eval.sh`.

## Milestone 8: Runtime Host Prototype

Goal: mount `system-lisp.wasifs` and `user-filesystem.wasifs` into a minimal JS/TS runtime host.

Status: [x] complete

Deliverables:

```text
src/runtime/
src/runtime/fs/
src/runtime/host/
tests/runtime/
```

Steps:

1. Create a minimal package skeleton only when implementation starts.
2. Implement `.wasifs` read-only mount for `/system`.
3. Implement writable in-memory mount for `/home/user`.
4. Add import/export from writable mount to `user-filesystem.wasifs`.
5. Implement clock/random/env/stdio host shims.
6. Keep GUI out of this milestone.

Validation:

```sh
npm test
```

or, if not using Node:

```sh
make test-runtime
```

Exit criteria:

- `/system` rejects writes.
- `/home/user` accepts writes.
- Export/import roundtrip preserves user files.
- Tests cover read, write, stat, readdir, rename, unlink, and sync.

Validation notes:

- 2026-06-01: added a dependency-free Node runtime skeleton with `package.json`
  and `npm test`.
- 2026-06-01: `src/runtime/fs/tar.js` parses and writes the tar-compatible
  `.wasifs` spike format.
- 2026-06-01: `src/runtime/fs/wasifs.js` mounts `/system` read-only from
  `system-lisp.wasifs`, mounts `/home/user` writable from
  `user-filesystem.wasifs`, and supports `stat`, `readdir`, `readFile`,
  `writeFile`, `mkdir`, `rename`, `unlink`, `sync`, and user-image export.
- 2026-06-01: `src/runtime/host/core-host.js` implements non-GUI clock, random,
  env, stdio/log, and explicit process-unavailable shims.
- 2026-06-01: tests cover read-only system writes, writable user files,
  read/write/stat/readdir/rename/unlink/sync, export/import roundtrip, and
  non-GUI host shims.
- 2026-06-01: validation passed with `npm test`; evidence in
  `logs/runtime-host.txt`.

## Milestone 9: Browser Single-Buffer MVP

Goal: run the core in a browser worker with a minimal single-buffer UI.

Status: [x] complete

Deliverables:

```text
app/
app/index.html
app/src/
tests/e2e/
build/artifacts/emacs-browser-spike/
```

Steps:

1. Start with one frame and one buffer.
2. Send keyboard input from browser to core.
3. Receive redraw or text state from core.
4. Display text with a simple renderer.
5. Persist edits to `/home/user`.
6. Reload the browser and verify the file remains.
7. Keep IME support visible in the design, but do not require full IME fidelity for the first pass.

Validation:

```sh
tools/scripts/build-emacs-browser-profile-spike.sh
tools/scripts/validate-browser-profile-spike.sh
npm run dev
npm test
```

Use the in-app Browser or Playwright to verify:

- page loads
- editor is visible
- typing changes buffer state
- reload preserves a file

Exit criteria:

- A user can edit one file in the browser.
- The edit persists through reload.
- The core/runtime boundary still matches `doc/host-abi.md`.

Validation notes:

- 2026-06-01: added `doc/browser-mvp-plan.md` to keep the browser MVP tied to
  the real Emacs wasm artifact instead of a replacement editor core.
- 2026-06-01: added `tools/scripts/validate-browser-mvp-readiness.sh`. It records
  that the Milestone 7 artifact is intentionally Node-only because it links
  `NODERAWFS`, and that Milestone 9 needs a browser packaging profile without
  `NODERAWFS` before direct worker execution.
- 2026-06-01: `npm test` now includes the browser readiness check.
- 2026-06-01: added `tools/scripts/build-emacs-browser-profile-spike.sh`, which
  creates `build/artifacts/emacs-browser-spike/{temacs,temacs.wasm,temacs.data}`
  without `NODERAWFS` by preloading Emacs `lisp/` and `etc/` into
  `/usr/local/share/emacs/30.2/`.
- 2026-06-01: added `tools/scripts/validate-browser-profile-spike.sh`; the packaged
  non-`NODERAWFS` artifact runs under Node and prints `hello browser-profile`,
  proving the next browser-shaped packaging step before direct worker wiring.
- 2026-06-01: because the browser profile relinks the shared copied build tree,
  re-run `tools/scripts/build-emacs-core-spike.sh` when the Node/NODERAWFS profile is
  needed for Milestone 7 debug helpers.
- 2026-06-01: added `app/` and `tools/scripts/serve-app.mjs`. The app starts a
  classic Web Worker, imports the non-`NODERAWFS` browser profile, and runs
  `--batch --eval '(princ "hello browser-worker")'`.
- 2026-06-01: in-app Browser smoke passed at `http://127.0.0.1:5174/`: status
  reached `emacs core exited cleanly`, and the worker output contained
  `hello browser-worker`. Evidence is in `logs/browser-worker-smoke.txt`.
- 2026-06-01: added `tools/scripts/validate-browser-worker-app.sh`; `npm test` now
  includes static checks for the worker app wiring and dev server MIME handling.
- 2026-06-01: added the first single-buffer host UI. It edits
  `/home/user/notes.txt` through a temporary browser host filesystem adapter
  backed by `localStorage`, tracks modified/saved state, and keeps the Emacs
  wasm worker proof visible beside the buffer.
- 2026-06-01: in-app Browser single-buffer smoke passed at
  `http://127.0.0.1:5175/`: typed text into the buffer, clicked Save, reloaded,
  confirmed the edited text persisted, and confirmed the worker output still
  contained `hello browser-worker`. Evidence is in
  `logs/browser-single-buffer-smoke.txt`.

## Milestone 10: Portable Browser User Filesystem

Goal: replace the single-buffer `localStorage` shim with a browser-side
portable `user-filesystem.wasifs` import/export path.

Status: [x] complete

Deliverables:

```text
app/src/browser-wasifs.js
tests/runtime/browser-wasifs.test.js
```

Steps:

1. Load `build/artifacts/user-filesystem-empty.wasifs` in the browser app.
2. Parse the tar-compatible user image without Node-only `Buffer` APIs.
3. Store edits as `/home/user/notes.txt` in the user image tree.
4. Persist the exported user image in browser storage as a portable binary
   payload, not as an ad hoc path/value object.
5. Add import/export buttons or debug hooks for downloading and restoring a
   `.wasifs` file.

Validation:

```sh
npm test
```

Use the in-app Browser or Playwright to verify:

- first load creates `/home/user/notes.txt`
- save updates the exported image
- page reload restores from the exported image
- exported image can be parsed by the repo tar/wasifs tooling

Exit criteria:

- Browser persistence uses the same tar-compatible user image semantics as the
  runtime host prototype.
- The temporary key/value `localStorage` shim is gone or explicitly limited to
  storing a serialized `.wasifs` payload.

Validation notes:

- 2026-06-01: added `app/src/browser-wasifs.js`, a browser-compatible
  tar-compatible user image parser/writer that avoids Node-only `Buffer` APIs.
- 2026-06-01: the browser single-buffer UI now loads
  `build/artifacts/user-filesystem-empty.wasifs`, writes `/home/user/notes.txt` into
  a `BrowserUserImage`, and stores a base64 serialized `.wasifs` payload in
  `localStorage` under `wasmacs:user-filesystem.wasifs:v1`.
- 2026-06-01: added Export and Import controls for `user-filesystem.wasifs`.
- 2026-06-01: added `tests/runtime/browser-wasifs.test.js`; it verifies import
  from the generated empty user image, tar-compatible export of
  `/home/user/notes.txt`, and base64 storage roundtrip.
- 2026-06-01: validation passed with `npm test`.

## Milestone 11: Emacs-Owned File/Buffer Bridge

Goal: move from a host-owned textarea buffer to file and buffer operations that
round-trip through the Emacs wasm core.

Status: [x] complete

Steps:

1. Start the browser core with a script that can read and write a known file.
2. Confirm Emacs `fileio.c` paths see the browser-mounted `/home/user` image.
3. Add a small command protocol for:
   - open `/home/user/notes.txt`
   - insert/replace text
   - save buffer
   - read buffer text for display
4. Keep process and pty unavailable.

Exit criteria:

- The text shown in the single-buffer UI is obtained from Emacs or synchronized
  through an explicit Emacs command bridge, not only a host-side textarea.
- Saving calls into the same boundary that Emacs file primitives use.

Validation notes:

- 2026-06-01: Node smoke with `build/artifacts/emacs-browser-spike/temacs` confirmed
  Emacs can create `/home/user/notes.txt` with `with-temp-file` and read it
  back with `insert-file-contents`; evidence is in
  `logs/emacs-file-bridge-node.txt`.
- 2026-06-01: browser worker smoke confirmed the same Emacs file primitive
  path in the browser-hosted wasm core; evidence is in
  `logs/emacs-file-bridge-browser.txt`.
- 2026-06-01: added `tools/scripts/validate-emacs-file-bridge-spike.sh` and included
  it in `npm test`.
- 2026-06-01: current blocker for completing this milestone is synchronization:
  the Emacs worker Emscripten filesystem and the browser `.wasifs` user image
  are both present, but not yet the same mounted filesystem.
- 2026-06-01: browser smoke materialized the browser `.wasifs` user image into
  the Emacs worker Emscripten filesystem via `Module.preRun`, then Emacs read
  `/home/user/notes.txt` with `insert-file-contents` and printed the same text
  shown in the UI. Evidence is in `logs/emacs-mounted-user-image-browser.txt`.
- 2026-06-01: remaining bridge work is reverse synchronization: exporting
  Emacs-side changes under `/home/user` back into the browser `.wasifs` user
  image after save/read operations.
- 2026-06-01: browser reverse-sync smoke passed at `http://127.0.0.1:5180/`.
  Emacs read `/home/user/notes.txt`, appended `Saved by Emacs core.`, wrote it
  back with `write-region`, emitted a temporary `WASMACS_SYNC_*` marker, and
  the main thread updated the `BrowserUserImage`, persisted the serialized
  user image, and refreshed the visible textarea to `synced from emacs`.
  Evidence is in `logs/emacs-reverse-sync-browser.txt`.
- 2026-06-01: validation passed with `npm test`.

## Milestone 12: Redisplay And Input MVP

Goal: make the browser UI behave like a minimal Emacs frame rather than a
generic textarea.

Status: [/] in progress

Steps:

1. Define a first text-grid draw message from core/adapter to browser.
2. Route keyboard input to Emacs command handling where possible.
3. Render cursor, point, basic selection/mark state, and mode line.
4. Add basic minibuffer/echo area plumbing.
5. Keep IME composition visible in the design, even if full fidelity is later.

Exit criteria:

- Typing and simple commands update a rendered Emacs buffer view.
- The browser is a GUI host; editor state remains in the Emacs side or an
  explicit transition adapter.

Validation notes:

- 2026-06-01: added `app/src/redisplay-protocol.js` with a first
  `text-grid-draw` v1 message and validator.
- 2026-06-01: added `tests/runtime/redisplay-protocol.test.js`; it verifies
  row wrapping, empty-line preservation, point location, and invalid column
  rejection.
- 2026-06-01: the browser app now renders Emacs-synchronized
  `/home/user/notes.txt` into `#frame-grid` with a mode line and cursor while
  keeping the textarea as a temporary input surface.
- 2026-06-01: browser smoke at `http://127.0.0.1:5180/` confirmed
  `emacs core exited cleanly`, `synced from emacs`, one `.frame-cursor`, and a
  `/home/user/notes.txt` mode line. Evidence is in
  `logs/browser-text-grid-smoke.txt`.
- 2026-06-01: validation passed with `npm test`.
- 2026-06-01: added `app/src/input-protocol.js` with the first explicit
  key-to-command bridge for printable insert, Enter, and Backspace; modified
  keys and IME composition are ignored for now.
- 2026-06-01: added `tests/runtime/input-protocol.test.js`; it verifies
  command conversion and `/home/user` scoping.
- 2026-06-01: the browser app now routes `#frame-grid` keydown events through
  `run-buffer-command`. Each command launches a one-shot Emacs worker, applies
  `insert` or `delete-char -1` to `/home/user/notes.txt`, writes with
  `write-region`, reverse-syncs the file, and refreshes `text-grid-draw`.
- 2026-06-01: browser smoke at `http://127.0.0.1:5181/` confirmed pressing `Z`
  inserts through the Emacs command bridge and Backspace removes it through the
  same bridge. Evidence is in `logs/browser-input-command-smoke.txt` and
  `logs/browser-input-command-smoke.png`.
- 2026-06-01: validation passed with `npm test`.
- 2026-06-01: added `app/src/command-queue.js` and
  `tests/runtime/command-queue.test.js`; adjacent pending `insert-text`
  commands for the same file are coalesced so fast printable input can be
  applied by fewer Emacs worker runs.
- 2026-06-01: `app/src/main.js` now has an explicit command queue with
  `enqueueBufferCommand`, `runNextBufferCommand`, and one in-flight command at
  a time. Backspace remains an ordering boundary.
- 2026-06-01: browser smoke at `http://127.0.0.1:5182/` confirmed key presses
  `a`, `b`, `c` round-trip through the command queue and Emacs bridge; the
  final buffer ended with `abc`. Evidence is in
  `logs/browser-command-queue-smoke.txt` and
  `logs/browser-command-queue-smoke.png`.
- 2026-06-01: validation passed with `npm test`.
- 2026-06-01: added `doc/persistent-command-loop-feasibility.md`. The current
  browser profile is `-sEXIT_RUNTIME=1` and `--batch` startup terminates via
  Emacs `kill-emacs`, so the known-good bridge remains one-shot until a new
  non-exiting host-command profile is spiked.
- 2026-06-01: added point propagation through command, sync, and draw:
  `text-grid-draw` now carries `point.index`, worker output includes
  `WASMACS_POINT`, and main renders the cursor at the returned point.
- 2026-06-01: added ArrowLeft/ArrowRight input commands. The worker applies
  Emacs `backward-char 1` and `forward-char 1` before syncing the updated point.
- 2026-06-01: browser smoke at `http://127.0.0.1:5183/` confirmed ArrowLeft
  followed by `X` inserts before the final newline, proving point is no longer
  forced to point-max. Evidence is in `logs/browser-cursor-command-smoke.txt`
  and `logs/browser-cursor-command-smoke.png`.
- 2026-06-01: validation passed with `npm test`.
- 2026-06-01: added `tools/scripts/build-emacs-browser-persistent-spike.sh`, which
  creates a separate `build/artifacts/emacs-browser-persistent-spike/` profile using
  `-sEXIT_RUNTIME=0` and exported runtime methods `callMain`, `FS`, and
  `FS_readFile`.
- 2026-06-01: added `tools/scripts/validate-browser-persistent-spike.sh`; it checks
  the persistent profile glue for non-`NODERAWFS`, `noExitRuntime = true`,
  `Module['callMain']`, and `Module['FS_readFile']`, then verifies batch eval
  still prints `hello persistent-profile`.
- 2026-06-01: persistent profile validation passed; evidence is in
  `logs/wasm-browser-persistent-batch.txt`.
- 2026-06-01: added `tools/scripts/probe-browser-persistent-callmain.mjs`; it loads
  the persistent profile with `Module.noInitialRun = true` and calls
  `Module.callMain` twice. The first batch call exits 0, while the second exits
  1 after Emacs reports `Back to top level`, proving repeated command-line
  `callMain` is not a reusable command loop. Evidence is in
  `logs/wasm-browser-persistent-callmain.txt`.
- 2026-06-01: added `doc/host-command-entrypoint-plan.md`, which scopes the
  next patch experiment to copied build sources and identifies the likely
  Emacs source surfaces: `emacs.c`, `keyboard.c`, `eval.c`, `lread.c`,
  `fileio.c`, and `editfns.c`.
- 2026-06-01: added `tools/scripts/patch-emacs-host-entrypoint-spike.sh`, which
  patches only `build/emacs-core-spike/src/src/emacs.c` and adds exported
  `wasmacs_eval_string`.
- 2026-06-01: updated the persistent browser profile to export
  `_wasmacs_eval_string` and Emscripten `ccall`.
- 2026-06-01: added `tools/scripts/probe-browser-host-entrypoint.mjs`; it boots Emacs
  once with `Module.callMain`, then invokes
  `Module.ccall("wasmacs_eval_string", ...)`. The probe printed
  `OUT:entrypoint` and returned `EVAL_STATUS:0`, proving host-initiated eval
  can run after initial boot without repeated command-line startup. Evidence is
  in `logs/wasm-browser-host-entrypoint.txt`.
- 2026-06-01: added `tools/scripts/probe-browser-host-file-command.mjs`; it creates
  `/home/user/notes.txt` in persistent Emscripten FS, boots Emacs once, invokes
  `wasmacs_eval_string` with a form that uses `insert-file-contents` and
  `write-region`, and verifies `Module.FS_readFile` returns `alpha beta`.
  Evidence is in `logs/wasm-browser-host-file-command.txt`.
- 2026-06-01: updated the copied-source host entrypoint patch to export
  `_wasmacs_last_result` alongside `_wasmacs_eval_string`. The entrypoint now
  stores the last evaluated Lisp result as a host-readable string.
- 2026-06-01: added `tools/scripts/probe-browser-host-readback.mjs`; it boots Emacs
  once, invokes `wasmacs_eval_string`, then verifies
  `Module.ccall("wasmacs_last_result", "string", [], [])` returns a structured
  path/text/point payload. Evidence is in
  `logs/wasm-browser-host-readback.txt`.
- 2026-06-01: validation passed with `npm test`.
- 2026-06-01: switched `app/src/wasm-worker.js` from the one-shot browser
  profile to `build/artifacts/emacs-browser-persistent-spike/`. The worker now boots
  Emacs once with `Module.callMain`, handles subsequent buffer commands through
  `wasmacs_eval_string`, and reads path/point/text from
  `wasmacs_last_result`.
- 2026-06-01: `app/src/main.js` now keeps one worker alive across queued
  commands instead of terminating and recreating it for every key command.
- 2026-06-01: browser smoke at `http://127.0.0.1:5173/` confirmed the
  persistent worker path: initial sync completed, ArrowLeft followed by `P`
  updated the Emacs-owned buffer to `Saved by Emacs core.P`, and the frame grid
  reflected the result. Evidence is in
  `logs/browser-persistent-worker-smoke.txt`.
- 2026-06-01: validation passed with `npm test`.

## Milestone 13: Ordinary Editing Baseline

Goal: make wasmacs useful for a small real editing session.

Status: [/] in progress

Steps:

1. Open, edit, save, reload one or more files under `/home/user/projects`.
2. Add basic command dispatch for common keys:
   - movement
   - delete/backspace
   - save
   - find-file/open
   - switch buffer
3. Add import/export UX for the user image.
4. Add visible error reporting when disabled process features are invoked.
5. Add a repeatable browser smoke script for a 5-minute editing session.

Exit criteria:

- A user can do normal note/code editing in one browser tab and recover the
  same user image after reload.
- Known missing native Emacs features are explicit, not surprising failures.

Validation notes:

- 2026-06-01: added a file path field and Open button to the browser UI. The
  app now normalizes relative paths into `/home/user/projects/...`, rejects
  paths outside `/home/user`, updates the visible buffer path, and can load or
  create project files from the browser user image.
- 2026-06-01: changed the persistent worker command form to use the command
  path instead of the fixed `/home/user/notes.txt` path, so Emacs
  `insert-file-contents` / `write-region` now operate on the active user file.
- 2026-06-01: browser smoke at `http://127.0.0.1:5173/` opened
  `/home/user/projects/demo.txt`, inserted `DEMO` through the persistent Emacs
  worker, saved, reloaded, and confirmed the editor/frame still show
  `Saved by Emacs core.DEMO`. Evidence is in
  `logs/browser-project-file-smoke.txt`.
- 2026-06-01: validation passed with `npm test`.
- 2026-06-01: added `Ctrl+S` command dispatch as `save-buffer`, keeping it
  inside the persistent Emacs command path.
- 2026-06-01: added a visible `Process` probe button for the MVP-disabled
  process surface. It reports `host.process is unavailable in the browser MVP`
  and sets both status and buffer state to `process unavailable`.
- 2026-06-01: browser smoke at `http://127.0.0.1:5173/` opened
  `/home/user/projects/commands.txt`, exercised ArrowLeft / printable input /
  Backspace / `Ctrl+S`, then verified the disabled process message. Evidence
  is in `logs/browser-command-dispatch-smoke.txt`.
- 2026-06-01: added `tools/scripts/validate-browser-editing-smoke-evidence.sh` to
  keep the browser editing smoke evidence covered by `npm test`.
- 2026-06-01: validation passed with `npm test`.
- 2026-06-01: added a user file switcher populated from the browser
  `user-filesystem.wasifs` entries. It hides tar metadata (`PaxHeader`,
  AppleDouble `._*`) and internal `.local` state, marks the active file with
  `aria-current`, and switches buffers without launching Emacs until an edit
  command is sent.
- 2026-06-01: browser smoke at `http://127.0.0.1:5173/` created and edited
  `/home/user/projects/switch-a.txt` and `/home/user/projects/switch-b.txt`,
  then switched back to `switch-a.txt` through the file list. Evidence is in
  `logs/browser-file-switch-smoke.txt`.
- 2026-06-01: added optimistic point advancement for queued editing commands.
  This fixes fast printable input while a command is in flight, where repeated
  keys could otherwise use the same stale point and appear reversed.
- 2026-06-01: browser recovery smoke at `http://127.0.0.1:5173/` triggered the
  disabled process path, confirmed `process unavailable`, then typed `REC` into
  `/home/user/projects/recovery-order.txt` after the worker was recreated.
  Evidence is in `logs/browser-worker-recovery-smoke.txt`.
- 2026-06-01: added `tools/scripts/summarize-browser-editing-session.mjs`, which
  rolls the project-file, command-dispatch, file-switch, and worker-recovery
  browser smoke logs into one editing session summary. Evidence is in
  `logs/browser-editing-session-smoke.txt`, and `npm test` now regenerates and
  validates it.
- 2026-06-01: extracted user-file-list filtering into
  `app/src/user-file-list.js` and added unit tests. The switcher now has
  explicit coverage for hiding tar metadata, AppleDouble files, internal
  `.local` runtime state, and non-user paths.
- 2026-06-01: added browser user image export coverage for multiple project
  files, ensuring `.wasifs` export/import preserves a small multi-file editing
  session.
- 2026-06-01: extracted user path normalization into `app/src/user-path.js`
  and added unit tests for relative project paths, absolute user paths, and
  rejection of paths outside `/home/user`.
- 2026-06-01: the file path input now opens the requested file on Enter.
  Browser smoke confirmed `enter-open.txt` opens as
  `/home/user/projects/enter-open.txt`; evidence is in
  `logs/browser-enter-open-smoke.txt`.
- 2026-06-01: added a narrow dirty-text guard for the temporary textarea
  surface. Before Open or file-list switching loads another file,
  `app/src/main.js` now persists modified textarea contents into the browser
  user image so direct DOM edits are not dropped while the frame-grid command
  path continues to move through Emacs.
- 2026-06-01: browser smoke at `http://127.0.0.1:5173/` typed
  `TEXTAREA-DRAFT` directly into `/home/user/projects/autosave-a.txt`,
  switched to `/home/user/projects/autosave-b.txt`, then reopened
  `autosave-a.txt` and confirmed the draft was preserved. Evidence is in
  `logs/browser-textarea-autosave-smoke.txt`.
- 2026-06-01: `tools/scripts/summarize-browser-editing-session.mjs` and
  `tools/scripts/validate-browser-editing-smoke-evidence.sh` now include the
  textarea autosave case, and validation passed with `npm test`.
- 2026-06-01: added explicit `C-g` and `C-/` command boundaries.
  `C-g` clears pending browser commands and reports `keyboard quit`; `C-/`
  reports `undo unavailable` with the concrete blocker that the MVP command
  bridge reconstructs a temporary Emacs buffer for each command, so real Emacs
  undo history requires persistent Emacs buffers rather than a browser-side
  fake.
- 2026-06-01: browser smoke at `http://127.0.0.1:5173/` opened
  `/home/user/projects/undo-quit.txt`, inserted `U`, verified `C-/` reports
  `undo requires persistent Emacs buffers`, then verified `C-g` reports
  `keyboard quit` without losing the buffer text. Evidence is in
  `logs/browser-undo-quit-smoke.txt`.
- 2026-06-01: added `doc/clipboard-kill-ring-boundary.md` with source
  grounding in `vendor/emacs/lisp/simple.el` and `vendor/emacs/lisp/select.el`.
  `C-y`, `C-w`, and `M-w` are now explicit command boundaries, but the worker
  reports `clipboard unavailable` instead of faking kill-ring behavior in the
  browser while persistent region/kill-ring state and GUI clipboard protocol
  are missing.
- 2026-06-01: browser smoke at `http://127.0.0.1:5173/` opened
  `/home/user/projects/clipboard-boundary.txt`, inserted `CLIP`, then verified
  `C-y` reports
  `clipboard/kill-ring requires GUI clipboard protocol plus persistent region
  and kill-ring state` without losing the buffer text. Evidence is in
  `logs/browser-clipboard-boundary-smoke.txt`.
- 2026-06-01: added `doc/minibuffer-command-boundary.md` with source
  grounding in `vendor/emacs/lisp/files.el`, `vendor/emacs/lisp/simple.el`,
  and `vendor/emacs/src/minibuf.c`. `C-x C-f` and `C-x b` are now explicit
  command boundaries for `find-file` and `switch-buffer`.
- 2026-06-01: the worker reports `minibuffer unavailable` for minibuffer
  commands until a persistent Emacs command loop, minibuffer window state, and
  completion UI exist. Deterministic probe evidence is in
  `logs/minibuffer-command-boundary.txt`; it is wired into `npm test`.
- 2026-06-01: added `doc/persistent-emacs-buffer-requirement.md`, tying
  undo, kill-ring, region, and minibuffer fidelity to a stable Emacs buffer /
  selected-window command path instead of the current per-command
  `with-temp-buffer` bridge.
- 2026-06-01: added `tools/scripts/probe-browser-persistent-buffer-undo.mjs`. It
  attempts the smallest `find-file` plus undo path inside the persistent wasm
  runtime and records the current blocker: `memory access out of bounds` during
  GC/undo traversal. Evidence is in
  `logs/wasm-browser-persistent-buffer-undo.txt`, and the probe is wired into
  `npm test` as a known blocker rather than a silent assumption.
- 2026-06-01: added `tools/scripts/probe-browser-persistent-buffer-matrix.mjs`. The
  matrix shows `find-file` and persistent writes pass, undo recording without
  invoking `undo` passes, and executing `undo` crashes with
  `memory access out of bounds` even when `gc-cons-threshold` is raised to
  `most-positive-fixnum`. Evidence is in
  `logs/wasm-browser-persistent-buffer-matrix.txt`, and the matrix is wired
  into `npm test`.
- 2026-06-01: expanded the persistent-buffer matrix. Direct `primitive-undo`
  passes, and `(undo-start)` followed by `(undo-more 1)` passes. High-level
  `undo` still crashes even with `inhibit-message` bound, so the blocker is now
  narrowed to the latter half of `vendor/emacs/lisp/simple.el`'s `undo`
  command: redo bookkeeping, `undo-equiv-table`, `pending-undo-list`, point
  record cleanup, modified-state/autosave handling, or host-entrypoint GC
  safety after those structures are updated.
- 2026-06-02: added `tools/scripts/probe-browser-worker-point-undo-redo.mjs` and
  wired it into `npm test`. It proves a worker-shaped ordinary editing flow
  that inserts `AB`, moves point left, inserts `X` in the middle, then performs
  real Emacs `undo-only` and `undo-redo` over that middle insertion in the live
  file-visiting buffer. Evidence is in
  `logs/wasm-browser-worker-point-undo-redo.txt`.
- 2026-06-02: added `tools/scripts/probe-browser-worker-file-switch-undo.mjs` and
  wired it into `npm test`. It switches between two live file-visiting buffers,
  edits both, then proves each buffer keeps its own real Emacs undo/redo state
  after switching. Evidence is in
  `logs/wasm-browser-worker-file-switch-undo.txt`.
- 2026-06-02: hardened `tools/scripts/probe-browser-find-file-phases.mjs` so child
  cases call `process.exit(0)` after emitting successful evidence. Without
  that explicit exit, successful Emscripten runtime children could stay alive
  because `keepRuntimeAlive()` was set, making the full test path appear hung.
- 2026-06-02: added a narrow browser `#minibuffer` echo line plus
  `app/src/minibuffer-view.js`. It displays `C-x` prefixes and explicit
  unavailable messages for minibuffer/clipboard/process boundaries without
  pretending to implement real minibuffer input, completion, or history.
- 2026-06-02: added `tools/scripts/run-browser-smoke.mjs` and `npm run
  browser:smoke`. It launches system Chrome headless with CDP, opens the local
  app, sends the `C-x C-f` sequence through `window.__wasmacsSmoke`, and
  verifies the minibuffer echo line reports the explicit unavailable boundary.
- 2026-06-02: expanded the runner with `npm run browser:smoke:editing`, which
  runs the minibuffer echo check plus the existing real undo, repeated undo,
  and redo browser smoke hooks through the same headless Chrome/CDP path.
- 2026-06-02: expanded `tools/scripts/run-browser-smoke.mjs` with `files` and
  `boundaries` scenarios and added `npm run browser:smoke:all`. The all smoke
  now covers minibuffer echo, real undo/repeated undo/redo, project open/reload,
  file switching, textarea autosave before file switch, process-unavailable
  recovery, clipboard-unavailable, and keyboard quit through the repo-local
  headless Chrome/CDP runner.
- 2026-06-02: `npm run browser:smoke:all` now writes
  `logs/browser-runner-smoke.txt`, and
  `tools/scripts/validate-browser-editing-smoke-evidence.sh` requires that runner
  evidence alongside the older browser smoke logs.
- 2026-06-02: `tools/scripts/summarize-browser-editing-session.mjs` now includes
  the repo-local browser runner all-smoke evidence in
  `logs/browser-editing-session-smoke.txt`.
- 2026-06-02: `tools/scripts/run-browser-smoke.mjs` now starts
  `tools/scripts/serve-app.mjs` automatically when the target app server is not
  already running, so `npm run browser:smoke*` no longer depends on a manually
  prestarted dev server.
- 2026-06-02: added `doc/minibuffer-command-loop-plan.md` and
  `tools/scripts/validate-minibuffer-command-loop-plan.sh`. The plan grounds real
  minibuffer support in `files.el`, `window.el`, `simple.el`, `minibuffer.el`,
  `minibuf.c`, `keyboard.c`, and `window.c`, and defines the first
  `host.gui.minibuffer-state` / `host.gui.minibuffer-input` protocol boundary.
- 2026-06-02: added `tools/scripts/probe-browser-minibuffer-state.mjs` and wired it
  into `npm test`. It reads inactive Emacs minibuffer state through
  `wasmacs_eval_string` without entering `read_minibuf`; evidence is in
  `logs/wasm-browser-minibuffer-state.txt`.
- 2026-06-02: added `doc/minibuffer-suspended-read-plan.md` and
  `tools/scripts/validate-minibuffer-suspended-read-plan.sh`. The plan rejects
  browser-side minibuffer readers and fixes the next implementation boundary
  as a suspended Emacs command-loop waitpoint with `unavailable:busy`
  protection for reentrant host eval.
- 2026-06-02: added copied-source `wasmacs_minibuffer_state` export,
  `_wasmacs_minibuffer_state` to the persistent browser profile, and
  `tools/scripts/probe-browser-minibuffer-state-export.mjs`. Evidence in
  `logs/wasm-browser-minibuffer-state-export.txt` proves inactive minibuffer
  state can be read from C without `wasmacs_eval_string`.
- 2026-06-02: shortened the `find-file-*` matrix known-blocker family in
  `tools/scripts/probe-browser-persistent-buffer-matrix.mjs` to a configurable
  timeout, defaulting to 10s, and records timeout as `KNOWN_BLOCKER`. This
  keeps the full `npm test` loop usable while preserving the blocker signal;
  set `WASMACS_MATRIX_KNOWN_BLOCKER_TIMEOUT_MS` for longer investigation.
- 2026-06-02: full `npm test` passed after the minibuffer state export and
  matrix timeout changes.
- 2026-06-02: added copied-source `wasmacs_command_state` and
  `wasmacs_command_begin_minibuffer_probe`. The new
  `tools/scripts/probe-browser-minibuffer-active-read-boundary.mjs` records
  `unavailable:noninteractive-batch`, proving the current `--batch` profile
  cannot enter active `read_minibuf` and must move to an interactive/suspended
  command entrypoint.
- 2026-06-02: added `doc/minibuffer-asyncify-entrypoint-plan.md`,
  `tools/scripts/build-emacs-browser-asyncify-spike.sh`, and
  `tools/scripts/validate-minibuffer-asyncify-entrypoint-plan.sh`. The separate
  `build/artifacts/emacs-browser-asyncify-spike` lane builds with `-sASYNCIFY=1`
  without replacing the persistent baseline. Evidence shows the untrimmed
  Asyncify profile needs `node --stack-size=65500` for batch loadup, then
  boots and preserves the current active-read boundary:
  `unavailable:noninteractive-batch`.
- 2026-06-02: added configurable 10s known-blocker timeout handling to
  `tools/scripts/probe-browser-persistent-buffer-cross-eval.mjs` for the
  file-visiting cross-eval cases, matching the matrix probe's routine
  regression behavior while keeping the blocker visible in logs.
- 2026-06-02: added the first gated Asyncify host wait import:
  `tools/scripts/wasmacs-asyncify-host-library.js` provides
  `wasmacs_host_wait_for_input`, the asyncify build links it with
  `-sASYNCIFY_IMPORTS=wasmacs_host_wait_for_input`, and
  `tools/scripts/patch-emacs-host-entrypoint-spike.sh` inserts the copied-source
  `keyboard.c` waitpoint only when
  `WASMACS_ENABLE_ASYNCIFY_WAITPOINT=1`. The persistent non-Asyncify profile
  remains free of the wait import. Targeted validation passed with
  `tools/scripts/build-emacs-browser-asyncify-spike.sh` and
  `tools/scripts/validate-minibuffer-asyncify-entrypoint-plan.sh`; the current
  active-read boundary is still `unavailable:noninteractive-batch`.
- 2026-06-02: full `npm test` passed after the gated Asyncify wait-import
  change. The long-running known-blocker probes still record the existing
  high-level undo, live visited-file, and host-eval GC/root blockers without
  regressing the worker-shaped ordinary editing flows.
- 2026-06-02: added browser-safe asyncify environment defaults in
  `tools/scripts/wasmacs-asyncify-host-library.js`: `TERM=dumb`, inline `TERMCAP`,
  and `/home/user` identity. Added
  `tools/scripts/probe-browser-asyncify-interactive-start.mjs` and wired it into
  `npm test`. The probe starts the asyncify artifact without `--batch` and
  expects it to remain alive until timeout without the earlier `TERM` or
  termcap initialization errors. Evidence is in
  `logs/wasm-browser-asyncify-interactive-start.txt`. This moves the
  asyncify lane past the noninteractive startup class of failure, but active
  minibuffer support still requires a command begin/input/cancel entrypoint.
- 2026-06-02: full `npm test` passed after wiring
  `tools/scripts/probe-browser-asyncify-interactive-start.mjs` into the suite.
- 2026-06-02: added
  `tools/scripts/probe-browser-asyncify-minibuffer-waitpoint.mjs`. It uses the
  asyncify artifact's forced C-side minibuffer probe to call a real
  `read-from-minibuffer` path. The probe proves
  `wasmacs_host_wait_for_input` is reached, then records the current
  `KNOWN_BLOCKER`: Asyncify rewind reports heap-cookie corruption even with a
  1MB Asyncify stack. This narrows the next work from "can we enter
  read_minibuf?" to "can the read_minibuf stack/specpdl path survive
  suspension/resume safely?"
- 2026-06-02: full `npm test` passed after wiring the asyncify minibuffer
  waitpoint probe into the suite as a recorded known blocker.
- 2026-06-02: added `tools/scripts/summarize-asyncify-advise.mjs` plus
  `npm run asyncify:advise:summary`. The diagnostic
  `-sASYNCIFY_ADVISE=1` profile now has a focused summary in
  `logs/wasm-browser-asyncify-advise-summary.txt`, and it confirms that the
  named wait import, forced minibuffer probe, `Fread_from_minibuffer`,
  `read_minibuf`, `recursive_edit_1`, `command_loop`,
  `read_key_sequence_vs`, `read_char`,
  `read_decoded_event_from_main_queue`, `kbd_buffer_get_event`, and
  `tty_read_avail_input` are visible in Asyncify's propagated
  state-change set. That makes the remaining blocker a rewind/suspension
  safety issue around the real minibuffer stack, not missing instrumentation
  of the reader path.
- 2026-06-02: generated
  `logs/wasm-browser-asyncify-advise-summary.txt`, reran
  `tools/scripts/validate-minibuffer-asyncify-entrypoint-plan.sh`,
  `node tools/scripts/probe-browser-asyncify-minibuffer-waitpoint.mjs`, and full
  `npm test`; all passed. The full suite still records the Asyncify
  minibuffer suspend failure as a known blocker after the waitpoint is
  reached.
- 2026-06-02: added `WASMACS_ASYNCIFY_WAITPOINT_MODE` to compare waitpoint
  placement. `read-char` keeps the current `keyboard.c` waitpoint;
  `minibuf-setup` inserts a split waitpoint in `minibuf.c` after prompt,
  window, keymap, and setup-hook ownership are active but before
  `recursive_edit_1` consumes input.
- 2026-06-02: rebuilt the asyncify artifact with
  `WASMACS_ASYNCIFY_WAITPOINT_MODE=minibuf-setup` and added
  `tools/scripts/probe-browser-asyncify-minibuffer-suspend-state.mjs`. Evidence in
  `logs/wasm-browser-asyncify-minibuffer-suspend-state.txt` proves the
  browser/worker side can observe a real suspended minibuffer command:
  `COMMAND_STATE:pending`, `active:true`, `depth:1`, `prompt:Find file:`,
  and `current-minibuffer:true`.
- 2026-06-02: extended the suspend-state probe to cover ownership guards while
  the command is pending. Reentrant `wasmacs_eval_string` and a second forced
  command begin now both return status `3` with `unavailable:busy`.
- 2026-06-02: targeted asyncify validation and full `npm test` passed after
  adding the pending-command busy assertions; existing known-blocker
  classifications remain unchanged.
- 2026-06-02: the completion-oriented waitpoint probe still records
  heap-cookie corruption if the caller awaits the full `read-from-minibuffer`
  command. The next slice should keep the command as an owned suspended
  operation, reject reentrant calls while pending, inject input events, and
  resume, instead of requiring the host call to synchronously complete.
- 2026-06-02: targeted asyncify validation and full `npm test` passed with the
  new `minibuf-setup` suspend-state probe included. A duplicate `npm test`
  process was detected during the full run and stopped to avoid log
  overwrites; the main run then completed successfully.
- 2026-06-02: added `emacs.md` and `p.md` from a source-grounded pass over
  `alloc.c`, `thread.c`, `eval.c`, `keyboard.c`, `minibuf.c`, `lread.c`,
  `fileio.c`, `buffer.c`, `simple.el`, and `minibuffer.el`. The documents
  record that real undo/minibuffer/file visiting depend on Emacs-owned buffers,
  `specpdl`, handler unwinding, conservative stack marking, live-buffer undo
  GC treatment, and a narrow Asyncify input wait rather than browser-side
  semantic substitutes.
- 2026-06-02: expanded `emacs.md` and `p.md` after reading deeper source
  surfaces: `alloc.c` `mark_c_stack` / `flush_stack_call_func1`,
  `eval.c` `mark_specpdl`, `lisp.h` `record_in_backtrace`,
  `insdel.c` text modification and undo recording, `files.el`
  `find-file-noselect-1` / `set-visited-file-name` / `basic-save-buffer`, and
  `callint.c` interactive argument parsing. The updated design makes stack
  refresh the general JS-to-Emacs entrypoint rule, keeps GC inhibition as a
  narrow pending-Asyncify-command guard, and requires GC-after-completion plus
  file-visiting undo-list GC probes before promoting the asyncify lane.

## Milestone 13.5: Owned Asyncify Command Protocol And GC Root Safety

Goal: turn the current Asyncify/minibuffer spike evidence into the smallest
product-shaped command protocol that keeps Emacs as the owner of command,
minibuffer, file-visiting, undo, unwind, and GC semantics.

Status: [/] in progress

This milestone is the required bridge between the ordinary editing baseline
and Milestone 14's Emacs fidelity expansion. It deliberately discards
browser-side semantic substitutes and promotes only the parts of the current
spike that match the source-grounded design in `emacs.md` and `p.md`.

Compatibility OS framing:

- Use `doc/small-os-for-emacs.md` as the substrate contract for this milestone.
  The work is no longer only "add the next Emacs-needed shim"; each new shim
  must belong to a service, preserve the cross-service invariants, and have an
  acceptance test against real Emacs behavior.
- When a probe fails, first classify the failure by service:
  lifecycle, memory/root, control-flow, blocking input scheduler, filesystem,
  preloaded state, host capability, or browser GUI boundary.
- Do not patch around a failure until the violated cross-service check and the
  relevant Emacs source surface are named.
- Product behavior and diagnostic behavior must be recorded separately. A
  probe may justify the next source-reading step without becoming part of the
  normal browser runtime.
- Build new substrate pieces top-down: list the OS/runtime capability Emacs
  needs, define the service interface, then add the lowest-quality
  implementation that preserves correctness. Dummy, diagnostic, or slow
  implementations are acceptable only when their owning service, lifecycle,
  acceptance test, and replacement path are explicit.
- Keep low-level substrate work C/wasm-first. The JS small OS modules are
  browser coordinators, policy mirrors, and test scaffolds; they must not become
  the owner of memory/root/lifecycle/preloaded-state semantics. New work on
  GC roots, pure space, relocation, preloaded-state loading, or entrypoint
  ownership should first define the C/wasm facade, then expose copied state to
  JS only when the browser needs to observe it.
- For the first Level 1 C/wasm memory/root facade, prefer stability over memory
  efficiency: a roughly 512MB fixed wasm linear memory profile with memory
  growth disabled and an oversized stack is acceptable as a diagnostic starting
  point. Treat this as a temporary substrate-stability profile, not the product
  browser memory budget.

Active blocker classification under `doc/small-os-for-emacs.md`:

| Blocker / evidence | Owning service | Cross-service invariant | Emacs source surface | Current treatment | Acceptance test |
| --- | --- | --- | --- | --- | --- |
| Browser-worker pdmp-free `--nw` startup exits before `read_char` / `wasmacs_host_wait_for_input` | Terminal/Tty Service plus Lifecycle Service | Emacs must see a valid text terminal before terminal startup can enter `command_loop` | `vendor/emacs/src/emacs.c`, `vendor/emacs/src/dispnew.c`, `vendor/emacs/src/term.c`, `vendor/emacs/src/keyboard.c`, `vendor/emacs/src/sysdep.c` | Active product blocker; implement minimal fake tty before returning to pdmp or GUI redisplay work | `emacs --quick --no-splash --nw` reaches `command_loop`, emits terminal bytes, and suspends at the real input waitpoint |
| Browser-worker Asyncify previously hit `RangeError: Maximum call stack size exceeded` during cold/pdump startup | Lifecycle Service plus Preloaded-State Service | Startup state must not be confused with terminal availability or command-loop ownership | `vendor/emacs/lisp/loadup.el`, `vendor/emacs/src/emacs.c`, `vendor/emacs/src/pdumper.c`, `vendor/emacs/src/Makefile.in` | Historical diagnostic; pdmp is demoted from the active product route | Keep evidence, but do not resume pdmp unless fake tty fails with source-backed evidence or the user explicitly asks |
| Pdump/purecopy probes produced a wasm/Node `bootstrap-emacs.pdmp` and purecopy fixes | Preloaded-State Service plus Memory And Root Service | Preloaded-state generation must preserve pure space, object layout, static roots, relocation, and GC roots | `vendor/emacs/src/pdumper.c`, `vendor/emacs/src/alloc.c`, `vendor/emacs/src/puresize.h`, `vendor/emacs/lisp/loadup.el`, `vendor/emacs/lisp/bindings.el` | Diagnostic evidence only; not the next normal browser runtime path | If resumed, generated `.pdmp` or pdumper-class artifact loads before `initialized` and survives explicit GC |
| Asyncify post-completion GC originally crashed in `mark_specpdl`; copied backtrace pin now passes probes | Memory And Root Service plus Control-Flow Service | Backtrace args, `specpdl`, stack-top hints, and GC permission must remain valid across Asyncify suspension/resume | `vendor/emacs/src/eval.c`, `vendor/emacs/src/lisp.h`, `vendor/emacs/src/thread.c`, `vendor/emacs/src/alloc.c` | Diagnostic/product-candidate split: pin shape is evidence, but no freeing policy means not final product behavior | Text and cancel completion return to idle, unwind GC inhibit, preserve backtrace info, and pass explicit GC from a fresh entrypoint |
| MEMFS / `.wasifs` reverse sync can conflict with live visited buffers if run mid-command | Filesystem And Persistence Service plus Lifecycle Service | Reverse sync runs only after command completion or explicit save; browser storage is not editor semantics | `vendor/emacs/src/fileio.c`, `vendor/emacs/src/buffer.c`, `vendor/emacs/lisp/files.el`, `vendor/emacs/src/insdel.c` | Product behavior only at Emacs-owned boundaries; poison direct-write cases remain diagnostic | Real `find-file` / `save-buffer` / undo / redo across one and two visited buffers survive explicit GC and reverse sync |
| Browser UI unavailable boundary and pending-command scaffold exist, but real input should now travel through tty first | Blocking Input Scheduler plus Terminal/Tty Service plus Browser GUI Boundary | Pending command is single-owner, UI renders terminal/protocol state only, and JS does not own Emacs minibuffer semantics | `vendor/emacs/src/keyboard.c`, `vendor/emacs/src/term.c`, `vendor/emacs/src/minibuf.c`, `vendor/emacs/src/callint.c`, `vendor/emacs/lisp/minibuffer.el` | Product scaffold with active tty backend blocker | Worker reaches terminal input wait, JS injects bytes, xterm.js renders output, and Emacs owns minibuffer/command semantics |

Already proven and kept:

- The persistent non-Asyncify browser profile remains the correctness baseline
  for ordinary file open/edit/save/reload, point movement, real `undo-only`,
  real `undo-redo`, file switching, explicit unavailable boundaries, and
  `.wasifs` user-image persistence.
- The Asyncify artifact remains a separate lane. It must not replace the
  persistent baseline until this milestone's GC and command-protocol exit
  criteria pass.
- `wasmacs_host_wait_for_input` is the right class of host import: narrow,
  named, promise-backed, and listed explicitly in `ASYNCIFY_IMPORTS`.
- `ASYNCIFY_ADVISE` confirms the real Emacs reader/command-loop path is in
  the propagated Asyncify set; the remaining problem is command lifetime and
  root safety, not missing instrumentation of `read_minibuf`.
- `WASMACS_ASYNCIFY_WAITPOINT_MODE=minibuf-setup` is useful as a diagnostic
  waitpoint because it exposes active minibuffer state after prompt/window/
  keymap/setup ownership is established.
- Reentrant `wasmacs_eval_string` and second command begin calls are already
  rejected as `unavailable:busy` while a suspended command is pending.
- `_wasmacs_input_text` can complete the forced minibuffer read when GC is
  inhibited for the suspended exported command lifetime.
- `_wasmacs_input_cancel` must inject cancel through `Vunread_command_events`;
  direct host-side `kbd_buffer_store_event` for `C-g` triggers interrupt
  handling outside the suspended read and leaves the command pending.

Retire or demote:

- Do not build a browser-side minibuffer reader, prompt resolver, completion
  engine, kill-ring, region model, undo model, or file-visiting substitute.
- Do not use direct `write-region` against a live visited file as the worker's
  normal save path. Live file buffers must be saved through real `save-buffer`.
- Do not treat the forced `read-from-minibuffer` probe as the product API. Keep
  it only as a diagnostic until the worker/browser command protocol exists.
- Do not allow command/eval host calls while an Asyncify command is pending.
  Pending commands may only accept state reads and input/cancel injection.
- Do not promote the untrimmed/full Asyncify artifact shape as production. The
  production candidate must stay narrow around the selected input wait import
  and its reachable command path.
- Retire older static browser smoke logs once `npm run browser:smoke:all`
  covers the same behavior, or mark them as historical fixtures instead of
  active gates.

Source-backed diagnosis after reading Emacs 30.2:

- `vendor/emacs/src/lisp.h` defines `SPECPDL_BACKTRACE` as a `specpdl`
  entry that stores `function`, raw `Lisp_Object *args`, and `nargs`.
  `record_in_backtrace` writes `current_thread->stack_top =
  specpdl_ptr->bt.args = args`, so Emacs deliberately treats the backtrace
  argument vector as both a GC root surface and a stack-top hint.
- `vendor/emacs/src/eval.c` records ordinary eval calls with stack-backed
  argument storage. At the start of `eval_sub`, `original_args` is a local
  `Lisp_Object` and `record_in_backtrace (original_fun, &original_args,
  UNEVALLED)` stores the address of that local. For evaluated subr calls,
  `set_backtrace_args` later points the backtrace at stack/allocation-backed
  temporary vectors such as `argvals` or `SAFE_ALLOCA_LISP` storage. Native
  Emacs relies on these pointers being valid for the dynamic extent of the
  corresponding call frame.
- `vendor/emacs/src/eval.c` also makes the crash surface precise:
  `mark_specpdl` handles `SPECPDL_BACKTRACE` by marking the backtrace function
  and then calling `mark_objects (backtrace_args (pdl), nargs)` after treating
  `UNEVALLED` as one argument. If Asyncify resume leaves a backtrace record
  whose `args` pointer still targets overwritten wasm stack slots, GC will read
  corrupted Lisp words exactly on this path.
- The current `text-scrub` and `cancel-scrub` diagnostic cases prove this is
  the active failure mode: ordinary text/cancel completion returns to `idle`
  with GC inhibition restored but still crashes in `mark_specpdl`; clearing
  non-empty `SPECPDL_BACKTRACE` `args` slots lets explicit post-completion GC
  pass. This scrub is not product behavior, because it erases backtrace
  argument information. It is only a proof that the durable fix must preserve,
  copy, rebase, or retire stale backtrace argument roots at an Emacs-owned
  boundary.
- The first source-shaped spike is to copy non-empty baseline backtrace `args`
  vectors to durable `xmalloc` storage once at the exported Asyncify command
  boundary. This preserves the argument words instead of erasing them, and it
  matches the source diagnosis that native Emacs expects those `args` pointers
  to remain valid for the dynamic extent represented by the backtrace record.
  The current implementation is still a copied-source spike because it leaks
  those pinned arrays and has not yet defined the eventual ownership/freeing
  policy, but it is the right class of fix to validate before exposing real
  minibuffer commands.
- 2026-06-03 source-backed memo after the real browser-worker Asyncify stack
  blocker: the blocker is not primarily the `pending-command` protocol. It is
  that the browser worker is trying to run an Asyncify-instrumented bare
  `temacs` through cold `loadup.el`, and Emacs source shows that path is a
  dump/bootstrap construction path, not the normal editor runtime shape.
  `vendor/emacs/lisp/loadup.el` says it is "loaded into a bare Emacs to make a
  dumpable one"; it eagerly loads core Lisp such as `subr`, `files`,
  `minibuffer`, `startup`, `font-lock`, `isearch`, and more, installs an
  `after-load-functions` GC hook, and in bootstrap-ish cases raises
  `max-lisp-eval-depth` to at least 3400 because the interpreted bootstrap
  compiler/load path uses much more stack than usual. `vendor/emacs/src/eval.c`
  confirms why browser worker stack is the limiting resource:
  `eval_sub` recursively evaluates forms, records stack-backed backtrace args,
  calls `maybe_gc`, and `funcall_lambda` / `Ffuncall` continue the same C call
  chain. `vendor/emacs/src/Makefile.in` and `vendor/emacs/lisp/loadup.el`
  show the intended native flow: run `temacs -batch -l loadup --temacs=pdump`
  or related bootstrap modes to produce `emacs.pdmp` / `bootstrap-emacs.pdmp`,
  then run normal Emacs by loading that dumped state rather than replaying the
  whole loadup graph. `vendor/emacs/src/emacs.c` has `--dump-file` and
  `load_pdump`, and `vendor/emacs/src/pdumper.c`'s `pdumper_load` asserts it
  loads before `initialized`, maps dumped sections, relocates them, and marks
  the runtime as `dumped_with_pdumper_`. Therefore the wasm/browser runtime
  should not treat cold `loadup.el` under full Asyncify as the product boot
  path. Wasm must provide a preloaded Emacs Lisp-machine state before exposing
  real `pending-input`: either a wasm-compatible pdump/load path, an explicit
  post-loadup snapshot artifact, or another release-pinned preloaded-state
  mechanism. The earlier "do not start with pdumper" rule still holds for the
  initial MVP and ordinary persistent worker baseline, but this new evidence
  changes the Asyncify lane: solving browser-worker `Maximum call stack size
  exceeded` by only tweaking Chrome flags or Asyncify stack size is the wrong
  center of gravity. The correct next spike is to avoid cold loadup in the
  browser Asyncify worker and prove a preloaded-state boot boundary, while
  keeping `vendor/emacs` read-only and keeping pdump/snapshot work in generated
  artifacts until an explicit compatibility experiment is chosen.
- 2026-06-03 pdumper-specific source memo: reading
  `vendor/emacs/src/pdumper.c` sharpens what "preloaded state" must mean.
  `pdumper_load` runs only before `initialized`, rejects loading over an
  already-initialized Lisp universe, maps the dumped hot/discardable/cold
  sections, applies dump relocations and Emacs relocations, runs dump hooks,
  and only then marks the runtime initialized. `dump_mmap_contiguous_heap`
  shows pdump loading is not automatically impossible in wasm just because
  POSIX-style VM `mmap` is missing: there is a heap-backed contiguous mapping
  fallback. However, `dump_do_all_emacs_relocations` also shows this is not a
  plain Lisp heap serialization problem. A wasm-compatible preloaded-state
  path must preserve object layout, static roots, relocation records,
  fingerprint compatibility, and the early-before-initialized load point.
  Therefore the next confident spike is Node-first pdump/preloaded-state
  feasibility, not an ad hoc JSON/object snapshot and not more cold-loadup
  Asyncify tuning:
  1. inspect whether the Emscripten copied-source configure can enable
     `--with-pdumper` / `--with-dumping=pdumper` without patching
     `vendor/emacs`;
  2. if it can, build a generated pdumper experiment artifact, produce a
     `.pdmp` under Node or native-assisted build conditions, and prove loading
     that dump before browser work;
  3. if configure/build blocks pdumper under Emscripten, record the exact
     blocker and design any custom post-loadup snapshot only with
     pdumper-class relocation/static-root semantics.
- 2026-06-03 pdump/preloaded-state probe result: `src/build/probe-emacs-pdump-configure.sh`
  proves the copied-source Emscripten configure can enable
  `--with-dumping=pdumper` and `--with-pdumper=yes`; the generated
  `src/Makefile` has `DUMPING=pdumper` and `src/config.h` has
  `#define HAVE_PDUMPER 1`. `tools/scripts/probe-emacs-pdump-temacs-build.sh`
  then builds a pdumper-enabled wasm `temacs`, including `pdumper.o`. The
  first wasm-specific blocker is upstream `make-fingerprint`: Emacs runs it
  against `temacs.tmp`, but under Emscripten that file is the CommonJS launcher
  while the default fingerprint bytes live in `temacs.wasm`. The probe records
  `missing fingerprint`, then applies a generated-artifact workaround by
  running native `make-fingerprint` on `src/temacs.wasm` and moving
  `temacs.tmp` to `temacs`. With that workaround, pdumper `temacs` exists and
  can enter `loadup.el` under Node when `EMACSLOADPATH` points at the copied
  source `lisp/` tree. The next blocker is no longer configure, pdumper C
  compilation, or fingerprint location. It is cold `loadup.el` execution:
  `logs/emacs-pdump-node-dump.txt` reaches `Loading bindings (source)` and
  exits 139 after the 1 MiB wasm stack overflows; rebuilding the same pdumper
  artifact with `-sSTACK_SIZE=134217728 -sSTACK_OVERFLOW_CHECK=0` still reaches
  `Loading bindings (source)` and exits 139
  (`logs/emacs-pdump-node-dump-stackcheck0.txt`). This means the pdump path is
  plausible but still blocked by loadup-time wasm runtime/root/memory behavior,
  not just by browser worker stack size. The next narrow investigation should
  instrument the loadup crash around `bindings.el` / early GC and unsupported
  syscalls (`__syscall_prlimit64`) in the pdumper Node artifact before trying
  browser pdump loading.
- 2026-06-03 pdump `bindings.el` split: `tools/scripts/probe-emacs-pdump-loadup-gc-split.sh`
  removes the `loadup.el` after-load `(garbage-collect)` hook in the generated
  source copy and still exits 139 at `Loading bindings (source)`, so the
  blocker is not simply the post-load GC hook after `bindings.el`.
  `tools/scripts/probe-emacs-pdump-bindings-progress.sh` instruments completed
  top-level forms and proves the crash occurs after `bindings.el` line 50 and
  before the next top-level form completes. Source reading shows line 57 starts
  `mode-line-input-method-map`, and line 72 starts the similar
  `mode-line-coding-system-map`; both create mode-line sparse keymaps and call
  `purecopy`. `tools/scripts/probe-emacs-pdump-bindings-defvar-variants.sh` shows
  replacing only the first defvar with nil/string/map variants still exits
  139, because the second original purecopy form remains. Replacing both
  mode-line keymap defvars with nil, or keeping both keymaps and `define-key`
  calls but removing `purecopy`, gets past `bindings.el`, loads `window`, and
  reaches `files.el`. The next failure is then `(require pcase) while preparing
  to dump`, which is a separate source-vs-compiled Lisp artifact issue. This
  narrows the wasm pdump runtime blocker to purecopying these early mode-line
  keymap structures, not `define-key`, not `make-sparse-keymap`, and not the
  after-load GC hook. The next source-backed work should inspect
  `alloc.c` `purecopy` / `pure_cons` / vector-or-closure copying under pdumper
  dumping, and decide whether the wasm build has a pure-space/object-layout
  issue before trying to produce a full `.pdmp`.
- 2026-06-03 pdump `purecopy` source/marker split: reading
  `vendor/emacs/src/alloc.c` makes the wasm-side requirement sharper.
  `Fpurecopy` is not a cosmetic optimizer during dumping: while
  `Vpurify_flag` is non-nil it recursively copies conses, strings, floats,
  purecopy-enabled hash tables, vectors, records, and closures into pure
  storage via `pure_alloc`, while bare symbols and mutable/non-purecopy hash
  tables are pinned for GC instead of copied. `vendor/emacs/src/puresize.h`
  defines this pure storage as a fixed `PURESIZE` region, and `PURE_P` is used
  as the early "already pure" guard. The wasm pdump artifact therefore must
  make Emacs' pure-space object layout, recursive vector/closure copy, and
  pinned-object marking behave correctly before it can produce a real dumped
  state. `tools/scripts/probe-emacs-pdump-purecopy-trace.sh` confirms the generated
  wasm artifact has a pure region (`purebeg=0x80207c0`,
  `pure_size=4533333`) and can perform early pure allocations/copies before
  still exiting 139 in `bindings.el`. `tools/scripts/probe-emacs-pdump-bindings-purecopy-markers.sh`
  then proves both of the early mode-line keymap `purecopy` calls crash
  individually: `both-marked`, `input-only`, and `coding-only` all print the
  "before" marker and exit 139 without printing any matching "after" marker.
  This makes the active blocker more precise than "bindings.el crashes":
  recursive purecopy of these keymap/closure structures is failing inside the
  wasm pdumper runtime. The next narrow step is a later/focused C trace around
  `purecopy`'s cons/vector/closure branches at the marker point, then deciding
  whether the fix belongs in wasm object representation/alignment/pure-space
  placement or in the pdump build artifact setup.
- 2026-06-03 pdump focused `purecopy` trace: `tools/scripts/probe-emacs-pdump-purecopy-enabled-trace.sh`
  instruments `Fpurecopy` so tracing is enabled only for the recursive
  `purecopy` call and starts late enough to avoid early load noise. In an
  `input-only` variant of `bindings.el`, the log reaches
  `wasmacs enabled trace: before input-only purecopy`, then repeatedly copies
  the same closure-shaped object (`kind=closure`, `ptr=0x8d50ea8` in the
  captured run) and associated vector/cons sequence until the process exits
  139. This shifts the source-backed problem statement again: Emacs' dump-time
  `loadup.el` deliberately sets `purify-flag` to an `equal` hash table, and
  `alloc.c` consults that table before recursively copying, then stores the
  copied object after recursion. The wasm pdump artifact must therefore make
  recursive `purecopy`, closure/vector layout, and the hash-consing/cycle
  boundary behave like native Emacs. The next investigation should compare
  native vs wasm behavior for this keymap closure graph and inspect the Emacs
  `equal`/hash-table path used by `Fgethash`/`Fputhash`, rather than adding
  broader loadup patches.
- 2026-06-03 pdump hash-consing trace: the focused trace now logs
  `Fgethash`/`Fputhash` activity inside `purecopy`. It proves the
  `purify-flag` table is not globally broken: nearby cons structures produce
  `gethash ... hit=1` and completed recursive copies emit `puthash`. However,
  the repeatedly re-entered closure object in the failing keymap path keeps
  logging `gethash ... hit=0` before the process exits 139. Combined with the
  source reading, this means the active hypothesis is not "hash tables do not
  work" but "the closure/keymap graph re-enters the same closure before
  `purecopy` has completed and installed the pure copy into the hash-consing
  table." The next source-backed probe should compare native/pdump behavior for
  this exact `bindings.el` map and decide whether wasm needs a compatibility
  workaround for provisional cycle handling during dump-time purecopy or
  whether the wasm build has created an unexpected closure self-cycle.

Implementation phases, now organized by small-OS service:

1. Contract gate and lifecycle classification.
   - Record which existing scripts are active gates, known-blocker probes,
     diagnostics, and historical evidence.
   - Keep the persistent non-Asyncify `npm test` and
     `npm run browser:smoke:all` path green before changing the Asyncify lane.
   - Add a short validation script that verifies the Milestone 13.5 plan still
     names the required source-backed hazards: stack refresh, pending-command
     GC inhibit, Asyncify import narrowing, reentrant-call rejection,
     file-visiting undo GC, and browser event-loop ownership.
   - Validate that `doc/small-os-for-emacs.md` names all required services and
     cross-service checks before adding new shims or probes.

2. Memory And Root Service: make JS-to-Emacs host entrypoints refresh stack
   root boundaries consistently.
   - Replace ad hoc one-call stack-boundary fixes with a copied-source helper
     that refreshes the Emacs stack scan range at every exported host entry
     from JS into C.
   - Prefer an Emacs-shaped no-allocation wrapper modeled on
     `flush_stack_call_func1`: refresh `current_thread->stack_top`, run the
     host callback, and avoid allocating before the callback has established a
     fresh stack top.
   - Use Emscripten stack APIs or an equivalent copied-source wrapper to make
     the wasm stack bounds explicit rather than relying on a stale native-like
     C stack assumption.
   - Add an exported diagnostic state read for stack/root safety:
     command state, minibuffer depth, command-loop level if available,
     `specpdl` depth or comparable counter, GC inhibit depth, and whether a
     pending Asyncify command exists.

3. Memory And Root Service x Control-Flow Service: narrow GC inhibition to the
   pending Asyncify command window.
   - Keep `inhibit_garbage_collection` while an exported Asyncify command is
     suspended, because source evidence shows GC may otherwise mark stale
     suspended stack/specpdl roots during resume.
   - Ensure every completion path unwinds the GC inhibit record through normal
     Emacs `unbind_to` behavior: text completion, cancel, Lisp error, quit,
     and host-side failure.
   - After command completion, return to a fresh host entrypoint before
     permitting explicit `(garbage-collect)`.
   - Treat "GC may run after resume completion" as a testable invariant, not
     as an assumption.

4. Blocking Input Scheduler x Control-Flow Service: promote the command state
   machine from forced probe state to worker-owned protocol state.
   - Replace the single forced-probe mental model with explicit states:
     `idle`, `starting`, `pending-input`, `resuming`, `completed`,
     `cancelled`, and `failed`.
   - While state is not `idle`, allow only:
     `command-state`, minibuffer/state reads, text/key input injection, and
     cancel injection.
   - While state is not `idle`, reject command begin and `wasmacs_eval_string`
     with a structured `unavailable:busy` response instead of trapping.
   - Store exactly one pending command handle on the worker side. The browser
     UI should observe the pending command through worker messages, not by
     owning Emacs semantics itself.
   - Clear the pending command only after the Emacs command has unwound,
     command state is idle, GC inhibit has unwound, and the final result or
     cancellation has been delivered.

5. Memory And Root Service acceptance: add GC-after-completion probes.
   - Add a text-completion probe: start the Asyncify command, observe active
     minibuffer state, inject text, resolve the host wait, wait for command
     completion, then call a fresh exported entrypoint that runs
     `(garbage-collect)`.
   - Add a cancel-completion probe with the same final explicit GC step.
   - Assert after each completion path:
     command state is `idle`, minibuffer depth is back to inactive/zero,
     no pending host wait resolver remains, GC inhibit depth is restored, and
     a second ordinary state read succeeds after GC.
   - Record this evidence separately from the older forced completion probes so
     the plan can distinguish "GC during suspended command is inhibited" from
     "GC after completed command is allowed".

6. Filesystem And Persistence Service acceptance: add live file-visiting buffer
   and undo-list GC probes.
   - Use a real `find-file` buffer under `/home/user/projects`, not a temp
     buffer or browser-side rematerialized text.
   - Insert text through the Emacs command path, add the required
     `undo-boundary`, save with real `save-buffer`, run `undo-only`, run
     `undo-redo`, and then run explicit `(garbage-collect)` from a fresh
     host entrypoint.
   - Assert the buffer remains live after GC:
     `buffer-file-name` is stable, point is stable enough for the operation,
     content matches expected text, `buffer-undo-list` is still usable, and a
     follow-up edit/undo pair succeeds.
   - Add a file-switch variant that keeps two visited buffers alive, edits
     both, switches between them, runs explicit GC, and proves each buffer's
     undo/redo state remains independent.
   - Keep direct `write-region` poison cases as diagnostics only; the product
     path is `save-buffer`.

7. Terminal/Tty Service: get the real `--nw` command loop to a waitpoint.
   - Add the smallest browser fake tty surface required by Emacs startup:
     `isatty`, raw-mode attr calls, window size, stdin read, stdout/stderr
     write, and deterministic `TERM` / `TERMCAP`.
   - Classify each missing tty behavior against `emacs.c`, `dispnew.c`,
     `term.c`, `keyboard.c`, and `sysdep.c` before patching.
   - Treat xterm.js as the first renderer after terminal bytes are observable;
     do not start custom `xdisp.c`/text-grid work before the tty MVP passes.
   - Keep pdmp/pbootstrap in the diagnostic lane. It is not the next normal
     browser runtime route.

8. Blocking Input Scheduler x Terminal/Tty Service x Browser GUI Boundary:
   move from forced minibuffer probe to terminal-owned input.
   - Define worker messages for:
     command start, command state read, minibuffer state read, input text,
     input key, cancel, command completion, command failure, and command
     unavailable.
   - For the terminal MVP, browser input becomes terminal bytes first. The
     worker remains the owner of pending command state, and Emacs remains the
     owner of command semantics.
   - First protocol command should prove ordinary terminal input and `C-g`
     before exposing full minibuffer commands.
   - Once the protocol is passing, demote
     `wasmacs_command_begin_minibuffer_force_probe` to a non-product
     diagnostic helper.

9. Blocking Input Scheduler: decide the durable waitpoint.
   - Keep `minibuf-setup` as the diagnostic waitpoint until root safety and
     post-completion GC are proven.
   - Re-test the real `read-char` / `kbd_buffer_get_event` waitpoint after the
     owned protocol exists, because it is closer to the command loop's natural
     blocking read.
   - Choose the durable waitpoint only after both waitpoint modes are evaluated
     against the same text-completion, cancel, GC-after-completion, and
     file-visiting undo GC probes.

10. Cleanup and retirement.
   - Remove stale known-blocker labels that now pass.
   - Keep genuine blockers wired as explicit known-blocker probes rather than
     folklore in notes.
   - Update `emacs.md` and `p.md` with any source-backed changes to the root
     safety or command protocol design.
   - Update this milestone's validation notes with exact scripts and evidence
     logs before moving to Milestone 14.

Expected deliverables:

- A Milestone 13.5 validation script, for example
  `tools/scripts/validate-owned-asyncify-command-protocol-plan.sh`.
- A small OS substrate contract module and tests that name service owners,
  cross-service checks, source surfaces, diagnostic/product treatment, and
  acceptance tests before new shims are added.
- A C/wasm facade plan that keeps JS as coordinator/mirror/harness and names
  lifecycle state, entrypoint root refresh, GC permission, pending command
  guard, backtrace/root ownership, terminal/tty ownership, and diagnostic
  preloaded-state/pdump placeholders.
- A GC-after-completion browser/worker probe for Asyncify text completion.
- A GC-after-completion browser/worker probe for Asyncify cancel.
- A live file-visiting buffer plus undo-list explicit-GC probe.
- A two-file file-switch plus undo-list explicit-GC probe.
- Worker protocol changes that represent pending Emacs commands explicitly.
- A minimal fake tty implementation or spike plan with source references.
- Browser/worker smoke proving `--nw` reaches the real input waitpoint.
- xterm.js smoke proving terminal output bytes render without browser-side
  minibuffer or editor semantics.
- Updated `emacs.md`, `p.md`, `PLAN.md`, and `LOG.md` evidence after each
  completed phase.

Validation commands:

```sh
tools/scripts/validate-owned-asyncify-command-protocol-plan.sh
tools/scripts/validate-minibuffer-asyncify-entrypoint-plan.sh
node tools/scripts/probe-browser-asyncify-minibuffer-input-injection.mjs
node tools/scripts/probe-browser-asyncify-minibuffer-cancel.mjs
node tools/scripts/probe-browser-asyncify-gc-after-completion.mjs
node tools/scripts/probe-browser-asyncify-file-undo-gc.mjs
npm test
npm run browser:smoke:all
```

Exit criteria:

- The persistent non-Asyncify ordinary editing baseline still passes.
- The Asyncify lane can start a real Emacs-owned pending command, report its
  state to the worker/browser protocol, accept text input, complete, unwind
  command/minibuffer/specpdl state, return to `idle`, and then survive an
  explicit `(garbage-collect)` from a fresh host entrypoint.
- The same lane can cancel a pending command through `Vunread_command_events`,
  unwind to `idle`, and survive explicit GC afterward.
- Reentrant command/eval entrypoints are rejected while a command is pending;
  state reads and input/cancel injection remain allowed.
- A live file-visiting buffer with real `save-buffer`, `undo-only`, and
  `undo-redo` survives explicit GC and remains usable afterward.
- Two live file-visiting buffers preserve independent undo/redo state across
  switching and explicit GC.
- The final protocol has no browser-side fake minibuffer, undo, kill-ring,
  region, or file-visiting semantics.
- `vendor/emacs` remains untouched; copied-source patches stay in scripts or
  generated artifacts until an explicit upstream patch experiment is requested.

Validation notes:

- 2026-06-02: created this milestone from the current `p.md` design and the
  source-reading evidence in `emacs.md`. The decisive next work is no longer
  "can Asyncify reach a minibuffer waitpoint?" but "can an Emacs-owned pending
  command protocol prove post-completion GC safety and live file/undo lifetime
  before Milestone 14 exposes real minibuffer behavior?"
- 2026-06-02: completed the Phase 1 classification gate by adding
  `doc/owned-asyncify-command-protocol-plan.md` and
  `tools/scripts/validate-owned-asyncify-command-protocol-plan.sh`. The new gate
  records active gates, baseline gates, diagnostics, known-blocker probes, and
  historical evidence, and verifies that the plan still names stack refresh,
  pending-command GC inhibition, Asyncify import narrowing, reentrant-call
  rejection, file-visiting undo GC, and browser event-loop ownership. Validation
  passed with `tools/scripts/validate-owned-asyncify-command-protocol-plan.sh`.
- 2026-06-02: Phase 1 baseline freeze validation passed with `npm test` and
  `npm run browser:smoke:all`. The full suite still records the existing
  known blockers for persistent buffer undo, file-buffer GC roots, live
  visited-file cross-eval, live find-file phases, and high-level undo tails;
  those remain Milestone 13.5 Phase 2+ targets rather than new regressions.
- 2026-06-02: completed the first Phase 2 host-entrypoint diagnostic slice.
  `tools/scripts/patch-emacs-host-entrypoint-spike.sh` now injects
  `WASMACS_ENTER_HOST_ENTRYPOINT` / `WASMACS_LEAVE_HOST_ENTRYPOINT`, replacing
  the one-off `wasmacs_eval_string` stack-bottom refresh with a copied-source
  entrypoint-local sentry that refreshes both `stack_bottom` and
  `current_thread->stack_top`. Added `_wasmacs_entrypoint_state` to the
  persistent and Asyncify exports. `node tools/scripts/probe-browser-host-entrypoint.mjs`
  records `stack-bottom-refreshed:true` and `stack-top-refreshed:true` from the
  persistent artifact. `node tools/scripts/probe-browser-asyncify-minibuffer-suspend-state.mjs`
  records a pending command with `gc-inhibit-depth:1`, refreshed stack
  bottom/top, and continued `unavailable:busy` reentrant rejection.
- 2026-06-03: split the test runner so long blocker matrices are no longer the
  default loop. `npm test` now runs runtime unit tests and lightweight
  plan/profile validation only. Added `npm run test:asyncify`,
  `npm run test:persistent`, `npm run test:known-blockers`, and
  `npm run test:heavy` for explicit artifact, blocker, and full-regression
  passes. Validation passed with `npm test`.
- 2026-06-03: added `_wasmacs_garbage_collect` as a fresh JS-to-Emacs
  entrypoint with stack/root refresh and no blanket eval GC inhibition, plus
  `tools/scripts/probe-browser-asyncify-gc-after-completion.mjs`. The probe covers
  text completion and cancel. Both paths now prove command completion/cancel
  unwinds to `idle`, `pending-asyncify-command:false`, `gc-inhibit-depth:0`,
  and `emacs-gc-inhibited:0` before explicit GC. The explicit GC still crashes
  through `mark_specpdl`, so this probe is registered as a known blocker and
  the next root-safety target is stale specpdl/root ownership after Asyncify
  resume completion.
- 2026-06-03: narrowed the GC blocker with `specpdl` diagnostics in
  `_wasmacs_entrypoint_state` and a boot-baseline case in
  `tools/scripts/probe-browser-asyncify-gc-after-completion.mjs`. Explicit GC after
  `callMain --batch` now passes as the `boot` case, even with 34 baseline
  `specpdl` entries and 10 backtrace records. Text completion and cancel return
  to the same `specpdl` shape, but their stale backtrace `args` pointers now
  read different raw Lisp words after Asyncify resume, and explicit GC fails in
  `mark_specpdl`. The next target is therefore not extra Asyncify frames, but
  old backtrace argument slots on the wasm stack being overwritten after the
  suspended command resumes.
- 2026-06-03: added a diagnostic
  `_wasmacs_scrub_specpdl_backtrace_args` export and expanded
  `tools/scripts/probe-browser-asyncify-gc-after-completion.mjs` with `text-scrub`
  and `cancel-scrub` cases. The ordinary `text` and `cancel` cases remain
  `KNOWN_BLOCKER` in `mark_specpdl`, but both scrubbed cases pass explicit
  post-completion GC after clearing 8 non-empty `SPECPDL_BACKTRACE` argument
  slots. This is intentionally not a product fix; it proves the next
  implementation target is durable/rebased backtrace argument root ownership
  across Asyncify resume, not generic `specpdl` shape or pending-command GC
  inhibition.
- 2026-06-03: promoted the diagnosis from scrub to pin. Added
  `_wasmacs_pin_specpdl_backtrace_args` and call it once before the forced
  Asyncify minibuffer command starts. The command boundary copies 8 non-empty
  baseline `SPECPDL_BACKTRACE` argument vectors from stale wasm stack slots
  into durable `xmalloc` storage while preserving `nargs` and the argument
  words. With this pin in place, `node tools/scripts/probe-browser-asyncify-gc-after-completion.mjs`
  now passes all cases: `boot`, ordinary `text`, ordinary `cancel`,
  `text-scrub`, `cancel-scrub`, `text-pin`, and `cancel-pin`. The previous
  ordinary text/cancel `mark_specpdl` known blocker is cleared for this
  copied-source spike. Remaining work before productizing is to replace the
  leak-prone one-time pin with a real ownership/freeing policy, then continue
  to live file-visiting buffer plus undo-list explicit-GC probes.
- 2026-06-03: added the first live file-visiting buffer plus undo-list
  explicit-GC probe for the Asyncify artifact:
  `tools/scripts/probe-browser-asyncify-file-undo-gc.mjs`. The probe uses a real
  `/home/user/projects/asyncify-file-undo.txt` `find-file` buffer, inserts and
  saves `A` and `X`, runs real `undo-only` and `undo-redo`, then calls fresh
  `_wasmacs_garbage_collect`. After GC it reopens the same live file buffer,
  confirms `buffer-file-name`, content `AX\n`, and a usable undo list, then
  performs a follow-up insert `Z` and real `undo-only` back to `AX\n`.
  Evidence is recorded in `logs/wasm-browser-asyncify-file-undo-gc.txt`.
  Added this probe to `npm run test:asyncify`. The remaining Phase 6 target is
  the two-file file-switch variant proving independent undo/redo state across
  explicit GC.
- 2026-06-03: added and passed the two-file file-switch undo/redo explicit-GC
  probe for the Asyncify artifact:
  `tools/scripts/probe-browser-asyncify-file-switch-undo-gc.mjs`. The probe opens
  two real visited files under `/home/user/projects`, edits and saves A as
  `AX\n` and B as `BY\n`, runs fresh `_wasmacs_garbage_collect`, then switches
  between both live buffers and proves independent real `undo-only` /
  `undo-redo` state after GC. Evidence is recorded in
  `logs/wasm-browser-asyncify-file-switch-undo-gc.txt`. Added this probe to
  `npm run test:asyncify`. This completes the Milestone 13.5 Phase 6 proof
  shape for single-file and two-file live visited-buffer undo/redo GC, subject
  to the remaining caveat that the copied-source backtrace pin still needs a
  real ownership/freeing policy before productization.
- 2026-06-03: started Milestone 13.5 Phase 7 by adding a thin
  worker/browser pending-command protocol for Emacs command boundaries. Added
  `app/src/pending-command-protocol.js` with explicit states
  (`starting`, `pending-input`, `resuming`, `completed`, `cancelled`,
  `failed`, `unavailable`) and command kinds (`find-file`, `switch-buffer`,
  `minibuffer-read`), plus runtime tests in
  `tests/runtime/pending-command-protocol.test.js`. The browser worker now
  emits `pending-command` messages before the currently unsupported
  `find-file` and `switch-buffer` minibuffer paths, and reports the existing
  unavailable boundary as structured protocol state rather than only as an
  opaque worker error. The main thread validates these messages, updates
  status/minibuffer UI from them, and keeps the existing explicit
  minibuffer-unavailable behavior. Validation: `npm test` and
  `npm run browser:smoke:all` pass. This is intentionally not yet real
  Asyncify minibuffer input exposure; it is the product-side command boundary
  that the owned pending-command protocol can grow into.
- 2026-06-03: added a browser smoke assertion for the Phase 7
  pending-command UI boundary. `app/src/main.js` now records validated
  pending-command messages in the smoke harness, and
  `tools/scripts/run-browser-smoke.mjs` asserts that `C-x C-f` emits `find-file`
  `starting` and `unavailable` pending-command states, including the
  `Find file: ` minibuffer prompt, before the existing explicit
  minibuffer-unavailable final UI state. `tools/scripts/validate-browser-worker-app.sh`
  now checks that this runner assertion remains present. Validation:
  `npm test` and `npm run browser:smoke:all` pass; the runner log includes
  `PASS pending-command find-file starting unavailable`.
- 2026-06-03: attempted the first real browser-worker Asyncify
  `pending-input` path behind the Phase 7 protocol. Added
  `app/src/asyncify-minibuffer-worker.js` and
  `window.__wasmacsSmoke.asyncifyMinibufferReadSmoke` so a separate Asyncify
  worker can start the Emacs-owned
  `wasmacs_command_begin_minibuffer_force_probe`, wait for host input, accept
  browser-provided text, and report protocol states through
  `pending-command`. The protocol scaffold is in place, but real browser
  worker execution is currently blocked before `pending-input` by
  `RangeError: Maximum call stack size exceeded` from the Asyncify artifact.
  `node tools/scripts/run-browser-smoke.mjs asyncify` records this as
  `KNOWN_BLOCKER asyncify browser worker stack` in
  `logs/browser-asyncify-protocol-smoke.txt`. The underlying Node/VM probe
  still passes with `node tools/scripts/probe-browser-asyncify-minibuffer-input-injection.mjs`,
  and `logs/wasm-browser-asyncify-minibuffer-input-injection.txt` records
  `STATUS:PASS`, `WAITPOINT_REACHED:true`, and `INPUT_TEXT_ACCEPTED:true`.
- 2026-06-03: added an explicit browser-worker boot split probe for the source
  diagnosis. `window.__wasmacsSmoke.asyncifyNoLoadupBootSmoke` and
  `node tools/scripts/run-browser-smoke.mjs asyncify-boot` attempt to boot the
  Asyncify artifact with `--batch --no-loadup --eval`. This avoids the cold
  `loadup.el` graph but does not produce a usable Emacs runtime; the browser
  probe records `KNOWN_BLOCKER asyncify no-loadup boot status -1` in
  `logs/browser-asyncify-no-loadup-boot-smoke.txt`. This strengthens the
  source-backed conclusion: wasm must provide a post-loadup/preloaded Emacs
  Lisp-machine state, not merely skip loadup.
- 2026-06-03: laid the first small OS substrate implementation skeleton.
  `app/src/small-os-services.js` now defines the service registry, lifecycle
  phases, cross-service checks, active operation contracts, and state gates for
  GC, pending-command start, lifecycle transitions, and reverse sync.
  `doc/small-os-substrate-implementation.md` explains how the skeleton maps
  browser-worker Asyncify boot, pdump/purecopy, backtrace pinning,
  pending-command protocol, reverse sync, and unavailable browser boundaries to
  service contracts. `tests/runtime/small-os-services.test.js` validates that
  every operation names owner services, invariants, source surfaces,
  diagnostic/product treatment, and acceptance. `pending-command-protocol.js`
  now attaches a substrate record to product-scaffold messages it creates while
  still accepting classic-worker messages that do not carry the optional field.
- 2026-06-03: advanced the small OS product scaffold up to, but not into,
  pdump/purecopy/preloaded-state work. Added `app/src/small-os-runtime.js` as a
  browser-side coordinator for lifecycle, blocking input scheduler,
  control-flow, and filesystem/persistence boundaries. `app/src/main.js` now
  begins a small-OS command before dispatching worker commands, buffers worker
  `sync-file` messages, opens reverse sync only after successful command exit,
  and exposes the small OS snapshot through the smoke harness. Asyncify
  minibuffer smoke enters the same command lifecycle before starting its
  separate worker, but the actual preloaded-state blocker remains deferred.
  Added `tests/runtime/small-os-runtime.test.js` to validate command-running,
  pending-input, resume, failure, and reverse-sync boundary behavior.
- 2026-06-03: repositioned the current JS small OS scaffold as
  coordinator/mirror/harness rather than low-level substrate owner. Added
  C/wasm facade contracts to `app/src/small-os-services.js` and
  `doc/small-os-substrate-implementation.md` for lifecycle state, entrypoint
  root refresh, GC permission, pending command guard, backtrace/root
  ownership, preloaded-state/pdump, and segment/root/relocation. Each facade
  now records the Emacs capability requested, owner service, source surfaces,
  proposed `wasmacs_os_*` entrypoints, allowed JS role, diagnostic/product/
  placeholder status, and acceptance test. Validation gates were extended in
  `tests/runtime/small-os-services.test.js` and
  `tools/scripts/validate-owned-asyncify-command-protocol-plan.sh`.
- 2026-06-03: implemented the first minimal generated/copied-source C/wasm
  facade slice without moving ownership into JS. `tools/scripts/patch-emacs-host-entrypoint-spike.sh`
  now exports `wasmacs_os_lifecycle_phase`,
  `wasmacs_os_root_state_snapshot`, `wasmacs_os_gc_permission`,
  `wasmacs_os_pending_command_state`, and `wasmacs_os_pin_backtrace_args` as
  facade-shaped wrappers around the existing host-entrypoint/root,
  GC-permission, pending-command-state, and backtrace-pin diagnostics. The
  persistent and Asyncify build scripts export those names. Persistent rebuild
  passed with `tools/scripts/build-emacs-browser-persistent-spike.sh`; Asyncify
  rebuild passed with
  `WASMACS_ASYNCIFY_WAITPOINT_MODE=minibuf-setup tools/scripts/build-emacs-browser-asyncify-spike.sh`;
  `tools/scripts/validate-browser-persistent-spike.sh` and
  `tools/scripts/validate-minibuffer-asyncify-entrypoint-plan.sh` passed; and
  `node tools/scripts/probe-browser-host-entrypoint.mjs` now proves
  `OS_LIFECYCLE_PHASE:initialized`, `OS_PENDING_COMMAND_STATE:idle`,
  `OS_GC_PERMISSION_READBACK:gc-permission:allowed`, and refreshed root
  snapshots in `logs/wasm-browser-host-entrypoint.txt`.
- 2026-06-03: fixed `alloc.c` purecopy cycle blocker. Added provisional
  `Fputhash(original → new_pure_vec)` BEFORE the recursive slot copy loop in
  `purecopy` for `CLOSUREP/VECTORP/RECORDP`. This breaks the
  `mode-line-input-method-map` closure self-cycle that caused exit 139 in
  `bindings.el`. Patch applied to
  `build/emacs-pdump-configure-probe/src/src/alloc.c`.
- 2026-06-03: fixed `pdumper.c` mmap blocker. Added `#ifdef __EMSCRIPTEN__`
  guard at the `dump_mmap_contiguous` dispatcher to force
  `dump_mmap_contiguous_heap` (heap-based) instead of
  `dump_mmap_contiguous_vm` (POSIX anonymous mmap). Emscripten's wasm mmap
  does not support `PROT_NONE / MAP_ANONYMOUS` required by the VM path.
  Patch applied to
  `build/emacs-pdump-configure-probe/src/src/pdumper.c`.
- 2026-06-03: added `tools/scripts/probe-emacs-pdump-loadup-source-prereqs.sh`
  which patches the copied-source `loadup.el` to pre-load `macroexp`,
  `pcase`, and `easy-mmode` before `(load "files")`. This bypasses the
  `(require pcase) while preparing to dump` blocker that fires when loading
  `files.el` from source with eager macro expansion enabled.
- 2026-06-03: achieved first `pbootstrap` pdump in wasm/Node: running
  `temacs --batch -l loadup --temacs=pbootstrap` with the alloc.c + loadup
  prereqs patches produces `bootstrap-emacs.pdmp` (25MB). Loading it under
  Node with `--dump-file` shows `VERSION:30.2`, `GC:PASS`, `PDUMP:loaded`.
  Evidence is in `logs/emacs-pdump-node-load-pass.txt`.
- 2026-06-03: completed C/wasm OS compat kernel functions. Added to
  `tools/scripts/patch-emacs-host-entrypoint-spike.sh`:
  `wasmacs_os_release_backtrace_args` (frees xmalloc'd pin copies with
  correct nargs>0 condition), `wasmacs_os_push_gc_guard` /
  `wasmacs_os_pop_gc_guard` (explicit GC inhibition at OS boundary),
  `wasmacs_os_begin_command` / `wasmacs_os_finish_command` /
  `wasmacs_os_cancel_command` (command lifecycle facade). All six new
  entrypoints are exported in the persistent and asyncify build scripts.
  Probe evidence in `logs/wasm-browser-os-compat-kernel.txt` confirms
  push/pop GC guard, begin/finish/cancel command, reentrant rejection, and
  GC-after-finish all pass. `gc-permission-facade` status promoted from
  `placeholder` to `diagnostic`.
- 2026-06-03: built `tools/scripts/build-emacs-browser-pdump-profile.sh` and
  `build/artifacts/emacs-browser-pdump-profile/`. This profile uses 512MB fixed
  wasm linear memory (`INITIAL_MEMORY=536870912`, `ALLOW_MEMORY_GROWTH=0`),
  16MB wasm stack, all `wasmacs_os_*` kernel entrypoints exported, and
  bundles `bootstrap-emacs.pdmp`. Browser workers can now boot with
  `--dump-file=/bootstrap-emacs.pdmp` to skip cold `loadup.el`, eliminating
  the `RangeError: Maximum call stack size exceeded` blocker. Build evidence
  in `logs/emacs-browser-pdump-profile-build.txt`.

## Milestone 14: Emacs Fidelity Expansion

Goal: move from proof-of-life to recognizable Emacs behavior.

Initial order:

1. Minibuffer.
2. Mode line.
3. Multiple windows.
4. Basic command dispatch.
5. Basic package loading from `/home/user/.emacs.d/elpa`.
6. Clipboard.
7. IME composition.
8. Overlay/text properties.
9. Process substitutes for grep/compile/LSP.

Each feature must have:

- a small design note
- source references into `vendor/emacs`
- tests or a repeatable smoke path
- an update to this plan if scope changes

Package install / network Phase 1 slice:

- [x] Define `host.network.fetch` as an HTTP(S) request/response service, not a
  raw socket or `host.process` substitute.
- [x] Add a repo-local `wasmacs-url-fetch` Lisp overlay that can register a
  fetch-backed `url.el` loader for `http` and `https`.
- [x] Keep `vendor/emacs` unchanged; copy the overlay into `/system/lisp`
  during system image construction.
- [x] Add runtime host `fetchUrl` helpers with scheme/origin policy checks.
- [x] Add runtime tests for host fetch response shape, permission denial, and
  the no-raw-network-process Lisp overlay boundary.
- [x] Add the Emacs-side `wasmacs-os-network-fetch-json` primitive and checked-in
  C patch wiring so the Lisp loader can call the browser host network backend.
- [x] Add a pasteable `use-package` smoke sample at
  `doc/use-package-fetch-sample.el`.
- [x] Document network access in `README.md` and add optional self-hosted fetch
  proxy samples for Node, PHP, Go, Rust, Perl, Ruby, Python, and PowerShell under
  `proxy/`.
- [x] Add a root `extension/` Chrome companion lane for user-granted CORS
  proxying through the same `host.network.fetch` boundary.
- [x] Thread a configured local `network-proxy` URL from the browser page into
  the wasm host network bridge and make localhost proxy samples CORS-ready.
- [x] Add an Emacs-side `wasmacs-url-fetch-proxy-url` setting that can choose a
  self-hosted proxy from init.el or a scratch buffer.

Validation notes:

- 2026-06-06: Phase 1 fetch-backed url.el support added. Source references:
  `vendor/emacs/lisp/emacs-lisp/package.el` uses
  `url-retrieve`/`url-retrieve-synchronously` for archive downloads;
  `vendor/emacs/lisp/url/url.el` dispatches via scheme loaders; the normal
  `vendor/emacs/lisp/url/url-http.el` path would otherwise reach
  `open-network-stream` / `make-network-process`. The new wasmacs route keeps
  `host.process` unavailable and targets package archive download + VFS write.
- 2026-06-06: continued Phase 1 by wiring the checked-in Emacs C patch to
  expose `wasmacs-os-network-fetch-json`, backed by browser-host synchronous XHR
  in wasm and JSON/base64 response adaptation in `wasmacs-url-fetch.el`.
- 2026-06-06: rebuilt the browser Atomics+pdump artifacts with Phase 1 network
  fetch support. `make build` completed and refreshed `docs/`; `npm test`
  passed 80 tests; `tools/scripts/validate-host-abi.sh` passed; `strings
  build/artifacts/system-lisp-emacs-30.2.wasifs | rg
  "wasmacs-url-fetch|wasmacs-os-network-fetch-json"` confirmed the Lisp overlay
  in the system image; `rg` confirmed `wasmacs_host_network_fetch_json` and the
  wasm export in both `build/artifacts/emacs-browser-atomics-pdump/temacs.js`
  and `docs/artifacts/emacs-browser-atomics-pdump/temacs.js`. `npm run dev`
  served `http://127.0.0.1:5173/app/xterm-atomics-pdump.html?autostart`, and
  the in-app browser showed the Emacs xterm screen.
- 2026-06-06: fixed the browser xterm route after manual smoke found
  `(require 'wasmacs-url-fetch)` failing with `file-missing`. The cause was
  that the standalone `system-lisp.wasifs` image contained the overlay, but the
  active Atomics+pdump route preloads `${pdump_src}/lisp` into
  `/usr/local/share/emacs/30.2/lisp` via `temacs.data`. The Atomics+pdump
  builder now copies `src/emacs-lisp/*.el` into that preload tree before
  byte-compilation. Validation: `npm test` passed 81 tests;
  `tools/scripts/validate-host-abi.sh` passed; `make build` completed; `strings
  build/artifacts/emacs-browser-atomics-pdump/temacs.data | rg
  "wasmacs-url-fetch|wasmacs-os-network-fetch-json"` and the same command
  against `docs/artifacts/.../temacs.data` confirmed the overlay in the active
  browser artifact. Reloaded the in-app browser route and evaluating a scratch
  buffer containing `(require 'wasmacs-url-fetch)` no longer enters Debugger or
  reports `file-missing`.
- 2026-06-06: fixed the next fetch smoke failure where the browser worker ended
  with `stringToNewUTF8 is not a function`. The host-network `EM_JS` bridge now
  returns JSON strings via `lengthBytesUTF8` + `_malloc` + `stringToUTF8`, and
  the C primitive frees the response after `build_string`. Because
  `https://happy-lucky.work/` does not send `Access-Control-Allow-Origin` for
  `http://127.0.0.1:5173`, local `npm run dev` now exposes
  `/__wasmacs_network_fetch` as a same-origin development proxy, and the
  browser host bridge falls back to it when direct XHR fails. Validation:
  `npm test` passed 82 tests; `tools/scripts/validate-host-abi.sh` passed;
  `make build` completed; curl POST to
  `http://127.0.0.1:5173/__wasmacs_network_fetch` fetched
  `https://happy-lucky.work/` with status 200 and 6026 body bytes; a Node VM
  artifact smoke mocked a direct CORS failure and confirmed
  `wasmacs_os_network_fetch_json` returns the proxied response; the in-app
  browser route was reloaded and reached the Emacs xterm screen.
- 2026-06-06: made the Atomics+pdump browser runtime enable fetch-backed
  `url.el` by default. The worker now passes a default Lisp init through
  `--eval` that requires `wasmacs-url-fetch`, calls
  `wasmacs-url-fetch-enable`, and logs `WASMACS-URL-FETCH=t`, so package.el /
  use-package archive fetches can use the browser host backend without manual
  scratch-buffer setup.
- 2026-06-06: diagnosed the live GitHub Pages
  `https://modeverv.github.io/wasmacs/app/xterm-atomics-pdump.html` failure
  reported as `Maximum call stack size exceeded`. The published worker and
  artifacts were current, but the slower Pages fetch of `temacs.data` let
  Emscripten's run-dependency watcher print one stderr line for each of the
  4211 preloaded files. The xterm page auto-opened the log panel and appended
  that dependency dump to the DOM. The Atomics+pdump worker now suppresses only
  that generated dependency spam and replaces it with one progress status line,
  while preserving normal stderr and Emacs boot diagnostics.
- 2026-06-06: isolated the remaining `Maximum call stack size exceeded` to
  `wasmacs-url-fetch-enable`, not to `xt-mouse-mode` or merely requiring the
  overlay. The url.el registry entries now match `url-methods.el` by storing
  function symbols such as `wasmacs-url-fetch` instead of function objects.
  Validation: `npm test` passed 84 tests; `tools/scripts/validate-host-abi.sh`
  passed; `make build` regenerated `temacs.data`; the local in-app browser route
  reached `interactive wait ✓` with the default url-fetch init and
  `WASMACS-XTERM-MOUSE=t` still enabled.
- 2026-06-06: live Pages still failed after the registry fix, while the local
  rebuilt route stayed stable. The live `temacs.data`, `temacs.wasm`, and pdmp
  hashes differed from local because CI used `emsdk latest`; local validation
  used Emscripten 5.0.7. CI now pins `mymindstorm/setup-emsdk@v14` to `5.0.7`
  so published browser artifacts are built with the same toolchain family as
  the verified local route.
- 2026-06-06: after the pinned CI deploy (`de61269`), GitHub Pages still
  reproduced the same `RangeError: Maximum call stack size exceeded` in
  `temacs.wasm.exec_byte_code` immediately after the default
  `wasmacs-url-fetch-enable` eval. The deploy log confirms
  `pages_build_version=de61269569f9075935fee4b676a0cc788d5eb120` and the live
  worker/HTML hashes match the current `docs`, while CI-generated
  `temacs.wasm`/pdmp/data hashes differ from the local macOS build. The
  Atomics+pdump page now accepts diagnostic boot query parameters:
  `?no-default-init=1` skips the built-in url-fetch init, and repeated
  `extra-eval=...` parameters append explicit Lisp forms. Normal boot remains
  unchanged. Validation: `npm test` passed 85 tests;
  `tools/scripts/validate-host-abi.sh` passed.
- 2026-06-06: live diagnostic boot on `91a0ceb` showed
  `?no-default-init=1` reaches `interactive wait ✓` on GitHub Pages with the
  same 140MB preload data and thousands of embedded Lisp files, so the remaining
  failure is not simply "too many built-in el files". Adding only
  `(require 'wasmacs-url-fetch)` still failed, and probing `(require 'json)`
  also reproduced the wasm `Maximum call stack size exceeded`. The pdump build
  now patches the generated `loadup.el` copy to preload `json`, `url-methods`,
  `url-parse`, `url-vars`, and `wasmacs-url-fetch` into the `pbootstrap` pdmp
  before dump, leaving runtime `require` shallow after restore.
- 2026-06-07: documented network access in `README.md`, recorded the
  self-hosted fetch proxy boundary in `ARCHITECTURE.md`, and added runnable
  `proxy/node`, `proxy/php`, `proxy/go`, `proxy/rust`, `proxy/perl`,
  `proxy/ruby`, `proxy/python`, and `proxy/powershell` samples. The samples share the
  `host.network.fetch` JSON contract, require
  `WASMACS_PROXY_ALLOWED_ORIGINS`, strip browser/request-only headers, and
  return `bodyBase64` response bytes. Validation: `node --test
  tests/runtime/fetch-proxy-samples.test.js` passed for Node, PHP, Go, Rust,
  Perl, Ruby, Python, and PowerShell against a local fake archive server;
  `node --test tests/runtime/network-fetch.test.js
  tests/runtime/wasmacs-url-fetch-lisp.test.js` passed 23 tests; `npm test`
  passed 118 tests plus artifact/plan validation scripts.
- 2026-06-07: wired localhost proxy selection into the browser network layer.
  The xterm Atomics+pdump page accepts `network-proxy` /
  `wasmacs-network-proxy` query parameters, stores the endpoint in
  `localStorage`, forwards it through `debugOptions` to the worker, and exposes
  it as `Module.wasmacsNetworkProxyUrl` for the C `EM_JS` host fetch bridge.
  Direct browser fetch still runs first; on CORS/fetch failure the bridge tries
  the configured proxy endpoint before the same-origin development
  `/__wasmacs_network_fetch` route. All proxy samples now answer CORS
  `OPTIONS` preflight and echo the requesting `Origin` for credential-free
  browser POSTs.
- 2026-06-07: added `wasmacs-url-fetch-proxy-url` to the Lisp overlay. Users can
  set `(setq wasmacs-url-fetch-proxy-url "http://127.0.0.1:8787/")` before
  `package-refresh-contents` / `package-install`; the Lisp loader includes it
  as `proxyUrl` in each host request, and the wasm host bridge gives that
  request-local value precedence over page-level `network-proxy`.
- 2026-06-07: fixed the live GitHub Pages localhost proxy failure reported as
  `proxy returned invalid JSON from https://modeverv.github.io/__wasmacs_network_fetch`.
  The wasm host bridge now adds the same-origin `__wasmacs_network_fetch`
  fallback only on local development origins, so static Pages does not turn its
  404 HTML into a proxy JSON error. Proxy JSON parse failures are accumulated
  and the next proxy candidate is tried. All language samples now answer Chrome
  Private Network Access preflights with
  `Access-Control-Allow-Private-Network: true`, which is required when a public
  HTTPS page calls a localhost proxy. Validation: `node --test
  tests/runtime/fetch-proxy-samples.test.js
  tests/runtime/wasmacs-url-fetch-lisp.test.js tests/runtime/network-fetch.test.js`
  passed 28 tests; `npm test` passed 119 tests; `make build` completed; `strings
  docs/artifacts/emacs-browser-atomics-pdump/temacs.js | rg
  "isLocalHostName|returned invalid JSON|__wasmacs_network_fetch|wasmacsNetworkProxyUrl"`
  confirmed the generated Pages artifact contains the corrected host bridge.
- 2026-06-08: diagnosed the next live Pages proxy error reported as
  `Failed to execute 'send' on 'XMLHttpRequest': Failed to load
  'http://127.0.0.1:8787/'`. The configured localhost proxy endpoint was being
  selected correctly, but public HTTPS pages to localhost are subject to browser
  Private Network Access / CORS checks, and the bridge's explicit
  `content-type: application/json` header forced an extra CORS preflight. The
  bridge now sends the proxy POST body without that custom request header; the
  proxy samples still accept the same JSON payload and keep their PNA `OPTIONS`
  support for browsers that require it. Local curl checks showed the currently
  running Perl proxy answered PNA `OPTIONS` with
  `Access-Control-Allow-Private-Network: true`, `https://elpa.gnu.org` fetched
  through the proxy with status 200, and the ad-hoc smoke target
  `https://happy-lucky.work` was rejected by the intentional allowlist until
  `WASMACS_PROXY_ALLOWED_ORIGINS` includes that origin. Validation:
  `node --test tests/runtime/wasmacs-url-fetch-lisp.test.js
  tests/runtime/fetch-proxy-samples.test.js` passed 25 tests.
- 2026-06-08: updated all proxy samples, including the Ruby WEBrick proxy, to
  echo the browser `Origin` in `Access-Control-Allow-Origin` and set
  `Vary: Origin` instead of using wildcard CORS when an origin is present. This
  matches Chrome's stricter Private/Local Network Access behavior for worker
  initiated requests from public HTTPS pages to localhost. Validation:
  syntax/type checks passed for Node, PHP, Go, Rust, Perl, Ruby, Python, and
  PowerShell; `node --test tests/runtime/fetch-proxy-samples.test.js` passed 9
  tests and verified `https://modeverv.github.io` is echoed by every sample.
- 2026-06-08: Ruby proxy logging showed no request line when GitHub Pages tried
  the configured `127.0.0.1:8787` proxy, which means Chrome stopped the request
  before it reached the proxy process. The Atomics pdump route now replaces the
  generated `wasmacs_host_network_fetch_json` JS hook after `temacs.js` loads:
  worker-side C/wasm still gets a synchronous primitive, but the worker posts a
  `host-network-fetch` message and waits on a SharedArrayBuffer while the main
  page performs direct/proxy `fetch` and wakes the worker. Validation:
  `node --test tests/runtime/wasmacs-url-fetch-lisp.test.js
  tests/runtime/browser-app-route.test.js` passed 19 tests.
- 2026-06-08: changed only the Ruby localhost proxy to default
  `WASMACS_PROXY_ALLOWED_ORIGINS=*` for local-only development while preserving
  explicit allowlist behavior when the env var is set. Validation:
  `ruby -c proxy/ruby/server.rb`, `node --test
  tests/runtime/fetch-proxy-samples.test.js`, and `npm test` passed; the proxy
  suite now includes a Ruby default-all-origin test.
- 2026-06-08: GitHub Pages still showed worker-local `XMLHttpRequest` failures
  because replacing `wasmacs_host_network_fetch_json` after `temacs.js` loads is
  too late for the wasm import table. `build-site.mjs` now patches the checked-in
  Pages `temacs.js` artifact so `wasmacs_host_network_fetch_json` itself posts
  `host-network-fetch` and waits on the SharedArrayBuffer relay. Validation:
  `node --test tests/runtime/wasmacs-url-fetch-lisp.test.js` verifies the Pages
  artifact no longer uses `new XMLHttpRequest` inside that function.
- 2026-06-27: added root `extension/` for the Chrome companion extension from
  `CHROME_EXTENSION_PLAN.md`. The lane implements a Manifest V3 content-script
  bridge, module service worker, versioned ping/request protocol, default
  ELPA/MELPA/GitHub target allowlist, safe GET/HEAD fetch path, private-network
  rejection, credential rejection by default, options UI, and bounded audit log.
  Validation: `npm --prefix extension test` passed 12 tests.
- 2026-06-27: fixed the first wasmacs-side Chrome companion integration smoke.
  Manual `use-package rainbow-mode` failed on the package tarball because
  `xterm-atomics-pdump.html` still tried browser direct `fetch()` first and did
  not call the extension bridge. The page-side `hostNetworkFetch` now sends
  versioned `WASMACS_PROXY_REQUEST` messages to the content-script bridge,
  normalizes extension response headers back to the Elisp-friendly
  `{name,value}` list shape, and falls back to direct fetch / configured proxy
  only if the companion is unavailable or rejects the request. Validation:
  `node --test tests/runtime/wasmacs-url-fetch-lisp.test.js` passed 19 tests;
  extracted inline script from `src/wasm/xterm-atomics-pdump.html` passed
  `node --check`.
- 2026-06-27: fixed the GitHub Pages companion-extension gap. The Pages app
  already had the page-side bridge, but extension `content_scripts.matches`
  covered only localhost and `DEFAULT_CALLER_ORIGINS` covered only local
  origins, so `https://modeverv.github.io/wasmacs/` never reached the service
  worker and fell back to CORS-blocked direct fetch. Manifest version `0.1.1`
  adds `https://modeverv.github.io/wasmacs/*` as a content-script target and
  `https://modeverv.github.io` as a default caller origin. Validation:
  `npm --prefix extension test`.


## Milestone 15: High-Performance Renderer

Goal: replace the MVP DOM/textarea-oriented rendering path with a measured
Canvas/WebGL renderer that can handle large buffers, frequent redisplay, and
Emacs-style layered visual state.

Status: [ ] not started

Initial order:

1. Define renderer benchmarks and budgets:
   - startup-to-first-frame time
   - keypress-to-paint latency
   - scroll frame time
   - large buffer memory use
2. Add a Canvas 2D text-grid renderer behind the existing `text-grid-draw`
   protocol.
3. Add dirty row / dirty rectangle invalidation to avoid full-frame redraws.
4. Add a WebGL text atlas renderer:
   - glyph atlas creation
   - glyph quad batching
   - cursor and region overlay layers
   - mode line layer
5. Add renderer parity tests against the DOM renderer for:
   - cursor position
   - row wrapping
   - empty lines
   - selection/region markers
   - basic face attributes
6. Add browser performance smoke for:
   - 10k-line buffer open
   - fast typing burst
   - sustained scroll
   - resize
7. Keep renderer concerns in the browser GUI host; do not move DOM, Canvas, or
   WebGL APIs into `emacs-core.wasm`.

Exit criteria:

- A large text buffer can be opened, scrolled, and edited with measured latency
  targets documented in logs.
- The renderer can switch between DOM/Canvas/WebGL modes for comparison.
- Emacs core remains the owner of editor state; the renderer only consumes draw
  messages and sends input events.

Validation notes:

- Not started. Current architecture already points toward Canvas/WebGL text
  atlas rendering, but M13/M14 still prioritize editor correctness and Emacs
  fidelity before the performance renderer pass.

## Current Next Step

Milestone 13.5 now pivots to a minimal Terminal/Tty Service and xterm.js
renderer as the active product route.

The previous pdump/pbootstrap lane produced valuable evidence, but it is no
longer the next normal browser runtime path. Keep the pdump artifacts and logs
as diagnostics for preloaded-state, purecopy, relocation, and loadup behavior.
Do not continue pdmp work unless the fake tty path fails with source-backed
evidence or the user explicitly asks for a preloaded-state experiment.

Why this pivot:

- The project is already close on the ordinary editing baseline: real
  file-visiting buffers, `save-buffer`, undo/redo, file switching, `.wasifs`
  persistence, explicit unavailable boundaries, and browser smoke coverage all
  have evidence in the Milestone 12-13 notes.
- The next fidelity gap is not a custom browser GUI renderer. It is getting
  real Emacs interactive startup into `command_loop` in a browser worker.
- A terminal-backed MVP lets Emacs keep ownership of command loop, keymaps,
  minibuffer, redisplay, mode line, undo, windows, and buffers while JS only
  transports terminal bytes.
- This avoids diving directly into `xdisp.c` internals for a custom
  `text-grid-draw` renderer. Emacs can use its existing
  `xdisp.c -> term.c -> tty output` path, and the browser can render that
  stream with xterm.js.

Current source-backed state:

- `tools/scripts/build-emacs-browser-asyncify-spike.sh` now builds the
  pdmp-free xterm product artifact from its own fresh copied GNU Emacs 30.2
  source tree under `build/emacs-browser-asyncify-spike/`.
- `asyncify-minibuffer-worker.js` starts the product route with
  `callMain(["--quick", "--no-splash", "--nw"])`.
- The previous `Loading subr (source)...` / `traverse_intervals` crash was
  traced to rebuilding the Asyncify artifact from the shared
  `build/emacs-core-spike` copied tree. Fresh recopying from `vendor/emacs`
  cleared that failure.
- `npm run test:xterm-cold-loadup-failure` is now a cold-loadup smoke: it
  verifies the product route reaches the interactive tty waitpoint on a
  browser-like small JS stack with no `--dump-file`.
- `npm run test:xterm-manual-app-smoke` now reaches the first tty waitpoint
  and proves printable terminal bytes go through the real Emacs command loop
  as `self-insert-command`, mutating the buffer to `abc`.
- The next investigation should stay on VS Code/webview `.wasifs` mounting and
  terminal surface polish: pass the opened image into the runtime before
  startup and hand Emacs `(dired "/home/user")`. The custom editor now has an
  xterm.js surface for terminal bytes; do not return to pdmp or forced
  minibuffer probes as the first response.

Next implementation slice:

1. Add `Terminal/Tty Service` to the small OS implementation and validation
   gates.
   - Owner: OS compatibility layer.
   - Product goal: let Emacs `--nw` reach `command_loop`.
   - Non-goal: full POSIX pty, job control, process groups, or subprocess
     shell.

2. Implement the smallest fake tty surface Emacs proves it needs.
   - `isatty(0/1/2)` returns true for the browser terminal profile.
   - `tcgetattr` / `tcsetattr` succeed with a raw-ish fake state.
   - `ioctl(TIOCGWINSZ)` returns browser-provided rows and columns.
   - `read(0, ...)` suspends via the existing Asyncify wait path until JS has
     input bytes.
   - `write(1/2, ...)` posts terminal bytes to JS.
   - `TERM` / `TERMCAP` are deterministic. Start with `TERM=dumb` if it gets
     to the waitpoint fastest; move to `xterm-256color` when xterm.js is wired.

3. Prove the terminal MVP before adding more editor features.
   - `emacs --quick --no-splash --nw` reaches `command_loop`.
   - The worker reaches `read_char` / `tty_read_avail_input` /
     `wasmacs_host_wait_for_input`.
   - Initial tty output bytes are visible in JS logs.
   - A printable key byte injected from JS mutates the selected Emacs buffer
     through the real command loop.
   - `C-g` is delivered as Emacs terminal input, not a browser-side fake.

4. Wire xterm.js only after byte-level tty I/O is proven.
   - stdout/stderr bytes flow into xterm.js.
   - xterm.js is only a renderer and input collector.
   - Browser code must not implement minibuffer, undo, kill-ring, region, or
     buffer/window semantics.

5. Keep existing ordinary editing and `.wasifs` gates green.
   - `npm test`
   - `npm run browser:smoke:all`
   - targeted terminal/interactive smoke once added

Validation notes:

- 2026-06-03: pdmp/pbootstrap is demoted from active product route to
  diagnostic preloaded-state evidence. The active route is pdmp-free fake tty
  startup with xterm.js as the first renderer.
- 2026-06-03: `doc/small-os-for-emacs.md` now defines `Terminal/Tty Service`,
  cross-service checks for terminal lifecycle/input/browser GUI, and a
  recommended order that places fake tty before xterm.js and before custom
  redisplay work.
- 2026-06-03: added the first minimal browser fake tty surface for the
  interactive Asyncify profile. `tools/scripts/wasmacs-asyncify-host-library.js`
  now installs a deterministic terminal profile (`TERM=dumb`, inline
  `TERMCAP`, 80x24 winsize), makes Emscripten `/dev/tty` stdin/stdout/stderr
  byte-oriented, exposes a JS terminal input queue, reports terminal output
  bytes through worker messages, and answers `FIONREAD` from the queued byte
  count. `tools/scripts/patch-emacs-host-entrypoint-spike.sh` now patches copied
  `sysdep.c` so Emacs tty reads suspend through `wasmacs_host_wait_for_input`
  until JS has terminal bytes, then read from the queue instead of returning
  browser-side EOF.
- 2026-06-03: added `Terminal/Tty Service` to the small OS registry and tests.
  The service is recorded as a product scaffold owned by terminal/lifecycle/
  blocking-input/browser-boundary services, with source surfaces
  `emacs.c`, `dispnew.c`, `term.c`, `keyboard.c`, and `sysdep.c`.
- 2026-06-03: rebuilt `build/artifacts/emacs-browser-interactive/` with
  `tools/scripts/build-emacs-browser-interactive.sh`; build completed and refreshed
  `temacs`, `temacs.wasm`, and `temacs.data`.
- 2026-06-03: `node tools/scripts/run-browser-smoke.mjs interactive-loop` reached
  the terminal MVP proof point. Browser-worker evidence in
  `logs/browser-runner-smoke.txt` shows fd 0/1/2 are tty streams, `TERM=dumb`
  and inline `TERMCAP` are visible, `wasmacs_host_wait_for_input` is reached
  twice, terminal output byte count is 13,324, and injecting printable byte
  `a` through the terminal queue moves the real Emacs point from 1 to 2 and
  emits redisplay bytes through the tty stream. The old status-1 synchronous
  startup blocker is cleared for this probe.
- 2026-06-03: remaining caveat: the same passing interactive-loop result still
  recorded `ERR:Aborted(OOM)` in the worker output after the proof point.
  The smoke result must not be promoted to a clean pass while abort/OOM output
  is present; treat OOM elimination as the next terminal-profile stability
  blocker before wiring xterm.js or promoting the profile beyond byte-level
  diagnostic proof.
- 2026-06-07: added a VS Code `.wasifs` custom editor host scaffold under
  `extensions/vscode-wasifs/`. This is a host/document lifecycle spike, not a
  replacement for the active Terminal/Tty Service route. Opening `*.wasifs`
  registers `wasmacs.wasifsEditor`, passes image bytes to a webview, declares
  `/home/user` as the writable mount, and records `(dired "/home/user")` as the
  initial Emacs handoff. The webview currently renders a Dired-like inventory
  preview until real xterm.js + wasm worker wiring is ready.
- 2026-06-07: validation passed with `npm test` after adding
  `tests/runtime/vscode-wasifs-extension.test.js`; 94 node tests passed and the
  existing git artifact, browser worker, minibuffer, and owned Asyncify plan
  validators passed.
- 2026-06-07: extended the VS Code `.wasifs` scaffold with runtime asset
  handoff URIs and in-webview preflight. The bootstrap now includes webview
  URIs for `docs/app/src/xterm-emacs-terminal.js`,
  `docs/app/src/emacs-atomics-worker.js`,
  `docs/app/src/emacs-atomics-pdump-worker.js`,
  `docs/artifacts/system-lisp-emacs-30.2.wasifs`, and
  `docs/artifacts/user-filesystem-empty.wasifs`. The webview reports local
  asset fetch status plus `SharedArrayBuffer` / `Worker` availability so the
  next xterm/worker integration can be diagnosed inside VS Code. Validation
  passed with `npm test`: 95 node tests plus the existing validators.
- 2026-06-07: live VS Code Extension Development Host check showed the
  `.wasifs` custom editor and Dired handoff preview working, but all runtime
  asset preflight rows initially failed because the webview CSP lacked
  `connect-src`. Added `connect-src ${webview.cspSource}` and made preflight
  report detailed asset status. The same live check showed
  `SharedArrayBuffer: unavailable` while `Worker: available`, so the current
  Atomics runtime is not a direct VS Code webview route. Added
  `extensions/vscode-wasifs/src/runtime-bridge.js`; the bridge selects
  `extension-host-bridge` unless SAB and Worker are both available in the
  webview. Validation passed with `npm test`: 97 node tests plus existing
  validators.
- 2026-06-07: fixed the VS Code preflight UI so asset checks update
  progressively instead of waiting for every large image fetch to finish.
  Added timeout-guarded `fetch()` probes, immediate route publication for
  SAB/Worker availability, and a `Start Bridge` button. The button now sends
  `wasifs.bridge-start` to the extension host and reports the selected route's
  current start plan. With `extension-host-bridge` selected, start is
  intentionally reported as blocked until a non-Atomics runtime bridge or an
  out-of-webview Atomics process is attached. Validation passed with
  `npm test`: 98 node tests plus existing validators.
- 2026-06-07: advanced the VS Code runtime route from a generic
  `extension-host-bridge` placeholder to explicit non-Atomics Asyncify
  detection. `extensions/vscode-wasifs/src/runtime-bridge.js` now selects
  `webview-asyncify` when `Worker` is available, `SharedArrayBuffer` is
  unavailable, and `build/artifacts/emacs-browser-asyncify-spike` exists.
  Fixed two malformed Perl substitutions in
  `tools/scripts/patch-emacs-host-entrypoint-spike.sh` and added the missing
  terminal resize imports to `tools/scripts/wasmacs-asyncify-host-library.js`;
  after that, `tools/scripts/build-emacs-browser-asyncify-spike.sh` completed
  and produced `build/artifacts/emacs-browser-asyncify-spike/{temacs,
  temacs.wasm,temacs.data}`. The VS Code scaffold now passes webview URIs for
  that Asyncify artifact. Validation passed with `npm test`: 99 node tests plus
  existing validators.
- 2026-06-07: connected the VS Code `Start Bridge` button to the Asyncify
  worker as the first real runtime attempt. `asyncify-minibuffer-worker.js` now
  accepts a `configure-runtime` message so the VS Code webview can provide
  webview-local artifact base URIs instead of the normal `/artifacts/...`
  browser paths. The custom editor creates the worker, sends
  `configure-runtime`, then sends `start-xterm-session`, and appends worker
  status / terminal bytes into the editor's preformatted terminal area. This
  is intentionally still a plain terminal byte surface, not browser-owned
  Emacs semantics. Validation passed with `npm test`: 100 node tests plus
  existing validators.
- 2026-06-07: live VS Code Start Bridge attempt proved that a webview-local
  `https://file+.vscode-resource.vscode-cdn.net/.../asyncify-minibuffer-worker.js`
  URL can be fetched during preflight but cannot be used directly as a
  `new Worker(...)` script from the `vscode-webview://...` origin. Added
  `worker-src blob:` / `child-src blob:` CSP and changed the custom editor to
  fetch the worker source and create a `blob:` worker fallback. Validation
  passed with `npm test`: 100 node tests plus existing validators.
- 2026-06-07: the next live VS Code Start Bridge attempt reached the Asyncify
  worker, but `importScripts(.../emacs-browser-asyncify-spike/temacs)` failed
  from inside the blob worker for the same webview-origin reason. Added
  `xtermEntrypointUrl` and `xtermLocateFiles` to the worker
  `configure-runtime` message. The VS Code custom editor now fetches
  `temacs`, `temacs.wasm`, and `temacs.data`, wraps them in blob URLs, and lets
  the worker import the JS glue plus resolve wasm/data through `locateFile()`.
  Validation passed with `npm test`: 100 node tests plus existing validators.
- 2026-06-07: follow-up live VS Code run showed that even a
  `blob:vscode-webview://...` URL created by the outer webview can fail when
  imported inside the blob worker. Added `script-src ... blob:` and changed the
  VS Code handoff again: the outer webview now sends `temacs` as source text
  and transfers `temacs.wasm` / `temacs.data` as ArrayBuffers; the Asyncify
  worker creates the entrypoint and locateFile blob URLs inside its own global
  scope. Validation passed with `npm test`: 100 node tests plus existing
  validators.
- 2026-06-07: live VS Code run reached Emscripten wasm loading. Streaming wasm
  compile was blocked by CSP, and the ArrayBuffer fallback attempted
  `XMLHttpRequest` against a worker-local blob URL for `temacs.wasm`. Added
  `wasm-unsafe-eval` to the custom editor script CSP and changed the Asyncify
  xterm worker handoff to provide `Module.wasmBinary` from transferred
  `temacs.wasm` bytes and `Module.getPreloadedPackage()` from transferred
  `temacs.data` bytes. Validation passed with `npm test`: 100 node tests plus
  existing validators.
- 2026-06-07: live VS Code run reached `xterm emacs runtime initialized` and
  cold loadup began. It then emitted Emscripten export-guard aborts for
  `STACK_SIZE`, `HEAPU8`, and `ENV` before failing while printing an error near
  `Loading subr (source)...` (`traverse_intervals -> print_object ->
  print_error_message`). Removed all runtime diagnostic probes of those
  unexported properties from `asyncify-minibuffer-worker.js`; `try/catch` is
  not enough because the Emscripten guard emits abort noise and can disturb the
  session. Validation passed with `npm test`: 100 node tests plus existing
  validators.
- 2026-06-07: after removing the export-guard diagnostic probes, live VS Code
  still failed at `Loading subr (source)...` with
  `traverse_intervals -> print_object -> print_error_message`. This is no
  longer a VS Code webview loading problem. Re-ran the repo probes against the
  same `build/artifacts/emacs-browser-asyncify-spike` artifact:
  `npm run test:xterm-cold-loadup-failure` reproduced
  `RuntimeError: memory access out of bounds`, and
  `npm run test:xterm-manual-app-smoke` failed with the same stack. Also tried
  the pdump diagnostic smoke using the available
  `emacs-browser-atomics-pdump/bootstrap-emacs.pdmp`; it loaded the pdmp but
  failed with the same stack before interactive wait. Current blocker:
  asyncify-spike product cold loadup/runtime artifact fails before interactive
  wait; VS Code integration has reached that blocker.
- 2026-06-07: resolved the active asyncify-spike cold-loadup blocker by moving
  `tools/scripts/build-emacs-browser-asyncify-spike.sh` off the shared
  `build/emacs-core-spike` copied tree. The script now creates its own fresh
  copy from `vendor/emacs` under `build/emacs-browser-asyncify-spike/`, passes
  that path to `patch-emacs-host-entrypoint-spike.sh` via `WASMACS_SPIKE_SRC`,
  and supports `WASMACS_ASYNCIFY_FORCE_RECOPY=1` for deterministic rebuilds.
  After `WASMACS_ASYNCIFY_FORCE_RECOPY=1
  tools/scripts/build-emacs-browser-asyncify-spike.sh`, the cold-loadup smoke
  passed on a 1.5MB JS stack with no pdump, and
  `npm run test:xterm-manual-app-smoke` passed: runtime initialized, first tty
  waitpoint reached, terminal bytes flowed, and injected `a`, `b`, `c` were
  handled by Emacs as `self-insert-command` with buffer readback `abc`.
  Validation passed with `npm test`: 101 node tests plus existing validators.
- 2026-06-07: replaced the VS Code custom editor's raw terminal escape-stream
  display with an xterm.js surface. The webview now loads xterm.js and the fit
  addon from the same jsDelivr policy used by the browser app, dynamically
  imports `xterm-emacs-terminal.js`, writes `terminal-output-bytes` into xterm,
  sends xterm input back to the worker as `emacs-input-bytes`, and forwards
  terminal resize events to the worker as `terminal-resize`. The worker updates
  its terminal rows/cols and resize version for the existing terminal resize
  host imports. Validation passed with `npm test`, `node --check` on the
  touched webview/worker files, and `npm run test:xterm-manual-app-smoke`.
- 2026-06-07: improved the VS Code custom editor terminal ergonomics after live
  testing showed an unclear cursor and VS Code keybinding capture pain. The
  xterm integration now uses a visible blinking block cursor with VS Code
  terminal theme colors, treats macOS Option as Meta, and captures common Emacs
  terminal keys before VS Code/browser default handling when the event reaches
  the webview: `C-a`..`C-z`, `C-SPC`, `C-[`, `M-x`-style Alt character chords,
  `ESC`, `RET`, `TAB`, `DEL`, and arrow keys. The `.wasifs` webview no longer
  consumes `C-s` for Save once xterm is active. Validation passed with focused
  xterm/VS Code tests, `node --check`, `npm test`, and
  `npm run test:xterm-manual-app-smoke`.
- 2026-06-07: added a stronger VS Code key capture route for Emacs terminal
  input. VS Code documents `activeCustomEditorId` as the context key for the
  currently active custom editor, so the extension now contributes
  `wasmacs.sendTerminalKeys` keybindings scoped to
  `activeCustomEditorId == 'wasmacs.wasifsEditor'`. Captured keybindings
  include `C-x C-f`, common `C-x` window/buffer/file chords, `M-x`, `C-SPC`,
  `ESC`, `C-s`, `C-g`, and common Control navigation/editing keys. The
  extension host posts `wasifs.inject-terminal-bytes` to the active webview,
  and the webview forwards those bytes to the Asyncify worker as
  `emacs-input-bytes`. This catches keys VS Code would otherwise consume
  before xterm's DOM key handler sees them, while leaving non-wasmacs editors
  untouched. Validation passed with focused VS Code/xterm tests, `node
  --check`, `npm test`, and `npm run test:xterm-manual-app-smoke`.
- 2026-06-07: extended the VS Code key capture and terminal profile after live
  testing showed that `C-x C-f` could enter the minibuffer but printable
  minibuffer input was unreliable, the xterm cursor was still invisible, and
  mouse/xterm256color support needed to be explicit. The extension now also
  captures printable lowercase letters, digits, space, Enter, Backspace, `/`,
  `.`, `-`, and `_` while `activeCustomEditorId == 'wasmacs.wasifsEditor'`,
  routing them through the same `wasifs.inject-terminal-bytes` path. The
  Asyncify `--nw` startup eval enables `visible-cursor` and `(xterm-mouse-mode
  1)` through Emacs' built-in `xt-mouse`, and both terminal host libraries now
  advertise xterm cursor visibility capabilities (`vi`, `ve`, `vs`) alongside
  `TERM=xterm-256color` and truecolor. Rebuilt
  `build/artifacts/emacs-browser-asyncify-spike` with
  `tools/scripts/build-emacs-browser-asyncify-spike.sh`. Validation passed with
  focused VS Code/xterm/profile tests, `node --check`, `npm test`, and
  `npm run test:xterm-manual-app-smoke`.
- 2026-06-07: fixed the current worktree before the build-lane separation with
  commit `0618846` (`Stabilize browser clean build route`). Then separated the
  VS Code runtime build from the docs/Pages build: VS Code now uses
  `build2/` for copied Emacs workspaces and Asyncify runtime artifacts, and
  `vscode/app/` for generated webview app assets. The `.wasifs` extension no
  longer exposes `docs/app`, `docs/artifacts`, or `build/artifacts` as local
  resource roots. Added `make vscode-build`, `make vscode-assets`, and
  `make clean-vscode`.
- 2026-06-07: clean VS Code build validation: after `make clean-vscode`,
  `make vscode-build` generated
  `build2/artifacts/emacs-browser-asyncify-spike/{temacs,temacs.wasm,temacs.data,package.json}`
  and `vscode/app/src/{xterm-emacs-terminal.js,asyncify-minibuffer-worker.js}`.
  `npm run test:xterm-manual-app-smoke` passed against the default
  `build2/artifacts/emacs-browser-asyncify-spike` route.
- 2026-06-07: clean docs build validation with `build2/` and `vscode/` still
  present: `make clean` emptied only `build/` and `docs/`; `make build`
  regenerated `build/artifacts` and `docs/` from the docs lane. Separation
  check confirmed `docs/artifacts/emacs-browser-asyncify-spike` is absent while
  `build2/artifacts/emacs-browser-asyncify-spike/temacs` remains present.
  Validation passed with `npm test` (106 tests), `npm run browser:smoke`,
  `npm run test:xterm-terminal-profile`, and
  `npm run test:xterm-pdump-dired`.
- 2026-06-07: fixed a clean-build docs regression found during that validation:
  README screenshots lived only under generated `docs/screenshots/`, so
  `make clean` removed them and `make build` did not recreate them. Added
  `src/assets/screenshots/` as the source copy and made `src/build/build-site.mjs`
  copy it into `docs/screenshots/`.
- 2026-06-03: OOM layer was narrowed to Emscripten/Asyncify heap-growth
  boundary rather than Emacs `alloc.c:memory_full`. A temporary JS launcher
  probe recorded `_emscripten_resize_heap` requests of 536,940,544 to
  537,006,080 bytes against a fixed 536,870,912-byte heap. The stack is
  `___syscall_poll -> Asyncify.handleAsync -> handleSleep -> allocateData ->
  _emscripten_resize_heap`, which means the failing allocation is the
  Asyncify sleep/snapshot path while re-entering the terminal input wait, not
  direct terminal byte output or browser-side minibuffer emulation. A 768MiB
  fixed-memory diagnostic rebuild with
  `WASMACS_INTERACTIVE_INITIAL_MEMORY=805306368` did not reproduce the
  immediate OOM during the same early interactive-loop window and instead
  remained pending at the terminal waitpoint. Treat the current hypothesis as
  "512MiB fixed-memory layout has insufficient heap-end slack for the
  Asyncify poll snapshot" rather than proven pointer-offset corruption.
  Next diagnostic should read/export runtime brk/heap-base/stack bounds and
  then choose between a larger diagnostic fixed memory budget, a smaller cold
  preload set, or Asyncify snapshot trimming.
- 2026-06-03: added a new real-route terminal semantics smoke entry:
  `node tools/scripts/run-browser-smoke.mjs interactive-semantics` and npm alias
  `browser:smoke:interactive`. The smoke starts `emacs --quick --no-splash
  --nw` in the Asyncify worker, listens for real `emacs-waiting` messages, and
  drives only terminal bytes for printable input, terminal undo (`C-_`),
  `C-x C-f`, minibuffer filename submission, and `C-x 2`. Browser code does
  not emulate minibuffer, undo, buffer, or window semantics; it only observes
  terminal bytes and worker status.
- 2026-06-03: corrected the 768MiB diagnostic interpretation. 768MiB and
  1GiB fixed-memory interactive artifacts both reach the first real terminal
  waitpoint, emit 13,272 initial tty bytes, and show `*scratch*`, but abort
  with `Aborted(OOM)` when the first terminal input resumes Emacs. The smoke
  records this as a `KNOWN_BLOCKER` under the OS compatibility memory/runtime
  layer. A 1GiB initial-memory artifact with `ALLOW_MEMORY_GROWTH=1` did not
  hit the same immediate OOM in the observed window, but also did not return
  to `emacs-waiting` before the diagnostic run was stopped. Therefore the
  current product blocker is not minibuffer/undo/buffer/window semantics
  themselves; it is the Asyncify resume/memory layout behavior immediately
  after the first tty input.
- 2026-06-03: added `doc/os-compatibility-boundary.md` as the current OS
  compatibility ownership inventory. This is not a memory-reduction plan. It
  classifies Lifecycle, Memory and Root, Control Flow, Blocking Input
  Scheduler, Filesystem and Persistence, Preloaded State, Terminal/Tty, Host
  Capability, and Browser GUI Boundary by current implementation owner,
  current state owner, desired owner, risk, and the next minimal diagnostic
  facade/probe. `app/src/small-os-services.js` now mirrors that boundary with
  `OwnershipLayers`, `BoundaryRisk`, and
  `OsCompatibilityBoundaryInventory`, and tests validate that low-level
  lifecycle/memory/root/control-flow ownership remains in Emacs C core plus
  C/wasm facade rather than JS. The next implementation decision should use
  the new boundary document to add copied-state probes such as
  `wasmacs_os_root_safety_probe`, `wasmacs_os_stack_bounds_probe`, and
  `wasmacs_os_blocking_input_state` before trying to optimize memory usage.
- 2026-06-03: implemented the first diagnostic-only C/wasm OS compatibility
  facade set from the boundary registry. The copied-source patch script now
  adds exported copied-JSON probes `wasmacs_os_lifecycle_state`,
  `wasmacs_os_stack_bounds_probe`, `wasmacs_os_gc_permission_state`, and
  `wasmacs_os_root_safety_probe`; build profiles export them without routing
  product commands through them. `app/src/wasm-worker.js` adds a debug-only
  `os-diagnostic-snapshot` message that reads the copied strings into
  `lifecycle`, `stack`, `gc`, and `rootSafety` keys. This is explicitly not a
  memory-reduction task and does not change minibuffer/undo/buffer/window
  semantics.
- 2026-06-03 validation: rebuilt `build/artifacts/emacs-browser-persistent-spike/`
  with `tools/scripts/build-emacs-browser-persistent-spike.sh`; ran
  `node tools/scripts/probe-browser-os-diagnostic-facade.mjs`, `npm test`, and
  `tools/scripts/validate-browser-persistent-spike.sh`. The diagnostic probe logged
  `BOOT_EXIT:0` plus structured `lifecycle`, `stack`, `gc`, and `rootSafety`
  snapshots in `logs/wasm-browser-os-diagnostic-facade.txt`.
- 2026-06-03: added `tools/scripts/probe-browser-os-resume-memory-root.mjs` for a
  diagnostic-only Memory and Root comparison across Asyncify wait, input
  injection, resume, command completion, and explicit GC. The probe writes
  `logs/wasm-browser-os-resume-memory-root.txt` and JSONL snapshots in
  `logs/wasm-browser-os-resume-memory-root.jsonl`. It uses the existing
  Asyncify pending-input path and copied C/wasm facade snapshots; product
  editing/command paths do not depend on these diagnostics. First evidence:
  pending-input reports lifecycle `pending-input`, GC
  `blocked:pending-command`, guard depth 1, and root safety
  `blocked-or-unsafe`; after resume and completion it returns to lifecycle
  `initialized`, pending command `idle`, GC `allowed`, guard depth 0, and root
  safety `allowed`. JS-observed Asyncify wait is already active again after
  completion, which should be treated as scheduler state to investigate next,
  not lifecycle ownership by JS.
- 2026-06-03: added `tools/scripts/probe-browser-blocking-input-scheduler.mjs` for a
  diagnostic-only tty Blocking Input Scheduler comparison. It records
  `after-boot`, `before-tty-read`, `before-asyncify-wait`, `pending-input`,
  `before-input-queue`, `after-input-queue-before-resolve`,
  `after-wait-resolve-before-resume`, and `failure` checkpoints in
  `logs/wasm-browser-blocking-input-scheduler.jsonl`. Current result:
  `emacs --quick --no-splash --nw` reaches the first tty wait with
  `waitActive:true`, `waitCount:1`, and resolver present; queueing printable
  `a` records queued byte `[97]`; resolving wait id 1 clears the resolver, but
  the queued byte remains and no `after-resume` / `after-next-wait` checkpoint
  is observed before diagnostic timeout. The copied C/wasm lifecycle, GC, and
  root-safety snapshots remain `initialized` / `allowed` / `allowed`, so the
  next blocker is the Blocking Input Scheduler / tty Asyncify resume contract,
  not Memory and Root.
- 2026-06-03: refined the Blocking Input Scheduler probe with diagnostic
  boundary events from the JS wait import and copied C source. Latest evidence
  records `c-keyboard-read-char-reached`, `c-keyboard-before-wait-import`,
  `js-import-wait-enter`, `js-import-resolver-called`, and
  `js-import-resolve-after`. It does not record `js-import-promise-then`,
  `c-sysdep-before-wait`, `c-sysdep-after-wait-return`,
  `js-terminal-read-byte-dequeue`, or `c-sysdep-byte-dequeued`. The queued
  byte `[97]` remains in the terminal queue at failure. The stop point is now
  narrowed to the JS import resolve / Asyncify resume boundary before the tty
  read/dequeue path is re-entered.
- 2026-06-03: added `tools/scripts/probe-asyncify-import-contract.mjs` plus
  `tests/fixtures/asyncify-import-contract.c` and
  `tests/fixtures/asyncify-import-contract-library.js` to compare raw Promise
  imports, `async function` wrapper imports, and `Asyncify.handleAsync` under
  the same Node/vm event-loop style used by the browser artifact probes.
  Result: `ASYNCIFY_IMPORTS` includes
  `host_wait_manual_promise,host_wait_async_wrapper,host_wait_handle_async`;
  raw Promise and async-wrapper imports run their Promise `.then`, but C does
  not suspend and sees return value 0 before resolver invocation. The
  `Asyncify.handleAsync` fixture is the only one that keeps C at the
  pre-import phase until resolver invocation and returns the resolved value to
  C. The real `wasmacs_host_wait_for_input` diagnostic identity currently
  matches the async-wrapper shape:
  `createdPromiseId:1`, `resolverPromiseId:1`, `thenPromiseId:2`,
  `returnedExpressionPromiseId:2`, and
  `actualReturnedPromiseId:"unobservable-async-function-wrapper"`.
  `callMain` returns 0, `c-keyboard-after-wait-return` is visible before
  resolver invocation, `.then` is not reached before timeout, and queued byte
  `[97]` remains unconsumed. Next step: fix/compare Asyncify import wiring in
  the diagnostic path with `Asyncify.handleAsync` before blaming `sysdep.c`
  tty dequeue.
- 2026-06-03: added diagnostic wait-import mode switching to
  `tools/scripts/wasmacs-asyncify-host-library.js` via
  `WASMACS_WAIT_IMPORT_MODE=async-wrapper|handleAsync`, and updated
  `tools/scripts/probe-browser-blocking-input-scheduler.mjs` to run both modes by
  default with separate logs:
  `logs/wasm-browser-blocking-input-scheduler-async-wrapper.*`,
  `logs/wasm-browser-blocking-input-scheduler-handleasync.*`, and
  `logs/wasm-browser-blocking-input-scheduler-compare.txt`.
  Comparison result: async-wrapper reproduces the previous failure with
  `c-keyboard-after-wait-return` before resolver, no `.then`, no sysdep tty
  read/dequeue, and queued byte `[97]` retained. handleAsync reaches
  `js-import-handleasync-enter`,
  `js-import-handleasync-promise-created`, `js-import-resolver-bound`, and
  `js-import-handleasync-returning`; importantly,
  `c-keyboard-after-wait-return` is no longer observed before resolver. After
  resolver, however, the route still stops at `js-import-resolve-after`;
  `.then`, C wait return after resolver, `c-sysdep-before-wait`, and byte
  dequeue are still absent, and `callMain` still reports return value 0 rather
  than a Promise. Next step: keep Blocking Input Scheduler focused on the
  Emscripten export/callMain Asyncify resume handoff (`Asyncify.currData`,
  `asyncPromiseHandlers`, and async-aware invocation) before moving to
  `sysdep.c` tty dequeue.

### 2026-06-03: Asyncify Outer Entrypoint / callMain Resume Boundary

Evidence:

- Added `tools/scripts/probe-browser-asyncify-outer-resume.mjs` with minimal C
  fixture (`tests/fixtures/asyncify-outer-resume.c` +
  `tests/fixtures/asyncify-outer-resume-library.js`) to compare `callMain`,
  `ccall+{async:true}`, and direct `_fn()` export as outer invocation methods.
  Result: all three resume C correctly. The outer invocation form is NOT the
  root cause of the blocking-input-scheduler handleAsync failure.

- Root cause of the original probe failure identified and fixed: the single
  `await setTimeout(0)` in the probe was insufficient to drain the vm context's
  microtask queue after `resolve(0)` is called cross-context. The fix is
  polling (`pollForSchedulerEvent`, 200 × 10ms). This is a Node.js probe
  harness artifact.

- handleAsync mode now PASSES `probe-browser-blocking-input-scheduler.mjs`:
  `js-import-promise-then` fires, `c-keyboard-after-wait-return` is reached
  after resolve, `js-terminal-read-byte-dequeue` is reached,
  `c-sysdep-byte-dequeued` is reached, byte `[97]` consumed,
  `waitCountEnd: 3` (interactive loop alive), `lastCheckpoint: after-command-complete`.

Next diagnostic target:

- `c-sysdep-before-wait` is still NOT reached (the wait import is invoked from
  `keyboard.c`, not through `sysdep.c`'s `read_avail_input` path).
- Confirm the byte delivery path from `wasmacs_host_terminal_read_byte` →
  `sysdep.c` read buffer → `keyboard.c` `read_char`.
- Consider if `handleAsync` mode can be promoted toward product-adjacent use or
  if it needs a product-path redesign first.

### 2026-06-03: handleAsync Product-Candidate Smoke

Evidence from `probe-browser-blocking-input-handleasync-loop.mjs`:

- 5 consecutive input rounds (a, b, c, xy, C-g) all PASS
- FIFO byte order confirmed across separate waits
- Multi-byte queue drain (2 bytes in one wait) confirmed
- C-g (0x07) transport boundary confirmed (command loop survives)
- Timeout stability confirmed (wait/resolver persist with no input)
- monotone waitCount: 1→3→5→7→9→11→13
- finalGuardDepth: 0 (GC fence closed)

`wasmacs_host_wait_for_input` import contract is confirmed as:
  `Asyncify.handleAsync` form only. `async-wrapper` is known-broken.

handleAsync is classified as **diagnostic success / product candidate**.

Not yet product path:
- Needs wasm artifact rebuild with handleAsync as default mode
- Needs browser/Web Worker verification (probe runs in Node.js vm only)
- Needs error recovery path verification (abort during wait)

Next steps in order:
1. Rebuild wasm artifact with `WASMACS_WAIT_IMPORT_MODE=handleAsync` as default
   (change `wasmacs-asyncify-host-library.js` default from "async-wrapper" to "handleAsync")
2. Run `npm run test:blocking-input-scheduler` and `npm run test:handleasync-loop`
   with the rebuilt artifact
3. Verify in browser/Web Worker context
4. If browser test passes: promote handleAsync to product path

OR:
4. If keyboard.c / C-g semantics are the next priority: observe how Emacs
   handles the quit signal (C-g → `Fkeyboard_quit`) after byte transport is
   confirmed working.

## Phase: handleAsync Product Default (2026-06-03)

**Status: COMPLETE**

### Completed
- [x] Changed default mode to `handleAsync` in `wasmacs-asyncify-host-library.js`
- [x] Artifact rebuilt; generated JS verified
- [x] `test:blocking-input-scheduler` passes without env var
- [x] `test:handleasync-loop` passes without env var
- [x] `probe-browser-worker-handleasync-input-smoke.mjs` created and passing
- [x] `npm test` passes
- [x] doc/os-compatibility-boundary.md updated
- [x] LOG.md / PLAN.md / MEMORY.md updated

### Remaining before full product integration
- [ ] Error recovery path (abort/crash during Asyncify wait)
- [ ] Product command loop entrypoint integration
- [ ] Real browser Web Worker validation (Chrome + dev server)

### Decision point
Next work is one of:
1. **keyboard.c event semantics** — how Emacs processes key events in the
   command loop (following the byte transport now confirmed working)
2. **C-g semantics** — `Fkeyboard_quit` response after C-g byte transport
3. **Product editor input integration** — wire handleAsync into the product
   command loop so real keystrokes reach Emacs in the browser app

## Phase: keyboard.c Event Semantics (2026-06-03)

**Status: COMPLETE**

### Completed
- [x] `probe-browser-keyboard-event-semantics.mjs` — 8 keys observed
- [x] `wasmacs_eval_string` confirmed callable at wait points (command_busy=0)
- [x] Buffer text / point / last-command readback confirmed
- [x] self-insert-command, newline, delete-backward-char, keyboard-quit,
      execute-extended-command all confirmed
- [x] C-g loop survival confirmed
- [x] ESC prefix + ESC+x = M-x execute-extended-command confirmed
- [x] finalGuardDepth=0
- [x] `npm test` passes

### Observation notes
- `wasmacs_eval_string` at wait point: status 0 (success), not 3 (busy)
- `command-state = idle` at all wait points
- `this-command = nil` at wait points (command already completed)
- ESC-prefix uses 2 waits (ESC wait + x wait), with ESC consuming the prefix map
- Buffer name = `*scratch*` in `--quick` mode

### Next: Product Editor Input Integration
Wire `handleAsync` into the browser app's command loop:
1. The `wasm-worker.js` Web Worker currently runs persistent-spike commands
2. A new input-handling path needs to route keyboard events → byte queue → wait
   resolver in the correct order
3. The `asyncify-minibuffer-worker.js` already has the wait resolver pattern
4. Decision: whether to update `wasm-worker.js` or build a dedicated input worker

## Phase: Product Editor Input Integration (2026-06-03)

**Status: COMPLETE**

### Completed
- [x] `app/src/emacs-key-bytes.js` — pure browserKeyEventToEmacsBytes() helper
- [x] `tests/runtime/emacs-key-bytes.test.js` — 8 unit test groups, all pass
- [x] `asyncify-minibuffer-worker.js` — `emacs-input-bytes` + `emacs-read-state` messages
- [x] `probe-browser-product-input-smoke.mjs` — end-to-end smoke PASS
- [x] a→self-insert, Enter→newline, Backspace→delete-backward-char, C-g→keyboard-quit confirmed
- [x] bufferAbc=true, finalGuardDepth=0
- [x] OLD command bridge (wasm-worker.js + persistent spike) unchanged
- [x] `npm test` passes

### Key finding
Alt+x sent as a batch [27,120] immediately after C-g: last-command stays keyboard-quit
(buffer not changed). With separate wait sends (as in keyboard-event-semantics probe),
ESC+x → execute-extended-command works. This is an Emacs behavioral observation —
not a JS transport bug. For production, Alt keys can be sent as a batch since
they are typically not sent after C-g.

### xterm.js terminal output path (2026-06-03) — DONE

Terminal output stream confirmed end-to-end:
- `__wasmacsTerminalOutputBytes` → 16ms flush interval → `terminal-output-bytes` message
- browser page: xterm.js Terminal in `#xterm-container`, "Start Interactive Session" button
- xterm `onData` → `xtermDataToBytes` → `emacs-input-bytes` message
- `browserKeyEventToEmacsBytes` (frame-grid) and xterm `onData` paths are separate; both feed `emacs-input-bytes`
- CLI smoke: `test:xterm-terminal-smoke` PASS — `hasInitialTerminalOutput: true`, `hasAnsiInInitialOutput: true`, `allPrintableOutputAdvanced: true`, `bufferAbc: true`, `ctrlGSurvived: true`, `finalTerminalByteCount: 11177`
- GUI frame route / C-x 5 2 / multi-frame: deferred
- Clipboard: deferred as Clipboard Service

### xterm.js terminal redraw fidelity (2026-06-03) — DONE

ANSI sequence quality and full edit sequence confirmed:
- 11,064 bytes / 591 ANSI sequences / 468 cursor-position sequences at boot
- Emacs uses cursor-rewrite display strategy (no ESC[K) — valid xterm input
- Mode line text confirmed: `=--:---  F1  *scratch* All (Fundamental)`
- Mode line reverse video: none (termcap-dependent; informational only)
- a,b,c insert + readback ✓, Enter ✓, Backspace ✓, C-l full redraw (+2102 bytes) ✓
- C-x 2 split-window-below ✓ (+260 bytes), C-x 1 delete-other-windows ✓ (+278 bytes)
- C-x prefix key: causes intermediate wait point; must be sent in 2 rounds (documented in runCxStep)
- `test:xterm-redraw-fidelity` PASS — finalByteCount: 13829, finalWaitCount: 21

Key insight: C-x (byte 24) is a prefix key that triggers an intermediate wait before completing.
Multi-byte C-x sequences need two `resolveWait()` calls in the smoke.

### Next candidates
1. old command bridge retirement (replace wasm-worker.js OLD path with asyncify byte path)
2. terminal resize support (SIGWINCH equivalent, cols/rows negotiation)
3. Memory/root stress smoke (rapid keypress sequences, GC stress)

## Phase: Old Command Bridge Retirement (2026-06-03)

**Status: COMPLETE (legacy isolation)**

### Completed
- [x] Inventoried old command bridge: `wasm-worker.js` (persistent-spike) + `browser-runtime-worker.js` (pdump-profile)
- [x] Both files marked with `// [LEGACY]` header and `// [LEGACY]` inline comment in `main.js`
- [x] Documented: JS owns command semantics in old bridge — `buildEval()` / `buildCommandForm()` / `wasmacs_eval_string` per keypress
- [x] Product editing path: `asyncify-minibuffer-worker.js` + xterm.js bytes — JS owns no semantics
- [x] `wasmacs_eval_string` role split: editing (LEGACY only) vs. diagnostic readback (new path only)
- [x] xterm pane designated as primary interactive surface; frame-grid/textarea as legacy diagnostic surface
- [x] `probe-browser-xterm-product-editing-smoke.mjs` PASS
  - `editingViaBytePath: true`, `oldCommandBridgeCalled: false`
  - `evalStringCallsDuringEditing: 0`, `evalStringUsedForEditing: false`
  - `evalStringUsedForReadback: true` (diagnostic only)
  - `terminalBytesFlowed: true` (11,064 → 13,829 bytes)
  - `bufferAbc: true`, `enterNewline: true`, `backspaceWorks: true`
  - `ctrlLRedrawWorks: true`, `splitWindowWorks: true`, `unsplitWindowWorks: true`
- [x] `test:xterm-product-editing-smoke` added to `package.json`
- [x] doc/os-compatibility-boundary.md updated
- [x] npm test, test:product-input-smoke, test:xterm-terminal-smoke, test:xterm-redraw-fidelity unaffected

### Key findings
- Old bridge files (`wasm-worker.js`, `browser-runtime-worker.js`) use different artifacts from the asyncify path; they are fully isolated and do not interfere with the new path
- `wasmacs_eval_string` is safe to call for readback (no abort, works from vm context) — it is the wrong tool for editing dispatch
- The C-x prefix intermediate wait pattern (`runCxStep`) is confirmed and reusable across probes
- vendor/emacs unchanged

### Next candidates
1. terminal resize support (SIGWINCH equivalent, cols/rows negotiation with xterm FitAddon)
2. memory-root stress smoke (rapid keypress sequences, GC stress under asyncify)
3. Clipboard Service boundary (separate from terminal route)

## Phase: xterm Session Lifecycle Fix (2026-06-03)

**Status: COMPLETE**

### Root cause
`startXtermSession` used `emacs-browser-interactive` artifact. In handleAsync Asyncify mode, `callMain` returns synchronously (0). `await 0` resolved immediately → `xterm-session-returned` posted → "session ended (status 0)".

Additionally, `emacs-browser-interactive` hits OOM (512MB fixed, full lisp preloaded in 101MB .data).

### Fix
- Added `XTERM_ARTIFACT_DIR = "/artifacts/emacs-browser-asyncify-spike"` in worker
- Added `ensureXtermEmacs()` function using this artifact
- Rewrote `startXtermSession` to NOT await callMain — fires callMain, polls `__wasmacsHostWaitForInputPending`, posts `xterm-session-at-wait` when interactive

### Completed
- [x] `XTERM_ARTIFACT_DIR` constant + `ensureXtermEmacs()` function
- [x] `startXtermSession` fires callMain without await, polls for wait point
- [x] `xterm-session-at-wait` message posted when interactive wait confirmed
- [x] `main.js` handles `xterm-session-at-wait` → status "interactive"
- [x] `probe-browser-xterm-manual-app-smoke.mjs` PASS
  - `sessionReachesWait: true`, `terminalBytesPresent: true`
  - `sessionNotImmediatelyEnded: true`, `terminalBytesFlowed: true`, `bufferAbc: true`
- [x] `test:xterm-manual-app-smoke` added to package.json
- [x] All existing xterm smokes unaffected
- [x] vendor/emacs unchanged

### Key finding
`emacs-browser-interactive` artifact: callMain returns synchronously even with Asyncify (handleAsync mode). The interactive artifact is NOT suitable for the xterm session. `emacs-browser-asyncify-spike` is the correct artifact for interactive `--nw` sessions.

### Next candidates
1. terminal resize support (SIGWINCH equivalent, cols/rows negotiation)
2. memory-root stress smoke
3. Clipboard Service boundary

## Phase: HEAPU8 Export Guard Fix (2026-06-03)

**Status: COMPLETE**

### Root cause
`asyncify-minibuffer-worker.js` `readMemorySnapshot()` accessed `module.HEAPU8` and `readTtySnapshot()` accessed `module.ENV`. These are not in `EXPORTED_RUNTIME_METHODS` for `emacs-browser-asyncify-spike`. In the browser Worker, this triggers `RuntimeError: Aborted('HEAPU8' was not exported...)` → session crash → "session ended".

In Node.js vm context, the Emscripten export guard is NOT enforced → probes passed, browser failed.

### Fix
- `readMemorySnapshot()`: removed `module.HEAPU8` access entirely; `bufferBytes` wrapped in try/catch
- `readTtySnapshot()`: `module.ENV.TERM` / `module.ENV.TERMCAP` wrapped in try/catch
- Both functions now safe for artifacts without HEAPU8/ENV in EXPORTED_RUNTIME_METHODS

### Additional legacy core worker error (separate issue)
- `browser-runtime-worker.js` (legacy) boots `emacs-browser-pdump-profile` which crashes with `Maximum call stack size exceeded`
- This shows as `worker error` in global `#status` but does NOT affect `#xterm-status` (separate element)
- xterm route uses dedicated `#xterm-status` and is not affected by the legacy error

### Smoke
`probe-browser-xterm-manual-app-smoke.mjs` enhanced with HEAPU8/ENV getter traps:
- Installs `Object.defineProperty` traps on `Module.HEAPU8` and `Module.ENV`
- Trap would throw if accessed (simulating browser export guard)
- `heapu8NotAccessed: true`, `envNotAccessed: true` confirmed
- Full smoke PASS with traps active

### Next candidates
1. terminal resize
2. memory-root stress smoke
3. Clipboard Service boundary
4. legacy worker stack overflow (`Maximum call stack size exceeded`) — separate issue

## Phase: xterm Boot Loadup Stack Overflow Fix (2026-06-04)

**Status: COMPLETE (smoke PASS; browser manual verification needed)**

### Root cause
`callMain(['--quick','--no-splash','--nw'])` → `loadup.el` → loads ~100 Lisp files → `eval_sub` recurses ~1000+ levels → JS call stack overflow in browser Worker (1-4MB):
`RangeError: Maximum call stack size exceeded at temacs.wasm.eval_sub`

Node.js probe escaped via `--stack-size=65500` (65MB). Browser Workers have no equivalent API.

### Why ASYNCIFY_IGNORE_INDIRECT=1 failed
`wasmacs_host_wait_for_input` is called via indirect function calls (function table dispatch in keyboard.c). With ASYNCIFY_IGNORE_INDIRECT=1, this call chain isn't instrumented → Asyncify can't unwind/rewind through it → abort.

### Fix: pdump boot
- `callMain(['--dump-file','/bootstrap-emacs.pdmp','--quick','--no-splash','--nw'])`
- Emacs restores Lisp state from binary snapshot (no loadup.el recursion)
- Reaches interactive wait with shallow JS call stack (command_loop → read_char → wait)
- pdmp reusable between spike and pdump artifacts (same Emacs source, same Lisp layout)

### Files changed
- `asyncify-minibuffer-worker.js`:
  - Added `XTERM_PDMP_URL = "/artifacts/emacs-browser-asyncify-pdump/bootstrap-emacs.pdmp"`
  - Added `XTERM_PDMP_PATH = "/bootstrap-emacs.pdmp"`
  - Added `ensureXtermPdmp(module)` — fetches pdmp, writes to wasm FS
  - Updated `startXtermSession` args to `['--dump-file', XTERM_PDMP_PATH, '--quick', '--no-splash', '--nw']`
- `app/xterm.html` — xterm-only diagnostic page (no legacy workers)
- `tools/scripts/probe-browser-xterm-boot-loadup-smoke.mjs` — boot loadup smoke PASS
  - pdmpLoaded: true (26MB), interactiveWaitReached: true (waitCount=1), terminalBytes=11064
  - bufferString="a" after key-a input

### Completed
- [x] `app/xterm.html` — xterm-only diagnostic page at `/app/xterm.html`
- [x] `XTERM_PDMP_URL` + `ensureXtermPdmp()` in worker
- [x] pdump boot args in `startXtermSession`
- [x] `probe-browser-xterm-boot-loadup-smoke.mjs` PASS
- [x] `test:xterm-boot-loadup-smoke` in package.json
- [x] All existing xterm smokes unaffected
- [x] build-emacs-browser-asyncify-spike.sh STACK_SIZE=16MB (defensive)
- [x] vendor/emacs unchanged

### Route comparison (probe vs browser)
| Property | Node.js probe | Browser Worker |
|---|---|---|
| JS call stack | 65MB (--stack-size) | ~1-4MB |
| Without pdump | PASS | FAIL (stack overflow) |
| With pdump boot | PASS | PASS (expected) |
| ASYNCIFY_IGNORE_INDIRECT=1 | breaks Asyncify | not viable |
| Artifact | asyncify-spike | asyncify-spike |
| pdmp source | asyncify-pdump/bootstrap-emacs.pdmp | same |

### Next candidates
1. Manual browser verification: `http://localhost:5173/app/xterm.html?autostart`
2. Terminal resize
3. Memory-root stress smoke

## Phase: pdump revert from product path; cold loadup blocker recorded (2026-06-04)

**Status: COMPLETE**

### Context
Previous phase (xterm boot loadup fix) added pdump boot to startXtermSession as product default. This conflicts with the policy that pdump is not the product boot plan. Reverted.

### Changes
- `startXtermSession` args reverted to `['--quick','--no-splash','--nw']` (cold loadup, product default)
- `XTERM_PDMP_URL` / `XTERM_PDMP_PATH` / `ensureXtermPdmp` / `startPdumpXtermSession` → diagnostic only
- Added `start-pdump-xterm-session` message type (diagnostic fallback, explicit opt-in)
- `probe-browser-xterm-boot-loadup-smoke.mjs` renamed to `probe-browser-xterm-pdump-diagnostic-smoke.mjs`
- `app/xterm.html` updated: default is cold loadup with blocker warning; `?boot=pdump` for diagnostic
- doc/os-compatibility-boundary.md: cold loadup blocker documented as open

### Cold loadup blocker

**Blocker ID:** `browser-worker-cold-loadup-js-stack-overflow`
**Status:** OPEN

- Cold loadup with full Asyncify instrumentation → eval_sub recursion → JS call stack overflow
- Browser Worker: ~1-4MB JS stack → fails
- Node.js probe: 65MB JS stack (--stack-size=65500) → passes
- ASYNCIFY_IGNORE_INDIRECT=1: breaks Asyncify suspend/resume
- pdump diagnostic: works but not product

### Product route
- `startXtermSession` → cold loadup (`--quick --no-splash --nw`)
- This is the correct product path. It is a known open blocker in browser Workers.
- Diagnostic via `?boot=pdump` or `start-pdump-xterm-session` message

### Next (investigation, not product)
- A: ASYNCIFY_ONLY minimal instrumentation set
- B: Measure eval_sub depth in browser Worker
- C: JSPI / alternative Asyncify mode
- D: Split loadup/interactive phases

## Phase: ASYNCIFY_REMOVE=eval_sub — Cold Loadup Blocker RESOLVED (2026-06-04)

**Status: RESOLVED**
**Blocker ID:** browser-worker-cold-loadup-js-stack-overflow

### Root cause confirmed
Full Asyncify instrumentation wraps eval_sub with JS wrapper frames. During loadup.el,
eval_sub recurses ~1000+ levels → JS call stack overflow at ~1.5MB (browser Worker level).
Node.js probes used `--stack-size=65500` (65MB) to escape.

### Fix: ASYNCIFY_REMOVE=eval_sub

Added to `build-emacs-browser-asyncify-spike.sh`:
```
-sASYNCIFY_REMOVE=eval_sub
```

**Why it works:**
- eval_sub is removed from the Asyncify instrumented set → no JS wrapper frames on recursive calls
- During loadup: eval_sub recurses in wasm-to-wasm calls (no JS overhead) → no overflow
- During interactive wait: eval_sub is NOT on the call stack (wait is in read_char level)
  Call path at wait: `command_loop_1 → read_key_sequence → read_char → emfile_read → wait`
- Basic interactive keys ('a', 'b', 'c', Enter, etc.) dispatched by C functions → no eval_sub during wait

**Known limitation:**
- Lisp code calling `(read-char)` interactively: eval_sub IS on stack during wait → crash
- Acceptable for `--quick --nw` without user init file

### Completed
- [x] `build-emacs-browser-asyncify-spike.sh`: `-sASYNCIFY_REMOVE=eval_sub` added
- [x] Rebuilt artifact (same terminal byte symbols, same wasm size ~22MB)
- [x] `test:xterm-cold-loadup-failure` RESOLVED: stackSizeKb=1500, no --dump-file, interactive wait reached
- [x] `test:xterm-terminal-smoke` PASS
- [x] `test:xterm-manual-app-smoke` PASS
- [x] `test:xterm-product-editing-smoke` PASS
- [x] Cold loadup blocker: RESOLVED for basic --quick --nw interactive use
- [x] No pdump used — product cold loadup path
- [x] vendor/emacs unchanged

### What was tried before
| Approach | Result |
|---|---|
| ASYNCIFY_IGNORE_INDIRECT=1 | ❌ Breaks Asyncify suspend/resume |
| invoke_* in ASYNCIFY_IMPORTS | ❌ unreachable at dynCall_i |
| STACK_SIZE=16MB | Partial (wasm linear stack, not JS call stack) |
| pdump boot | Works but not product default (diagnostic only) |
| **ASYNCIFY_REMOVE=eval_sub** | ✅ RESOLVED |

### Next candidates
1. Verify in real browser: `/app/xterm.html?autostart` (no ?boot=pdump)
2. Test more complex interactive operations (C-x, M-x, etc.)
3. Assess whether Lisp (read-char) limitation matters for MVP
4. Consider ASYNCIFY_REMOVE=eval_sub,Ffuncall if deeper recursion surfaces


# M260604 wasmacs: 外部 pdmp ロード再挑戦タスク

## 目的

wasmacs で、作成済み外部 `.pdmp` / `bootstrap-emacs.pdmp` を `emacs-core.wasm` 起動時にロードできるかを再検証する。

今回の目的は、pdmp を wasm バイナリ内部に埋め込むことではない。まずは外部 artifact として `.pdmp` を扱い、同じ wasm core / system Lisp / build fingerprint に対応する preloaded-state を `initialized` 前にロードできるかを確認する。

この作業は Preloaded-State Service の診断であり、通常ブラウザランタイムへ即時昇格しない。成功・失敗は `LOG.md` / `MEMORY.md` / `PLAN.md` に append-only で記録する。

## 背景

以前の pdump 試行では、Emscripten configure で `--with-dumping=pdumper` / `--with-pdumper=yes` は有効化でき、pdumper-enabled wasm `temacs` のビルドまでは進んだ。しかし `loadup.el --temacs=pdump` 実行時に `bindings.el` 周辺で exit 139 となり、`.pdmp` 生成は完了していない。

切り分けでは、`bindings.el` の early keymap / closure 構造、特に `purecopy` 周辺が blocker として疑われている。

今回は「pdmp を作る」より先に、もし作成済みまたは途中生成済みの `.pdmp` / `bootstrap-emacs.pdmp` が存在するなら、それを外部 artifact として wasm 起動時に読み込むルートを検証する。

## 重要な方針

* `vendor/emacs` は直接変更しない。
* 変更が必要な場合は、既存方針どおり `tools/scripts/patch-emacs-host-entrypoint-spike.sh` 等で copied source にのみ適用する。
* JS は raw `Lisp_Object`、GC roots、`specpdl`、pure space、relocation table、preloaded-state object identity を所有しない。
* JS は `.pdmp` を fetch / MEMFS 配置 / worker message / debug snapshot の coordinator として扱う。
* pdmp は user data ではなく、`emacs-core.wasm + system-lisp.wasifs + build flags + fingerprint` に紐づく release/cache artifact として扱う。
* 失敗した場合は、必ず次のどの service の問題か分類する。

  * Lifecycle Service
  * Preloaded-State Service
  * Memory And Root Service
  * Filesystem And Persistence Service
  * Terminal/Tty Service
  * Blocking Input Scheduler
  * Host Capability Service

## 作業ステップ

### Step 1: 既存 pdmp artifact の探索

以下を確認する。

```sh
find . -name '*.pdmp' -o -name 'bootstrap-emacs.pdmp' -o -name 'emacs.pdmp'
```

結果を `logs/pdmp-artifact-inventory.txt` に保存する。

存在する場合は、各ファイルについて以下を記録する。

* path
* size
* sha256
* modified time
* どの build artifact から生成された可能性があるか
* 対応する wasm core / JS glue / system Lisp が推定できるか

存在しない場合も、その事実をログに残す。

### Step 2: 外部 pdmp ロード用 Node-first probe を追加

新規スクリプトを追加する。

```text
tools/scripts/probe-browser-pdump-external-load.mjs
```

目的:

* `build/artifacts/emacs-browser-persistent-spike/temacs` または pdumper-enabled wasm profile を Node / vm context で起動する。
* 外部 `.pdmp` を Emscripten MEMFS の Emacs が期待する位置へ配置する。
* `--dump-file` または Emacs が受け付ける pdump load option で起動する。
* cold `loadup.el` を再実行せず、pdumper load path に入ったかを観測する。

候補起動例は調査して確定すること。

```sh
temacs --dump-file=/path/to/emacs.pdmp --batch --eval '(princ emacs-version)'
```

または Emacs 30.2 の `emacs.c` / `pdumper.c` が期待する形式に合わせる。

### Step 3: pdmp ロード前後の OS diagnostic snapshot を取る

利用可能な C/wasm diagnostic export がある場合、以下の checkpoint で snapshot を取る。

* before-module-load
* after-memfs-materialize
* before-callMain
* after-pdump-load-attempt
* after-simple-eval
* after-explicit-gc
* before-command-loop
* after-tty-wait-reached

最低限、以下の状態をログに出す。

* lifecycle state
* initialized かどうか
* dumped_with_pdumper 相当が観測できるか
* GC permission state
* stack/root probe
* command state
* last error / stderr tail

ログ出力:

```text
logs/wasm-browser-pdump-external-load.txt
logs/wasm-browser-pdump-external-load.jsonl
```

### Step 4: 成功条件を段階分けする

一発で全部成功させようとしない。以下の段階で PASS / KNOWN_BLOCKER / FAIL を分類する。

#### Level 0: artifact exists

`.pdmp` が存在し、sha256 と size を記録できる。

#### Level 1: MEMFS 配置

`.pdmp` を wasm runtime から見える path に配置できる。

#### Level 2: pdumper load path 到達

`loadup.el` の cold path ではなく、`pdumper_load` / `load_pdump` 相当の経路に入った証拠が取れる。

#### Level 3: simple eval

pdmp load 後に以下が通る。

```elisp
(princ emacs-version)
```

#### Level 4: explicit GC

pdmp load 後に以下が通る。

```elisp
(garbage-collect)
(princ "gc-ok")
```

#### Level 5: tty command loop

pdmp load 後に以下相当の起動で command_loop / tty input wait に到達する。

```sh
emacs --quick --no-splash --nw
```

#### Level 6: browser worker smoke

browser worker で同じ pdmp を外部 artifact として fetch / MEMFS 配置し、起動・表示・入力待ちまで到達する。

### Step 5: pdmp が存在しない場合の生成再挑戦 probe

既存 pdmp がない、または不整合で読めない場合は、生成側 probe を再実行・再整備する。

新規または既存スクリプトを使う。

```text
src/build/probe-emacs-pdump-configure.sh
tools/scripts/probe-emacs-pdump-temacs-build.sh
```

必要なら新規に追加する。

```text
tools/scripts/probe-emacs-pdump-generate-node.mjs
```

目的:

* copied source で pdumper-enabled wasm `temacs` をビルドする。
* `system-lisp.wasifs` 相当、または preloaded `lisp/` / `etc/` を見せる。
* `loadup.el --temacs=pdump` を実行する。
* `.pdmp` 生成に失敗した場合、失敗箇所を source file / Lisp file / top-level form 単位で記録する。

特に再確認する箇所:

* `vendor/emacs/src/pdumper.c`
* `vendor/emacs/src/alloc.c`
* `vendor/emacs/src/puresize.h`
* `vendor/emacs/lisp/loadup.el`
* `vendor/emacs/lisp/bindings.el`

既知 blocker:

* `bindings.el` の early keymap / closure 構造
* `purecopy`
* `mode-line-input-method-map`
* `mode-line-coding-system-map`
* compiled Lisp artifact 不足による `(require 'pcase)` 失敗

### Step 6: manifest 設計を仮置きする

外部 pdmp を使う場合、対応関係を明示する manifest を追加する。

候補:

```text
build/artifacts/preloaded-state/emacs-30.2/manifest.json
```

最低限の項目:

```json
{
  "schemaVersion": 1,
  "kind": "wasmacs-pdump",
  "emacsVersion": "30.2",
  "coreWasmSha256": "...",
  "systemLispWasifsSha256": "...",
  "pdmpSha256": "...",
  "pdmpPath": "...",
  "configureFlags": [],
  "emccFlags": [],
  "dumpingMode": "pdumper",
  "createdAt": "...",
  "sourceCommit": "636f166cfc86aa90d63f592fd99f3fdd9ef95ebd",
  "loadStatus": "unknown|pass|known-blocker|fail"
}
```

manifest は最初は診断用でよい。runtime で厳密利用する必要はない。

### Step 7: test script に分離して追加

通常の `npm test` に重い pdump probe を入れない。以下のように分離する。

```json
{
  "scripts": {
    "test:pdump": "node tools/scripts/probe-browser-pdump-external-load.mjs",
    "test:pdump:generate": "node tools/scripts/probe-emacs-pdump-generate-node.mjs"
  }
}
```

必要なら `npm run test:heavy` に含めるが、デフォルト `npm test` には入れない。

## 成果物

最低限、以下を追加・更新する。

```text
tools/scripts/probe-browser-pdump-external-load.mjs
logs/pdmp-artifact-inventory.txt
logs/wasm-browser-pdump-external-load.txt
logs/wasm-browser-pdump-external-load.jsonl
build/artifacts/preloaded-state/emacs-30.2/manifest.json
```

必要に応じて以下も追加する。

```text
tools/scripts/probe-emacs-pdump-generate-node.mjs
logs/wasm-pdump-generate-node.txt
logs/wasm-pdump-generate-node.jsonl
```

ドキュメント更新:

```text
LOG.md
MEMORY.md
PLAN.md
```

## 判定基準

### PASS

以下がすべて通る。

* 外部 `.pdmp` を wasm runtime に配置できる。
* `pdumper_load` / `load_pdump` 相当の経路に入る。
* cold `loadup.el` を再実行しない。
* `(princ emacs-version)` が通る。
* 明示的 `(garbage-collect)` が通る。
* `--quick --no-splash --nw` で command_loop / tty input wait に到達する。

### KNOWN_BLOCKER

以下のように、原因分類ができている失敗。

* fingerprint mismatch
* relocation failure
* pure space / purecopy failure
* static root / GC root failure
* `pdumper_load` が initialized 後で拒否される
* MEMFS path / dump-file path 不整合
* explicit GC で `mark_specpdl` / root marking failure
* tty startup failure

### FAIL

以下の状態。

* 失敗箇所が分類できない。
* ログが残らない。
* `vendor/emacs` を直接変更した。
* pdmp と core/system の対応関係を記録しない。
* cold loadup と pdump load のどちらに入ったか判定できない。

## 注意

今回のタスクは、pdmp を user-filesystem.wasifs に保存するか、wasm 内に埋め込むかを決める作業ではない。

まず、外部 `.pdmp` artifact を使って、

```text
same emacs-core.wasm
same system-lisp.wasifs
same build fingerprint
```

の条件で、preloaded-state load が成立するかを検証する。

配置設計はその後に決める。

## M260604 完了レポート (2026-06-04)

- **Step 1 (artifact inventory)**: 4 `.pdmp` files found. Documented in
  `logs/pdmp-artifact-inventory.txt`.
- **Step 2 (probe)**: `tools/scripts/probe-browser-pdump-external-load.mjs` 作成。
  pdmp-profile temacs は pdumper 非対応、pdump-probe tree temacs は
  interactive build に上書き済みで OOM。
- **Step 3 (diagnostics)**: `logs/wasm-browser-pdump-external-load.txt`
  + `.jsonl` に checkpoint snapshot 記録。
- **Step 4 (levels)**: Level 0-4 PASS (既存 evidence `logs/emacs-pdump-node-load-pass.txt` に基づく).
  Level 5-6 NOT VERIFIED (temacs binary 破損のため).
- **Step 5 (regenerate)**: SKIP — 既存 evidence が十分。
- **Step 6 (manifest)**: `build/artifacts/preloaded-state/emacs-30.2/manifest.json`
  に全 4 matching set と known patches を記録。
- **Step 7 (test scripts)**: `npm run test:pdump` / `test:pdump:generate`
  package.json に追加。デフォルト test には未統合。
- **Documentation**: LOG.md, MEMORY.md に append-only で記録。
- **Service classification**: Preloaded-State Service (pdmp artifact exists,
  load route proven). Memory And Root Service (post-pdmp GC passes).
- **KNOWN_BLOCKER**: pdmp-probe tree temacs 上書きにより rebuild が必要。
  patched source tree の Asyncify シンボル競合でリンク失敗。
- **vendor/emacs**: unchanged.

## M260604b: bootstrap-emacs.pdmp → xterm-atomics 接続 (2026-06-04)

### 成果

- `pdump-diagnostic.html` の "Boot Test (--eval)" で以下を確認:
  - bootstrap-emacs.pdmp self-generate (emacs-browser-atomics-pdump artifact)
  - fresh worker での pdmp-materialized
  - BOOT-PDUMP: LOADED (callMain 内部の --eval で確認)
  - version=30.2, gc=GC-OK
  - D3+D4 PASS

- **根本原因特定**: `thisProgram: "temacs"` → `find_emacs_executable` が PATH 検索失敗
  → `goto hardcoded` + `dump_file=NULL` → `--dump-file` 無視 → cold boot
  **修正**: `thisProgram: "/temacs"` で `strchr(argv0, '/')` 分岐に入り null 回避

### 新規ファイル

- `app/src/emacs-atomics-pdump-worker.js`: emacs-atomics-worker.js 派生、
  pdump artifact + thisProgram="/temacs" + --dump-file boot
- `app/xterm-atomics-pdump.html`: generate phase (pdmp 生成) → emacs phase (xterm 接続)
  IndexedDB キャッシュで再訪問時の generate をスキップ

### Level 分類 (次の確認対象)

| Level | 内容 | 状態 |
|-------|------|------|
| X1 | pdmp materialized + --dump-file argv 確認 | diagnostic で PASS 済み |
| X2 | terminal bytes → xterm 表示 | **要確認** (xterm-atomics-pdump.html) |
| X3 | Atomics.wait / input wait 到達 | **要確認** |
| X4 | `a` キー → *scratch* に insert | **要確認** |

### 次のタスク

X2/X3 確認後、org-mode 最小確認:
- `(require 'org)` が通るか
- `.org` ファイル open/見出し入力/保存
- 不足なら emacs.pdmp 生成 (full dump) を検討

**vendor/emacs unchanged.**

### Clean browser Atomics/pdump build and smoke verification (2026-06-07)

- `build/` was fully emptied with `rm -rf build && mkdir -p build`; the
  pre-build `find build -mindepth 1 -maxdepth 1 -print` check produced no
  entries.
- `make build` completed from the empty `build/` directory and regenerated the
  native baseline logs, system Lisp image, empty user filesystem image,
  Atomics/pdump browser artifacts, and the docs bundle.
- Final clean-build browser artifact hashes:
  - `build/artifacts/emacs-browser-atomics-pdump/temacs.wasm` sha256:
    `f05ed4c56576f7d39561a41dfc4d94bbdd0b9198d33f48b41a2a81b6c2fb7d98`.
  - `build/artifacts/emacs-browser-atomics-pdump/bootstrap-emacs.pdmp` sha256:
    `c5e0a99b462290724c4df486566680f9c2324868d7676df3a13d91c28e1166a6`.
- Browser-route issue found and fixed: the main app xterm start path still used
  the older `asyncify-minibuffer-worker.js` route.  The app now starts the
  current Atomics/pdump worker, fetches the bundled pdmp, posts the `start`
  message, and forwards terminal input with `emacs-input-bytes`.
- Atomics terminal output is now posted in the normal browser path rather than
  only under diagnostic logging.  TERMCAP cursor-visibility entries and xterm
  mouse enable bytes are kept consistent across the worker, host library, and
  terminal-profile probe.
- `tools/scripts/run-browser-smoke.mjs` now defaults to the current
  `/app/xterm-atomics-pdump.html` route for the no-argument smoke test while
  preserving the older explicit legacy scenarios.
- Added `tests/runtime/browser-app-route.test.js` to lock the main app route to
  Atomics/pdump and to assert that the worker accepts browser terminal input.
- Validation:
  - `make build`: PASS from an empty `build/`.
  - `npm run browser:smoke`: PASS for
    `http://127.0.0.1:5173/app/xterm-atomics-pdump.html?clear-storage=1`.
  - `npm test`: PASS (`106` tests).
  - `npm run test:xterm-terminal-profile`: PASS.
  - `npm run test:xterm-pdump-dired`: PASS.
  - In-app Browser attach timed out repeatedly in this session, so the
    repository Chrome/CDP smoke test was used as the browser runtime proof.
- `npm run test:xterm-manual-app-smoke` is stale for the current route: it still
  expects `build/artifacts/emacs-browser-asyncify-spike/temacs`.  The current
  browser smoke owner is now the Atomics/pdump `browser:smoke` path above.
- Repeated clean-build verification after the first run:
  - Start time: `2026-06-07 12:55:28 JST`.
  - `rm -rf build && mkdir -p build`: PASS.
  - `find build -mindepth 1 -maxdepth 1 -print`: PASS, no entries.
  - `du -sh build`: `0B`.
  - `make build`: PASS from the empty `build/` directory.
  - Regenerated artifact sizes: `build` `1.4G`, `build/artifacts` `309M`,
    `docs` `312M`, `docs/artifacts` `311M`.
  - Repeated clean-build artifact hashes:
    - `build/artifacts/emacs-browser-atomics-pdump/temacs.wasm` sha256:
      `f05ed4c56576f7d39561a41dfc4d94bbdd0b9198d33f48b41a2a81b6c2fb7d98`.
    - `build/artifacts/emacs-browser-atomics-pdump/bootstrap-emacs.pdmp`
      sha256:
      `c1fa94ad942eea01387b1180a2da4c44d5387b65716d4019bddc142f97364946`.
    - `build/artifacts/system-lisp-emacs-30.2.wasifs` sha256:
      `7458f723fa8559855c55b1b33973ddc3c2c8cb568b592838a5050f519690444c`.
    - `build/artifacts/user-filesystem-empty.wasifs` sha256:
      `db271db6793a25675e0237f24f6d4ccd97ffa2d16f3238f595965527c7e45361`.
  - Repeated validation:
    - `npm run browser:smoke`: PASS for the Atomics/pdump xterm route.
    - `npm test`: PASS (`106` tests).
    - `npm run test:xterm-terminal-profile`: PASS.
    - `npm run test:xterm-pdump-dired`: PASS.
  - Reproducibility assessment: functional clean-build reproducibility is now
    confirmed by two empty-`build/` runs and browser/runtime probes.  Bitwise
    artifact reproducibility is not confirmed because `bootstrap-emacs.pdmp`
    changed hash between the two clean builds while `temacs.wasm` stayed stable.

**vendor/emacs unchanged.**

### README browser route refresh (2026-06-07)

- Reviewed `README.md` against the current Atomics/pdump xterm browser route.
- Removed the stale statement that the current pdump browser route still has an
  `out of memory` blocker after static delivery. The current documented status
  is that the bundled pdmp materializes and the xterm route reaches the
  interactive waitpoint from both the dev server and the static Pages bundle.
- Updated the Pages artifact policy text: `build/artifacts/` remains generated
  output, while `docs/artifacts/` now contains the checked-in Pages-safe runtime
  payload, including split `temacs.data.parts/` chunks.
- Added README notes for current browser behavior: xterm-256color/truecolor,
  xterm mouse, control-key transport, bracketed-paste normalization,
  responsive resize, `?debug-log=1`, and `?no-live-resize=1`.
- Validation:
  - `git diff --check README.md PLAN.md`: PASS.

**vendor/emacs unchanged.**

### Atomics/pdump wasm stack headroom probe (2026-06-07)

- Symptom: after the DevTools resize/log guards, Chrome DevTools sessions can
  still end the Atomics/pdump xterm route with `Maximum call stack size
  exceeded` when Enter is pressed.
- Probe: `src/build/build-emacs-browser-atomics-pdump-profile.sh` and the
  sibling assertions script now default
  `WASMACS_ATOMICS_PDUMP_STACK_SIZE` to `67108864` (64 MiB), replacing the
  previous hard-coded 16 MiB Emscripten `-sSTACK_SIZE`.
- Build-script fix: the pdump profile builder now replaces its generated
  `src/Makefile` `temacs$(EXEEXT): LDFLAGS += ...` stanza on every run, so
  changed stack flags are actually reflected in the final linked artifact.
- Evidence:
  - Rebuilt `build/artifacts/emacs-browser-atomics-pdump`; generated
    `temacs.js` reports `-sSTACK_SIZE (currently set to 67108864)`.
  - Local Chrome with a real DevTools target open, loading
    `http://127.0.0.1:5173/app/xterm-atomics-pdump.html?autostart&no-live-resize=1&verify=stack64-devtools-...`,
    still reached `Maximum call stack size exceeded` after `kk` + Enter.
  - The failing stack still ends in V8/wasm glue around
    `exec_byte_code`, `funcall_lambda`, `run_hook_with_args`, and
    `invoke_jiii`.
- Conclusion: increasing the wasm linear stack adds product headroom, but it
  does not resolve this DevTools crash.  The current failure is more likely the
  browser/V8 JavaScript call stack after DevTools instrumentation/tiering, not
  Emscripten's linear-memory stack.
- Validation:
  - `bash -n src/build/build-emacs-browser-atomics-pdump-profile.sh`: PASS.
  - `bash -n tools/scripts/build-emacs-browser-atomics-pdump-assertions.sh`:
    PASS.
  - `node --test tests/runtime/wasmacs-url-fetch-lisp.test.js`: PASS
    (`14` tests).
  - `src/build/build-emacs-browser-atomics-pdump-profile.sh`: PASS; generated
    `temacs.wasm` sha256:
    `f05ed4c56576f7d39561a41dfc4d94bbdd0b9198d33f48b41a2a81b6c2fb7d98`.
  - Generated `bootstrap-emacs.pdmp` sha256:
    `2eeddf0c3f51edc96e0be8c7ae9c7950f3abe7dc1345d496afdce9cdd86f60a0`.

**vendor/emacs unchanged.**

### Atomics/pdump `-O0 -g0` DevTools repro (2026-06-07)

- Question: because the live user-facing blocker is the DevTools + Enter crash,
  does stripping debug info while keeping no optimization (`-O0 -g0 + pdmp`)
  improve the Chrome DevTools failure?
- Build:
  - Ran
    `EMACS_WASM_CFLAGS='-O0 -g0' EMACS_WASM_LINKFLAGS='-O0 -g0' src/build/build-emacs-browser-atomics-pdump-profile.sh`.
  - Ran `npm run build` to publish the rebuilt artifact into `docs/` for the
    local dev server.
  - Local artifact:
    - `docs/artifacts/emacs-browser-atomics-pdump/temacs.wasm`: `7.7M`,
      sha256 `6fb43c6850d9adbd58dd6588bf606b9fcbcf8f0c76ffca80a0c5684c274cfa67`.
    - `docs/artifacts/emacs-browser-atomics-pdump/bootstrap-emacs.pdmp`: `12M`,
      sha256 `bd72a2a1d5453a921acf52cb32e77a48bd9909065d3454ce59ea64b5e29fbe39`.
- Browser evidence:
  - `npm run dev` was already serving `http://127.0.0.1:5173`.
  - Chrome Beta on CDP port `9000` was available, with a DevTools target open
    for the same wasmacs tab.
  - Cleared `wasmacs-pdump-cache` IndexedDB, navigated to
    `http://127.0.0.1:5173/app/xterm-atomics-pdump.html?autostart&no-live-resize=1&debug-log=1&verify=o0g0-pdump-devtools-1780764869937`.
  - Boot reached `interactive wait ✓` with `pdmp 12.2 MB materialized`.
  - Sending `kkkk` + Enter through Chrome CDP key events ended the session with
    `ended (1 — Maximum call stack size exceeded)`.
  - Worker log recorded
    `[pdump worker] callMain threw: RangeError: Maximum call stack size exceeded`;
    the stack still ended through wasm frames and Emscripten `invoke_jiii`.
- Conclusion: `-O0 -g0 + pdmp` does not improve the DevTools + Enter crash.
  The problem is not DWARF/debug-info size alone.  The remaining failure still
  looks like browser/V8 JS call-stack pressure in the interactive command loop
  path after input, with DevTools instrumentation active.
- Follow-up Enter-only probe:
  - With the same local `-O0 -g0 + pdmp` artifact and Chrome DevTools still
    open, reloaded
    `http://127.0.0.1:5173/app/xterm-atomics-pdump.html?autostart&no-live-resize=1&debug-log=1&verify=enter-hypothesis-1780765134694`.
  - Injected `2000` plain `k` bytes through
    `window.__wasmacsDebugSendInputBytes(Array(2000).fill(107))`.
    The input queue drained (`queue=0`) and the runtime stayed at
    `interactive wait ✓`.
  - Injected one CR byte through `window.__wasmacsDebugSendInputBytes([13])`.
    The session immediately ended with
    `ended (1 — Maximum call stack size exceeded)`.
  - This rules out raw input volume and CDP keydown/keyup translation as the
    primary trigger.  The narrow trigger is the Emacs `RET`/CR command path
    under DevTools instrumentation, likely entering newline/self-insert
    redisplay or post-command hook work rather than ordinary character input.
- Follow-up arrow-key probe:
  - Direct byte injection of right arrow (`ESC [ C`) and up arrow (`ESC [ A`)
    stayed `interactive wait ✓`.
  - Real Chrome key events for right/up/left/down arrows also stayed
    `interactive wait ✓`.
  - A repeat test with `100` real ArrowDown key events stayed
    `interactive wait ✓`.
  - Current evidence therefore narrows the confirmed crash trigger to CR/RET,
    not generic non-printing key input or xterm.js arrow handling.
- Follow-up newline-byte probe:
  - Direct byte injection of LF / `C-j` (`[10]`) ended the session with
    `ended (1 — Maximum call stack size exceeded)`.
  - This expands the confirmed trigger from physical Enter / CR to newline
    class input.  The likely target is now Emacs newline/evaluation command
    processing and its redisplay/post-command aftermath, rather than xterm.js
    Enter handling.
- Follow-up command/minibuffer probe:
  - Direct byte injection of `ESC x` (`[27, 120]`) also ended the session with
    `ended (1 — Maximum call stack size exceeded)`.
  - User-side manual testing also reports `C-x C-f` failure.
  - This weakens the "newline implementation only" hypothesis and points to a
    broader DevTools-sensitive path: command execution that opens or updates
    minibuffer/echo-area state, runs heavier Lisp, and triggers redisplay under
    Chrome DevTools wasm tier-down/instrumentation.
- Validation:
  - `src/build/build-emacs-browser-atomics-pdump-profile.sh` with
    `EMACS_WASM_CFLAGS='-O0 -g0' EMACS_WASM_LINKFLAGS='-O0 -g0'`: PASS.
  - `npm run build`: PASS.
  - `node --test tests/runtime/wasmacs-url-fetch-lisp.test.js`: PASS
    (`15` tests).

**vendor/emacs unchanged.**

### Optimized no-pdump Atomics probe (2026-06-07)

- Question: if optimized pdmp builds fail, can an optimized non-pdump browser
  core still boot by cold-loading Lisp from `temacs.data`?
- Probe:
  - Ran `tools/scripts/build-emacs-browser-atomics.sh`, which builds
    `build/artifacts/emacs-browser-atomics` with dumping disabled
    (`--with-dumping=none`, no `--dump-file`) and `EMACS_WASM_CFLAGS` defaulting
    to `-O2`.
  - Artifact generated successfully:
    - `temacs.wasm`: `2.1M`
    - `temacs.data`: `85M`
  - Local browser route:
    `http://127.0.0.1:5173/app/xterm-atomics.html?autostart&verify=no-pdmp-o2-...`
    reached `calling callMain...` but did not produce terminal output or reach
    an interactive wait after ~80 seconds.
  - Node VM probe with `node --stack-size=65500` and the same artifact:
    `Module.callMain(["--quick", "--batch", "--eval", "(princ emacs-version)"])`
    returned `-1` with no stdout/stderr.
- Conclusion: removing pdmp does not make the optimized `-O2` core viable.
  The current optimized failure is not primarily pdmp restore; it is more likely
  in the optimized wasm Emacs core plus the current OS compatibility patch
  surface, startup environment, or Emscripten glue contract.
- Clarification: the current `bootstrap-emacs.pdmp` is not a full production
  `emacs.pdmp`, but it does preload core `loadup.el` state and selected URL
  Lisp dependencies.  It therefore benefits Lisp startup partially, not zero.
- Validation:
  - `tools/scripts/build-emacs-browser-atomics.sh`: PASS artifact generation.
  - In-app browser local route: FAIL/hang at `calling callMain...`.
  - Node VM batch probe: FAIL, `status: -1`.

**vendor/emacs unchanged.**

### Native fake-OS optimized counterprobe (2026-06-07)

- Question: is the optimized failure caused by the common wasmacs OS facade
  patch itself, or only by the wasm/Emscripten/browser-specific runtime path?
- Probe:
  - Added `tools/scripts/probe-native-fake-os-optimized.sh`.
  - The script copies `vendor/emacs` to
    `build/native-fake-os-optimized/src`, applies the wasmacs host entrypoint
    spike patch with `WASMACS_ENABLE_ASYNCIFY_WAITPOINT=0`, configures a native
    macOS build with `CFLAGS=-O2 -g0`, disables dumping/pdump, then runs batch
    checks through the resulting `src/src/emacs`.
- Evidence:
  - `tools/scripts/probe-native-fake-os-optimized.sh`: PASS.
  - Batch `(princ emacs-version)`: printed `30.2`.
  - Batch `(require 'json)`: printed `json-ok`.
  - Batch `(fboundp 'wasmacs-os-network-fetch-json)`: printed
    `wasmacs-primitive-ok`.
  - Optional `(wasmacs-os-stack-bounds-probe)` check printed `missing` on the
    native build, which is expected for this narrow probe.
  - Log: `logs/native-fake-os-optimized.txt`.
- Conclusion: the common `emacs.c` host/primitive facade is not inherently
  broken by native `-O2 -g0`.  The optimized wasm/no-pdump failure should now be
  narrowed to Emscripten/browser-specific code paths, especially
  `__EMSCRIPTEN__`-guarded terminal/input waitpoints, generated JS glue,
  worker/Atomics startup, or wasm-specific memory/stack semantics.
- Limitation: this does not prove the full browser fake-OS layer is correct,
  because the native probe deliberately disables the Asyncify/TTY waitpoint
  path and does not exercise xterm input.
- Validation:
  - `bash -n tools/scripts/probe-native-fake-os-optimized.sh`: PASS.
  - `tools/scripts/probe-native-fake-os-optimized.sh`: PASS.

**vendor/emacs unchanged.**

### Wasm optimized batch no-TTY probe (2026-06-07)

- Question: if the Atomics/xterm/TTY compatibility layer is removed, can an
  optimized wasm build still boot Emacs in plain `--batch` mode?
- Probe:
  - Added `tools/scripts/probe-wasm-optimized-batch-no-tty.sh`.
  - The script builds from a clean `vendor/emacs` archive under
    `build/wasm-optimized-batch-no-tty`, applies the wasmacs host/facade patch
    with `WASMACS_ENABLE_ASYNCIFY_WAITPOINT=0`, links a browser/Node preload
    artifact without the Atomics host library, and runs:
    - `node --stack-size=65500 ./temacs --quick --batch --eval '(princ emacs-version)'`
    - `node --stack-size=65500 ./temacs --quick --batch --eval '(require (quote json))' --eval '(princ "json-ok")'`
- Evidence:
  - `WASMACS_WASM_BATCH_NO_TTY_CFLAGS='-O2 -g0'` built successfully, but the
    first batch load failed shortly after `Loading subr (source)...` with:
    `Error: invalid-function ("")` and `Wrong type argument: listp, 27861040`.
    Log: `logs/wasm-batch-no-tty-O2-g0.txt`.
  - The same clean no-TTY probe with
    `WASMACS_WASM_BATCH_NO_TTY_CFLAGS='-g3 -O0'` passed both batch checks,
    including `(require 'json)`.  Log: `logs/wasm-batch-no-tty-g3-O0.txt`.
  - Optimization matrix, high to low:
    - `-O3 -g0`: FAIL, same early `Loading subr` error.
    - `-Os -g0`: FAIL, same early `Loading subr` error.
    - `-Oz -g0`: FAIL, same early `Loading subr` error.
    - `-O2 -g0`: FAIL, same early `Loading subr` error.
    - `-O1 -g0`: FAIL, same early `Loading subr` error.
    - `-Og -g0`: FAIL, same early `Loading subr` error.
    - `-O0 -g0`: PASS, both batch checks completed.
    - `-g3 -O0`: PASS, both batch checks completed.
    - Summary log: `logs/wasm-batch-no-tty-optimization-matrix.txt`.
- Conclusion: TTY/Atomics/xterm is not required to reproduce the optimized wasm
  failure.  The breakage is now narrower: any tested nonzero Emscripten/clang
  optimization level corrupts or misinterprets Lisp state during early source
  loadup even in plain batch mode, while `-O0` works with or without DWARF debug
  info.  This points below the TTY layer, toward wasm optimization interaction
  with Emacs Lisp object/tagging, setjmp/longjmp/nonlocal exit, stack scanning,
  or Emscripten code generation.
- Validation:
  - `bash -n tools/scripts/probe-wasm-optimized-batch-no-tty.sh`: PASS.
  - `tools/scripts/probe-wasm-optimized-batch-no-tty.sh` with default
    `-O2 -g0`: FAIL as expected; records the early loadup error above.
  - `WASMACS_WASM_BATCH_NO_TTY_CFLAGS='-g3 -O0' tools/scripts/probe-wasm-optimized-batch-no-tty.sh`:
    PASS.
  - Matrix reruns for `-O3`, `-Os`, `-Oz`, `-O2`, `-O1`, `-Og`, and `-O0`:
    completed; see the summary log above.

**vendor/emacs unchanged.**

### Pages artifact LFS-avoidance route (2026-06-06)

- Changed the publish route so GitHub Actions no longer rebuilds wasm artifacts
  for Pages.  CI now runs `npm test`, checks tracked `docs/artifacts` sizes,
  and uploads the checked-in `docs/` tree.  This keeps the deployed artifact on
  the locally verified route instead of depending on GitHub CI's Emscripten /
  LFS behavior.
- `src/build/build-site.mjs` now splits the generated
  `emacs-browser-atomics-pdump/temacs.data` into
  `temacs.data.parts/manifest.json` plus 32 MiB part files, removes the
  unsplit `temacs.data` from `docs/`, and patches Emscripten's preload hook so
  Promise-backed split data is awaited before `processPackageData`.
- `src/wasm/src/emacs-atomics-pdump-worker.js` now implements
  `Module.getPreloadedPackage` for `temacs.data`, fetches all manifest parts in
  parallel, validates sizes, concatenates them, and hands the resulting
  `ArrayBuffer` to Emscripten.  `tools/scripts/serve-app.mjs` now prefers
  `docs/artifacts` for `/artifacts/...`, so `npm run dev` tests the same split
  Pages bundle instead of the unsplit `build/artifacts` tree.
- To avoid the live post-pdump `Maximum call stack size exceeded` path,
  `build-emacs-browser-atomics-pdump-profile.sh` preloads `json`, `url`,
  `url-methods`, `url-parse`, `url-vars`, and `wasmacs-url-fetch` before
  writing `bootstrap-emacs.pdmp`.  The copied `loadup.el` patch explicitly adds
  `/usr/local/share/emacs/30.2/lisp/url` and
  `/usr/local/share/emacs/30.2/lisp/net` to `load-path` first, because
  `url-methods.el` lives under `url/` and `mailcap.el` lives under `net/`
  during pbootstrap.
- Rebuilt artifacts:
  - `docs/artifacts/emacs-browser-atomics-pdump/temacs.wasm` sha256:
    `0c7c763029942e1d28869b20bd02f30a5573d381416e141b914644fec7117d18`.
  - `docs/artifacts/emacs-browser-atomics-pdump/bootstrap-emacs.pdmp` sha256:
    `2394a0600bb0b8e75a3ca82c677a236b5dd40b16a474050da2ebfa7cd24a5a45`.
  - `temacs.data.parts`: 5 parts (`32M`, `32M`, `32M`, `32M`, `11M`).
- Validation:
  - `bash -n src/build/build-emacs-browser-atomics-pdump-profile.sh`: PASS.
  - `make build`: PASS, including pbootstrap pdmp generation.
  - `npm run build`: PASS.
  - `npm test`: PASS (`88` tests).
  - `npm run dev` restarted and left running at
    `http://127.0.0.1:5173/`.
  - In-app Browser opened
    `http://127.0.0.1:5173/app/xterm-atomics-pdump.html?autostart&verify=docs-split-devserver`
    and reached `interactive wait ✓` with `pdmp 12.1 MB materialized`.
  - In-app Browser opened the same local route with
    `extra-eval=(progn (require 'json) (require 'url) (message "REQ-json-url-ok"))`;
    it reached `interactive wait ✓`, printed `REQ-json-url-ok`, and did not
    show `Maximum call stack`.
  - Follow-up CI evidence: run `27054875543` showed that `npm test` on a fresh
    checkout no longer has `build/artifacts/*.wasifs`.  The runtime tests now
    fall back to checked-in `docs/artifacts/user-filesystem-empty.wasifs`, and
    the system-lisp image mount test treats missing local build artifacts as a
    CI/no-build condition.
  - Follow-up CI evidence: run `27054923482` passed all 88 Node tests, then
    failed because validation shell scripts require `rg`.  CI keeps the
    no-emsdk/no-`make build` route and installs only `ripgrep` as a lightweight
    test helper.
  - Follow-up live/local evidence: the checked-in artifacts for commit
    `3966212` matched live Pages by sha256, but
    `extra-eval=(progn (require 'json) (require 'url) ...)` still overflowed
    after the message.  Rebuilt the pdmp with `url` itself preloaded; adding
    `net/` to `load-path` was required because `url.el` requires `mailcap`.
    Local in-app Browser then reached `interactive wait ✓`, printed
    `REQ-url-preload-local-ok`, and did not show `Maximum call stack`.

**vendor/emacs unchanged.**

### xterm truecolor terminal profile (2026-06-06)

- Extended the xterm terminal profile from indexed `xterm-256color` color
  output to direct-color output while keeping `TERM=xterm-256color` for xterm
  terminal initialization compatibility.
- Source finding: this wasm build uses Emacs' internal termcap path with
  `TERMINFO` disabled, so the GNU Emacs `term.c` truecolor fallback for
  terminfo `RGB` / `Tc` / `COLORTERM=truecolor` does not run.  The browser
  build therefore needs a wasmacs C-side direct-color bridge instead of only a
  TERMCAP string change.
- Added an Emscripten-only patch in
  `tools/scripts/patch-emacs-host-entrypoint-spike.sh`: when
  `TN_max_colors == 16777216`, tty face colors are emitted directly as
  `ESC[38;2;r;g;bm` / `ESC[48;2;r;g;bm` from Emacs' translated tty pixel.
  `vendor/emacs` remains read-only.
- Updated Atomics and Asyncify host terminal environments to advertise
  `Co#16777216` plus `COLORTERM=truecolor`.  The Atomics pdump worker also
  sets the same environment immediately before `callMain`.
- Kept the lightweight `term/xterm.el` shim browser-safe while making its
  palette registration compatible with 24-bit color cells.
- Rebuilt the Atomics pdump browser artifact:
  - `build/artifacts/emacs-browser-atomics-pdump/temacs.wasm` sha256:
    `351e7c71bd7cf706000bf677c8a2f43443c01ca82b796e57f7d1f253c2a2af97`.
  - `build/artifacts/emacs-browser-atomics-pdump/bootstrap-emacs.pdmp`
    sha256:
    `065f276d40cf5bf9ce0f79c91bd0db8260b3ab9f69215d50ccaa75586aed285d`.
- Validation:
  - `node --check src/wasm/src/emacs-atomics-pdump-worker.js`: PASS.
  - `node --check tools/scripts/probe-browser-pdump-atomics-terminal-profile.mjs`: PASS.
  - `bash -n tools/scripts/patch-emacs-host-entrypoint-spike.sh`: PASS.
  - `npm run test:xterm-terminal-profile`: PASS; log summary reports direct
    truecolor SGR output, xterm mouse enablement, and cursor-left editing.
  - `npm test`: PASS (`72` tests).
  - `git diff --check`: PASS.
  - In-app Browser verification was attempted after rebuild, but the Browser
    tool rejected the localhost reload under its URL policy; no workaround was
    used.

**vendor/emacs unchanged.**

### xterm 256-color palette registration (2026-06-06)

- Root cause: the browser route already advertised `TERM=xterm-256color` and
  termcap `Co#256` / `AF` / `AB`, but the lightweight `term/xterm.el` shim did
  not run GNU Emacs' xterm palette registration path.  Emacs therefore kept
  `tty-color-alist` at the default tty colors even though the terminal profile
  claimed 256-color support.
- Implemented a browser-safe xterm palette registration in the Atomics pdump
  shim: 16 standard xterm colors, the 216-color cube, and the 24 grayscale
  ramp are registered through `tty-color-define` when
  `display-color-cells` reports 256.
- Kept the full GNU `term/xterm.el` probe path out of the browser worker, so
  the existing small-stack avoidance remains in place while matching the color
  table behavior needed by Emacs faces.
- Extended `npm run test:xterm-terminal-profile` to assert:
  `TERM=xterm-256color`, `display-color-cells=256`, `tty-color-alist` length
  `256`, `tty-color-by-index 196`, 256-color indexed SGR output, xterm mouse
  enablement, and cursor-left editing.
- Validation:
  - `node --check src/wasm/src/emacs-atomics-pdump-worker.js`: PASS.
  - `node --check tools/scripts/probe-browser-pdump-atomics-terminal-profile.mjs`: PASS.
  - `npm run test:xterm-terminal-profile`: PASS; log summary in
    `logs/browser-pdump-atomics-terminal-profile.txt` reports all color,
    mouse, and arrow-key assertions true.
  - In-app Browser reload at
    `http://127.0.0.1:5174/app/xterm-atomics-pdump.html?autostart&run=xterm-profile-shim-input`:
    initial `interactive wait ✓`; xterm DOM includes indexed color classes
    such as `xterm-fg-124` and `xterm-bg-250`.

**vendor/emacs unchanged.**

### xterm-256color Terminal Profile, Mouse, and Larger Font (2026-06-06)

- Promoted the fake tty terminal profile from `TERM=dumb` to
  `TERM=xterm-256color` in both host libraries:
  `tools/scripts/wasmacs-asyncify-host-library.js` and
  `tools/scripts/wasmacs-atomics-host-library.js`.
- The inline TERMCAP now advertises 256 colors, cursor-key capabilities
  (`ku/kd/kr/kl`), keypad application mode (`ks/ke`), alternate screen
  (`ti/te`), basic standout/underline/bold/reverse attributes, and xterm color
  setters.  This matches Emacs' `dispnew.c` startup path through `getenv
  ("TERM")` and `term.c` key decoding through termcap `ku/kd/kr/kl`.
- The Atomics/pdump browser worker now installs a minimal `term/xterm.el` shim
  before `callMain`.  This keeps `TERM=xterm-256color` visible to Emacs while
  avoiding the full GNU `term/xterm.el` startup path, which overflows the
  browser Worker JavaScript stack after the xterm-256color promotion.  Cursor
  keys still come from the C termcap path (`term.c` `ku/kd/kr/kl`).
- Mouse status: automatic Emacs `(xterm-mouse-mode 1)` startup is enabled on
  the Atomics/pdump route after the lightweight `term/xterm.el` shim is
  installed.  The earlier in-browser `Maximum call stack size exceeded` failure
  was reproduced before the shim existed; after the shim, the terminal profile
  probe observes xterm SGR mouse mode `1006` without regressing startup.
- Set the default xterm font size to `20` via
  `DEFAULT_XTERM_FONT_SIZE` in `src/wasm/src/xterm-emacs-terminal.js`; fallback
  terminal sizing now uses the same default cell size.
- Added `tests/runtime/terminal-profile.test.js` and extended
  `tests/runtime/xterm-emacs-terminal.test.js` for the xterm-256color profile
  and default font size.
- Added `tools/scripts/probe-browser-pdump-atomics-terminal-profile.mjs` plus
  `npm run test:xterm-terminal-profile`.  The probe boots the exact
  `emacs-browser-atomics-pdump` artifact, checks `WASMACS-TERM=xterm-256color`,
  sends `abc`, cursor-left, and `Z`, and verifies the tty redraw emits the
  expected backspace + `Zc` rewrite.
- Added an invisible browser debug hook on
  `src/wasm/xterm-atomics-pdump.html` so probes can inject the same byte stream
  that xterm.js sends through `onData` without adding visible UI.
- Rebuilt artifacts:
  - `build/artifacts/emacs-browser-atomics-pdump/temacs.wasm` sha256:
    `dfa35545e247130dfa1d7f24002adaccf03fc8cb22f5846359c1fb8d473c8829`.
  - `build/artifacts/emacs-browser-atomics-pdump/bootstrap-emacs.pdmp`
    sha256:
    `59ba46cd87f97dfad6d1203ea0e3111f6219d42647d2166fd563bc61d9ff0a69`.
  - `build/artifacts/emacs-browser-atomics-pdump/temacs.data` sha256:
    `02feec44f281948c63bcd18648495106ffc8190a591b20d126e17d2a1cd37498`.
- Validation:
  - `npm test`: PASS (`68` tests).
  - `node --check tools/scripts/probe-browser-pdump-atomics-terminal-profile.mjs`: PASS.
  - `node --check src/wasm/src/xterm-emacs-terminal.js`: PASS.
  - `node --check src/wasm/src/emacs-atomics-pdump-worker.js`: PASS.
  - `node --check src/wasm/src/asyncify-minibuffer-worker.js`: PASS.
  - `npm run test:xterm-pdump-dired`: PASS.
  - `npm run test:xterm-input-latency`: PASS.
  - `npm run test:xterm-terminal-profile`: PASS, including
    `WASMACS-XTERM-MOUSE=t` and emitted `ESC[?1006h`.
  - In-app Browser at
    `http://127.0.0.1:5174/app/xterm-atomics-pdump.html?autostart&run=xterm-profile-shim`:
    PASS (`interactive wait ✓`; earlier validation used row font size `28px`,
    later adjusted to default font size `20`).

### xterm Mouse Retry (2026-06-06)

- Retried Emacs terminal mouse support after the `term/xterm.el` shim was in
  place.  Added startup eval on the Atomics/pdump worker:
  `(require 'xt-mouse)`, `(xterm-mouse-mode 1)`, and a
  `WASMACS-XTERM-MOUSE` readback.
- Extended `tools/scripts/probe-browser-pdump-atomics-terminal-profile.mjs` to
  require both `WASMACS-XTERM-MOUSE=t` and the xterm SGR mouse enable sequence
  `ESC[?1006h`.
- In-app Browser validation after reload:
  - `interactive wait ✓`.
  - Terminal click advanced wait state from `wait-enter#2` to `wait-enter#5`
    and then `wait-enter#8`, confirming click-generated terminal input is
    reaching the fake tty route.
- Validation:
  - `node --check src/wasm/src/emacs-atomics-pdump-worker.js`: PASS.
  - `node --check tools/scripts/probe-browser-pdump-atomics-terminal-profile.mjs`:
    PASS.
  - `npm run test:xterm-terminal-profile`: PASS.

**vendor/emacs unchanged.**

### xterm Font Size Adjustment (2026-06-06)

- Changed `DEFAULT_XTERM_FONT_SIZE` from `28` to `20` in
  `src/wasm/src/xterm-emacs-terminal.js`.
- Updated `tests/runtime/xterm-emacs-terminal.test.js` expectations.
- Validation:
  - `node --test tests/runtime/xterm-emacs-terminal.test.js`: PASS.

**vendor/emacs unchanged.**

### xterm Ctrl-Key Browser Fallback (2026-06-06)

- Investigation: in the in-app Browser, `Ctrl+F` reached Emacs as
  `wait#... bytes=1 queue=1`, but one `Ctrl+B` input route produced no new
  wait/queue event at all.  That confirms the failure is before Emacs'
  `backward-char`; the byte was not reaching the fake tty input queue.
- Added a capture-phase fallback in
  `src/wasm/src/xterm-emacs-terminal.js`: when the terminal container receives
  `Ctrl+A` through `Ctrl+Z`, it prevents browser/default handling and sends the
  corresponding C0 byte (`C-a` = 1, `C-b` = 2, ..., `C-z` = 26) through the same
  xterm data handler used by normal input.
- Extended the same fallback to unmodified arrow keys.  The browser terminal
  layer now sends xterm cursor sequences directly when keydown sees
  `ArrowUp/Down/Right/Left` (`ESC [ A/B/C/D`), avoiding hidden textarea or
  browser shortcut gaps before xterm.js `onData`.
- This keeps Emacs command semantics in Emacs and only hardens the browser
  terminal transport against shortcut interception / hidden textarea gaps.
- Validation:
  - `node --test tests/runtime/xterm-emacs-terminal.test.js
    tests/runtime/emacs-key-bytes.test.js`: PASS (`15` tests).
  - In-app Browser after reload:
    `Ctrl+F` and `Ctrl+B` both produced `bytes=1 queue=1` wait events; `Ctrl+B`
    advanced to `wait-enter#4` after the fallback delivered byte `2`.
  - In-app Browser after arrow fallback:
    textarea `press("Control+B")` produced `wait#4 bytes=1 queue=1`, and
    `press("ArrowLeft")` advanced the terminal input wait to `wait-enter#6`.

**vendor/emacs unchanged.**

### Build Tooling Dependency Notes (2026-06-05)

- xterm.js is now documented as a browser-runtime CDN dependency rather than a
  package installed through npm. The HTML entrypoints load
  `https://cdn.jsdelivr.net/npm/@xterm/xterm@5/...` directly.
- Removed `@xterm/xterm` from `package.json`; Node/npm remain required for
  build, validation, and development scripts.
- README now documents Node.js 24+, npm, `npm ci`, and the CDN xterm.js policy.

### Repository Layout Reorganization (2026-06-05)

- User-facing target:
  `http://127.0.0.1:5173/app/xterm-atomics-pdump.html` remains available via
  the development server.
- Implementation:
  - Moved the browser app source from `app/` to `src/wasm/`.
  - `tools/scripts/serve-app.mjs` now maps historical `/app/...` URLs to
    `src/wasm/...`; `/` serves `src/wasm/index.html` in development.
  - Added `src/c/patches/` and generated
    `0001-wasmacs-host-entrypoint-and-terminal.patch` from the current copied
    Emacs C-side changes so C changes can be applied as diff patches.
  - Added `src/build/prepare-emacs-source.sh`; `make prepare` copies
    `vendor/emacs` into `build/emacs-30.2-patched/src` and applies
    `src/c/patches/*.patch`.
  - Added `src/build/build-site.mjs`; `make build` refreshes
    `docs/index.html` plus `docs/app/` for GitHub Pages root serving.
  - Added top-level `Makefile`, `README.md`, `src/c/README.md`,
    `tools/probs/README.md`, and `archive/README.md`.
  - Moved root-level legacy smoke scripts into
    `tools/probs/legacy-root-smokes/`.
  - Moved the stale `pdump-diagnostic.html.bak` backup into
    `archive/old-app/`.
- 2026-06-05 follow-up:
  - Removed the root `scripts/` directory by moving build, validation, probe,
    smoke, and helper scripts to `tools/scripts/`.
  - Removed the root `runtime/` directory by moving host/runtime libraries to
    `src/runtime/`.
  - Removed the root `wit/` directory and moved `host-abi.wit` out of `src/`.
    It is now generated as `build/artifacts/host-abi.wit` by
    `src/build/generate-host-abi-wit.mjs`.
  - Removed the root `artifacts/` directory. Build scripts and validation now
    use `build/artifacts/` as the generated wasm/js/pdump/wasifs output tree,
    while the dev server still serves those files through the runtime URL
    prefix `/artifacts/...`.
  - Retired `dist/` from the active layout. `docs/` is the maintained Pages
    bundle, and `make clean` removes legacy `dist/` if present while emptying
    `build/` and `docs/`.
  - Moved docs-generation scripts from `tools/scripts/` to `src/build/`.
    `make build` now runs artifact generation before refreshing `docs/`.
  - Moved Emacs source preparation and artifact build scripts from
    `tools/scripts/` to `src/build/`.
  - `make build` now generates Emacs wasm/pdump/wasifs artifacts under
    `build/artifacts/` before publishing `docs/`.
  - GitHub Pages publishing now uses relative app/artifact URLs, a root-scope
    `docs/coi-serviceworker.js` for `SharedArrayBuffer`, and a `temacs.js`
    JavaScript-MIME alias for Emscripten's extensionless `temacs` glue.
  - Static `docs/` verification with Python's `http.server` reached `SAB ✓` at
    both `/` and `/app/xterm-atomics-pdump.html`; after fixing the `temacs.js`
    MIME route, the next browser failure was pdmp loading at the old 512MB
    wasm memory setting, so the Atomics/pdump profile default was raised to
    1GB (`WASMACS_ATOMICS_PDUMP_INITIAL_MEMORY` remains overrideable).
  - Follow-up verification after the 1GB rebuild showed the same
    `could not load dump file "/bootstrap-emacs.pdmp": out of memory` on both
    the static `docs/` Python server and the COOP/COEP development server.
    That failure is therefore not a GitHub Pages path/header/MIME blocker; it
    remains an Atomics/pdump runtime blocker for X2/X3.
  - `npm test` no longer requires the old `emacs-core-spike` and
    `emacs-browser-spike` artifacts after `make build`/`make clean`; those
    historical validators remain available as explicit scripts, while the
    default test loop now covers runtime units and current browser-worker
    contract validators.
  - Fixed `src/build/build-emacs-browser-atomics-pdump-profile.sh` so the
    Atomics/pdump export-heavy LDFLAGS are target-specific to `temacs`; this
    prevents recursive helper builds such as `make-docfile` and
    `make-fingerprint` from receiving browser-only exports.
  - The same profile script now writes `lib-src/package.json` as CommonJS so
    Emscripten-generated helper JS does not inherit the repo-level ESM package
    mode during copied Emacs builds.
  - `logs/` remains available for future runtime, validation, and probe output,
    but log files are ignored by Git. Historical logs from the current baseline
    are preserved as old evidence under `archive/old-logs/`.
  - Removed the root `probs/` directory by moving prototypes and exploratory
    probe code under `tools/probs/`.
  - Design notes now live in `doc/`; `docs/` is reserved for GitHub Pages
    output.
  - `host-abi.wit` is treated as a generated Milestone 6 ABI artifact. Git
    history shows the original `wit/host-abi.wit` was added by commit
    `ffac502` on 2026-06-01 (`Bootstrap wasmacs Emacs wasm milestones`), and
    the current build regenerates the same contract under `build/artifacts/`.
  - 2026-06-05 validation: after `make clean`, `build/` and `docs/` were empty
    and `dist/` absent; `make build` recreated `docs/` and
    `build/artifacts/host-abi.wit`.
  - 2026-06-05 validation: `make build` regenerated
    `build/artifacts/emacs-browser-atomics-pdump/temacs.wasm`,
    `build/artifacts/emacs-browser-atomics-pdump/bootstrap-emacs.pdmp`,
    `build/artifacts/system-lisp-emacs-30.2.wasifs`,
    `build/artifacts/user-filesystem-empty.wasifs`, generated
    `build/artifacts/host-abi.wit`, and copied the publishable artifacts into
    `docs/artifacts/`. `tools/scripts/validate-host-abi.sh` and
    `git diff --check` passed.
  - 2026-06-05 GitHub push hardening: `docs/artifacts/` is no longer a tracked
    output directory because `system-lisp-emacs-30.2.wasifs` and
    `emacs-browser-atomics-pdump/temacs.data` exceed GitHub's 100MB file
    limit. GitHub Actions now runs the default test loop, builds the
    generated Pages bundle with `make build` on `master`, and publishes
    `docs/` via the Pages artifact path instead of storing the heavy artifacts
    in Git. `tools/scripts/validate-git-artifact-policy.sh` is part of
    `npm test` so future commits fail locally/CI if tracked files exceed the
    artifact policy or `docs/artifacts/` slips back into the index.
  - 2026-06-05 validation: `tools/scripts/validate-git-artifact-policy.sh`,
    `npm test`, `make build`, and
    `act pull_request -j build-test-pages --container-architecture linux/amd64`
    passed. The first local Actions run exposed a missing `ripgrep` package in
    CI; adding `ripgrep` to `.github/workflows/ci.yml` fixed the pdumper
    configure probe and the rerun built the Pages bundle plus current heavy
    artifacts without tracking them in Git.
  - 2026-06-05 validation: one-liner static server
    `python3 -m http.server 8176 --bind 127.0.0.1 --directory docs` served
    `/`, `/app/xterm-atomics-pdump.html`, and the 145MB `temacs.data` artifact
    with HTTP 200. In-app Browser loaded
    `http://127.0.0.1:8176/app/xterm-atomics-pdump.html`, showed `SAB ✓`, and
    after pressing Start reached `interactive wait ✓` with the Emacs scratch
    buffer rendered.
  - 2026-06-05 GitHub Pages failure analysis: live Pages served
    `https://modeverv.github.io/wasimacs/`, but
    `/wasimacs/artifacts/emacs-browser-atomics-pdump/temacs.js` and
    `/wasimacs/artifacts/emacs-browser-atomics-pdump/bootstrap-emacs.pdmp`
    returned HTTP 404 because the latest GitHub Actions run failed before
    artifact generation. `gh run view 27007316334 --log-failed` showed
    `git describe --tags --exact-match HEAD` failing in the Emacs submodule
    checkout. The native/system Lisp build scripts now fall back to the pinned
    `emacs-30.2` release tag when tag metadata is unavailable in a shallow or
    archived checkout, so CI no longer depends on fetching Emacs submodule tag
    history before generating Pages artifacts.
  - 2026-06-05 validation: `bash -n
    src/build/build-native-baseline.sh src/build/build-system-lisp-image.sh`,
    `make build`, and `npm test` passed. The one-liner static server on
    `127.0.0.1:8176` served
    `/artifacts/emacs-browser-atomics-pdump/temacs.js`,
    `/artifacts/emacs-browser-atomics-pdump/bootstrap-emacs.pdmp`, and
    `/app/src/emacs-atomics-pdump-worker.js` with HTTP 200. In-app Browser
    reloaded `http://127.0.0.1:8176/app/xterm-atomics-pdump.html`; after
    pressing Start it reached `interactive wait ✓`, materialized the 11.0 MB
    pdmp, rendered the Emacs scratch buffer, and reported no console errors or
    404/importScripts failures.
  - 2026-06-05 validation: `act pull_request -j build-test-pages
    --container-architecture linux/amd64` passed. The local GitHub Actions
    reproduction built the Pages bundle, generated
    `emacs-browser-atomics-pdump/temacs.js`, `temacs.wasm`, `temacs.data`, and
    `bootstrap-emacs.pdmp`, ran 61 Node/runtime contract tests, and completed
    the generated artifact size check.
  - 2026-06-05 GitHub Pages root follow-up: a user Chrome report showed
    `https://modeverv.github.io/wasimacs/` ending with
    `Maximum call stack size exceeded` while the canonical
    `/app/xterm-atomics-pdump.html` URL worked. The pasted runtime log showed
    `pdmp 11.0 MB materialized`, so this was not the earlier Pages artifact
    404. To remove the root/direct split, `docs/index.html` is now generated
    as a lightweight redirect to `./app/xterm-atomics-pdump.html` instead of a
    second copy of the app shell with rewritten relative paths.
  - 2026-06-05 validation: `node src/build/build-site.mjs` regenerated
    `docs/index.html`; `npm test` passed 61 runtime/contract tests plus the
    artifact-policy and browser-worker validators. A one-liner static server
    `python3 -m http.server 8177 --bind 127.0.0.1 --directory docs` served the
    regenerated Pages bundle. In-app Browser opened
    `http://127.0.0.1:8177/?probe=redirect#hashcheck`, redirected to
    `/app/xterm-atomics-pdump.html?probe=redirect#hashcheck`, showed `SAB ✓`,
    and after pressing Start reached `interactive wait ✓` with
    `pdmp 11.0 MB materialized`.
  - 2026-06-05 repository rename follow-up: after renaming the GitHub
    repository from `wasimacs` to `wasmacs`, live Pages at
    `https://modeverv.github.io/wasmacs/` served the HTML app shell but
    returned HTTP 404 for
    `/wasmacs/artifacts/emacs-browser-atomics-pdump/temacs.js` and
    `/wasmacs/artifacts/emacs-browser-atomics-pdump/bootstrap-emacs.pdmp`.
    `gh api repos/modeverv/wasmacs/pages` showed `build_type: legacy` with
    source `master /docs`, so GitHub's rename flow had fallen back to the
    checked-in `docs/` tree instead of the workflow-uploaded Pages artifact.
    Restored Pages to `build_type: workflow`, reran CI run `27012031867`, and
    verified live `temacs.js`, `bootstrap-emacs.pdmp`, `/`, and the app page all
    return HTTP 200 under `/wasmacs/`. In-app Browser loaded
    `https://modeverv.github.io/wasmacs/app/xterm-atomics-pdump.html`, clicked
    Start, and reached `interactive wait ✓` with `pdmp 11.0 MB materialized`.
    Local `origin` was also updated to `git@github.com:modeverv/wasmacs.git`.
- Validation to run next:
  - Dev server smoke for
    `http://127.0.0.1:5173/app/xterm-atomics-pdump.html`

**vendor/emacs unchanged.**

## M260605: atomic pdmp artifact regenerate / Reload+Eval+GC recovery (2026-06-05)

### Status

- `build/artifacts/emacs-browser-atomics-pdump/bootstrap-emacs.pdmp` regenerated from
  the final Atomics runtime, then packaged with matching `temacs.wasm`.
- `http://localhost:5173/app/pdump-diagnostic.html` "Generate pdmp" now loads
  the bundled artifact into MEMFS and enables Reload/Eval controls.
- "Reload + Eval + GC" PASS in the browser page:
  - `version=30.2`
  - `pdump=LOADED`
  - `gc=GC-OK`
  - `D3+D4 PASS`
- Node probe PASS:
  - `VERSION:30.2`
  - `PDUMP:LOADED`
  - `GC:PASS`

### Evidence

- Build command:
  `src/build/build-emacs-browser-atomics-pdump-profile.sh`
- Artifact hashes:
  - `temacs.wasm`: `54b813bb07d12fe638f68bf03a1364974302098c9bc32d2f853c705b46df6d69`
  - `bootstrap-emacs.pdmp`: `c0958f4c717f95bff00f027af79b370b5c0170d34b24c32a956817645842b0d2`
- Browser page evidence:
  - Generate checkpoint: `generate-done`
  - Reload checkpoint: `pdmp-materialized`, `argv0-file-placed`, `boot-done`, `reload-done`

### Fixes Applied

- Rebuilt `build/emacs-pdump-configure-probe` from a fresh GNU Emacs 30.2 copy;
  the previous generated copy had repeated os-compat insertions in `keyboard.c`.
- Made the os-compat keyboard insertion cleanup idempotent before reinsertion.
- Changed atomic pdmp artifact build to generate `bootstrap-emacs.pdmp` after
  building the final Atomics runtime, then extract `/bootstrap-emacs.pdmp` from
  MEMFS to the host artifact. This avoids runtime/pdmp fingerprint mismatch.
- Added the Emscripten pbootstrap load-path fix to the Atomics pdmp build path.
- Ensured native `make-docfile` / `make-fingerprint` helpers and internal
  termcap settings are restored before `src/temacs` link.
- `pdump-diagnostic-worker.js` now reads bundled pdmp artifacts and preserves
  `/temacs` argv0 placement before pdmp boot.

### Remaining Blockers

- Cleared in follow-up:
  - Page Boot Test now uses `callMain(["--dump-file=...","--batch"])` plus the
    exported eval bridge and reports `BOOT-PDUMP: LOADED`, `BOOT-GC: PASS`.
  - `--quick --no-splash -nw` with pdmp now emits terminal bytes and reaches the
    Atomics waitpoint in `tools/scripts/probe-browser-pdump-atomics-tty-command-loop.mjs`.
  - `xterm-atomics-pdump.html` now reaches `interactive wait ✓` with real
    `*scratch*` terminal output.

### Follow-up Fixes Applied (2026-06-05)

- Root cause for the pdmp `--nw` abort: the copied pdump source tree lacked
  generated Unicode property Lisp (`charprop.el`, `uni-*.el`). Redisplay called
  `bidi_initialize` (`vendor/emacs/src/bidi.c`) before the input waitpoint, and
  the missing `bidi-class`/mirroring/bracket char-tables made it abort.
- Root cause for `japan-util` during normal startup: the copied pdump source
  tree also lacked generated `lisp/subdirs.el`, so `language/` was not added to
  `load-path`; `language/japanese.el` registers `features japan-util`, then
  `international/mule-cmds.el` requires it.
- Synced native-generated `lisp/subdirs.el`, `international/charprop.el`, and
  all `international/uni-*.el` into the pdump source tree before pbootstrap.
- Corrected interactive startup args from `--nw` to Emacs' accepted `-nw`.
- Added a `timing-wait-enter` host-library checkpoint so the browser page can
  show the real Atomics waitpoint before input wakes it.

### Current Evidence (2026-06-05)

- Artifact hashes after regeneration:
  - `temacs.wasm`: `07b7fd96c63f36b93fbee8f5afcd0b8c5855e2b6d40d3877cbe4ec5c26002312`
  - `bootstrap-emacs.pdmp`: `9b38b2761a1a0bbcfa3512fdcd44561bbcbccb8e5b99dc4d222e52e688828717`
- Browser `pdump-diagnostic.html`:
  - `BOOT-VER: 30.2`
  - `BOOT-PDUMP: LOADED`
  - `BOOT-GC: PASS`
- CLI probe:
  - `tty-flush:YES`
  - `atomics-wait:YES`
  - `callMain-done:NO`
- Browser `xterm-atomics-pdump.html`:
  - `pdmp 26.4 MB materialized`
  - `SAB ✓`
  - `interactive wait ✓`
  - debug checkpoint `wait-enter#1 queue=0 out=2471 fio=1`
  - terminal shows `*scratch*` in Lisp Interaction mode without `japan-util` or
    unknown-option warnings.

### Remaining Scope

- X4 was initially partially verified only through host input consumption, but
  the follow-up below now clears the input/redisplay-loop blocker.

### X4 Input/Redisplay Resolution (2026-06-05)

- X4 is now verified on `xterm-atomics-pdump.html`.
- Browser page:
  `http://localhost:5173/app/xterm-atomics-pdump.html?run=1780624320762`
- Evidence:
  - User-visible xterm showed typed `a` in `*scratch*`.
  - Page text extraction later also included a standalone `a` line in
    `*scratch*`.
  - Debug log reached `wait-enter#2 queue=0 out=2565`, after initial
    `wait-enter#1 queue=0 out=2471`, proving redisplay/output advanced and the
    command loop returned to the next Atomics waitpoint.
- Source-grounded fix shape:
  - `kbd_buffer_get_event` uses `gobble_input()` after the host waitpoint so
    terminal input is moved into Emacs' keyboard buffer.
  - Terminal keystrokes avoid stale pdmp-restored frame/kboard lookup by using
    `current_kboard` before `event_to_kboard` and `selected_frame` before lispy
    event frame/focus resolution.
  - The wasm-specific switch-frame path is suppressed for tty keystrokes so the
    real key event is converted and consumed.
- Current artifact hashes after the latest rebuild:
  - `temacs.wasm`: `3812ecc58f01ac9c88e93b3af050d7036109488e412352347854f15edf478ab3`
  - `bootstrap-emacs.pdmp`: `fe66c16d682ac8ecbbaafc15d029752db0262153a09351532d5ab2a31f6d5b0e`

### X4 Latency Resolution (2026-06-05)

- The `a` input path initially worked but sometimes took about 30 seconds to
  redisplay and return to `wait-enter#2`.
- This was not an Asyncify regression: the current route is
  `emacs-atomics-pdump-worker.js` with the Atomics / `NO Asyncify` artifact.
- Measured cause: Emacs' `auto-save-timeout` path caused a 30 second wait while
  wasm busy-polled terminal availability.  Before the fix, `wait-enter#2`
  arrived after ~30.2s with `fio=14534857`.
- The pdmp Atomics worker now starts with:
  `(setq auto-save-timeout nil)`.
- Browser validation after the fix:
  - boot to `*scratch*`: ~3.2s
  - `a` to visible redisplay and `wait-enter#2`: `50ms`
  - `wait-enter#2 queue=0 out=2565 fio=4`

### Generated Loaddefs / Org Validation (2026-06-05)

- The pdump copied source tree now syncs native-generated autoload/loaddefs
  files before pbootstrap, including:
  - `lisp/emacs-lisp/cl-loaddefs.el`
  - `lisp/org/org-loaddefs.el`
  - top-level `lisp/loaddefs.el`
- This keeps the existing latency fix in place:
  `(setq auto-save-timeout nil)` remains in the pdmp Atomics worker startup
  args.
- Rebuilt `build/artifacts/emacs-browser-atomics-pdump` after syncing generated
  loaddefs:
  - `temacs.wasm` sha256:
    `4f58d61fe440b08ac9b13f934b2099315630e4a19383ef3e2bc86cffcd570be8`
  - `bootstrap-emacs.pdmp` sha256:
    `11ee98a6bb5a8392f9f0cc6d7f63370e7ce7341deea23ea9a085066d29007a31`
- Validation:
  - `node --check app/src/emacs-atomics-pdump-worker.js`: PASS.
  - `node tools/scripts/probe-browser-pdump-atomics-tty-command-loop.mjs`: reaches
    Atomics wait with tty output (`tty-flush:YES`, `atomics-wait:YES`,
    `callMain-done:NO`).
  - Atomics pdump eval probe: `(require 'org)` returns
    `org=t org-mode=t cl-subseq=t` and locates
    `/usr/local/share/emacs/30.2/lisp/emacs-lisp/cl-loaddefs.el`.
  - Atomics pdump eval probe: opening `/home/user/test.org`, entering
    `org-mode`, and inserting `* Heading from wasmacs` returns
    `file="/home/user/test.org" mode=org-mode buffer="* Heading from wasmacs\n"`.
  - Browser `xterm-atomics-pdump.html` reload with the new artifact reaches
    `interactive wait ✓` and displays `*scratch*` from a 26.7 MB pdmp.
- Remaining verification gap:
  - Automated browser key sequences for `C-x C-f` are blocked by the Browser
    tool's native clipboard shortcut guard. Full UI key-driven `.org` editing
    still needs either manual confirmation in the visible page or a dedicated
    xterm test hook/probe.

**vendor/emacs unchanged.**

### Dired Without External `ls` Slice (2026-06-05)

- Goal: make the first Dired route depend on filesystem primitives rather than
  `host.process`, shell, or an external `ls` binary.
- Source-grounded decision:
  - `vendor/emacs/lisp/files.el` `find-file` / `find-file-noselect` uses
    file primitives for file visits.
  - `vendor/emacs/lisp/minibuffer.el` file completion reaches
    `file-name-completion` / `file-name-all-completions`.
  - `vendor/emacs/src/dired.c` implements `directory-files`,
    `directory-files-and-attributes`, and file-name completion over directory
    reads.
  - `vendor/emacs/lisp/files.el` `insert-directory` only needs an external
    `insert-directory-program` when `ls-lisp-use-insert-directory-program`
    remains non-nil.
- Implementation:
  - Added `dired-without-ls-facade` and `dired-without-ls` operation contracts
    to `app/src/small-os-services.js`.
  - Updated `tools/scripts/patch-emacs-host-entrypoint-spike.sh` so copied
    `loadup.el` loads `ls-lisp`, sets
    `ls-lisp-use-insert-directory-program nil`, and sets
    `insert-directory-program nil`.
  - Added C/wasm exports:
    `wasmacs_os_configure_dired_without_ls`,
    `wasmacs_os_dired_without_ls_probe`, and
    `wasmacs_os_filesystem_dired_state`.
  - Added `tools/scripts/probe-browser-dired-without-ls.mjs` and included it in
    `npm run test:persistent`.
- Dired MVP compatibility requirement is now explicit:
  `directory-files`, `directory-files-and-attributes`, `file-attributes`,
  `file-directory-p`, `file-readable-p`, and `file-symlink-p` must be backed by
  `readdir`, `stat/lstat`, `readlink`, and access/open checks. External `ls`
  remains unavailable for MVP.
- Validation:
  - Rebuilt `build/artifacts/emacs-browser-persistent-spike`.
  - `build/artifacts/emacs-browser-persistent-spike/temacs.wasm` sha256:
    `d5d4cc471e1e265ff5ba89aedf05c74f3ab60dbc7adbccbd281c75f8cd45c6ea`.
  - `build/artifacts/emacs-browser-persistent-spike/temacs.data` sha256:
    `30a8923eb76af119360244ab9d4c6f61ed2d493d1adef16c1c800c87487f3b00`.
  - `node tools/scripts/probe-browser-dired-without-ls.mjs`: PASS; readback reports
    `:backend ls-lisp`, `:host-process nil`, `:directory-files t`,
    `:directory-files-and-attributes t`, `:file-attributes t`,
    `:file-directory-p t`, `:file-readable-p t`, and a generated listing.
  - `npm test`: PASS.
  - `npm run test:persistent`: PASS.

### Dired on Atomics pdump xterm page (2026-06-05)

- User-facing target:
  `http://127.0.0.1:5173/app/xterm-atomics-pdump.html`.
- Implementation:
  - The Atomics pdump build exports
    `wasmacs_os_configure_dired_without_ls`,
    `wasmacs_os_dired_without_ls_probe`, and
    `wasmacs_os_filesystem_dired_state`.
  - `app/src/emacs-atomics-pdump-worker.js` now applies the same runtime eval
    used by the persistent route:
    `(require 'ls-lisp)` plus
    `ls-lisp-use-insert-directory-program nil` and
    `insert-directory-program nil`.
  - Added `tools/scripts/probe-browser-pdump-atomics-dired-without-ls.mjs` and
    `npm run test:xterm-pdump-dired` so the exact
    `emacs-browser-atomics-pdump` artifact is checked before browser delivery.
- Validation:
  - Rebuilt `build/artifacts/emacs-browser-atomics-pdump`.
  - `build/artifacts/emacs-browser-atomics-pdump/temacs.wasm` sha256:
    `afe4fb5c0737bb876ff1e9b56c69751e637b8735a82e0e760982e065f9e3c0e8`.
  - `build/artifacts/emacs-browser-atomics-pdump/bootstrap-emacs.pdmp` sha256:
    `de0bbd20c3a94c0ac5afd0429af6ea63e6443a339b1048150c2a15c4d3c960ff`.
  - `build/artifacts/emacs-browser-atomics-pdump/temacs.data` sha256:
    `65a90c0ca637934d5bd1130e21b1bbf233dc7e4ed062911bec54cfe98b9eac66`.
  - `npm run test:xterm-pdump-dired`: PASS.
  - `node tools/scripts/probe-browser-pdump-atomics-tty-command-loop.mjs`: PASS;
    reached Atomics wait with tty output.
  - In-app Browser opened
    `http://127.0.0.1:5173/app/xterm-atomics-pdump.html?autostart`; page
    reached `interactive wait ✓`, displayed `*scratch*`, and debug boot args
    included the `ls-lisp` Dired eval.
- Automation caveat: the Browser tool still blocks native clipboard-like
  control-key injection (`C-x`), so the page-level evidence is boot/wait plus
  artifact probe rather than a full typed `C-x d` flow.

### Atomics pdump `.wasifs` Import/Export Fix (2026-06-05)

- Symptom reported during `.wasifs` export/import work: export could produce a
  user image, but the browser session could end with
  `Maximum call stack size exceeded` around `C-x C-f`.
- The browser-only storage path now uses IndexedDB for the pdump Atomics page
  and worker; worker `localStorage` access stays unavailable by design.
- Removed ad hoc startup stack guard evals (`max-lisp-eval-depth`,
  `max-specpdl-size`, completion/fido/icomplete tweaks). They were not
  source-grounded fixes for Emacs' `find-file` path and made the pdmp restore
  route diverge from the normal terminal product path.
- Added a guarded `Atomics.wait` boundary snapshot in
  `app/src/emacs-atomics-pdump-worker.js`: just before Emacs blocks for the
  next terminal input, the worker exports `/home/user` to a tar-compatible
  `user-filesystem.wasifs` payload and posts it to the main page. The main page
  persists that payload to IndexedDB while its event loop remains free.
- Kept snapshot export iterative and best-effort so `.wasifs` persistence cannot
  recursively break the Emacs input wait boundary.
- 2026-06-05 follow-up: fixed Atomics worker `.wasifs` import materialization so
  file entries such as `/home/user/h.org` only create parent directories before
  `FS.createDataFile(parent, name, ...)`. The previous import path collected the
  full file path as a directory candidate, so export/import could turn a saved
  file into a MEMFS directory.
- Validation:
  - `git diff --check`: PASS.
  - `npm test`: PASS after the timed-wait and bundled-pdmp fixes.
  - `node tools/scripts/probe-browser-pdump-atomics-tty-command-loop.mjs`: reaches
    Atomics wait with tty output (`tty-flush:YES`, `atomics-wait:YES`,
    `callMain-done:NO`).
  - `node --test tests/runtime/atomics-worker-wasifs.test.js`: PASS; both
    Atomics workers import `/home/user/h.org` as a file, not a directory.
  - Browser `http://127.0.0.1:5173/app/xterm-atomics-pdump.html?autostart`
    after reload reached `interactive wait ✓`.
  - Browser boot args after reload were reduced to
    `--dump-file=/bootstrap-emacs.pdmp --quick --no-splash -nw` plus the three
    existing safe evals for `uniquify-trailing-separator-p`, `create-lockfiles`,
    and `auto-save-timeout`.
- Correction to the first browser validation attempt: sending `C-x C-f` as one
  queued batch skipped the real prefix-key delay. Re-testing the user's
  delayed `C-x` case showed the finite `end_time` branch in `keyboard.c` still
  used `wait_reading_process_output (...)`, which could spin in the browser OS
  compatibility path with no queued input and eventually end with
  `Maximum call stack size exceeded`.
- Added a source-backed os-compat patch for the finite keyboard wait branch:
  when compiled under Emscripten and no keyboard bytes are queued, it now calls
  `wasmacs_host_wait_for_input ()`, then `gobble_input ()`, matching the
  indefinite input wait boundary used by the normal command loop.
- The real Chrome tab also revealed a separate cache problem: hard reload did
  not clear the old IndexedDB pdmp. The page now tries the bundled
  `/artifacts/emacs-browser-atomics-pdump/bootstrap-emacs.pdmp` with
  `cache: "no-store"` before falling back to the old IDB/generate path, so a
  rebuilt wasm binary does not boot against a stale pdmp fingerprint.
- Real Chrome check after the bundled-pdmp fix: the user's
  `?autostart` tab was claimed through the Chrome extension and reloaded; it
  reached `interactive wait ✓`, `pdmp 11.5 MB materialized`, and `*scratch*`
  from the bundled artifact. The Chrome connector and macOS `System Events`
  path both blocked or failed terminal control-key injection in this session
  (`Control+X` clipboard guard / virtual clipboard missing / UI scripting
  hang), so delayed `C-x C-f` still needs a manual visible-page confirmation or
  a dedicated xterm control-byte test hook.

### Atomics pdump heap mapping restore (2026-06-05)

- Symptom: both the COOP/COEP development server and a static `docs/` server
  could boot far enough to materialize `/bootstrap-emacs.pdmp`, then Emacs
  aborted with `could not load dump file "/bootstrap-emacs.pdmp": out of memory`.
- Source-grounded cause: `vendor/emacs/src/emacs.c` reports that message when
  `pdumper_load` returns `PDUMPER_LOAD_OOM`.  The copied pdump source tree had
  lost the earlier Emscripten-specific `pdumper.c` dispatcher fix, so
  `dump_mmap_contiguous` followed the native `VM_SUPPORTED` mmap path instead
  of the heap-backed contiguous mapping path required by wasm/browser restore.
- Fix: `src/build/build-emacs-browser-atomics-pdump-profile.sh` now applies an
  idempotent `pdumper.c` patch before linking the Atomics/pdump runtime:
  under `__EMSCRIPTEN__`, `dump_mmap_contiguous` calls
  `dump_mmap_contiguous_heap`; native Emacs behavior remains unchanged.  The
  final Atomics runtime then regenerates the matching `bootstrap-emacs.pdmp`.
- Rebuilt and republished artifacts:
  - `build/artifacts/emacs-browser-atomics-pdump/temacs.wasm` sha256:
    `15232abab053735b0d992806c97d5b21ae569deed445b0832becbee038f57a7a`.
  - `build/artifacts/emacs-browser-atomics-pdump/bootstrap-emacs.pdmp` sha256:
    `ed894a184b89c689722d8f30bc20de3f45ce70f9a8b71e0bc2d8f43e4913f28b`.
  - `docs/artifacts/emacs-browser-atomics-pdump/` has matching hashes after
    `npm run build`.
- Validation:
  - `bash -n src/build/build-emacs-browser-atomics-pdump-profile.sh`: PASS.
  - `node --check src/wasm/src/emacs-atomics-pdump-worker.js`: PASS.
  - `npm test`: PASS.
  - `node tools/scripts/probe-browser-pdump-atomics-tty-command-loop.mjs`:
    reaches `tty-flush:YES`, `atomics-wait:YES`, `callMain-done:NO`.
  - In-app Browser dev-server check at
    `http://127.0.0.1:5173/app/xterm-atomics-pdump.html?autostart&run=fix-oom-dev`:
    `SAB ✓`, `pdmp 11.0 MB materialized`, `interactive wait ✓`.
  - In-app Browser static-docs check at
    `http://127.0.0.1:8173/app/xterm-atomics-pdump.html?autostart&run=fix-oom-static`:
    service worker enabled COOP/COEP, then `SAB ✓`,
    `pdmp 11.0 MB materialized`, `interactive wait ✓`.

### Static docs artifact cache-bust for Enter/input crash (2026-06-05)

- Symptom: serving `docs/` with `python3 -m http.server` could show 304s for
  the Pages root / service worker and then end the session with
  `Maximum call stack size exceeded` after interactive input such as Enter.
- Reproduction notes: fresh in-app Browser runs against the rebuilt artifacts
  did not reproduce the crash for Enter alone, `日本語` then Enter, or root
  `docs/index.html`.  The static server logs showed cache reuse, while the
  page intentionally fetches only `bootstrap-emacs.pdmp` with `cache:
  "no-store"`.
- Fix: `src/wasm/src/emacs-atomics-pdump-worker.js` now adds a per-worker
  cache-bust token to `importScripts(.../temacs.js)` and Emscripten
  `locateFile` URLs for `temacs.wasm` / `temacs.data`.  This keeps the wasm JS
  glue, wasm binary, data preload, and pdmp artifact from mixing generations
  under a generic static server.
- Rebuilt `docs/` with `npm run build`.
- Validation:
  - `node --check src/wasm/src/emacs-atomics-pdump-worker.js`: PASS.
  - `node --test tests/runtime/atomics-worker-wasifs.test.js`: PASS.
  - In-app Browser root static-docs check via a no-store Python server at
    `http://127.0.0.1:8174/?autostart&run=cachebust-jp-enter`: `日本語`
    then Enter stays alive and reaches `wait-enter#3`, with
    `interactive wait ✓`.

### README static-docs screenshots (2026-06-05)

- Served the generated `docs/` bundle locally from `127.0.0.1:8175` with
  COOP/COEP and no-store headers.
- Captured README images under `docs/screenshots/`:
  - `wasmacs-startup.jpg`: `xterm-atomics-pdump.html?autostart` reached
    `SAB ✓`, `pdmp 11.0 MB materialized`, and `interactive wait ✓` at
    `*scratch*`.
  - `wasmacs-dired.jpg`: opened `/home/user/` through the xterm route with
    `M-x dired`; Dired rendered through the no-host-process `ls-lisp` path.
  - `wasmacs-org-file.jpg`: opened `/home/user/wasmacs-demo.org` through
    `M-x find-file`, inserted sample Org content, and verified the mode line
    reported `(Org)`.
- README now embeds the three screenshots from `docs/screenshots/`.

### Responsive xterm Terminal/Tty resize (2026-06-06)

- Implemented window-following sizing for the xterm Terminal/Tty route:
  `src/wasm/src/xterm-emacs-terminal.js` now uses xterm's FitAddon when
  available, falls back to deterministic pixel-to-cell sizing, observes the
  terminal container with `ResizeObserver`, and exposes `fit()` /
  `getDimensions()` for page-level coordination.
- The Atomics xterm pages now publish terminal dimensions through a dedicated
  `terminalSizeSAB` (`version`, `cols`, `rows`) and wake the existing input
  wait signal with zero input bytes when only the terminal size changed.  The
  write order is cols/rows first, then version, so the waiter sees a coherent
  resize snapshot.
- The Atomics host library now exposes
  `wasmacs_host_terminal_resize_pending`, `*_cols`, `*_rows`, and `*_ack`.
  `wasmacs_host_wait_for_input` returns early on resize-only wakeups, and the
  ACK posts `terminal-resized` with the version that Emacs consumed.
- Added the C/wasm facade `wasmacs_os_apply_terminal_resize(width, height)` in
  the host entrypoint patch.  It applies validated tty dimensions through the
  selected live termcap frame with `change_frame_size` and
  `do_pending_window_change`.
- Source-grounded waitpoint fix: the browser Atomics route processes the live
  input wait in `keyboard.c`, not the older `sysdep.c` read loop.  The
  os-compat waitpoint patch now calls `wasmacs_os_maybe_apply_terminal_resize`
  immediately after `wasmacs_host_wait_for_input` in both timed and untimed
  waits.
- Build hygiene: `build-emacs-browser-atomics-pdump-profile.sh` refreshes
  `keyboard.c` and `sysdep.c` from the read-only `vendor/emacs` source before
  applying wasmacs OS-compat patches, so repeated profile builds do not
  accumulate duplicate generated patch blocks.
- Added `tests/runtime/xterm-emacs-terminal.test.js` for fallback sizing,
  padding subtraction, and minimum terminal dimensions.
- Rebuilt artifacts:
  - `build/artifacts/emacs-browser-atomics-pdump/temacs.wasm` sha256:
    `dfa35545e247130dfa1d7f24002adaccf03fc8cb22f5846359c1fb8d473c8829`.
  - `build/artifacts/emacs-browser-atomics-pdump/bootstrap-emacs.pdmp`
    sha256:
    `41053eaa0f41280ee847f1a58d52ae2f115b3d28d46ededa46d5a045b198dd4b`.
- Validation:
  - `node --check src/wasm/src/xterm-emacs-terminal.js`: PASS.
  - `node --check src/wasm/src/emacs-atomics-pdump-worker.js`: PASS.
  - `node --check src/wasm/src/emacs-atomics-worker.js`: PASS.
  - `node --test tests/runtime/xterm-emacs-terminal.test.js`: PASS.
  - `npm test`: PASS (`64` tests).
  - `make build`: PASS.
  - `npm run dev` in-app Browser check at
    `http://127.0.0.1:5173/app/xterm-atomics-pdump.html?autostart&run=resize-make-build-1780676310135`:
    initial `interactive wait ✓`; viewport `900x520` produced
    `resize: 126x30` and `winsize: 126x30 v12`; viewport `1400x860`
    produced `resize: 197x54` and `winsize: 197x54 v13`.

**vendor/emacs unchanged.**

### xterm bracketed paste input normalization (2026-06-06)

- Symptom: in a real Chrome tab, entering `kkkk` followed by Enter could end
  the Atomics/pdump session with `Maximum call stack size exceeded`, while the
  earlier in-app Browser verification only covered boot/`require` and did not
  exercise the same input path.
- Evidence: the failing Chrome log reported `wait#2 bytes=11` for the
  `kkkk`+Enter action.  That byte count matches the xterm bracketed-paste start
  marker `ESC [ 200 ~` plus `kkkk\r`, not ordinary five-byte terminal input.
  The tail stack overflow then occurred after Emacs had inserted `kkkk`, inside
  post-command hook execution.
- Fix: `src/wasm/src/xterm-emacs-terminal.js` now strips xterm bracketed paste
  wrappers before UTF-8 tty injection, so paste-like Chrome input reaches Emacs
  as plain terminal text for this MVP route.
- Fix: `src/wasm/xterm-atomics-pdump.html` now stages input in a browser-side
  queue and flushes only when the single SAB input slot is empty, avoiding
  overwrite/coalescing when browser input arrives in bursts or is split across
  multiple xterm `onData` callbacks.
- Validation:
  - `node --test tests/runtime/xterm-emacs-terminal.test.js`: PASS.
  - `npm test`: PASS (`89` tests).
  - `npm run build`: PASS; `docs/app` includes the same normalization and
    queued input flushing.
  - In-app Browser dev-server check at
    `http://127.0.0.1:5173/app/xterm-atomics-pdump.html?autostart&verify=input-normalize-local`:
    boot reached `interactive wait ✓`.
  - In-app Browser paste check with clipboard text `kkkk\n`: runtime reported
    `wait#5 bytes=5`, stayed at `interactive wait ✓`, and did not reproduce
    `Maximum call stack size exceeded`.

**vendor/emacs unchanged.**

### DevTools resize guard for Atomics/pdump xterm (2026-06-06)

- Symptom: opening Chrome DevTools while the Atomics/pdump xterm route is
  interactive can shrink the viewport, trigger xterm fit resize events, wake
  Emacs through the terminal-size SAB, and then end the session with
  `Maximum call stack size exceeded` during bytecode/hook redisplay paths.
- Evidence: the reported Chrome screenshot showed DevTools docked below the
  page, recent `resize: 192x18` / `winsize` events, and a terminal-tail stack
  ending in `exec_byte_code`, `funcall_lambda`, and `run_hook_with_args`.
- Fix: `src/wasm/xterm-atomics-pdump.html` now debounces live terminal resize
  delivery to Emacs by 250ms, reducing resize storms from DevTools open/close
  and viewport settling.
- Fix: the same page now supports `?no-live-resize=1`, which keeps the initial
  boot size but suppresses later Emacs-side TTY resize delivery after the
  runtime is interactive.  This gives debugging sessions a stable mode even if
  DevTools changes the browser viewport.
- Validation:
  - Extracted the page module script from
    `src/wasm/xterm-atomics-pdump.html` and ran `node --check`: PASS.
  - `npm test`: PASS (`89` tests).
  - `npm run build`: PASS; `docs/app/xterm-atomics-pdump.html` includes the
    same guard.
  - In-app Browser dev-server check at
    `http://127.0.0.1:5173/app/xterm-atomics-pdump.html?autostart&no-live-resize=1&verify=devtools-resize-guard-local`:
    boot reached `interactive wait ✓`; after interaction began, a later
    `resize: 71x28` was logged as `resize suppressed: 71x28`.

**vendor/emacs unchanged.**

### Quiet Atomics/pdump diagnostics by default (2026-06-06)

- Symptom: DevTools sessions still received large volumes of diagnostic
  messages such as `wait-enter` and repeated `os-timing-checkpoint` entries.
  These logs are not the direct C/wasm stack owner, but they add JS glue calls,
  worker `postMessage` traffic, DOM log appends, and DevTools instrumentation
  pressure while the runtime is already close to browser stack limits.
- Fix: Atomics/pdump diagnostic logs are now opt-in with `?debug-log=1`.
  Default runs suppress `timing-wait-enter`, `scheduler-checkpoint`,
  `os-timing-checkpoint`, verbose boot stderr (`JS-BEFORE-CALLMAIN` /
  `JS-CALLMAIN-*`), non-error Emscripten `printErr` warnings, and main-page
  DOM log rendering for routine timing/stdout messages.
- The essential `timing` event remains available internally so the browser-side
  input queue can flush after Emacs consumes a SAB input chunk, but it is not
  rendered to the debug panel unless `?debug-log=1` is set.
- Validation:
  - `npm test`: PASS (`90` tests).
  - `npm run build`: PASS; `docs/app` and checked-in Pages artifacts include
    the quiet-log guards.
  - In-app Browser dev-server check at
    `http://127.0.0.1:5173/app/xterm-atomics-pdump.html?autostart&no-live-resize=1&verify=quiet-log-local`:
    boot reached `interactive ✓`, `pdmp 12.2 MB materialized`, and the debug
    panel contained only 6 entries: resize/binary-info lines, no
    `os-timing-checkpoint` or `wait-enter` stream.

**vendor/emacs unchanged.**

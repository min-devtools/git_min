# Adaptive Tree-sitter Diff and Editor Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic unified patch reader with an adaptive VS Code-style split/inline diff, Tree-sitter syntax highlighting driven by the active theme, and a complete external-editor open flow configured in Settings.

**Architecture:** Parse unified patches into a pure row model that retains old/new line numbers, paired split rows, hunk patches, and reconstructed before/after source. Highlight reconstructed source asynchronously with web-tree-sitter, then map highlighted source lines back onto diff rows. Keep editor selection in a focused frontend module and validate/spawn only known editor CLIs in a Tauri command.

**Tech Stack:** React 18, TypeScript, Zustand, Vite, web-tree-sitter WASM grammars, Tauri 2, Rust.

---

### Task 1: Unified patch model

**Files:**
- Create: `src/lib/diffModel.ts`
- Create: `src/lib/diffModel.test.ts`
- Modify: `package.json`

- [ ] Write tests for hunk line-number parsing, add/delete alignment, context rows, metadata exclusion, and reconstruction of both source sides.
- [ ] Run `npx tsx src/lib/diffModel.test.ts` and confirm it fails because the module does not exist.
- [ ] Implement `parseUnifiedDiff(text)` and `buildHunkPatch(model, hunkIndex)` as pure functions.
- [ ] Re-run the focused test and confirm all assertions pass.

### Task 2: Tree-sitter highlighting

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Replace: `src/lib/highlight.ts`
- Modify: `src/lib/highlight.test.ts`

- [ ] Write failing tests for extension-to-language routing and semantic Tree-sitter node classification.
- [ ] Run `npm run test:highlight` and confirm expected failures.
- [ ] Install `web-tree-sitter` and `tree-sitter-wasms`, load grammar WASM assets lazily by extension, parse complete reconstructed source, and emit escaped per-line token HTML.
- [ ] Map semantic classes to shared theme tokens (`--syntax-key`, `--syntax-string`, `--syntax-number`, `--syntax-boolean`, `--syntax-null`, `--syntax-punctuation`) plus themed comment/type/function/property/operator/variable colors.
- [ ] Re-run the focused test and confirm it passes.

### Task 3: External editor preference and safe Tauri command

**Files:**
- Create: `src/lib/editor.ts`
- Create: `src/lib/editor.test.ts`
- Create: `src-tauri/src/editor.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/components/views/SettingsView.tsx`

- [ ] Write failing frontend tests for the default editor, validation, persistence, and absolute repo-file joining.
- [ ] Write Rust unit tests for VS Code, Cursor, Zed, and JetBrains CLI argument construction plus unknown-editor rejection.
- [ ] Run both focused suites and confirm they fail for the missing implementations.
- [ ] Implement the preference API and `openRepoFile(repoPath, file, line?)` frontend bridge.
- [ ] Implement the allowlisted `editor_open` command and register it in Tauri.
- [ ] Add the editor selector to Settings using the same interaction pattern as `log_min`.
- [ ] Re-run both focused suites and confirm they pass.

### Task 4: Adaptive split/inline diff UI

**Files:**
- Modify: `src/components/views/DiffView.tsx`
- Modify: `src/store.ts`
- Modify: `src/styles/views.css`
- Modify: `tests/git-workspace-contract.test.mjs`

- [ ] Add failing UI contract assertions for split and inline controls, line-number gutters, ResizeObserver narrow-mode fallback, Tree-sitter source highlighting, Open file, and the Settings editor selector.
- [ ] Run `npm run test:workspace` and confirm the new assertions fail.
- [ ] Render split by default, persist the explicit layout preference, and force inline below 760px while retaining the user's wide-layout preference.
- [ ] Render aligned old/new panes with independent line gutters and shared hunk actions; keep inline rendering and wrap support.
- [ ] Add the Open file action with success/error toast feedback and keep blame actions intact.
- [ ] Replace flat bands with theme-derived editor surfaces, accessible gutters, restrained add/delete fills, sticky hunk headers, focus states, and responsive toolbar behavior.
- [ ] Re-run the UI contract and focused unit tests.

### Task 5: Verification

**Files:**
- Verify all changed files only.

- [ ] Run `npm run test:ui`, `npm run test:workspace`, `npm run test:layout`, `npm run test:highlight`, `npm run test:icons`, and `npm run test:browser`.
- [ ] Run `npm run build`.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml`.
- [ ] Run `git diff --check` and inspect `git status --short` without staging or committing user files.


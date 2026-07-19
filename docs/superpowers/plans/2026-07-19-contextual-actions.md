# Contextual Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add commit/ref-aware quick actions to the Actions inspector and make graph branch pills update the shared selection state.

**Architecture:** Keep ref parsing and PR-target normalization as pure helpers in `gitUi.ts`. GraphTable emits an explicit `(ref, hash)` selection event; RepoView owns the store update. Inspector resolves the selected ref against `useBranches` and renders only valid actions through existing action wrappers.

**Tech Stack:** React, TypeScript, Zustand, Tauri Git commands, assert-based TypeScript tests.

---

### Task 1: Define contextual ref targets

**Files:**
- Modify: `src/lib/gitUi.ts`
- Modify: `src/lib/gitUi.test.ts`

- [ ] Add failing assertions that `refName("HEAD -> main")` is `main`, `refName("tag: v1")` is `v1`, and PR source normalization strips `origin/` from remote branches but rejects tags.
- [ ] Run `npm run test:ui` and confirm the helpers are missing.
- [ ] Implement `refName` and `prSourceBranch` using `BranchInfo.kind`.
- [ ] Run `npm run test:ui` and confirm it passes.

### Task 2: Connect graph pills to shared selection

**Files:**
- Modify: `src/components/GraphTable.tsx`
- Modify: `src/components/views/RepoView.tsx`
- Modify: `tests/git-workspace-contract.test.mjs`

- [ ] Add contract assertions for an `onSelectRef` callback and combined `{ selectedCommit, selectedBranch }` update.
- [ ] Run `npm run test:workspace` and confirm it fails.
- [ ] Add `onSelectRef(name, hash)` to GraphTable, call it from RefChips, and have RepoView update both selections. Plain commit selection clears `selectedBranch`.
- [ ] Run `npm run test:workspace` and confirm it passes.

### Task 3: Render guarded contextual actions

**Files:**
- Modify: `src/components/Inspector.tsx`
- Modify: `tests/git-workspace-contract.test.mjs`

- [ ] Add contract assertions that ActionsTab receives both selected values and exposes Open PR, Create branch, Checkout, Merge, and Rebase actions.
- [ ] Run `npm run test:workspace` and confirm it fails.
- [ ] Resolve the selected ref with `useBranches`, render commit/ref sections, and call the existing safe action wrappers.
- [ ] Run all npm tests, `npm run build`, `cargo test --manifest-path src-tauri/Cargo.toml`, and `git diff --check`.

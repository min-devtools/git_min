# Git Resource Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit dock sections to five rows, move Git resources into compact right-dock previews with full workspace tabs, and pin the commit composer to the left-dock footer.

**Architecture:** Add a small shared preview helper, extend tab metadata with repository resource tabs, and split reusable Git resource rows into a focused component used by both right-dock previews and full center views. Keep all mutations routed through the existing safe action layer.

**Tech Stack:** React 18, TypeScript, Zustand, TanStack Query, CSS, Tauri.

---

### Task 1: Preview contract

**Files:**
- Modify: `src/lib/gitUi.ts`
- Modify: `src/lib/gitUi.test.ts`

- [ ] Write a failing assertion that a nine-item list previews exactly five items and reports four hidden items.
- [ ] Run `npm run test:ui` and confirm the assertion fails because the helper is missing.
- [ ] Add `previewItems(items, limit = 5)` returning `{ visible, hidden }`.
- [ ] Run `npm run test:ui` and confirm it passes.

### Task 2: Repository resource tabs

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/store.ts`
- Create: `src/components/GitResources.tsx`
- Create: `src/components/views/GitResourceView.tsx`
- Modify: `src/App.tsx`

- [ ] Add failing workspace-contract assertions for a `git-resource` tab kind and full resource view.
- [ ] Run `npm run test:workspace` and confirm the contract fails.
- [ ] Add repo-scoped resource tab metadata and `openGitResourceTab` state action.
- [ ] Implement reusable branch, remote, tag, stash, and change rows with existing action functions.
- [ ] Render full resource lists in the center workspace and run the contract again.

### Task 3: Dock restructuring

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/WorkingTree.tsx`
- Modify: `src/components/Inspector.tsx`
- Modify: `src/styles/views.css`

- [ ] Add failing contract assertions for five-row previews, the commit composer outside `.side-scroll`, and resources under Actions.
- [ ] Run `npm run test:workspace` and confirm the contract fails.
- [ ] Extract the commit composer and render it as the left-dock footer.
- [ ] Limit repository and Working Tree previews to five and connect `View all` controls.
- [ ] Replace verbose Actions grids with compact primary actions plus five-row resource previews.
- [ ] Add fixed row grids, truncation, footer, and responsive styling; rerun the contract.

### Task 4: Verification

**Files:**
- Verify all modified files.

- [ ] Run `npm run test:ui`, `npm run test:workspace`, `npm run test:layout`, and `npm run test:highlight`.
- [ ] Run `npm run build`.
- [ ] Run `cargo test` from `src-tauri`.
- [ ] Start the local app and verify left/footer/right/full-tab behavior in the in-app browser.

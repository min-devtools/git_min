# GitMin interaction hardening implementation plan

> **Execution:** Inline in the current session. Every production behavior change
> starts with a focused failing regression test.

**Goal:** Make GitMin's layout and interactions match its Git workflow spec,
with repository-safe state, deterministic keyboard routing, safe Git commands,
and responsive access to the working tree.

**Architecture:** Keep the shared `_min` shell and tokens. Move Git-specific
workspace composition into local components/CSS, make repo UI and operation
state explicitly keyed by repo tab/path, and centralize pure interaction
decisions so they are regression-testable without a browser framework.

**Stack:** React 18, TypeScript, Zustand, TanStack Query, Tauri 2, Rust, Git CLI.

---

## Task 1: Add interaction regression harness and pure contracts

**Files:**
- Create: `src/lib/gitUi.ts`
- Create: `src/lib/gitUi.test.ts`
- Modify: `package.json`

1. Add failing assertions for status-entry keys, physical dirty counts,
   conflict exclusion from bulk staging, panel routing, overlay priority,
   branch target classification, and unmerged-branch error classification.
2. Run `npm run test:ui` and confirm the new test fails because contracts do
   not exist.
3. Add the smallest pure helpers and rerun until green.

## Task 2: Make repository tab state complete and safe

**Files:**
- Modify: `src/store.ts`
- Modify: `src/components/TabsBar.tsx`
- Modify: `src/components/Dialog.tsx`
- Test: `src/lib/gitUi.test.ts`

1. Extend failing tests for default repo UI state, stable migration, dirty-tab
   detection, and optional prompt values.
2. Move selected status identity, inspector mode, commit draft/amend state,
   graph scope, and operation metadata into repo-local state.
3. Make tab close confirm non-empty drafts and render a dirty marker.
4. Add `allowEmpty` prompt support without weakening other prompts.

## Task 3: Restore the Working Tree workspace and focus routing

**Files:**
- Modify: `src/components/Inspector.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/views/RepoView.tsx`
- Modify: `src/components/Titlebar.tsx`
- Modify: `src/styles/views.css`
- Modify: `src/components/ResizeHandles.tsx`
- Test: `tests/git-workspace-contract.test.mjs`

1. Add a source/CSS contract test that fails while Changes/commit remain owned
   by the right inspector or are hidden at minimum width.
2. Extract a reusable WorkingTree component into the left workspace dock and
   keep the right inspector contextual.
3. Synchronize mouse/Vim focus with visible panel state and add focus styling.
4. Migrate legacy resize storage keys to `gitmin:*`.
5. Verify desktop and 1080px source/layout contracts.

## Task 4: Fix working-tree identity, conflict flow, and overlay priority

**Files:**
- Modify: `src/components/WorkingTree.tsx`
- Modify: `src/components/views/RepoView.tsx`
- Modify: `src/components/App.tsx`
- Modify: `src/ui/ContextMenu.tsx`
- Modify: `src/components/KeymapOverlay.tsx`
- Modify: `src/components/Toast.tsx`
- Modify: `src/lib/actions.ts`
- Test: `src/lib/gitUi.test.ts`

1. Add failing tests for `MM` selection/action routing, one-layer Escape, and
   Continue gating while conflicts remain.
2. Address rows by `(path, area)` and keep staged/unstaged diffs independent.
3. Route conflict-producing commands to the first conflict and disable
   Continue until resolved.
4. Prevent overlays/context menus from leaking shortcuts; add semantic menu,
   tab, row, and aria-live behavior.

## Task 5: Isolate mutations and make query refresh granular

**Files:**
- Modify: `src/lib/actions.ts`
- Modify: `src/lib/queries.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/Statusbar.tsx`
- Modify: `src/components/views/RepoView.tsx`
- Test: `src/lib/gitUi.test.ts`

1. Add failing assertions for invalidation groups and operation ownership.
2. Replace global `netOp` with per-path operation state and visible busy
   feedback.
3. Add working-tree, history/refs, and detail invalidation helpers.
4. Keep polling/background fetches out of the foreground LoadingBar and avoid
   blocking the graph during fetch.

## Task 6: Append graph pages and improve repository-aware search/onboarding

**Files:**
- Modify: `src/lib/queries.ts`
- Modify: `src/components/views/RepoView.tsx`
- Modify: `src/components/CommandPalette.tsx`
- Modify: `src/components/views/WelcomeView.tsx`
- Modify: `src/components/Titlebar.tsx`
- Test: `src/lib/gitUi.test.ts`
- Test: `tests/git-workspace-contract.test.mjs`

1. Add failing tests for page offsets, result grouping, and single-import open.
2. Use append-only history pages with backend `skip` support.
3. Search commands, repositories, branches/tags, loaded commits, and status
   paths for the active repo.
4. Open a single imported repo immediately and open the first after bulk
   import; disable repo actions when no repo is active.

## Task 7: Harden remote branch, push, delete, amend, and stash flows

**Files:**
- Modify: `src/lib/actions.ts`
- Modify: `src/lib/git.ts`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/WorkingTree.tsx`
- Modify: `src-tauri/src/lib.rs`
- Test: `src/lib/gitUi.test.ts`
- Test: Rust unit tests in `src-tauri/src/lib.rs`

1. Add failing unit tests for remote tracking branch names, upstream choice,
   and branch-delete error classification.
2. Add backend commands/data needed to switch remote branches safely and push
   with an explicit upstream target.
3. Warn before risky amend, allow empty stash messages, expose stash actions
   without hover dependence, and route stash conflicts into Working Tree.

## Task 8: Full verification and UI review

**Files:** all changed files.

1. Run `npm run test:ui`, `npm run test:layout`,
   `npm run test:highlight`, and the workspace contract test.
2. Run `npm run build`.
3. Run `cargo test` in `src-tauri`.
4. Run `git diff --check` if the workspace becomes a Git repository; otherwise
   report that this check is unavailable.
5. Launch GitMin and test dark/light themes at desktop and 1080px width,
   including tab switching, staged/unstaged `MM`, focus traversal, overlays,
   conflicts, search, and disabled no-repo actions.

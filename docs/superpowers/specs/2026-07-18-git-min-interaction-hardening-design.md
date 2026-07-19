# GitMin interaction hardening design

**Date:** 2026-07-18  
**Status:** Awaiting implementation approval  
**Direction:** Restore the Git workflow topology defined by the original GitMin
spec while preserving the shared `_min` design-system shell.

## Outcome

GitMin must behave like a dependable Git workspace rather than a generic
three-pane viewer. The visible layout, keyboard focus, selection identity,
per-repository state, and backend operation state must all describe the same
current task. A command must never target a hidden row, the wrong side of an
`MM` file, or a repository the user has already left.

## Scope

This design fixes the audited workflow and interaction problems in the current
feature set: working tree, commits, branches, stashes, conflicts, fetch/pull/
push, search, graph paging, overlays, onboarding, responsive layout, keyboard
navigation, and accessibility.

It does not add unrelated product areas such as clone, worktrees, submodules,
Git-flow automation, or interactive rebase.

## Workspace topology

The repo view uses three stable regions:

1. **Left workspace dock** — Working Tree and Branches. Working Tree contains
   staged, unstaged, untracked, and conflict rows plus the commit composer.
   Branches contains local, remote, tag, and stash groups.
2. **Center history** — commit graph and its branch/ref scope. This remains the
   largest region and the default keyboard focus.
3. **Right context inspector** — selected commit metadata, changed files,
   diffs, blame, and contextual actions. It never owns the commit draft.

At supported narrow widths, the workspace dock remains reachable. The context
inspector may collapse because it can be reopened from a selection; the working
tree may not disappear behind that responsive rule. Local GitMin CSS composes
this topology without changing shared family layout tokens.

## Repository-local UI state

Every open repository tab owns:

- selected commit, branch, and status entry;
- focused panel and right-inspector mode;
- commit message and amend state;
- graph scope and loaded pages;
- active foreground operation metadata.

Changing tabs cannot carry a commit draft, amend flag, selection, pending AI
response, or operation veil into another repository. An asynchronous result is
accepted only when its request still matches the originating tab, repository,
and request id. A tab with a non-empty commit draft displays a dirty marker and
asks for confirmation before closing.

## Status entry identity and commands

A working-tree row is identified by `(path, area)`, not path alone. This keeps
the staged and unstaged halves of an `MM` file independently selectable and
ensures click, Vim navigation, diff, stage, and unstage all target the visible
row.

Displayed repository dirty counts count physical paths, while section badges
may count actionable rows. `stage all` excludes unresolved conflicts. Conflict
rows expose explicit resolution actions and never silently pass through a bulk
stage command.

## Focus and keyboard routing

Keyboard focus follows visible spatial order: workspace sections, history,
context inspector. Moving focus also reveals the destination and updates its
mode; it cannot focus an invisible Changes list while Diff remains visible.
Every focused pane has the same design-system focus treatment.

Interaction layers have strict priority:

1. modal dialog;
2. command palette, keymap overlay, or context menu;
3. repo-level Vim shortcuts;
4. global app shortcuts.

Escape closes exactly one highest-priority layer. Keys never leak through an
open overlay to mutate the repository underneath it.

## Mutation and operation model

All mutating commands use a per-repository operation guard. A second conflicting
command receives visible feedback instead of being silently ignored. Background
fetch and status polling use the shared loading indicator but do not block the
graph; history-changing or destructive foreground operations may veil only the
affected section.

Query refresh is granular:

- stage, unstage, resolve, discard: repository info + status;
- commit, checkout, merge, rebase, cherry-pick: info + status + refs + history;
- fetch, pull, push: only the data each result can change;
- selected commit/diff: invalidated only when its source can have changed.

History paging requests `skip + limit` pages and appends them. It never
re-downloads all previously loaded commits when the user chooses Load more.

## Conflict workflow

When merge, rebase, cherry-pick, stash apply, or stash pop produces conflicts,
GitMin opens Working Tree, focuses the first conflict, and explains the active
operation. Continue stays disabled until the conflict count reaches zero.

Resolution labels describe intent in the current operation rather than only
showing raw `ours` and `theirs`; rebase includes a short explanation because
Git's side semantics are commonly misunderstood. Abort and destructive
resolution retain confirmation.

## Branch, remote, stash, and commit safety

- Opening a remote branch creates or switches to a local tracking branch;
  checking out a tag is explicitly labeled as detached HEAD.
- First push without an upstream asks for the target remote/branch instead of
  silently assuming `origin`.
- Force-delete is offered only for Git's unmerged-branch failure.
- Amending a likely published commit shows a stronger warning.
- Stash messages are optional. Apply/pop conflict outcomes enter the conflict
  workflow. Apply, pop, and drop remain keyboard- and pointer-reachable without
  relying on hover-only controls.

## Search and onboarding

The command palette becomes repository-aware. It searches commands, saved
repositories, local/remote branches, tags, loaded commits, and working-tree
paths, grouped by type with clear actions. The titlebar no longer promises
“Search Everywhere” unless these categories are active.

Importing one repository opens it immediately. Bulk import opens the first
repository and keeps the repository manager reachable. Primary refresh/sync
controls are disabled when there is no active repository and operation labels
state the Git action they perform.

## Accessibility and design-system alignment

Existing shared tokens, LoadingBar, MiniTabs, ToolButton, theme, and font-scale
contracts remain canonical. GitMin-specific composition stays in local CSS.
Interactive rows receive keyboard reachability and semantic roles; tabs expose
tab semantics, menus support arrow-key navigation, dialogs keep focus trapped,
and toasts announce through an aria-live region.

Legacy `redismin:*` storage keys are migrated to `gitmin:*` without discarding
existing user dimensions.

## Verification contract

Implementation is test-first. Regression coverage must prove:

- `MM` row identity and correct stage/unstage targeting;
- per-repository drafts, inspector modes, and operation isolation;
- one-layer Escape handling and focus/visibility synchronization;
- conflict gating and bulk-stage exclusion;
- tracking-branch and first-push safety decisions;
- optional stash messages and import-open behavior;
- granular invalidation and append-only graph paging;
- responsive access to Working Tree at the Tauri minimum width.

The final gate is TypeScript regression tests, existing layout/highlight tests,
production build, Rust tests, `git diff --check` when a repository is available,
and browser interaction checks in both themes at desktop and minimum width.

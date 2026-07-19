# Git resource dock design

## Goal

Reduce dock clutter while keeping common Git operations immediately available.

## Layout

- The left dock contains Workspace, at most five repositories, and the Working Tree.
- Every Working Tree subsection previews at most five rows and exposes `View all` when more rows exist.
- The commit composer is rendered outside the left scroll area and pinned to the bottom of the dock.
- The right `Actions` tab keeps a compact sync toolbar, then previews Local branches, Remotes, Tags, and Stashes with at most five rows per section.
- Every resource section exposes `View all` when its total exceeds five. The control opens a center workspace tab dedicated to that resource.

## Resource workspace tabs

A resource tab belongs to its repository and one resource kind: changes, branches, remotes, tags, or stashes. It shows the complete list and keeps the existing safe operations: select/diff/stage/unstage/discard for changes, checkout/context operations for refs, and apply/pop/drop for stashes.

## Interaction and safety

- Preview rows use a fixed content/action grid so labels and buttons never overlap.
- Clicking a ref selects/scopes the graph; double-clicking checks it out using existing checkout safety.
- Destructive operations continue through the existing confirmation dialogs.
- Empty and loading states remain explicit.

## Verification

Add contract and helper tests for the five-item preview rule, resource tabs, pinned composer placement, and the removal of resource lists from the left scroll area. Then run all UI contracts, TypeScript/Vite build, Rust tests, and a browser smoke test.

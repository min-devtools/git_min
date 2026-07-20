# Stage Selection Stability Implementation Plan

**Goal:** Prevent keyboard staging from moving the selection into the Staged section.

**Architecture:** Compute the adjacent row synchronously from the current painted status order, update selection, then run the existing stage operation. Keep reconciliation unchanged for mouse actions and other mutations.

## Task 1: Adjacent Selection Helper

- Add failing assertions for next, previous, and no adjacent row.
- Implement the smallest pure helper in `src/lib/gitUi.ts`.
- Run `npm run test:ui`.

## Task 2: Keyboard Stage Integration

- Use the helper in `RepoView.toggleStage` before `doStage` or `doUnstage`.
- Update both `selectedStatus` and `diff` to the adjacent row, or clear both.
- Run the production build and all existing test scripts.

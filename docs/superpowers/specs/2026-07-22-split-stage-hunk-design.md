# Split Stage Hunk Design

## Goal

Allow a developer to split one stageable diff hunk into smaller independently stageable hunks directly in the diff view, matching the intent of `s` in `git add -p`.

## Interaction

- Show `Split` immediately to the left of `Stage hunk` only when the current working-tree hunk contains at least two change groups separated by context lines.
- Do not show `Split` for an indivisible hunk or beside `Unstage hunk`.
- Clicking `Split` replaces the original hunk in place with one child hunk per change group. Each child keeps the available surrounding context and has its own `Stage hunk` action.
- Keep staging feedback and refresh behavior on the existing `doApplyHunk` path.

## Architecture

Add pure split and patch-building helpers to `diffModel.ts`. The split helper identifies contiguous non-context groups, gives adjacent children the shared context between them, recalculates each unified-diff range header, and preserves no-newline markers. `DiffBody` owns only the local expanded state and renders either the original hunk or its derived children.

No Rust command changes are required because the existing backend applies generated patches to the index with `git apply --cached --unidiff-zero`.

## Error Handling

An unsplittable hunk produces one unchanged hunk, so the UI omits the action. Patch application errors continue through the existing stage-hunk toast path.

## Verification

- Model tests cover two separated change groups, valid child headers and patches, preserved shared context, and an indivisible hunk.
- Run the focused diff-model test, production build, and workspace UI contract test.


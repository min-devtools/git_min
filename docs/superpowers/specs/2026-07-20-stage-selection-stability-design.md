# Stage Selection Stability Design

## Goal

Keep the keyboard selection in place when `a` stages or unstages a file instead of following that file into another status section.

## Behavior

- Before the keyboard stage toggle runs, select the next row in the same status section.
- If the selected row is last, select the previous row in that section.
- If it is the only row in that section, clear the selection and diff.
- Mouse stage and unstage buttons retain the existing follow-the-file behavior.

## Implementation

Add a pure helper in `gitUi.ts` that picks the adjacent row in the selected status area using painted order. Call it only from `RepoView`'s `a`/Space keyboard path before starting the Git operation.

## Verification

Cover next-row, previous-row, and only-row cases in `gitUi.test.ts`, then run the production build and all existing tests.

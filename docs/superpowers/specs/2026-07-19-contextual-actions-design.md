# Contextual Actions Design

## Goal

Make the Actions inspector reflect the commit and branch/ref the user actually selected, including branch pills in the graph, and provide quick remote and local Git actions without guessing targets.

## Selection contract

- Clicking a graph row selects only that commit and clears stale branch context.
- Clicking a branch/ref pill selects both the pill's ref and the commit that owns it.
- Clicking a Branches dock row selects only that ref and clears commit context.
- Actions reads `selectedCommit` and `selectedBranch`; it never derives a target from focus alone.

## Contextual actions

- Commit: Copy hash, Open commit on remote, Create branch here, Checkout detached, Cherry-pick.
- Local branch: Copy name, Open branch, Open/Create PR, Checkout, Merge into current, Rebase current onto selected, and Delete when it is not current.
- Remote branch: Copy name, Open branch, Open/Create PR, Checkout as tracking branch.
- Tag: Copy name, Open ref, Checkout tag. Tags never offer PR, merge, rebase, or delete.
- Existing Sync and Remotes sections remain available below contextual actions.

## Safety and errors

Existing action wrappers keep confirmations for cherry-pick, detached checkout, merge, rebase, and delete. Remote URLs continue through the configured external-browser helper. A missing or stale ref produces no destructive button because actions resolve the selected name against the current branch query.

## Verification

Pure tests cover pill ref parsing and PR source normalization. The workspace contract verifies GraphTable forwards pill selection and Actions receives both selection values. Full frontend tests, Rust tests, build, and `git diff --check` must pass.

# Split Stage Hunk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-place `Split` action that turns a divisible working-tree hunk into smaller independently stageable hunks.

**Architecture:** Keep hunk splitting as pure unified-diff model logic and keep expansion as local presentation state in `DiffBody`. Reuse the existing stage action and Rust patch command without changing repository operations.

**Tech Stack:** TypeScript, React 18, CSS, Tauri Git command bridge, `tsx` assertion tests

---

### Task 1: Split Unified Diff Hunks

**Files:**
- Modify: `src/lib/diffModel.test.ts`
- Modify: `src/lib/diffModel.ts`

- [ ] **Step 1: Write the failing split-model assertions**

Import `splitDiffHunk` and `buildPatchForHunk`, split the first fixture hunk, and assert that it produces two child hunks with recalculated headers, shared middle context, and standalone patches. Add an indivisible fixture and assert that it returns the original hunk as a one-item array.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx tsx src/lib/diffModel.test.ts`

Expected: FAIL because the new split helpers are not exported.

- [ ] **Step 3: Implement the pure hunk helpers**

In `src/lib/diffModel.ts`, identify non-context change groups, derive child ranges with shared context, rebuild `@@` ranges from each child's old/new line counts, preserve raw no-newline marker lines, and expose a patch builder for an arbitrary derived hunk.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npx tsx src/lib/diffModel.test.ts`

Expected: PASS with `diff model tests passed`.

### Task 2: Add the In-Place Split Action

**Files:**
- Modify: `src/components/views/DiffView.tsx`
- Modify: `src/styles/views.css`

- [ ] **Step 1: Render derived child hunks from local expansion state**

Key split state by the original hunk content, calculate children with `splitDiffHunk`, and render each child through the existing inline or side-by-side row components.

- [ ] **Step 2: Add the contextual button group**

Render `Split` to the left of `Stage hunk` only for working-tree hunks whose derived child count is greater than one. Give it a child-count tooltip and keep `Stage hunk` as the rightmost primary operation.

- [ ] **Step 3: Style the compact actions**

Add a flex action wrapper and give `Split` a quieter neutral treatment while retaining the existing focus ring, sizing, and sticky-header layout.

- [ ] **Step 4: Run production verification**

Run: `npx tsx src/lib/diffModel.test.ts && npm run build && npm run test:workspace`

Expected: all commands exit 0, the model test prints its success message, Vite builds production assets, and workspace contracts pass.

### Task 3: Review the Narrow Diff

**Files:**
- Review: `src/lib/diffModel.ts`
- Review: `src/lib/diffModel.test.ts`
- Review: `src/components/views/DiffView.tsx`
- Review: `src/styles/views.css`

- [ ] **Step 1: Check formatting and ownership boundaries**

Run: `git diff --check && git diff -- src/lib/diffModel.ts src/lib/diffModel.test.ts src/components/views/DiffView.tsx src/styles/views.css`

Expected: no whitespace errors; only split-hunk additions appear inside the four scoped files alongside pre-existing user changes.

# Diff Syntax Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tree-sitter syntax roles visually distinct in Diff and Blame views without washing them out under add/delete row tints.

**Architecture:** Keep parsing and markup unchanged. Scope richer semantic syntax variables to `.diff-view`, then reduce only the app-local add/delete background strength so every application theme supplies a coherent but readable palette.

**Tech Stack:** React, TypeScript, Tree-sitter, CSS custom properties, Node contract tests, Vite.

---

### Task 1: Add a failing Diff palette contract

**Files:**
- Modify: `tests/git-workspace-contract.test.mjs`
- Test: `tests/git-workspace-contract.test.mjs`

- [ ] **Step 1: Write the failing test**

Assert that `views.css` contains a `.diff-view` semantic palette mapping keywords to `--purple`, types to `--orange`, functions to `--blue-2`, and readable comment/punctuation mixes. Assert add/delete backgrounds use at least 94% transparency.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:workspace`
Expected: FAIL because the Diff View-scoped palette does not exist.

### Task 2: Implement the local visual fix

**Files:**
- Modify: `src/styles/views.css`

- [ ] **Step 1: Add the minimal semantic palette**

Add a `.diff-view` rule that maps syntax keyword/constant/type/function/property/comment/punctuation roles to existing theme colors while leaving strings, numbers, booleans, nulls, variables, parameters, and tags on the application palette.

- [ ] **Step 2: Quiet the diff row tint**

Change add/delete background mixes to 95% transparency while preserving their existing inset edge and markers.

- [ ] **Step 3: Run focused tests**

Run: `npm run test:workspace && npm run test:highlight`
Expected: both commands pass.

### Task 3: Verify compilation and rendered contrast

**Files:**
- Verify: `src/styles/views.css`
- Verify: `src/components/views/DiffView.tsx`

- [ ] **Step 1: Run production build and whitespace checks**

Run: `npm run build && git diff --check`
Expected: build exits 0 and diff check emits no errors.

- [ ] **Step 2: Render representative Java diff markup**

Start Vite, load the application CSS in a browser, inject representative Java diff markup using the existing `.diff-view`, `.diff-line`, and `.tok-*` classes, and capture a screenshot at the default dark theme.

- [ ] **Step 3: Inspect the screenshot**

Confirm keywords, types, functions, strings, properties, comments, and punctuation are distinguishable; add/delete state remains clear; and syntax colors are not washed out.

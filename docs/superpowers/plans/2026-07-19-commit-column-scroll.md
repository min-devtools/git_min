# Commit Column Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make only the Commit column in the main history table horizontally scrollable.

**Architecture:** Keep `GraphTable` and its virtualized vertical scroll unchanged. Adjust the existing Commit column CSS so its inner content stays at intrinsic width and the column provides native horizontal overflow, while sibling columns retain their fixed positions.

**Tech Stack:** React 18, TypeScript, CSS, Vite.

## Global Constraints

- Modify only `src/styles/views.css`; do not add state, handlers, dependencies, or custom scroll controls.
- Graph, Author, Hash, and When must remain stationary during Commit-column horizontal scrolling.
- Keep existing row selection, ref-chip actions, context-menu actions, and vertical history scrolling unchanged.

---

### Task 1: Make Commit Content Horizontally Scrollable

**Files:**
- Modify: `src/styles/views.css:269-277`
- Test: `src/styles/views.css` inspected through the production build

**Interfaces:**
- Consumes: `GraphTable` renders the Commit cell as `<span className="graph-subject">`, containing ref chips and `<span className="subject-text">`.
- Produces: `.graph-subject` owns horizontal overflow; `.subject-text` no longer clips the commit subject.

- [ ] **Step 1: Record the required CSS behavior before editing**

The existing rules clip the only desired scroll content:

```css
.graph-subject { flex: 1; min-width: 0; overflow: hidden; }
.subject-text { overflow: hidden; text-overflow: ellipsis; }
```

The replacement must keep `.graph-subject` as the flexible column, set `overflow-x: auto`, prevent child shrinking, and remove ellipsis clipping from `.subject-text`.

- [ ] **Step 2: Verify the current production build succeeds before the CSS change**

Run: `npm run build`

Expected: exit code `0`; the pre-change stylesheet still contains `overflow: hidden` for `.graph-subject` and `text-overflow: ellipsis` for `.subject-text`.

- [ ] **Step 3: Replace the Commit-column CSS with the minimal scroll rules**

Replace the existing rules with:

```css
.graph-subject {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
}
.subject-text { flex: none; white-space: nowrap; color: var(--text); }
```

Do not modify `.graph-author`, `.graph-hash`, or `.graph-time`.

- [ ] **Step 4: Verify the modified project**

Run: `npm run test:layout && npm run build`

Expected: `graphLayout: all assertions passed`; TypeScript and Vite build exit code `0`.

- [ ] **Step 5: Inspect the finished diff and commit**

Run: `git diff --check && git diff -- src/styles/views.css`

Expected: no whitespace errors; only Commit-column CSS changes.

```bash
git add src/styles/views.css
git commit -m "fix: scroll commit column"
```

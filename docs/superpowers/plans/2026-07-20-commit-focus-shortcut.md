# Commit Focus Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `c` reveal and focus the commit message while preserving branch checkout on `b`.

**Architecture:** Keep shortcut handling in `RepoView`, where Vim-style repository keys already live. Give `CommitComposer` a tab-scoped stable textarea ID so `RepoView` can focus the correct composer after revealing the inspector.

**Tech Stack:** React 18, TypeScript, Zustand, Vite

## Global Constraints

- Do not add dependencies or compatibility layers.
- Preserve existing guards that disable shortcuts during text entry and overlays.
- Do not modify unrelated existing worktree changes.

---

### Task 1: Remap Repository Shortcuts

**Files:**
- Modify: `src/components/WorkingTree.tsx:189-237`
- Modify: `src/components/views/RepoView.tsx:248-250`
- Modify: `src/components/KeymapOverlay.tsx:16-30`

**Interfaces:**
- Consumes: `tabId: string`, `patchRepoTab(tabId, patch)`, and Zustand's `rightCollapsed` state.
- Produces: DOM ID `commit-message-${tabId}` and the `c` focus behavior.

- [ ] **Step 1: Give the commit textarea a stable tab-scoped ID**

Add `id={`commit-message-${tabId}`}` to the existing textarea in `CommitComposer`.

- [ ] **Step 2: Remap `c` and preserve `b` checkout**

Replace the shared cases with:

```tsx
case "b": void doQuickCheckout(path); break;
case "c":
  e.preventDefault();
  useApp.setState({ rightCollapsed: false });
  patch({ focusedPanel: "changes", inspectorTab: "changes" });
  requestAnimationFrame(() => document.getElementById(`commit-message-${tabId}`)?.focus());
  break;
```

- [ ] **Step 3: Update shortcut documentation**

Replace the combined `c / b` row with separate rows describing `c` as commit-message focus and `b` as checkout.

- [ ] **Step 4: Run verification**

Run: `npm run build`

Expected: TypeScript and Vite production build complete successfully.

Run: `npm run test:ui`

Expected: Existing UI helper tests pass.

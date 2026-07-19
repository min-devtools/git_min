import type { BranchInfo, CommitInfo, StatusEntry } from "./types";

export type StatusSelection = Pick<StatusEntry, "path" | "area">;
export type NavigablePanel = "changes" | "branches" | "graph" | "files";
export type InspectorMode = "changes" | "diff" | "actions";

export function createRepoTabDefaults(repoId: string) {
  return {
    repoId,
    selectedCommit: null,
    selectedBranch: null,
    selectedStatus: null as StatusSelection | null,
    focusedPanel: "graph" as NavigablePanel,
    inspectorTab: "changes" as InspectorMode,
    diff: null as DiffTarget | null,
    blame: null as string | null,
    commitDraft: "",
    amend: false,
    aiRequestId: null as string | null,
    // HEAD, not all refs: --all on a repo with dozens of live branches opens one
    // rail per tip and the graph turns into a wall. "All refs" is one click away.
    graphScope: "HEAD" as string | null,
  };
}

export function hasCommitDraft(ui: Pick<ReturnType<typeof createRepoTabDefaults>, "commitDraft">): boolean {
  return ui.commitDraft.trim().length > 0;
}

export function canSubmitPrompt(value: string, allowEmpty: boolean): boolean {
  return allowEmpty || value.trim().length > 0;
}

export type MutationScope = "working-tree" | "history" | "stashes" | "remotes";

export function queryGroupsForMutation(scope: MutationScope): string[] {
  if (scope === "working-tree") return ["info", "status", "status-stats", "diff"];
  if (scope === "stashes") return ["info", "status", "status-stats", "stashes", "diff"];
  if (scope === "remotes") return ["info", "remotes"];
  return ["info", "status", "status-stats", "branches", "log", "diff", "commit"];
}

export function pageOffset(pageIndex: number, pageSize: number): number {
  return pageIndex * pageSize;
}

export function previewItems<T>(items: readonly T[], limit = 5): { visible: T[]; hidden: number } {
  return {
    visible: items.slice(0, limit),
    hidden: Math.max(0, items.length - limit),
  };
}

/** "src/ui/Icon.tsx" → { dir: "src/ui/", base: "Icon.tsx" } — dir is "" at repo root. */
export function splitPath(path: string): { dir: string; base: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { dir: "", base: path } : { dir: path.slice(0, i + 1), base: path.slice(i + 1) };
}

/** Normalize a git decoration into the ref name used by the branches query. */
export function refName(decoration: string): string {
  if (decoration.startsWith("HEAD -> ")) return decoration.slice(8);
  if (decoration.startsWith("tag: ")) return decoration.slice(5);
  return decoration;
}

/** Source branch accepted by remote PR creation pages; tags cannot open PRs. */
export function prSourceBranch(branch: Pick<BranchInfo, "name" | "kind">): string | null {
  if (branch.kind === "tag") return null;
  if (branch.kind === "remote") return branch.name.split("/").slice(1).join("/") || branch.name;
  return branch.name;
}

/** Group entries by parent folder, folders sorted, root ("") first. */
export function groupByFolder<T extends { path: string }>(entries: readonly T[]): { dir: string; entries: T[] }[] {
  const map = new Map<string, T[]>();
  for (const entry of entries) {
    const { dir } = splitPath(entry.path);
    const bucket = map.get(dir);
    if (bucket) bucket.push(entry);
    else map.set(dir, [entry]);
  }
  return [...map.entries()]
    .map(([dir, grouped]) => ({ dir, entries: grouped }))
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

/** stash mode: file carries the stash id (stash@{n}), label its message. */
export type DiffTarget = {
  mode: "commit" | "staged" | "worktree" | "untracked" | "stash";
  file: string;
  hash?: string;
  label?: string;
};

/** The diff a Working Tree row opens — staged reads the index, the rest the worktree. */
export function diffTargetFor(entry: StatusSelection): DiffTarget {
  return {
    mode: entry.area === "untracked" ? "untracked" : entry.area === "staged" ? "staged" : "worktree",
    file: entry.path,
  };
}

/** Which status areas a non-commit diff mode reads from. */
export function diffModeMatchesArea(mode: DiffTarget["mode"], area: StatusEntry["area"]): boolean {
  if (mode === "staged") return area === "staged";
  if (mode === "untracked") return area === "untracked";
  return area === "unstaged" || area === "conflict";
}

/** After a mutation moved files between index areas, retarget the open diff and the
 *  highlighted row to wherever the file went — or clear them when it left the tree.
 *  Returns only the fields that changed, or null when everything is still valid. */
export function reconcileStatusSelection(
  ui: { selectedStatus: StatusSelection | null; diff: DiffTarget | null },
  entries: StatusEntry[],
): { selectedStatus?: StatusSelection | null; diff?: DiffTarget | null } | null {
  const patch: { selectedStatus?: StatusSelection | null; diff?: DiffTarget | null } = {};
  const diff = ui.diff;
  // commit and stash diffs are snapshots — they never track the working tree
  if (diff && diff.mode !== "commit" && diff.mode !== "stash" && !entries.some((e) => e.path === diff.file && diffModeMatchesArea(diff.mode, e.area))) {
    const moved = entries.find((e) => e.path === diff.file);
    patch.diff = moved ? diffTargetFor(moved) : null;
  }
  const selected = ui.selectedStatus;
  if (selected && !entries.some((e) => isSameStatusEntry(e, selected))) {
    const moved = entries.find((e) => e.path === selected.path);
    patch.selectedStatus = moved ? { path: moved.path, area: moved.area } : null;
  }
  return Object.keys(patch).length ? patch : null;
}

export function statusEntryKey(entry: StatusSelection): string {
  return `${entry.area}:${entry.path}`;
}

export function isSameStatusEntry(entry: StatusSelection, selected: StatusSelection | null): boolean {
  return selected !== null && entry.path === selected.path && entry.area === selected.area;
}

export function countPhysicalChanges(entries: StatusEntry[]): number {
  return new Set(entries.map((entry) => entry.path)).size;
}

export function stageableEntries(entries: StatusEntry[]): StatusEntry[] {
  return entries.filter((entry) => entry.area === "unstaged" || entry.area === "untracked");
}

/** Rows in the exact order the Working Tree paints them: Conflicts, Staged, Unstaged,
 *  each folder-grouped in tree view. j/k must walk this — raw `git status` order sends
 *  the cursor jumping between sections (a staged file listed last renders first). */
export function visibleStatusOrder(entries: StatusEntry[], view: "flat" | "tree"): StatusEntry[] {
  const section = (list: StatusEntry[]) =>
    view === "tree" ? groupByFolder(list).flatMap((group) => group.entries) : list;
  return [
    ...section(entries.filter((entry) => entry.area === "conflict")),
    ...section(entries.filter((entry) => entry.area === "staged")),
    ...section(stageableEntries(entries)),
  ];
}

const PANEL_ORDER: NavigablePanel[] = ["changes", "branches", "graph", "files"];

export function nextPanel(panel: NavigablePanel, direction: -1 | 1): NavigablePanel {
  const index = PANEL_ORDER.indexOf(panel);
  return PANEL_ORDER[(index + direction + PANEL_ORDER.length) % PANEL_ORDER.length];
}

export function topInteractionLayer(state: {
  dialog: boolean;
  command: boolean;
  keymap: boolean;
  contextMenu: boolean;
}): "dialog" | "command" | "keymap" | "context-menu" | null {
  if (state.dialog) return "dialog";
  if (state.command) return "command";
  if (state.keymap) return "keymap";
  if (state.contextMenu) return "context-menu";
  return null;
}

export type BranchCheckoutTarget =
  | { kind: "local"; ref: string }
  | { kind: "tracking"; ref: string; localName: string }
  | { kind: "detached"; ref: string };

export function branchCheckoutTarget(branch: Pick<BranchInfo, "name" | "kind">): BranchCheckoutTarget {
  if (branch.kind === "local") return { kind: "local", ref: branch.name };
  if (branch.kind === "tag") return { kind: "detached", ref: branch.name };
  const slash = branch.name.indexOf("/");
  return {
    kind: "tracking",
    ref: branch.name,
    localName: slash >= 0 ? branch.name.slice(slash + 1) : branch.name,
  };
}

/** "origin/feature/x" → { remote: "origin", branch: "feature/x" } — null without a remote prefix. */
export function splitRemoteBranch(name: string): { remote: string; branch: string } | null {
  const slash = name.indexOf("/");
  if (slash <= 0 || slash === name.length - 1) return null;
  return { remote: name.slice(0, slash), branch: name.slice(slash + 1) };
}

/** Locals first, then remotes — the merged order used by the sidebar, lists and pickers. */
export function checkoutableBranches(refs: readonly BranchInfo[]): BranchInfo[] {
  return [...refs.filter((b) => b.kind === "local"), ...refs.filter((b) => b.kind === "remote")];
}

export function isBranchNotMergedError(error: unknown): boolean {
  return /not fully merged|is not merged/i.test(String(error));
}

/** Graph search: subject, author, hash prefix, and ref names (branches/tags) all match. */
export function matchesCommitQuery(
  commit: Pick<CommitInfo, "subject" | "author" | "hash" | "refs">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    commit.subject.toLowerCase().includes(q) ||
    commit.author.toLowerCase().includes(q) ||
    commit.hash.toLowerCase().startsWith(q) ||
    commit.refs.some((ref) => ref.toLowerCase().includes(q))
  );
}

/** Squeeze a staged diff down to what an LLM actually needs to name the change:
 *  file headers, hunk headers and the ± lines. Context lines, index/mode noise and
 *  long per-file tails are dropped — a 200 KB diff usually lands under 5 KB. */
export function condenseDiff(diff: string, maxChars = 6000, maxLinesPerFile = 40): string {
  const out: string[] = [];
  let kept = 0;
  let dropped = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      if (dropped) out.push(`… ${dropped} more changed lines`);
      kept = 0;
      dropped = 0;
      // "diff --git a/src/x.ts b/src/x.ts" → "--- src/x.ts"
      out.push(`--- ${line.slice(11).split(" b/")[0].replace(/^a\//, "")}`);
      continue;
    }
    if (/^(index |--- |\+\+\+ |new file|deleted file|old mode|new mode|similarity|rename |Binary )/.test(line)) continue;
    if (line.startsWith("@@")) {
      // keep only the trailing function context, the line numbers mean nothing here
      const context = line.split("@@")[2]?.trim();
      if (context) out.push(`@@ ${context}`);
      continue;
    }
    if (line.startsWith("+") || line.startsWith("-")) {
      if (kept < maxLinesPerFile) {
        out.push(line.length > 200 ? `${line.slice(0, 200)}…` : line);
        kept++;
      } else dropped++;
    }
  }
  if (dropped) out.push(`… ${dropped} more changed lines`);
  const text = out.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n… (diff truncated)` : text;
}

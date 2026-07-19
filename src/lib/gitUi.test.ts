const assert = {
  equal(actual: unknown, expected: unknown) {
    if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
  deepEqual(actual: unknown, expected: unknown) {
    const left = JSON.stringify(actual);
    const right = JSON.stringify(expected);
    if (left !== right) throw new Error(`expected ${right}, got ${left}`);
  },
};
import {
  branchCheckoutTarget,
  canSubmitPrompt,
  checkoutableBranches,
  condenseDiff,
  countPhysicalChanges,
  createRepoTabDefaults,
  diffModeMatchesArea,
  diffTargetFor,
  groupByFolder,
  hasCommitDraft,
  isBranchNotMergedError,
  isSameStatusEntry,
  nextPanel,
  pageOffset,
  previewItems,
  prSourceBranch,
  queryGroupsForMutation,
  refName,
  matchesCommitQuery,
  reconcileStatusSelection,
  splitPath,
  splitRemoteBranch,
  statusEntryKey,
  stageableEntries,
  topInteractionLayer,
  visibleStatusOrder,
} from "./gitUi";
import type { StatusEntry } from "./types";

const mm: StatusEntry[] = [
  { path: "src/app.ts", origPath: "", area: "staged", code: "MM" },
  { path: "src/app.ts", origPath: "", area: "unstaged", code: "MM" },
];
const conflict: StatusEntry = {
  path: "src/conflict.ts",
  origPath: "",
  area: "conflict",
  code: "UU",
};
const untracked: StatusEntry = {
  path: "notes.txt",
  origPath: "",
  area: "untracked",
  code: "??",
};

assert.equal(statusEntryKey(mm[0]), "staged:src/app.ts");
assert.equal(statusEntryKey(mm[1]), "unstaged:src/app.ts");
assert.equal(isSameStatusEntry(mm[0], { path: "src/app.ts", area: "staged" }), true);
assert.equal(isSameStatusEntry(mm[1], { path: "src/app.ts", area: "staged" }), false);
assert.equal(countPhysicalChanges([...mm, conflict, untracked]), 3);
assert.deepEqual(stageableEntries([...mm, conflict, untracked]), [mm[1], untracked]);

assert.equal(nextPanel("changes", 1), "branches");
assert.equal(nextPanel("branches", 1), "graph");
assert.equal(nextPanel("graph", 1), "files");
assert.equal(nextPanel("files", 1), "changes");
assert.equal(nextPanel("changes", -1), "files");

assert.deepEqual(splitPath("src/ui/Icon.tsx"), { dir: "src/ui/", base: "Icon.tsx" });
assert.deepEqual(splitPath(".gitignore"), { dir: "", base: ".gitignore" });
assert.deepEqual(groupByFolder([...mm, conflict, untracked]).map((g) => g.dir), ["", "src/"]);
assert.deepEqual(
  groupByFolder([...mm, conflict, untracked]).map((g) => g.entries.length),
  [1, 3],
);

assert.equal(refName("HEAD -> main"), "main");
assert.equal(refName("tag: v1.2.0"), "v1.2.0");
assert.equal(refName("origin/feature/payments"), "origin/feature/payments");
assert.equal(prSourceBranch({ name: "feature/payments", kind: "local" }), "feature/payments");
assert.equal(prSourceBranch({ name: "origin/feature/payments", kind: "remote" }), "feature/payments");
assert.equal(prSourceBranch({ name: "v1.2.0", kind: "tag" }), null);

assert.equal(
  topInteractionLayer({ dialog: true, command: true, keymap: true, contextMenu: true }),
  "dialog",
);
assert.equal(
  topInteractionLayer({ dialog: false, command: false, keymap: false, contextMenu: true }),
  "context-menu",
);
assert.equal(topInteractionLayer({ dialog: false, command: false, keymap: false, contextMenu: false }), null);

assert.deepEqual(branchCheckoutTarget({ name: "main", kind: "local" }), {
  kind: "local",
  ref: "main",
});
assert.deepEqual(branchCheckoutTarget({ name: "origin/feature/ui", kind: "remote" }), {
  kind: "tracking",
  ref: "origin/feature/ui",
  localName: "feature/ui",
});
assert.deepEqual(branchCheckoutTarget({ name: "v1.2.0", kind: "tag" }), {
  kind: "detached",
  ref: "v1.2.0",
});

assert.equal(isBranchNotMergedError("error: The branch 'topic' is not fully merged."), true);
assert.equal(isBranchNotMergedError("fatal: branch 'topic' not found"), false);

assert.deepEqual(createRepoTabDefaults("repo-1"), {
  repoId: "repo-1",
  selectedCommit: null,
  selectedBranch: null,
  selectedStatus: null,
  focusedPanel: "graph",
  inspectorTab: "changes",
  diff: null,
  blame: null,
  commitDraft: "",
  amend: false,
  aiRequestId: null,
  graphScope: "HEAD",
});
assert.equal(hasCommitDraft({ commitDraft: "  " }), false);
assert.equal(hasCommitDraft({ commitDraft: "fix repository isolation" }), true);
assert.equal(canSubmitPrompt("", false), false);
assert.equal(canSubmitPrompt("", true), true);
assert.equal(canSubmitPrompt(" branch-name ", false), true);
assert.deepEqual(queryGroupsForMutation("working-tree"), ["info", "status", "status-stats", "diff"]);
assert.deepEqual(queryGroupsForMutation("history"), ["info", "status", "status-stats", "branches", "log", "diff", "commit"]);
assert.deepEqual(queryGroupsForMutation("stashes"), ["info", "status", "status-stats", "stashes", "diff"]);
assert.deepEqual(queryGroupsForMutation("remotes"), ["info", "remotes"]);
assert.equal(pageOffset(0, 500), 0);
assert.equal(pageOffset(3, 500), 1500);

assert.deepEqual(previewItems([1, 2, 3, 4, 5, 6, 7, 8, 9]), {
  visible: [1, 2, 3, 4, 5],
  hidden: 4,
});

const c = { subject: "Fix rail colours", author: "Min", hash: "a1b2c3d4", refs: ["HEAD -> main", "tag: v1.2"] };
assert.equal(matchesCommitQuery(c, ""), true);
assert.equal(matchesCommitQuery(c, "rail"), true);
assert.equal(matchesCommitQuery(c, "min"), true);
assert.equal(matchesCommitQuery(c, "a1b2"), true);
assert.equal(matchesCommitQuery(c, "b2c3"), false); // hash matches by prefix only
assert.equal(matchesCommitQuery(c, "v1.2"), true); // tags and branches searchable
assert.equal(matchesCommitQuery(c, "nope"), false);

assert.deepEqual(diffTargetFor(mm[0]), { mode: "staged", file: "src/app.ts" });
assert.deepEqual(diffTargetFor(mm[1]), { mode: "worktree", file: "src/app.ts" });
assert.deepEqual(diffTargetFor(untracked), { mode: "untracked", file: "notes.txt" });
assert.deepEqual(diffTargetFor(conflict), { mode: "worktree", file: "src/conflict.ts" });
assert.equal(diffModeMatchesArea("worktree", "conflict"), true);
assert.equal(diffModeMatchesArea("staged", "unstaged"), false);

// stage-the-open-file: worktree diff follows the file into the index
const stagedOnly: StatusEntry[] = [{ path: "src/app.ts", origPath: "", area: "staged", code: "M." }];
assert.deepEqual(
  reconcileStatusSelection(
    { selectedStatus: { path: "src/app.ts", area: "unstaged" }, diff: { mode: "worktree", file: "src/app.ts" } },
    stagedOnly,
  ),
  { diff: { mode: "staged", file: "src/app.ts" }, selectedStatus: { path: "src/app.ts", area: "staged" } },
);
// partial stage: the worktree side still exists — nothing to retarget
assert.equal(
  reconcileStatusSelection(
    { selectedStatus: { path: "src/app.ts", area: "unstaged" }, diff: { mode: "worktree", file: "src/app.ts" } },
    mm,
  ),
  null,
);
// commit / discard: the file left the working tree entirely — clear both
assert.deepEqual(
  reconcileStatusSelection(
    { selectedStatus: { path: "src/app.ts", area: "staged" }, diff: { mode: "staged", file: "src/app.ts" } },
    [],
  ),
  { diff: null, selectedStatus: null },
);
// commit diffs are immutable — never retargeted
assert.equal(
  reconcileStatusSelection({ selectedStatus: null, diff: { mode: "commit", file: "src/app.ts", hash: "abc" } }, []),
  null,
);

assert.deepEqual(splitRemoteBranch("origin/feature/ui"), { remote: "origin", branch: "feature/ui" });
assert.equal(splitRemoteBranch("main"), null);
assert.equal(splitRemoteBranch("/oops"), null);
assert.equal(splitRemoteBranch("origin/"), null);

const branchStub = (name: string, kind: "local" | "remote" | "tag") =>
  ({ name, kind, hash: "", head: false, upstream: "", ahead: 0, behind: 0, time: 0, subject: "" });
assert.deepEqual(
  checkoutableBranches([
    branchStub("origin/main", "remote"),
    branchStub("v1", "tag"),
    branchStub("main", "local"),
  ]).map((b) => b.name),
  ["main", "origin/main"],
);

const rawDiff = [
  "diff --git a/src/app.ts b/src/app.ts",
  "index 111..222 100644",
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -1,5 +1,6 @@ function boot()",
  " const keep = 1;",
  "-const old = 2;",
  "+const next = 3;",
].join("\n");
const condensed = condenseDiff(rawDiff);
assert.equal(condensed, ["--- src/app.ts", "@@ function boot()", "-const old = 2;", "+const next = 3;"].join("\n"));
// per-file cap keeps the head and reports the tail
const fat = ["diff --git a/a.ts b/a.ts", ...Array.from({ length: 5 }, (_, i) => `+line ${i}`)].join("\n");
assert.equal(condenseDiff(fat, 6000, 2), ["--- a.ts", "+line 0", "+line 1", "\u2026 3 more changed lines"].join("\n"));

// j/k order must match the painted order: Conflicts, Staged, Unstaged — never raw status order
const mixed: StatusEntry[] = [
  { path: "z/late.ts", origPath: "", area: "unstaged", code: ".M" },
  { path: "a/early.ts", origPath: "", area: "staged", code: "M." },
  conflict,
  untracked,
];
assert.deepEqual(
  visibleStatusOrder(mixed, "flat").map((entry) => statusEntryKey(entry)),
  ["conflict:src/conflict.ts", "staged:a/early.ts", "unstaged:z/late.ts", "untracked:notes.txt"],
);
// tree view folder-groups within each section (root "" first), so untracked notes.txt leads
assert.deepEqual(
  visibleStatusOrder(mixed, "tree").map((entry) => entry.path),
  ["src/conflict.ts", "a/early.ts", "notes.txt", "z/late.ts"],
);

console.log("gitUi: all assertions passed");

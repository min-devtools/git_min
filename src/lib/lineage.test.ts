import assert from "node:assert";
import { lineage } from "./lineage.ts";
import type { CommitInfo } from "./types.ts";

const c = (hash: string, parents: string[], subject = hash, refs: string[] = []): CommitInfo => ({
  hash, parents, author: "t", email: "t@t", time: 0, refs, subject,
});

// develop ← release/v2.0.27 ← feature/A, all forked off base
const history = [
  c("dev2", ["dev1", "rel2"], "Merge branch 'release/v2.0.27' into develop", ["develop"]),
  c("dev1", ["base"], "dev work"),
  c("rel2", ["rel1", "feat2"], "Merge branch 'feature/A' into release/v2.0.27"),
  c("rel1", ["base"], "rel work", ["release/v2.0.27"]),
  c("feat2", ["feat1"], "A: second", ["origin/feature/A", "feature/A"]),
  c("feat1", ["base"], "A: first"),
  c("base", [], "v2.0.26", ["tag: v2.0.26"]),
];

const locals = new Set(["develop", "release/v2.0.27", "feature/A", "feature/B", "feature/C"]);

const l = lineage(history, "feat2", locals)!;
assert.strictEqual(l.branch, "feature/A", "named from its own refs");
assert.strictEqual(l.ownCommits, 2, "feat2 + feat1, stopping at the fork point");
assert.strictEqual(l.forkedFrom?.name, "v2.0.26", "forked off the base commit");
assert.deepStrictEqual(
  l.merges.map((m) => m.name),
  ["release/v2.0.27", "develop"],
  "landed in release first, then rode it into develop",
);

// an unmerged tip reports nothing downstream
const tip = lineage([c("t1", ["base"], "wip", ["feature/B"]), ...history], "t1", locals)!;
assert.deepStrictEqual(tip.merges, [], "feature/B was never merged");

// a commit whose fork point is off the loaded pages
const partial = lineage([c("x3", ["x2"], "tip", ["feature/C"]), c("x2", ["x1"], "b"), c("x1", ["gone"], "a")], "x2", locals)!;
assert.strictEqual(partial.forkedFrom, null, "no fork point in the loaded history");
assert.strictEqual(partial.branch, "feature/C", "unnamed commit takes the name of its line's tip");

// a tip carrying several refs: the remote never wins, and the rest are still reported
const shared = [c("s1", ["base"], "shared tip", ["origin/feature/PF-852", "feature/PF-852", "feature/other"]), ...history];
const many = lineage(shared, "s1", new Set(["feature/PF-852", "feature/other"]))!;
assert.strictEqual(many.branch, "feature/PF-852", "a local branch names the line, not the remote ref");
assert.deepStrictEqual(many.alsoAt, ["feature/other", "origin/feature/PF-852"], "the other refs on the tip are listed, locals first");

assert.strictEqual(lineage(history, null, locals), null, "no selection → no card");
assert.strictEqual(lineage(history, "nope", locals), null, "unknown hash → no card");

console.log("lineage: all assertions passed");

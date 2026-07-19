import assert from "node:assert";
import { branchLine, relatedLine, layoutGraph } from "./graphLayout.ts";
import type { CommitInfo } from "./types.ts";

const c = (hash: string, parents: string[]): CommitInfo => ({
  hash, parents, author: "t", email: "t@t", time: 0, refs: [], subject: hash,
});

// A → B(merge of C,D) → C,D fork from E
const rows = layoutGraph([
  c("A", ["B"]),
  c("B", ["C", "D"]),
  c("C", ["E"]),
  c("D", ["E"]),
  c("E", []),
]);

assert.strictEqual(rows[0].column, 0, "tip on rail 0");
assert.strictEqual(rows[0].hasTop, false, "tip has no rail above");
assert.strictEqual(rows[1].column, 0, "merge commit stays on rail 0");
assert.deepStrictEqual(rows[1].outputs, [1], "second parent opens rail 1");
assert.deepStrictEqual(rows[2].passes, [1], "rail 1 passes through C's row");
assert.strictEqual(rows[3].column, 1, "D sits on rail 1");
assert.strictEqual(rows[4].column, 0, "E back on rail 0");
assert.deepStrictEqual(rows[4].inputs, [1], "rail 1 merges into E");
assert.strictEqual(rows[4].hasBottom, false, "root has no rail below");

// two independent roots → second root gets its own rail
const rows2 = layoutGraph([c("X", ["R1"]), c("Y", ["R2"]), c("R1", []), c("R2", [])]);
assert.strictEqual(rows2[1].column, 1, "second tip on rail 1");
assert.strictEqual(rows2[3].column, 1, "second root stays on rail 1");

// octopus merge: three parents → two extra output rails
const rows3 = layoutGraph([c("M", ["P1", "P2", "P3"]), c("P1", []), c("P2", []), c("P3", [])]);
assert.deepStrictEqual(rows3[0].outputs, [1, 2], "octopus opens rails 1 and 2");

// branchLine: A→B(merge C,D)→E. D is the side branch, C the mainline.
const history = [c("A", ["B"]), c("B", ["C", "D"]), c("C", ["E"]), c("D", ["E"]), c("E", [])];
assert.strictEqual(branchLine(history, null), null, "no anchor → nothing dimmed");
assert.deepStrictEqual(
  [...branchLine(history, "C")!].sort(),
  ["A", "B", "C", "E"],
  "mainline: C's first-parent ancestry plus the commits that reach it",
);
assert.deepStrictEqual(
  [...branchLine(history, "D")!].sort(),
  ["D", "E"],
  "side branch stays out of the mainline — B reaches D as a second parent only",
);

// relatedLine: the merge path forward. From the side branch D, B merged it in,
// so B and its own descendant A come along.
assert.deepStrictEqual(
  [...relatedLine(history, "D")!].sort(),
  ["A", "B", "D", "E"],
  "side branch + where it landed — C is not on the path",
);
// mainline C: D forked off the same base but never feeds into C, so it stays dim
assert.deepStrictEqual(
  [...relatedLine(history, "C")!].sort(),
  ["A", "B", "C", "E"],
  "sibling branch merged into a descendant is not part of C's path",
);
// feature/A → release → main: three lines, one path
const flow = [
  c("main2", ["main1", "rel2"]), // main merges release
  c("main1", ["main0"]),
  c("rel2", ["rel1", "feat2"]), // release merges feature/A
  c("rel1", ["main0"]),
  c("feat2", ["feat1"]),
  c("feat1", ["main0"]),
  c("other", ["main0"]), // sibling branch off the same base — never merged
  c("main0", []),
];
assert.deepStrictEqual(
  [...relatedLine(flow, "feat2")!].sort(),
  ["feat1", "feat2", "main0", "main2", "rel2"],
  "feature → release merge → main merge, without the release/main commits it never touched",
);
assert.ok(!relatedLine(flow, "main2")!.has("other"), "clicking main does not light every branch forked off it");

// the backward walk stops at the fork point — base history below it stays dim
const deep = [c("feat", ["b2"]), c("b3", ["b2"]), c("b2", ["b1"]), c("b1", ["b0"]), c("b0", [])];
assert.deepStrictEqual(
  [...relatedLine(deep, "feat")!].sort(),
  ["b2", "feat"],
  "stops at b2 where the branch was created; b1/b0 are base history",
);

// first-parent edge metadata — the branch-line highlight depends on it.
// B merges D via its SECOND parent, so D's rail opens as a merge edge…
assert.strictEqual(rows[1].railFirst[1], false, "rail to D opened by a merge edge");
assert.strictEqual(rows[1].railFirst[0], true, "rail to C carries B's first parent");
// …but once D itself continues to E, that segment is D's own first-parent edge
assert.strictEqual(rows[3].railFirst[1], true, "D→E runs as D's first parent");
assert.deepStrictEqual(rows[4].inputFirst, [true], "E's input from D is first-parent");
assert.deepStrictEqual(rows[4].inputChilds, ["D"], "E's input rail was opened by D");
assert.strictEqual(rows[4].topFirst, true, "E's own top edge comes from C's first parent");
assert.strictEqual(rows[4].topChild, "C", "E continues C's line");

console.log("graphLayout: all assertions passed");

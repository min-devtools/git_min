import { buildHunkPatch, buildPatchForHunk, parseUnifiedDiff, splitDiffHunk } from "./diffModel";

const assert = Object.assign(
  (condition: unknown, message = "assertion failed") => { if (!condition) throw new Error(message); },
  {
    equal(actual: unknown, expected: unknown, message = "values differ") {
      if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    deepEqual(actual: unknown, expected: unknown, message = "values differ") {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
  },
);

const patch = [
  "diff --git a/src/app.ts b/src/app.ts",
  "index 1111111..2222222 100644",
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -10,4 +10,5 @@ export function total() {",
  " const subtotal = items.length;",
  "-return subtotal;",
  "+const tax = subtotal * 0.1;",
  "+return subtotal + tax;",
  " }",
  "@@ -30,2 +31,2 @@ export function label() {",
  "-return 'old';",
  "+return 'new';",
  " }",
  "",
].join("\n");

const model = parseUnifiedDiff(patch);
assert.equal(model.headers.length, 4);
assert.equal(model.hunks.length, 2);
assert.deepEqual(
  model.hunks[0].inline.map((line) => [line.kind, line.oldNumber, line.newNumber]),
  [
    ["context", 10, 10],
    ["delete", 11, null],
    ["add", null, 11],
    ["add", null, 12],
    ["context", 12, 13],
  ],
);

assert.equal(model.hunks[0].split.length, 4, "a deletion and first addition align on one split row");
assert.deepEqual(
  model.hunks[0].split.map((row) => [row.old?.number ?? null, row.new?.number ?? null, row.kind]),
  [
    [10, 10, "context"],
    [11, 11, "change"],
    [null, 12, "change"],
    [12, 13, "context"],
  ],
);

assert.deepEqual(model.oldSourceLines.slice(0, 5), [
  "const subtotal = items.length;",
  "return subtotal;",
  "}",
  "return 'old';",
  "}",
]);
assert.deepEqual(model.newSourceLines.slice(0, 6), [
  "const subtotal = items.length;",
  "const tax = subtotal * 0.1;",
  "return subtotal + tax;",
  "}",
  "return 'new';",
  "}",
]);

const firstHunkPatch = buildHunkPatch(model, 0);
assert(firstHunkPatch.startsWith("diff --git a/src/app.ts b/src/app.ts\n"));
assert(firstHunkPatch.includes("@@ -10,4 +10,5 @@"));
assert(!firstHunkPatch.includes("@@ -30,2 +31,2 @@"));

const untracked = parseUnifiedDiff("@@ -0,0 +1,2 @@\n+hello\n+world\n");
assert.deepEqual(untracked.hunks[0].inline.map((line) => line.newNumber), [1, 2]);
assert.deepEqual(untracked.oldSourceLines, []);
assert.deepEqual(untracked.newSourceLines, ["hello", "world"]);

const splittable = parseUnifiedDiff([
  "diff --git a/sample.txt b/sample.txt",
  "--- a/sample.txt",
  "+++ b/sample.txt",
  "@@ -1,10 +1,10 @@",
  " a",
  "-b",
  "+B",
  " c",
  " d",
  " e",
  " f",
  "-g",
  "+G",
  " h",
  " i",
  " j",
  "\\ No newline at end of file",
  "",
].join("\n"));
const splitHunks = splitDiffHunk(splittable.hunks[0]);
assert.equal(splitHunks.length, 2, "separated change groups split into two hunks");
assert.equal(splitHunks[0].header, "@@ -1,6 +1,6 @@");
assert.equal(splitHunks[1].header, "@@ -3,8 +3,8 @@");
assert.deepEqual(splitHunks[0].inline.slice(-4).map((line) => line.text), ["c", "d", "e", "f"]);
assert.deepEqual(splitHunks[1].inline.slice(0, 4).map((line) => line.text), ["c", "d", "e", "f"]);

const firstSplitPatch = buildPatchForHunk(splittable, splitHunks[0]);
assert(firstSplitPatch.includes("-b\n+B\n"));
assert(!firstSplitPatch.includes("-g\n+G\n"));
const secondSplitPatch = buildPatchForHunk(splittable, splitHunks[1]);
assert(!secondSplitPatch.includes("-b\n+B\n"));
assert(secondSplitPatch.includes("-g\n+G\n"));
assert(secondSplitPatch.includes("\\ No newline at end of file\n"), "split patches preserve no-newline markers");

const indivisible = splitDiffHunk(model.hunks[0]);
assert.equal(indivisible.length, 1);
assert.equal(indivisible[0], model.hunks[0], "an indivisible hunk is returned unchanged");

console.log("diff model tests passed");

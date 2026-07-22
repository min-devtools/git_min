import { parseConflicts, resolveConflictText } from "./conflictModel";

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

const FILE = [
  "top",
  "<<<<<<< HEAD",
  "ours line",
  "=======",
  "theirs line",
  ">>>>>>> feature/x",
  "middle",
  "<<<<<<< HEAD",
  "a",
  "=======",
  "b",
  ">>>>>>> feature/x",
  "bottom",
].join("\n") + "\n";

// parse: text/conflict segmentation
{
  const model = parseConflicts(FILE);
  assert.equal(model.conflictCount, 2);
  assert.deepEqual(model.segments.map((s) => s.kind), ["text", "conflict", "text", "conflict", "text"]);
  const first = model.segments[1];
  assert(first.kind === "conflict");
  if (first.kind === "conflict") {
    assert.deepEqual(first.ours, ["ours line"]);
    assert.deepEqual(first.theirs, ["theirs line"]);
    assert.equal(first.oursLabel, "HEAD");
    assert.equal(first.theirsLabel, "feature/x");
  }
}

// parse: diff3-style base section
{
  const model = parseConflicts("<<<<<<< HEAD\no\n||||||| merged common ancestors\nb\n=======\nt\n>>>>>>> x\n");
  const seg = model.segments[0];
  assert(seg.kind === "conflict");
  if (seg.kind === "conflict") {
    assert.deepEqual(seg.base, ["b"]);
    assert.equal(seg.baseLabel, "merged common ancestors");
    assert.deepEqual(seg.ours, ["o"]);
    assert.deepEqual(seg.theirs, ["t"]);
  }
}

// parse: an unterminated marker stays plain text
{
  const model = parseConflicts("<<<<<<< HEAD\nours only\n");
  assert.equal(model.conflictCount, 0);
  assert.deepEqual(model.segments, [{ kind: "text", lines: ["<<<<<<< HEAD", "ours only"] }]);
}

// resolve: chosen side kept, other conflicts intact, trailing newline preserved
{
  const next = resolveConflictText(parseConflicts(FILE), 0, "theirs");
  assert(next.includes("top\ntheirs line\nmiddle"), "theirs kept");
  assert(!next.includes("ours line"), "ours dropped");
  assert(next.includes("<<<<<<< HEAD\na\n=======\nb\n>>>>>>> feature/x"), "second conflict untouched");
  assert(next.endsWith("\n"), "trailing newline preserved");
}

// resolve: both = ours then theirs
{
  const next = resolveConflictText(parseConflicts(FILE), 1, "both");
  assert(next.includes("middle\na\nb\nbottom"), "both sides in order");
}

// resolve: diff3 base round-trips when another conflict is resolved
{
  const text = "<<<<<<< HEAD\no\n||||||| base\nb\n=======\nt\n>>>>>>> x\nmid\n<<<<<<< HEAD\n1\n=======\n2\n>>>>>>> x\n";
  const next = resolveConflictText(parseConflicts(text), 1, "ours");
  assert(next.includes("||||||| base\nb\n======="), "base section round-trips");
  assert(next.includes("mid\n1\n"), "second conflict resolved to ours");
}

console.log("conflict model tests passed");

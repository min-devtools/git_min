export type DiffLineKind = "context" | "delete" | "add";

export type DiffInlineLine = {
  kind: DiffLineKind;
  text: string;
  oldNumber: number | null;
  newNumber: number | null;
  oldSourceIndex: number | null;
  newSourceIndex: number | null;
};

export type DiffCell = {
  kind: "context" | "delete" | "add";
  number: number;
  text: string;
  sourceIndex: number;
};

export type DiffSplitRow = {
  kind: "context" | "change";
  old: DiffCell | null;
  new: DiffCell | null;
};

export type DiffHunk = {
  header: string;
  inline: DiffInlineLine[];
  split: DiffSplitRow[];
  rawLines: string[];
};

export type UnifiedDiffModel = {
  headers: string[];
  hunks: DiffHunk[];
  oldSourceLines: string[];
  newSourceLines: string[];
};

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function splitRows(lines: DiffInlineLine[]): DiffSplitRow[] {
  const rows: DiffSplitRow[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (line.kind === "context") {
      rows.push({
        kind: "context",
        old: { kind: "context", number: line.oldNumber!, text: line.text, sourceIndex: line.oldSourceIndex! },
        new: { kind: "context", number: line.newNumber!, text: line.text, sourceIndex: line.newSourceIndex! },
      });
      index++;
      continue;
    }

    const deleted: DiffInlineLine[] = [];
    const added: DiffInlineLine[] = [];
    while (index < lines.length && lines[index].kind === "delete") deleted.push(lines[index++]);
    while (index < lines.length && lines[index].kind === "add") added.push(lines[index++]);
    // A valid unified patch normally orders delete before add. Preserve standalone
    // additions too, including new-file hunks whose first row is `+`.
    if (!deleted.length && !added.length && line.kind === "add") {
      while (index < lines.length && lines[index].kind === "add") added.push(lines[index++]);
    }
    const count = Math.max(deleted.length, added.length);
    for (let pair = 0; pair < count; pair++) {
      const oldLine = deleted[pair];
      const newLine = added[pair];
      rows.push({
        kind: "change",
        old: oldLine ? { kind: "delete", number: oldLine.oldNumber!, text: oldLine.text, sourceIndex: oldLine.oldSourceIndex! } : null,
        new: newLine ? { kind: "add", number: newLine.newNumber!, text: newLine.text, sourceIndex: newLine.newSourceIndex! } : null,
      });
    }
  }
  return rows;
}

export function parseUnifiedDiff(text: string): UnifiedDiffModel {
  const lines = text.replace(/\n$/, "").split("\n");
  const headers: string[] = [];
  const hunks: DiffHunk[] = [];
  const oldSourceLines: string[] = [];
  const newSourceLines: string[] = [];
  let current: DiffHunk | null = null;
  let oldNumber = 0;
  let newNumber = 0;

  for (const raw of lines) {
    const match = HUNK_RE.exec(raw);
    if (match) {
      if (current) current.split = splitRows(current.inline);
      current = { header: raw, inline: [], split: [], rawLines: [raw] };
      hunks.push(current);
      oldNumber = Number(match[1]);
      newNumber = Number(match[2]);
      continue;
    }
    if (!current) {
      if (raw) headers.push(raw);
      continue;
    }
    if (raw.startsWith("\\ No newline at end of file")) {
      current.rawLines.push(raw);
      continue;
    }

    const marker = raw[0] ?? " ";
    const code = raw.slice(1);
    if (marker === "-") {
      const sourceIndex = oldSourceLines.push(code) - 1;
      current.inline.push({ kind: "delete", text: code, oldNumber, newNumber: null, oldSourceIndex: sourceIndex, newSourceIndex: null });
      oldNumber++;
    } else if (marker === "+") {
      const sourceIndex = newSourceLines.push(code) - 1;
      current.inline.push({ kind: "add", text: code, oldNumber: null, newNumber, oldSourceIndex: null, newSourceIndex: sourceIndex });
      newNumber++;
    } else {
      const oldSourceIndex = oldSourceLines.push(marker === " " ? code : raw) - 1;
      const newSourceIndex = newSourceLines.push(marker === " " ? code : raw) - 1;
      current.inline.push({
        kind: "context",
        text: marker === " " ? code : raw,
        oldNumber,
        newNumber,
        oldSourceIndex,
        newSourceIndex,
      });
      oldNumber++;
      newNumber++;
    }
    current.rawLines.push(raw);
  }
  if (current) current.split = splitRows(current.inline);
  return { headers, hunks, oldSourceLines, newSourceLines };
}

export function buildHunkPatch(model: UnifiedDiffModel, hunkIndex: number): string {
  const hunk = model.hunks[hunkIndex];
  if (!hunk) return "";
  return [...model.headers, ...hunk.rawLines].join("\n") + "\n";
}

/** Parse `<<<<<<< / ======= / >>>>>>>` conflict markers into renderable segments
 *  and rebuild file text after the user accepts a side — the VS Code-style merge
 *  editor in the diff tab runs on this model. */

export type ConflictBlock = {
  kind: "conflict";
  /** lines between <<<<<<< and ======= (or |||||||) */
  ours: string[];
  /** diff3 style: lines between ||||||| and =======, null without diff3 */
  base: string[] | null;
  baseLabel: string;
  /** lines between ======= and >>>>>>> */
  theirs: string[];
  /** label after <<<<<<< (e.g. "HEAD") */
  oursLabel: string;
  /** label after >>>>>>> (e.g. "feature/x") */
  theirsLabel: string;
};

export type ConflictSegment = { kind: "text"; lines: string[] } | ConflictBlock;

export type ConflictModel = {
  segments: ConflictSegment[];
  conflictCount: number;
  /** original file ended with \n — preserved on rebuild */
  trailingNewline: boolean;
};

export type ConflictChoice = "ours" | "theirs" | "both";

export function parseConflicts(text: string): ConflictModel {
  const trailingNewline = text.endsWith("\n");
  const lines = (trailingNewline ? text.slice(0, -1) : text).split("\n");
  const segments: ConflictSegment[] = [];
  let plain: string[] = [];
  let conflictCount = 0;

  const flush = () => {
    if (plain.length) segments.push({ kind: "text", lines: plain });
    plain = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("<<<<<<<")) {
      plain.push(line);
      continue;
    }
    // scan forward for a complete marker triple; bail to plain text if broken
    const ours: string[] = [];
    let base: string[] | null = null;
    const theirs: string[] = [];
    let stage: "ours" | "base" | "theirs" = "ours";
    let end = -1;
    let theirsLabel = "";
    let baseLabel = "";
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (stage !== "theirs" && l.startsWith("|||||||")) { stage = "base"; base = []; baseLabel = l.slice(7).trim(); continue; }
      if (stage !== "theirs" && l === "=======") { stage = "theirs"; continue; }
      if (stage === "theirs" && l.startsWith(">>>>>>>")) { end = j; theirsLabel = l.slice(7).trim(); break; }
      if (stage === "ours") ours.push(l);
      else if (stage === "base") base!.push(l);
      else theirs.push(l);
    }
    if (end < 0) {
      plain.push(line);
      continue;
    }
    flush();
    segments.push({ kind: "conflict", ours, base, baseLabel, theirs, oursLabel: line.slice(7).trim(), theirsLabel });
    conflictCount++;
    i = end;
  }
  flush();
  return { segments, conflictCount, trailingNewline };
}

/** File text with conflict #index replaced by the chosen side; other conflicts
 *  keep their raw markers so they stay resolvable. */
export function resolveConflictText(model: ConflictModel, index: number, choice: ConflictChoice): string {
  const out: string[] = [];
  let seen = 0;
  for (const seg of model.segments) {
    if (seg.kind === "text") {
      out.push(...seg.lines);
      continue;
    }
    if (seen++ === index) {
      if (choice === "ours" || choice === "both") out.push(...seg.ours);
      if (choice === "theirs" || choice === "both") out.push(...seg.theirs);
    } else {
      out.push(...rawConflictLines(seg));
    }
  }
  return out.join("\n") + (model.trailingNewline ? "\n" : "");
}

function rawConflictLines(seg: ConflictBlock): string[] {
  return [
    `<<<<<<< ${seg.oursLabel}`.trimEnd(),
    ...seg.ours,
    ...(seg.base ? [`||||||| ${seg.baseLabel}`.trimEnd(), ...seg.base] : []),
    "=======",
    ...seg.theirs,
    `>>>>>>> ${seg.theirsLabel}`.trimEnd(),
  ];
}

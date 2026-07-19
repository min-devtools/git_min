import type { CommitInfo } from "./types";

/**
 * One rendered graph row. Coordinates are rail indices; the row's svg draws:
 * - a dot at `column`
 * - straight lines for `passes` (rails running top→bottom untouched)
 * - curves top(i)→dot for `inputs` (rails merging into this commit)
 * - curves dot→bottom(j) for `outputs` (extra parent rails of a merge)
 * - the commit's own rail: top→dot when `hasTop`, dot→bottom when `hasBottom`
 */
export interface GraphRow {
  hash: string;
  column: number;
  hasTop: boolean;
  hasBottom: boolean;
  passes: number[];
  inputs: number[];
  outputs: number[];
  /** active rail count — drives the svg viewBox width */
  width: number;
  /** rails[i] after this row: the commit each rail runs down to (null = rail ended).
   *  Lets a renderer tell which rail segments belong to a given branch line. */
  railHashes: (string | null)[];
  /** rails[i] after this row carries a first-parent edge (false = merge edge) */
  railFirst: boolean[];
  /** child commit whose parent pointer opened rails[i] (after this row) */
  railChilds: (string | null)[];
  /** parallel to inputs: was that incoming rail a first-parent edge, and whose */
  inputFirst: boolean[];
  inputChilds: (string | null)[];
  /** the edge running into this row's own dot from above */
  topFirst: boolean;
  topChild: string | null;
}

/**
 * The commits that read as "the same line" as `anchor`: its first-parent
 * ancestry plus every commit that reaches it through first parents. That is the
 * lane a branch tip draws, so highlighting this set highlights one branch line.
 * Returns null when there is no anchor (nothing to dim).
 */
export function branchLine(commits: CommitInfo[], anchor: string | null): Set<string> | null {
  if (!anchor) return null;
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  if (!byHash.has(anchor)) return null;

  const line = new Set<string>([anchor]);
  // down: follow first parents (commits are newest-first, so this walks older)
  for (let h: string | undefined = byHash.get(anchor)!.parents[0]; h && byHash.has(h) && !line.has(h);) {
    line.add(h);
    h = byHash.get(h)!.parents[0];
  }
  // up: commits that reach the anchor through first parents. Seeded with the
  // anchor alone — seeding with its ancestors would drag in every sibling
  // branch that forked off them. One oldest-first pass suffices: a parent is
  // always visited before its child.
  const up = new Set<string>([anchor]);
  for (let i = commits.length - 1; i >= 0; i--) {
    const c = commits[i];
    if (c.parents[0] && up.has(c.parents[0])) {
      up.add(c.hash);
      line.add(c.hash);
    }
  }
  return line;
}

/**
 * `anchor`'s line plus the merge path forward from it: every commit that reaches
 * the anchor through ANY parent, so feature/A → the release it merged into → the
 * main it landed in all light up as one path.
 *
 * Only forward. Branches that merely forked off the same base are NOT related —
 * seeding this walk with the whole line would light up every sibling branch.
 * Backwards it stops at the fork point, so the base branch's history stays dim.
 */
export function relatedLine(commits: CommitInfo[], anchor: string | null): Set<string> | null {
  if (!anchor) return null;
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  if (!byHash.has(anchor)) return null;

  // how many commits continue a given commit as THEIR first parent. >1 means the
  // line forks there — other branches were checked out from it. Merge edges don't
  // count: a feature commit merged into release is still one line, not a fork.
  const forks = new Map<string, number>();
  for (const c of commits) {
    const p = c.parents[0];
    if (p) forks.set(p, (forks.get(p) ?? 0) + 1);
  }

  const line = new Set<string>([anchor]);
  // back: the line's own commits, stopping AT the fork point it was created from.
  // Walking past it would light up the base branch's whole history.
  for (let h = byHash.get(anchor)!.parents[0]; h && byHash.has(h) && !line.has(h); ) {
    line.add(h);
    if ((forks.get(h) ?? 0) > 1) break;
    h = byHash.get(h)!.parents[0];
  }
  // one oldest-first pass: a parent is always visited before its children
  const down = new Set<string>([anchor]);
  for (let i = commits.length - 1; i >= 0; i--) {
    const c = commits[i];
    if (c.parents.some((p) => down.has(p))) {
      down.add(c.hash);
      line.add(c.hash);
    }
  }
  return line;
}

/**
 * Classic active-rails column assignment over a topo-ordered (newest-first)
 * commit list. Pure function; O(rows × rails).
 */
/** Index of the free rail closest to `from`, or -1 when every rail is taken. */
function nearestFree(rails: (string | null)[], from: number): number {
  let best = -1;
  rails.forEach((h, i) => {
    if (h !== null) return;
    if (best < 0 || Math.abs(i - from) < Math.abs(best - from)) best = i;
  });
  return best;
}

export function layoutGraph(commits: CommitInfo[]): GraphRow[] {
  /** rails[i] = hash the rail expects next (null = free) */
  const rails: (string | null)[] = [];
  /** edge metadata per rail: is it a first-parent edge, and which child opened it */
  const railIsFirst: boolean[] = [];
  const railChild: (string | null)[] = [];
  const rows: GraphRow[] = [];

  for (const c of commits) {
    const prev = rails.slice();
    const prevFirst = railIsFirst.slice();
    const prevChild = railChild.slice();
    const expecting: number[] = [];
    prev.forEach((h, i) => {
      if (h === c.hash) expecting.push(i);
    });

    let column: number;
    if (expecting.length === 0) {
      const free = rails.indexOf(null);
      column = free >= 0 ? free : rails.length;
      if (free < 0) {
        rails.push(null);
        railIsFirst.push(false);
        railChild.push(null);
      }
    } else {
      column = expecting[0];
    }
    for (const i of expecting) {
      if (i !== column) {
        rails[i] = null;
        railIsFirst[i] = false;
        railChild[i] = null;
      }
    }

    const [first, ...extra] = c.parents;
    rails[column] = first ?? null;
    railIsFirst[column] = first != null;
    railChild[column] = first != null ? c.hash : null;

    const outputs: number[] = [];
    for (const p of extra) {
      let j = rails.findIndex((h) => h === p);
      if (j < 0) {
        // nearest free rail, not the leftmost: the merge curve has to cross every
        // column between the dot and its second parent inside one row's height
        j = nearestFree(rails, column);
        if (j < 0) {
          j = rails.length;
          rails.push(p);
        } else {
          rails[j] = p;
        }
        // merge edge — never part of a first-parent branch line
        railIsFirst[j] = false;
        railChild[j] = c.hash;
      }
      // shared rail (another child already expects p): keep its stronger metadata
      outputs.push(j);
    }

    const passes: number[] = [];
    rails.forEach((h, i) => {
      if (i !== column && h !== null && prev[i] === h) passes.push(i);
    });

    const inputs = expecting.filter((i) => i !== column);
    rows.push({
      hash: c.hash,
      column,
      hasTop: expecting.length > 0,
      hasBottom: first != null,
      passes,
      inputs,
      outputs,
      width: rails.length,
      railHashes: rails.slice(),
      railFirst: railIsFirst.slice(),
      railChilds: railChild.slice(),
      inputFirst: inputs.map((i) => prevFirst[i]),
      inputChilds: inputs.map((i) => prevChild[i]),
      topFirst: expecting.length > 0 && prevFirst[column],
      topChild: expecting.length > 0 ? prevChild[column] : null,
    });
  }

  // free trailing rails don't need width — clamp each row to the widest rail it draws
  for (const r of rows) {
    const used = Math.max(r.column, ...r.passes, ...r.inputs, ...r.outputs, 0);
    r.width = Math.min(r.width, used + 1);
  }
  return rows;
}

import type { CommitInfo } from "./types";
import { refName } from "./gitUi";

export interface LineageStep {
  hash: string;
  /** branch the line landed in at this step */
  name: string;
  subject: string;
  time: number;
}

export interface Lineage {
  /** name of the line the selected commit sits on */
  branch: string;
  /** other refs sitting on the selected commit — several branches often share a tip */
  alsoAt: string[];
  /** where the line was created from — null when it reaches the loaded history's end */
  forkedFrom: { hash: string; name: string } | null;
  /** commits on the line itself, from the selected commit back to the fork point */
  ownCommits: number;
  /** merges that carried this line onwards, oldest first */
  merges: LineageStep[];
}

/** Refs on a commit, local branches first. `locals` is the repo's real branch
 *  list — guessing locality from the name ranked "origin/feature/x" as a local
 *  branch and made the card name the wrong ref when a tip carries several. */
function refsRanked(refs: string[], locals: ReadonlySet<string>): string[] {
  const names = refs.map(refName).filter((n) => n !== "HEAD");
  return [...names.filter((n) => locals.has(n)), ...names.filter((n) => !locals.has(n))];
}

function bestRef(refs: string[], locals: ReadonlySet<string>): string | null {
  return refsRanked(refs, locals)[0] ?? null;
}

/** `Merge branch 'x' into develop` / `Merge remote-tracking … into develop` */
function mergeTarget(subject: string): string | null {
  const m = /\binto ([^\s'"]+)/.exec(subject);
  return m ? m[1] : null;
}

/**
 * How the selected commit's line relates to the rest of the history: where it
 * was branched from and which lines it has been merged into since.
 *
 * Reads only the commits already loaded in the graph, so a line whose fork point
 * is older than the loaded pages reports `forkedFrom: null` rather than lying.
 */
export function lineage(commits: CommitInfo[], hash: string | null, locals: ReadonlySet<string>): Lineage | null {
  if (!hash) return null;
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  const head = byHash.get(hash);
  if (!head) return null;

  // first-parent children: who continues a commit's own line (merge edges excluded)
  const fpChildren = new Map<string, string[]>();
  for (const c of commits) {
    const p = c.parents[0];
    if (p) fpChildren.set(p, [...(fpChildren.get(p) ?? []), c.hash]);
  }

  /** name of the line a commit belongs to: its refs, its merge message, or the
   *  nearest ref forward along the same line */
  const lineNameOf = (start: CommitInfo): string => {
    for (let c: CommitInfo | undefined = start, hops = 0; c && hops < 500; hops++) {
      const ref = bestRef(c.refs, locals);
      if (ref) return ref;
      const target = mergeTarget(c.subject);
      if (target) return target;
      const next = fpChildren.get(c.hash);
      if (!next?.length) break;
      c = byHash.get(next[0]);
    }
    return start.hash.slice(0, 7);
  };

  // back to the fork point: the first commit other branches also continue from
  let ownCommits = 1;
  let forkedFrom: Lineage["forkedFrom"] = null;
  for (let h = head.parents[0], seen = new Set([head.hash]); h && byHash.has(h) && !seen.has(h); ) {
    seen.add(h);
    const c = byHash.get(h)!;
    if ((fpChildren.get(h) ?? []).length > 1) {
      forkedFrom = { hash: h, name: lineNameOf(c) };
      break;
    }
    ownCommits++;
    h = c.parents[0];
  }

  // forward: every commit reaching the selection through any parent. Oldest-first
  // single pass — parents always come before their children in a topo log.
  const reached = new Set([hash]);
  const merges: LineageStep[] = [];
  for (let i = commits.length - 1; i >= 0; i--) {
    const c = commits[i];
    if (!c.parents.some((p) => reached.has(p))) continue;
    reached.add(c.hash);
    // a merge whose FIRST parent is off the line is another line taking ours in
    if (c.parents.length > 1 && !reached.has(c.parents[0]))
      merges.push({ hash: c.hash, name: lineNameOf(c), subject: c.subject, time: c.time });
  }

  const ranked = refsRanked(head.refs, locals);
  const branch = lineNameOf(head);
  return { branch, alsoAt: ranked.filter((n) => n !== branch), forkedFrom, ownCommits, merges };
}

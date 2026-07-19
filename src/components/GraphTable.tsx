import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { relatedLine, layoutGraph, type GraphRow } from "../lib/graphLayout";
import { timeAgo, shortHash } from "../lib/format";
import type { CommitInfo } from "../lib/types";
import { ContextMenu } from "../ui/ContextMenu";
import { doCheckout, doCherryPick, doCreateBranch, openOnRemote } from "../lib/actions";
import { useApp } from "../store";
import { refName } from "../lib/gitUi";

export const ROW_H = 28;
const COL_W = 12;
const RAIL_COLORS = 8;

function railX(i: number) {
  return i * COL_W + COL_W / 2;
}

function RowRails({ row, line }: { row: GraphRow; line: Set<string> | null }) {
  const w = row.width * COL_W;
  const xd = railX(row.column);
  const mid = ROW_H / 2;
  const stroke = (i: number) => `var(--graph-rail-${(i % RAIL_COLORS) + 1})`;
  // The highlighted line is a FIRST-PARENT chain. An edge is hot when:
  //  - it is a first-parent edge with BOTH ends on the line (the line's own body,
  //    including where it forked off its base), or
  //  - it is a merge edge whose PARENT end is on the line — the line being merged
  //    into some other branch, so the reader sees where it landed.
  // A side branch merging INTO an on-line commit stays dim: its child end is off
  // the line and it arrives via ITS OWN first-parent edges, which fail both rules.
  const on = (h: string | null | undefined) => !!(h && line!.has(h));
  const edge = (first: boolean, child: string | null | undefined, parent: string | null | undefined) =>
    first ? on(child) && on(parent) : on(parent);
  const own = !line ? "" : on(row.hash) ? "hot" : "dim";
  // the rail leaving this dot continues to its first parent — dim it when that
  // parent is off the line, otherwise the fork point trails a stub into nothing
  const bottom = !line ? "" : edge(true, row.hash, row.railHashes[row.column]) ? "hot" : "dim";
  const seg = (i: number) =>
    !line ? "" : edge(row.railFirst[i], row.railChilds[i], row.railHashes[i]) ? "hot" : "dim";
  const top = !line ? "" : edge(row.topFirst, row.topChild, row.hash) ? "hot" : "dim";
  const input = (k: number) =>
    !line ? "" : edge(row.inputFirst[k], row.inputChilds[k], row.hash) ? "hot" : "dim";
  return (
    <svg className="graph-rails" width={w} height={ROW_H} viewBox={`0 0 ${w} ${ROW_H}`}>
      {row.passes.map((i) => (
        <line key={`p${i}`} className={seg(i)} x1={railX(i)} y1={0} x2={railX(i)} y2={ROW_H} stroke={stroke(i)} />
      ))}
      {row.hasTop && <line className={top} x1={xd} y1={0} x2={xd} y2={mid} stroke={stroke(row.column)} />}
      {row.hasBottom && <line className={bottom} x1={xd} y1={mid} x2={xd} y2={ROW_H} stroke={stroke(row.column)} />}
      {row.inputs.map((i, k) => (
        <path
          key={`i${i}`}
          className={input(k)}
          d={`M ${railX(i)} 0 C ${railX(i)} ${mid * 0.9}, ${xd} ${mid * 0.4}, ${xd} ${mid}`}
          stroke={stroke(i)}
          fill="none"
        />
      ))}
      {row.outputs.map((j) => (
        <path
          key={`o${j}`}
          className={!line ? "" : on(row.railHashes[j]) ? "hot" : "dim"}
          d={`M ${xd} ${mid} C ${xd} ${mid * 1.6}, ${railX(j)} ${mid * 1.1}, ${railX(j)} ${ROW_H}`}
          stroke={stroke(j)}
          fill="none"
        />
      ))}
      <circle className={`graph-dot ${own}`} cx={xd} cy={mid} r={3.5} fill={stroke(row.column)} />
    </svg>
  );
}

function hashHsl(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0x7fffffff;
  const hue = h % 360;
  const sat = 60 + (h % 15);
  const light = 65 + (h % 11);
  return { color: `hsl(${hue} ${sat}% ${light}%)`, bg: `hsl(${hue} ${sat}% ${light}% / 0.13)` };
}

function RefChips({ refs, pinned, remoteBranches, onPin, onSelectRef }: {
  refs: string[];
  pinned: boolean;
  remoteBranches: Set<string>;
  onPin: (additive: boolean) => void;
  onSelectRef: (name: string) => void;
}) {
  return (
    <>
      {refs.map((r) => {
        const head = r.startsWith("HEAD ->") || r === "HEAD";
        const tag = r.startsWith("tag: ");
        const name = refName(r);
        const remote = !head && !tag && remoteBranches.has(name);
        const cls = `ref-chip ${head ? "head" : tag ? "tag" : remote ? "remote" : "local"}`;
        const chipColor = head || tag || remote ? undefined : hashHsl(name);
        return (
          <button
            type="button"
            key={r}
            className={`${cls} ${pinned ? "pinned" : ""}`}
            style={chipColor ? {
              color: chipColor.color,
              borderColor: chipColor.color,
              background: chipColor.bg,
            } : undefined}
            title={pinned ? "Clear branch highlight (⌘-click keeps the others)" : `Highlight the line of ${name} — ⌘-click to add it to the current highlight`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectRef(name);
              onPin(e.metaKey || e.ctrlKey);
            }}
          >
            {name}
          </button>
        );
      })}
    </>
  );
}

interface Props {
  path: string;
  commits: CommitInfo[];
  /* ⌘F matches — highlighted in place, the list itself is never filtered */
  searchHits?: Set<string> | null;
  selected: string | null;
  onSelect: (hash: string) => void;
  onSelectRef: (name: string, hash: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  remoteBranches?: Set<string>;
}

export function GraphTable({ path, commits, searchHits, selected, onSelect, onSelectRef, hasMore, onLoadMore, remoteBranches = new Set() }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // commits sitting in the cherry-pick clipboard get a marker, lazygit-style
  const pickedHashes = useApp((s) => s.cherryPicks[path]);
  const picked = useMemo(() => new Set((pickedHashes ?? []).map((c) => c.hash)), [pickedHashes]);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const rowsRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [subj, setSubj] = useState({ w: 0, view: 0 });
  const [subjScroll, setSubjScroll] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; hash: string } | null>(null);
  // nothing is highlighted until a ref chip is clicked; plain click replaces the
  // highlight (or clears it on the same chip), ⌘-click adds/removes extra lines
  const [pinned, setPinned] = useState<string[]>([]);
  // filter mode: show only the commits on the highlighted lines
  const [onlyLine, setOnlyLine] = useState(false);

  const line = useMemo(() => {
    const sets = pinned.map((h) => relatedLine(commits, h)).filter((s): s is Set<string> => s !== null);
    if (!sets.length) return null;
    const union = new Set<string>();
    for (const s of sets) for (const h of s) union.add(h);
    return union;
  }, [commits, pinned]);
  // when filtering, prune parent pointers that leave the subset — otherwise the
  // layout keeps rails open forever waiting for commits that never render
  const visible = useMemo(() => {
    if (!line || !onlyLine) return commits;
    return commits
      .filter((c) => line.has(c.hash))
      .map((c) => ({ ...c, parents: c.parents.filter((p) => line.has(p)) }));
  }, [commits, line, onlyLine]);

  const rows = useMemo(() => layoutGraph(visible), [visible]);
  const byHash = useMemo(() => new Map(visible.map((c, i) => [c.hash, i])), [visible]);
  const gutter = useMemo(() => Math.min(16, Math.max(2, ...rows.map((r) => r.width))) * COL_W, [rows]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Esc drops the branch highlight before any other Escape behaviour kicks in
  useEffect(() => {
    if (!pinned.length) return;
    const onKey = (e: KeyboardEvent) => {
      const s = useApp.getState();
      if (e.key !== "Escape" || s.dialog || s.commandOpen || s.keymapOpen || s.contextMenuOpen) return;
      e.preventDefault();
      e.stopPropagation();
      setPinned([]);
      setOnlyLine(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [pinned]);

  // bring the first search hit into view when the query changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !searchHits?.size) return;
    const idx = visible.findIndex((c) => searchHits.has(c.hash));
    if (idx < 0) return;
    const top = idx * ROW_H;
    if (top < el.scrollTop || top + ROW_H > el.scrollTop + el.clientHeight)
      el.scrollTop = Math.max(0, top - el.clientHeight / 3);
  }, [searchHits, visible]);

  // keep the selected row visible when vim keys move it
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !selected) return;
    const idx = byHash.get(selected);
    if (idx === undefined) return;
    const top = idx * ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
  }, [selected, byHash]);

  // the Commit column scrolls as one unit: measure the widest rendered subject
  // and the column viewport, then translate every row by the same offset
  useLayoutEffect(() => {
    const el = rowsRef.current;
    if (!el) return;
    let w = 0;
    for (const c of el.querySelectorAll<HTMLElement>(".graph-subject-content")) w = Math.max(w, c.offsetWidth);
    const view = el.querySelector<HTMLElement>(".graph-subject")?.clientWidth ?? 0;
    setSubj((p) => (p.w === w && p.view === view ? p : { w, view }));
  });

  const maxSubj = Math.max(0, subj.w - subj.view);
  const sx = Math.min(subjScroll, maxSubj);

  // keep the scrollbar in step when the wheel drives the offset
  useEffect(() => {
    const bar = barRef.current;
    if (bar && Math.abs(bar.scrollLeft - sx) > 0.5) bar.scrollLeft = sx;
  }, [sx]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 10);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW_H) + 10);

  return (
    <div className="graph-table">
      {line && (
        <div className="graph-pin-bar">
          <span>{pinned.length === 1 ? "1 line" : `${pinned.length} lines`} · {onlyLine ? `${visible.length} commits` : "highlighted"}</span>
          <button type="button" className={onlyLine ? "active" : ""} title="Show only the commits on the highlighted lines" onClick={() => setOnlyLine((v) => !v)}>
            Only these
          </button>
          <button type="button" title="Clear the highlight (Esc)" onClick={() => { setPinned([]); setOnlyLine(false); }}>
            Clear
          </button>
        </div>
      )}
      {/* header only labels the columns — the rows are topologically ordered and
          re-sorting them would tear the rails apart */}
      <div className="graph-head">
        <span className="graph-gutter" style={{ width: gutter }}>Graph</span>
        <span className="graph-subject">Commit</span>
        <span className="graph-author">Author</span>
        <span className="graph-hash">Hash</span>
        <span className="graph-time">When</span>
      </div>
      <div
        ref={scrollRef}
        className="graph-scroll"
        role="listbox"
        aria-label="Commit history"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onWheel={(e) => {
          // a sideways gesture pans the Commit column; vertical stays native
          if (maxSubj > 0 && Math.abs(e.deltaX) > Math.abs(e.deltaY))
            setSubjScroll(Math.max(0, Math.min(maxSubj, sx + e.deltaX)));
        }}
      >
      <div className="graph-canvas" style={{ height: rows.length * ROW_H + (hasMore ? ROW_H : 0) }}>
        <div ref={rowsRef} style={{ transform: `translateY(${start * ROW_H}px)` }}>
          {rows.slice(start, end).map((row, i) => {
            const c = visible[start + i];
            const pin = (additive: boolean) =>
              setPinned((prev) =>
                additive
                  ? prev.includes(row.hash)
                    ? prev.filter((h) => h !== row.hash)
                    : [...prev, row.hash]
                  : prev.length === 1 && prev[0] === row.hash
                    ? []
                    : [row.hash],
              );
            return (
              <div
                key={row.hash}
                role="option"
                tabIndex={0}
                aria-selected={selected === row.hash}
                className={`graph-row ${searchHits?.has(row.hash) ? "search-hit" : ""} ${selected === row.hash ? "selected" : ""} ${picked.has(row.hash) ? "picked" : ""}`}
                title={picked.has(row.hash) ? "Copied for cherry-pick (V pastes onto the current branch)" : undefined}
                onClick={() => onSelect(row.hash)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(row.hash);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onSelect(row.hash);
                  setMenu({ x: e.clientX, y: e.clientY, hash: row.hash });
                }}
              >
                {/* clicking the rails highlights this commit's line, same as a ref chip */}
                <span
                  className="graph-gutter clickable"
                  style={{ width: gutter }}
                  title={pinned.includes(row.hash) ? "Clear branch highlight (⌘-click keeps the others)" : "Highlight this line — ⌘-click to add it to the current highlight"}
                  onClick={(e) => { e.stopPropagation(); onSelect(row.hash); pin(e.metaKey || e.ctrlKey); }}
                >
                  {/* in filter mode every row is on the line — plain colors read better */}
                  <RowRails row={row} line={onlyLine ? null : line} />
                </span>
                <span className="graph-subject">
                  <span className="graph-subject-content" style={{ transform: `translateX(${-sx}px)` }}>
                    <RefChips
                      refs={c.refs}
                      pinned={pinned.includes(row.hash)}
                      remoteBranches={remoteBranches}
                      onSelectRef={(name) => onSelectRef(name, row.hash)}
                      onPin={pin}
                    />
                    <span className="subject-text">{c.subject}</span>
                  </span>
                </span>
                <span className="graph-author">{c.author}</span>
                <span className="graph-hash">{shortHash(c.hash)}</span>
                <span className="graph-time">{timeAgo(c.time)}</span>
              </div>
            );
          })}
        </div>
        {hasMore && (
          <button
            type="button"
            className="graph-load-more"
            style={{ top: rows.length * ROW_H }}
            onClick={onLoadMore}
          >
            Load older commits…
          </button>
        )}
      </div>
      </div>
      {maxSubj > 0 && (
        <div className="graph-subject-bar" style={{ gridTemplateColumns: `${gutter}px minmax(0, 1fr) 120px 68px 48px` }}>
          <span />
          <div
            ref={barRef}
            className="graph-subject-track"
            onScroll={(e) => setSubjScroll(e.currentTarget.scrollLeft)}
          >
            <div style={{ width: subj.w, height: 1 }} />
          </div>
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              icon: "git-branch",
              label: "Create branch here…",
              strong: true,
              onClick: () => void doCreateBranch(path, menu.hash),
            },
            {
              icon: "check",
              label: "Checkout (detached)",
              onClick: () => void doCheckout(path, menu.hash),
            },
            {
              icon: "git-commit",
              label: "Cherry-pick onto current branch",
              onClick: () => void doCherryPick(path, menu.hash),
            },
            {
              icon: "copy",
              label: "Copy hash",
              onClick: () => void writeText(menu.hash),
            },
            {
              icon: "globe",
              label: "Open on remote",
              onClick: () => void openOnRemote(path, "commit", menu.hash),
            },
          ]}
        />
      )}
    </div>
  );
}

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useApp } from "../../store";
import { useBlame, useConflictFile, useDiff, useRepoInfo } from "../../lib/queries";
import { escapeHtml, shortHash, timeAgo } from "../../lib/format";
import { extOf } from "../../lib/highlight";
import { highlightSourceLines } from "../../lib/treeSitterHighlight";
import { buildPatchForHunk, parseUnifiedDiff, splitDiffHunk, type DiffCell, type DiffHunk, type DiffInlineLine } from "../../lib/diffModel";
import { parseConflicts, resolveConflictText, type ConflictChoice, type ConflictModel } from "../../lib/conflictModel";
import { resolutionLabels } from "../../lib/gitUi";
import { openRepoFile } from "../../lib/editor";
import { doApplyHunk, doCherryPick, doCreateBranch, doMarkResolved, doResolve, doSaveConflictResolution, openOnRemote } from "../../lib/actions";
import { fileIcon, fileIconTone, Icon } from "../../ui/Icon";
import { SectionVeil } from "../../ui/SectionVeil";
import { ToolButton } from "../../ui/ToolButton";
import type { BlameLine } from "../../lib/types";

function useTreeSitterLines(lines: string[], file: string): string[] {
  const [highlighted, setHighlighted] = useState(() => lines.map(escapeHtml));
  useEffect(() => {
    let cancelled = false;
    setHighlighted(lines.map(escapeHtml));
    void highlightSourceLines(lines, extOf(file)).then((next) => {
      if (!cancelled) setHighlighted(next);
    });
    return () => { cancelled = true; };
  }, [file, lines]);
  return highlighted;
}

function LineCode({ html }: { html: string | undefined }) {
  return <code className="diff-code" dangerouslySetInnerHTML={{ __html: html || " " }} />;
}

function InlineRow({ line, oldHtml, newHtml }: { line: DiffInlineLine; oldHtml?: string; newHtml?: string }) {
  const marker = line.kind === "add" ? "+" : line.kind === "delete" ? "−" : " ";
  const html = line.kind === "delete" ? oldHtml : newHtml;
  return (
    <span className={`diff-line ${line.kind}`}>
      <span className="diff-gutter old" aria-label={line.oldNumber ? `Old line ${line.oldNumber}` : undefined}>{line.oldNumber ?? ""}</span>
      <span className="diff-gutter new" aria-label={line.newNumber ? `New line ${line.newNumber}` : undefined}>{line.newNumber ?? ""}</span>
      <i className="diff-marker" aria-hidden="true">{marker}</i>
      <LineCode html={html} />
    </span>
  );
}

function SplitCell({ side, cell, html }: { side: "old" | "new"; cell: DiffCell | null; html?: string }) {
  const kind = cell?.kind ?? "empty";
  return (
    <div className={`diff-cell ${side} ${kind}`}>
      <span className="diff-gutter" aria-label={cell ? `${side === "old" ? "Old" : "New"} line ${cell.number}` : undefined}>{cell?.number ?? ""}</span>
      <i className="diff-marker" aria-hidden="true">{kind === "delete" ? "−" : kind === "add" ? "+" : " "}</i>
      <LineCode html={html} />
    </div>
  );
}

function DiffBody({
  text, file, wrap, layout, onHunk, hunkLabel, allowHunkSplit,
}: {
  text: string;
  file: string;
  wrap: boolean;
  layout: "split" | "inline";
  onHunk?: (patch: string) => void;
  hunkLabel?: string;
  allowHunkSplit?: boolean;
}) {
  const model = useMemo(() => parseUnifiedDiff(text), [text]);
  const oldHtml = useTreeSitterLines(model.oldSourceLines, file);
  const newHtml = useTreeSitterLines(model.newSourceLines, file);
  const [splitHunkKeys, setSplitHunkKeys] = useState<Set<string>>(() => new Set());
  const displayHunks = useMemo(() => model.hunks.flatMap((hunk, hunkIndex) => {
    const splitKey = hunk.rawLines.join("\n");
    const children = allowHunkSplit ? splitDiffHunk(hunk) : [hunk];
    const expanded = children.length > 1 && splitHunkKeys.has(splitKey);
    return (expanded ? children : [hunk]).map((displayHunk, partIndex) => ({
      hunk: displayHunk,
      key: `${hunkIndex}:${partIndex}:${displayHunk.header}`,
      splitKey,
      splitCount: expanded ? 1 : children.length,
    }));
  }), [allowHunkSplit, model, splitHunkKeys]);
  if (!text.trim()) return <div className="empty-note">No changes.</div>;

  const HunkHeader = ({ hunk, splitKey, splitCount }: { hunk: DiffHunk; splitKey: string; splitCount: number }) => (
    <div className="diff-hunk-head">
      <span>{hunk.header}</span>
      {onHunk && (
        <span className="hunk-actions">
          {splitCount > 1 && (
            <button
              type="button"
              className="hunk-action split"
              title={`Split into ${splitCount} stageable hunks`}
              onClick={() => setSplitHunkKeys((current) => new Set(current).add(splitKey))}
            >
              Split
            </button>
          )}
          <button type="button" className="hunk-action" onClick={() => onHunk(buildPatchForHunk(model, hunk))}>
            {hunkLabel}
          </button>
        </span>
      )}
    </div>
  );

  if (layout === "split") {
    return (
      <div className={`diff-body diff-split ${wrap ? "wrap" : ""}`}>
        {displayHunks.map(({ hunk, key, splitKey, splitCount }) => (
          <section className="diff-hunk" key={key}>
            <HunkHeader hunk={hunk} splitKey={splitKey} splitCount={splitCount} />
            <div className="diff-split-labels" aria-hidden="true"><span>Before</span><span>After</span></div>
            {hunk.split.map((row, rowIndex) => (
              <div className={`diff-split-row ${row.kind}`} key={rowIndex}>
                <SplitCell side="old" cell={row.old} html={row.old ? oldHtml[row.old.sourceIndex] : undefined} />
                <SplitCell side="new" cell={row.new} html={row.new ? newHtml[row.new.sourceIndex] : undefined} />
              </div>
            ))}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className={`diff-body diff-inline ${wrap ? "wrap" : ""}`}>
      {displayHunks.map(({ hunk, key, splitKey, splitCount }) => (
        <section className="diff-hunk" key={key}>
          <HunkHeader hunk={hunk} splitKey={splitKey} splitCount={splitCount} />
          {hunk.inline.map((line, lineIndex) => (
            <InlineRow
              key={lineIndex}
              line={line}
              oldHtml={line.oldSourceIndex === null ? undefined : oldHtml[line.oldSourceIndex]}
              newHtml={line.newSourceIndex === null ? undefined : newHtml[line.newSourceIndex]}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

type ConflictRow = {
  num: number;
  kind: "text" | "ours" | "base" | "theirs" | "marker-ours" | "marker-base" | "marker-sep" | "marker-theirs";
  text: string;
  codeIndex: number | null;
  conflict: number | null;
};

/** VS Code-style merge editor body: the whole file with each conflict block
 *  rendered as Current/Incoming sections plus per-block accept actions. */
function ConflictBody({ model, file, wrap, labels, onAccept }: {
  model: ConflictModel;
  file: string;
  wrap: boolean;
  labels: { ours: string; theirs: string; title: string };
  onAccept: (index: number, choice: ConflictChoice) => void;
}) {
  const { rows, code } = useMemo(() => {
    const rows: ConflictRow[] = [];
    const code: string[] = [];
    let num = 1;
    let conflict = -1;
    const push = (kind: ConflictRow["kind"], text: string, highlightable: boolean, c: number | null) =>
      rows.push({ num: num++, kind, text, codeIndex: highlightable ? code.push(text) - 1 : null, conflict: c });
    for (const seg of model.segments) {
      if (seg.kind === "text") {
        for (const line of seg.lines) push("text", line, true, null);
        continue;
      }
      conflict++;
      push("marker-ours", `<<<<<<< ${seg.oursLabel}`.trimEnd(), false, conflict);
      for (const line of seg.ours) push("ours", line, true, conflict);
      if (seg.base) {
        push("marker-base", `||||||| ${seg.baseLabel}`.trimEnd(), false, conflict);
        for (const line of seg.base) push("base", line, true, conflict);
      }
      push("marker-sep", "=======", false, conflict);
      for (const line of seg.theirs) push("theirs", line, true, conflict);
      push("marker-theirs", `>>>>>>> ${seg.theirsLabel}`.trimEnd(), false, conflict);
    }
    return { rows, code };
  }, [model]);
  const highlighted = useTreeSitterLines(code, file);

  return (
    <div className={`diff-body conflict-body ${wrap ? "wrap" : ""}`}>
      {rows.map((row, i) => (
        <Fragment key={i}>
          {row.kind === "marker-ours" && (
            <div className="conflict-actions" title={labels.title}>
              <button type="button" onClick={() => onAccept(row.conflict!, "ours")}>Accept {labels.ours}</button>
              <button type="button" onClick={() => onAccept(row.conflict!, "theirs")}>Accept {labels.theirs}</button>
              <button type="button" onClick={() => onAccept(row.conflict!, "both")}>Accept Both</button>
            </div>
          )}
          <span className={`diff-line conflict-line ${row.kind}`}>
            <span className="diff-gutter">{row.num}</span>
            <i className="diff-marker" aria-hidden="true"> </i>
            {row.codeIndex === null ? (
              <code className="diff-code conflict-marker-text">
                {row.text}
                {row.kind === "marker-ours" && <em className="conflict-side-chip ours">{labels.ours}</em>}
                {row.kind === "marker-theirs" && <em className="conflict-side-chip theirs">{labels.theirs}</em>}
              </code>
            ) : (
              <LineCode html={highlighted[row.codeIndex]} />
            )}
          </span>
        </Fragment>
      ))}
      {rows.length === 0 && <div className="empty-note">Empty file.</div>}
    </div>
  );
}

function BlameBody({ blame, file, wrap, selected, onSelect }: {
  blame: BlameLine[];
  file: string;
  wrap: boolean;
  selected: number | null;
  onSelect: (index: number, line: BlameLine) => void;
}) {
  const lines = useMemo(() => blame.map((line) => line.line), [blame]);
  const highlighted = useTreeSitterLines(lines, file);
  const selectedHash = selected === null ? null : blame[selected]?.hash;
  return (
    <div className={`diff-body blame-body ${wrap ? "wrap" : ""}`} role="listbox" aria-label={`Blame for ${file}`}>
      {blame.map((b, i) => {
        const newGroup = i === 0 || blame[i - 1].hash !== b.hash;
        return (
          <span
            key={i}
            role="option"
            tabIndex={0}
            aria-selected={selected === i}
            className={`blame-line ${newGroup ? "group-start" : ""} ${selectedHash === b.hash ? "same-commit" : ""} ${selected === i ? "selected" : ""}`}
            onClick={() => onSelect(i, b)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onSelect(i, b);
            }}
          >
            <button type="button" className="blame-meta" title={`${b.author} · ${timeAgo(b.time)} — select commit`} onClick={(event) => { event.stopPropagation(); onSelect(i, b); }}>
              {newGroup ? `${b.hash} ${b.author.slice(0, 12).padEnd(12)} ${timeAgo(b.time).padStart(3)}` : ""}
            </button>
            <span className="diff-gutter">{i + 1}</span>
            <LineCode html={highlighted[i]} />
          </span>
        );
      })}
    </div>
  );
}

/** Full-width adaptive diff/blame reader opened from any file row. */
export function DiffView({ tabId, repoTabId, active }: { tabId: string; repoTabId: string; active: boolean }) {
  const {
    ui, repo, patchRepoTab, closeTab, diffWrap, toggleDiffWrap,
    diffLayout, setDiffLayout, showToast,
  } = useApp(useShallow((s) => ({
    ui: s.repoTabs[repoTabId],
    repo: s.repos.find((r) => r.id === s.repoTabs[repoTabId]?.repoId) ?? null,
    patchRepoTab: s.patchRepoTab,
    closeTab: s.closeTab,
    diffWrap: s.diffWrap,
    toggleDiffWrap: s.toggleDiffWrap,
    diffLayout: s.diffLayout,
    setDiffLayout: s.setDiffLayout,
    showToast: s.showToast,
  })));
  const path = repo?.path;
  const conflictMode = !ui?.blame && ui?.diff?.mode === "conflict";
  const diff = useDiff(active ? path : undefined, ui?.diff ?? null);
  const blameQ = useBlame(active ? path : undefined, ui?.blame ?? null);
  const conflictQ = useConflictFile(active && conflictMode ? path : undefined, conflictMode ? ui!.diff!.file : null);
  const repoInfoQ = useRepoInfo(active && conflictMode ? path : undefined);
  const conflictModel = useMemo(
    () => (conflictMode && conflictQ.data != null ? parseConflicts(conflictQ.data) : null),
    [conflictMode, conflictQ.data],
  );
  const [selectedBlame, setSelectedBlame] = useState<{ index: number; line: BlameLine } | null>(null);
  const [narrow, setNarrow] = useState(false);
  const viewRef = useRef<HTMLElement>(null);

  useEffect(() => setSelectedBlame(null), [ui?.blame]);
  useEffect(() => {
    const element = viewRef.current;
    if (!element) return;
    const update = (width: number) => setNarrow(width < 760);
    update(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      const state = useApp.getState();
      if (event.key !== "Escape" || event.defaultPrevented || state.dialog || state.commandOpen || state.keymapOpen || state.contextMenuOpen) return;
      event.preventDefault();
      void state.closeTab(tabId);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, tabId]);

  if (!ui || !repo || (!ui.diff && !ui.blame)) {
    return <section ref={viewRef} className={`content diff-view ${active ? "active" : ""}`}><div className="empty-note" style={{ margin: "auto" }}>No file selected.</div></section>;
  }

  const file = ui.blame ?? ui.diff!.file;
  const hunkMode = ui.diff?.mode === "worktree" ? "stage" : ui.diff?.mode === "staged" ? "unstage" : null;
  const mode = ui.diff?.mode;
  const stash = !ui.blame && mode === "stash";
  const modeLabel = ui.blame ? "Blame" : mode === "commit" ? shortHash(ui.diff!.hash ?? "") : mode === "staged" ? "Staged" : mode === "untracked" ? "New file" : mode === "stash" ? "Stash" : mode === "conflict" ? "Conflict" : "Working tree";
  const layout = narrow ? "inline" : diffLayout;
  const model = diff.data ? parseUnifiedDiff(diff.data) : null;
  const changedLine = model?.hunks.flatMap((hunk) => hunk.inline).find((line) => line.kind !== "context");
  const labels = resolutionLabels(repoInfoQ.data);
  const conflictCount = conflictModel?.conflictCount ?? 0;
  // first marker line — "Open file" should land the editor on the conflict
  const firstConflictLine = (() => {
    if (!conflictModel || !conflictCount) return null;
    let n = 1;
    for (const seg of conflictModel.segments) {
      if (seg.kind !== "text") return n;
      n += seg.lines.length;
    }
    return null;
  })();
  const openLine = firstConflictLine ?? changedLine?.newNumber ?? changedLine?.oldNumber ?? 1;
  const churn = (() => {
    if (ui.blame || !model) return null;
    let added = 0;
    let deleted = 0;
    for (const hunk of model.hunks) for (const line of hunk.inline) {
      if (line.kind === "add") added++;
      else if (line.kind === "delete") deleted++;
    }
    return { added, deleted };
  })();

  const openFile = () => {
    void openRepoFile(repo.path, file, openLine)
      .then((opened) => showToast(opened ? "Opened file" : "Copied", opened ? `${file}:${openLine}` : "File location copied."))
      .catch((error) => showToast("Open file failed", String(error), "err"));
  };

  return (
    <section ref={viewRef} className={`content diff-view ${active ? "active" : ""}`}>
      <div className="diff-view-head">
        <div className="diff-file-title">
          <Icon name={stash ? "layers" : fileIcon(file)} size={15} className={stash ? "soft-orange" : `change-file-icon ${fileIconTone(file) ?? ""}`} />
          <div className="doc-title"><strong>{stash ? (ui.diff!.label ?? file) : file.split("/").pop()}</strong><span className="mono">{file}</span></div>
        </div>
        <span className="diff-head-meta">
          <span className={`diff-mode-badge ${ui.blame ? "blame" : mode}`}>{modeLabel}</span>
          {churn && (churn.added > 0 || churn.deleted > 0) && <span className="diff-head-churn mono">{churn.added > 0 && <em className="add">+{churn.added}</em>}{churn.deleted > 0 && <em className="del">−{churn.deleted}</em>}</span>}
        </span>
        <span className="diff-view-actions">
          <ToolButton className="diff-open-file" onClick={openFile}><Icon name="pencil" /> Open file</ToolButton>
          {!ui.blame && !conflictMode && (
            <ToolButton
              iconOnly
              className="diff-layout-toggle"
              aria-label={layout === "split" ? "Switch to inline diff" : "Switch to split diff"}
              aria-pressed={layout === "split"}
              disabled={narrow}
              title={narrow ? "Split needs at least 760px" : layout === "split" ? "Switch to inline diff" : "Switch to split diff"}
              onClick={() => setDiffLayout(layout === "split" ? "inline" : "split")}
            >
              <Icon name={layout === "split" ? "columns" : "rows-2"} />
            </ToolButton>
          )}
          <span className="seg">
            <ToolButton iconOnly className={diffWrap ? "active" : ""} title={diffWrap ? "Unwrap long lines" : "Wrap long lines"} onClick={toggleDiffWrap}><Icon name="wrap" /></ToolButton>
            {!stash && !conflictMode && <ToolButton iconOnly title={ui.blame ? "Back to diff" : "Blame this file"} onClick={() => patchRepoTab(repoTabId, { blame: ui.blame ? null : file })}><Icon name="history" /></ToolButton>}
            <ToolButton iconOnly title="Copy path" onClick={() => void writeText(file)}><Icon name="copy" /></ToolButton>
            <ToolButton iconOnly title="Close (Esc)" onClick={() => void closeTab(tabId)}><Icon name="x" /></ToolButton>
          </span>
        </span>
      </div>
      <div className="diff-view-scroll">
        {ui.blame && selectedBlame && (
          <div className="blame-selection-bar">
            <span className="blame-selection-label"><strong>Line {selectedBlame.index + 1}</strong><span className="mono">{shortHash(selectedBlame.line.hash)} · {selectedBlame.line.author} · {timeAgo(selectedBlame.line.time)}</span></span>
            <span className="blame-selection-actions">
              <ToolButton onClick={() => void writeText(selectedBlame.line.hash)}><Icon name="copy" /> Copy hash</ToolButton>
              <ToolButton onClick={() => void writeText(selectedBlame.line.line)}><Icon name="copy" /> Copy line</ToolButton>
              <ToolButton onClick={() => void openOnRemote(repo.path, "commit", selectedBlame.line.hash)}><Icon name="globe" /> Open commit</ToolButton>
              <ToolButton variant="primary" onClick={() => patchRepoTab(repoTabId, { blame: null, diff: null, selectedCommit: selectedBlame.line.hash })}><Icon name="git-commit" /> Commit detail</ToolButton>
              <ToolButton onClick={() => void doCreateBranch(repo.path, selectedBlame.line.hash)}><Icon name="git-branch" /> Create branch</ToolButton>
              <ToolButton onClick={() => void doCherryPick(repo.path, selectedBlame.line.hash)}><Icon name="git-commit" /> Cherry-pick</ToolButton>
            </span>
          </div>
        )}
        {conflictMode && !conflictModel && conflictQ.isError && (
          <div className="conflict-bar">
            <span className="conflict-bar-label">
              <Icon name="git-merge" size={14} />
              <strong>Conflict</strong>
              <span>Content can’t be shown here — take a side, or resolve externally and mark resolved.</span>
            </span>
            <span className="conflict-bar-actions">
              <ToolButton title={`Replace the whole file with ${labels.ours}. ${labels.title}`} onClick={() => void doResolve(repo.path, file, "ours")}>Take all: {labels.ours}</ToolButton>
              <ToolButton title={`Replace the whole file with ${labels.theirs}. ${labels.title}`} onClick={() => void doResolve(repo.path, file, "theirs")}>Take all: {labels.theirs}</ToolButton>
              <ToolButton onClick={() => void doMarkResolved(repo.path, file)}><Icon name="check" /> Mark resolved</ToolButton>
            </span>
          </div>
        )}
        {conflictMode && conflictModel && (
          <div className="conflict-bar">
            {conflictCount > 0 ? (
              <>
                <span className="conflict-bar-label">
                  <Icon name="git-merge" size={14} />
                  <strong>{conflictCount} conflict{conflictCount === 1 ? "" : "s"}</strong>
                  <span>Accept a side per block, or take one side for the whole file.</span>
                </span>
                <span className="conflict-bar-actions">
                  <ToolButton title={`Replace the whole file with ${labels.ours}. ${labels.title}`} onClick={() => void doResolve(repo.path, file, "ours")}>Take all: {labels.ours}</ToolButton>
                  <ToolButton title={`Replace the whole file with ${labels.theirs}. ${labels.title}`} onClick={() => void doResolve(repo.path, file, "theirs")}>Take all: {labels.theirs}</ToolButton>
                </span>
              </>
            ) : (
              <>
                <span className="conflict-bar-label resolved">
                  <Icon name="check" size={14} />
                  <strong>All conflicts resolved</strong>
                  <span>Mark the file resolved to stage it.</span>
                </span>
                <span className="conflict-bar-actions">
                  <ToolButton variant="primary" onClick={() => void doMarkResolved(repo.path, file)}><Icon name="check" /> Mark resolved</ToolButton>
                </span>
              </>
            )}
          </div>
        )}
        <SectionVeil on={ui.blame ? blameQ.isLoading : conflictMode ? conflictQ.isLoading : diff.isLoading} />
        {ui.blame ? blameQ.isLoading ? null : blameQ.isError ? <div className="empty-note">{String(blameQ.error)}</div> : (
          <BlameBody blame={blameQ.data ?? []} file={ui.blame} wrap={diffWrap} selected={selectedBlame?.index ?? null} onSelect={(index, line) => setSelectedBlame({ index, line })} />
        ) : conflictMode ? conflictQ.isLoading ? null : conflictQ.isError ? <div className="empty-note">{String(conflictQ.error)}</div> : conflictModel && (
          <ConflictBody
            model={conflictModel}
            file={file}
            wrap={diffWrap}
            labels={labels}
            onAccept={(index, choice) => void doSaveConflictResolution(repo.path, file, resolveConflictText(conflictModel, index, choice))}
          />
        ) : diff.isLoading ? null : diff.isError ? <div className="empty-note">{String(diff.error)}</div> : (
          <DiffBody text={diff.data ?? ""} file={ui.diff!.file} wrap={diffWrap} layout={layout} onHunk={hunkMode ? (patch) => void doApplyHunk(repo.path, patch, hunkMode === "unstage") : undefined} hunkLabel={hunkMode === "stage" ? "Stage hunk" : "Unstage hunk"} allowHunkSplit={hunkMode === "stage"} />
        )}
      </div>
    </section>
  );
}

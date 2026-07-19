import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useApp } from "../../store";
import { useBlame, useDiff } from "../../lib/queries";
import { escapeHtml, shortHash, timeAgo } from "../../lib/format";
import { extOf } from "../../lib/highlight";
import { highlightSourceLines } from "../../lib/treeSitterHighlight";
import { buildHunkPatch, parseUnifiedDiff, type DiffCell, type DiffInlineLine } from "../../lib/diffModel";
import { openRepoFile } from "../../lib/editor";
import { doApplyHunk, doCherryPick, doCreateBranch, openOnRemote } from "../../lib/actions";
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
  text, file, wrap, layout, onHunk, hunkLabel,
}: {
  text: string;
  file: string;
  wrap: boolean;
  layout: "split" | "inline";
  onHunk?: (patch: string) => void;
  hunkLabel?: string;
}) {
  const model = useMemo(() => parseUnifiedDiff(text), [text]);
  const oldHtml = useTreeSitterLines(model.oldSourceLines, file);
  const newHtml = useTreeSitterLines(model.newSourceLines, file);
  if (!text.trim()) return <div className="empty-note">No changes.</div>;

  const HunkHeader = ({ index }: { index: number }) => (
    <div className="diff-hunk-head">
      <span>{model.hunks[index].header}</span>
      {onHunk && (
        <button type="button" className="hunk-action" onClick={() => onHunk(buildHunkPatch(model, index))}>
          {hunkLabel}
        </button>
      )}
    </div>
  );

  if (layout === "split") {
    return (
      <div className={`diff-body diff-split ${wrap ? "wrap" : ""}`}>
        {model.hunks.map((hunk, hunkIndex) => (
          <section className="diff-hunk" key={`${hunk.header}-${hunkIndex}`}>
            <HunkHeader index={hunkIndex} />
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
      {model.hunks.map((hunk, hunkIndex) => (
        <section className="diff-hunk" key={`${hunk.header}-${hunkIndex}`}>
          <HunkHeader index={hunkIndex} />
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
  const diff = useDiff(active ? path : undefined, ui?.diff ?? null);
  const blameQ = useBlame(active ? path : undefined, ui?.blame ?? null);
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
  const modeLabel = ui.blame ? "Blame" : mode === "commit" ? shortHash(ui.diff!.hash ?? "") : mode === "staged" ? "Staged" : mode === "untracked" ? "New file" : mode === "stash" ? "Stash" : "Working tree";
  const layout = narrow ? "inline" : diffLayout;
  const model = diff.data ? parseUnifiedDiff(diff.data) : null;
  const changedLine = model?.hunks.flatMap((hunk) => hunk.inline).find((line) => line.kind !== "context");
  const openLine = changedLine?.newNumber ?? changedLine?.oldNumber ?? 1;
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
          {!ui.blame && (
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
            {!stash && <ToolButton iconOnly title={ui.blame ? "Back to diff" : "Blame this file"} onClick={() => patchRepoTab(repoTabId, { blame: ui.blame ? null : file })}><Icon name="history" /></ToolButton>}
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
        <SectionVeil on={ui.blame ? blameQ.isLoading : diff.isLoading} />
        {ui.blame ? blameQ.isLoading ? null : blameQ.isError ? <div className="empty-note">{String(blameQ.error)}</div> : (
          <BlameBody blame={blameQ.data ?? []} file={ui.blame} wrap={diffWrap} selected={selectedBlame?.index ?? null} onSelect={(index, line) => setSelectedBlame({ index, line })} />
        ) : diff.isLoading ? null : diff.isError ? <div className="empty-note">{String(diff.error)}</div> : (
          <DiffBody text={diff.data ?? ""} file={ui.diff!.file} wrap={diffWrap} layout={layout} onHunk={hunkMode ? (patch) => void doApplyHunk(repo.path, patch, hunkMode === "unstage") : undefined} hunkLabel={hunkMode === "stage" ? "Stage hunk" : "Unstage hunk"} />
        )}
      </div>
    </section>
  );
}

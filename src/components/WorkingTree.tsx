import { openPath } from "@tauri-apps/plugin-opener";
import { commitDetail } from "../lib/git";
import {
  doCommit,
  doGenerateCommitMessage,
  doDiscard,
  doMarkResolved,
  doResolve,
  doStage,
  doUnstage,
} from "../lib/actions";
import { Fragment, useMemo } from "react";
import { countPhysicalChanges, diffTargetFor, groupByFolder, isSameStatusEntry, stageableEntries, statusEntryKey } from "../lib/gitUi";
import { useRepoInfo, useStatus, useWorktreeDiffStats } from "../lib/queries";
import type { StatusEntry } from "../lib/types";
import { useApp, type RepoTabUI } from "../store";
import { fileIcon, fileIconTone, Icon } from "../ui/Icon";
import { FilePath } from "../ui/FilePath";
import { ToolButton } from "../ui/ToolButton";

function changeCode(entry: StatusEntry): string {
  if (entry.area === "untracked") return "?";
  if (entry.area === "conflict") return "U";
  const code = entry.area === "staged" ? entry.code[0] : entry.code[1];
  return code === "." ? " " : code;
}

function resolutionLabels(info: ReturnType<typeof useRepoInfo>["data"]) {
  if (info?.rebasing) {
    return {
      ours: "Base",
      theirs: "Replayed commit",
      title: "During rebase: Base is the branch being rebased onto; Replayed commit is your commit being applied.",
    };
  }
  if (info?.cherryPicking) {
    return { ours: "Current branch", theirs: "Picked commit", title: "Choose which side should replace the file, then GitMin stages it as resolved." };
  }
  return { ours: "Current branch", theirs: "Incoming branch", title: "Choose which side should replace the file, then GitMin stages it as resolved." };
}

export function WorkingTree({ path, tabId, ui }: { path: string; tabId: string; ui: RepoTabUI }) {
  const patchRepoTab = useApp((state) => state.patchRepoTab);
  const showToast = useApp((state) => state.showToast);
  const view = useApp((state) => state.changesView);
  const setChangesView = useApp((state) => state.setChangesView);
  const statusQ = useStatus(path);
  const statsQ = useWorktreeDiffStats(path);
  const info = useRepoInfo(path);

  const entries = statusQ.data ?? [];
  const stats = useMemo(() => {
    const map = new Map<string, { added: number; deleted: number; binary: boolean }>();
    for (const s of statsQ.data ?? []) map.set(s.path, s);
    return map;
  }, [statsQ.data]);
  const conflicts = entries.filter((entry) => entry.area === "conflict");
  const staged = entries.filter((entry) => entry.area === "staged");
  const unstaged = stageableEntries(entries);
  const labels = resolutionLabels(info.data);

  const selectEntry = (entry: StatusEntry) => {
    patchRepoTab(tabId, {
      selectedStatus: { path: entry.path, area: entry.area },
      focusedPanel: "changes",
      diff: diffTargetFor(entry),
    });
  };

  const row = (entry: StatusEntry, baseOnly: boolean) => {
    const active = isSameStatusEntry(entry, ui.selectedStatus);
    const stat = stats.get(entry.path);
    return (
      <div
        role="button"
        tabIndex={0}
        key={statusEntryKey(entry)}
        className={`index-item change-row ${baseOnly ? "nested" : ""} ${active ? "active" : ""} ${entry.area}`}
        title={entry.path}
        aria-pressed={active}
        onClick={() => selectEntry(entry)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectEntry(entry);
          }
        }}
      >
        <span className={`change-code code-${changeCode(entry).trim() || "none"}`}>{changeCode(entry)}</span>
        <Icon name={fileIcon(entry.path)} size={13} className={`change-file-icon ${fileIconTone(entry.path) ?? ""}`} />
        <FilePath path={entry.path} baseOnly={baseOnly} />
        {stat && (
          <span className="change-stats">
            {stat.binary ? (
              <span className="stat-binary">bin</span>
            ) : (
              <>
                {stat.added > 0 && <span className="stat-add">+{stat.added}</span>}
                {stat.deleted > 0 && <span className="stat-del">−{stat.deleted}</span>}
              </>
            )}
          </span>
        )}
        <span className="change-actions">
          {entry.area === "conflict" ? (
            <>
              <button title={`${labels.ours}. ${labels.title}`} onClick={(event) => { event.stopPropagation(); void doResolve(path, entry.path, "ours"); }}>{labels.ours}</button>
              <button title={`${labels.theirs}. ${labels.title}`} onClick={(event) => { event.stopPropagation(); void doResolve(path, entry.path, "theirs"); }}>{labels.theirs}</button>
              <button title="Open in editor" onClick={(event) => { event.stopPropagation(); void openPath(`${path}/${entry.path}`).catch((err) => showToast("Open failed", String(err), "err")); }}><Icon name="pencil" size={12} /></button>
              <button title="Mark the edited file resolved" onClick={(event) => { event.stopPropagation(); void doMarkResolved(path, entry.path); }}><Icon name="check" size={12} /></button>
            </>
          ) : entry.area === "staged" ? (
            <button title="Unstage" onClick={(event) => { event.stopPropagation(); void doUnstage(path, [entry.path]); }}>−</button>
          ) : (
            <>
              <button title="Stage" onClick={(event) => { event.stopPropagation(); void doStage(path, [entry.path]); }}>+</button>
              <button title="Discard changes" onClick={(event) => { event.stopPropagation(); void doDiscard(path, [entry.path], entry.area === "untracked"); }}>
                <Icon name="trash" size={12} />
              </button>
            </>
          )}
        </span>
      </div>
    );
  };

  // flat: full path per row (dir dims and truncates first); tree: rows grouped under folder headers
  const rows = (list: StatusEntry[]) =>
    view === "tree"
      ? groupByFolder(list).map((group) => (
          <Fragment key={group.dir || "."}>
            {group.dir && (
              <div className="change-folder" title={group.dir}>
                <Icon name="folder" size={13} />
                <span className="change-folder-name">{group.dir.slice(0, -1)}</span>
                <span className="change-folder-count">{group.entries.length}</span>
              </div>
            )}
            {group.entries.map((entry) => row(entry, Boolean(group.dir)))}
          </Fragment>
        ))
      : list.map((entry) => row(entry, false));

  return (
    <div className={`working-tree ${ui.focusedPanel === "changes" ? "panel-focused" : ""}`} onMouseDown={() => patchRepoTab(tabId, { focusedPanel: "changes" })}>
      <div className="group-title working-tree-title">
        <span>Working Tree</span>
        <span>
          <button
            type="button"
            className="group-action"
            title={view === "flat" ? "Group by folder" : "Flat list"}
            onClick={() => setChangesView(view === "flat" ? "tree" : "flat")}
          >
            <Icon name={view === "flat" ? "folder" : "list"} size={13} />
          </button>
          {countPhysicalChanges(entries) || "clean"}
        </span>
      </div>
      {conflicts.length > 0 && (
        <>
          <div className="change-section conflict-head" title={labels.title}>Conflicts — {conflicts.length}</div>
          {rows(conflicts)}
        </>
      )}
      <div className="change-section with-action">
        <span>Staged — {staged.length}</span>
        {staged.length > 0 && (
          <button type="button" className="group-action" title="Unstage all" onClick={() => void doUnstage(path, staged.map((entry) => entry.path))}>
            <Icon name="minify" size={13} />
          </button>
        )}
      </div>
      {rows(staged)}
      <div className="change-section with-action">
        <span>Unstaged — {unstaged.length}</span>
        {unstaged.length > 0 && (
          <button type="button" className="group-action" title="Stage all non-conflicting files (a)" onClick={() => void doStage(path, unstaged.map((entry) => entry.path))}>
            <Icon name="plus" size={13} />
          </button>
        )}
      </div>
      {rows(unstaged)}
      {entries.length === 0 && <div className="empty-note">Working tree clean.</div>}
    </div>
  );
}

export function CommitComposer({ path, tabId, ui }: { path: string; tabId: string; ui: RepoTabUI }) {
  const patchRepoTab = useApp((state) => state.patchRepoTab);
  const aiModel = useApp((state) => state.aiProvider.model);
  const statusQ = useStatus(path);
  const info = useRepoInfo(path);
  const staged = (statusQ.data ?? []).filter((entry) => entry.area === "staged");
  const branch = info.data?.branch ?? "HEAD";
  const generating = ui.aiRequestId !== null;

  const submit = async () => {
    if (await doCommit(path, ui.commitDraft, ui.amend)) patchRepoTab(tabId, { commitDraft: "", amend: false });
  };

  // amend with an empty draft prefills the message being rewritten (Fork/Tower behaviour)
  const toggleAmend = async (amend: boolean) => {
    patchRepoTab(tabId, { amend });
    if (!amend || ui.commitDraft.trim()) return;
    try {
      const head = await commitDetail(path, "HEAD");
      const current = useApp.getState().repoTabs[tabId];
      if (current?.amend && !current.commitDraft.trim()) patchRepoTab(tabId, { commitDraft: head.message.trim() });
    } catch {
      // unborn HEAD — nothing to prefill
    }
  };

  const subjectLen = ui.commitDraft.split("\n", 1)[0].length;

  const generate = () => doGenerateCommitMessage(path, tabId);

  return (
    <div className="commit-footer">
      <div className="commit-box">
        <textarea
          id={`commit-message-${tabId}`}
          className="commit-message"
          aria-label="Commit message"
          placeholder={`Commit to ${branch}… (⌘↵)`}
          value={ui.commitDraft}
          spellCheck={false}
          onFocus={() => patchRepoTab(tabId, { focusedPanel: "changes" })}
          onChange={(event) => patchRepoTab(tabId, { commitDraft: event.target.value })}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
            if (event.key === "Escape") (event.target as HTMLTextAreaElement).blur();
          }}
        />
        <div className="commit-actions">
          {subjectLen > 0 && (
            <span
              className={`subject-count ${subjectLen > 72 ? "over" : subjectLen > 50 ? "warn" : ""}`}
              title="Subject length — keep it ≤50, hard limit 72"
            >
              {subjectLen}
            </span>
          )}
          <ToolButton
            iconOnly
            title={aiModel ? `Generate with ${aiModel}; staged diff is sent to the configured provider` : "Configure an AI provider in Settings"}
            disabled={generating || staged.length === 0}
            onClick={() => void generate()}
          >
            <Icon name={generating ? "loader" : "sparkles"} className={generating ? "spin" : "soft-orange"} />
          </ToolButton>
          <label className="amend-toggle" title="Amend rewrites the previous commit">
            <input type="checkbox" checked={ui.amend} onChange={(event) => void toggleAmend(event.target.checked)} />
            amend
          </label>
          <ToolButton variant="primary" disabled={ui.amend ? false : !staged.length || !ui.commitDraft.trim()} onClick={() => void submit()}>
            <Icon name="git-commit" /> {ui.amend ? "Amend" : "Commit"}
          </ToolButton>
        </div>
      </div>
    </div>
  );
}

import { Fragment, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { activeRepo, activeRepoTab, useApp, type InspectorTab } from "../store";
import { useBranches, useCommitDetail, useLog, useRemotes, useRepoInfo } from "../lib/queries";
import { shortHash, timeAgo } from "../lib/format";
import { lineage } from "../lib/lineage";
import {
  doAddRemote, doCheckout, doCheckoutBranch, doCherryPick, doCreateBranch, doDeleteBranch,
  doFetch, doMerge, doPasteCherryPicks, doPull, doPush, doRebase, doRemoveRemote, doSetRemoteUrl, openOnRemote,
} from "../lib/actions";
import { groupByFolder, prSourceBranch } from "../lib/gitUi";
import type { FileStat } from "../lib/types";
import { fileIcon, fileIconTone, Icon } from "../ui/Icon";
import { FilePath } from "../ui/FilePath";
import { MiniTabs } from "../ui/MiniTabs";
import { SectionVeil } from "../ui/SectionVeil";
import { ToolButton } from "../ui/ToolButton";
import { CommitComposer, WorkingTree } from "./WorkingTree";

function RemoteSection({ path }: { path: string }) {
  const remotes = useRemotes(path);

  return (
    <>
      <div className="group-title">
        <span>Remotes</span>
        <span className="mono">{remotes.data ? remotes.data.length : "…"}</span>
      </div>
      <div className="remote-list">
        {remotes.data?.map((remote) => (
          <div key={remote.name} className="remote-row" title={`${remote.name} → ${remote.url}`}>
            <span className="remote-name">{remote.name}</span>
            <span className="remote-url">{remote.url}</span>
            <span className="remote-actions">
              <ToolButton iconOnly title="Edit URL" onClick={() => void doSetRemoteUrl(path, remote.name)}>
                <Icon name="pencil" size={12} />
              </ToolButton>
              <ToolButton iconOnly title="Remove remote" onClick={() => void doRemoveRemote(path, remote.name)}>
                <Icon name="trash" size={12} />
              </ToolButton>
            </span>
          </div>
        ))}
        {remotes.data?.length === 0 && <div className="empty-note compact">No remotes configured.</div>}
      </div>
      <div className="action-strip">
        <ToolButton onClick={() => void doAddRemote(path)}><Icon name="plus" /> Add remote</ToolButton>
      </div>
    </>
  );
}

/** lazygit's copied-commits panel: what C collected, what V will replay. */
function CherryPickClipboard({ path, branch }: { path: string; branch: string }) {
  const picked = useApp((s) => s.cherryPicks[path]) ?? [];
  const toggle = useApp((s) => s.toggleCherryPick);
  const clear = useApp((s) => s.clearCherryPicks);
  if (!picked.length) return null;
  // oldest first — the order git will replay them in
  const ordered = [...picked].sort((a, b) => a.time - b.time);

  return (
    <>
      <div className="group-title">
        <span>Cherry-pick clipboard</span>
        <span className="mono">{picked.length}</span>
      </div>
      <div className="pick-list">
        {ordered.map((item) => (
          <div key={item.hash} className="pick-row" title={item.subject}>
            <span className="mono pick-hash">{shortHash(item.hash)}</span>
            <span className="pick-subject">{item.subject}</span>
            <ToolButton iconOnly title="Remove from clipboard" onClick={() => toggle(path, item)}>
              <Icon name="x" size={12} />
            </ToolButton>
          </div>
        ))}
      </div>
      <div className="action-strip">
        <ToolButton variant="primary" onClick={() => void doPasteCherryPicks(path)}>
          <Icon name="git-commit" /> Paste onto {branch}
        </ToolButton>
        <ToolButton onClick={() => clear(path)}><Icon name="trash" /> Clear</ToolButton>
      </div>
    </>
  );
}

/** Quick actions — the buttons that used to hide behind vim keys only. */
function ActionsTab({ path, hash, branchName }: { path: string; hash: string | null; branchName: string | null }) {
  const showToast = useApp((s) => s.showToast);
  const info = useRepoInfo(path);
  const branches = useBranches(path);
  const branch = branches.data?.find((item) => item.name === branchName);
  const prTarget = branch ? prSourceBranch(branch) : null;
  const remoteRef = prTarget ?? branch?.name ?? "";
  const copy = (label: string, text: string) => {
    void writeText(text);
    showToast("Copied", label, "ok");
  };

  return (
    <div className="actions-tab">
      <RemoteSection path={path} />

      <div className="group-title">
        <span>Sync</span>
        <span className="mono">
          {info.data ? `↑${info.data.ahead} ↓${info.data.behind}` : ""}
        </span>
      </div>
      <div className="action-strip sync-actions">
        <ToolButton onClick={() => void doFetch(path)}><Icon name="refresh" /> Fetch</ToolButton>
        <ToolButton onClick={() => void doPull(path)}><Icon name="download" /> Pull</ToolButton>
        <ToolButton onClick={() => void doPush(path)}><Icon name="upload" /> Push</ToolButton>
      </div>

      {hash && <>
      <div className="group-title"><span>Selected commit</span><span className="mono">{shortHash(hash)}</span></div>
      <div className="action-strip context-actions">
        <ToolButton onClick={() => copy(hash, hash)}><Icon name="copy" /> Copy hash</ToolButton>
        <ToolButton onClick={() => void openOnRemote(path, "commit", hash)}><Icon name="globe" /> Open commit</ToolButton>
        <ToolButton onClick={() => void doCreateBranch(path, hash)}><Icon name="git-branch" /> Create branch here</ToolButton>
        <ToolButton onClick={() => void doCheckout(path, hash)}><Icon name="check" /> Checkout detached</ToolButton>
        <ToolButton onClick={() => void doCherryPick(path, hash)}><Icon name="git-commit" /> Cherry-pick</ToolButton>
      </div>
      </>}

      {branch && <>
        <div className="group-title">
          <span>Selected {branch.kind === "tag" ? "tag" : "branch"}</span>
          <span className="mono">{branch.name}</span>
        </div>
        <div className="action-strip context-actions">
          <ToolButton onClick={() => copy(branch.name, branch.name)}><Icon name="copy" /> Copy name</ToolButton>
          <ToolButton onClick={() => void openOnRemote(path, "branch", remoteRef)}><Icon name="globe" /> Open branch</ToolButton>
          {prTarget && <ToolButton variant="primary" onClick={() => void openOnRemote(path, "pr", prTarget)}><Icon name="pull-request" /> Open PR</ToolButton>}
          <ToolButton onClick={() => void doCheckoutBranch(path, branch)}><Icon name="check" /> Checkout</ToolButton>
          {/* a remote branch merges into the current one just as well as a local
              one — only the branch you are standing on has nothing to merge */}
          {branch.kind !== "tag" && !branch.head && (
            <ToolButton onClick={() => void doMerge(path, branch.name)}><Icon name="git-merge" /> Merge into current</ToolButton>
          )}
          {branch.kind === "local" && !branch.head && <>
            <ToolButton onClick={() => void doRebase(path, branch.name)}><Icon name="history" /> Rebase current here</ToolButton>
            <ToolButton variant="danger" onClick={() => void doDeleteBranch(path, branch.name)}><Icon name="trash" /> Delete branch</ToolButton>
          </>}
        </div>
      </>}

      {!hash && !branchName && <div className="empty-note compact">Select a commit or branch to show contextual actions.</div>}

      <CherryPickClipboard path={path} branch={info.data?.branch ?? "HEAD"} />
    </div>
  );
}


/** Where this commit's line came from and where it has landed since — same log
 *  query the graph already loaded, so this costs a memo, not a fetch. */
function LineageCard({ path, scope, hash }: { path: string; scope: string | null; hash: string }) {
  const log = useLog(path, scope);
  // the real branch list, so a decoration like "origin/feature/x" is ranked as the
  // remote it is instead of being guessed at from its prefix
  const branchList = useBranches(path);
  const locals = useMemo(
    () => new Set((branchList.data ?? []).filter((b) => b.kind === "local").map((b) => b.name)),
    [branchList.data],
  );
  const info = useMemo(() => lineage(log.data?.pages.flat() ?? [], hash, locals), [log.data, hash, locals]);
  if (!info) return null;

  return (
    <div className="lineage">
      <div className="lineage-step from">
        <span className="lineage-dot" />
        {info.forkedFrom ? (
          <span>branched from <b>{info.forkedFrom.name}</b></span>
        ) : (
          <span className="muted">fork point is older than the loaded history</span>
        )}
      </div>
      <div className="lineage-step self">
        <span className="lineage-dot" />
        <span>
          <b>{info.branch}</b>
          <span className="muted"> · {info.ownCommits === 1 ? "1 commit" : `${info.ownCommits} commits`} on this line</span>
          {/* several refs often sit on one tip — naming only the first read as wrong */}
          {info.alsoAt.length > 0 && (
            <span className="muted"> · also at {info.alsoAt.join(", ")}</span>
          )}
        </span>
      </div>
      {info.merges.length ? (
        info.merges.map((m) => (
          <div className="lineage-step into" key={m.hash} title={m.subject}>
            <span className="lineage-dot" />
            <span>merged into <b>{m.name}</b><span className="muted"> · {timeAgo(m.time)}</span></span>
          </div>
        ))
      ) : (
        <div className="lineage-step open">
          <span className="lineage-dot" />
          <span className="muted">This line is not contained in any other branch</span>
        </div>
      )}
    </div>
  );
}

export function Inspector() {
  // useShallow — activeRepoTab builds a fresh {tabId, ui} object per call
  const repoTab = useApp(useShallow((s) => activeRepoTab(s)));
  const repo = useApp((s) => activeRepo(s));
  const patchRepoTab = useApp((s) => s.patchRepoTab);
  const setTab = useApp((s) => s.setInspectorTab);

  const ui = repoTab?.ui;
  const path = repo?.path;
  const detail = useCommitDetail(path, ui?.selectedCommit ?? null);
  const changesView = useApp((state) => state.changesView);
  const setChangesView = useApp((state) => state.setChangesView);

  if (!repoTab || !ui || !repo) return <aside className="inspector" />;
  const tab = ui.inspectorTab;

  const fileRow = (f: FileStat, nested: boolean) => {
    const active = ui.diff && (ui.diff as { file?: string }).file === f.path;
    return (
      <div
        role="button"
        tabIndex={0}
        key={f.path}
        className={`index-item file-row ${nested ? "nested" : ""} ${active ? "active" : ""}`}
        title={f.path}
        onClick={() =>
          patchRepoTab(repoTab.tabId, {
            diff: { mode: "commit", hash: ui.selectedCommit!, file: f.path },
          })
        }
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          patchRepoTab(repoTab.tabId, {
            diff: { mode: "commit", hash: ui.selectedCommit!, file: f.path },
          });
        }}
      >
        <Icon name={fileIcon(f.path)} size={13} className={`change-file-icon ${fileIconTone(f.path) ?? ""}`} />
        <FilePath path={f.path} baseOnly={nested} />
        {f.binary ? (
          <span className="muted">bin</span>
        ) : (
          <span className="diff-stat">
            {f.added > 0 && <em className="add">+{f.added}</em>}
            {f.added > 0 && f.deleted > 0 ? " " : null}
            {f.deleted > 0 && <em className="del">−{f.deleted}</em>}
          </span>
        )}
      </div>
    );
  };

  const close = () => patchRepoTab(repoTab.tabId, { selectedCommit: null });
  const headTitle = ui.selectedCommit ? shortHash(ui.selectedCommit) : "no selection";

  return (
    <aside
      className={`inspector ${ui.focusedPanel === "files" ? "panel-focused" : ""}`}
      onMouseDown={() => patchRepoTab(repoTab.tabId, { focusedPanel: tab === "changes" ? "changes" : "files" })}
    >
      <div className="inspector-head">
        <div className="doc-title">
          <strong>{tab === "diff" ? headTitle : repo.name}</strong>
          <span>
            {tab === "changes" ? "working tree" : tab === "actions" ? "quick git actions" : "commit detail"}
          </span>
        </div>
        {tab === "diff" && (
          <span className="seg">
            {ui.selectedCommit && (
              <>
                <ToolButton iconOnly title="Copy hash (y)" onClick={() => void writeText(ui.selectedCommit!)}>
                  <Icon name="copy" />
                </ToolButton>
                <ToolButton iconOnly title="Open on remote (o)" onClick={() => void openOnRemote(repo.path, "commit", ui.selectedCommit!)}>
                  <Icon name="globe" />
                </ToolButton>
                <ToolButton iconOnly title="Close (Esc)" onClick={close}>
                  <Icon name="x" />
                </ToolButton>
              </>
            )}
          </span>
        )}
      </div>
      <MiniTabs
        tabs={[
          { id: "changes", label: "Changes" },
          { id: "diff", label: "Diff" },
          { id: "actions", label: "Actions" },
        ]}
        active={tab}
        onChange={(id) => setTab(id as InspectorTab)}
      />

      <div className="inspector-scroll">
        {tab === "changes" ? (
          <WorkingTree path={repo.path} tabId={repoTab.tabId} ui={ui} />
        ) : tab === "actions" ? (
          <ActionsTab path={repo.path} hash={ui.selectedCommit} branchName={ui.selectedBranch} />
        ) : (
          <>
            <SectionVeil on={!!ui.selectedCommit && detail.isLoading} />
            {ui.selectedCommit ? (
              detail.isLoading ? null : detail.isError ? (
                <div className="empty-note">{String(detail.error)}</div>
              ) : detail.data ? (
                <div className="commit-detail">
                  <LineageCard path={repo.path} scope={ui.graphScope} hash={ui.selectedCommit} />
                  <div className="commit-meta">
                    <strong>{detail.data.author}</strong>
                    <span className="muted">{detail.data.email}</span>
                    <span className="muted">{new Date(detail.data.time * 1000).toLocaleString()} · {timeAgo(detail.data.time)}</span>
                    <span className="muted mono">
                      {detail.data.parents.length
                        ? `parents ${detail.data.parents.map(shortHash).join(", ")}`
                        : "root commit"}
                    </span>
                  </div>
                  <pre className="commit-message-full">{detail.data.message}</pre>
                  <div className="group-title">
                    <span>Files</span>
                    <span>
                      <button
                        type="button"
                        className="group-action"
                        title={changesView === "flat" ? "Group by folder" : "Flat list"}
                        onClick={() => setChangesView(changesView === "flat" ? "tree" : "flat")}
                      >
                        <Icon name={changesView === "flat" ? "folder" : "list"} size={13} />
                      </button>
                      {detail.data.files.length}
                    </span>
                  </div>
                  {changesView === "tree"
                    ? groupByFolder(detail.data.files).map((group) => (
                        <Fragment key={group.dir || "."}>
                          {group.dir && (
                            <div className="change-folder" title={group.dir}>
                              <Icon name="folder" size={13} />
                              <span className="change-folder-name">{group.dir.slice(0, -1)}</span>
                              <span className="change-folder-count">{group.entries.length}</span>
                            </div>
                          )}
                          {group.entries.map((f) => fileRow(f, Boolean(group.dir)))}
                        </Fragment>
                      ))
                    : detail.data.files.map((f) => fileRow(f, false))}
                </div>
              ) : null
            ) : (
              <div className="empty-note">Select a commit in the graph, or a changed file in Working Tree.</div>
            )}
          </>
        )}
      </div>
      {tab === "changes" && <CommitComposer path={repo.path} tabId={repoTab.tabId} ui={ui} />}
    </aside>
  );
}

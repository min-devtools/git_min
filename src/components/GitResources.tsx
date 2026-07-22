import { useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  doCheckoutBranch,
  doCreateBranch,
  doDeleteBranch,
  doDeleteRemoteBranch,
  doDiscard,
  doMerge,
  doStage,
  doStashOp,
  doStashPush,
  doUnstage,
} from "../lib/actions";
import { checkoutableBranches, diffTargetFor, isSameStatusEntry, previewItems, statusEntryKey } from "../lib/gitUi";
import { useBranches, useLog, useRepoInfo, useStashes, useStatus } from "../lib/queries";
import type { BranchInfo, CommitInfo, GitResourceKind, StashInfo, StatusEntry } from "../lib/types";
import { useApp, type RepoTabUI } from "../store";
import { fileIcon, fileIconTone, Icon } from "../ui/Icon";
import { FilePath } from "../ui/FilePath";
import { ToolButton } from "../ui/ToolButton";
import { timeAgo } from "../lib/format";

const LABELS: Record<Exclude<GitResourceKind, "changes">, string> = {
  branches: "Branches",
  commits: "Commits",
  tags: "Tags",
  stashes: "Stashes",
};

function RefRow({ branch, path, tabId, ui, full }: {
  branch: BranchInfo;
  path: string;
  tabId: string;
  ui: RepoTabUI;
  full: boolean;
}) {
  const patchRepoTab = useApp((state) => state.patchRepoTab);
  const icon = branch.kind === "remote" ? "cloud" : branch.kind === "tag" ? "tag" : "git-branch";
  const select = () => patchRepoTab(tabId, {
    selectedBranch: branch.name,
    graphScope: branch.name,
    selectedCommit: null,
    diff: null,
    blame: null,
    focusedPanel: "branches",
  });
  return (
    <div
      role="button"
      tabIndex={0}
      className={`resource-row ${ui.selectedBranch === branch.name ? "active" : ""}`}
      title={`${branch.name} · ${branch.subject}`}
      onClick={select}
      onDoubleClick={() => void doCheckoutBranch(path, branch)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        select();
      }}
    >
      <Icon name={icon} size={13} className={branch.head ? "soft-green" : ""} />
      <span className={`resource-label ${branch.head ? "current" : ""}`}>{branch.name}</span>
      <span className="resource-meta">
        {branch.ahead > 0 && <span className="track-badge ahead">↑{branch.ahead}</span>}
        {branch.behind > 0 && <span className="track-badge behind">↓{branch.behind}</span>}
      </span>
      <span className="resource-actions">
        <button title="Checkout" aria-label={`Checkout ${branch.name}`} onClick={(event) => { event.stopPropagation(); void doCheckoutBranch(path, branch); }}>
          <Icon name="check" size={12} />
        </button>
        {full && branch.kind === "local" && !branch.head && (
          <>
            <button title="Merge into current branch" aria-label={`Merge ${branch.name}`} onClick={(event) => { event.stopPropagation(); void doMerge(path, branch.name); }}>
              <Icon name="git-merge" size={12} />
            </button>
            <button title="Delete branch" aria-label={`Delete ${branch.name}`} onClick={(event) => { event.stopPropagation(); void doDeleteBranch(path, branch.name); }}>
              <Icon name="trash" size={12} />
            </button>
          </>
        )}
        {full && branch.kind === "remote" && (
          <button title="Delete branch on remote" aria-label={`Delete ${branch.name} on remote`} onClick={(event) => { event.stopPropagation(); void doDeleteRemoteBranch(path, branch.name); }}>
            <Icon name="trash" size={12} />
          </button>
        )}
      </span>
    </div>
  );
}

function StashRow({ stash, path, tabId, ui, full }: { stash: StashInfo; path: string; tabId: string; ui: RepoTabUI; full: boolean }) {
  const patchRepoTab = useApp((state) => state.patchRepoTab);
  const active = ui.diff?.mode === "stash" && ui.diff.file === stash.id;
  const select = () => patchRepoTab(tabId, { diff: { mode: "stash", file: stash.id, label: stash.message } });
  return (
    <div
      role="button"
      tabIndex={0}
      className={`resource-row stash-resource-row ${active ? "active" : ""}`}
      title={`${stash.id} · ${stash.message} — click to view the stashed diff`}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); }
      }}
    >
      <Icon name="layers" size={13} className="soft-orange" />
      <span className="resource-label">{stash.message}</span>
      <span className="resource-meta">{timeAgo(stash.time)}</span>
      <span className="resource-actions">
        <button title="Apply and keep stash" aria-label={`Apply ${stash.id}`} onClick={(event) => { event.stopPropagation(); void doStashOp(path, stash.id, "apply"); }}><Icon name="download" size={12} /></button>
        {full && <button title="Apply and drop stash" aria-label={`Pop ${stash.id}`} onClick={(event) => { event.stopPropagation(); void doStashOp(path, stash.id, "pop"); }}><Icon name="check" size={12} /></button>}
        <button title="Drop stash" aria-label={`Drop ${stash.id}`} onClick={(event) => { event.stopPropagation(); void doStashOp(path, stash.id, "drop"); }}><Icon name="trash" size={12} /></button>
      </span>
    </div>
  );
}

function CommitRow({ commit, tabId, ui }: { commit: CommitInfo; tabId: string; ui: RepoTabUI }) {
  const patchRepoTab = useApp((state) => state.patchRepoTab);
  const select = () => patchRepoTab(tabId, {
    selectedCommit: commit.hash,
    selectedBranch: null,
    diff: null,
    focusedPanel: "graph",
  });
  return (
    <div
      role="button"
      tabIndex={0}
      className={`resource-row ${ui.selectedCommit === commit.hash ? "active" : ""}`}
      title={`${commit.hash.slice(0, 8)} · ${commit.subject} — ${commit.author}`}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); }
      }}
    >
      <Icon name="git-commit" size={13} className="soft-blue" />
      <span className="resource-label">{commit.subject}</span>
      <span className="resource-meta mono">{commit.hash.slice(0, 7)}</span>
    </div>
  );
}

function ChangeRow({ entry, path, tabId, ui }: { entry: StatusEntry; path: string; tabId: string; ui: RepoTabUI }) {
  const patchRepoTab = useApp((state) => state.patchRepoTab);
  const showToast = useApp((state) => state.showToast);
  const select = () => patchRepoTab(tabId, {
    selectedStatus: { path: entry.path, area: entry.area },
    focusedPanel: "changes",
    diff: diffTargetFor(entry),
  });
  return (
    <div key={statusEntryKey(entry)} role="button" tabIndex={0} className={`resource-row ${isSameStatusEntry(entry, ui.selectedStatus) ? "active" : ""}`} onClick={select} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); }
    }}>
      <span className="change-code">{entry.area === "untracked" ? "?" : entry.area === "conflict" ? "U" : entry.area === "staged" ? entry.code[0] : entry.code[1]}</span>
      <span className="resource-label file">
        <Icon name={fileIcon(entry.path)} size={13} className={`change-file-icon ${fileIconTone(entry.path) ?? ""}`} />
        <FilePath path={entry.path} />
      </span>
      <span className="resource-meta">{entry.area}</span>
      <span className="resource-actions">
        {entry.area === "staged" ? (
          <button title="Unstage" onClick={(event) => { event.stopPropagation(); void doUnstage(path, [entry.path]); }}>−</button>
        ) : entry.area === "conflict" ? (
          <button title="Open conflict" onClick={(event) => { event.stopPropagation(); void openPath(`${path}/${entry.path}`).catch((err) => showToast("Open failed", String(err), "err")); }}><Icon name="pencil" size={12} /></button>
        ) : (
          <>
            <button title="Stage" onClick={(event) => { event.stopPropagation(); void doStage(path, [entry.path]); }}>+</button>
            <button title="Discard" onClick={(event) => { event.stopPropagation(); void doDiscard(path, [entry.path], entry.area === "untracked"); }}><Icon name="trash" size={12} /></button>
          </>
        )}
      </span>
    </div>
  );
}

function SectionHeader({ label, count, action }: {
  label: string; count: number; action?: React.ReactNode;
}) {
  return (
    <div className="group-title resource-section-title">
      <span>{label}</span>
      <span className="resource-title-actions">
        {action}
        <span className="mono">{count}</span>
      </span>
    </div>
  );
}

/* "N more…" trailing row — same view-more shape as elastic_min indexes / kafka_ui_min topics */
function MoreRow({ hidden, onOpen }: { hidden: number; onOpen: () => void }) {
  if (hidden <= 0) return null;
  return (
    <div className="nav-item" onClick={onOpen}>
      <Icon name="more-horizontal" className="soft-orange" />
      <span>{hidden} more…</span>
    </div>
  );
}

export function GitResourcePreviews({ path, tabId, ui }: { path: string; tabId: string; ui: RepoTabUI }) {
  const branchesQ = useBranches(path);
  const stashesQ = useStashes(path);
  // shares the [path,"log",scope] cache with the graph — no extra fetch
  const logQ = useLog(path, ui.graphScope ?? null);
  const open = useApp((state) => state.openGitResourceTab);
  const refs = branchesQ.data ?? [];
  type Group =
    | { kind: "branches" | "tags"; items: BranchInfo[] }
    | { kind: "commits"; items: CommitInfo[] }
    | { kind: "stashes"; items: StashInfo[] };
  const groups: Group[] = [
    { kind: "branches", items: checkoutableBranches(refs) },
    { kind: "commits", items: logQ.data?.pages.flat() ?? [] },
    { kind: "stashes", items: stashesQ.data ?? [] },
    { kind: "tags", items: refs.filter((branch) => branch.kind === "tag") },
  ];
  return (
    <div className="git-resource-previews">
      {groups.map((group) =>
        group.kind === "commits" ? (
          <section key={group.kind} className="resource-preview">
            <SectionHeader label={LABELS[group.kind]} count={group.items.length} />
            {previewItems(group.items).visible.map((commit) => <CommitRow key={commit.hash} commit={commit} tabId={tabId} ui={ui} />)}
            <MoreRow hidden={previewItems(group.items).hidden} onOpen={() => open(tabId, group.kind)} />
            {group.items.length === 0 && <div className="empty-note compact">No commits.</div>}
          </section>
        ) : group.kind === "stashes" ? (
          <section key={group.kind} className="resource-preview">
            <SectionHeader
              label={LABELS[group.kind]}
              count={group.items.length}
              action={<button className="group-action" title="Stash changes" onClick={() => void doStashPush(path)}><Icon name="plus" size={12} /></button>}
            />
            {previewItems(group.items).visible.map((stash) => <StashRow key={stash.id} stash={stash} path={path} tabId={tabId} ui={ui} full={false} />)}
            <MoreRow hidden={previewItems(group.items).hidden} onOpen={() => open(tabId, group.kind)} />
            {group.items.length === 0 && <div className="empty-note compact">No {LABELS[group.kind].toLowerCase()}.</div>}
          </section>
        ) : (
          <section key={group.kind} className="resource-preview">
            <SectionHeader
              label={LABELS[group.kind]}
              count={group.items.length}
              action={group.kind === "branches" ? <button className="group-action" title="New branch" onClick={() => void doCreateBranch(path)}><Icon name="plus" size={12} /></button> : undefined}
            />
            {previewItems(group.items).visible.map((branch) => <RefRow key={branch.name} branch={branch} path={path} tabId={tabId} ui={ui} full={false} />)}
            <MoreRow hidden={previewItems(group.items).hidden} onOpen={() => open(tabId, group.kind)} />
            {group.items.length === 0 && <div className="empty-note compact">No {LABELS[group.kind].toLowerCase()}.</div>}
          </section>
        )
      )}
    </div>
  );
}

export function GitResourceList({ path, tabId, ui, resource }: { path: string; tabId: string; ui: RepoTabUI; resource: GitResourceKind }) {
  const [filter, setFilter] = useState("");
  const branchesQ = useBranches(path);
  const stashesQ = useStashes(path);
  const statusQ = useStatus(path);
  const infoQ = useRepoInfo(path);
  const logQ = useLog(resource === "commits" ? path : undefined, ui.graphScope ?? null);
  const q = filter.trim().toLowerCase();
  const refs = resource === "branches"
    ? checkoutableBranches(branchesQ.data ?? [])
    : (branchesQ.data ?? []).filter((branch) => branch.kind === "tag");
  const changes = statusQ.data ?? [];
  const source = resource === "changes" ? changes
    : resource === "stashes" ? (stashesQ.data ?? [])
    : resource === "commits" ? (logQ.data?.pages.flat() ?? [])
    : refs;
  const items = source.filter((item) => {
    const label = "path" in item ? item.path : "message" in item ? item.message : "author" in item ? `${item.subject} ${item.hash} ${item.author}` : item.name;
    return !q || label.toLowerCase().includes(q);
  });
  return (
    <div className="resource-manager">
      <header className="resource-manager-head">
        <div>
          <strong>{resource === "changes" ? "Working Tree" : LABELS[resource]}</strong>
          <span>{items.length} shown · {infoQ.data?.branch ?? "HEAD"}</span>
        </div>
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={`Filter ${resource}…`} aria-label={`Filter ${resource}`} />
        {resource === "branches" && <ToolButton onClick={() => void doCreateBranch(path)}><Icon name="plus" /> New branch</ToolButton>}
        {resource === "stashes" && <ToolButton onClick={() => void doStashPush(path)}><Icon name="plus" /> Stash changes</ToolButton>}
      </header>
      <div className="resource-manager-list">
        {items.map((item) => resource === "changes"
          ? <ChangeRow key={statusEntryKey(item as StatusEntry)} entry={item as StatusEntry} path={path} tabId={tabId} ui={ui} />
          : resource === "stashes"
            ? <StashRow key={(item as StashInfo).id} stash={item as StashInfo} path={path} tabId={tabId} ui={ui} full />
            : resource === "commits"
              ? <CommitRow key={(item as CommitInfo).hash} commit={item as CommitInfo} tabId={tabId} ui={ui} />
              : <RefRow key={(item as BranchInfo).name} branch={item as BranchInfo} path={path} tabId={tabId} ui={ui} full />)}
        {resource === "commits" && logQ.hasNextPage && (
          <ToolButton onClick={() => void logQ.fetchNextPage()} disabled={logQ.isFetchingNextPage}>
            {logQ.isFetchingNextPage ? "Loading…" : "Load more"}
          </ToolButton>
        )}
        {items.length === 0 && <div className="resource-empty"><Icon name="list" size={20} /><span>No matching {resource}.</span></div>}
      </div>
    </div>
  );
}

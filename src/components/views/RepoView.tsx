import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { GraphTable } from "../GraphTable";
import { ToolButton } from "../../ui/ToolButton";
import { SectionVeil } from "../../ui/SectionVeil";
import { LoadingBar } from "../../ui/LoadingBar";
import { Icon } from "../../ui/Icon";
import { activeRepoTab, useApp } from "../../store";
import { useBranches, useLog, useRepoInfo, useStatus } from "../../lib/queries";
import {
  doCheckoutBranch, doCherryPickOp, doCreateBranch, doDeleteBranch, doDeleteRemoteBranch, doDiscard,
  doDiscardAll, doFetch, doGenerateCommitMessage, doMerge, doPasteCherryPicks, doMergeAbort, doMergeContinue, doPull, doPush, doQuickCheckout, doRebaseOp,
  doStage, doStashPush, doUndoCommit, doUnstage, openOnRemote,
} from "../../lib/actions";
import type { StatusEntry } from "../../lib/types";
import { adjacentStatusSelection, diffTargetFor, isSameStatusEntry, matchesCommitQuery, nextPanel, repoShortcutAction, stageableEntries, visibleStatusOrder } from "../../lib/gitUi";

export function RepoView({ tabId, active }: { tabId: string; active: boolean }) {
  const { ui, repo, patchRepoTab, vimKeys, operation } = useApp(
    useShallow((s) => ({
      ui: s.repoTabs[tabId],
      repo: s.repos.find((r) => r.id === s.repoTabs[tabId]?.repoId) ?? null,
      patchRepoTab: s.patchRepoTab,
      vimKeys: s.vimKeys,
      operation: s.operations[s.repos.find((r) => r.id === s.repoTabs[tabId]?.repoId)?.path ?? ""],
    })),
  );
  const path = repo?.path;
  // a diff tab of this repo is a centre tab of its own — the repo data must stay live behind it
  const live = useApp((s) => activeRepoTab(s)?.tabId === tabId);
  const info = useRepoInfo(live ? path : undefined);
  const log = useLog(live ? path : undefined, ui?.graphScope ?? null);
  const branchList = useBranches(live ? path : undefined);
  const statusQ = useStatus(live ? path : undefined);

  // null = the search bar is closed; "" = open and empty
  const [search, setSearch] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // memoized: a fresh .flat() every render would invalidate searchHits/visible/byHash
  // and make GraphTable's scroll effects re-fire on every 5s poll re-render
  const loaded = useMemo(() => log.data?.pages.flat() ?? [], [log.data]);
  // search only highlights — the full list stays visible so the graph keeps its
  // shape. ponytail: matches only the pages already loaded, not the whole
  // history; a backend `git log --grep` search is the upgrade path.
  // ordered, not just a Set: ‹ › step through hits in graph order and the counter
  // needs the position of the selected commit among them
  const hitList = useMemo(
    () => (search?.trim() ? loaded.filter((c) => matchesCommitQuery(c, search)).map((c) => c.hash) : null),
    [loaded, search],
  );
  const searchHits = useMemo(() => (hitList ? new Set(hitList) : null), [hitList]);
  const hitIndex = hitList ? hitList.indexOf(ui?.selectedCommit ?? "") : -1;
  // wraps: hitting the end lands back on the first match instead of dead-ending
  const gotoHit = (dir: 1 | -1) => {
    if (!hitList?.length) return;
    const next = hitIndex < 0 ? (dir === 1 ? 0 : hitList.length - 1) : (hitIndex + dir + hitList.length) % hitList.length;
    patchRepoTab(tabId, { selectedCommit: hitList[next], selectedBranch: null, diff: null });
  };
  const commits = loaded;
  const hasMore = log.hasNextPage;
  const remoteBranches = useMemo(
    () => new Set((branchList.data ?? []).filter((b) => b.kind === "remote").map((b) => b.name)),
    [branchList.data],
  );

  // ⌘F opens the graph search, Esc closes it from anywhere (not just the input)
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const s = useApp.getState();
      if (s.dialog) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearch((prev) => prev ?? "");
        requestAnimationFrame(() => searchRef.current?.select());
        return;
      }
      if (e.key === "Escape" && search !== null && !s.commandOpen && !s.keymapOpen && !s.contextMenuOpen) {
        e.preventDefault();
        setSearch(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, search]);

  // ---- lazygit-style single-key bindings -------------------------------
  const dataRef = useRef({ commits, branches: branchList.data ?? [], status: statusQ.data ?? [], ui, path });
  dataRef.current = { commits, branches: branchList.data ?? [], status: statusQ.data ?? [], ui, path };

  // bound on `live`, not `active`: an open diff tab is a centre tab of its own, but
  // j/k must keep driving the Changes/graph selection behind it (lazygit behaviour)
  useEffect(() => {
    if (!live || !vimKeys) return;
    const onKey = (e: KeyboardEvent) => {
      const s = useApp.getState();
      if (e.defaultPrevented) return; // the focused view (e.g. diff tab Esc) already claimed it
      if (e.metaKey || e.ctrlKey || e.altKey || s.dialog || s.commandOpen || s.keymapOpen || s.contextMenuOpen) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      const { commits, branches, status, ui, path } = dataRef.current;
      if (!ui || !path) return;

      const patch = (p: Parameters<typeof patchRepoTab>[1]) => patchRepoTab(tabId, p);
      const locals = branches.filter((b) => b.kind === "local");
      const branchNames = [...locals, ...branches.filter((b) => b.kind === "remote")].map((b) => b.name);
      // walk rows in painted order, not `git status` order, or j/k jumps between sections
      const files = visibleStatusOrder(status, s.changesView, ui.collapsedFolders);
      const currentBranch = locals.find((b) => b.head)?.name ?? "";

      const move = (dir: 1 | -1) => {
        if (ui.focusedPanel === "graph") {
          const idx = commits.findIndex((c) => c.hash === ui.selectedCommit);
          const next = commits[Math.min(commits.length - 1, Math.max(0, idx + dir))] ?? commits[0];
          if (next) patch({ selectedCommit: next.hash });
        } else if (ui.focusedPanel === "branches") {
          const idx = branchNames.indexOf(ui.selectedBranch ?? "");
          const next = branchNames[Math.min(branchNames.length - 1, Math.max(0, idx + dir))] ?? branchNames[0];
          if (next) patch({ selectedBranch: next, graphScope: next, selectedCommit: null, diff: null, blame: null });
        } else if (ui.focusedPanel === "changes") {
          const idx = files.findIndex((f) => isSameStatusEntry(f, ui.selectedStatus));
          const next = files[Math.min(files.length - 1, Math.max(0, idx + dir))] ?? files[0];
          if (next) patch({
            selectedStatus: { path: next.path, area: next.area },
            diff: diffTargetFor(next),
          });
        }
      };
      const jump = (end: boolean) => {
        if (ui.focusedPanel === "graph" && commits.length)
          patch({ selectedCommit: commits[end ? commits.length - 1 : 0].hash });
        if (ui.focusedPanel === "branches" && branchNames.length)
          patch({
            selectedBranch: branchNames[end ? branchNames.length - 1 : 0],
            graphScope: branchNames[end ? branchNames.length - 1 : 0],
            selectedCommit: null,
            diff: null,
            blame: null,
          });
        if (ui.focusedPanel === "changes" && files.length)
          patch({
            selectedStatus: {
              path: files[end ? files.length - 1 : 0].path,
              area: files[end ? files.length - 1 : 0].area,
            },
          });
      };
      const selectedEntry = (): StatusEntry | undefined => files.find((f) => isSameStatusEntry(f, ui.selectedStatus));
      const toggleStage = async () => {
        const f = selectedEntry();
        if (!f) return;
        if (f.area === "conflict") {
          s.showToast("Conflict unresolved", "Choose a side or edit the file, then mark it resolved.", "warn");
          return;
        }
        const adjacent = adjacentStatusSelection(files, f);
        patch({
          selectedStatus: adjacent ? { path: adjacent.path, area: adjacent.area } : null,
          diff: adjacent ? diffTargetFor(adjacent) : null,
        });
        const changed = f.area === "staged" ? await doUnstage(path, [f.path]) : await doStage(path, [f.path]);
        if (!changed) {
          const current = useApp.getState().repoTabs[tabId]?.selectedStatus;
          const expected = adjacent ? { path: adjacent.path, area: adjacent.area } : null;
          if ((current === null && expected === null) || (current && expected && isSameStatusEntry(current, expected))) {
            patch({ selectedStatus: { path: f.path, area: f.area }, diff: diffTargetFor(f) });
          }
        }
      };
      const stageAll = () => {
        const unstaged = stageableEntries(files);
        if (unstaged.length) void doStage(path, unstaged.map((f) => f.path));
        else {
          const staged = files.filter((f) => f.area === "staged");
          if (staged.length) void doUnstage(path, staged.map((f) => f.path));
        }
      };

      switch (e.key) {
        case "j": move(1); break;
        case "k": move(-1); break;
        case "h":
        case "l": {
          const dir = e.key === "l" ? 1 : -1;
          const destination = nextPanel(ui.focusedPanel, dir);
          // reveal whichever dock hosts the destination, or j/k would drive an
          // invisible selection: refs sit in the left dock, the rest in the right
          if (destination === "branches") useApp.setState({ leftCollapsed: false });
          else if (destination !== "graph") useApp.setState({ rightCollapsed: false });
          patch({
            focusedPanel: destination,
            inspectorTab:
              destination === "files" ? "diff"
              : destination === "changes" ? "changes"
              : ui.inspectorTab,
          });
          break;
        }
        // lazygit binds its AI-commit custom command in the 'files' context — same here:
        // g generates the message inside Changes, and still jumps to top elsewhere
        case "g":
          if (ui.focusedPanel === "changes") void doGenerateCommitMessage(path, tabId);
          else jump(false);
          break;
        case "Home": jump(false); break;
        case "G":
        case "End": jump(true); break;
        case "Enter": {
          if (ui.focusedPanel === "branches" && ui.selectedBranch) {
            const branch = branches.find((item) => item.name === ui.selectedBranch);
            if (branch) void doCheckoutBranch(path, branch);
          }
          else if (ui.focusedPanel === "changes") {
            const f = selectedEntry();
            if (f) patch({ diff: diffTargetFor(f) });
          } else if (ui.selectedCommit) patch({ diff: null }); // detail already opens via selection
          break;
        }
        case " ":
        case "a": {
          if (ui.focusedPanel !== "changes") return;
          e.preventDefault();
          void toggleStage();
          break;
        }
        case "A": {
          if (ui.focusedPanel !== "changes" || !files.length) return;
          stageAll();
          break;
        }
        // lazygit copy/paste of commits: C copies the selected commit into the
        // cherry-pick clipboard (toggle), V replays the whole clipboard here
        case "C": {
          const commit = commits.find((c) => c.hash === ui.selectedCommit);
          if (!commit) return;
          e.preventDefault();
          s.toggleCherryPick(path, { hash: commit.hash, subject: commit.subject, time: commit.time });
          patch({ inspectorTab: "actions" });
          useApp.setState({ rightCollapsed: false });
          break;
        }
        case "V":
          e.preventDefault();
          void doPasteCherryPicks(path);
          break;
        case "d": {
          if (ui.focusedPanel === "branches" && ui.selectedBranch) {
            const b = branches.find((x) => x.name === ui.selectedBranch);
            if (b?.kind === "local" && !b.head) void doDeleteBranch(path, b.name);
            else if (b?.kind === "remote") void doDeleteRemoteBranch(path, b.name);
          } else if (ui.focusedPanel === "changes") {
            const f = selectedEntry();
            if (f?.area === "staged") s.showToast("Nothing to discard", "Unstage the file first (space), then discard it.", "warn");
            else if (f && f.area !== "conflict") void doDiscard(path, [f.path], f.area === "untracked");
          }
          break;
        }
        case "D":
          if (ui.focusedPanel === "changes") void doDiscardAll(path, files);
          break;
        case "n": void doCreateBranch(path); break;
        case "b":
        case "c": {
          const action = repoShortcutAction(e.key);
          if (action === "checkout") void doQuickCheckout(path);
          else if (action === "focus-commit") {
            e.preventDefault();
            useApp.setState({ rightCollapsed: false });
            patch({ focusedPanel: "changes", inspectorTab: "changes" });
            requestAnimationFrame(() => document.getElementById(`commit-message-${tabId}`)?.focus());
          }
          break;
        }
        // m works from any panel — the selected ref is what gets merged, and a
        // silent no-op here just reads as a missing binding
        case "m":
          if (!ui.selectedBranch) s.showToast("Merge", "Select a branch first (h focuses the refs dock).", "warn");
          else if (ui.selectedBranch === currentBranch) s.showToast("Merge", `“${currentBranch}” is already the current branch.`, "warn");
          else void doMerge(path, ui.selectedBranch);
          break;
        case "p": void doPull(path); break;
        case "P": void doPush(path); break;
        case "f": void doFetch(path); break;
        case "S": void doStashPush(path); break;
        // same three-state cycle as the History scope button: a branch scope
        // resolves back to the current branch, then toggles against all refs
        case "x":
          patch({ graphScope: ui.graphScope === "HEAD" ? null : "HEAD", selectedCommit: null });
          break;
        // lazygit `z`: undo the last commit, its changes back in the index. The old
        // message refills the commit box unless something is already typed there.
        case "z":
          void doUndoCommit(path).then((message) => {
            if (message === null) return;
            const draft = useApp.getState().repoTabs[tabId]?.commitDraft ?? "";
            if (!draft.trim()) patchRepoTab(tabId, { commitDraft: message });
          });
          break;
        case "o":
          if (ui.focusedPanel === "graph" && ui.selectedCommit) void openOnRemote(path, "commit", ui.selectedCommit);
          else void openOnRemote(path, "pr", ui.selectedBranch ?? currentBranch);
          break;
        case "y": {
          const text =
            ui.focusedPanel === "graph" ? ui.selectedCommit :
            ui.focusedPanel === "branches" ? ui.selectedBranch :
            ui.selectedStatus?.path;
          if (text) {
            void writeText(text);
            s.showToast("Copied", text, "ok");
          }
          break;
        }
        case "?": s.setKeymapOpen(true); break;
        case "Escape":
          if (ui.blame) patch({ blame: null, inspectorTab: "changes" });
          else if (ui.diff) patch({ diff: null, inspectorTab: "changes" });
          else if (ui.selectedCommit) patch({ selectedCommit: null, inspectorTab: "changes" });
          break;
        default: return;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [live, vimKeys, tabId, patchRepoTab]);

  if (!repo || !ui) {
    return (
      <section className={`content repo-view ${active ? "active" : ""}`}>
        <div className="empty-note" style={{ margin: "auto" }}>Repository missing — was it removed?</div>
      </section>
    );
  }

  // one button, three states: all refs ⇄ current branch, and a branch scope that
  // clicks back to the current branch. Two buttons that both reset felt broken.
  const scope = ui.graphScope;
  const scopeLabel = scope === null ? "All refs" : scope === "HEAD" ? "Current branch" : scope;
  const nextScope = scope === "HEAD" ? null : "HEAD";
  const scopeTitle = scope === null
    ? "Showing every ref — click to follow the current branch only"
    : scope === "HEAD"
      ? "Following the current branch — click to show every ref"
      : `Scoped to ${scope} — click to follow the current branch`;

  const conflictCount = (statusQ.data ?? []).filter((entry) => entry.area === "conflict").length;

  return (
    <section className={`content repo-view ${active ? "active" : ""}`}>
      {/* view-level progress: the line rides the top edge of the main view, the veil
          dims the whole view for network ops (fetch/pull/push/remote delete) which
          otherwise ran with no visible feedback at all */}
      <LoadingBar active={!!operation || log.isFetching || statusQ.isFetching} />
      <SectionVeil on={operation?.kind === "background"} label={`${operation?.label ?? "Working"}…`} />
      {info.data?.merging && (
        <div className="merge-banner">
          <Icon name="git-merge" size={15} />
          <strong>Merge in progress</strong>
          <span>{conflictCount ? `Resolve ${conflictCount} conflict${conflictCount === 1 ? "" : "s"} in Working Tree.` : "All conflicts are resolved — ready to continue."}</span>
          <span className="merge-banner-actions">
            <ToolButton variant="primary" disabled={conflictCount > 0} onClick={() => void doMergeContinue(repo.path)}>Continue</ToolButton>
            <ToolButton variant="danger" onClick={() => void doMergeAbort(repo.path)}>Abort</ToolButton>
          </span>
        </div>
      )}
      {info.data?.cherryPicking && (
        <div className="merge-banner">
          <Icon name="git-commit" size={15} />
          <strong>Cherry-pick in progress</strong>
          <span>{conflictCount ? `Resolve ${conflictCount} conflict${conflictCount === 1 ? "" : "s"} in Working Tree.` : "All conflicts are resolved — ready to continue."}</span>
          <span className="merge-banner-actions">
            <ToolButton variant="primary" disabled={conflictCount > 0} onClick={() => void doCherryPickOp(repo.path, "continue")}>Continue</ToolButton>
            <ToolButton onClick={() => void doCherryPickOp(repo.path, "skip")}>Skip</ToolButton>
            <ToolButton variant="danger" onClick={() => void doCherryPickOp(repo.path, "abort")}>Abort</ToolButton>
          </span>
        </div>
      )}
      {info.data?.rebasing && (
        <div className="merge-banner">
          <Icon name="history" size={15} />
          <strong>Rebase in progress</strong>
          <span>{conflictCount ? `Resolve ${conflictCount} conflict${conflictCount === 1 ? "" : "s"}. During rebase, “Base” is the target branch and “Replayed commit” is your commit.` : "All conflicts are resolved — continue or skip the current commit."}</span>
          <span className="merge-banner-actions">
            <ToolButton variant="primary" disabled={conflictCount > 0} onClick={() => void doRebaseOp(repo.path, "continue")}>Continue</ToolButton>
            <ToolButton onClick={() => void doRebaseOp(repo.path, "skip")}>Skip</ToolButton>
            <ToolButton variant="danger" onClick={() => void doRebaseOp(repo.path, "abort")}>Abort</ToolButton>
          </span>
        </div>
      )}
      <div
        className={`graph-pane ${ui.focusedPanel === "graph" ? "panel-focused" : ""}`}
        onMouseDown={() => patchRepoTab(tabId, { focusedPanel: "graph" })}
      >
        <SectionVeil
          on={log.isPending || operation?.kind === "foreground"}
          label={operation?.kind === "foreground" ? `${operation.label}…` : "Reading history…"}
        />
        {log.isError ? (
          <div className="empty-note" style={{ margin: "auto" }}>{String(log.error)}</div>
        ) : (
          <>
            <div className="graph-scope-bar">
              <span>History</span>
              <button
                type="button"
                className={scope === null ? "" : "active"}
                title={scopeTitle}
                onClick={() => patchRepoTab(tabId, { graphScope: nextScope, selectedCommit: null })}
              >
                <Icon name={scope === null ? "layers" : "git-branch"} size={12} /> {scopeLabel}
              </button>
              {search === null ? (
                <button type="button" title="Search commits (⌘F)" onClick={() => { setSearch(""); requestAnimationFrame(() => searchRef.current?.focus()); }}>
                  <Icon name="search" size={12} />
                </button>
              ) : (
                <span className="graph-search">
                  <Icon name="search" size={12} />
                  <input
                    ref={searchRef}
                    value={search}
                    spellCheck={false}
                    placeholder="Search subject, author, hash, branch…"
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setSearch(null);
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        gotoHit(e.shiftKey ? -1 : 1);
                      }
                    }}
                  />
                  {search.trim() && (
                    <>
                      <span className="graph-search-count">
                        {hitList?.length ? `${hitIndex + 1}/${hitList.length}` : "0/0"}
                      </span>
                      <button
                        type="button"
                        title="Previous match (⇧↵)"
                        disabled={!hitList?.length}
                        onClick={() => gotoHit(-1)}
                      >‹</button>
                      <button
                        type="button"
                        title="Next match (↵)"
                        disabled={!hitList?.length}
                        onClick={() => gotoHit(1)}
                      >›</button>
                    </>
                  )}
                  <button type="button" title="Close search (Esc)" onClick={() => setSearch(null)}>
                    <Icon name="x" size={12} />
                  </button>
                </span>
              )}
            </div>
            <GraphTable
              path={repo.path}
              commits={commits}
              searchHits={searchHits}
              selected={ui.selectedCommit}
              onSelect={(hash) => patchRepoTab(tabId, { selectedCommit: hash, selectedBranch: null, diff: null })}
              onSelectRef={(name, hash) => patchRepoTab(tabId, {
                selectedBranch: name,
                selectedCommit: hash,
                diff: null,
              })}
              hasMore={hasMore}
              onLoadMore={() => void log.fetchNextPage()}
              remoteBranches={remoteBranches}
            />
          </>
        )}
      </div>
    </section>
  );
}

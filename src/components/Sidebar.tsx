import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openPath } from "@tauri-apps/plugin-opener";
import { ContextMenu } from "../ui/ContextMenu";
import { activeRepo, activeRepoTab, useApp } from "../store";
import { GitResourcePreviews } from "./GitResources";
import { useRepoInfos } from "../lib/queries";
import type { Repo, RepoInfo } from "../lib/types";
import { Icon } from "../ui/Icon";
import { ColorPicker } from "../ui/ColorPicker";
import { connStyle } from "../lib/connColor";
import { sortRepos } from "../lib/repoSort";

/** Repo entry — single-line design-system row like the sibling apps; branch
 *  lives in the tooltip, state in the meta badges. */
function RepoRow({
  repo, info: d, active, onOpen, onMenu,
}: {
  repo: Repo;
  info: RepoInfo | undefined;
  active: boolean;
  onOpen: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`nav-item repo-row ${active ? "active" : ""}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      onContextMenu={onMenu}
      title={d?.branch ? `${repo.path} — ${d.branch}` : repo.path}
    >
      <span
        className="conn-dot"
        style={connStyle(repo.color)}
        title={repo.color ? `Color: ${repo.color}` : "No color — set one from the right-click menu"}
      />
      <span className="repo-name">{repo.name}</span>
      {d && (d.dirty > 0 || d.ahead > 0 || d.behind > 0) && (
        <span className="repo-track">
          {d.dirty > 0 && <span className="track-badge dirty">●{d.dirty}</span>}
          {d.ahead > 0 && <span className="track-badge ahead">↑{d.ahead}</span>}
          {d.behind > 0 && <span className="track-badge behind">↓{d.behind}</span>}
        </span>
      )}
    </div>
  );
}

const RECENT_LIMIT = 5;

export function Sidebar() {
  const [repoMenu, setRepoMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [coloringId, setColoringId] = useState<string | null>(null);

  const {
    repos, selectRepo, openRepoTab, openTab, removeRepo, renameRepo, setRepoColor,
    openDialog, activeKind,
  } = useApp(useShallow((s) => ({
    repos: s.repos, selectRepo: s.selectRepo,
    openRepoTab: s.openRepoTab, openTab: s.openTab, removeRepo: s.removeRepo, renameRepo: s.renameRepo,
    setRepoColor: s.setRepoColor,
    openDialog: s.openDialog,
    activeKind: s.tabs.find((t) => t.id === s.activeTabId)?.kind,
  })));
  // useShallow — activeRepoTab builds a fresh {tabId, ui} object per call
  const repoTab = useApp(useShallow((s) => activeRepoTab(s)));

  const ui = repoTab?.ui;
  const repoPath = useApp((s) => s.repos.find((r) => r.id === activeRepoTab(s)?.ui.repoId)?.path);

  const repoInfos = useRepoInfos(repos);
  // the dock is navigation, not a browser: five most-recent repos, the rest live on
  // Welcome (sorting and filtering are there too)
  const visibleRepos = useMemo(
    () => sortRepos(repos, "recent", () => 0).slice(0, RECENT_LIMIT),
    [repos],
  );

  // ⌘E rename / ⌘⌫ remove the selected repo — see design-systems/SHORTCUTS.md
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || useApp.getState().dialog) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      const s = useApp.getState();
      const targetId = s.selectedRepoId ?? activeRepo(s)?.id ?? null;
      const r = repos.find((x) => x.id === targetId);
      if (!r) return;
      if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        const name = await openDialog({
          kind: "prompt", title: "Rename repository", defaultValue: r.name, confirmLabel: "Rename",
        });
        if (name) renameRepo(r.id, name);
      }
      if (e.key === "Backspace") {
        // Welcome owns ⌘⌫ while it is open — it can remove a whole multi-selection
        if (s.tabs.find((t) => t.id === s.activeTabId)?.kind === "welcome") return;
        e.preventDefault();
        const ok = await openDialog({
          kind: "confirm",
          title: "Remove repository?",
          message: `Remove “${r.name}” from the list? Files on disk are not touched.`,
          confirmLabel: "Remove",
          danger: true,
        });
        if (ok !== null) removeRepo(r.id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [repos, openDialog, renameRepo, removeRepo]);

  return (
    <aside className="sidebar">
      <div className="side-scroll">
        {/* Workspace — pinned first, like every sibling app */}
        <div className="group">
          <div className="group-title"><span>Workspace</span><span /></div>
          <div
            role="button"
            className={`index-item ${activeKind === "welcome" ? "active" : ""}`}
            onClick={() => openTab("welcome")}
          >
            <Icon name="sparkles" size={13} className="soft-blue" />
            <span>Welcome</span>
            <span className="kbd">⌘N</span>
          </div>
          <div
            role="button"
            className={`index-item ${activeKind === "settings" ? "active" : ""}`}
            onClick={() => openTab("settings")}
          >
            <Icon name="settings" size={13} className="soft-orange" />
            <span>Settings</span>
            <span className="kbd">⌘,</span>
          </div>
        </div>

        {/* Recent repositories — highlight follows the open repo tab */}
        <div className="group">
          <div className="group-title">
            <span>Recent</span>
            <span>{repos.length || ""}</span>
          </div>
          <div className="repo-list">
            {visibleRepos.map((r) => (
              <RepoRow
                key={r.id}
                repo={r}
                info={repoInfos.get(r.path)}
                active={ui?.repoId === r.id && activeKind === "repo"}
                onOpen={() => {
                  selectRepo(r.id);
                  openRepoTab(r.id);
                }}
                onMenu={(e) => {
                  e.preventDefault();
                  selectRepo(r.id);
                  setRepoMenu({ x: e.clientX, y: e.clientY, id: r.id });
                }}
              />
            ))}
          </div>
          {/* "N more…" trailing row — same view-more shape as elastic_min indexes / kafka_ui_min topics */}
          {repos.length > RECENT_LIMIT && (
            <div className="nav-item" onClick={() => openTab("welcome")}>
              <Icon name="more-horizontal" className="soft-orange" />
              <span>{repos.length - RECENT_LIMIT} more…</span>
            </div>
          )}
          {repos.length === 0 && <div className="empty-note">No repositories yet — add from Welcome.</div>}
        </div>

        {/* Refs of the open repository — navigation belongs in the left dock, the
            right dock stays the inspector (changes / diff / actions) */}
        {repoTab && repoPath && <GitResourcePreviews path={repoPath} tabId={repoTab.tabId} ui={repoTab.ui} />}
      </div>

      {repoMenu && (
        <ContextMenu
          x={repoMenu.x}
          y={repoMenu.y}
          onClose={() => setRepoMenu(null)}
          items={[
            { icon: "folder-open", label: "Open", strong: true, onClick: () => openRepoTab(repoMenu.id) },
            {
              icon: "pencil",
              label: "Rename (⌘E)",
              onClick: async () => {
                const r = repos.find((x) => x.id === repoMenu.id);
                if (!r) return;
                const name = await openDialog({ kind: "prompt", title: "Rename repository", defaultValue: r.name, confirmLabel: "Rename" });
                if (name) renameRepo(r.id, name);
              },
            },
            {
              icon: "status",
              label: "Set color…",
              onClick: () => setColoringId(repoMenu.id),
            },
            {
              icon: "copy",
              label: "Copy path",
              onClick: () => {
                const r = repos.find((x) => x.id === repoMenu.id);
                if (r) void writeText(r.path);
              },
            },
            {
              icon: "folder",
              label: "Reveal in Finder",
              onClick: () => {
                const r = repos.find((x) => x.id === repoMenu.id);
                if (r) void openPath(r.path);
              },
            },
            {
              icon: "trash",
              label: "Remove from list (⌘⌫)",
              danger: true,
              onClick: async () => {
                const r = repos.find((x) => x.id === repoMenu.id);
                if (!r) return;
                const ok = await openDialog({
                  kind: "confirm",
                  title: "Remove repository?",
                  message: `Remove “${r.name}” from the list? Files on disk are not touched.`,
                  confirmLabel: "Remove",
                  danger: true,
                });
                if (ok !== null) removeRepo(r.id);
              },
            },
          ]}
        />
      )}

      {coloringId && (
        <ColorPicker
          value={repos.find((r) => r.id === coloringId)?.color}
          onPick={(color) => setRepoColor(coloringId, color)}
          onClose={() => setColoringId(null)}
        />
      )}
    </aside>
  );
}

import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useApp } from "../store";
import { connStyle } from "../lib/connColor";
import { ContextMenu } from "../ui/ContextMenu";
import { Icon } from "../ui/Icon";
import { hasCommitDraft } from "../lib/gitUi";
import type { TabDef } from "../lib/types";

export function TabsBar() {
  const { tabs, repos, activeTabId, activateTab, closeTab, openTab, repoTabs, renameRepo, reorderTab } = useApp(
    useShallow((s) => ({
      tabs: s.tabs, repos: s.repos, activeTabId: s.activeTabId, activateTab: s.activateTab, closeTab: s.closeTab,
      openTab: s.openTab, repoTabs: s.repoTabs, renameRepo: s.renameRepo, reorderTab: s.reorderTab,
    })),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // the bar scrolls, so a tab reached by ⌘1-9 / the palette / a close can be off-screen
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  const commit = () => {
    const repoId = editingId ? repoTabs[editingId]?.repoId : null;
    if (repoId) renameRepo(repoId, draft);
    setEditingId(null);
  };

  const draggedTabId = (event: React.DragEvent) =>
    event.dataTransfer.getData("application/x-gitmin-tab") || dragId;

  // diff / git-resource tabs hang off a repo tab, so they inherit its repository
  const repoOf = (tab: TabDef) => {
    const repoId = (repoTabs[tab.id] ?? (tab.repoTabId ? repoTabs[tab.repoTabId] : undefined))?.repoId;
    return repoId ? repos.find((r) => r.id === repoId) : undefined;
  };

  return (
    <nav className="tabs" role="tablist" aria-label="Open workspaces">
      {tabs.map((tab) => {
        const repo = repoOf(tab);
        return (
        <button
          key={tab.id}
          ref={tab.id === activeTabId ? activeRef : undefined}
          type="button"
          role="tab"
          aria-selected={tab.id === activeTabId}
          draggable={!editingId}
          className={`tab ${tab.id === activeTabId ? "active" : ""} ${dragId === tab.id ? "dragging" : ""} ${overId === tab.id && dragId && dragId !== tab.id ? "drag-over" : ""}`}
          style={connStyle(repo?.color)}
          onClick={() => activateTab(tab.id)}
          onAuxClick={(e) => {
            // middle-click closes the tab
            if (e.button === 1) void closeTab(tab.id);
          }}
          onDoubleClick={() => {
            if (tab.kind !== "repo") return;
            setEditingId(tab.id);
            setDraft(tab.title);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, id: tab.id });
          }}
          onDragStart={(e) => {
            setDragId(tab.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("application/x-gitmin-tab", tab.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setOverId(null);
          }}
          onDragOver={(e) => {
            if (!dragId || dragId === tab.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setOverId(tab.id);
          }}
          onDragLeave={() => setOverId((o) => (o === tab.id ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            const id = draggedTabId(e);
            if (id && id !== tab.id) reorderTab(id, tab.id);
            setDragId(null);
            setOverId(null);
          }}
          title={repo ? `${tab.title} Â· ${repo.name}` : tab.kind === "repo" ? "Double-click to rename Â· right-click for menu" : undefined}
        >
          {repo && <span className="conn-dot" />}
          <Icon name={tab.icon} className={tab.iconClass} />
          {editingId === tab.id ? (
            <input
              ref={inputRef}
              className="tab-title-input"
              value={draft}
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditingId(null);
              }}
            />
          ) : (
            <>
              <span className="tab-title">{tab.title}</span>
              {repoTabs[tab.id] && hasCommitDraft(repoTabs[tab.id]) ? <i className="tab-dirty" aria-label="Unsaved commit draft"> â¢</i> : null}
            </>
          )}
          {repo && !editingId && <span className="tab-conn">{repo.name}</span>}
          <span
            className="tab-close"
            title={`Close ${tab.title} (âW)`}
            aria-label={`Close ${tab.title}`}
            onClick={(e) => {
              e.stopPropagation();
              void closeTab(tab.id);
            }}
          >
            <Icon name="x" size={13} />
          </span>
        </button>
        );
      })}
      <button
        type="button"
        className="tab-add"
        title="Add a repository (âN)"
        onClick={() => openTab("welcome")}
        onDragOver={(e) => {
          if (!dragId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const id = draggedTabId(e);
          if (id) reorderTab(id, null);
          setDragId(null);
          setOverId(null);
        }}
      >
        <Icon name="folder-git" /><span>Repo</span>
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ...(tabs.find((t) => t.id === menu.id)?.kind === "repo"
              ? [{
                  icon: "pencil" as const,
                  label: "Rename",
                  strong: true,
                  onClick: () => {
                    const tab = tabs.find((t) => t.id === menu.id);
                    setEditingId(menu.id);
                    setDraft(tab?.title ?? "");
                  },
                }]
              : []),
            { icon: "x" as const, label: "Close (âW)", onClick: () => void closeTab(menu.id) },
            {
              icon: "rows" as const,
              label: "Close others",
              onClick: async () => {
                for (const t of tabs.filter((t) => t.id !== menu.id)) await closeTab(t.id);
                activateTab(menu.id);
              },
            },
          ]}
        />
      )}
    </nav>
  );
}

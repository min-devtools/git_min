import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useApp } from "../store";
import { ContextMenu } from "../ui/ContextMenu";
import { Icon } from "../ui/Icon";
import { hasCommitDraft } from "../lib/gitUi";

export function TabsBar() {
  const { tabs, activeTabId, activateTab, closeTab, openTab, repoTabs, renameRepo, reorderTab } = useApp(
    useShallow((s) => ({
      tabs: s.tabs, activeTabId: s.activeTabId, activateTab: s.activateTab, closeTab: s.closeTab,
      openTab: s.openTab, repoTabs: s.repoTabs, renameRepo: s.renameRepo, reorderTab: s.reorderTab,
    })),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <nav className="tabs" role="tablist" aria-label="Open workspaces">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeTabId}
          draggable={!editingId}
          className={`tab ${tab.id === activeTabId ? "active" : ""} ${dragId === tab.id ? "dragging" : ""} ${overId === tab.id && dragId && dragId !== tab.id ? "drag-over" : ""}`}
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
          title={tab.kind === "repo" ? "Double-click to rename · right-click for menu" : undefined}
        >
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
              {repoTabs[tab.id] && hasCommitDraft(repoTabs[tab.id]) ? <i className="tab-dirty" aria-label="Unsaved commit draft"> •</i> : null}
            </>
          )}
          <span
            className="tab-close"
            title={`Close ${tab.title} (⌘W)`}
            aria-label={`Close ${tab.title}`}
            onClick={(e) => {
              e.stopPropagation();
              void closeTab(tab.id);
            }}
          >
            <Icon name="x" size={13} />
          </span>
        </button>
      ))}
      <button
        type="button"
        className="tab-add"
        title="Add a repository (⌘N)"
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
            { icon: "x" as const, label: "Close (⌘W)", onClick: () => void closeTab(menu.id) },
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

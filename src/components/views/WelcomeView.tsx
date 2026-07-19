import { useEffect, useMemo, useRef, useState } from "react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { useShallow } from "zustand/react/shallow";
import { ToolButton } from "../../ui/ToolButton";
import { Icon } from "../../ui/Icon";
import { ContextMenu } from "../../ui/ContextMenu";
import { useApp, type RepoSort } from "../../store";
import type { IconName } from "../../ui/Icon";
import { scanRepos } from "../../lib/git";
import { doFetch } from "../../lib/actions";
import { useRepoInfos } from "../../lib/queries";
import { sortRepos } from "../../lib/repoSort";
import type { ScanHit } from "../../lib/types";

const SORT_LABEL: Record<RepoSort, string> = {
  recent: "Recent",
  name: "Name",
  changes: "Changes",
};

const SORT_ICON: Record<RepoSort, IconName> = {
  recent: "timer",
  name: "list-ordered",
  changes: "activity",
};

export function WelcomeView({ active }: { active: boolean }) {
  const {
    repos, addRepos, openRepoTab, selectRepo, selectedRepoId, showToast,
    repoSort, setRepoSort, repoViewMode, setRepoViewMode, removeRepo, openDialog,
  } = useApp(
    useShallow((s) => ({
      repos: s.repos, addRepos: s.addRepos, openRepoTab: s.openRepoTab,
      selectRepo: s.selectRepo, selectedRepoId: s.selectedRepoId, showToast: s.showToast,
      repoSort: s.repoSort, setRepoSort: s.setRepoSort,
      repoViewMode: s.repoViewMode, setRepoViewMode: s.setRepoViewMode,
      removeRepo: s.removeRepo, openDialog: s.openDialog,
    })),
  );
  const infos = useRepoInfos(repos);
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const sorted = useMemo(
    () => sortRepos(
      repos.filter((r) => !q || r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q)),
      repoSort,
      (p) => {
        const d = infos.get(p);
        return d ? d.insertions + d.deletions : -1;
      },
    ),
    // infos is rebuilt every render; its payload is the real dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repos, q, repoSort, [...infos.values()].map((d) => d?.dirty).join()],
  );

  // the ⌘A handler is bound once; it reads the current visible order through a ref
  const sortedRef = useRef(sorted);
  sortedRef.current = sorted;

  // Finder-style selection: click selects, ⌘/Ctrl-click adds, shift-click extends
  // from the anchor, double-click opens the repository tab.
  const [selection, setSelection] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const selected = new Set(selection.filter((id) => repos.some((r) => r.id === id)));

  const onRowClick = (e: React.MouseEvent, id: string) => {
    if (e.metaKey || e.ctrlKey) {
      setSelection((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      setAnchor(id);
    } else if (e.shiftKey && anchor) {
      const from = sorted.findIndex((r) => r.id === anchor);
      const to = sorted.findIndex((r) => r.id === id);
      if (from < 0 || to < 0) return;
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      setSelection(sorted.slice(lo, hi + 1).map((r) => r.id));
    } else {
      setSelection([id]);
      setAnchor(id);
    }
    selectRepo(id);
  };

  const removeSelected = async () => {
    const targets = repos.filter((r) => selected.has(r.id));
    if (!targets.length) return;
    const ok = await openDialog({
      kind: "confirm",
      title: `Remove ${targets.length} repositor${targets.length === 1 ? "y" : "ies"}?`,
      message: `${targets.map((r) => r.name).join(", ")} — removed from the list only. Files on disk are not touched.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok === null) return;
    targets.forEach((r) => removeRepo(r.id));
    setSelection([]);
    setAnchor(null);
    showToast("Repositories", `Removed ${targets.length}.`, "ok");
  };

  // the key handler is bound once per tab activation — it reads live state through refs
  const removeRef = useRef(removeSelected);
  removeRef.current = removeSelected;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  // ⌘F is the repo finder here; the graph view binds the same key to its commit search
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (useApp.getState().dialog) return;
      if (e.key === "Escape") {
        setSelection([]);
        setAnchor(null);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        const t = e.target as HTMLElement;
        if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
        e.preventDefault();
        setSelection(sortedRef.current.map((r) => r.id));
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Backspace" && selectionRef.current.length > 0) {
        e.preventDefault();
        void removeRef.current();
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "f") return;
      e.preventDefault();
      document.querySelector<HTMLInputElement>(".welcome-filter")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);
  const [scan, setScan] = useState<{ base: string; hits: ScanHit[]; checked: Record<string, boolean> } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [sortMenu, setSortMenu] = useState<{ x: number; y: number } | null>(null);

  const knownPaths = new Set(repos.map((r) => r.path));

  const importHits = (hits: ScanHit[]) => {
    const fresh = hits.filter((h) => !knownPaths.has(h.path));
    const imported = fresh.map((h) => ({ id: crypto.randomUUID(), name: h.name, path: h.path }));
    addRepos(imported);
    if (imported.length > 0) {
      selectRepo(imported[0].id);
      openRepoTab(imported[0].id);
    } else if (hits.length === 1) {
      const existing = repos.find((repo) => repo.path === hits[0].path);
      if (existing) {
        selectRepo(existing.id);
        openRepoTab(existing.id);
      }
    }
    showToast("Repositories", imported.length ? `Imported ${imported.length} repo${imported.length === 1 ? "" : "s"}.` : "Repository already added.", imported.length ? "ok" : "warn");
    setScan(null);
  };

  const pickFolder = async () => {
    const dir = await openFolderDialog({ directory: true, multiple: false, title: "Open a repository or a folder of repositories" });
    if (typeof dir !== "string") return;
    setScanning(true);
    try {
      const hits = await scanRepos(dir);
      if (hits.length === 0) {
        showToast("No repositories", "No .git folders found under that path.", "warn");
      } else if (hits.length === 1 && hits[0].path === dir) {
        importHits(hits); // the folder itself is a repo — import directly
      } else {
        setScan({ base: dir, hits, checked: Object.fromEntries(hits.map((h) => [h.path, !knownPaths.has(h.path)])) });
      }
    } catch (err) {
      showToast("Scan failed", String(err), "err");
    } finally {
      setScanning(false);
    }
  };

  const checkedCount = scan ? scan.hits.filter((h) => scan.checked[h.path]).length : 0;

  return (
    <section className={`content welcome-view ${active ? "active" : ""}`}>
      <div className="welcome-shell">
        <div className="welcome-hero">
          <div className="welcome-copy">
            <div className="welcome-kicker">
              {repos.length ? `${repos.length} repositories` : "no repositories yet"}
            </div>
            <h1 className="welcome-title">GitMin</h1>
            <p className="welcome-text">
              A tiny git client built around the commit graph. Open a repository — or point it at a
              projects folder and import everything inside at once.
            </p>
            <div className="welcome-actions">
              <ToolButton variant="primary" onClick={() => void pickFolder()} disabled={scanning}>
                <Icon name="folder-open" /> {scanning ? "Scanning…" : "Open repository / scan folder…"}
              </ToolButton>
            </div>
          </div>
        </div>

        {scan && (
          <div className="scan-panel">
            <div className="group-title">
              <span>Found {scan.hits.length} repositories under {scan.base}</span>
              <span>
                <button
                  type="button"
                  className="group-action"
                  onClick={() =>
                    setScan({ ...scan, checked: Object.fromEntries(scan.hits.map((h) => [h.path, checkedCount !== scan.hits.length])) })
                  }
                >
                  {checkedCount === scan.hits.length ? "none" : "all"}
                </button>
              </span>
            </div>
            <div className="scan-list">
              {scan.hits.map((h) => (
                <label key={h.path} className={`scan-row ${knownPaths.has(h.path) ? "known" : ""}`}>
                  <input
                    type="checkbox"
                    checked={!!scan.checked[h.path]}
                    onChange={(e) => setScan({ ...scan, checked: { ...scan.checked, [h.path]: e.target.checked } })}
                  />
                  <strong>{h.name}</strong>
                  <span className="muted">{h.path}</span>
                  {knownPaths.has(h.path) && <span className="kbd">added</span>}
                </label>
              ))}
            </div>
            <div className="scan-actions">
              <ToolButton onClick={() => setScan(null)}>Cancel</ToolButton>
              <ToolButton
                variant="primary"
                disabled={!checkedCount}
                onClick={() => importHits(scan.hits.filter((h) => scan.checked[h.path]))}
              >
                Import {checkedCount} selected
              </ToolButton>
            </div>
          </div>
        )}

        {repos.length > 0 && (
          <>
            <div className="welcome-toolbar">
              <span className="group-title" style={{ margin: 0 }}><span>Repositories</span><span /></span>
              {selected.size > 0 && (
                <span className="welcome-bulk">
                  <span>{selected.size} selected</span>
                  <ToolButton onClick={() => { setSelection([]); setAnchor(null); }}>Clear</ToolButton>
                  <ToolButton
                    onClick={() => {
                      repos.filter((r) => selected.has(r.id)).forEach((r) => void doFetch(r.path));
                    }}
                  >
                    <Icon name="refresh" /> Fetch
                  </ToolButton>
                  <ToolButton variant="danger" onClick={() => void removeSelected()}>
                    <Icon name="trash" /> Remove
                  </ToolButton>
                </span>
              )}
              <span className="welcome-toolbar-actions">
                <input
                  className="side-search welcome-filter"
                  placeholder="Filter repositories (⌘F)"
                  value={filter}
                  spellCheck={false}
                  onChange={(e) => setFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setFilter("");
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
                <ToolButton
                  iconOnly
                  title={`Sort: ${SORT_LABEL[repoSort]}`}
                  onClick={(e) => setSortMenu({ x: e.clientX, y: e.clientY })}
                >
                  <Icon name={SORT_ICON[repoSort]} size={15} />
                </ToolButton>
                <ToolButton
                  iconOnly
                  title={repoViewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
                  onClick={() => setRepoViewMode(repoViewMode === "grid" ? "list" : "grid")}
                >
                  <Icon name={repoViewMode === "grid" ? "list" : "table"} size={15} />
                </ToolButton>
              </span>
            </div>
            {sortMenu && (
              <ContextMenu
                x={sortMenu.x}
                y={sortMenu.y}
                items={(Object.keys(SORT_LABEL) as RepoSort[]).map((s) => ({
                  icon: SORT_ICON[s],
                  label: SORT_LABEL[s],
                  strong: repoSort === s,
                  onClick: () => setRepoSort(s),
                }))}
                onClose={() => setSortMenu(null)}
              />
            )}
            {sorted.length === 0 && <div className="empty-note">No repository matches “{filter}”.</div>}
            {repoViewMode === "grid" ? (
              <div className="welcome-launch">
                {sorted.map((r) => {
                  const d = infos.get(r.path);
                  return (
                    <button
                      type="button"
                      className={`welcome-card ${selected.has(r.id) || (!selected.size && selectedRepoId === r.id) ? "active" : ""}`}
                      key={r.id}
                      onClick={(e) => onRowClick(e, r.id)}
                      onDoubleClick={() => openRepoTab(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") openRepoTab(r.id);
                      }}
                      title="Double-click to open · ⌘-click to add · shift-click for a range · ⌘E rename"
                    >
                      <span className="welcome-card-icon"><Icon name="git-branch" size={18} /></span>
                      <strong>{r.name}</strong>
                      <span className="welcome-card-desc" title={r.path}>{r.path}</span>
                      <span className="welcome-card-stats">
                        <span className="card-branch"><Icon name="git-branch" size={11} /> {d?.branch ?? "…"}</span>
                        {d && d.dirty > 0 ? (
                          <span className="diff-stat">
                            <em className="add">+{d.insertions}</em> <em className="del">−{d.deletions}</em>
                            <span className="muted"> · {d.dirty} file{d.dirty === 1 ? "" : "s"}</span>
                          </span>
                        ) : d ? (
                          <span className="muted">clean</span>
                        ) : null}
                        {d && (d.ahead > 0 || d.behind > 0) && (
                          <span className="card-track">
                            {d.ahead > 0 && <span className="track-badge ahead">↑{d.ahead}</span>}
                            {d.behind > 0 && <span className="track-badge behind">↓{d.behind}</span>}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="welcome-list">
                {sorted.map((r) => {
                  const d = infos.get(r.path);
                  return (
                    <button
                      type="button"
                      className={`welcome-list-row ${selected.has(r.id) || (!selected.size && selectedRepoId === r.id) ? "active" : ""}`}
                      key={r.id}
                      onClick={(e) => onRowClick(e, r.id)}
                      onDoubleClick={() => openRepoTab(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") openRepoTab(r.id);
                      }}
                      title="Double-click to open · ⌘-click to add · shift-click for a range · ⌘E rename"
                    >
                      <Icon name="git-branch" size={15} className="soft-blue" />
                      <span className="welcome-list-main">
                        <span className="welcome-list-name">{r.name}</span>
                        <span className="welcome-list-path">{r.path}</span>
                      </span>
                      <span className="welcome-list-branch">{d?.branch ?? "…"}</span>
                      <span className="welcome-list-stats">
                        {d && d.dirty > 0 ? (
                          <span className="diff-stat">
                            <em className="add">+{d.insertions}</em> <em className="del">−{d.deletions}</em>
                          </span>
                        ) : d ? (
                          <span className="muted">clean</span>
                        ) : null}
                        {d && (d.ahead > 0 || d.behind > 0) && (
                          <span className="card-track">
                            {d.ahead > 0 && <span className="track-badge ahead">↑{d.ahead}</span>}
                            {d.behind > 0 && <span className="track-badge behind">↓{d.behind}</span>}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

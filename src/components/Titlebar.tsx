import { useShallow } from "zustand/react/shallow";
import { ToolButton } from "../ui/ToolButton";
import { Badge } from "../ui/Badge";
import { Icon } from "../ui/Icon";
import { activeRepo, activeRepoTab, useApp } from "../store";
import { useRepoInfo } from "../lib/queries";
import { doCreateBranch, doFetch, doPull, doPush } from "../lib/actions";
import logo from "../assets/logo.png";
import { themeBase } from "../lib/themes";

/** Wraps a toolbar button with a count bubble — the "you have work waiting" cue. */
function Signal({
  count, tone, title, children,
}: { count: number; tone: "ahead" | "behind" | "dirty"; title: string; children: React.ReactNode }) {
  return (
    <span className={`tb-signal ${count > 0 ? `on ${tone}` : ""}`} title={title}>
      {children}
      {count > 0 && <span className="tb-count">{count > 99 ? "99+" : count}</span>}
    </span>
  );
}

export function Titlebar() {
  const repo = useApp((s) => activeRepo(s));
  const info = useRepoInfo(repo?.path);
  const { toggleTheme, toggleCompact, setCommandOpen, theme, openTab, operation } = useApp(
    useShallow((s) => ({
      toggleTheme: s.toggleTheme, toggleCompact: s.toggleCompact, setCommandOpen: s.setCommandOpen,
      theme: s.theme, openTab: s.openTab,
      operation: s.operations[activeRepo(s)?.path ?? ""],
    })),
  );

  const d = info.data;
  const inProgress = d?.merging ? "merging" : d?.rebasing ? "rebasing" : d?.cherryPicking ? "cherry-picking" : null;
  const tone = !repo ? "idle" : info.isError ? "red" : inProgress ? "yellow" : d ? "green" : "idle";
  const label = !repo
    ? "no repo"
    : info.isError
      ? "not a repo?"
      : d
        ? `${d.branch}${inProgress ? ` · ${inProgress}` : ""}`
        : "reading…";

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="traffic">
        <img src={logo} alt="" className="app-logo" />
        <strong>GitMin</strong>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <button type="button" className="search" title="Search GitMin (⌘K)" onClick={() => setCommandOpen(true)}>
        <Icon name="search" size={13} />
        <span>Search GitMin</span>
        <span style={{ marginLeft: "auto" }} />
        <kbd>⌘K</kbd>
      </button>
      <div className="toolbar">
        <ToolButton iconOnly disabled={!repo || !!operation} title="Fetch (f)" aria-label="Fetch" onClick={() => repo && void doFetch(repo.path)}>
          <Icon name="refresh" />
        </ToolButton>
        {/* counts double as the "something needs doing" signal */}
        <Signal count={d?.behind ?? 0} tone="behind" title={d?.behind ? `${d.behind} commit(s) to pull` : "Pull (p)"}>
          <ToolButton iconOnly disabled={!repo || !!operation} title="Pull (p)" aria-label="Pull" onClick={() => repo && void doPull(repo.path)}>
            <Icon name="download" />
          </ToolButton>
        </Signal>
        <Signal count={d?.ahead ?? 0} tone="ahead" title={d?.ahead ? `${d.ahead} commit(s) to push` : "Push (P)"}>
          <ToolButton iconOnly disabled={!repo || !!operation} title="Push (P)" aria-label="Push" onClick={() => repo && void doPush(repo.path)}>
            <Icon name="upload" />
          </ToolButton>
        </Signal>
        <Signal count={d?.dirty ?? 0} tone="dirty" title={d?.dirty ? `${d.dirty} uncommitted file(s)` : "Working tree clean"}>
          <ToolButton
            iconOnly
            disabled={!repo}
            title="Changes"
            aria-label="Show changes"
            onClick={() => {
              const active = activeRepoTab(useApp.getState());
              useApp.setState({ rightCollapsed: false });
              if (active) useApp.getState().patchRepoTab(active.tabId, { focusedPanel: "changes", inspectorTab: "changes" });
            }}
          >
            <Icon name="docs" />
          </ToolButton>
        </Signal>
        <ToolButton iconOnly disabled={!repo || !!operation} title="New branch (n)" aria-label="New branch" onClick={() => repo && void doCreateBranch(repo.path)}>
          <Icon name="git-branch" />
        </ToolButton>
        <ToolButton iconOnly title="Toggle theme" aria-label="Toggle theme" onClick={toggleTheme}>
          <Icon name={themeBase(theme) === "dark" ? "sun" : "moon"} />
        </ToolButton>
        <ToolButton iconOnly title="Toggle compact density" aria-label="Toggle compact density" onClick={toggleCompact}>
          <Icon name="rows" />
        </ToolButton>
        <ToolButton iconOnly title="Settings (⌘,)" aria-label="Open settings" onClick={() => openTab("settings")}>
          <Icon name="settings" />
        </ToolButton>
      </div>
    </header>
  );
}

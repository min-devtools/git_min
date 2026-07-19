import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { Titlebar } from "./components/Titlebar";
import { Sidebar } from "./components/Sidebar";
import { TabsBar } from "./components/TabsBar";
import { Inspector } from "./components/Inspector";
import { Statusbar } from "./components/Statusbar";
import { CommandPalette } from "./components/CommandPalette";
import { KeymapOverlay } from "./components/KeymapOverlay";
import { Toast } from "./components/Toast";
import { Dialog } from "./components/Dialog";
import { PanelResizeHandles } from "./components/ResizeHandles";
import { WelcomeView } from "./components/views/WelcomeView";
import { RepoView } from "./components/views/RepoView";
import { SettingsView } from "./components/views/SettingsView";
import { DiffView } from "./components/views/DiffView";
import { GitResourceView } from "./components/views/GitResourceView";
import { inspectorAvailable, useApp } from "./store";
import { themeBase } from "./lib/themes";
import { applyPalette, clearAppliedPalette, readBuiltinPalette } from "./lib/themeContract";
import { openRepository } from "./lib/actions";
import type { TabDef } from "./lib/types";
import { Icon } from "./ui/Icon";

function renderView(tab: TabDef, active: boolean) {
  switch (tab.kind) {
    case "welcome": return <WelcomeView key={tab.id} active={active} />;
    case "repo": return <RepoView key={tab.id} tabId={tab.id} active={active} />;
    case "settings": return <SettingsView key={tab.id} active={active} />;
    case "diff": return <DiffView key={tab.id} tabId={tab.id} repoTabId={tab.repoTabId!} active={active} />;
    case "git-resource": return <GitResourceView key={tab.id} repoTabId={tab.repoTabId!} resource={tab.resource!} active={active} />;
  }
}

export default function App() {
  const {
    tabs, activeTabId, theme, compact, leftCollapsed, rightCollapsed,
    toggleLeft, toggleRight, setCommandOpen,
  } = useApp(useShallow((s) => ({
    tabs: s.tabs, activeTabId: s.activeTabId, theme: s.theme, compact: s.compact,
    leftCollapsed: s.leftCollapsed, rightCollapsed: s.rightCollapsed,
    toggleLeft: s.toggleLeft, toggleRight: s.toggleRight,
    setCommandOpen: s.setCommandOpen,
  }))) as {
    tabs: TabDef[]; activeTabId: string; theme: string; compact: boolean;
    leftCollapsed: boolean; rightCollapsed: boolean;
    toggleLeft: () => void; toggleRight: () => void; setCommandOpen: (v: boolean) => void;
  };

  const inspectorOk = useApp((s) => inspectorAvailable(s));
  const uiFont = useApp((s) => s.uiFont);
  const editorFont = useApp((s) => s.editorFont);
  const uiFontSize = useApp((s) => s.uiFontSize);

  // custom fonts override the design token stacks
  useEffect(() => {
    const st = document.documentElement.style;
    st.setProperty("--font-body", uiFont ? `"${uiFont}", var(--font-body-default)` : "var(--font-body-default)");
    st.setProperty("--font-mono", editorFont ? `"${editorFont}", var(--font-mono-default)` : "var(--font-mono-default)");
  }, [uiFont, editorFont]);

  // app-wide UI scale — base.css html rule reads this as its font-size
  useEffect(() => {
    document.documentElement.style.setProperty("--ui-font-size", `${uiFontSize}px`);
  }, [uiFontSize]);

  // mirror UI state onto <body> so the ported design CSS keeps working
  useEffect(() => {
    const cls = document.body.classList;
    const base = themeBase(theme);
    document.body.dataset.theme = theme;
    cls.toggle("light", base === "light");
    clearAppliedPalette(document.body.style);
    requestAnimationFrame(() => {
      const cs = getComputedStyle(document.body);
      const palette = readBuiltinPalette(cs);
      applyPalette(document.body.style, palette);
    });
    cls.toggle("compact", compact);
    cls.toggle("left-collapsed", leftCollapsed);
    cls.toggle("right-collapsed", rightCollapsed);
    cls.toggle("inspector-unavailable", !inspectorOk);
  }, [theme, compact, leftCollapsed, rightCollapsed, inspectorOk]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const state = useApp.getState();
      if (e.key === "Escape") {
        if (state.commandOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          state.setCommandOpen(false);
          return;
        }
        if (state.keymapOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          state.setKeymapOpen(false);
          return;
        }
        if (state.contextMenuOpen || state.dialog) return;
      } else if (state.commandOpen || state.keymapOpen || state.contextMenuOpen || state.dialog) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
      // ⌘N — add repository (welcome tab hosts the add/scan flow)
      if (mod && key === "n") {
        e.preventDefault();
        useApp.getState().openTab("welcome");
      }
      // ⌘O — open a repository or folder via the native dialog
      if (mod && key === "o") {
        e.preventDefault();
        void openRepository();
      }
      if (mod && key === "b") {
        e.preventDefault();
        toggleLeft();
      }
      if (mod && key === "r") {
        e.preventDefault();
        toggleRight();
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        useApp.getState().openTab("settings");
      }
      if (mod && key === "w") {
        e.preventDefault();
        const s = useApp.getState();
        void s.closeTab(s.activeTabId);
      }
      // ⌘1…⌘9 — jump to the Nth tab
      if (mod && key >= "1" && key <= "9") {
        const s = useApp.getState();
        const tab = s.tabs[Number(key) - 1];
        if (tab) {
          e.preventDefault();
          s.activateTab(tab.id);
        }
      }
      // ⌘+/⌘- — app-wide UI font size, 0.5px per press
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        const s = useApp.getState();
        s.setUiFontSize(s.uiFontSize + 0.5);
      }
      if (mod && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        const s = useApp.getState();
        s.setUiFontSize(s.uiFontSize - 0.5);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setCommandOpen, toggleLeft, toggleRight]);

  return (
    <div className="app-frame">
      <Titlebar />
      <main className="main">
        <Sidebar />
        <section className="workspace">
          <TabsBar />
          {tabs.map((tab) => renderView(tab, tab.id === activeTabId))}
        </section>
        <Inspector />
        <PanelResizeHandles />
      </main>
      <Statusbar />
      <button
        type="button"
        className={`tool-btn panel-toggle panel-corner left ${leftCollapsed ? "" : "active"}`}
        title="Toggle left sidebar (⌘B)"
        aria-label="Toggle left sidebar"
        onClick={toggleLeft}
      >
        <Icon name="panel-left" />
      </button>
      <button
        type="button"
        className={`tool-btn panel-toggle panel-corner right ${rightCollapsed || !inspectorOk ? "" : "active"}`}
        title="Toggle right inspector (⌘R)"
        aria-label="Toggle right inspector"
        onClick={toggleRight}
      >
        <Icon name="panel-right" />
      </button>
      <CommandPalette />
      <KeymapOverlay />
      <Toast />
      <Dialog />
    </div>
  );
}

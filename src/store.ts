import { create } from "zustand";
import { isThemeId, themeBase } from "./lib/themes";
import { clampFontSize, DEFAULT_FONT_SIZE } from "./lib/fontScale";
import { isBrowserId, type BrowserId } from "./lib/browserPreference";
import type { ConnColor } from "./lib/connColor";
import type { GitResourceKind, Repo, TabDef, TabKind } from "./lib/types";
import {
  createRepoTabDefaults,
  hasCommitDraft,
  type DiffTarget,
  type InspectorMode,
  type StatusSelection,
} from "./lib/gitUi";

const TAB_META: Record<TabKind, { title: string; icon: TabDef["icon"]; iconClass: string }> = {
  welcome: { title: "Repositories", icon: "folder", iconClass: "soft-blue" },
  repo: { title: "Repo", icon: "folder-git", iconClass: "soft-green" },
  settings: { title: "Settings", icon: "settings", iconClass: "soft-orange" },
  diff: { title: "Diff", icon: "code", iconClass: "soft-orange" },
  "git-resource": { title: "Git", icon: "list", iconClass: "soft-blue" },
};

const RESOURCE_ICON: Record<GitResourceKind, TabDef["icon"]> = {
  changes: "status",
  branches: "git-branch",
  commits: "git-commit",
  tags: "tag",
  stashes: "layers",
};

const diffTabId = (repoTabId: string) => `diff-${repoTabId}`;
const resourceTabId = (repoTabId: string, resource: GitResourceKind) => `git-${resource}-${repoTabId}`;

const RESOURCE_TITLE: Record<GitResourceKind, string> = {
  changes: "Working Tree",
  branches: "Branches",
  commits: "Commits",
  tags: "Tags",
  stashes: "Stashes",
};

export type RepoPanel = "changes" | "branches" | "graph" | "files";

/** Right-dock mode: working tree, commit diff, or quick actions. */
export type InspectorTab = InspectorMode;

/** Repository list ordering, shared by the sidebar and the welcome grid. */
export type RepoSort = "recent" | "name" | "changes";
/** Repository list layout on the Welcome tab. */
export type RepoViewMode = "grid" | "list";
/** Working-tree file list layout: flat paths or grouped by folder. */
export type ChangesView = "flat" | "tree";
export type DiffLayout = "split" | "inline";

/** Per-repo-tab UI state (selection, focused panel, open diff). */
export interface RepoTabUI {
  repoId: string;
  selectedCommit: string | null;
  selectedBranch: string | null;
  /** exact Working Tree row highlighted by pointer/vim, including its index area */
  selectedStatus: StatusSelection | null;
  focusedPanel: RepoPanel;
  inspectorTab: InspectorTab;
  diff: DiffTarget | null;
  /** file shown in the inspector blame view */
  blame: string | null;
  commitDraft: string;
  amend: boolean;
  /** guards async AI responses against tab/repo switches and superseded requests */
  aiRequestId: string | null;
  /** null means all refs; otherwise graph is scoped to this branch/ref */
  graphScope: string | null;
}

function repoTabId(repoId: string): string {
  return `repo-${repoId}`;
}

/** Restore last session's open tabs from localStorage. */
function loadSession(): {
  tabs: TabDef[];
  activeTabId: string;
  repoTabs: Record<string, RepoTabUI>;
} | null {
  try {
    const raw = localStorage.getItem("gitmin:session");
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!Array.isArray(s.tabs) || s.tabs.length === 0) return null;
    const repoTabs: Record<string, RepoTabUI> = {};
    for (const [id, rt] of Object.entries<any>(s.repoTabs ?? {})) {
      if (typeof rt.repoId === "string") {
        repoTabs[id] = {
          ...createRepoTabDefaults(rt.repoId),
          commitDraft: typeof rt.commitDraft === "string" ? rt.commitDraft : "",
          amend: rt.amend === true,
        };
      }
    }
    const tabs: TabDef[] = s.tabs
      // contextual tabs are not restored: they belong to the current repo session
      .filter((t: TabDef) => TAB_META[t.kind] && t.kind !== "diff" && t.kind !== "git-resource" && (t.kind !== "repo" || repoTabs[t.id]))
      .map((t: TabDef) => ({
        ...t,
        icon: t.kind === "git-resource" && t.resource ? RESOURCE_ICON[t.resource] : TAB_META[t.kind].icon,
        iconClass: TAB_META[t.kind].iconClass,
      }));
    if (!tabs.length) return null;
    return {
      tabs,
      activeTabId: tabs.some((t) => t.id === s.activeTabId) ? s.activeTabId : tabs[0].id,
      repoTabs,
    };
  } catch {
    return null;
  }
}

const session = loadSession();

export interface ToastMsg {
  title: string;
  body: string;
  kind?: "ok" | "warn" | "err";
}

export interface DialogRequest {
  kind: "prompt" | "confirm";
  title: string;
  message?: string;
  defaultValue?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** prompt only: allow confirming an empty value (for example an unnamed stash) */
  allowEmpty?: boolean;
  /** prompt only: show a filterable pick-list under the input (inline, palette-style) */
  options?: { value: string; hint?: string }[];
  /** with options: also offer the typed free text as a synthetic row, labelled with this hint */
  freeText?: string;
}

export interface RepoOperation {
  label: string;
  kind: "background" | "foreground";
}

/** A commit sitting in the cherry-pick clipboard. `time` keeps paste order right:
 *  git needs oldest-first, the graph hands them over newest-first. */
export interface CherryPickItem {
  hash: string;
  subject: string;
  time: number;
}

interface AppState {
  repos: Repo[];
  /** repo highlighted in the welcome list — target of ⌘E/⌘⌫ */
  selectedRepoId: string | null;

  tabs: TabDef[];
  activeTabId: string;
  repoTabs: Record<string, RepoTabUI>;

  theme: string;
  compact: boolean;
  /** lazygit-style single-key bindings */
  vimKeys: boolean;
  uiFontSize: number;
  uiFont: string;
  editorFont: string;
  externalBrowser: BrowserId;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  commandOpen: boolean;
  keymapOpen: boolean;
  contextMenuOpen: boolean;
  repoSort: RepoSort;
  repoViewMode: RepoViewMode;
  changesView: ChangesView;
  /** soft-wrap long lines in the diff/blame reader */
  diffWrap: boolean;
  /** preferred wide-screen layout; narrow diff panes temporarily force inline */
  diffLayout: DiffLayout;
  /** OpenAI-compatible provider for AI commit messages (same shape as elastic_min) */
  aiProvider: { endpoint: string; apiKey: string; model: string };
  /** operation state is keyed by repository path so tabs cannot leak busy UI */
  operations: Record<string, RepoOperation | undefined>;
  /** lazygit "copied commits": cherry-pick clipboard per repository path */
  cherryPicks: Record<string, CherryPickItem[] | undefined>;
  toast: ToastMsg | null;
  dialog: (DialogRequest & { resolve: (value: string | null) => void }) | null;

  setRepos: (repos: Repo[]) => void;
  addRepos: (repos: Repo[]) => void;
  removeRepo: (id: string) => void;
  renameRepo: (id: string, name: string) => void;
  setRepoColor: (id: string, color: ConnColor | null) => void;
  selectRepo: (id: string | null) => void;

  openTab: (kind: TabKind) => void;
  openRepoTab: (repoId: string) => void;
  openGitResourceTab: (repoTabId: string, resource: GitResourceKind) => void;
  closeTab: (id: string) => Promise<void>;
  activateTab: (id: string) => void;
  reorderTab: (id: string, beforeId: string | null) => void;

  patchRepoTab: (tabId: string, patch: Partial<Omit<RepoTabUI, "repoId">>) => void;
  /** patchRepoTab minus focus: never activates the diff tab, only retargets or closes it */
  reconcileRepoTab: (tabId: string, patch: Partial<Pick<RepoTabUI, "selectedStatus" | "diff">>) => void;

  setTheme: (id: string) => void;
  toggleTheme: () => void;
  toggleCompact: () => void;
  toggleVimKeys: () => void;
  setUiFontSize: (size: number) => void;
  setUiFont: (font: string) => void;
  setEditorFont: (font: string) => void;
  setExternalBrowser: (browser: BrowserId) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setCommandOpen: (open: boolean) => void;
  setKeymapOpen: (open: boolean) => void;
  setContextMenuOpen: (open: boolean) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setRepoSort: (sort: RepoSort) => void;
  setRepoViewMode: (mode: RepoViewMode) => void;
  setChangesView: (view: ChangesView) => void;
  toggleDiffWrap: () => void;
  setDiffLayout: (layout: DiffLayout) => void;
  setAiProvider: (p: Partial<{ endpoint: string; apiKey: string; model: string }>) => void;
  setRepoOperation: (path: string, op: RepoOperation | null) => void;
  /** copy ⇄ uncopy a commit into the cherry-pick clipboard */
  toggleCherryPick: (path: string, item: CherryPickItem) => void;
  clearCherryPicks: (path: string) => void;
  markRepoAction: (path: string) => void;
  showToast: (title: string, body: string, kind?: ToastMsg["kind"]) => void;
  clearToast: () => void;
  /** in-app replacement for window.prompt/confirm — those are unimplemented in the Tauri webview */
  openDialog: (req: DialogRequest) => Promise<string | null>;
}

let toastTimer: number | undefined;

/** The repo tab backing the active tab — a diff tab resolves to the repo tab it was opened from. */
export const activeRepoTab = (s: Pick<AppState, "tabs" | "activeTabId" | "repoTabs">) => {
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  if (tab?.kind === "repo") return { tabId: tab.id, ui: s.repoTabs[tab.id] };
  if ((tab?.kind === "diff" || tab?.kind === "git-resource") && tab.repoTabId) return { tabId: tab.repoTabId, ui: s.repoTabs[tab.repoTabId] };
  return null;
};

export const activeRepo = (s: Pick<AppState, "tabs" | "activeTabId" | "repoTabs" | "repos">) => {
  const rt = activeRepoTab(s);
  return rt ? (s.repos.find((r) => r.id === rt.ui?.repoId) ?? null) : null;
};

export const inspectorAvailable = (s: Pick<AppState, "tabs" | "activeTabId" | "repoTabs">) =>
  activeRepoTab(s) !== null;

export const useApp = create<AppState>((set, get) => ({
  repos: [],
  selectedRepoId: null,

  tabs: session?.tabs ?? [{ id: "welcome", kind: "welcome", ...TAB_META.welcome }],
  activeTabId: session?.activeTabId ?? "welcome",
  repoTabs: session?.repoTabs ?? {},

  theme: (() => {
    const stored = localStorage.getItem("gitmin:theme-v2");
    return stored && isThemeId(stored) ? stored : "default-dark";
  })(),
  compact: localStorage.getItem("gitmin:compact") === "1",
  vimKeys: localStorage.getItem("gitmin:vim-keys") !== "0", // default on
  uiFontSize: clampFontSize(Number(localStorage.getItem("gitmin:ui-font-size")) || DEFAULT_FONT_SIZE),
  uiFont: localStorage.getItem("gitmin:ui-font") ?? "",
  editorFont: localStorage.getItem("gitmin:editor-font") ?? "",
  externalBrowser: (() => {
    const stored = localStorage.getItem("gitmin:external-browser");
    return isBrowserId(stored) ? stored : "system";
  })(),
  leftCollapsed: false,
  // the right dock hosts the working tree now — open by default
  rightCollapsed: false,
  commandOpen: false,
  keymapOpen: false,
  contextMenuOpen: false,
  repoSort: (localStorage.getItem("gitmin:repo-sort") as RepoSort) || "recent",
  repoViewMode: (localStorage.getItem("gitmin:repo-view") as RepoViewMode) || "grid",
  changesView: (localStorage.getItem("gitmin:changes-view") as ChangesView) || "tree",
  diffWrap: localStorage.getItem("gitmin:diff-wrap") === "1",
  diffLayout: localStorage.getItem("gitmin:diff-layout") === "inline" ? "inline" : "split",
  aiProvider: (() => {
    try {
      const raw = localStorage.getItem("gitmin:ai-provider");
      if (raw) return { endpoint: "", apiKey: "", model: "", ...JSON.parse(raw) };
    } catch { /* fall through to defaults */ }
    return { endpoint: "https://api.openai.com/v1", apiKey: "", model: "" };
  })(),
  operations: {},
  cherryPicks: {},
  toast: null,
  dialog: null,

  setRepos: (repos) => set({ repos }),
  addRepos: (incoming) =>
    set((s) => {
      const known = new Set(s.repos.map((r) => r.path));
      return { repos: [...s.repos, ...incoming.filter((r) => !known.has(r.path))] };
    }),
  removeRepo: (id) =>
    set((s) => {
      const tabId = repoTabId(id);
      const repoTabs = { ...s.repoTabs };
      delete repoTabs[tabId];
      const tabs = s.tabs.filter((t) => t.id !== tabId && t.repoTabId !== tabId);
      return {
        repos: s.repos.filter((r) => r.id !== id),
        selectedRepoId: s.selectedRepoId === id ? null : s.selectedRepoId,
        tabs,
        repoTabs,
        activeTabId: s.activeTabId === tabId || s.activeTabId === diffTabId(tabId)
          ? (tabs[0]?.id ?? "welcome")
          : s.activeTabId,
      };
    }),
  renameRepo: (id, name) =>
    set((s) => ({
      repos: s.repos.map((r) => (r.id === id ? { ...r, name: name.trim() || r.name } : r)),
      tabs: s.tabs.map((t) => (t.id === repoTabId(id) ? { ...t, title: name.trim() || t.title } : t)),
    })),
  setRepoColor: (id, color) =>
    set((s) => ({
      repos: s.repos.map((r) => (r.id === id ? { ...r, color: color ?? undefined } : r)),
    })),
  selectRepo: (id) => set({ selectedRepoId: id }),

  openTab: (kind) => {
    const s = get();
    const existing = s.tabs.find((t) => t.kind === kind);
    if (existing) return set({ activeTabId: existing.id });
    set({
      tabs: [...s.tabs, { id: kind, kind, ...TAB_META[kind] }],
      activeTabId: kind,
    });
  },

  openRepoTab: (repoId) => {
    const s = get();
    const repo = s.repos.find((r) => r.id === repoId);
    if (!repo) return;
    const id = repoTabId(repoId);
    if (s.tabs.some((t) => t.id === id)) return set({ activeTabId: id });
    set({
      tabs: [...s.tabs, { id, kind: "repo", ...TAB_META.repo, title: repo.name }],
      activeTabId: id,
      rightCollapsed: false,
      repoTabs: {
        ...s.repoTabs,
        [id]: createRepoTabDefaults(repoId),
      },
    });
  },

  openGitResourceTab: (ownerTabId, resource) => {
    const s = get();
    const owner = s.repoTabs[ownerTabId];
    if (!owner) return;
    const id = resourceTabId(ownerTabId, resource);
    if (s.tabs.some((tab) => tab.id === id)) return set({ activeTabId: id });
    set({
      tabs: [...s.tabs, {
        id,
        kind: "git-resource",
        ...TAB_META["git-resource"],
        icon: RESOURCE_ICON[resource],
        title: RESOURCE_TITLE[resource],
        repoTabId: ownerTabId,
        resource,
      }],
      activeTabId: id,
    });
  },

  closeTab: async (id) => {
    const current = get().repoTabs[id];
    if (current && hasCommitDraft(current)) {
      const ok = await get().openDialog({
        kind: "confirm",
        title: "Discard commit draft?",
        message: "This repository tab has an unsaved commit message.",
        confirmLabel: "Close tab",
        danger: true,
      });
      if (ok === null) return;
    }
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      if (idx < 0) return s;
      const closed = s.tabs[idx];
      // a repo tab takes its diff tab with it; a diff tab clears the selection that opened it
      const tabs = s.tabs.filter((t) => t.id !== id && t.repoTabId !== id);
      const repoTabs = { ...s.repoTabs };
      delete repoTabs[id];
      if (closed.kind === "diff" && closed.repoTabId && repoTabs[closed.repoTabId]) {
        repoTabs[closed.repoTabId] = { ...repoTabs[closed.repoTabId], diff: null, blame: null, inspectorTab: "changes" };
      }
      let activeTabId = s.activeTabId;
      if (activeTabId === id && closed.kind === "diff" && closed.repoTabId && repoTabs[closed.repoTabId]) {
        activeTabId = closed.repoTabId;
      } else if (activeTabId === id || activeTabId === diffTabId(id)) {
        const next = tabs[Math.min(idx, tabs.length - 1)];
        activeTabId = next?.id ?? "";
      }
      if (tabs.length === 0) {
        return {
          tabs: [{ id: "welcome", kind: "welcome", ...TAB_META.welcome }],
          activeTabId: "welcome",
          repoTabs,
        };
      }
      return { tabs, activeTabId, repoTabs };
    });
  },

  activateTab: (id) => set({ activeTabId: id }),

  reorderTab: (id, beforeId) =>
    set((s) => {
      if (id === beforeId) return s;
      const dragged = s.tabs.find((t) => t.id === id);
      if (!dragged) return s;
      const rest = s.tabs.filter((t) => t.id !== id);
      const idx = beforeId ? rest.findIndex((t) => t.id === beforeId) : -1;
      const tabs = idx < 0 ? [...rest, dragged] : [...rest.slice(0, idx), dragged, ...rest.slice(idx)];
      return { tabs };
    }),

  patchRepoTab: (tabId, patch) =>
    set((s) => {
      const ui = s.repoTabs[tabId];
      if (!ui) return s;
      const next = { ...ui, ...patch };
      // opening a commit or blame reveals the inspector on its Diff tab;
      // a plain worktree diff must NOT steal the tab — the Changes tab set it
      const opening =
        ("selectedCommit" in patch || "blame" in patch) &&
        (next.selectedCommit !== null || next.blame !== null);
      if (opening) next.inspectorTab = "diff";

      // a file diff / blame is too wide for the dock — it gets a center tab of its own
      const id = diffTabId(tabId);
      const file = next.blame ?? next.diff?.file ?? null;
      let tabs = s.tabs;
      let activeTabId = s.activeTabId;
      if (file) {
        const title = next.blame ? file.split("/").pop()! : (next.diff?.label ?? file.split("/").pop()!);
        tabs = s.tabs.some((t) => t.id === id)
          ? s.tabs.map((t) => (t.id === id ? { ...t, title } : t))
          : [...s.tabs, { id, kind: "diff" as const, ...TAB_META.diff, title, repoTabId: tabId }];
        activeTabId = id;
      } else if (s.tabs.some((t) => t.id === id)) {
        tabs = s.tabs.filter((t) => t.id !== id);
        if (activeTabId === id) activeTabId = tabId;
      }

      return {
        tabs,
        activeTabId,
        repoTabs: { ...s.repoTabs, [tabId]: next },
        rightCollapsed: opening ? false : s.rightCollapsed,
      };
    }),

  reconcileRepoTab: (tabId, patch) =>
    set((s) => {
      const ui = s.repoTabs[tabId];
      if (!ui) return s;
      const next = { ...ui, ...patch };
      const id = diffTabId(tabId);
      const file = next.blame ?? next.diff?.file ?? null;
      let tabs = s.tabs;
      let activeTabId = s.activeTabId;
      if (!file && s.tabs.some((t) => t.id === id)) {
        tabs = s.tabs.filter((t) => t.id !== id);
        if (activeTabId === id) activeTabId = tabId;
      }
      return { tabs, activeTabId, repoTabs: { ...s.repoTabs, [tabId]: next } };
    }),

  setTheme: (id) => {
    localStorage.setItem("gitmin:theme-v2", id);
    set({ theme: id });
  },
  toggleTheme: () =>
    set((s) => {
      const theme = themeBase(s.theme) === "dark" ? "light" : "dark";
      localStorage.setItem("gitmin:theme-v2", theme);
      return { theme };
    }),
  toggleCompact: () =>
    set((s) => {
      localStorage.setItem("gitmin:compact", s.compact ? "0" : "1");
      return { compact: !s.compact };
    }),
  toggleVimKeys: () =>
    set((s) => {
      localStorage.setItem("gitmin:vim-keys", s.vimKeys ? "0" : "1");
      return { vimKeys: !s.vimKeys };
    }),
  setUiFontSize: (size) => {
    const clamped = clampFontSize(size || DEFAULT_FONT_SIZE);
    localStorage.setItem("gitmin:ui-font-size", String(clamped));
    set({ uiFontSize: clamped });
  },
  setUiFont: (font) => {
    localStorage.setItem("gitmin:ui-font", font);
    set({ uiFont: font });
  },
  setEditorFont: (font) => {
    localStorage.setItem("gitmin:editor-font", font);
    set({ editorFont: font });
  },
  setExternalBrowser: (externalBrowser) => {
    localStorage.setItem("gitmin:external-browser", externalBrowser);
    set({ externalBrowser });
  },
  toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
  toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
  setCommandOpen: (open) => set({ commandOpen: open }),
  setKeymapOpen: (open) => set({ keymapOpen: open }),
  setContextMenuOpen: (open) => set({ contextMenuOpen: open }),
  setInspectorTab: (inspectorTab) =>
    set((s) => {
      const active = activeRepoTab(s);
      if (!active?.ui) return s;
      return {
        rightCollapsed: false,
        repoTabs: {
          ...s.repoTabs,
          [active.tabId]: { ...active.ui, inspectorTab },
        },
      };
    }),
  setRepoSort: (repoSort) => {
    localStorage.setItem("gitmin:repo-sort", repoSort);
    set({ repoSort });
  },
  setRepoViewMode: (repoViewMode) => {
    localStorage.setItem("gitmin:repo-view", repoViewMode);
    set({ repoViewMode });
  },
  setChangesView: (changesView) => {
    localStorage.setItem("gitmin:changes-view", changesView);
    set({ changesView });
  },
  toggleDiffWrap: () =>
    set((s) => {
      localStorage.setItem("gitmin:diff-wrap", s.diffWrap ? "0" : "1");
      return { diffWrap: !s.diffWrap };
    }),
  setDiffLayout: (diffLayout) => {
    localStorage.setItem("gitmin:diff-layout", diffLayout);
    set({ diffLayout });
  },
  setAiProvider: (p) =>
    set((s) => {
      const aiProvider = { ...s.aiProvider, ...p };
      localStorage.setItem("gitmin:ai-provider", JSON.stringify(aiProvider));
      return { aiProvider };
    }),
  toggleCherryPick: (path, item) =>
    set((s) => {
      const list = s.cherryPicks[path] ?? [];
      const next = list.some((c) => c.hash === item.hash)
        ? list.filter((c) => c.hash !== item.hash)
        : [...list, item];
      return { cherryPicks: { ...s.cherryPicks, [path]: next.length ? next : undefined } };
    }),
  clearCherryPicks: (path) =>
    set((s) => ({ cherryPicks: { ...s.cherryPicks, [path]: undefined } })),
  setRepoOperation: (path, op) =>
    set((s) => {
      const operations = { ...s.operations };
      if (op) operations[path] = op;
      else delete operations[path];
      return { operations };
    }),
  markRepoAction: (path) =>
    set((s) => ({
      repos: s.repos.map((repo) => (repo.path === path ? { ...repo, lastActionAt: Date.now() } : repo)),
    })),
  showToast: (title, body, kind) => {
    window.clearTimeout(toastTimer);
    set({ toast: { title, body, kind } });
    toastTimer = window.setTimeout(() => set({ toast: null }), 2600);
  },
  clearToast: () => {
    window.clearTimeout(toastTimer);
    set({ toast: null });
  },

  openDialog: (req) =>
    new Promise<string | null>((resolve) => {
      set({
        dialog: {
          ...req,
          resolve: (value) => {
            resolve(value);
            set({ dialog: null });
          },
        },
      });
    }),
}));

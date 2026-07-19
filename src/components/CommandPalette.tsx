import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { activeRepo, activeRepoTab, useApp } from "../store";
import { doCreateBranch, doFetch, doPull, doPush, doQuickCheckout, openRepository } from "../lib/actions";
import { fileIcon, Icon, type IconName } from "../ui/Icon";
import { useBranches, useLog, useStatus } from "../lib/queries";
import { shortHash } from "../lib/format";
import { fuzzyMatch, highlight } from "../lib/fuzzy";

type Group = "Recents" | "Commands" | "Repositories" | "Branches & tags" | "Commits" | "Working tree";

interface Command {
  icon: IconName;
  label: string;
  group: Group;
  detail?: string;
  kbd?: string;
  action: () => void;
}

function renderHL(text: string, indices: number[]): ReactNode {
  if (!indices.length) return text;
  return highlight(text, indices).map((p, i) =>
    p.mark ? <mark key={i}>{p.text}</mark> : <Fragment key={i}>{p.text}</Fragment>,
  );
}

// ponytail: recents persisted in localStorage, max 3 shown, max 8 stored.
const REC_KEY = "gitmin:cmd-recents";
const REC_SHOW = 3;
const REC_KEEP = 8;
type RecKey = { group: Group; label: string };
function readRecents(): RecKey[] {
  try { return JSON.parse(localStorage.getItem(REC_KEY) ?? "[]") as RecKey[]; } catch { return []; }
}
function pushRecent(key: RecKey): RecKey[] {
  const cur = readRecents().filter((r) => !(r.group === key.group && r.label === key.label));
  cur.unshift(key);
  const next = cur.slice(0, REC_KEEP);
  try { localStorage.setItem(REC_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export function CommandPalette() {
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState(0);
  const [recents, setRecents] = useState<RecKey[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const repo = useApp((s) => activeRepo(s));
  const repoTab = useApp(useShallow((s) => activeRepoTab(s)));
  const branches = useBranches(repo?.path);
  const status = useStatus(repo?.path);
  const log = useLog(repo?.path);
  const app = useApp(useShallow((s) => ({
    commandOpen: s.commandOpen, setCommandOpen: s.setCommandOpen,
    repos: s.repos, openRepoTab: s.openRepoTab, openTab: s.openTab, patchRepoTab: s.patchRepoTab,
    toggleLeft: s.toggleLeft, toggleRight: s.toggleRight, toggleTheme: s.toggleTheme,
    toggleCompact: s.toggleCompact, setKeymapOpen: s.setKeymapOpen,
  })));

  useEffect(() => {
    if (app.commandOpen) {
      setInput("");
      setCursor(0);
      setRecents(readRecents());
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [app.commandOpen]);

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { icon: "folder-open", group: "Commands", label: "Add repository / scan folder", kbd: "⌘N", action: () => app.openTab("welcome") },
      { icon: "folder-open", group: "Commands", label: "Open repository / folder", kbd: "⌘O", action: () => void openRepository() },
      ...(repo
        ? [
            { icon: "refresh" as const, group: "Commands" as const, label: "Fetch", kbd: "f", action: () => void doFetch(repo.path) },
            { icon: "download" as const, group: "Commands" as const, label: "Pull", kbd: "p", action: () => void doPull(repo.path) },
            { icon: "upload" as const, group: "Commands" as const, label: "Push", kbd: "P", action: () => void doPush(repo.path) },
            { icon: "git-branch" as const, group: "Commands" as const, label: "New branch", kbd: "n", action: () => void doCreateBranch(repo.path) },
            { icon: "check" as const, group: "Commands" as const, label: "Checkout branch…", kbd: "c", action: () => void doQuickCheckout(repo.path) },
          ]
        : []),
      { icon: "keyboard", group: "Commands", label: "Keyboard shortcuts", kbd: "?", action: () => app.setKeymapOpen(true) },
      { icon: "panel-left", group: "Commands", label: "Toggle left sidebar", kbd: "⌘B", action: () => app.toggleLeft() },
      { icon: "panel-right", group: "Commands", label: "Toggle right inspector", kbd: "⌘R", action: () => app.toggleRight() },
      { icon: "settings", group: "Commands", label: "Open Settings", kbd: "⌘,", action: () => app.openTab("settings") },
      { icon: "moon", group: "Commands", label: "Toggle theme", action: () => app.toggleTheme() },
      { icon: "rows", group: "Commands", label: "Toggle compact density", action: () => app.toggleCompact() },
    ];
    for (const r of app.repos) {
      base.push({
        icon: "git-branch",
        group: "Repositories",
        label: `Open repository: ${r.name}`,
        detail: r.path,
        action: () => app.openRepoTab(r.id),
      });
    }
    return base;
  }, [app, repo]);

  const filtered = useMemo<Array<Command & { labelIdx: number[]; detailIdx: number[] }>>(() => {
    const q = input.trim();
    const gitResults: Command[] = !q || !repo || !repoTab ? [] : [
      ...(branches.data ?? []).map((branch) => ({
        icon: branch.kind === "tag" ? "hash" as const : "git-branch" as const,
        group: "Branches & tags" as const,
        label: branch.name,
        detail: branch.kind === "remote" ? "remote branch" : branch.kind,
        action: () => {
          // refs live in the left dock — reveal that one, not the inspector
          useApp.setState({ leftCollapsed: false });
          app.patchRepoTab(repoTab.tabId, { selectedBranch: branch.name, graphScope: branch.name, selectedCommit: null, diff: null, blame: null, focusedPanel: "branches" });
        },
      })),
      ...(log.data?.pages.flat() ?? []).map((commit) => ({
        icon: "git-commit" as const,
        group: "Commits" as const,
        label: commit.subject,
        detail: `${shortHash(commit.hash)} · ${commit.author}`,
        action: () => app.patchRepoTab(repoTab.tabId, { selectedCommit: commit.hash, diff: null, inspectorTab: "diff", focusedPanel: "graph" }),
      })),
      ...(status.data ?? []).map((entry) => ({
        icon: fileIcon(entry.path),
        group: "Working tree" as const,
        label: entry.path,
        detail: entry.area,
        action: () => {
          useApp.setState({ rightCollapsed: false });
          app.patchRepoTab(repoTab.tabId, {
            focusedPanel: "changes",
            inspectorTab: "changes",
            selectedStatus: { path: entry.path, area: entry.area },
            diff: { mode: entry.area === "untracked" ? "untracked" : entry.area === "staged" ? "staged" : "worktree", file: entry.path },
          });
        },
      })),
    ];

    // recents: keys → live Command objects found across commands + gitResults
    type Match = { cmd: Command; score: number; labelIdx: number[]; detailIdx: number[] };
    const scoreCmd = (cmd: Command): Match | null => {
      if (!q) return { cmd, score: 0, labelIdx: [], detailIdx: [] };
      const lm = fuzzyMatch(q, cmd.label);
      const dm = cmd.detail ? fuzzyMatch(q, cmd.detail) : null;
      if (!lm && !dm) return null;
      return { cmd, score: Math.max(lm?.score ?? -9999, dm?.score ?? -9999), labelIdx: lm?.indices ?? [], detailIdx: dm?.indices ?? [] };
    };

    const pool = new Map<string, Command>();
    for (const c of commands) pool.set(`${c.group}|${c.label}`, c);
    for (const c of gitResults) pool.set(`${c.group}|${c.label}`, c);

    const recentCmds: Array<Command & { origGroup?: Group }> = [];
    for (const r of recents) {
      const cmd = pool.get(`${r.group}|${r.label}`);
      if (cmd) recentCmds.push({ ...cmd, origGroup: cmd.group, group: "Recents" });
      if (recentCmds.length >= REC_SHOW) break;
    }

    type Out = Command & { labelIdx: number[]; detailIdx: number[]; origGroup?: Group };
    const out: Out[] = [];

    // Recents bucket first (filtered by fuzzy if q present), excluded from later buckets
    const recentKeysDone = new Set<string>();
    for (const cmd of recentCmds) {
      const m = scoreCmd(cmd);
      if (!m) continue;
      recentKeysDone.add(`${cmd.origGroup ?? m.cmd.group}|${m.cmd.label}`);
      out.push({ ...m.cmd, origGroup: cmd.origGroup, labelIdx: m.labelIdx, detailIdx: m.detailIdx });
    }

    // Remaining buckets — preserve group order, sort each by score
    const candidates = q ? [...commands, ...gitResults] : commands;
    const buckets = new Map<Group, Match[]>();
    for (const cmd of candidates) {
      if (recentKeysDone.has(`${cmd.group}|${cmd.label}`)) continue;
      const m = scoreCmd(cmd);
      if (!m) continue;
      const arr = buckets.get(cmd.group) ?? [];
      arr.push(m);
      buckets.set(cmd.group, arr);
    }
    for (const arr of buckets.values()) arr.sort((a, b) => b.score - a.score);
    for (const arr of buckets.values()) {
      for (const m of arr) {
        out.push({ ...m.cmd, labelIdx: m.labelIdx, detailIdx: m.detailIdx });
        if (out.length >= 24) break;
      }
      if (out.length >= 24) break;
    }
    return out.slice(0, 24);
  }, [app, branches.data, commands, input, log.data?.pages, recents, repo, repoTab, status.data]);

  if (!app.commandOpen) return null;

  const runCommand = (cmd: Command & { origGroup?: Group }) => {
    app.setCommandOpen(false);
    pushRecent({ group: cmd.origGroup ?? cmd.group, label: cmd.label });
    cmd.action();
  };

  return (
    <div
      className="command"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) app.setCommandOpen(false);
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search GitMin">
        <input
          ref={inputRef}
          value={input}
          placeholder="Commands, repos, branches, commits, changed files…"
          onChange={(e) => {
            setInput(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(filtered.length - 1, c + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            }
            if (e.key === "Enter" && filtered[cursor]) runCommand(filtered[cursor]);
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              app.setCommandOpen(false);
            }
          }}
        />
        <div className="cmd-list" role="listbox">
          {filtered.map((cmd, i) => (
            <div key={`${cmd.group}:${cmd.label}:${cmd.detail ?? ""}`}>
              {(i === 0 || filtered[i - 1].group !== cmd.group) && <div className="cmd-group">{cmd.group}</div>}
              <button
              type="button"
              role="option"
              aria-selected={i === cursor}
              className={`cmd ${i === cursor ? "active" : ""}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => runCommand(cmd)}
            >
              <Icon name={cmd.icon} size={15} />
              <span className="cmd-copy">
                <strong>{renderHL(cmd.label, cmd.labelIdx)}</strong>
                {cmd.detail && <small>{renderHL(cmd.detail, cmd.detailIdx)}</small>}
              </span>
              {cmd.kbd ? <span className="kbd">{cmd.kbd}</span> : <span />}
              </button>
            </div>
          ))}
          {filtered.length === 0 && <div className="empty-note">No matching commands.</div>}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { activeRepo, activeRepoTab, useApp } from "../store";
import { doCreateBranch, doFetch, doPull, doPush, doQuickCheckout } from "../lib/actions";
import { fileIcon, Icon, type IconName } from "../ui/Icon";
import { useBranches, useLog, useStatus } from "../lib/queries";
import { shortHash } from "../lib/format";

interface Command {
  icon: IconName;
  label: string;
  group: "Commands" | "Repositories" | "Branches & tags" | "Commits" | "Working tree";
  detail?: string;
  kbd?: string;
  action: () => void;
}

export function CommandPalette() {
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState(0);
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
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [app.commandOpen]);

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { icon: "folder-open", group: "Commands", label: "Add repository / scan folder", kbd: "⌘N", action: () => app.openTab("welcome") },
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

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase();
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
    const candidates = q ? [...commands, ...gitResults] : commands;
    return candidates
      .filter((command) => !q || `${command.label} ${command.detail ?? ""}`.toLowerCase().includes(q))
      .slice(0, 24);
  }, [app, branches.data, commands, input, log.data?.pages, repo, repoTab, status.data]);

  if (!app.commandOpen) return null;

  const runCommand = (cmd: Command) => {
    app.setCommandOpen(false);
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
              <span className="cmd-copy"><strong>{cmd.label}</strong>{cmd.detail && <small>{cmd.detail}</small>}</span>
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

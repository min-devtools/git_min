import { queryClient } from "./queryClient";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { openExternalUrl } from "./externalLinks";
import * as git from "./git";
import { generateCommitMessage } from "./ai";
import { useApp } from "../store";
import { branchCheckoutTarget, checkoutableBranches, diffTargetFor, isBranchNotMergedError, queryGroupsForMutation, reconcileStatusSelection, splitRemoteBranch, type MutationScope } from "./gitUi";
import type { BranchInfo, ScanHit, StatusEntry } from "./types";

const app = () => useApp.getState();

export function refreshRepoScope(path: string, scope: MutationScope) {
  for (const group of queryGroupsForMutation(scope)) {
    void queryClient.invalidateQueries({ queryKey: [path, group] });
  }
}

async function repoOp<T>(
  path: string,
  label: string,
  kind: "background" | "foreground",
  scope: MutationScope,
  fn: () => Promise<T>,
): Promise<{ value: T } | null> {
  const current = app().operations[path];
  if (current) {
    app().showToast("Repository busy", `${current.label} is already in progress.`, "warn");
    return null;
  }
  app().setRepoOperation(path, { label, kind });
  try {
    const value = await fn();
    app().markRepoAction(path);
    return { value };
  } finally {
    app().setRepoOperation(path, null);
    refreshRepoScope(path, scope);
    // stage/unstage/commit/stash move files between areas — an open worktree diff
    // would keep reading the old area and show "No changes." (the stage-click bug)
    if (scope !== "remotes") void reconcileSelectionAfterOp(path);
  }
}

async function reconcileSelectionAfterOp(path: string) {
  const tab = repoTabForPath(path);
  if (!tab || (!tab.ui.diff && !tab.ui.selectedStatus)) return;
  try {
    const entries = await git.status(path);
    // re-read the tab: the user may have clicked elsewhere while status ran
    const current = repoTabForPath(path);
    if (!current) return;
    const patch = reconcileStatusSelection(current.ui, entries);
    if (patch) app().reconcileRepoTab(current.tabId, patch);
  } catch {
    // status failed — leave the selection alone, polling will catch up
  }
}

function repoTabForPath(path: string) {
  const state = app();
  const repo = state.repos.find((item) => item.path === path);
  if (!repo) return null;
  const found = Object.entries(state.repoTabs).find(([, ui]) => ui.repoId === repo.id);
  return found ? { tabId: found[0], ui: found[1] } : null;
}

function revealWorkingTree(path: string, entry?: StatusEntry) {
  const tab = repoTabForPath(path);
  if (!tab) return;
  useApp.setState({ rightCollapsed: false });
  app().patchRepoTab(tab.tabId, {
    focusedPanel: "changes",
    inspectorTab: "changes",
    selectedStatus: entry ? { path: entry.path, area: entry.area } : tab.ui.selectedStatus,
    diff: entry ? diffTargetFor(entry) : tab.ui.diff,
  });
}

async function revealFirstConflict(path: string) {
  try {
    const entries = await git.status(path);
    revealWorkingTree(path, entries.find((entry) => entry.area === "conflict"));
  } catch {
    revealWorkingTree(path);
  }
}

/** Wrap a network op: statusbar spinner, toast on both ends, repo refresh. */
async function netOp(path: string, label: string, fn: () => Promise<string>) {
  try {
    const result = await repoOp(path, label, "background", "history", fn);
    if (!result) return;
    app().showToast(label, "Done.", "ok");
  } catch (err) {
    app().showToast(`${label} failed`, String(err), "err");
  }
}

export const doFetch = (path: string) => netOp(path, "Fetch", () => git.fetch(path));
export const doPull = (path: string) => netOp(path, "Pull", () => git.pull(path));
export async function doPush(path: string) {
  try {
    const info = await git.repoInfo(path);
    if (info.detached) {
      app().showToast("Push unavailable", "Create or switch to a branch before pushing detached HEAD.", "warn");
      return;
    }
    if (info.upstream) {
      await netOp(path, "Push", () => git.push(path));
      return;
    }
    if (!info.remotes.length) {
      app().showToast("Push unavailable", "This repository has no configured remote.", "warn");
      return;
    }
    const preferred = info.remotes.includes("origin") ? "origin" : info.remotes[0];
    const remote = await app().openDialog({
      kind: "prompt",
      title: "Choose upstream remote",
      message: `Push ${info.branch} and set its upstream.`,
      defaultValue: preferred,
      confirmLabel: "Push & set upstream",
      options: info.remotes.map((name) => ({ value: name, hint: "remote" })),
    });
    if (remote === null) return;
    const target = remote.trim();
    if (!info.remotes.includes(target)) {
      app().showToast("Unknown remote", `Choose one of: ${info.remotes.join(", ")}.`, "warn");
      return;
    }
    await netOp(path, "Push", () => git.pushTo(path, target, info.branch, true));
  } catch (err) {
    app().showToast("Push failed", String(err), "err");
  }
}

export async function doCheckout(path: string, target: string) {
  try {
    const result = await repoOp(path, "Checkout", "foreground", "history", () => git.checkout(path, target));
    if (!result) return;
    app().showToast("Checkout", `Now on ${target}.`, "ok");
  } catch (err) {
    app().showToast("Checkout failed", String(err), "err");
  }
}

export async function doCheckoutBranch(path: string, branch: BranchInfo) {
  const target = branchCheckoutTarget(branch);
  if (target.kind === "local") {
    await doCheckout(path, target.ref);
    return;
  }
  if (target.kind === "detached") {
    const ok = await app().openDialog({
      kind: "confirm",
      title: "Checkout tag in detached HEAD?",
      message: `Checkout tag “${target.ref}”? Create a branch first if you plan to commit changes.`,
      confirmLabel: "Checkout tag",
    });
    if (ok === null) return;
    await doCheckout(path, target.ref);
    return;
  }
  try {
    const result = await repoOp(path, "Track remote branch", "foreground", "history", () =>
      git.checkoutTracking(path, target.ref, target.localName),
    );
    if (!result) return;
    app().showToast("Checkout", `Now tracking ${target.ref} as ${target.localName}.`, "ok");
  } catch (err) {
    app().showToast("Checkout failed", String(err), "err");
  }
}

/** Combobox checkout: every local + remote branch is a suggestion; an unknown
 *  name offers to create that branch off the current one (lazygit-style). */
export async function doQuickCheckout(path: string) {
  const refs = await git.branches(path).catch(() => []);
  const candidates = checkoutableBranches(refs).filter((branch) => !branch.head);
  const name = await app().openDialog({
    kind: "prompt",
    title: "Checkout branch",
    message: "Pick a local or remote branch, or type a new name to create it.",
    confirmLabel: "Checkout",
    options: candidates.map((branch) => ({ value: branch.name, hint: branch.kind })),
    freeText: "create new",
  });
  if (!name) return;
  const target = name.trim();
  const match = candidates.find((branch) => branch.name === target);
  if (match) {
    await doCheckoutBranch(path, match);
    return;
  }
  const current = refs.find((branch) => branch.head)?.name ?? "HEAD";
  const ok = await app().openDialog({
    kind: "confirm",
    title: "Branch not found",
    message: `“${target}” does not exist. Create it from “${current}” and switch to it?`,
    confirmLabel: "Create & switch",
  });
  if (ok === null) return;
  try {
    const result = await repoOp(path, "Create branch", "foreground", "history", () => git.branchCreate(path, target));
    if (!result) return;
    app().showToast("Branch", `Created and switched to ${target}.`, "ok");
  } catch (err) {
    app().showToast("Create branch failed", String(err), "err");
  }
}

export async function doDeleteRemoteBranch(path: string, name: string) {
  const split = splitRemoteBranch(name);
  if (!split) {
    app().showToast("Delete failed", `“${name}” is not a remote branch.`, "err");
    return;
  }
  const ok = await app().openDialog({
    kind: "confirm",
    title: "Delete remote branch",
    message: `Delete “${split.branch}” on remote “${split.remote}”? This removes it for everyone using that remote.`,
    confirmLabel: "Delete on remote",
    danger: true,
  });
  if (ok === null) return;
  try {
    const result = await repoOp(path, "Delete remote branch", "background", "history", () =>
      git.branchDeleteRemote(path, split.remote, split.branch),
    );
    if (!result) return;
    app().showToast("Remote branch deleted", name, "ok");
  } catch (err) {
    app().showToast("Delete remote branch failed", String(err), "err");
  }
}

export async function doCreateBranch(path: string, at?: string) {
  const name = await app().openDialog({
    kind: "prompt",
    title: "New branch",
    message: at ? `Create a branch at ${at.slice(0, 7)} and switch to it.` : "Create a branch at HEAD and switch to it.",
    confirmLabel: "Create",
  });
  if (!name) return;
  try {
    const result = await repoOp(path, "Create branch", "foreground", "history", () => git.branchCreate(path, name.trim(), at));
    if (!result) return;
    app().showToast("Branch", `Created and switched to ${name.trim()}.`, "ok");
  } catch (err) {
    app().showToast("Create branch failed", String(err), "err");
  }
}

export async function doDeleteBranch(path: string, name: string) {
  const ok = await app().openDialog({
    kind: "confirm",
    title: "Delete branch",
    message: `Delete local branch “${name}”? Unmerged commits are kept until git gc.`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (ok === null) return;
  try {
    const result = await repoOp(path, "Delete branch", "foreground", "history", () => git.branchDelete(path, name));
    if (!result) return;
  } catch (err) {
    if (!isBranchNotMergedError(err)) {
      app().showToast("Delete failed", String(err), "err");
      return;
    }
    const force = await app().openDialog({
      kind: "confirm",
      title: "Branch not merged",
      message: `${String(err)}\n\nForce delete (-D)?`,
      confirmLabel: "Force delete",
      danger: true,
    });
    if (force !== null) {
      try {
        const result = await repoOp(path, "Force delete branch", "foreground", "history", () => git.branchDelete(path, name, true));
        if (!result) return;
      } catch (err2) {
        app().showToast("Delete failed", String(err2), "err");
      }
    }
  }
}

export async function doMerge(path: string, target: string) {
  // name both sides in the prompt, lazygit-style — "into the current branch" is
  // the one thing the reader can't check while the dialog is up
  const current = await git.repoInfo(path).then((i) => i.branch).catch(() => null);
  if (current && target === current) {
    app().showToast("Merge", `“${target}” is already the current branch.`, "warn");
    return;
  }
  const ok = await app().openDialog({
    kind: "confirm",
    title: "Merging",
    message: `Merge “${target}” into ${current ? `“${current}”` : "the current branch"}?`,
    confirmLabel: "Merge",
  });
  if (ok === null) return;
  try {
    const result = await repoOp(path, "Merge", "foreground", "history", () => git.merge(path, target));
    if (!result) return;
    const out = result.value;
    if (out.conflicts) {
      app().showToast("Merge conflicts", "Resolve the conflicted files, then continue.", "warn");
      await revealFirstConflict(path);
    } else {
      app().showToast("Merge", out.message || "Merged.", "ok");
    }
  } catch (err) {
    app().showToast("Merge failed", String(err), "err");
  }
}

export async function doMergeAbort(path: string) {
  const ok = await app().openDialog({
    kind: "confirm",
    title: "Abort merge",
    message: "Abort the merge and restore the pre-merge state?",
    confirmLabel: "Abort merge",
    danger: true,
  });
  if (ok === null) return;
  try {
    const result = await repoOp(path, "Abort merge", "foreground", "history", () => git.mergeAbort(path));
    if (!result) return;
    app().showToast("Merge", "Aborted.", "ok");
  } catch (err) {
    app().showToast("Abort failed", String(err), "err");
  }
}

export async function doMergeContinue(path: string) {
  try {
    const result = await repoOp(path, "Continue merge", "foreground", "history", () => git.mergeContinue(path));
    if (!result) return;
    app().showToast("Merge", "Merge commit created.", "ok");
  } catch (err) {
    app().showToast("Continue failed", String(err), "err");
  }
}

export async function doCommit(path: string, message: string, amend = false) {
  if (!message.trim() && !amend) {
    app().showToast("Commit", "Message is empty.", "warn");
    return false;
  }
  try {
    if (amend) {
      const info = await git.repoInfo(path);
      if (info.upstream && info.ahead === 0) {
        const ok = await app().openDialog({
          kind: "confirm",
          title: "Amend a possibly published commit?",
          message: "HEAD is not ahead of its remote. Amending rewrites the commit and may require a force push.",
          confirmLabel: "Amend commit",
          danger: true,
        });
        if (ok === null) return false;
      }
    }
    const result = await repoOp(path, amend ? "Amend commit" : "Commit", "foreground", "history", () => git.commit(path, message, amend));
    if (!result) return false;
    app().showToast("Commit", "Created.", "ok");
    return true;
  } catch (err) {
    app().showToast("Commit failed", String(err), "err");
    return false;
  }
}

/** AI commit message → commit box. Whatever is already typed acts as the prefix
 *  (lazygit custom-command style: "feat(auth):" in, full subject out). */
export async function doGenerateCommitMessage(path: string, tabId: string) {
  const s = app();
  const ui = s.repoTabs[tabId];
  if (!ui) return;
  if (!s.aiProvider.model) {
    s.showToast("AI commit", "Configure a provider and model in Settings first.", "warn");
    s.openTab("settings");
    return;
  }
  if (localStorage.getItem("gitmin:ai-diff-disclosure") !== "1") {
    const approved = await s.openDialog({
      kind: "confirm",
      title: "Send staged diff to AI provider?",
      message: "GitMin will send a condensed staged diff (changed lines only, capped at ~6,000 characters) to your configured provider. Review staged files for secrets first.",
      confirmLabel: "Generate message",
    });
    if (approved === null) return;
    localStorage.setItem("gitmin:ai-diff-disclosure", "1");
  }
  const requestId = crypto.randomUUID();
  s.patchRepoTab(tabId, { aiRequestId: requestId });
  try {
    const message = await generateCommitMessage(path, ui.commitDraft);
    const current = app().repoTabs[tabId];
    if (current?.repoId === ui.repoId && current.aiRequestId === requestId) app().patchRepoTab(tabId, { commitDraft: message });
  } catch (err) {
    app().showToast("AI commit failed", String(err), "err");
  } finally {
    const current = app().repoTabs[tabId];
    if (current?.aiRequestId === requestId) app().patchRepoTab(tabId, { aiRequestId: null });
  }
}

export async function doStage(path: string, files: string[]) {
  try {
    const result = await repoOp(path, "Stage", "foreground", "working-tree", () => git.stage(path, files));
    if (!result) return;
  } catch (err) {
    app().showToast("Stage failed", String(err), "err");
  }
}

export async function doUnstage(path: string, files: string[]) {
  try {
    const result = await repoOp(path, "Unstage", "foreground", "working-tree", () => git.unstage(path, files));
    if (!result) return;
  } catch (err) {
    app().showToast("Unstage failed", String(err), "err");
  }
}

export async function doDiscard(path: string, files: string[], untracked: boolean) {
  const ok = await app().openDialog({
    kind: "confirm",
    title: "Discard changes",
    message:
      files.length === 1
        ? `Discard changes in “${files[0]}”? This cannot be undone.`
        : `Discard changes in ${files.length} files? This cannot be undone.`,
    confirmLabel: "Discard",
    danger: true,
  });
  if (ok === null) return;
  try {
    const result = await repoOp(path, "Discard", "foreground", "working-tree", () => git.discard(path, files, untracked));
    if (!result) return;
  } catch (err) {
    app().showToast("Discard failed", String(err), "err");
  }
}

/** lazygit `D`: nuke every working-tree change — restore tracked files, clean untracked. */
export async function doDiscardAll(path: string, entries: StatusEntry[]) {
  const tracked = entries.filter((e) => e.area === "unstaged").map((e) => e.path);
  const untracked = entries.filter((e) => e.area === "untracked").map((e) => e.path);
  if (!tracked.length && !untracked.length) return;
  const ok = await app().openDialog({
    kind: "confirm",
    title: "Discard all changes",
    message: `Discard every change in the working tree (${tracked.length + untracked.length} files, including untracked)? This cannot be undone.`,
    confirmLabel: "Discard all",
    danger: true,
  });
  if (ok === null) return;
  try {
    const result = await repoOp(path, "Discard all", "foreground", "working-tree", async () => {
      if (tracked.length) await git.discard(path, tracked, false);
      if (untracked.length) await git.discard(path, untracked, true);
    });
    if (!result) return;
  } catch (err) {
    app().showToast("Discard failed", String(err), "err");
  }
}

export async function doResolve(path: string, file: string, side: "ours" | "theirs") {
  try {
    const result = await repoOp(path, "Resolve conflict", "foreground", "working-tree", () => git.resolveFile(path, file, side));
    if (!result) return;
    app().showToast("Resolved", `${file} → ${side}.`, "ok");
  } catch (err) {
    app().showToast("Resolve failed", String(err), "err");
  }
}

export async function doMarkResolved(path: string, file: string) {
  try {
    const result = await repoOp(path, "Mark resolved", "foreground", "working-tree", () => git.markResolved(path, file));
    if (!result) return;
  } catch (err) {
    app().showToast("Mark resolved failed", String(err), "err");
  }
}

export async function doStashPush(path: string) {
  const message = await app().openDialog({
    kind: "prompt",
    title: "Stash changes",
    message: "Stashes tracked and untracked changes (-u). Optional message:",
    confirmLabel: "Stash",
    allowEmpty: true,
  });
  if (message === null) return;
  try {
    const result = await repoOp(path, "Stash", "foreground", "stashes", () => git.stashPush(path, message.trim() || undefined));
    if (!result) return;
    app().showToast("Stash", "Working tree stashed.", "ok");
  } catch (err) {
    app().showToast("Stash failed", String(err), "err");
  }
}

export async function doStashOp(path: string, id: string, op: "apply" | "pop" | "drop") {
  if (op === "drop") {
    const ok = await app().openDialog({
      kind: "confirm",
      title: "Drop stash",
      message: `Drop ${id}? This cannot be undone.`,
      confirmLabel: "Drop",
      danger: true,
    });
    if (ok === null) return;
  }
  try {
    const result = await repoOp(path, `Stash ${op}`, "foreground", "stashes", () => git.stashOp(path, id, op));
    if (!result) return;
    // pop/drop renumber stash@{n} — an open stash diff would show the wrong stash
    if (op !== "apply") {
      const tab = repoTabForPath(path);
      if (tab?.ui.diff?.mode === "stash") app().reconcileRepoTab(tab.tabId, { diff: null });
    }
    app().showToast("Stash", `${op} ${id} done.`, "ok");
  } catch (err) {
    app().showToast(`Stash ${op} failed`, String(err), "err");
    if (op !== "drop") await revealFirstConflict(path);
  }
}

export async function doRebase(path: string, onto: string) {
  const ok = await app().openDialog({
    kind: "confirm",
    title: "Rebase",
    message: `Rebase the current branch onto “${onto}”? History of the current branch is rewritten.`,
    confirmLabel: "Rebase",
    danger: true,
  });
  if (ok === null) return;
  try {
    const result = await repoOp(path, "Rebase", "foreground", "history", () => git.rebase(path, onto));
    if (!result) return;
    const out = result.value;
    if (out.conflicts) {
      app().showToast("Rebase conflicts", "Resolve the conflicted files, then continue.", "warn");
      await revealFirstConflict(path);
    } else {
      app().showToast("Rebase", out.message || "Rebased.", "ok");
    }
  } catch (err) {
    app().showToast("Rebase failed", String(err), "err");
  }
}

export async function doRebaseOp(path: string, op: "continue" | "abort" | "skip") {
  if (op === "abort") {
    const ok = await app().openDialog({
      kind: "confirm",
      title: "Abort rebase",
      message: "Abort the rebase and restore the pre-rebase state?",
      confirmLabel: "Abort rebase",
      danger: true,
    });
    if (ok === null) return;
  }
  try {
    const result = await repoOp(path, `Rebase ${op}`, "foreground", "history", () => git.rebaseOp(path, op));
    if (!result) return;
    app().showToast("Rebase", `${op} done.`, "ok");
  } catch (err) {
    app().showToast(`Rebase ${op} failed`, String(err), "err");
  }
}

export async function doCherryPick(path: string, hash: string) {
  const ok = await app().openDialog({
    kind: "confirm",
    title: "Cherry-pick",
    message: `Apply commit ${hash.slice(0, 7)} onto the current branch?`,
    confirmLabel: "Cherry-pick",
  });
  if (ok === null) return;
  await applyCherryPicks(path, [hash]);
}

/** lazygit `v`: replay every commit in the cherry-pick clipboard onto the branch
 *  that is checked out now. Oldest first, otherwise git replays them backwards. */
export async function doPasteCherryPicks(path: string) {
  const picked = app().cherryPicks[path] ?? [];
  if (!picked.length) {
    app().showToast("Nothing copied", "Select a commit and press C to copy it first.", "warn");
    return;
  }
  const branch = await git.repoInfo(path).then((i) => i.branch).catch(() => "the current branch");
  const ok = await app().openDialog({
    kind: "confirm",
    title: `Paste ${picked.length} commit${picked.length === 1 ? "" : "s"}`,
    message: `Cherry-pick ${picked.length} copied commit${picked.length === 1 ? "" : "s"} onto “${branch}”?`,
    confirmLabel: "Paste commits",
  });
  if (ok === null) return;
  const ordered = [...picked].sort((a, b) => a.time - b.time).map((c) => c.hash);
  if (await applyCherryPicks(path, ordered)) app().clearCherryPicks(path);
}

/** Shared tail of both: run the pick, surface conflicts. Returns true when clean. */
async function applyCherryPicks(path: string, hashes: string[]): Promise<boolean> {
  try {
    const result = await repoOp(path, "Cherry-pick", "foreground", "history", () => git.cherryPick(path, hashes));
    if (!result) return false;
    const out = result.value;
    if (out.conflicts) {
      app().showToast("Cherry-pick conflicts", "Resolve the conflicted files, then continue.", "warn");
      await revealFirstConflict(path);
      return false;
    }
    app().showToast("Cherry-pick", out.message || `Applied ${hashes.length} commit${hashes.length === 1 ? "" : "s"}.`, "ok");
    return true;
  } catch (err) {
    app().showToast("Cherry-pick failed", String(err), "err");
    return false;
  }
}

export async function doCherryPickOp(path: string, op: "continue" | "abort" | "skip") {
  if (op === "abort") {
    const ok = await app().openDialog({
      kind: "confirm",
      title: "Abort cherry-pick",
      message: "Abort the cherry-pick and restore the previous state?",
      confirmLabel: "Abort",
      danger: true,
    });
    if (ok === null) return;
  }
  try {
    const result = await repoOp(path, `Cherry-pick ${op}`, "foreground", "history", () => git.cherryPickOp(path, op));
    if (!result) return;
    app().showToast("Cherry-pick", `${op} done.`, "ok");
  } catch (err) {
    app().showToast(`Cherry-pick ${op} failed`, String(err), "err");
  }
}

export async function doApplyHunk(path: string, patch: string, reverse: boolean) {
  try {
    const result = await repoOp(path, reverse ? "Unstage hunk" : "Stage hunk", "foreground", "working-tree", () => git.applyPatch(path, patch, reverse));
    if (!result) return;
  } catch (err) {
    app().showToast(reverse ? "Unstage hunk failed" : "Stage hunk failed", String(err), "err");
  }
}

export async function doAddRemote(path: string) {
  const name = await app().openDialog({
    kind: "prompt",
    title: "Add remote",
    message: "Remote name (e.g. origin):",
    confirmLabel: "Next",
  });
  if (!name) return;
  const url = await app().openDialog({
    kind: "prompt",
    title: "Add remote",
    message: `URL for "${name}":`,
    confirmLabel: "Add",
  });
  if (!url) return;
  try {
    const result = await repoOp(path, "Add remote", "foreground", "remotes", () => git.addRemote(path, name.trim(), url.trim()));
    if (!result) return;
    app().showToast("Remote added", `${name.trim()} → ${url.trim()}`, "ok");
  } catch (err) {
    app().showToast("Add remote failed", String(err), "err");
  }
}

export async function doRemoveRemote(path: string, name: string) {
  const ok = await app().openDialog({
    kind: "confirm",
    title: "Remove remote",
    message: `Remove remote "${name}"? This only removes the local reference, not the remote server.`,
    confirmLabel: "Remove",
    danger: true,
  });
  if (ok === null) return;
  try {
    const result = await repoOp(path, "Remove remote", "foreground", "remotes", () => git.removeRemote(path, name));
    if (!result) return;
    app().showToast("Remote removed", name, "ok");
  } catch (err) {
    app().showToast("Remove remote failed", String(err), "err");
  }
}

export async function doSetRemoteUrl(path: string, name: string) {
  const current = await git.listRemotes(path).then((remotes) => remotes.find((r) => r.name === name)?.url ?? "");
  const url = await app().openDialog({
    kind: "prompt",
    title: "Edit remote URL",
    message: `New URL for "${name}":`,
    defaultValue: current,
    confirmLabel: "Save",
  });
  if (!url) return;
  try {
    const result = await repoOp(path, "Update remote URL", "foreground", "remotes", () => git.setRemoteUrl(path, name, url.trim()));
    if (!result) return;
    app().showToast("Remote updated", `${name} → ${url.trim()}`, "ok");
  } catch (err) {
    app().showToast("Update remote failed", String(err), "err");
  }
}

export async function openOnRemote(path: string, kind: "pr" | "commit" | "branch", target: string) {
  try {
    const url = await git.remoteWebUrl(path, kind, target);
    await openExternalUrl(url);
  } catch (err) {
    app().showToast("Open remote failed", String(err), "err");
  }
}

export async function openRepository() {
  const dir = await openFolderDialog({ directory: true, multiple: false, title: "Open a repository or a folder of repositories" });
  if (typeof dir !== "string") return;
  const s = app();
  try {
    const hits: ScanHit[] = await git.scanRepos(dir);
    if (hits.length === 0) {
      s.showToast("No repositories", "No .git folders found under that path.", "warn");
      return;
    }
    const known = new Set(s.repos.map((r) => r.path));
    const fresh = hits.filter((h) => !known.has(h.path));
    const imported = fresh.map((h) => ({ id: crypto.randomUUID(), name: h.name, path: h.path }));
    s.addRepos(imported);
    if (imported.length > 0) {
      s.selectRepo(imported[0].id);
      s.openRepoTab(imported[0].id);
      s.showToast("Repositories", `Imported ${imported.length} repo${imported.length === 1 ? "" : "s"}.`, "ok");
    } else if (hits.length === 1) {
      const existing = s.repos.find((repo) => repo.path === hits[0].path);
      if (existing) {
        s.selectRepo(existing.id);
        s.openRepoTab(existing.id);
      }
    } else {
      s.showToast("Repositories", "All found repositories are already added.", "warn");
    }
  } catch (err) {
    s.showToast("Scan failed", String(err), "err");
  }
}

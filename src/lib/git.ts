import { invoke } from "@tauri-apps/api/core";
import type {
  BlameLine, BranchInfo, CommitDetail, CommitInfo, FileStat, ForkPoint, MergeOutcome,
  RemoteInfo, RepoInfo, ScanHit, StashInfo, StatusEntry,
} from "./types";

export const scanRepos = (path: string, maxDepth?: number) =>
  invoke<ScanHit[]>("scan_repos", { path, maxDepth });

export const repoInfo = (path: string) => invoke<RepoInfo>("repo_info", { path });

export const logGraph = (path: string, limit?: number, skip?: number, scope?: string) =>
  invoke<CommitInfo[]>("log_graph", { path, limit, skip, scope });

export const branches = (path: string) => invoke<BranchInfo[]>("branches", { path });

export const defaultBranch = (path: string) => invoke<string>("default_branch", { path });

export const mergeBase = (path: string, a: string, b: string) =>
  invoke<ForkPoint>("merge_base", { path, a, b });

export const commitDetail = (path: string, hash: string) =>
  invoke<CommitDetail>("commit_detail", { path, hash });

export const diffFile = (
  path: string,
  mode: "commit" | "staged" | "worktree" | "untracked" | "stash",
  file: string,
  hash?: string,
) => invoke<string>("diff_file", { path, mode, hash, file });

/** Whole staged diff — input for the AI commit-message generator. */
export const stagedDiff = (path: string) => invoke<string>("staged_diff", { path });

export const status = (path: string) => invoke<StatusEntry[]>("status", { path });
export const worktreeDiffStats = (path: string) => invoke<FileStat[]>("worktree_diff_stats", { path });

export const stage = (path: string, files: string[]) => invoke<void>("stage", { path, files });
export const unstage = (path: string, files: string[]) => invoke<void>("unstage", { path, files });
export const discard = (path: string, files: string[], untracked: boolean) =>
  invoke<void>("discard", { path, files, untracked });

export const commit = (path: string, message: string, amend = false) =>
  invoke<string>("commit", { path, message, amend });

export const checkout = (path: string, target: string) =>
  invoke<string>("checkout", { path, target });
export const checkoutTracking = (path: string, remoteRef: string, localName: string) =>
  invoke<string>("checkout_tracking", { path, remoteRef, localName });

export const branchCreate = (path: string, name: string, at?: string, switchTo = true) =>
  invoke<string>("branch_create", { path, name, at, switch: switchTo });

export const branchDelete = (path: string, name: string, force = false) =>
  invoke<string>("branch_delete", { path, name, force });

export const branchDeleteRemote = (path: string, remote: string, name: string) =>
  invoke<string>("branch_delete_remote", { path, remote, name });

export const fetch = (path: string) => invoke<string>("fetch", { path });
export const pull = (path: string) => invoke<string>("pull", { path });
export const push = (path: string) => invoke<string>("push", { path });
export const pushTo = (path: string, remote: string, branch: string, setUpstream: boolean) =>
  invoke<string>("push_to", { path, remote, branch, setUpstream });

export const merge = (path: string, target: string) =>
  invoke<MergeOutcome>("merge", { path, target });
export const mergeAbort = (path: string) => invoke<string>("merge_abort", { path });
export const mergeContinue = (path: string) => invoke<string>("merge_continue", { path });

export const cherryPick = (path: string, hashes: string[]) =>
  invoke<MergeOutcome>("cherry_pick", { path, hashes });
export const cherryPickOp = (path: string, op: "continue" | "abort" | "skip") =>
  invoke<string>("cherry_pick_op", { path, op });

export const resolveFile = (path: string, file: string, side: "ours" | "theirs") =>
  invoke<void>("resolve_file", { path, file, side });
export const markResolved = (path: string, file: string) =>
  invoke<void>("mark_resolved", { path, file });

export const stashList = (path: string) => invoke<StashInfo[]>("stash_list", { path });
export const stashPush = (path: string, message?: string) =>
  invoke<string>("stash_push", { path, message });
export const stashOp = (path: string, id: string, op: "apply" | "pop" | "drop") =>
  invoke<string>("stash_op", { path, id, op });

export const blame = (path: string, file: string) => invoke<BlameLine[]>("blame", { path, file });

export const rebase = (path: string, onto: string) =>
  invoke<MergeOutcome>("rebase", { path, onto });
export const rebaseOp = (path: string, op: "continue" | "abort" | "skip") =>
  invoke<string>("rebase_op", { path, op });

/** Stage (reverse=false) or unstage (reverse=true) a patch against the index. */
export const applyPatch = (path: string, patch: string, reverse: boolean) =>
  invoke<void>("apply_patch", { path, patch, reverse });

export const remoteWebUrl = (path: string, kind: "pr" | "commit" | "branch", target: string) =>
  invoke<string>("remote_web_url", { path, kind, target });

export const listRemotes = (path: string) => invoke<RemoteInfo[]>("list_remotes", { path });
export const addRemote = (path: string, name: string, url: string) =>
  invoke<void>("add_remote", { path, name, url });
export const removeRemote = (path: string, name: string) =>
  invoke<void>("remove_remote", { path, name });
export const setRemoteUrl = (path: string, name: string, url: string) =>
  invoke<void>("set_remote_url", { path, name, url });

export const listFonts = () => invoke<string[]>("list_fonts");

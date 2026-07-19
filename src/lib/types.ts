import type { IconName } from "../ui/Icon";

/** A registered repository (the app's "connection" equivalent). */
export interface Repo {
  id: string;
  name: string;
  path: string;
  /** unix ms of the most recently completed Git action — drives the "recent" sort */
  lastActionAt?: number;
}

export interface CommitInfo {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  /** unix seconds */
  time: number;
  /** decorations: "HEAD -> main", "origin/main", "tag: v1" */
  refs: string[];
  subject: string;
}

export interface BranchInfo {
  name: string;
  kind: "local" | "remote" | "tag";
  hash: string;
  head: boolean;
  upstream: string;
  ahead: number;
  behind: number;
  time: number;
  subject: string;
}

export interface RepoInfo {
  name: string;
  branch: string;
  detached: boolean;
  headHash: string;
  ahead: number;
  behind: number;
  dirty: number;
  insertions: number;
  deletions: number;
  merging: boolean;
  rebasing: boolean;
  cherryPicking: boolean;
  upstream: string;
  remotes: string[];
  remoteUrl: string;
}

export interface RemoteInfo {
  name: string;
  url: string;
}

export interface StashInfo {
  id: string;
  time: number;
  message: string;
}

export interface BlameLine {
  hash: string;
  author: string;
  time: number;
  line: string;
}

export interface StatusEntry {
  path: string;
  origPath: string;
  area: "staged" | "unstaged" | "untracked" | "conflict";
  code: string;
}

export interface FileStat {
  path: string;
  added: number;
  deleted: number;
  binary: boolean;
}

export interface CommitDetail {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  time: number;
  message: string;
  files: FileStat[];
}

export interface ScanHit {
  path: string;
  name: string;
}

export interface MergeOutcome {
  ok: boolean;
  conflicts: boolean;
  message: string;
}

export interface ForkPoint {
  hash: string;
  subject: string;
  time: number;
}

export type GitResourceKind = "changes" | "branches" | "commits" | "tags" | "stashes";

export type TabKind = "welcome" | "repo" | "settings" | "diff" | "git-resource";

export interface TabDef {
  id: string;
  kind: TabKind;
  title: string;
  icon: IconName;
  iconClass: string;
  /** kind === "diff": the repo tab whose ui.diff/ui.blame this tab renders */
  repoTabId?: string;
  /** kind === "git-resource": full repository collection shown in the center */
  resource?: GitResourceKind;
}

/** Per-repo-tab UI state. */
export interface RepoTabState {
  repoId: string;
}

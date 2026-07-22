import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import * as git from "./git";
import { activeRepo, useApp } from "../store";
import type { Repo, RepoInfo } from "./types";

const MAX_REPO_INFO_CONCURRENCY = 6;
let activeRepoInfoRequests = 0;
const repoInfoQueue: Array<() => void> = [];

async function limitedRepoInfo(path: string): Promise<RepoInfo> {
  if (activeRepoInfoRequests >= MAX_REPO_INFO_CONCURRENCY) {
    await new Promise<void>((resolve) => repoInfoQueue.push(resolve));
  }
  activeRepoInfoRequests += 1;
  try {
    return await git.repoInfo(path);
  } finally {
    activeRepoInfoRequests -= 1;
    repoInfoQueue.shift()?.();
  }
}

/** All queries for one repo are keyed [path, ...] — one invalidate refreshes the repo. */
export function useRepoRefresh() {
  const qc = useQueryClient();
  return (path: string) => void qc.invalidateQueries({ queryKey: [path] });
}

export const useActiveRepo = () => useApp((s) => activeRepo(s));

/** poll=false for the welcome grid — N repos × a git status every 5s is not worth it. */
export const useRepoInfo = (path: string | undefined, poll = true) =>
  useQuery({
    queryKey: [path, "info"],
    queryFn: () => git.repoInfo(path!),
    enabled: !!path,
    refetchInterval: poll ? 5000 : false,
    staleTime: poll ? 0 : 30_000,
  });

/** repo_info for a whole list — shares the [path,"info"] cache with useRepoInfo,
 *  so the sidebar and the welcome grid never fetch the same repo twice. */
export function useRepoInfos(repos: Repo[]): Map<string, RepoInfo | undefined> {
  const results = useQueries({
    queries: repos.map((r) => ({
      queryKey: [r.path, "info"],
      queryFn: () => limitedRepoInfo(r.path),
      staleTime: 30_000,
    })),
  });
  return new Map(repos.map((r, i) => [r.path, results[i]?.data]));
}

export const LOG_PAGE_SIZE = 500;

export const useLog = (path: string | undefined, scope: string | null = null) =>
  useInfiniteQuery({
    queryKey: [path, "log", scope ?? "all"],
    queryFn: ({ pageParam }) => git.logGraph(path!, LOG_PAGE_SIZE, pageParam, scope ?? undefined),
    enabled: !!path,
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === LOG_PAGE_SIZE ? pages.length * LOG_PAGE_SIZE : undefined,
  });

export const useBranches = (path: string | undefined) =>
  useQuery({
    queryKey: [path, "branches"],
    queryFn: () => git.branches(path!),
    enabled: !!path,
  });

export const useDefaultBranch = (path: string | undefined) =>
  useQuery({
    queryKey: [path, "default-branch"],
    queryFn: () => git.defaultBranch(path!),
    enabled: !!path,
    staleTime: 60_000,
  });

export const useForkPoint = (path: string | undefined, branch: string | null, base: string | undefined) =>
  useQuery({
    queryKey: [path, "fork-point", branch, base],
    queryFn: () => git.mergeBase(path!, base!, branch!),
    enabled: !!path && !!branch && !!base && branch !== base,
    staleTime: 60_000,
  });

export const useStatus = (path: string | undefined) =>
  useQuery({
    queryKey: [path, "status"],
    queryFn: () => git.status(path!),
    enabled: !!path,
    refetchInterval: 5000,
  });

export const useWorktreeDiffStats = (path: string | undefined) =>
  useQuery({
    queryKey: [path, "status-stats"],
    queryFn: () => git.worktreeDiffStats(path!),
    enabled: !!path,
    refetchInterval: 5000,
  });

export const useCommitDetail = (path: string | undefined, hash: string | null) =>
  useQuery({
    queryKey: [path, "commit", hash],
    queryFn: () => git.commitDetail(path!, hash!),
    enabled: !!path && !!hash,
  });

export const useDiff = (
  path: string | undefined,
  diff: { mode: "commit" | "staged" | "worktree" | "untracked" | "stash" | "conflict"; file: string; hash?: string } | null,
) =>
  useQuery({
    queryKey: [path, "diff", diff?.mode, diff?.file, diff?.hash],
    // conflict mode never reaches diff_file — the merge editor uses useConflictFile
    queryFn: () => git.diffFile(path!, diff!.mode as Exclude<NonNullable<typeof diff>["mode"], "conflict">, diff!.file, diff!.hash),
    enabled: !!path && !!diff && diff.mode !== "conflict",
  });

/** Polls: the user may be editing the file in an external editor while the
 *  merge editor is open — removed markers must surface without a manual refresh. */
export const useConflictFile = (path: string | undefined, file: string | null) =>
  useQuery({
    queryKey: [path, "diff", "conflict-file", file],
    queryFn: () => git.conflictFile(path!, file!),
    enabled: !!path && !!file,
    refetchInterval: 5000,
  });

export const useStashes = (path: string | undefined) =>
  useQuery({
    queryKey: [path, "stashes"],
    queryFn: () => git.stashList(path!),
    enabled: !!path,
  });

export const useRemotes = (path: string | undefined) =>
  useQuery({
    queryKey: [path, "remotes"],
    queryFn: () => git.listRemotes(path!),
    enabled: !!path,
  });

export const useBlame = (path: string | undefined, file: string | null) =>
  useQuery({
    queryKey: [path, "blame", file],
    queryFn: () => git.blame(path!, file!),
    enabled: !!path && !!file,
    staleTime: 30_000,
  });

export const useSystemFonts = () =>
  useQuery({ queryKey: ["system-fonts"], queryFn: git.listFonts, staleTime: Infinity });

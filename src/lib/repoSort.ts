import type { Repo } from "./types";
import type { RepoSort } from "../store";

export function sortRepos(repos: Repo[], sort: RepoSort, churn: (path: string) => number): Repo[] {
  const out = [...repos];
  if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "recent") out.sort((a, b) => (b.lastActionAt ?? 0) - (a.lastActionAt ?? 0));
  else out.sort((a, b) => churn(b.path) - churn(a.path));
  return out;
}

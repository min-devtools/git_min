import { sortRepos } from "../lib/repoSort";
import type { Repo } from "../lib/types";

function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const repos = [
  { id: "acted-earlier", name: "Acted earlier", path: "/acted-earlier", lastActionAt: 1 },
  { id: "acted-last", name: "Acted last", path: "/acted-last", lastActionAt: 3 },
  { id: "never-acted", name: "Never acted", path: "/never-acted" },
] as Repo[];

equal(sortRepos(repos, "recent", () => 0).map((repo) => repo.id).join(","), "acted-last,acted-earlier,never-acted");

console.log("repository recency: all assertions passed");

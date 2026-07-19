import type { GitResourceKind } from "../../lib/types";
import { GitResourceList } from "../GitResources";
import { useApp } from "../../store";

export function GitResourceView({ repoTabId, resource, active }: { repoTabId: string; resource: GitResourceKind; active: boolean }) {
  const ui = useApp((state) => state.repoTabs[repoTabId]);
  const repo = useApp((state) => state.repos.find((item) => item.id === ui?.repoId));
  if (!ui || !repo) return null;
  return (
    <section className={`content git-resource-view ${active ? "active" : ""}`}>
      <GitResourceList path={repo.path} tabId={repoTabId} ui={ui} resource={resource} />
    </section>
  );
}

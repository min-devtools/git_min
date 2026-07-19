import { useShallow } from "zustand/react/shallow";
import { activeRepo, useApp } from "../store";
import { useRepoInfo } from "../lib/queries";
import { openExternalUrl } from "../lib/externalLinks";

export function Statusbar() {
  const repo = useApp((s) => activeRepo(s));
  const info = useRepoInfo(repo?.path);
  const { activeTitle, operation, vimKeys, showToast } = useApp(
    useShallow((s) => ({
      activeTitle: s.tabs.find((t) => t.id === s.activeTabId)?.title,
      operation: s.operations[activeRepo(s)?.path ?? ""],
      vimKeys: s.vimKeys,
      showToast: s.showToast,
    })),
  );

  const d = info.data;

  return (
    <footer className="statusbar">
      <div>
        <span>{repo ? repo.name : "no repository"}</span>
        {operation && <span>{operation.label.toLowerCase()}…</span>}
      </div>
      <div>
        {d && d.ahead > 0 && <span style={{ color: "var(--green)" }} title="commits to push">{`↑${d.ahead}`}</span>}
        {d && d.behind > 0 && <span style={{ color: "var(--orange)" }} title="commits to pull">{`↓${d.behind}`}</span>}
        {d?.merging && <span style={{ color: "var(--orange)" }}>merging</span>}
        {d?.rebasing && <span style={{ color: "var(--orange)" }}>rebasing</span>}
        {d?.cherryPicking && <span style={{ color: "var(--orange)" }}>cherry-picking</span>}
      </div>
      <div className="right-status">
        <span>{vimKeys ? "vim keys · ? for help" : ""}</span>
        <span>{activeTitle ?? ""}</span>
        <span>v{__APP_VERSION__}</span>
        <span
          className="credit"
          style={{ cursor: "pointer" }}
          title="Created by @ngthminhdev — open LinkedIn"
          onClick={() => void openExternalUrl("https://www.linkedin.com/in/ngthminh-dev/").catch((err) => showToast("Open link failed", String(err), "err"))}
        >
          by @ngthminhdev
        </span>
      </div>
    </footer>
  );
}

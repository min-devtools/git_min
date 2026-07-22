import { useShallow } from "zustand/react/shallow";
import { activeRepo, useApp } from "../store";
import { openExternalUrl } from "../lib/externalLinks";
import { UpdateBadge } from "../lib/updateCheck";

export function Statusbar() {
  const repo = useApp((s) => activeRepo(s));
  const { activeTitle, operation, vimKeys, showToast } = useApp(
    useShallow((s) => ({
      activeTitle: s.tabs.find((t) => t.id === s.activeTabId)?.title,
      operation: s.operations[activeRepo(s)?.path ?? ""],
      vimKeys: s.vimKeys,
      showToast: s.showToast,
    })),
  );

  return (
    <footer className="statusbar">
      <div>
        <span>{repo ? repo.name : "no repository"}</span>
        {operation && <span>{operation.label.toLowerCase()}…</span>}
      </div>
      <div className="right-status">
        <span>{vimKeys ? "vim keys · ? for help" : ""}</span>
        <span>{activeTitle ?? ""}</span>
        <span>v{__APP_VERSION__}</span>
        <UpdateBadge repo="min-devtools/git_min" />
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

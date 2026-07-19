import { load, type Store } from "@tauri-apps/plugin-store";
import type { Repo } from "./types";
import { useApp } from "../store";

let store: Store | null = null;

export async function initPersistence(): Promise<void> {
  try {
    store = await load("git_min.json", { autoSave: true, defaults: {} });
    const repos = (await store.get<Repo[]>("repos")) ?? [];
    useApp.setState({ repos });
  } catch (err) {
    console.error("failed to load persisted store", err);
  }

  let prev = useApp.getState();
  useApp.subscribe((s) => {
    if (store && s.repos !== prev.repos) {
      void (async () => {
        try {
          await store!.set("repos", s.repos);
          await store!.save();
        } catch (err) {
          console.error("failed to persist repos", err);
        }
      })();
    }
    // Session restore keeps per-repo commit drafts, but not transient selections.
    if (s.tabs !== prev.tabs || s.activeTabId !== prev.activeTabId || s.repoTabs !== prev.repoTabs) {
      localStorage.setItem(
        "gitmin:session",
        JSON.stringify({
          tabs: s.tabs,
          activeTabId: s.activeTabId,
          repoTabs: Object.fromEntries(
            Object.entries(s.repoTabs).map(([id, ui]) => [id, {
              repoId: ui.repoId,
              commitDraft: ui.commitDraft,
              amend: ui.amend,
            }]),
          ),
        }),
      );
    }
    prev = s;
  });
}

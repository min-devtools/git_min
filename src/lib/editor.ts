import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

export type EditorApp = "vscode" | "cursor" | "zed" | "idea" | "copy";

export const EDITOR_LABELS: Record<EditorApp, string> = {
  vscode: "VS Code",
  cursor: "Cursor",
  zed: "Zed",
  idea: "JetBrains IDEs",
  copy: "Copy path only",
};

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
const STORAGE_KEY = "gitmin:editor-app";

function defaultStorage(): PreferenceStorage {
  return localStorage;
}

export function loadEditorApp(storage: PreferenceStorage = defaultStorage()): EditorApp {
  const value = storage.getItem(STORAGE_KEY);
  return value && value in EDITOR_LABELS ? value as EditorApp : "vscode";
}

export function saveEditorApp(app: EditorApp, storage: PreferenceStorage = defaultStorage()): void {
  storage.setItem(STORAGE_KEY, app);
}

export function repoFilePath(repoPath: string, file: string): string {
  if (file.startsWith("/")) return file;
  return `${repoPath.replace(/\/+$/, "")}/${file.replace(/^\/+/, "")}`;
}

/** Returns true when an editor was launched, false when the configured action copied the path. */
export async function openRepoFile(repoPath: string, file: string, line = 1): Promise<boolean> {
  const path = repoFilePath(repoPath, file);
  const editor = loadEditorApp();
  if (editor === "copy") {
    await writeText(`${path}:${line}`);
    return false;
  }
  await invoke("editor_open", { editor, path, line, col: null });
  return true;
}

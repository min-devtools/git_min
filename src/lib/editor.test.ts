import { EDITOR_LABELS, loadEditorApp, repoFilePath, saveEditorApp } from "./editor";

function equal(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const storage = new MemoryStorage();
equal(loadEditorApp(storage), "vscode", "VS Code is the default");
saveEditorApp("zed", storage);
equal(loadEditorApp(storage), "zed", "saved editor round-trips");
storage.setItem("gitmin:editor-app", "malicious-shell");
equal(loadEditorApp(storage), "vscode", "unknown stored values fall back safely");

equal(repoFilePath("/Users/dev/project/", "src/main.ts"), "/Users/dev/project/src/main.ts", "joins repo-relative files");
equal(repoFilePath("/Users/dev/project", "/tmp/main.ts"), "/tmp/main.ts", "keeps absolute files");

equal(EDITOR_LABELS.idea, "JetBrains IDEs", "JetBrains is exposed as a complete editor family");
console.log("editor preference tests passed");

const CODE_EXT = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "rs", "py", "go", "java", "c", "h", "cpp", "hpp",
  "rb", "php", "swift", "kt", "vue", "svelte", "html", "css", "scss", "less", "sql",
]);
const TEXT_EXT = new Set(["md", "mdx", "txt", "rst", "adoc"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "icns", "bmp", "avif"]);
const CONFIG_EXT = new Set(["yml", "yaml", "toml", "ini", "conf", "cfg", "plist", "properties", "lock"]);
const SHELL_EXT = new Set(["sh", "zsh", "bash", "fish", "ps1", "bat", "cmd"]);

const LANGUAGE_ICON = {
  c: "file-c",
  h: "file-c",
  cpp: "file-cpp",
  hpp: "file-cpp",
  css: "file-css",
  scss: "file-sass",
  go: "file-go",
  html: "file-html",
  java: "file-java",
  js: "file-javascript",
  mjs: "file-javascript",
  cjs: "file-javascript",
  jsx: "file-react",
  tsx: "file-react",
  kt: "file-kotlin",
  less: "file-less",
  php: "file-php",
  py: "file-python",
  rb: "file-ruby",
  rs: "file-rust",
  sql: "file-sql",
  svelte: "file-svelte",
  swift: "file-swift",
  ts: "file-typescript",
  vue: "file-vue",
} as const;

const LANG_TONE: Record<string, string> = {
  ts: "lang-ts",
  tsx: "lang-ts",
  js: "lang-js",
  jsx: "lang-js",
  mjs: "lang-js",
  cjs: "lang-js",
  java: "lang-java",
  go: "lang-go",
  py: "lang-python",
  rs: "lang-rust",
  swift: "lang-swift",
  kt: "lang-kotlin",
  rb: "lang-ruby",
  php: "lang-php",
  vue: "lang-vue",
  svelte: "lang-svelte",
  html: "lang-html",
  css: "lang-css",
  scss: "lang-scss",
  less: "lang-less",
  c: "lang-c",
  cpp: "lang-cpp",
  h: "lang-c",
  hpp: "lang-cpp",
  sql: "lang-sql",
};

export type LanguageFileIconName = (typeof LANGUAGE_ICON)[keyof typeof LANGUAGE_ICON];
export type FileIconName = LanguageFileIconName | "git-branch" | "file-cog" | "file-json" | "file-code" | "file-text" | "file-image" | "terminal" | "file";

/** Filename → icon, so a change list reads by type at a glance. */
export function fileIcon(path: string): FileIconName {
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (base.startsWith(".git")) return "git-branch";
  if (base.startsWith(".env")) return "file-cog";
  const ext = base.slice(base.lastIndexOf(".") + 1);
  if (ext === "json" || ext === "jsonc") return "file-json";
  const languageIcon = LANGUAGE_ICON[ext as keyof typeof LANGUAGE_ICON];
  if (languageIcon) return languageIcon;
  if (CODE_EXT.has(ext)) return "file-code";
  if (TEXT_EXT.has(ext)) return "file-text";
  if (IMAGE_EXT.has(ext)) return "file-image";
  if (CONFIG_EXT.has(ext)) return "file-cog";
  if (SHELL_EXT.has(ext)) return "terminal";
  return "file";
}

/** Optional CSS tone class for code-file icons so Java/JS/Go/... read at a glance. */
export function fileIconTone(path: string): string | undefined {
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const ext = base.slice(base.lastIndexOf(".") + 1);
  return LANG_TONE[ext];
}

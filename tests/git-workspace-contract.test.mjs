import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sidebar = read("src/components/Sidebar.tsx");
const inspector = read("src/components/Inspector.tsx");
const workingTree = read("src/components/WorkingTree.tsx");
const welcome = read("src/components/views/WelcomeView.tsx");
const palette = read("src/components/CommandPalette.tsx");
const miniTabs = read("src/ui/MiniTabs.tsx");
const appShell = read("src/App.tsx");
const queries = read("src/lib/queries.ts");
const graphTable = read("src/components/GraphTable.tsx");
const dialog = read("src/components/Dialog.tsx");
const resize = read("src/components/ResizeHandles.tsx");
const repoView = read("src/components/views/RepoView.tsx");
const diffView = read("src/components/views/DiffView.tsx");
const settings = read("src/components/views/SettingsView.tsx");
const gitResources = read("src/components/GitResources.tsx");
const actions = read("src/lib/actions.ts");
const statusbar = read("src/components/Statusbar.tsx");
const themeContract = read("src/lib/themeContract.ts");
const themeDefs = read("src/lib/themes.ts");
const syntaxThemes = existsSync(new URL("../src/styles/syntax-themes.css", import.meta.url))
  ? read("src/styles/syntax-themes.css")
  : "";
const main = read("src/main.tsx");
const openerCapability = JSON.parse(read("src-tauri/capabilities/default.json"));
const css = read("src/styles/views.css");

assert(inspector.includes("<CommitComposer"), "Inspector Changes tab must render the pinned commit composer");
assert(sidebar.includes("GitResourcePreviews"), "The left dock owns ref navigation for the open repository");
assert(!inspector.includes("GitResourcePreviews"), "Refs must not be duplicated in the right dock");
assert(sidebar.includes("RECENT_LIMIT = 5"), "The left dock lists recent repositories only — the rest live on Welcome");
assert(sidebar.includes('<Icon name="folder-git"'), "Recent repositories must not reuse the local-branch glyph");
assert(gitResources.includes('branch.kind === "remote" ? "cloud"'), "Remote refs must have a distinct cloud glyph");
assert(gitResources.includes('branch.kind === "tag" ? "tag"'), "Tags must use a tag glyph instead of a branch/hash glyph");
assert(appShell.includes('case "git-resource"'), "App must render full Git resource workspace tabs");
assert(!workingTree.includes("previewItems("), "Working Tree must render the full list — sections scroll, no preview cap");
assert(css.includes(".commit-footer"), "Commit composer must have a pinned right-dock footer");
assert(
  graphTable.includes('className="graph-subject-content"') && css.includes(".graph-subject-content {") && css.includes("width: max-content;") && css.includes("overflow-x: auto;"),
  "Commit cells must have a bounded horizontal scroll region",
);

assert(!sidebar.includes('className="side-search"'), "Repo filtering lives on Welcome, not the left dock");
assert(welcome.includes("welcome-filter"), "Welcome must own the repository filter");
assert(repoView.includes("matchesCommitQuery"), "⌘F in the graph must search commits");

assert(inspector.includes("<WorkingTree"), "Inspector must own the Working Tree");
assert(!sidebar.includes("<WorkingTree"), "Sidebar must not own staging");
assert(inspector.includes('id: "changes"'), "Inspector must expose the Changes tab");
assert(inspector.includes("branchName={ui.selectedBranch}"), "Actions must receive the selected branch context");
assert(inspector.includes("Open PR"), "Selected branches must expose quick PR creation");
assert(inspector.includes("Create branch here"), "Selected commits must expose branch creation");
assert(inspector.includes("Merge into current"), "Eligible local branches must expose merge");
assert(inspector.includes("Rebase current here"), "Eligible local branches must expose rebase");
assert(inspector.includes('<div className="action-strip context-actions">\n        <ToolButton onClick={() => copy(hash, hash)}'), "Commit actions must use the contextual grid");
assert(inspector.includes('<div className="action-strip">\n        <ToolButton onClick={() => void doAddRemote(path)}'), "Add remote must remain a simple full-width action");
assert(css.includes(".context-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));"), "Contextual actions must use a balanced two-column grid");
assert(workingTree.includes("selectedStatus"), "Working Tree selection must include the status area");
assert(workingTree.includes("stageableEntries(entries)"), "Bulk stage must exclude conflicts");
assert(!resize.includes('localStorage.setItem("redismin:'), "GitMin must not write RedisMin layout keys");
assert(welcome.includes("openRepoTab(imported[0].id)"), "Import must immediately open the first imported repository");
assert(palette.includes("useBranches(repo?.path)"), "Palette must search active-repository refs");
assert(palette.includes("useStatus(repo?.path)"), "Palette must search working-tree paths");
assert(palette.includes("log.data?.pages.flat()"), "Palette must search loaded commits");
assert(miniTabs.includes('role="tablist"'), "Inspector tabs must expose tab semantics");
assert(miniTabs.includes('role="tab"'), "Inspector tab buttons must expose tab semantics");
assert(appShell.includes("stopImmediatePropagation"), "Escape must not leak past the highest-priority overlay");
assert(queries.includes("MAX_REPO_INFO_CONCURRENCY = 6"), "Repository grids must cap concurrent Git status processes");
assert(graphTable.includes('role="option"'), "Virtualized commit rows must remain keyboard-accessible");
assert(graphTable.includes("onSelectRef"), "Graph ref pills must expose explicit ref selection");
assert(repoView.includes("selectedBranch: name"), "Graph ref selection must store the selected branch");
assert(repoView.includes("selectedCommit: hash"), "Graph ref selection must store the pill commit");
assert(dialog.includes('e.key === "Tab"'), "Dialogs must trap keyboard focus");
assert(diffView.includes("selectedBlame"), "Blame view must keep an explicit selected line");
assert(diffView.includes("blame-selection-bar"), "Selected blame lines must expose contextual actions");
assert(diffView.includes('className={`blame-line'), "Blame rows must render persistent selection classes");
assert(diffView.includes("Copy line"), "Blame actions must copy the selected source line");
assert(diffView.includes("Open commit"), "Blame actions must open the selected commit remotely");
assert(diffView.includes("Commit detail"), "Blame actions must reveal full commit detail");
assert(diffView.includes("parseUnifiedDiff"), "Diff view must render from a line-aware unified patch model");
assert(diffView.includes("highlightSourceLines"), "Diff view must use full-source Tree-sitter highlighting");
assert(diffView.includes("ResizeObserver"), "Diff view must adapt to the available centre-pane width");
assert(diffView.includes("diff-layout-toggle"), "Diff view must expose a Split/Inline icon toggle");
assert(diffView.includes('aria-label={layout === "split" ? "Switch to inline diff" : "Switch to split diff"}'), "The icon toggle must announce its next action");
assert(diffView.includes('aria-pressed={layout === "split"}'), "The icon toggle must expose its current state");
assert(diffView.includes('<Icon name={layout === "split" ? "columns" : "rows-2"}'), "The icon toggle must visually distinguish Split and Inline states");
assert(diffView.includes("diff-gutter"), "Diff rows must expose old and new line-number gutters");
assert(diffView.includes("openRepoFile"), "Diff header must open the selected file in the configured editor");
assert(settings.includes("EDITOR_LABELS"), "Settings must list the allowlisted external editors");
assert(settings.includes("loadEditorApp"), "Settings must restore the saved editor preference");
assert(css.includes(".diff-split"), "Split diff must have a dedicated two-pane layout");
assert(css.includes("--syntax-key"), "Diff tokens must consume the active theme syntax palette");
assert(css.includes("var(--syntax-function)"), "Tree-sitter function tokens must consume the active theme palette");
assert(css.includes("var(--syntax-property)"), "Tree-sitter property tokens must consume the active theme palette");
assert(css.includes("var(--syntax-parameter)"), "Tree-sitter parameter tokens must consume the active theme palette");
assert(css.includes("var(--syntax-constant)"), "Tree-sitter constant tokens must consume the active theme palette");
assert(main.includes('import "./styles/syntax-themes.css"'), "App must load Netherize semantic syntax themes");
const selectableThemeIds = [...themeDefs.matchAll(/\{ id: "([^"]+)"/g)].map((match) => match[1]);
assert(selectableThemeIds.every((id) => syntaxThemes.includes(`body[data-theme="${id}"]`)), "Every selectable app theme must publish a semantic syntax palette");
assert(!/\.diff-view\s*\{[^}]*--syntax-/s.test(css), "Diff View must not hard-code a theme palette");
assert(syntaxThemes.includes('body[data-theme="default-dark"]'), "Default dark syntax must be sourced as a theme palette");
assert(syntaxThemes.includes("--syntax-key: #EACD61;"), "Default dark keywords must match Netherize Editor");
assert(syntaxThemes.includes("--syntax-operator: #EACD61;"), "Default dark operators must match Netherize Editor");
assert(syntaxThemes.includes("--syntax-variable: #FF738A;"), "Default dark variables must match Netherize Editor");
assert(syntaxThemes.includes("--syntax-function: #69C3FF;"), "Default dark functions must match Netherize Editor");
assert(syntaxThemes.includes("--syntax-type: #B78AFF;"), "Default dark types must match Netherize Editor");
assert(syntaxThemes.includes("--syntax-parameter: #F38CEC;"), "Default dark parameters must match Netherize Editor");
assert(css.includes(".tok-op { color: var(--syntax-operator);"), "Operators must not reuse muted punctuation colors");
assert(css.includes(".tok-punc { color: var(--syntax-punctuation);"), "Punctuation must remain visually subordinate");
assert(css.includes("background: color-mix(in oklab, var(--green), transparent 95%);"), "Added-line tint must not wash out syntax colors");
assert(css.includes("background: color-mix(in oklab, var(--red), transparent 95%);"), "Deleted-line tint must not wash out syntax colors");
assert(!css.includes(".diff-cell.add .tok-com, .diff-cell.delete .tok-com { opacity: 0.78; }"), "Changed comments must not be dimmed twice");
assert(themeContract.includes('"--syntax-function"'), "Theme application must publish function syntax colors");
assert(themeContract.includes('"--syntax-property"'), "Theme application must publish property syntax colors");
assert(themeContract.includes('"--syntax-operator"'), "Theme application must publish operator syntax colors");
assert(css.includes(".blame-line.selected"), "Selected blame lines must have a persistent visual treatment");
assert(css.includes(".blame-line.same-commit"), "All lines from the selected blame commit must be grouped visually");
assert(css.includes(".prompt-dialog { grid-template-columns: minmax(0, 1fr);"), "Dialogs must constrain grid children to the modal width");
assert(css.includes("overflow-wrap: anywhere"), "Long dialog paths must wrap inside the modal");
assert(
  css.includes("grid-template-columns: 200px minmax(460px, 1fr) minmax(280px, 30vw)"),
  "Working Tree must keep a usable 280px right dock at the supported narrow width",
);
const urlPermission = openerCapability.permissions.find((permission) => permission?.identifier === "opener:allow-open-url");
assert(urlPermission?.allow?.some((scope) => scope.url === "https://*" && scope.app === true), "HTTPS URLs must be allowed with the selected browser");
assert(settings.includes("externalBrowser"), "Settings must expose the external browser preference");
assert(actions.includes("openExternalUrl(url)"), "Remote links must use the configured browser helper");
assert(statusbar.includes("openExternalUrl("), "Statusbar links must use the configured browser helper");
assert(!actions.includes('@tauri-apps/plugin-opener'), "Actions must not bypass the configured browser helper");
assert(!settings.includes('@tauri-apps/plugin-opener'), "Settings links must not bypass the configured browser helper");
assert(!statusbar.includes('@tauri-apps/plugin-opener'), "Statusbar links must not bypass the configured browser helper");

console.log("git workspace contract: ok");

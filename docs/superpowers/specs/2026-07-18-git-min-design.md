# git_min — design spec (2026-07-18)

Sixth sibling of the `_min` Tauri devtools family. A git client centered on a
commit **graph view**, plus branch management, diffs, staging, merge and
conflict resolution, with lazygit-style single-key vim bindings.

## Scope

- **M1**: repo management (single import + folder scan bulk import), repo tabs,
  commit graph (rails + table), branches sidebar with fork-point info, commit
  detail + file diffs, checkout, branch create/delete, fetch/pull, vim keymap
  core (navigation + read ops).
- **M2**: working-tree changes (stage/unstage/discard), commit, push, merge,
  conflict resolution UI (ours/theirs/open-in-editor per file, continue/abort),
  vim keymap write ops, open-PR-in-browser.
- **Deferred**: interactive rebase, stash UI, blame, submodules, git-flow
  automation.

## Family conventions (all apply)

- Copy scaffold from `redis_min` (cleanest sibling). Keep the 6-file CSS
  cascade: `tokens.css → themes.css → base.css → layout.css → components.css`
  **symlinked** to `~/Project/design-systems`, plus local `views.css` loaded
  last (equal-specificity app rules win; shared rules needing survival use the
  extra class, e.g. `.content.settings-view`).
- Byte-identical `themes.ts`, `fontScale.ts`, `themeContract.ts`.
- Zustand `useApp` store; tab model: **repo = counter tab** (main object),
  singleton tabs by kind (`settings`, `repos` manager).
- `openDialog` promise instead of `window.prompt`; localStorage namespace
  `gitmin:`; repo list in tauri-plugin-store `git_min.json`.
- All Rust commands return `Result<T, String>`; typed invoke wrappers in one
  `src/lib/git.ts`.
- macOS menu without File>Close so ⌘W closes tabs.
- ⌘-shortcuts per `design-systems/SHORTCUTS.md`: ⌘K palette, ⌘N add repo,
  ⌘↵ commit (in message box), ⌘B/⌘R panels,
  ⌘1-9 tabs, ⌘W close tab, ⌘, settings, ⌘± font, ⌘E rename repo (display
  name), ⌘⌫ remove repo (confirm, danger). Never bare Backspace.

## Vim keymap (lazygit-style)

Single-key bindings, active only when no input/textarea/contentEditable is
focused and no dialog is open. Context = **focused panel** (branches /
graph / changes / files-in-detail), highlighted with a focus ring like
lazygit. `?` opens a keymap overlay listing everything.

| Key | Context | Action |
|---|---|---|
| `j` / `k` | any list | move selection down / up |
| `h` / `l` | global | focus previous / next panel |
| `g` / `G` | any list | jump top / bottom |
| `Enter` | graph row | open commit detail |
| `Enter` | branch | checkout |
| `Space` | changes file | stage ⇄ unstage |
| `a` | changes | stage all ⇄ unstage all |
| `c` | changes | focus commit message box |
| `d` | branch / changes file | delete branch / discard file (confirm, danger) |
| `n` | branches | new branch (prompt) |
| `m` | branch | merge selected into current |
| `p` | global | pull |
| `P` | global | push |
| `f` | global | fetch |
| `o` | branch / commit | open PR / commit on remote web (GitHub/GitLab URL from `remote get-url`) |
| `y` | commit / branch | copy hash / name |
| `R` | global | refresh graph + status |
| `?` | global | keymap overlay |
| `Esc` | any | close overlay / detail / back |

Rules: destructive single keys (`d`) always route through
`openDialog({kind:"confirm", danger:true})`. Keymap handler is one global
keydown listener in the store layer, same bail-out rules as siblings.

## Backend — shell out to `git` CLI

No libgit2. Spawn `git -C <repo>` per call; user's config/SSH/credential
helpers work for free. stderr → `Err(String)` → toast/dialog.

Commands (all `Result<T, String>`, JSON via serde):

| Command | git | Notes |
|---|---|---|
| `scan_repos(path, max_depth=3)` | — | Walk dirs, find `.git`, skip node_modules/hidden, don't descend into found repos |
| `repo_info(path)` | `rev-parse`, `status` | Validate + current branch, ahead/behind, dirty count |
| `log_graph(path, limit, skip)` | `log --all --topo-order` NUL-separated format incl. parent hashes, refs | Paged (default 2000) |
| `branches(path)` | `for-each-ref` | Local + remote + tags, HEAD marker |
| `merge_base(path, a, b)` | `merge-base` | Fork-point display, lazy per selection |
| `commit_detail(path, hash)` | `show --numstat` | Meta + changed files |
| `diff_file(path, spec, file)` | `diff`/`show` | Unified text, worktree or commit |
| `status(path)` | `status --porcelain=v2 -z` | Staged/unstaged/untracked/conflicts |
| `stage/unstage/discard(path, files)` | `add`/`restore --staged`/`restore` | Discard confirm danger |
| `commit(path, message, amend)` | `commit` | |
| `checkout(path, ref)` | `switch`/`checkout` | |
| `branch_create/delete(path, name, force)` | `branch` | Delete confirm danger |
| `fetch/pull/push(path)` | network ops | Async, statusbar spinner |
| `merge(path, ref)` | `merge` | Conflict → state reported via `status` |
| `merge_state(path)` | `MERGE_HEAD` check | In-merge banner |
| `resolve_file(path, file, side)` | `checkout --ours/--theirs` + `add` | side: ours/theirs |
| `merge_abort/continue(path)` | `merge --abort` / `commit` | |
| `remote_web_url(path, kind, ref)` | `remote get-url` | GitHub/GitLab/Bitbucket URL builder for `o` |
| `open_in_editor(path, file)` | opener plugin | |

Parsers (log, status porcelain-v2, numstat) are pure functions with unit tests.

## Graph (core feature)

- Data: `log_graph` returns commits `{hash, parents[], subject, author, email,
  time, refs[]}` in topo order.
- **Layout in TS**: standard active-rails column assignment (~100 lines, pure
  function `layoutGraph(commits) → rows with {column, edges[]}`). Unit test
  with a known DAG (fork, merge, octopus).
- **Render**: hand-rolled virtualized rows (fixed row height, translate-Y
  window) — no dependency. Left rails cell = per-row `<svg>` drawing
  dots/lines/curves; colors cycle through CSS token vars (`--graph-rail-1..8`
  added to design-systems tokens if absent — additive change only, verify
  siblings unaffected). Right cells: refs chips, subject, author, relative
  time.
- Click/Enter row → commit detail in right inspector. Context menu on row:
  checkout, create branch here, copy hash.
- Paging: load 2000, "Load more" row at bottom appends.

## Views (inside a repo tab)

- **Left panel (⌘B)**: Changes section (M2: staged/unstaged lists, message
  box, Commit button primary) + Branches (local/remote, tags collapsed).
  Select branch → meta line "forked from `main` @ abc123" via `merge_base`
  (against default branch; lazy + cached). Context menu: checkout, merge into
  current, delete, copy name.
- **Main**: graph table.
- **Right inspector (⌘R)**: commit detail — hash, author, date, message,
  changed files with +/- counts; click file → diff view replaces inspector
  content (back button / Esc). Diff = DOM renderer of unified diff, hunk
  headers, +/- line classes from tokens. No monaco (plain `<pre>`-row
  renderer is themable and enough for M1/M2).
- **Repos manager (singleton tab / welcome view)**: repo list from
  `git_min.json`, Add repo → folder picker → if the folder is itself a repo,
  import it; else show `scan_repos` results with checkboxes (all checked
  default) → bulk import. Remove repo (⌘⌫ confirm) removes from list only,
  never touches disk.
- **Merge/conflict (M2)**: in-merge banner across top of repo tab with
  Continue/Abort. Conflict files listed in Changes with badge; per-file
  actions: Take ours / Take theirs / Open in editor / Mark resolved.

## Error handling

Every invoke wrapper catches `Err(String)` → toast for background ops
(fetch), dialog for user-initiated destructive ops. Network ops show spinner
in statusbar; graph refresh after every mutating op.

## Testing

- Rust: unit tests for log/status/numstat parsers (`cargo test`).
- TS: `layoutGraph` DAG test (fork, merge crossing rails) — plain assert
  script, no framework.

## Naming

`gitmin` (crate/product `GitMin`), identifier `com.gitmin.app`, window
1480×940 like siblings. Logo later via design-systems logo flow.

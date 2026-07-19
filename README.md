# git_min

Minimal git desktop client — sixth sibling of the `_min` Tauri devtools family
(`requests_min`, `kafka_ui_min`, `redis_min`, `elastic_min`, `log_min`).
Built around the **commit graph**: rails + commit table, branches with
fork-point info, diffs, staging, merge & conflict resolution, and
lazygit-style single-key vim bindings.

## Features

- **Commit graph** — topo-ordered rails (SVG, theme tokens), virtualized to
  50k+ commits, ref chips (HEAD/branch/remote/tag), context menu (branch
  here, checkout, copy, open on remote), "load older" paging.
- **Branches** — local/remote/tags, ahead/behind, current highlighted,
  "forked from `main` @ abc123" via merge-base, checkout on double-click/Enter,
  merge into current, safe delete (auto-offers `-D` when unmerged).
- **Changes** — staged/unstaged/untracked/conflicts, per-file stage/unstage/
  discard, commit box (⌘↵), conflict resolution: take ours / theirs / mark
  resolved, merge banner with Continue/Abort.
- **Diffs** — unified diff DOM renderer (no monaco), commit files with +/−.
- **Repos manager** — open one repo, or **scan a folder** and bulk-import every
  repo inside (checkbox list, skips node_modules/hidden, depth 3).
- **Vim keys** (default on, toggle in Settings, `?` shows the map):
  `j/k/h/l/g/G` navigate · `Space` stage · `a` all · `c` commit · `d` delete/
  discard · `n` branch · `m` merge · `p` pull · `P` push · `f` fetch ·
  `o` open PR/commit on remote · `y` copy · `R` refresh.

## How it works

Rust side shells out to your installed `git` (`git -C <repo> …`) — your
config, SSH keys and credential helpers just work. No libgit2. All commands
return `Result<T, String>`; parsers (log, porcelain v2, numstat, ref list)
are pure functions with `cargo test` coverage. Graph layout is a ~100-line
pure TS function (`src/lib/graphLayout.ts`) with its own assert test.

Shared design system: `tokens/themes/base/layout/components.css` are
symlinked from `../design-systems`; only `views.css` is app-local.

## Dev

```sh
npm install
npm run tauri dev      # app
cargo test             # Rust parser tests (in src-tauri)
npm run test:layout    # graph layout DAG test
npm run app            # release .app bundle
```

Docs: `docs/superpowers/specs/2026-07-18-git-min-design.md`.

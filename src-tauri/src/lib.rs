mod editor;

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;

/// Field separator inside one record (log/for-each-ref custom formats).
const F: char = '\u{1}';

// ---------------------------------------------------------------------------
// git plumbing
// ---------------------------------------------------------------------------

fn run_git(repo: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .map_err(|e| format!("failed to spawn git: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        let msg = if stderr.trim().is_empty() { stdout } else { stderr };
        Err(msg.trim().to_string())
    }
}

/// Run on a blocking thread so long network ops never stall the async runtime.
async fn git_async(repo: String, args: Vec<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        run_git(&repo, &refs)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// data types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub time: i64,
    pub refs: Vec<String>,
    pub subject: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    /// local | remote | tag
    pub kind: String,
    pub hash: String,
    pub head: bool,
    pub upstream: String,
    pub ahead: i64,
    pub behind: i64,
    pub time: i64,
    pub subject: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub name: String,
    pub branch: String,
    pub detached: bool,
    pub head_hash: String,
    pub ahead: i64,
    pub behind: i64,
    pub dirty: usize,
    /// working-tree line churn vs HEAD (staged + unstaged), for the repo cards
    pub insertions: usize,
    pub deletions: usize,
    pub merging: bool,
    pub rebasing: bool,
    pub cherry_picking: bool,
    pub upstream: String,
    pub remotes: Vec<String>,
    pub remote_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
}

/// Parse `git diff --shortstat` → (insertions, deletions).
/// e.g. " 3 files changed, 20 insertions(+), 40 deletions(-)"
fn parse_shortstat(s: &str) -> (usize, usize) {
    let (mut ins, mut del) = (0, 0);
    for part in s.split(',') {
        let part = part.trim();
        let n: usize = part.split_whitespace().next().and_then(|t| t.parse().ok()).unwrap_or(0);
        if part.contains("insertion") {
            ins = n;
        } else if part.contains("deletion") {
            del = n;
        }
    }
    (ins, del)
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StatusEntry {
    pub path: String,
    pub orig_path: String,
    /// staged | unstaged | untracked | conflict
    pub area: String,
    /// porcelain XY code, e.g. "M.", ".M", "UU", "??"
    pub code: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub path: String,
    pub added: i64,
    pub deleted: i64,
    pub binary: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub time: i64,
    pub message: String,
    pub files: Vec<FileStat>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanHit {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeOutcome {
    pub ok: bool,
    pub conflicts: bool,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkPoint {
    pub hash: String,
    pub subject: String,
    pub time: i64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StashInfo {
    /// "stash@{0}"
    pub id: String,
    pub time: i64,
    pub message: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    pub hash: String,
    pub author: String,
    pub time: i64,
    pub line: String,
}

// ---------------------------------------------------------------------------
// parsers (pure — unit tested)
// ---------------------------------------------------------------------------

fn parse_log(raw: &str) -> Vec<CommitInfo> {
    raw.split('\0')
        .filter(|rec| !rec.trim().is_empty())
        .filter_map(|rec| {
            let mut f = rec.splitn(7, F);
            let hash = f.next()?.trim_start_matches('\n').to_string();
            let parents = f
                .next()?
                .split_whitespace()
                .map(str::to_string)
                .collect();
            let author = f.next()?.to_string();
            let email = f.next()?.to_string();
            let time = f.next()?.parse().unwrap_or(0);
            let refs = f
                .next()?
                .split(", ")
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .collect();
            let subject = f.next().unwrap_or("").to_string();
            Some(CommitInfo { hash, parents, author, email, time, refs, subject })
        })
        .collect()
}

/// Parse `%(upstream:track)` — "[ahead 3, behind 2]", "[gone]" or "".
fn parse_track(track: &str) -> (i64, i64) {
    let mut ahead = 0;
    let mut behind = 0;
    for part in track.trim_matches(['[', ']']).split(", ") {
        if let Some(n) = part.strip_prefix("ahead ") {
            ahead = n.parse().unwrap_or(0);
        } else if let Some(n) = part.strip_prefix("behind ") {
            behind = n.parse().unwrap_or(0);
        }
    }
    (ahead, behind)
}

fn parse_branches(raw: &str) -> Vec<BranchInfo> {
    raw.lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|line| {
            let f: Vec<&str> = line.splitn(8, F).collect();
            if f.len() < 8 {
                return None;
            }
            let full = f[0];
            let kind = if full.starts_with("refs/heads/") {
                "local"
            } else if full.starts_with("refs/remotes/") {
                "remote"
            } else if full.starts_with("refs/tags/") {
                "tag"
            } else {
                return None;
            };
            // skip the symbolic origin/HEAD pointer
            if kind == "remote" && full.ends_with("/HEAD") {
                return None;
            }
            let (ahead, behind) = parse_track(f[5]);
            Some(BranchInfo {
                name: f[1].to_string(),
                kind: kind.to_string(),
                hash: f[2].to_string(),
                head: f[3] == "*",
                upstream: f[4].to_string(),
                ahead,
                behind,
                time: f[6].parse().unwrap_or(0),
                subject: f[7].to_string(),
            })
        })
        .collect()
}

/// Parse `status --porcelain=v2 -z` output.
fn parse_status(raw: &str) -> Vec<StatusEntry> {
    let mut out = Vec::new();
    let mut it = raw.split('\0').filter(|s| !s.is_empty()).peekable();
    while let Some(rec) = it.next() {
        let mut push = |path: &str, orig: &str, area: &str, code: &str| {
            out.push(StatusEntry {
                path: path.to_string(),
                orig_path: orig.to_string(),
                area: area.to_string(),
                code: code.to_string(),
            })
        };
        match rec.as_bytes().first() {
            Some(b'1') | Some(b'2') => {
                let f: Vec<&str> = rec.splitn(if rec.starts_with('1') { 9 } else { 10 }, ' ').collect();
                let code = f[1];
                let path = *f.last().unwrap_or(&"");
                let orig = if rec.starts_with('2') { it.next().unwrap_or("") } else { "" };
                let (x, y) = (code.as_bytes()[0], code.as_bytes()[1]);
                if x != b'.' {
                    push(path, orig, "staged", code);
                }
                if y != b'.' {
                    push(path, orig, "unstaged", code);
                }
            }
            Some(b'u') => {
                let f: Vec<&str> = rec.splitn(11, ' ').collect();
                push(f.last().unwrap_or(&""), "", "conflict", f[1]);
            }
            Some(b'?') => {
                let mut p = &rec[2..];
                if p.ends_with('/') {
                    p = &p[..p.len() - 1];
                }
                push(p, "", "untracked", "??");
            }
            _ => {}
        }
    }
    out
}

fn parse_numstat(raw: &str) -> Vec<FileStat> {
    raw.lines()
        .filter_map(|line| {
            let mut f = line.splitn(3, '\t');
            let a = f.next()?.trim();
            let d = f.next()?.trim();
            let path = f.next()?.trim();
            if path.is_empty() {
                return None;
            }
            let binary = a == "-";
            Some(FileStat {
                path: path.to_string(),
                added: a.parse().unwrap_or(0),
                deleted: d.parse().unwrap_or(0),
                binary,
            })
        })
        .collect()
}

fn parse_stashes(raw: &str) -> Vec<StashInfo> {
    raw.lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|line| {
            let f: Vec<&str> = line.splitn(3, F).collect();
            if f.len() < 3 {
                return None;
            }
            Some(StashInfo {
                id: f[0].to_string(),
                time: f[1].parse().unwrap_or(0),
                message: f[2].to_string(),
            })
        })
        .collect()
}

/// Parse `git blame --line-porcelain` output.
fn parse_blame(raw: &str) -> Vec<BlameLine> {
    let mut out = Vec::new();
    let mut hash = String::new();
    let mut author = String::new();
    let mut time = 0i64;
    for line in raw.lines() {
        if let Some(code) = line.strip_prefix('\t') {
            out.push(BlameLine {
                hash: hash.chars().take(7).collect(),
                author: author.clone(),
                time,
                line: code.to_string(),
            });
        } else if let Some(a) = line.strip_prefix("author ") {
            author = a.to_string();
        } else if let Some(t) = line.strip_prefix("author-time ") {
            time = t.parse().unwrap_or(0);
        } else if let Some(first) = line.split(' ').next() {
            // header line: "<40-hex> <orig-line> <final-line> [<group-size>]"
            if first.len() == 40 && first.chars().all(|c| c.is_ascii_hexdigit()) {
                hash = first.to_string();
            }
        }
    }
    out
}

/// Normalize any git remote URL to a browsable https URL (no trailing .git).
fn web_base_url(remote: &str) -> String {
    let r = remote.trim();
    let https = if let Some(rest) = r.strip_prefix("git@") {
        // git@github.com:owner/repo.git
        format!("https://{}", rest.replacen(':', "/", 1))
    } else if let Some(rest) = r.strip_prefix("ssh://git@") {
        format!("https://{rest}")
    } else {
        r.to_string()
    };
    https.trim_end_matches('/').trim_end_matches(".git").to_string()
}

fn build_web_url(remote: &str, kind: &str, target: &str) -> String {
    let base = web_base_url(remote);
    let gitlab = base.contains("gitlab");
    let bitbucket = base.contains("bitbucket");
    match kind {
        "commit" => {
            if gitlab {
                format!("{base}/-/commit/{target}")
            } else {
                format!("{base}/commit/{target}")
            }
        }
        "pr" => {
            if gitlab {
                format!("{base}/-/merge_requests/new?merge_request%5Bsource_branch%5D={target}")
            } else if bitbucket {
                format!("{base}/pull-requests/new?source={target}")
            } else {
                format!("{base}/compare/{target}?expand=1")
            }
        }
        _ => {
            if gitlab {
                format!("{base}/-/tree/{target}")
            } else {
                format!("{base}/tree/{target}")
            }
        }
    }
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn scan_repos(path: String, max_depth: Option<u32>) -> Result<Vec<ScanHit>, String> {
    let depth = max_depth.unwrap_or(3);
    tauri::async_runtime::spawn_blocking(move || {
        fn walk(dir: &Path, depth: u32, out: &mut Vec<ScanHit>) {
            if out.len() >= 500 {
                return; // ponytail: hard cap, no UI for pathological trees
            }
            if dir.join(".git").exists() {
                out.push(ScanHit {
                    path: dir.to_string_lossy().into_owned(),
                    name: dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                });
                return; // don't descend into repos (skips submodules/nested)
            }
            if depth == 0 {
                return;
            }
            let Ok(entries) = std::fs::read_dir(dir) else { return };
            for e in entries.flatten() {
                let p = e.path();
                let name = e.file_name().to_string_lossy().into_owned();
                let is_dir = e.file_type().map(|t| t.is_dir() && !t.is_symlink()).unwrap_or(false);
                if !is_dir || name.starts_with('.') || name == "node_modules" || name == "target" {
                    continue;
                }
                walk(&p, depth - 1, out);
            }
        }
        let mut out = Vec::new();
        walk(&PathBuf::from(&path), depth, &mut out);
        out.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn repo_info(path: String) -> Result<RepoInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = path.as_str();
        run_git(p, &["rev-parse", "--is-inside-work-tree"])?;
        let branch = run_git(p, &["symbolic-ref", "--short", "-q", "HEAD"]).unwrap_or_default();
        let detached = branch.trim().is_empty();
        let head_hash = run_git(p, &["rev-parse", "--short", "HEAD"]).map(|s| s.trim().to_string()).unwrap_or_default();
        let (ahead, behind) = run_git(p, &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])
            .ok()
            .and_then(|s| {
                let mut f = s.split_whitespace();
                Some((f.next()?.parse().ok()?, f.next()?.parse().ok()?))
            })
            .unwrap_or((0, 0));
        let upstream = run_git(p, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
            .map(|value| value.trim().to_string())
            .unwrap_or_default();
        let remotes: Vec<String> = run_git(p, &["remote"])
            .unwrap_or_default()
            .lines()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(String::from)
            .collect();
        let dirty = run_git(p, &["status", "--porcelain"])?.lines().count();
        let git_path_exists = |name: &str| -> bool {
            run_git(p, &["rev-parse", "--git-path", name])
                .map(|rel| {
                    let rel = rel.trim().to_string();
                    Path::new(p).join(&rel).exists()
                        || (Path::new(&rel).is_absolute() && Path::new(&rel).exists())
                })
                .unwrap_or(false)
        };
        let merging = git_path_exists("MERGE_HEAD");
        let rebasing = git_path_exists("rebase-merge") || git_path_exists("rebase-apply");
        let cherry_picking = git_path_exists("CHERRY_PICK_HEAD");
        let (insertions, deletions) = run_git(p, &["diff", "--shortstat", "HEAD"])
            .map(|s| parse_shortstat(&s))
            .unwrap_or((0, 0));
        let upstream_remote = upstream.split_once('/').map(|(remote, _)| remote);
        let preferred_remote = upstream_remote
            .filter(|remote| remotes.iter().any(|item| item == remote))
            .or_else(|| remotes.iter().find(|remote| remote.as_str() == "origin").map(String::as_str))
            .or_else(|| remotes.first().map(String::as_str));
        let remote_url = preferred_remote
            .and_then(|remote| run_git(p, &["remote", "get-url", remote]).ok())
            .map(|value| value.trim().to_string())
            .unwrap_or_default();
        let name = Path::new(p).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        Ok(RepoInfo {
            name,
            branch: if detached { head_hash.clone() } else { branch.trim().to_string() },
            detached,
            head_hash,
            ahead,
            behind,
            dirty,
            insertions,
            deletions,
            merging,
            rebasing,
            cherry_picking,
            upstream,
            remotes,
            remote_url,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn log_graph_args(limit: u32, skip: u32, scope: Option<String>) -> Vec<String> {
    let mut args = vec![
        "log".into(),
        "--topo-order".into(),
        "-z".into(),
        format!("--max-count={limit}"),
        format!("--skip={skip}"),
        format!("--pretty=format:%H{F}%P{F}%an{F}%ae{F}%at{F}%D{F}%s"),
    ];
    if let Some(scope) = scope.filter(|value| !value.trim().is_empty()) {
        args.push(scope);
        args.push("--".into());
    } else {
        args.push("--all".into());
    }
    args
}

#[tauri::command]
async fn log_graph(path: String, limit: Option<u32>, skip: Option<u32>, scope: Option<String>) -> Result<Vec<CommitInfo>, String> {
    if let Some(value) = scope.as_ref().filter(|value| !value.trim().is_empty()) {
        if value.starts_with('-') {
            return Err("invalid history scope".into());
        }
        git_async(
            path.clone(),
            vec!["rev-parse".into(), "--verify".into(), format!("{value}^{{commit}}")],
        )
        .await?;
    }
    let args = log_graph_args(limit.unwrap_or(2000), skip.unwrap_or(0), scope);
    let raw = git_async(path, args).await?;
    Ok(parse_log(&raw))
}

#[tauri::command]
async fn branches(path: String) -> Result<Vec<BranchInfo>, String> {
    let fmt = format!(
        "%(refname){F}%(refname:short){F}%(objectname:short){F}%(HEAD){F}%(upstream:short){F}%(upstream:track){F}%(committerdate:unix){F}%(subject)"
    );
    let raw = git_async(
        path,
        vec![
            "for-each-ref".into(),
            format!("--format={fmt}"),
            "--sort=-committerdate".into(),
            "refs/heads".into(),
            "refs/remotes".into(),
            "refs/tags".into(),
        ],
    )
    .await?;
    Ok(parse_branches(&raw))
}

#[tauri::command]
async fn default_branch(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = path.as_str();
        if let Ok(s) = run_git(p, &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]) {
            return Ok(s.trim().strip_prefix("origin/").unwrap_or(s.trim()).to_string());
        }
        for cand in ["main", "master"] {
            if run_git(p, &["show-ref", "--verify", "-q", &format!("refs/heads/{cand}")]).is_ok() {
                return Ok(cand.to_string());
            }
        }
        Ok(run_git(p, &["symbolic-ref", "--short", "-q", "HEAD"]).unwrap_or_default().trim().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn merge_base(path: String, a: String, b: String) -> Result<ForkPoint, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = path.as_str();
        let base = run_git(p, &["merge-base", &a, &b])?.trim().to_string();
        let raw = run_git(p, &["log", "-1", "--pretty=format:%h\u{1}%s\u{1}%at", &base])?;
        let f: Vec<&str> = raw.splitn(3, F).collect();
        Ok(ForkPoint {
            hash: f.first().unwrap_or(&"").to_string(),
            subject: f.get(1).unwrap_or(&"").to_string(),
            time: f.get(2).and_then(|s| s.parse().ok()).unwrap_or(0),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn commit_detail(path: String, hash: String) -> Result<CommitDetail, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = path.as_str();
        let meta = run_git(p, &["log", "-1", &format!("--pretty=format:%H{F}%P{F}%an{F}%ae{F}%at{F}%B"), &hash])?;
        let f: Vec<&str> = meta.splitn(6, F).collect();
        if f.len() < 6 {
            return Err(format!("unexpected log output for {hash}"));
        }
        let numstat = run_git(p, &["show", "--numstat", "--format=", &hash])?;
        Ok(CommitDetail {
            hash: f[0].to_string(),
            parents: f[1].split_whitespace().map(str::to_string).collect(),
            author: f[2].to_string(),
            email: f[3].to_string(),
            time: f[4].parse().unwrap_or(0),
            message: f[5].trim_end().to_string(),
            files: parse_numstat(&numstat),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// mode: commit (needs hash) | staged | worktree | untracked | stash (file = stash id)
#[tauri::command]
async fn diff_file(path: String, mode: String, hash: Option<String>, file: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = path.as_str();
        match mode.as_str() {
            "commit" => run_git(
                p,
                &["show", "--first-parent", "--format=", &hash.unwrap_or_default(), "--", &file],
            ),
            "staged" => run_git(p, &["diff", "--cached", "--", &file]),
            "stash" => run_git(p, &["stash", "show", "-p", "--include-untracked", &file]),
            "untracked" => {
                // --no-index exits 1 when files differ — that's the success case here
                let out = Command::new("git")
                    .args(["-C", p, "diff", "--no-index", "--", "/dev/null", &file])
                    .output()
                    .map_err(|e| e.to_string())?;
                Ok(String::from_utf8_lossy(&out.stdout).into_owned())
            }
            _ => run_git(p, &["diff", "--", &file]),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Whole staged diff — fed to the AI commit-message generator.
#[tauri::command]
async fn staged_diff(path: String) -> Result<String, String> {
    git_async(path, vec!["diff".into(), "--cached".into()]).await
}

#[tauri::command]
async fn status(path: String) -> Result<Vec<StatusEntry>, String> {
    let raw = git_async(path, vec!["status".into(), "--porcelain=v2".into(), "-z".into()]).await?;
    Ok(parse_status(&raw))
}

#[tauri::command]
async fn worktree_diff_stats(path: String) -> Result<Vec<FileStat>, String> {
    use std::collections::HashMap;
    let mut map: HashMap<String, FileStat> = HashMap::new();
    let mut merge = |raw: String| {
        for stat in parse_numstat(&raw) {
            let e = map.entry(stat.path.clone()).or_insert(FileStat {
                path: stat.path.clone(),
                added: 0,
                deleted: 0,
                binary: false,
            });
            e.added += stat.added;
            e.deleted += stat.deleted;
            e.binary = e.binary || stat.binary;
        }
    };
    if let Ok(raw) = git_async(path.clone(), vec!["diff".into(), "--cached".into(), "--numstat".into()]).await {
        merge(raw);
    }
    if let Ok(raw) = git_async(path.clone(), vec!["diff".into(), "--numstat".into()]).await {
        merge(raw);
    }
    if let Ok(raw) = git_async(path.clone(), vec!["ls-files".into(), "--others".into(), "--exclude-standard".into()]).await {
        for file in raw.lines().filter(|l| !l.is_empty()) {
            let full = std::path::Path::new(&path).join(file);
            let lines = std::fs::read(&full)
                .ok()
                .and_then(|b| String::from_utf8(b).ok())
                .map(|s| s.lines().count())
                .unwrap_or(0);
            let e = map.entry(file.to_string()).or_insert(FileStat {
                path: file.to_string(),
                added: 0,
                deleted: 0,
                binary: false,
            });
            e.added += lines as i64;
        }
    }
    Ok(map.into_values().collect())
}

#[tauri::command]
async fn stage(path: String, files: Vec<String>) -> Result<(), String> {
    let mut args = vec!["add".to_string(), "--".to_string()];
    args.extend(files);
    git_async(path, args).await.map(|_| ())
}

#[tauri::command]
async fn unstage(path: String, files: Vec<String>) -> Result<(), String> {
    let mut args = vec!["restore".to_string(), "--staged".to_string(), "--".to_string()];
    args.extend(files);
    git_async(path, args).await.map(|_| ())
}

#[tauri::command]
async fn discard(path: String, files: Vec<String>, untracked: bool) -> Result<(), String> {
    if untracked {
        let mut args = vec!["clean".to_string(), "-f".to_string(), "--".to_string()];
        args.extend(files);
        git_async(path, args).await.map(|_| ())
    } else {
        let mut args = vec!["restore".to_string(), "--".to_string()];
        args.extend(files);
        git_async(path, args).await.map(|_| ())
    }
}

#[tauri::command]
async fn commit(path: String, message: String, amend: bool) -> Result<String, String> {
    let args: Vec<String> = if amend && message.trim().is_empty() {
        // amend keeping the previous message
        vec!["commit".into(), "--amend".into(), "--no-edit".into()]
    } else if amend {
        vec!["commit".into(), "--amend".into(), "-m".into(), message]
    } else {
        vec!["commit".into(), "-m".into(), message]
    };
    git_async(path, args).await
}

#[tauri::command]
async fn checkout(path: String, target: String) -> Result<String, String> {
    git_async(path, vec!["checkout".into(), target]).await
}

fn checkout_tracking_args(remote_ref: &str, local_name: &str) -> Vec<String> {
    vec![
        "checkout".into(),
        "--track".into(),
        "-b".into(),
        local_name.into(),
        remote_ref.into(),
    ]
}

#[tauri::command]
async fn checkout_tracking(path: String, remote_ref: String, local_name: String) -> Result<String, String> {
    if remote_ref.starts_with('-') || local_name.starts_with('-') {
        return Err("invalid branch name".into());
    }
    git_async(path.clone(), vec!["check-ref-format".into(), "--branch".into(), local_name.clone()]).await?;
    git_async(
        path.clone(),
        vec!["rev-parse".into(), "--verify".into(), format!("refs/remotes/{remote_ref}")],
    )
    .await?;
    if git_async(
        path.clone(),
        vec!["rev-parse".into(), "--verify".into(), format!("refs/heads/{local_name}")],
    )
    .await
    .is_ok()
    {
        git_async(path, vec!["checkout".into(), local_name]).await
    } else {
        git_async(path, checkout_tracking_args(&remote_ref, &local_name)).await
    }
}

#[tauri::command]
async fn branch_create(path: String, name: String, at: Option<String>, switch: bool) -> Result<String, String> {
    let mut args: Vec<String> = if switch {
        vec!["checkout".into(), "-b".into(), name]
    } else {
        vec!["branch".into(), name]
    };
    if let Some(at) = at {
        args.push(at);
    }
    git_async(path, args).await
}

#[tauri::command]
async fn branch_delete(path: String, name: String, force: bool) -> Result<String, String> {
    git_async(path, vec!["branch".into(), if force { "-D" } else { "-d" }.into(), name]).await
}

fn delete_remote_branch_args(remote: &str, name: &str) -> Vec<String> {
    vec!["push".into(), remote.into(), "--delete".into(), name.into()]
}

#[tauri::command]
async fn branch_delete_remote(path: String, remote: String, name: String) -> Result<String, String> {
    if remote.starts_with('-') || name.starts_with('-') {
        return Err("invalid remote or branch name".into());
    }
    git_async(path.clone(), vec!["remote".into(), "get-url".into(), remote.clone()]).await?;
    git_async(path.clone(), vec!["check-ref-format".into(), "--branch".into(), name.clone()]).await?;
    git_async(path, delete_remote_branch_args(&remote, &name)).await
}

#[tauri::command]
async fn fetch(path: String) -> Result<String, String> {
    git_async(path, vec!["fetch".into(), "--all".into(), "--prune".into()]).await
}

#[tauri::command]
async fn pull(path: String) -> Result<String, String> {
    git_async(path, vec!["pull".into(), "--ff-only".into()]).await
}

#[tauri::command]
async fn push(path: String) -> Result<String, String> {
    git_async(path, vec!["push".into()]).await
}

fn push_args(remote: &str, branch: &str, set_upstream: bool) -> Vec<String> {
    let mut args = vec!["push".into()];
    if set_upstream {
        args.push("--set-upstream".into());
    }
    args.push(remote.into());
    args.push(branch.into());
    args
}

#[tauri::command]
async fn push_to(path: String, remote: String, branch: String, set_upstream: bool) -> Result<String, String> {
    if remote.starts_with('-') || branch.starts_with('-') {
        return Err("invalid remote or branch name".into());
    }
    git_async(path.clone(), vec!["remote".into(), "get-url".into(), remote.clone()]).await?;
    git_async(path.clone(), vec!["check-ref-format".into(), "--branch".into(), branch.clone()]).await?;
    git_async(path, push_args(&remote, &branch, set_upstream)).await
}

#[tauri::command]
async fn merge(path: String, target: String) -> Result<MergeOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = path.as_str();
        match run_git(p, &["merge", "--no-edit", &target]) {
            Ok(msg) => Ok(MergeOutcome { ok: true, conflicts: false, message: msg.trim().to_string() }),
            Err(msg) => {
                let conflicted = !run_git(p, &["diff", "--name-only", "--diff-filter=U"])?.trim().is_empty();
                if conflicted {
                    Ok(MergeOutcome { ok: false, conflicts: true, message: msg })
                } else {
                    Err(msg)
                }
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cherry_pick(path: String, hashes: Vec<String>) -> Result<MergeOutcome, String> {
    if hashes.is_empty() {
        return Err("no commits to cherry-pick".into());
    }
    if hashes.iter().any(|h| h.starts_with('-')) {
        return Err("invalid commit".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let p = path.as_str();
        // one call, oldest-first: git replays them in order and a conflict stops the
        // sequence so `cherry-pick --continue` resumes with the rest still queued
        let mut args = vec!["cherry-pick"];
        args.extend(hashes.iter().map(String::as_str));
        match run_git(p, &args) {
            Ok(msg) => Ok(MergeOutcome { ok: true, conflicts: false, message: msg.trim().to_string() }),
            Err(msg) => {
                let conflicted = !run_git(p, &["diff", "--name-only", "--diff-filter=U"])?.trim().is_empty();
                if conflicted {
                    Ok(MergeOutcome { ok: false, conflicts: true, message: msg })
                } else {
                    Err(msg)
                }
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// op: continue | abort | skip
#[tauri::command]
async fn cherry_pick_op(path: String, op: String) -> Result<String, String> {
    // core.editor=true so --continue never blocks waiting on an editor
    git_async(
        path,
        vec!["-c".into(), "core.editor=true".into(), "cherry-pick".into(), format!("--{op}")],
    )
    .await
}

#[tauri::command]
async fn merge_abort(path: String) -> Result<String, String> {
    git_async(path, vec!["merge".into(), "--abort".into()]).await
}

#[tauri::command]
async fn merge_continue(path: String) -> Result<String, String> {
    git_async(path, vec!["commit".into(), "--no-edit".into()]).await
}

/// side: ours | theirs
#[tauri::command]
async fn resolve_file(path: String, file: String, side: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = path.as_str();
        let flag = if side == "theirs" { "--theirs" } else { "--ours" };
        run_git(p, &["checkout", flag, "--", &file])?;
        run_git(p, &["add", "--", &file])?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn mark_resolved(path: String, file: String) -> Result<(), String> {
    git_async(path, vec!["add".into(), "--".into(), file]).await.map(|_| ())
}

// ---- stash ----

#[tauri::command]
async fn stash_list(path: String) -> Result<Vec<StashInfo>, String> {
    let raw = git_async(
        path,
        vec!["stash".into(), "list".into(), format!("--format=%gd{F}%at{F}%gs")],
    )
    .await?;
    Ok(parse_stashes(&raw))
}

#[tauri::command]
async fn stash_push(path: String, message: Option<String>) -> Result<String, String> {
    let mut args = vec!["stash".to_string(), "push".to_string(), "-u".to_string()];
    if let Some(m) = message.filter(|m| !m.trim().is_empty()) {
        args.push("-m".to_string());
        args.push(m);
    }
    git_async(path, args).await
}

/// op: apply | pop | drop
#[tauri::command]
async fn stash_op(path: String, id: String, op: String) -> Result<String, String> {
    let op = match op.as_str() {
        "pop" => "pop",
        "drop" => "drop",
        _ => "apply",
    };
    git_async(path, vec!["stash".into(), op.into(), id]).await
}

// ---- blame ----

#[tauri::command]
async fn blame(path: String, file: String) -> Result<Vec<BlameLine>, String> {
    let raw = git_async(
        path,
        vec!["blame".into(), "-w".into(), "--line-porcelain".into(), "--".into(), file],
    )
    .await?;
    Ok(parse_blame(&raw))
}

// ---- rebase ----

#[tauri::command]
async fn rebase(path: String, onto: String) -> Result<MergeOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = path.as_str();
        match run_git(p, &["rebase", &onto]) {
            Ok(msg) => Ok(MergeOutcome { ok: true, conflicts: false, message: msg.trim().to_string() }),
            Err(msg) => {
                let conflicted = !run_git(p, &["diff", "--name-only", "--diff-filter=U"])?.trim().is_empty();
                if conflicted {
                    Ok(MergeOutcome { ok: false, conflicts: true, message: msg })
                } else {
                    // rebase may stop without conflicts (e.g. dirty tree) — surface as error
                    Err(msg)
                }
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// op: continue | abort | skip — continue uses a no-op editor so it never blocks.
#[tauri::command]
async fn rebase_op(path: String, op: String) -> Result<String, String> {
    let op = match op.as_str() {
        "abort" => "--abort",
        "skip" => "--skip",
        _ => "--continue",
    };
    git_async(
        path,
        vec!["-c".into(), "core.editor=true".into(), "rebase".into(), op.into()],
    )
    .await
}

// ---- hunk staging ----

/// Apply a patch to the index only: stage a hunk (reverse=false) or unstage one (reverse=true).
#[tauri::command]
async fn apply_patch(path: String, patch: String, reverse: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Write;
        use std::process::Stdio;
        let mut args = vec!["-C", &path, "apply", "--cached", "--unidiff-zero"];
        if reverse {
            args.push("--reverse");
        }
        let mut child = Command::new("git")
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("failed to spawn git: {e}"))?;
        child
            .stdin
            .as_mut()
            .ok_or("no stdin")?
            .write_all(patch.as_bytes())
            .map_err(|e| e.to_string())?;
        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        if out.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// kind: pr | commit | branch — returns a browsable URL for the upstream remote,
/// falling back to origin and then the first configured remote.
#[tauri::command]
async fn remote_web_url(path: String, kind: String, target: String) -> Result<String, String> {
    let upstream = git_async(
        path.clone(),
        vec!["rev-parse".into(), "--abbrev-ref".into(), "--symbolic-full-name".into(), "@{upstream}".into()],
    )
    .await
    .unwrap_or_default();
    let remotes = git_async(path.clone(), vec!["remote".into()]).await?;
    let names: Vec<&str> = remotes.lines().map(str::trim).filter(|value| !value.is_empty()).collect();
    let upstream_remote = upstream.trim().split_once('/').map(|(remote, _)| remote);
    let remote_name = upstream_remote
        .filter(|remote| names.contains(remote))
        .or_else(|| names.iter().copied().find(|remote| *remote == "origin"))
        .or_else(|| names.first().copied())
        .ok_or_else(|| "repository has no configured remotes".to_string())?;
    let remote = git_async(path, vec!["remote".into(), "get-url".into(), remote_name.into()]).await?;
    Ok(build_web_url(remote.trim(), &kind, &target))
}

#[tauri::command]
async fn list_remotes(path: String) -> Result<Vec<RemoteInfo>, String> {
    git_async(path.clone(), vec!["remote".into()]).await?;
    let names_out = git_async(path.clone(), vec!["remote".into()]).await?;
    let names: Vec<String> = names_out
        .lines()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(String::from)
        .collect();
    let mut remotes = Vec::with_capacity(names.len());
    for name in names {
        let url = git_async(path.clone(), vec!["remote".into(), "get-url".into(), name.clone()]).await?;
        remotes.push(RemoteInfo { name, url: url.trim().to_string() });
    }
    Ok(remotes)
}

#[tauri::command]
async fn add_remote(path: String, name: String, url: String) -> Result<(), String> {
    if name.starts_with('-') || name.is_empty() {
        return Err("invalid remote name".into());
    }
    if url.is_empty() {
        return Err("remote URL is required".into());
    }
    git_async(path, vec!["remote".into(), "add".into(), name, url]).await?;
    Ok(())
}

#[tauri::command]
async fn remove_remote(path: String, name: String) -> Result<(), String> {
    git_async(path, vec!["remote".into(), "remove".into(), name]).await?;
    Ok(())
}

#[tauri::command]
async fn set_remote_url(path: String, name: String, url: String) -> Result<(), String> {
    if url.is_empty() {
        return Err("remote URL is required".into());
    }
    git_async(path, vec!["remote".into(), "set-url".into(), name, url]).await?;
    Ok(())
}

fn ai_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(CLIENT.get_or_init(|| client))
}

/// OpenAI-compatible chat completion — same contract as elastic_min's ai_chat.
#[tauri::command]
async fn ai_chat(
    endpoint: String,
    api_key: String,
    model: String,
    messages: serde_json::Value,
) -> Result<String, String> {
    let url = format!("{}/chat/completions", endpoint.trim_end_matches('/'));
    let client = ai_client()?;
    let mut req = client.post(&url);
    // keyless local providers (ollama, llama.cpp) reject a bare "Bearer " header
    if !api_key.is_empty() {
        req = req.bearer_auth(api_key);
    }
    let res = req
        .json(&serde_json::json!({ "model": model, "messages": messages }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v["error"]["message"].as_str().map(String::from))
            .unwrap_or_else(|| text.chars().take(300).collect());
        return Err(format!("HTTP {status}: {msg}"));
    }
    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    v["choices"][0]["message"]["content"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "provider returned no message content".into())
}

/// List installed font family names (macOS: NSFontManager via JXA — no extra crates).
#[tauri::command]
async fn list_fonts() -> Result<Vec<String>, String> {
    let out = Command::new("osascript")
        .args([
            "-l",
            "JavaScript",
            "-e",
            r#"ObjC.import("AppKit"); JSON.stringify(ObjC.deepUnwrap($.NSFontManager.sharedFontManager.availableFontFamilies))"#,
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).into_owned());
    }
    let json = String::from_utf8_lossy(&out.stdout);
    let mut fonts: Vec<String> = serde_json::from_str(json.trim()).map_err(|e| e.to_string())?;
    fonts.retain(|f| !f.starts_with('.'));
    fonts.sort();
    Ok(fonts)
}

#[tauri::command]
fn editor_open(editor: String, path: String, line: u32, col: Option<u32>) -> Result<(), String> {
    editor::open_editor(&editor, &path, line, col)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_repos,
            repo_info,
            log_graph,
            branches,
            default_branch,
            merge_base,
            commit_detail,
            diff_file,
            staged_diff,
            cherry_pick,
            cherry_pick_op,
            ai_chat,
            editor_open,
            status,
            worktree_diff_stats,
            stage,
            unstage,
            discard,
            commit,
            checkout,
            checkout_tracking,
            branch_create,
            branch_delete,
            branch_delete_remote,
            fetch,
            pull,
            push,
            push_to,
            merge,
            merge_abort,
            merge_continue,
            resolve_file,
            mark_resolved,
            stash_list,
            stash_push,
            stash_op,
            blame,
            rebase,
            rebase_op,
            apply_patch,
            remote_web_url,
            list_remotes,
            add_remote,
            remove_remote,
            set_remote_url,
            list_fonts
        ])
        .setup(|app| {
            // Custom menu without File > Close Window so ⌘W reaches the webview
            // (used to close the active workspace tab). Edit menu kept for copy/paste.
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{Menu, PredefinedMenuItem, Submenu};
                let handle = app.handle();
                let app_menu = Submenu::with_items(
                    handle,
                    "GitMin",
                    true,
                    &[
                        &PredefinedMenuItem::about(handle, None, None)?,
                        &PredefinedMenuItem::separator(handle)?,
                        &PredefinedMenuItem::hide(handle, None)?,
                        &PredefinedMenuItem::hide_others(handle, None)?,
                        &PredefinedMenuItem::show_all(handle, None)?,
                        &PredefinedMenuItem::separator(handle)?,
                        &PredefinedMenuItem::quit(handle, None)?,
                    ],
                )?;
                let edit = Submenu::with_items(
                    handle,
                    "Edit",
                    true,
                    &[
                        &PredefinedMenuItem::undo(handle, None)?,
                        &PredefinedMenuItem::redo(handle, None)?,
                        &PredefinedMenuItem::separator(handle)?,
                        &PredefinedMenuItem::cut(handle, None)?,
                        &PredefinedMenuItem::copy(handle, None)?,
                        &PredefinedMenuItem::paste(handle, None)?,
                        &PredefinedMenuItem::select_all(handle, None)?,
                    ],
                )?;
                let window = Submenu::with_items(
                    handle,
                    "Window",
                    true,
                    &[
                        &PredefinedMenuItem::minimize(handle, None)?,
                        &PredefinedMenuItem::maximize(handle, None)?,
                        &PredefinedMenuItem::fullscreen(handle, None)?,
                    ],
                )?;
                let menu = Menu::with_items(handle, &[&app_menu, &edit, &window])?;
                app.set_menu(menu)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn test_git(path: &str, args: &[&str]) -> String {
        let output = Command::new("git")
            .args(["-C", path])
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    #[test]
    fn shortstat_parses_both_directions() {
        assert_eq!(parse_shortstat(" 3 files changed, 20 insertions(+), 40 deletions(-)"), (20, 40));
        assert_eq!(parse_shortstat(" 1 file changed, 7 insertions(+)"), (7, 0));
        assert_eq!(parse_shortstat(" 1 file changed, 2 deletions(-)"), (0, 2));
        assert_eq!(parse_shortstat(""), (0, 0));
    }

    #[test]
    fn log_parses_records_with_refs_and_parents() {
        let raw = format!(
            "aaa{F}bbb ccc{F}Min{F}m@x.io{F}1721000000{F}HEAD -> main, origin/main, tag: v1{F}merge stuff\0ddd{F}{F}Codex{F}c@x.io{F}1720990000{F}{F}root commit"
        );
        let log = parse_log(&raw);
        assert_eq!(log.len(), 2);
        assert_eq!(log[0].parents, vec!["bbb", "ccc"]);
        assert_eq!(log[0].refs, vec!["HEAD -> main", "origin/main", "tag: v1"]);
        assert_eq!(log[1].parents, Vec::<String>::new());
        assert_eq!(log[1].refs, Vec::<String>::new());
        assert_eq!(log[1].subject, "root commit");
    }

    #[test]
    fn branches_parse_kinds_head_and_track() {
        let raw = format!(
            "refs/heads/main{F}main{F}abc123{F}*{F}origin/main{F}[ahead 2, behind 1]{F}1721000000{F}subj\n\
             refs/remotes/origin/dev{F}origin/dev{F}def456{F} {F}{F}{F}1720000000{F}other\n\
             refs/remotes/origin/HEAD{F}origin{F}abc{F} {F}{F}{F}0{F}x\n\
             refs/tags/v1{F}v1{F}fff{F} {F}{F}{F}0{F}tagged"
        );
        let b = parse_branches(&raw);
        assert_eq!(b.len(), 3); // origin/HEAD dropped
        assert!(b[0].head);
        assert_eq!((b[0].ahead, b[0].behind), (2, 1));
        assert_eq!(b[1].kind, "remote");
        assert_eq!(b[2].kind, "tag");
    }

    #[test]
    fn status_v2_splits_areas_and_conflicts() {
        let raw = "1 M. N... 100644 100644 100644 h1 h2 staged.rs\0\
                   1 .M N... 100644 100644 100644 h1 h2 unstaged.rs\0\
                   1 MM N... 100644 100644 100644 h1 h2 both.rs\0\
                   u UU N... 100644 100644 100644 100644 h1 h2 h3 conflicted.rs\0\
                   ? new.txt\0";
        let s = parse_status(raw);
        let areas: Vec<(&str, &str)> = s.iter().map(|e| (e.path.as_str(), e.area.as_str())).collect();
        assert_eq!(
            areas,
            vec![
                ("staged.rs", "staged"),
                ("unstaged.rs", "unstaged"),
                ("both.rs", "staged"),
                ("both.rs", "unstaged"),
                ("conflicted.rs", "conflict"),
                ("new.txt", "untracked"),
            ]
        );
    }

    #[test]
    fn status_v2_strips_trailing_slash_from_untracked_dirs() {
        let raw = "? .codegraph/\0? dir/file.txt\0";
        let s = parse_status(raw);
        assert_eq!(s[0].path, ".codegraph");
        assert_eq!(s[1].path, "dir/file.txt");
    }

    #[test]
    fn numstat_handles_binary() {
        let s = parse_numstat("3\t1\tsrc/a.rs\n-\t-\tlogo.png\n");
        assert_eq!(s[0].added, 3);
        assert!(s[1].binary);
    }

    #[test]
    fn commit_file_diff_uses_first_parent_for_merge_commits() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let repo =
            std::env::temp_dir().join(format!("gitmin-merge-diff-{}-{unique}", std::process::id()));
        fs::create_dir_all(&repo).unwrap();
        let path = repo.to_str().unwrap();
        test_git(path, &["init", "-q"]);
        test_git(path, &["config", "user.name", "GitMin Test"]);
        test_git(path, &["config", "user.email", "gitmin@test.invalid"]);
        fs::write(repo.join("file.txt"), "base\n").unwrap();
        test_git(path, &["add", "file.txt"]);
        test_git(path, &["commit", "-qm", "base"]);
        let main = test_git(path, &["branch", "--show-current"]);
        test_git(path, &["checkout", "-qb", "feature"]);
        fs::write(repo.join("file.txt"), "base\nfeature\n").unwrap();
        test_git(path, &["commit", "-qam", "feature"]);
        test_git(path, &["checkout", "-q", &main]);
        fs::write(repo.join("other.txt"), "main\n").unwrap();
        test_git(path, &["add", "other.txt"]);
        test_git(path, &["commit", "-qm", "main"]);
        test_git(path, &["merge", "--no-ff", "feature", "-m", "merge"]);
        let merge = test_git(path, &["rev-parse", "HEAD"]);

        let patch = tauri::async_runtime::block_on(diff_file(
            path.to_string(),
            "commit".to_string(),
            Some(merge),
            "file.txt".to_string(),
        ))
        .unwrap();
        fs::remove_dir_all(&repo).unwrap();

        assert!(
            patch.contains("+feature"),
            "merge commit file diff was empty: {patch:?}"
        );
    }

    #[test]
    fn remote_urls_normalize_and_build() {
        assert_eq!(web_base_url("git@github.com:min/git_min.git"), "https://github.com/min/git_min");
        assert_eq!(web_base_url("ssh://git@gitlab.com/g/p.git"), "https://gitlab.com/g/p");
        assert_eq!(web_base_url("https://github.com/min/git_min.git"), "https://github.com/min/git_min");
        assert_eq!(
            build_web_url("git@github.com:m/r.git", "pr", "feat/x"),
            "https://github.com/m/r/compare/feat/x?expand=1"
        );
        assert!(build_web_url("git@gitlab.com:m/r.git", "commit", "abc").contains("/-/commit/abc"));
    }

    #[test]
    fn stash_list_parses() {
        let raw = format!("stash@{{0}}{F}1721000000{F}WIP on main: abc feat\nstash@{{1}}{F}1720000000{F}custom message");
        let s = parse_stashes(&raw);
        assert_eq!(s.len(), 2);
        assert_eq!(s[0].id, "stash@{0}");
        assert_eq!(s[1].message, "custom message");
    }

    #[test]
    fn blame_porcelain_parses() {
        let raw = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 2\n\
                   author Min\n\
                   author-time 1721000000\n\
                   filename x.rs\n\
                   \tfn main() {\n\
                   aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 2 2\n\
                   \t}\n\
                   bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 3 3 1\n\
                   author Codex\n\
                   author-time 1720000000\n\
                   filename x.rs\n\
                   \t// done\n";
        let b = parse_blame(raw);
        assert_eq!(b.len(), 3);
        assert_eq!(b[0].author, "Min");
        assert_eq!(b[0].hash, "aaaaaaa");
        assert_eq!(b[1].author, "Min"); // group carries author forward
        assert_eq!(b[2].author, "Codex");
        assert_eq!(b[2].line, "// done");
    }

    #[test]
    fn track_field_parses() {
        assert_eq!(parse_track("[ahead 3, behind 2]"), (3, 2));
        assert_eq!(parse_track("[gone]"), (0, 0));
        assert_eq!(parse_track(""), (0, 0));
    }

    #[test]
    fn log_args_page_and_scope_history_safely() {
        let all = log_graph_args(500, 1000, None);
        assert!(all.contains(&"--all".to_string()));
        assert!(all.contains(&"--max-count=500".to_string()));
        assert!(all.contains(&"--skip=1000".to_string()));

        let scoped = log_graph_args(500, 0, Some("feature/ui".into()));
        assert!(!scoped.contains(&"--all".to_string()));
        assert_eq!(&scoped[scoped.len() - 2..], &["feature/ui".to_string(), "--".to_string()]);
    }

    #[test]
    fn remote_checkout_and_first_push_args_are_explicit() {
        assert_eq!(
            checkout_tracking_args("origin/feature/ui", "feature/ui"),
            vec!["checkout", "--track", "-b", "feature/ui", "origin/feature/ui"]
        );
        assert_eq!(
            push_args("upstream", "feature/ui", true),
            vec!["push", "--set-upstream", "upstream", "feature/ui"]
        );
        assert_eq!(
            push_args("upstream", "feature/ui", false),
            vec!["push", "upstream", "feature/ui"]
        );
        assert_eq!(
            delete_remote_branch_args("origin", "feature/ui"),
            vec!["push", "origin", "--delete", "feature/ui"]
        );
    }
}

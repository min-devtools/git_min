use std::path::Path;
use std::process::{Command, Stdio};

struct EditorInvocation {
    programs: Vec<&'static str>,
    args: Vec<String>,
}

fn path_with_position(path: &str, line: u32, col: Option<u32>) -> String {
    col.map_or_else(
        || format!("{path}:{line}"),
        |col| format!("{path}:{line}:{col}"),
    )
}

fn editor_invocation(
    editor: &str,
    path: &str,
    line: u32,
    col: Option<u32>,
) -> Result<EditorInvocation, String> {
    let location = path_with_position(path, line, col);
    match editor {
        "vscode" => Ok(EditorInvocation {
            programs: vec![
                "/usr/local/bin/code",
                "/opt/homebrew/bin/code",
                "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
                "code",
            ],
            args: vec!["-g".into(), location],
        }),
        "cursor" => Ok(EditorInvocation {
            programs: vec![
                "/usr/local/bin/cursor",
                "/opt/homebrew/bin/cursor",
                "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
                "cursor",
            ],
            args: vec!["-g".into(), location],
        }),
        "zed" => Ok(EditorInvocation {
            programs: vec![
                "/usr/local/bin/zed",
                "/opt/homebrew/bin/zed",
                "/Applications/Zed.app/Contents/MacOS/cli",
                "zed",
            ],
            args: vec![location],
        }),
        "idea" => Ok(EditorInvocation {
            programs: vec![
                "/usr/local/bin/idea",
                "/opt/homebrew/bin/idea",
                "/Applications/IntelliJ IDEA.app/Contents/MacOS/idea",
                "/Applications/WebStorm.app/Contents/MacOS/webstorm",
                "/Applications/GoLand.app/Contents/MacOS/goland",
                "/Applications/RustRover.app/Contents/MacOS/rustrover",
                "/Applications/PyCharm.app/Contents/MacOS/pycharm",
                "/Applications/PhpStorm.app/Contents/MacOS/phpstorm",
                "/Applications/Android Studio.app/Contents/MacOS/studio",
                "idea",
            ],
            args: vec!["--line".into(), line.to_string(), path.into()],
        }),
        _ => Err(format!("unsupported editor: {editor}")),
    }
}

pub fn open_editor(editor: &str, path: &str, line: u32, col: Option<u32>) -> Result<(), String> {
    if line == 0 {
        return Err("line must be greater than zero".into());
    }
    let path = Path::new(path);
    if !path.is_absolute() {
        return Err("source path is not absolute".into());
    }
    if !path.is_file() {
        return Err(format!("source file does not exist: {}", path.display()));
    }
    let path = path.to_string_lossy();
    let invocation = editor_invocation(editor, &path, line, col)?;
    let mut last_error = None;
    for program in invocation.programs {
        if program.contains('/') && !Path::new(program).is_file() {
            continue;
        }
        match Command::new(program)
            .args(&invocation.args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(_) => return Ok(()),
            Err(error) => last_error = Some(error.to_string()),
        }
    }
    Err(last_error.unwrap_or_else(|| format!("{editor} CLI was not found")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vscode_launch_uses_goto_location() {
        let invocation =
            editor_invocation("vscode", "/Users/dev/project/src/main.ts", 3, Some(7)).unwrap();
        assert_eq!(
            invocation.args,
            vec!["-g", "/Users/dev/project/src/main.ts:3:7"]
        );
    }

    #[test]
    fn cursor_and_zed_keep_the_requested_location() {
        assert_eq!(
            editor_invocation("cursor", "/tmp/main.ts", 5, None)
                .unwrap()
                .args,
            vec!["-g", "/tmp/main.ts:5"]
        );
        assert_eq!(
            editor_invocation("zed", "/tmp/main.rs", 8, None)
                .unwrap()
                .args,
            vec!["/tmp/main.rs:8"]
        );
    }

    #[test]
    fn jetbrains_receives_line_separately_from_the_path() {
        assert_eq!(
            editor_invocation("idea", "/tmp/Main.java", 11, None)
                .unwrap()
                .args,
            vec!["--line", "11", "/tmp/Main.java"]
        );
    }

    #[test]
    fn rejects_unknown_editors() {
        assert!(editor_invocation("shell", "/tmp/main.ts", 1, None).is_err());
    }
}

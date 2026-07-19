import { splitPath } from "../lib/gitUi";

/** Path rendered as dimmed dir + filename: the dir truncates first so the
 *  filename survives, and leading dots render in order (no rtl trick). */
export function FilePath({ path, baseOnly = false }: { path: string; baseOnly?: boolean }) {
  const { dir, base } = splitPath(path);
  return (
    <span className="change-path">
      {!baseOnly && dir && <span className="change-dir">{dir}</span>}
      <span className="change-base">{base}</span>
    </span>
  );
}

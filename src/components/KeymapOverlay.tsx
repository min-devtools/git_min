import { useApp } from "../store";

const SECTIONS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Navigate",
    rows: [
      ["j / k", "Move selection down / up"],
      ["h / l", "Focus previous / next panel"],
      ["g / G", "Jump to top / bottom (Home / End always work)"],
      ["Enter", "Open (checkout branch · open diff)"],
      ["Esc", "Back / close detail"],
    ],
  },
  {
    title: "Work",
    rows: [
      ["a / Space", "Stage ⇄ unstage file"],
      ["A", "Stage all ⇄ unstage all"],
      ["d", "Delete branch (local / remote) / discard file"],
      ["D", "Discard all working-tree changes"],
      ["g", "AI commit message (in Changes · draft acts as prefix)"],
      ["C", "Copy commit to cherry-pick clipboard"],
      ["V", "Paste copied commits onto current branch"],
      ["n", "New branch"],
      ["c / b", "Checkout branch (picker · creates if missing)"],
      ["m", "Merge selected branch into current"],
      ["S", "Stash changes"],
    ],
  },
  {
    title: "Sync",
    rows: [
      ["f", "Fetch"],
      ["p", "Pull"],
      ["P", "Push"],
      ["o", "Open PR / commit on remote"],
      ["y", "Copy hash / branch / path"],
    ],
  },
  {
    title: "App",
    rows: [
      ["⌘K", "Command palette"],
      ["⌘N", "Add repository (Welcome)"],
      ["⌘O", "Open repository / folder"],
      ["⌘↵", "Commit (in message box)"],
      ["⌘B / ⌘R", "Toggle panels"],
      ["⌘F", "Search commits · filter repos on Welcome"],
      ["⌘1…9 / ⌘W", "Switch / close tab"],
      ["?", "This overlay"],
    ],
  },
];

export function KeymapOverlay() {
  const open = useApp((s) => s.keymapOpen);
  const setOpen = useApp((s) => s.setKeymapOpen);
  if (!open) return null;
  return (
    <div
      className="command keymap-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="palette keymap-panel" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="keymap-head">
          <strong>Keyboard shortcuts</strong>
          <span className="muted">lazygit-style · toggle in Settings · Esc closes</span>
        </div>
        <div className="keymap-grid">
          {SECTIONS.map((s) => (
            <div key={s.title} className="keymap-section">
              <div className="group-title"><span>{s.title}</span><span /></div>
              {s.rows.map(([k, label]) => (
                <div key={k} className="shortcut-row">
                  <span>{label}</span>
                  <span className="kbd">{k}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

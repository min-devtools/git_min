import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Icon } from "../../ui/Icon";
import { ToolButton } from "../../ui/ToolButton";
import { useApp } from "../../store";
import { useSystemFonts } from "../../lib/queries";
import { THEMES, themeBase } from "../../lib/themes";
import { FONT_SIZE_STEP } from "../../lib/fontScale";
import { browserOptions, detectDesktopPlatform } from "../../lib/browserPreference";
import { openExternalUrl } from "../../lib/externalLinks";
import { EDITOR_LABELS, loadEditorApp, saveEditorApp, type EditorApp } from "../../lib/editor";

export function SettingsView({ active }: { active: boolean }) {
  const {
    theme, setTheme, compact, toggleCompact, vimKeys, toggleVimKeys, setKeymapOpen,
    uiFontSize, setUiFontSize, uiFont, setUiFont, editorFont, setEditorFont, showToast,
    externalBrowser, setExternalBrowser,
    aiProvider, setAiProvider,
  } = useApp(useShallow((s) => ({
    aiProvider: s.aiProvider, setAiProvider: s.setAiProvider,
    theme: s.theme, setTheme: s.setTheme, compact: s.compact, toggleCompact: s.toggleCompact,
    vimKeys: s.vimKeys, toggleVimKeys: s.toggleVimKeys, setKeymapOpen: s.setKeymapOpen,
    uiFontSize: s.uiFontSize, setUiFontSize: s.setUiFontSize,
    uiFont: s.uiFont, setUiFont: s.setUiFont, editorFont: s.editorFont, setEditorFont: s.setEditorFont,
    externalBrowser: s.externalBrowser, setExternalBrowser: s.setExternalBrowser,
    showToast: s.showToast,
  })));
  const fonts = useSystemFonts();
  const fontList = fonts.data ?? [];
  const browsers = browserOptions(detectDesktopPlatform());
  const [editorApp, setEditorApp] = useState<EditorApp>(loadEditorApp);
  const openLink = (url: string) => {
    void openExternalUrl(url).catch((err) => showToast("Open link failed", String(err), "err"));
  };

  return (
    <section className={`content settings-view ${active ? "active" : ""}`}>
      <div className="settings-shell">
        <div className="settings-header">
          <h2>Settings</h2>
          <p style={{ margin: 0, color: "var(--text-3)", fontSize: "0.9231rem" }}>Appearance, fonts and keyboard shortcuts for this workspace.</p>
        </div>

        <section className="settings-card">
          <h3>Appearance</h3>
          <div className="settings-row">
            <span className="settings-icon"><Icon name={themeBase(theme) === "dark" ? "moon" : "sun"} size={15} /></span>
            <div className="settings-copy"><strong>Theme</strong><span>Palette applies across the workspace, graph rails and diff views.</span></div>
            <div className="settings-control">
              <select className="settings-select" value={theme} onChange={(event) => setTheme(event.target.value)}><optgroup label="Dark">{THEMES.filter((item) => item.base === "dark").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup><optgroup label="Light">{THEMES.filter((item) => item.base === "light").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup></select>
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-icon"><Icon name="braces" size={15} /></span>
            <div className="settings-copy"><strong>Interface font size</strong><span>Scales all interface text in 0.5px steps. Current: {uiFontSize}px.</span></div>
            <div className="settings-control" style={{ gap: 6 }}>
              <ToolButton iconOnly title="Decrease interface font (⌘−)" onClick={() => setUiFontSize(uiFontSize - FONT_SIZE_STEP)}>−</ToolButton>
              <ToolButton onClick={() => setUiFontSize(0)}>{uiFontSize}px</ToolButton>
              <ToolButton iconOnly title="Increase interface font (⌘+)" onClick={() => setUiFontSize(uiFontSize + FONT_SIZE_STEP)}>+</ToolButton>
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-icon"><Icon name="braces" size={15} /></span>
            <div className="settings-copy"><strong>Interface font family</strong><span>Applied across the workspace and saved on this device.</span></div>
            <div className="settings-control"><select className="settings-select" value={uiFont} style={uiFont ? { fontFamily: `"${uiFont}"` } : undefined} onChange={(event) => setUiFont(event.target.value)}><option value="">Design default</option>{fontList.map((font) => <option key={font} value={font} style={{ fontFamily: `"${font}"` }}>{font}</option>)}</select></div>
          </div>
          <div className="settings-row">
            <span className="settings-icon"><Icon name="code" size={15} /></span>
            <div className="settings-copy"><strong>Code font family</strong><span>Applied to diffs, hashes and commit messages.</span></div>
            <div className="settings-control"><select className="settings-select" value={editorFont} style={editorFont ? { fontFamily: `"${editorFont}"` } : undefined} onChange={(event) => setEditorFont(event.target.value)}><option value="">Design default</option>{fontList.map((font) => <option key={font} value={font} style={{ fontFamily: `"${font}"` }}>{font}</option>)}</select></div>
          </div>
          <div className="settings-row">
            <span className="settings-icon"><Icon name="rows" size={15} /></span>
            <div className="settings-copy"><strong>Compact density</strong><span>Tighter graph rows and narrower side panels.</span></div>
            <div className="settings-control"><label className="switch"><input type="checkbox" checked={compact} onChange={toggleCompact} /><span /></label></div>
          </div>
          <div className="settings-row">
            <span className="settings-icon"><Icon name="keyboard" size={15} /></span>
            <div className="settings-copy"><strong>Vim keys</strong><span>lazygit-style single-key bindings (j/k, p pull, P push, m merge…). Press ? for the full map.</span></div>
            <div className="settings-control"><label className="switch"><input type="checkbox" checked={vimKeys} onChange={() => { toggleVimKeys(); showToast("Vim keys", vimKeys ? "Disabled." : "Enabled — press ? for the keymap."); }} /><span /></label></div>
          </div>
        </section>

        <section className="settings-card">
          <h3>External apps</h3>
          <div className="settings-row">
            <span className="settings-icon"><Icon name="code" size={15} /></span>
            <div className="settings-copy"><strong>Open files in</strong><span>Used by Open file in diff and blame views. The file opens at the first changed line when available.</span></div>
            <div className="settings-control">
              <select
                className="settings-select"
                value={editorApp}
                onChange={(event) => {
                  const app = event.target.value as EditorApp;
                  saveEditorApp(app);
                  setEditorApp(app);
                }}
              >
                {Object.entries(EDITOR_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-icon"><Icon name="globe" size={15} /></span>
            <div className="settings-copy"><strong>Browser</strong><span>Used for remote commits, branches, pull requests and other external links.</span></div>
            <div className="settings-control">
              <select className="settings-select" value={externalBrowser} onChange={(event) => setExternalBrowser(event.target.value as typeof externalBrowser)}>
                {browsers.map((browser) => <option key={browser.id} value={browser.id}>{browser.label}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="settings-card">
          <h3>AI commit messages</h3>
          <div className="settings-row">
            <span className="settings-icon"><Icon name="globe" size={15} /></span>
            <div className="settings-copy"><strong>Endpoint</strong><span>Any OpenAI-compatible /chat/completions base URL (OpenAI, OpenRouter, Ollama, llama.cpp).</span></div>
            <div className="settings-control">
              <input
                className="settings-select"
                spellCheck={false}
                placeholder="https://api.openai.com/v1"
                value={aiProvider.endpoint}
                onChange={(e) => setAiProvider({ endpoint: e.target.value.trim() })}
              />
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-icon"><Icon name="key" size={15} /></span>
            <div className="settings-copy"><strong>API key</strong><span>Stored on this device only. Leave empty for keyless local providers.</span></div>
            <div className="settings-control">
              <input
                className="settings-select"
                type="password"
                spellCheck={false}
                placeholder="sk-…"
                value={aiProvider.apiKey}
                onChange={(e) => setAiProvider({ apiKey: e.target.value.trim() })}
              />
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-icon"><Icon name="sparkles" size={15} /></span>
            <div className="settings-copy"><strong>Model</strong><span>Used by the ✨ button in the Changes tab to write a Conventional Commits message from the staged diff.</span></div>
            <div className="settings-control">
              <input
                className="settings-select"
                spellCheck={false}
                placeholder="gpt-4o-mini"
                value={aiProvider.model}
                onChange={(e) => setAiProvider({ model: e.target.value.trim() })}
              />
            </div>
          </div>
        </section>

        <section className="settings-card">
          <h3>Shortcuts</h3>
          <div className="shortcut-grid">
            <div className="shortcut-row"><span>Command palette</span><span className="kbd">⌘K</span></div>
            <div className="shortcut-row"><span>Add repository / scan folder</span><span className="kbd">⌘N</span></div>
            <div className="shortcut-row"><span>Commit (message box)</span><span className="kbd">⌘↵</span></div>
            <div className="shortcut-row"><span>Toggle sidebar</span><span className="kbd">⌘B</span></div>
            <div className="shortcut-row"><span>Search commits · filter repos on Welcome</span><span className="kbd">⌘F</span></div>
            <div className="shortcut-row"><span>Toggle inspector</span><span className="kbd">⌘R</span></div>
            <div className="shortcut-row"><span>Close tab</span><span className="kbd">⌘W</span></div>
            <div className="shortcut-row"><span>Switch tab 1…9</span><span className="kbd">⌘1…9</span></div>
            <div className="shortcut-row"><span>Increase / decrease font</span><span className="kbd">⌘+ / ⌘−</span></div>
            <div className="shortcut-row"><span>Open settings</span><span className="kbd">⌘,</span></div>
            <div className="shortcut-row"><span>Rename selected repository</span><span className="kbd">⌘E</span></div>
            <div className="shortcut-row"><span>Remove selected repository</span><span className="kbd">⌘⌫</span></div>
            <div className="shortcut-row">
              <span>Vim keymap (pull, push, merge, stage…)</span>
              <button type="button" className="kbd" style={{ cursor: "pointer" }} onClick={() => setKeymapOpen(true)}>?</button>
            </div>
          </div>
        </section>

        <section className="settings-card">
          <h3>Data</h3>
          <div className="settings-row">
            <span className="settings-icon"><Icon name="database" size={15} /></span>
            <div className="settings-copy"><strong>Repositories</strong><span>Stored in Tauri app-data (git_min.json) — only paths and display names, never file contents. Removing a repo never touches the working tree.</span></div>
            <div className="settings-control" />
          </div>
          <div className="settings-row">
            <span className="settings-icon"><Icon name="check" size={15} /></span>
            <div className="settings-copy"><strong>Safe by default</strong><span>Runs your installed git with your own config, SSH keys and credential helpers. Destructive actions (discard, delete branch, abort merge) always confirm first. Pull is --ff-only.</span></div>
            <div className="settings-control" />
          </div>
        </section>

        <div className="settings-credit">
          <button
            type="button"
            className="settings-github"
            onClick={() => openLink("https://github.com/min-devtools/git_min")}
          >
            <Icon name="github" size={15} /> View on GitHub
          </button>
          <strong>GitMin</strong>
          <button
            type="button"
            className="settings-credit-link"
            onClick={() => openLink("https://www.linkedin.com/in/ngthminh-dev/")}
          >
            Created by @ngthminhdev
          </button>
        </div>
      </div>
    </section>
  );
}

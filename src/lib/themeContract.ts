export interface ThemePalette {
  surface: {
    app: string;
    window: string;
    panel: string;
    raised: string;
    hover: string;
    editor: string;
    overlay: string;
  };
  text: { primary: string; secondary: string; muted: string; onAccent: string };
  border: { default: string; strong: string };
  accent: { primary: string; secondary: string; focus: string };
  status: { success: string; warning: string; danger: string; info: string };
  syntax: {
    key: string;
    string: string;
    number: string;
    boolean: string;
    null: string;
    operator: string;
    punctuation: string;
    type: string;
    function: string;
    property: string;
    variable: string;
    comment: string;
    parameter: string;
    constant: string;
    tag: string;
  };
}

const value = (style: CSSStyleDeclaration, name: string) => style.getPropertyValue(name).trim();

/**
 * Built-in palettes are generated CSS today. This adapter exposes them through
 * stable semantic roles, so a future JSON loader only needs to produce this shape.
 */
export function readBuiltinPalette(style: CSSStyleDeclaration): ThemePalette {
  return {
    surface: {
      app: value(style, "--app-bg"),
      window: value(style, "--window"),
      panel: value(style, "--pane"),
      raised: value(style, "--pane-2"),
      hover: value(style, "--pane-3"),
      editor: value(style, "--editor-bg"),
      overlay: value(style, "--glass"),
    },
    text: {
      primary: value(style, "--text"),
      secondary: value(style, "--text-2"),
      muted: value(style, "--text-3"),
      onAccent: value(style, "--editor-bg"),
    },
    border: { default: value(style, "--line"), strong: value(style, "--line-2") },
    accent: { primary: value(style, "--blue"), secondary: value(style, "--blue-2"), focus: value(style, "--blue") },
    status: { success: value(style, "--green"), warning: value(style, "--orange"), danger: value(style, "--red"), info: value(style, "--blue-2") },
    // Read --syntax-* (tokens.css maps these to --blue/--green/etc by default,
    // but body.light overrides them with contrast-safe colors on its white editor).
    syntax: {
      key: value(style, "--syntax-key") || value(style, "--blue"),
      string: value(style, "--syntax-string") || value(style, "--green"),
      number: value(style, "--syntax-number") || value(style, "--blue-2"),
      boolean: value(style, "--syntax-boolean") || value(style, "--purple"),
      null: value(style, "--syntax-null") || value(style, "--red"),
      operator: value(style, "--syntax-operator") || value(style, "--text-2"),
      punctuation: value(style, "--syntax-punctuation") || value(style, "--text-3"),
      type: value(style, "--syntax-type") || value(style, "--blue-2"),
      function: value(style, "--syntax-function") || value(style, "--blue"),
      property: value(style, "--syntax-property") || value(style, "--orange"),
      variable: value(style, "--syntax-variable") || value(style, "--editor-fg"),
      comment: value(style, "--syntax-comment") || value(style, "--text-3"),
      parameter: value(style, "--syntax-parameter") || value(style, "--text-2"),
      constant: value(style, "--syntax-constant") || value(style, "--purple"),
      tag: value(style, "--syntax-tag") || value(style, "--red"),
    },
  };
}

const APPLIED_VARIABLES = [
  "--surface-app", "--surface-window", "--surface-panel", "--surface-raised", "--surface-hover",
  "--surface-editor", "--surface-overlay", "--text-primary", "--text-secondary", "--text-muted",
  "--text-on-accent", "--border-default", "--border-strong", "--accent-primary", "--accent-secondary",
  "--accent-focus", "--status-success", "--status-warning", "--status-danger", "--status-info",
  "--syntax-key", "--syntax-string", "--syntax-number", "--syntax-boolean", "--syntax-null", "--syntax-operator",
  "--syntax-punctuation", "--syntax-type", "--syntax-function", "--syntax-property", "--syntax-variable",
  "--syntax-comment", "--syntax-parameter", "--syntax-constant", "--syntax-tag", "--accent",
] as const;

export function clearAppliedPalette(style: CSSStyleDeclaration) {
  for (const name of APPLIED_VARIABLES) style.removeProperty(name);
}

export function applyPalette(style: CSSStyleDeclaration, palette: ThemePalette) {
  const variables: Record<string, string> = {
    "--surface-app": palette.surface.app,
    "--surface-window": palette.surface.window,
    "--surface-panel": palette.surface.panel,
    "--surface-raised": palette.surface.raised,
    "--surface-hover": palette.surface.hover,
    "--surface-editor": palette.surface.editor,
    "--surface-overlay": palette.surface.overlay,
    "--text-primary": palette.text.primary,
    "--text-secondary": palette.text.secondary,
    "--text-muted": palette.text.muted,
    "--text-on-accent": palette.text.onAccent,
    "--border-default": palette.border.default,
    "--border-strong": palette.border.strong,
    "--accent-primary": palette.accent.primary,
    "--accent-secondary": palette.accent.secondary,
    "--accent-focus": palette.accent.focus,
    "--status-success": palette.status.success,
    "--status-warning": palette.status.warning,
    "--status-danger": palette.status.danger,
    "--status-info": palette.status.info,
    "--syntax-key": palette.syntax.key,
    "--syntax-string": palette.syntax.string,
    "--syntax-number": palette.syntax.number,
    "--syntax-boolean": palette.syntax.boolean,
    "--syntax-null": palette.syntax.null,
    "--syntax-operator": palette.syntax.operator,
    "--syntax-punctuation": palette.syntax.punctuation,
    "--syntax-type": palette.syntax.type,
    "--syntax-function": palette.syntax.function,
    "--syntax-property": palette.syntax.property,
    "--syntax-variable": palette.syntax.variable,
    "--syntax-comment": palette.syntax.comment,
    "--syntax-parameter": palette.syntax.parameter,
    "--syntax-constant": palette.syntax.constant,
    "--syntax-tag": palette.syntax.tag,
    "--accent": palette.accent.primary,
  };
  for (const [name, color] of Object.entries(variables)) style.setProperty(name, color);
}

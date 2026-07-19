# Diff syntax contrast design

## Goal

Make syntax highlighting in GitMin's Diff and Blame readers immediately legible while preserving the active application theme and the semantic meaning of added and deleted lines.

## Scope

- Change only GitMin's app-local Diff/Blame presentation and its focused regression coverage.
- Keep the existing Tree-sitter parsing and token-role mapping.
- Do not change shared `design-systems` CSS or sibling applications.
- Do not add a new highlighting dependency.

## Visual design

The Diff View will derive a richer editor palette from each theme's existing accent colors:

- keywords and constants use the theme's purple accent;
- types use the orange accent;
- functions use the bright blue accent;
- strings keep the green accent;
- properties use the primary blue accent;
- variables and parameters remain close to the editor foreground so code is not oversaturated;
- comments and punctuation remain subordinate but gain enough contrast to stay readable.

Added and deleted rows retain green/red identity through their marker and inset edge. Their full-row tint becomes quieter so it no longer washes over syntax colors. The same syntax palette applies to inline diff, split diff, and blame content.

## Implementation boundary

Add Diff View-scoped semantic CSS variables in `src/styles/views.css`. Existing `.tok-*` selectors continue consuming `--syntax-*`, so rendering and parsing code do not change. Adjust only the add/delete background mix in the same local CSS region.

## Testing and verification

- Add a focused contract that fails unless the Diff View defines the intended semantic palette and restrained add/delete tints.
- Run the test once before implementation to prove the regression is covered, then after implementation.
- Run `npm run test:highlight`, `npm run test:workspace`, and `npm run build`.
- Render representative Java diff markup against the application CSS and visually inspect it at the default dark theme.

## Non-goals

- Replacing Tree-sitter.
- Changing token classification rules.
- Redesigning the Diff View layout or controls.
- Editing canonical shared theme files.

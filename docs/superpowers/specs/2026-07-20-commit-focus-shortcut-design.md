# Commit Focus Shortcut Design

## Goal

Make the Vim-style `c` shortcut reveal and focus the commit message field. Keep branch checkout on `b`.

## Behavior

- Pressing `c` outside an input opens the right inspector, selects its Changes tab, marks the changes panel focused, and focuses the commit message textarea after it renders.
- Pressing `b` continues to open the existing quick checkout picker.
- Existing shortcut guards remain unchanged: shortcuts require Vim-style keys and do not run while typing or while a dialog, menu, palette, or keymap is open.
- The keyboard shortcut overlay reflects the new bindings.

## Implementation

Give the commit textarea a stable DOM ID scoped by repository tab. In `RepoView`, handle `c` separately from `b`, update inspector state, and focus that ID on the next animation frame. No new shared abstraction or dependency is needed.

## Verification

Add a focused unit test for the shortcut metadata/target helper if practical with the existing test setup. Run the relevant tests and the production build.

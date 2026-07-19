# Commit Column Scroll Design

## Goal

Allow a long commit subject and its ref chips to be read with horizontal scrolling inside the Commit column of the main history view. The Graph, Author, Hash, and When columns must not move.

## Design

- Keep the existing graph table row layout, virtualization, and vertical `graph-scroll` container unchanged.
- Change only `.graph-subject` from clipped content to a horizontal scroll container.
- Keep the commit contents on one line and sized to their intrinsic width so ref chips and the full subject can move horizontally within the column.
- Preserve the fixed-width Author, Hash, and When columns, so their positions remain unchanged while the Commit column scrolls.
- The header stays static; no new state, handlers, dependencies, or custom scroll controls are needed.

## Accessibility And Errors

- Native browser scrolling provides wheel, trackpad, scrollbar, and keyboard behavior without custom event handling.
- Existing row click, keyboard selection, chip click, and context-menu behavior remain unchanged because the scroll region is the existing Commit column element.

## Verification

- Build passes with `npm run build`.
- Existing graph-layout assertions pass with `npm run test:layout`.
- Manual check: horizontally scroll a long Commit cell and confirm only its ref chips and subject move; Graph, Author, Hash, and When remain fixed.

# Nearness v4 design QA

Status: passed — 28 August 2026

## Target and evidence

- Selected visual target: `design/nearness-v4-selected.png`
- Final implementation capture: `design/nearness-v4-implementation.png`
- Desktop viewport: 1440 × 1024
- Responsive checks: 768 × 900 and 390 × 844, with no horizontal overflow

## Visible match

The implementation preserves the selected direction's editorial white canvas, serif-led relationship insight, two-item navigation, coral Add chats action, hand-drawn memory scene, overlapping social worlds, relationship constellation, and direct story entry point. Spacing, hierarchy, palette, image density, and control placement were checked against the selected reference.

## Intentional differences

- The central identity and person names are bound to product data rather than baked into the artwork.
- A small “people in your world” entry point was retained because it is the accessible route to the complete relationship list.
- The static date from the concept was omitted because it did not represent a reliable product state.
- The constellation is generated from real people, closeness and every confirmed social-world membership; people can be selected and the active person receives a visible focus ring.

## Interaction and layout checks

- Add chats opens the import source sheet with WhatsApp first.
- WhatsApp import preview and commit are wired to the desktop bridge.
- Story opens the selected person's evidence-backed relationship drawer.
- My world and Care navigation work.
- At tablet and mobile widths, content reflows without horizontal scrolling or text/image overlap; the atlas remains in the first mobile viewport and primary navigation moves to a bottom bar.
- Browser console check showed no errors in the verified state.

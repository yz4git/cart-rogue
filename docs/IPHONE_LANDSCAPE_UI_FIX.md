# iPhone Landscape UI Fit

This change fixes two presentation regressions in Cart Rogue without changing gameplay, input, enemy counts, or rendering quality.

## Root cause

The legacy Cart Rogue shell combined `height: 100svh` with `min-height: 100vh`. On iPhone Safari in landscape, `100vh` can be taller than the currently visible viewport, so the minimum height wins and the lower part of the game can be clipped behind browser UI.

Turbo Hunt also stacked several rows inside a full-width three-card HUD. On short landscape screens this covered too much of the horizon.

## Fix

- The Cart Rogue shell is pinned to the visible viewport with `position: fixed` and `100dvh` when supported, with `100svh` fallback and `min-height: 0`.
- The stage and WebGL canvas stay bounded by that repaired shell.
- Turbo Hunt HUD width is capped at 650 px on short landscape screens and centered with safe-area spacing.
- Low-priority label/footer rows collapse on short landscape displays while danger/event information remains visible.
- When both a field event and a higher-priority danger row are present, CSS suppresses the lower-priority field-event row to avoid vertical stacking.

## Regression coverage

- Source-level CSS contract test for dynamic viewport sizing and compact HUD rules.
- Real Chrome 844×390 landscape audit checks shell/stage/viewport fill, bottom HUD/control bounds, and Turbo Hunt HUD width/height.

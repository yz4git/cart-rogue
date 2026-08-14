# Cart Rogue Agent Guardrails

These rules apply to all ChatGPT/agent work in this repository.

## Repository scope

- The only writable repository for this project is `yz4git/cart-rogue`.
- `yz4git/voxel-rally` and `yz4git/poly-fighter` are reference-only. Never modify them while working on Cart Rogue.
- Preserve Cart Rogue's own `.openai/hosting.json`. Never copy a Sites project id from another repository.

## GitHub operations

- Prefer the GitHub connector for repository reads and writes, branch inspection, file updates, commits, pull requests, workflow runs, jobs, logs, artifacts, and merges.
- Before a repository write, confirm the target repository and branch and fetch the current target file when replacing an existing file.
- Write only to the intended working branch. Do not silently fall back to `main`.
- Record returned commit SHAs and verify the branch/PR head after meaningful checkpoints.

## Safe development protocol

- Keep the inherited Voxel Rally driving, fixed-step, Canvas fallback, PWA, Pages/Sites build, settings migration, and iPhone Safari support working while the game is converted to Cart Rogue.
- Prefer additive refactors before deleting rally systems. Remove obsolete race-specific code only after replacement systems are tested.
- Do not replace the existing `RallyFixedStepClock` with the simpler Poly Fighter clock; the inherited clock includes cadence and Safari-resume protections that Cart Rogue should retain.
- Do not replace Cart Rogue's settings persistence with Poly Fighter's simpler settings manager. Extend the versioned settings schema instead.

## iPhone / runtime safety

- WebGL initialization failure must retain a user-visible Canvas 3D fallback.
- WebGL context loss or render-loop failure must stop the failed renderer safely and expose a recoverable fallback path instead of leaving a black screen.
- Pointer controls must release on `pointerup`, `pointercancel`, lost pointer capture, visibility changes, orientation changes, pause, and teardown where applicable.
- Audio must be resumed only from user interaction and failures must not crash gameplay.
- Respect safe-area insets, landscape layout, `touch-action: none`, context-menu suppression, and no-scroll/no-zoom gameplay behavior.

## Validation

- Every meaningful checkpoint should run build, gameplay/rules tests, PWA/startup-safety tests, rendered HTML checks, and lint.
- Visual changes are not considered validated by generated concept images. Use the real production game runtime.
- Maintain a real Chrome/WebGL audit that starts the production build, verifies a WebGL canvas, captures at least one deterministic gameplay frame, and uploads the screenshot artifact.
- Never claim a workflow, screenshot, deployment, or test passed unless the corresponding GitHub/tool result confirms it.

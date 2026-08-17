# Turbo Hunt — Threat / Dodge / Predator design

## Goal

Turbo Hunt remains an attack-first game. Defensive beats exist to create tension and a stronger release, not to turn the game into an avoidance course.

Target rhythm:

`ATTACK / CHAIN / SMASH (70–80%) → SHORT THREAT (20–30%) → EVADE → IMMEDIATE COUNTER`

## Phase84 — Threat & Dodge 1.0

- Charge threats come only from existing striker/Titan behavior.
- The warning must identify the attacker and its charge lane before or during the rush.
- Dodge scoring is based on the minimum 60 Hz relative-motion clearance, not on a button press.
- Contact is never a dodge.
- A narrow clean miss is PERFECT DODGE; a wider clean miss is DODGE.
- PERFECT DODGE gives only a modest GAS/Turbo-recharge reward and a short counter window.
- No extra enemy population, textures, instanceColor or unbounded particles.

## Phase85 — Pursuit Events

Three short defensive field events rotate outside the boss fight:

- **PURSUIT** — two existing non-boss enemies are temporarily promoted to pursuers. Survive the timer while moving.
- **DANGER ZONE** — a clearly telegraphed ground ring marks a future impact. Leave it before detonation.
- **BREAKOUT** — four existing enemies form a close ring. Escape the radius before the timer ends.

Rules:

- Existing enemy pool only; no `new CartEnemy`, no population growth.
- Normal pursuit events stop once the Titan is active so they never stack with boss predator pressure.
- Event duration is 5.2–6.4 seconds with at least 17.5 seconds cooldown; designed duty cycle stays below 30%.
- Failure is soft: small GAS loss and bounded speed reduction. No instant death, hard reset or lockout.
- Success points the player back toward offense with small GAS/Turbo recharge and a counter-oriented reward message.

## Phase86 — RAM TITAN Predator 3.0

Only the FURY stage can enter Predator mode.

Cycle:

`HUNT → SURVIVE 7.5s → OVERHEAT / COUNTER 3.2s → HUNT`

SURVIVE:

- Titan movement pressure is bounded at a known maximum target speed.
- Charge cooldown is more aggressive but bounded.
- The Fury weak-point damage bonus is closed during the survive burst, but normal damage is not made impossible.
- PERFECT DODGE shortens the remaining survive timer slightly.

COUNTER:

- Titan charge is cancelled.
- Titan speed is temporarily reduced.
- Core is exposed.
- Player gets modest GAS/Turbo recharge.
- After the window, normal Fury tuning is restored; no multiplier may accumulate frame over frame.

## Presentation and performance

- HUD shows only one highest-priority danger line at a time:
  `Titan Predator > Pursuit Event > Perfect Dodge > Direct Charge`.
- Phase84/85/86 visuals use a few fixed meshes with additive/basic materials.
- No textures, no `instanceColor`, no new dynamic shadows.
- Battery 2.0 remains the renderer authority.
- Phase80 fixed-material ground and its Y-layer contract remain unchanged.

## Acceptance gates

- Existing Turbo Hunt, Battery and Environment regressions stay green.
- Dedicated Phase84–86 regression covers dodge geometry, bounded pursuit duty cycle, fixed enemy pool and live Fury Predator transition.
- Full Test / Lint / Verify stay green.
- Real production Chrome/WebGL diagnostics require Phase84 threat, Phase85 danger and Phase86 Predator/Counter visual roots.
- Audit frame must be visually inspected for Phase80 ground/background black-polygon regressions before merge.

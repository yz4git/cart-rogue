# Forced Dodge / Escape / Readability — Phases 93–95

## Goal

Turn the existing raid hazards from visible decoration into a readable driving decision: if the player keeps the same line after LOCK, the attack should intersect that trajectory; changing line, braking, or Turbo movement should create the escape.

## Phase 93 — Forced Dodge Trajectory 2.0

- FIELD raid telegraphs may track as before.
- At LOCK, the current speed, heading, lateral velocity, throttle/brake and steering state are sampled.
- The no-new-evasion impact point is predicted for the remaining telegraph time.
- The same hazard shape is re-locked on that trajectory rather than spawning an additional hazard.
- The four-slot Phase88 pool remains authoritative.
- DONUT and CONE shapes receive shape-specific offsets so the predicted path crosses the dangerous region rather than an incidental safe center.
- The locked position never keeps following the player after this correction.

Acceptance: passive straight driving must be punishable; a deliberate line change after LOCK must remain possible.

## Phase 94 — Escape Rhythm Director 2.0

- First explicit escape sequence begins about 6.2 seconds into a run.
- Further escape sequences return after about 15.5 seconds of recovery.
- PURSUIT and BREAKOUT alternate.
- Existing enemies are reused; no new enemy pool is allocated.
- The opening 1.6 seconds clears FIELD AOE so the player can first recognize the chase, then raid hazards may return for mixed pressure.
- Boss encounters remain controlled by the Titan raid/predator systems and suspend this field director.

Acceptance: an ordinary first 10 seconds visibly contains an ESCAPE sequence.

## Phase 95 — Combat Readability Pass

- Raid/escape danger has visual priority over FLOW COMBO, TURBO RAM and generic reward banners.
- During imminent AOE those reward presentations shrink and fade instead of covering the hazard.
- Escape has a compact persistent warning badge independent of the single primary top-HUD danger line.
- The existing compact iPhone landscape HUD height is not increased.

## Safety / performance contract

- Phase80 repaired ground remains untouched.
- No texture loader, per-instance color pipeline, new InstancedMesh allocation, or unbounded enemy/hazard creation is introduced.
- Battery 2.0 render/pause behavior remains authoritative.
- Automated WebGL playtest compares passive straight driving against reactive steering and verifies escape visibility.

# Turbo Hunt Raid Hazards — Phases 88–90

## Goal

Make dodge and escape decisions readable from the ground itself. Enemy speed alone is not enough on a small iPhone landscape display, so hazards use explicit raid-style telegraphs with high-saturation warning colors.

## Non-negotiable rules

- Do not modify the repaired Phase80 ground meshes.
- Hazard geometry lives on a dedicated visual layer above the ground (`y >= 0.05`).
- No `instanceColor`, `setColorAt`, textures, dynamic shadows, or unbounded allocations.
- Fixed pool of at most four simultaneous hazard slots.
- Fixed shared materials: warning red, imminent amber, fire white/red.
- A hazard may track briefly, but it must lock before firing.
- The lock-to-fire window must be long enough to read on iPhone landscape.
- Normal field hazards use one large shape at a time; boss multi-attacks are sequential so a meaningful safe area remains.
- Phase86 COUNTER windows cancel Titan hazards and remain safe attack windows.
- Hazard failure is a recoverable speed/GAS penalty, not an instant death.

## Phase 88 — Raid Hazard Telegraphs

Common hazard engine with five shapes:

- LINE — long rectangular strike lane.
- CIRCLE — radial blast area.
- CROSS — two perpendicular strike lanes.
- CONE — directional fan.
- DONUT — ring hazard with an inner safe zone.

Lifecycle:

`DELAY -> TRACKING -> LOCKED -> FIRED -> FREE`

Visual language:

- Tracking: saturated crimson.
- Locked: crimson + fast pulse.
- Imminent: warning amber.
- Fire: white/red flash.

The player gets a raid Perfect Dodge when they were inside a locked hazard and leave it within the final 0.28 seconds before activation.

## Phase 89 — Hazard Combat Director

Normal Turbo Hunt schedules a clear field hazard roughly every 4.8 seconds, beginning early in the run. Rotation:

`LINE -> CIRCLE -> CROSS -> CONE -> DONUT`

The director intentionally overlaps with vehicle pressure systems, but it does not run while the boss is active. Each pattern is sized to force a steering decision without covering most of the giant field.

## Phase 90 — RAM TITAN Raid Boss 4.0

Titan gains readable raid patterns:

- LINE CHARGE
- TITAN SLAM
- CROSS CRUSH
- HUNTING BLAST (three sequential circles)
- FURY RAID (time-offset line/circle/donut sequence)

FURY schedules patterns faster, but multi-hazards use delays instead of simultaneous full-field coverage. During Phase86 COUNTER, all Titan hazards are cancelled and no new raid attack can start.

## Acceptance criteria

- A hazard is visible as a large saturated ground area before it fires.
- Tracking always ends before activation.
- `CART_RAID_HAZARD_MAX_ACTIVE <= 4`.
- Field hazards start within the first few seconds and repeat frequently.
- Titan raid attacks are suppressed during COUNTER.
- Fixed enemy pool and 60 Hz vehicle control remain unchanged.
- Phase80 keeps `instanceColor = 0` and its repaired surface heights.
- Production WebGL audit still captures a valid frame and iPhone landscape fit remains green.

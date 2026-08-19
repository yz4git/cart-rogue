# Gameplay Phase 106 — Encounter Director 2.0

## Goal

Turn the independent Turbo Hunt pressure systems into one readable combat rhythm without increasing the fixed enemy or RAID pools.

Phase105 made individual enemies smarter. Phase106 owns the higher-level question: **when should the run pressure, demand a dodge, release a counter window, chase, or give recovery space?**

## Beat model

The first implementation uses seven deterministic beats:

1. `OPENING` — readable first seconds; no FIELD RAID and no immediate charge spam.
2. `PRESSURE` — normal hunting pressure and role-based Phase105 intelligence.
3. `DODGE` — the highest non-boss danger beat; FIELD RAID is allowed.
4. `COUNTER` — guaranteed attack opportunity after a clean defensive result or encounter clear.
5. `CHASE` — Pursuit/Escape owns attention; FIELD RAID is suppressed so two movement tests do not stack.
6. `RECOVERY` — short mercy window after a hit/failure or periodically at very low GAS/LIFE.
7. `BOSS` — RAM TITAN owns the encounter; FIELD RAID is suppressed while Titan-specific systems remain authoritative.

Timed baseline rhythm:

`OPENING -> PRESSURE -> DODGE -> COUNTER -> PRESSURE ...`

Live gameplay can preempt that timeline:

- RAID hit / Pursuit failure -> `RECOVERY`
- Perfect Dodge / Pursuit clear / Field Event clear -> `COUNTER`
- Pursuit or Escape active -> `CHASE`
- Titan active -> `BOSS`
- Titan release -> `RECOVERY`
- low GAS/LIFE -> bounded `RECOVERY` with an 8s lockout so mercy cannot become permanent immunity

## Difficulty contract

Normal keeps longer counter/recovery windows and a lower intended commit cap.

Hard keeps smarter Phase105 reads and higher pressure intensity, but still receives explicit nonzero counter/recovery windows. Hard difficulty should come from better reads and shorter openings, not unavoidable simultaneous systems.

## Safety / performance

- enemy pool remains fixed at 19 Turbo Hunt slots
- RAID pool remains fixed at four slots
- no new Three.js meshes, shaders, post-processing, particles, or render-loop allocations
- state is stored per session in a `WeakMap`
- Phase106 is imported after Phase105 in `CartGameMenuRuntime` and does not rewrite the historical `CART_ROGUE_RUNTIME_PHASE_ORDER`

## First implementation slice

The initial Phase106 runtime already enforces the most important fairness rule: `OPENING`, `COUNTER`, `CHASE`, and `RECOVERY` suppress FIELD RAID overlap, while safe beats cancel active normal-enemy charge and impose a minimum charge cooldown. It also publishes a lightweight snapshot event for later HUD/debug/telemetry use.

## Next slice

After this core is stable in CI/WebGL audit, wire explicit start gates into Threat Pressure, Hazard Combat Director and Escape Rhythm so their internal clocks request permission from Phase106 before beginning a new encounter beat. This will make the Director authoritative at scheduling time rather than correcting overlap after it is created.

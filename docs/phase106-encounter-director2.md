# Gameplay Phase 106 — Encounter Director 2.0

## Goal

Turn the independent Turbo Hunt pressure systems into one readable combat rhythm without increasing the fixed enemy or RAID pools.

Phase105 made individual enemies smarter. Phase106 owns the higher-level question: **when should the run pressure, demand a dodge, release a counter window, chase, or give recovery space?**

## Beat model

Phase106 uses seven deterministic beats:

1. `OPENING` — readable first seconds; no FIELD RAID and no immediate charge spam.
2. `PRESSURE` — enemy-wave pressure and role-based Phase105 intelligence; new FIELD RAID is gated off.
3. `DODGE` — movement/evasion test; new FIELD RAID is allowed while new Threat Pressure waves are gated off.
4. `COUNTER` — guaranteed attack opportunity after a clean defensive result or encounter clear.
5. `CHASE` — Pursuit/Escape owns attention; FIELD RAID is suppressed so two movement tests do not stack.
6. `RECOVERY` — short mercy window after a hit/failure or periodically at very low GAS/LIFE.
7. `BOSS` — RAM TITAN owns the encounter; FIELD RAID is suppressed while Titan-specific systems remain authoritative.

Timed baseline rhythm:

`OPENING -> PRESSURE -> DODGE -> COUNTER -> PRESSURE ...`

Live gameplay can preempt that timeline after the opening teaching cycle:

- RAID hit / Pursuit failure -> `RECOVERY`
- Perfect Dodge / Pursuit clear / Field Event clear -> `COUNTER`
- Pursuit or Escape active -> `CHASE`
- Titan active -> `BOSS`
- Titan release -> `RECOVERY`
- low GAS/LIFE -> bounded `RECOVERY` with an 8s lockout so mercy cannot become permanent immunity

## Authoritative scheduling gates

`CartEncounterDirectorGate` keeps old systems compatible when Phase106 is absent: its default policy is permissive. When Phase106 is installed, it publishes the current beat policy before the historical wrapper chain runs.

- Phase87 Threat Pressure may start a new pressure wave only while the current beat is `PRESSURE`.
- Phase89 Hazard Combat Director may start a new FIELD RAID only while the current beat is `DODGE`.
- Phase85 Pursuit and Phase94 Escape may not start until Phase106 has reached its first `DODGE`; after that, new chase events are admitted from a later `PRESSURE` beat.
- This guarantees that a new run teaches one complete `OPENING -> PRESSURE -> DODGE -> COUNTER` cycle before chase events are allowed to interrupt the baseline rhythm.
- Once Pursuit/Escape is active, Phase106 preempts into `CHASE` and removes FIELD RAID overlap.
- Active legacy attacks are allowed to resolve where safe; `OPENING`, `COUNTER`, `CHASE`, `RECOVERY`, and `BOSS` still cancel FIELD RAID and suppress fresh normal-enemy charge.

This makes the Director authoritative at **start time**, not only a cleanup layer after overlapping attacks have already appeared.

## Difficulty contract

Normal keeps longer counter/recovery windows and a lower intended commit cap.

Hard keeps smarter Phase105 reads and higher pressure intensity, but still receives explicit nonzero counter/recovery windows. Hard difficulty should come from better reads and shorter openings, not unavoidable simultaneous systems.

## Safety / performance

- enemy pool remains fixed at 19 Turbo Hunt slots
- RAID pool remains fixed at four slots
- no new Three.js meshes, shaders, post-processing, particles, or render-loop allocations
- state and scheduling policy are stored per session in `WeakMap`/`WeakSet` state
- Phase106 is imported after Phase105 in `CartGameMenuRuntime` and does not rewrite the historical `CART_ROGUE_RUNTIME_PHASE_ORDER`

## Implemented acceptance contract

- readable `OPENING -> PRESSURE -> DODGE -> COUNTER` baseline rhythm
- first full baseline cycle is protected from new Pursuit/Escape starts
- actual safe windows, not HUD-only labels
- gated `CHASE`, event-driven `RECOVERY`, and `BOSS` preemption
- low-GAS mercy cannot create permanent immunity
- Threat Pressure and FIELD RAID begin on separate beats
- historical Phase85/87/89/94 behavior remains available when Phase106 is not installed
- no additional spawn or render capacity

## Follow-up tuning after playtest

Use gameplay telemetry and WebGL playtests to tune beat durations, Hard intensity, and how often Field Events/Pursuit preempt later baseline cycles. Do not remove the counter/recovery guarantees merely to increase difficulty.

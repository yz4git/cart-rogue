# Phase 110 — TURBO DOMINO CORE LOOP

Phase110 replaces Phase108's contract-gated progression with a continuous combat loop:

`TARGET -> RAM -> CHAIN -> CHASE -> HEAT -> HUNTED -> COUNTERATTACK -> TITAN`

## Design goals

- Every RAM/SMASH immediately points toward the next target instead of stopping for a contract break.
- Phase67 keeps its proven enemy recycling, formations and target selection.
- Phase108 keeps airborne breakup/death-flight presentation; a pre-Phase108 session bridge removes only its contract wrappers before Phase110 installs.
- Domino Heat is performance-driven and decays only after the player stops creating action.
- Higher Heat raises Phase67 pressure bands and slightly increases enemy pursuit/striker readiness.
- HEAT 4 enters HUNTED: pressure flips toward the player and a successful chained RAM becomes COUNTERATTACK.
- Counterattack breaks pressure, restores GAS/Turbo resources and preserves the chase rhythm.
- HEAT MAX after a short HUNTED beat summons RAM TITAN. A 22-domino fallback prevents a stalled endgame.
- Every five Domino events gives a small passive Turbo/GAS bonus; this replaces explicit contract chores with bonuses earned by normal play.

## Performance

No new enemy pools, meshes, particles or per-frame random allocation systems are introduced. Phase110 reuses Phase67 population, Phase57 Flow telemetry, Phase55/56 RAM/SMASH telemetry, Phase91 damage telemetry, Phase108 destruction presentation through the session bridge and the existing Turbo Hunt HUD event.

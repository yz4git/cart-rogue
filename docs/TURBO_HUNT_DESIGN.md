# Cart Rogue — Turbo Hunt Overhaul Design

Status: implementation design for Phase 67+

## 1. Why this overhaul exists

Cart Rogue's strongest loop is now the Turbo combat itself:

1. scan for a viable target,
2. pivot/charge Turbo,
3. release into a forward strike,
4. destroy or launch the target,
5. chain into the next target,
6. convert Flow/Perfect play into more Turbo,
7. keep moving without losing momentum.

The current authored progression — combat room → locked gate → corridor → combat room — repeatedly interrupts that loop. Turbo Hunt removes room-clear traversal as the primary structure and makes target selection and chain routing the structure of the game.

## 2. Product goal

Turn the live game into a continuous 3–5 minute hunt on one large field while preserving the proven driving/Turbo combat stack.

The player should be able to spend long stretches moving from enemy to enemy with no mandatory corridor travel and no gate wait. A strong run should feel like improvising a route through moving targets rather than clearing discrete rooms.

## 3. Non-negotiables

- Preserve `RallyFixedStepClock` and 60 Hz gameplay simulation.
- Preserve current Turbo hold → pivot/charge → release attack behavior.
- Preserve Phase 55–66 strike, smash, Flow, Perfect Strike, Shockwave, aim assist, hit stun and chain rewards.
- Preserve iPhone Safari landscape controls and Canvas fallback.
- Preserve existing legacy room-run code and tests until Turbo Hunt is proven.
- No new Sites project and no hosting configuration changes as part of gameplay implementation.
- Keep the field texture-free and flat-shaded.
- Avoid unbounded entity allocation; use stable pools and recycling.

## 4. Compatibility strategy

### 4.1 Session modes

`CartArenaSession` gains an explicit mode:

- `legacy-run` — existing room/corridor behavior, kept as the constructor default for regression tests.
- `turbo-hunt` — new continuous-field behavior used by the live WebGL and Canvas demos.

This is deliberate: old tests continue to instantiate the legacy mode unless they explicitly request Turbo Hunt, while the shipped game opts into the new mode.

### 4.2 Preserve the phase wrapper stack

The current runtime composes behavior by wrapping `CartArenaSession.step()` in import order. Turbo Hunt does not bypass that stack. The base session selects a different internal simulation path, then Phase 14–66 still wrap the same public `step()` method.

This means Phase 55–66 remain the combat authority rather than being reimplemented.

### 4.3 One combat namespace

Every Turbo Hunt enemy uses `nodeId = "hunt-field"`.

This is important because Perfect Shockwave and several existing combat systems intentionally affect targets sharing a node. Using one node makes the entire hunt field one combat space without changing those systems.

## 5. Giant field

### 5.1 Coordinate placement

The new field is physically separated from the legacy authored run so older presentation passes can remain installed without visually interfering.

- field center: approximately `(560, 220)`
- half width: `92`
- half depth: `92`
- safe player spawn: southern third of the field

The legacy world remains near its existing coordinates. The distance plus fog keeps old geometry out of the live view while avoiding a risky deletion of historical visual phases.

### 5.2 Drive surface

Turbo Hunt uses a dedicated wide, flat RallyTrack adapter whose only job is to keep inherited RallyCar ground/surface logic stable across the whole field. The authored room track is not reused as the physical support surface.

### 5.3 Field regions

The map is continuous; regions are visual/navigation identities, not rooms and not gates.

1. **Drop Yard** — safe southern spawn and recovery zone.
2. **Crossfire Garden** — open center with dense moving target routes.
3. **Smash Garden** — western destructible rock clusters for Turbo chain extensions.
4. **Sprint Lane** — eastern long sightline for multi-target release chains.
5. **Crown Grounds** — northern high-pressure elite/boss arrival zone.

Crossing between regions has no loading, locking, room-clear requirement or corridor.

## 6. Core run loop

### 6.1 Continuous director phases

The run advances by combat intensity, not physical gates:

`DROP IN → HUNT → HEAT UP → ELITE INVASION → OVERDRIVE → BOSS ARRIVAL → CLEAR`

These states alter spawn composition and objectives while the player remains on the same field.

### 6.2 HEAT

HEAT is a 0–100 momentum meter driven by aggressive play.

Sources include:

- normal enemy KO,
- heavy/elite KO,
- Perfect Strike,
- Perfect Shockwave collateral KO,
- rock smash,
- high Flow milestones.

HEAT decays only after a short inactivity grace period. Higher HEAT increases active enemy pressure and unlocks more dangerous archetypes. It should encourage the player to immediately choose the next target instead of stopping.

### 6.3 Target density and spawn pressure

Use a fixed enemy pool. Dead slots recycle after short bounded cooldowns.

Target active population by director phase:

- Drop In: 5–6
- Hunt: 7–9
- Heat Up: 9–11
- Elite Invasion: 10–12 plus heavy pressure
- Overdrive: 12–14
- Boss: boss + 7–10 support targets

The exact cap remains small enough for iPhone WebGL.

### 6.4 Chain-route spawning

Respawns are not uniformly random. The director generates small target formations biased around the player's current heading:

- line: 3–4 targets with readable forward spacing,
- arc: targets that invite a turn through a chain,
- fork: two possible follow-up targets,
- bomber cluster: a bomber positioned to reward collateral planning,
- heavy anchor: one durable target surrounded by lighter Turbo fuel.

Spawn safety rules:

- never spawn directly on the player,
- keep a minimum distance from the field wall,
- prefer 18–48 m from the player,
- avoid stacking enemy centers,
- bias at least one target into the forward hemisphere,
- keep enough side targets to support deliberate rerouting.

## 7. Objectives without gates

Turbo Hunt uses rotating Hunt Orders. Orders provide direction and rewards but never lock traversal.

Initial order set:

- `HUNT` — destroy N targets.
- `FLOW` — reach a requested Flow chain.
- `PERFECT` — land a Perfect Strike.
- `SMASH` — destroy N rocks with Turbo.
- `ELITE` — destroy marked heavy targets.

Completing an order awards a bounded combination of Turbo recharge progress, gas and score/scrap value.

Orders rotate immediately or after a very short presentation beat; no corridor transition occurs.

## 8. Roguelike upgrades

Perks stay, but they stop being tied to physical stage rooms.

The first implementation grants perk drafts from Hunt milestones (for example after a bounded number of completed Hunt Orders / director phase transitions). A perk screen may briefly pause the action because it is an intentional build decision, not dead traversal time.

The old `cartStageClearNumber()` path remains for legacy mode.

## 9. Boss arrival

The boss does not live in a final room.

After minimum run time plus sufficient combat progress/HEAT, RAM TITAN enters the same field. Support enemies continue spawning while the boss is alive. The player therefore uses light targets and Flow rewards as Turbo fuel for repeated boss attacks.

Run completion is only set after a boss has actually spawned and been destroyed; an initially inactive boss pool slot must not count as a cleared run.

## 10. Enemy pool

Use stable IDs and fixed archetype slots so renderer groups can be allocated once.

Proposed pool:

- several light blockers,
- standard chasers,
- strikers,
- orbiters,
- drifters,
- bombers,
- heavy/tank slots,
- one boss slot.

Most light targets should die to a clean Turbo hit at baseline. Heavy/tank targets remain multi-hit anchors. The pool recycles state (position, heading, HP, timers) instead of creating unlimited objects.

## 11. Resources and destructibles

### 11.1 Rocks

Rock clusters become chain-routing tools rather than corridor obstacles. They are positioned in the Smash Garden and a few cross-field lanes. Destroyed rocks recycle after a generous cooldown so a long run does not permanently empty the field.

### 11.2 Pickups

A small fixed pool of Gas/Turbo cells is distributed across landmarks. Collected cells respawn later at another authored anchor. Chain rewards remain the primary Turbo economy; pickups are recovery, not the main loop.

## 12. Player boundary behavior

The only mandatory wall is the outer field boundary.

Boundary contact should use the existing forgiving wall-slide philosophy:

- clamp back inside,
- remove outward velocity,
- preserve useful tangential momentum,
- avoid corner traps,
- never teleport the player across the map.

There are no internal gate colliders.

## 13. Target guidance

A hunt game needs fast target acquisition.

The director exposes a preferred target ID selected from alive enemies using:

- forward angle,
- distance,
- target type/objective relevance,
- chain continuation potential.

WebGL displays a lightweight world-space marker over that target. HUD can show target distance / current order. This is guidance only; it does not hard-lock steering.

## 14. HUD redesign

Remove live dependence on room identifiers and the route map.

Primary top HUD:

- `TURBO HUNT`
- current region
- current Hunt Order + progress
- HEAT level / meter
- KO count

Combat overlays retained:

- FLOW combo,
- Turbo/Perfect feedback,
- boss meter,
- reward callouts.

Removed in Turbo Hunt live mode:

- route map,
- `GATE OPEN`,
- room-clear objective copy,
- arena/corridor labels as progression.

## 15. WebGL world strategy

A new late visual pass builds the giant field after the legacy visual stack.

Use:

- one broad floor / low-cost patch meshes,
- instanced ground accents,
- authored landmark groups,
- sparse outer boundary markers,
- texture-free flat-shaded materials,
- no heavy postprocessing.

The pass also retargets the main directional light/shadow focus toward the hunt field.

Legacy world presentation remains allocated for compatibility but sits far outside the live camera/fog range.

## 16. Canvas fallback

Canvas uses the same Turbo Hunt session mode and snapshot data.

It draws:

- giant field rectangle and region bands,
- recycled enemies,
- rocks/pickups,
- preferred target marker,
- player.

It must not draw old gates in Turbo Hunt mode.

## 17. Data exposed in snapshot

Additive snapshot fields, with safe legacy defaults:

- `gameMode`
- `huntPhase`
- `huntRegion`
- `huntElapsedSeconds`
- `huntHeat`
- `huntHeatLevel`
- `huntKills`
- `huntObjectiveSerial`
- `huntObjectiveKind`
- `huntObjectiveLabel`
- `huntObjectiveProgress`
- `huntObjectiveTarget`
- `huntOrdersCompleted`
- `huntTargetEnemyId`
- `huntBossSpawned`

Existing fields remain populated for compatibility.

## 18. Phase implementation plan

### Phase 67 — mode foundation
- add this design document,
- add session mode and giant-field constants,
- add dedicated hunt physics track,
- keep legacy constructor behavior as default.

### Phase 68 — giant-field movement
- branch base session step into legacy vs Turbo Hunt path,
- outer boundary slide,
- no gates / no room transitions,
- giant field spawn.

### Phase 69 — enemy pool and director
- stable pooled enemies,
- HEAT,
- director states,
- formation respawns,
- global enemy movement inside field.

### Phase 70 — Hunt Orders
- rotating objectives,
- objective progress from combat events,
- milestone rewards,
- preferred target selection.

### Phase 71 — continuous economy
- rock and pickup recycle,
- Flow/Turbo economy integration,
- no room-clear resource grant in hunt mode.

### Phase 72 — elite invasion / overdrive
- heat-driven active caps,
- heavier archetype mix,
- elite target pressure without physical locks.

### Phase 73 — boss arrival
- spawn RAM TITAN into the field,
- keep support targets active,
- mode-correct `runComplete`.

### Phase 74 — Turbo Hunt HUD
- remove route map/gate copy for hunt mode,
- HEAT, orders, KOs and region display,
- hunt milestone perk trigger.

### Phase 75 — target guidance
- preferred target world marker,
- target readability and distance feedback.

### Phase 76 — giant-field WebGL art
- continuous field geometry,
- five region identities,
- outer boundary readability,
- light/shadow retargeting.

### Phase 77 — Canvas parity / PWA
- Canvas field rendering,
- fallback parity,
- service-worker cache bump.

### Phase 78 — validation and performance guard
- deterministic director tests,
- 30/60/120 render cadence safety where relevant,
- no unbounded pool growth,
- legacy regression suite,
- build/lint/artifact/PWA tests,
- real Chrome WebGL audit.

## 19. Acceptance criteria

The overhaul is complete when all are true:

1. The live game starts in Turbo Hunt, not `arena-01` progression.
2. The player can drive throughout one continuous large field.
3. No enemy-clear gate is required to continue moving.
4. At least 7 targets are normally available during active hunt play.
5. Destroyed pooled enemies re-enter at new useful positions without unbounded array growth.
6. Turbo → target → Flow → next Turbo chaining remains intact.
7. Perfect Strike and Shockwave work across the hunt field.
8. HEAT and Hunt Orders visibly progress.
9. Elite/Overdrive pressure occurs without changing maps.
10. RAM TITAN arrives in the same field with support enemies present.
11. Boss death ends the run; an inactive boss slot does not.
12. Route map and gate messaging are absent in hunt mode.
13. WebGL and Canvas both support Turbo Hunt.
14. Existing legacy session tests remain valid.
15. Full CI and real WebGL audit pass before merge.

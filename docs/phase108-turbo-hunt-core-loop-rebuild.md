# Phase 108 — Turbo Hunt Core Loop Rebuild

## Goal

Make Turbo Hunt read as one game instead of several parallel objective systems. The player's visible loop is now:

`DROP IN -> CONTRACT ACTION -> BREAK/REWARD -> ROUTE CHOICE -> TRAVEL -> CONTRACT ACTION -> ... -> RAM TITAN -> CLEAR`

Only one Primary Objective is surfaced at a time. Existing enemy intelligence, RAID/AOE behavior, Perfect Strike, chain systems, and Phase107 presentation remain available as combat texture rather than competing mission layers.

## Region contracts

1. DROP YARD — HUNT 5 targets
2. SMASH GARDEN — TURBO SMASH 4 obstacles
3. SPRINT LANE — BREAK 4 convoy targets
4. CROSSFIRE GARDEN — CHAIN 6 targets
5. CROWN GROUNDS — BREAK 2 heavy targets
6. RAM TITAN

Contract targets are physically staged inside the named region, so the giant map becomes part of the core loop instead of a passive arena backdrop. After DROP YARD, the next contract is chosen by driving into one of the offered unvisited regions.

## Progression cleanup

- Legacy Phase67 Hunt Order auto-completion is disabled while Phase108 controls progression.
- Legacy Phase67 timed/heat boss auto-spawn is disabled; Phase108 spawns the Titan after the fifth contract.
- Phase81 autonomous Field Events are disabled so they no longer compete with the Primary Objective.
- Perk milestones still see the underlying Phase67 `ordersCompleted`, explicitly synchronized to completed contracts, preserving the existing 2/4 milestone flow.
- A 4.6 second BREAK window follows each contract with GAS restoration and one Turbo charge. After the break, up to two unvisited regions are offered as a physical route choice; entering one selects that contract.
- RAM TITAN is capped at 4200 HP in this loop to avoid an excessively long HP-sponge tail while remaining a multi-hit boss.

## Impact / launch rebuild

- Non-lethal Turbo Strike knockback increases to 2.6–6.0 world units depending on charge.
- Destroying Turbo Strike knockback increases to 8.5–15.0 world units.
- Destroyed enemy visuals no longer disappear instantly: Phase108 re-shows the existing enemy group for a short ballistic death flight.
- During the death flight the enemy spins, rises, then its existing child meshes separate outward while the whole wreck continues moving.
- No new per-enemy geometry pool is introduced for the flight; existing enemy pieces are reused and restored before respawn.

## Performance intent

The loop rebuild mostly changes scheduling/state and reuses existing entities. The death-flight effect allocates only on actual kills and reuses already-built enemy meshes rather than adding a persistent particle or physics population.
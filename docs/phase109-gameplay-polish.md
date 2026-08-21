# Phase 109 — Decelerating Turbo Drift / Reliable Smash / Damage Cut-in

## Turbo hold drift

Turbo hold no longer collapses into a stationary pivot after the lower-level driving stack sheds speed. The final Phase109 wrapper preserves a bounded moving deceleration curve:

- authored deceleration: 6.0 units/s²
- minimum rolling speed while a moving hold continues: 3.2 units/s
- damage / major-impact frames are allowed to break the speed floor
- Turbo release remains owned by the existing Phase15/54 launch stack

## Reliable destructible contact

Turbo Smash now accepts close contact and slight overlap as a valid target. This removes the failure mode where the collision solver nudged the car around a rock just before the release attack queried its target and then rejected that same rock for being too close.

Forward-lane range and lateral bounds still apply to non-overlapping targets, so distant or rear objects are not swept up accidentally.

## Damage dialogue cut-in

Phase109 registers a dedicated `damage_hit` event into the existing anime cut-in queue without adding a second HUD layer. It uses:

- priority 82
- 1.2 s display duration
- 2.4 s cooldown
- deterministic three-line DRIVER / OPERATOR rotation

The trigger is Phase91 player-damage `hitSerial`, so the dialogue only advances when the gameplay damage system reports a new hit.

## Regression coverage

Tests cover the moving deceleration floor, close-contact smash reliability, damage cut-in wiring, and Phase109 ordering after Phase108.

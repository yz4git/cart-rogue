# Phase 107 — Visual Hierarchy & Arcade Presentation

Phase107 is a presentation-only pass over the Phase106 Turbo Hunt loop. It does not change damage, hitboxes, enemy counts, RAID scheduling, steering, GAS/LIFE, boss health, or Encounter Director rules.

## Goals

1. Reduce persistent HUD coverage while preserving iPhone touch targets and critical GAS/TURBO readability.
2. Give the hero and enemy roles stronger silhouettes at gameplay distance without changing collision geometry.
3. Increase world depth and giant-field orientation with low-cost macro landmarks and atmospheric layering.
4. Make speed read faster through fixed-pool ground/edge motion markers and stronger Turbo presentation.
5. Keep Phase104 AOE hit-area truth intact while adding vertical in-world telegraph structure.
6. Give RAID, counter, escape, damage, and field-event messaging distinct arcade visual language.
7. Keep Face Editor cut-ins compact and off the central driving sightline.

## Performance contract

- fixed visual counts only; no runtime pool growth
- shared geometries/materials where practical
- no PointLight fleet, EffectComposer, bloom, SSAO, or texture streaming
- no gameplay collider/radius/position mutation
- no additional enemy or RAID slots
- reduced-FX mode may hide secondary speed/depth accents, never critical AOE bounds

## Visual hierarchy

1. immediate hazard / target
2. hero vehicle
3. current objective / counter opportunity
4. GAS and TURBO
5. secondary stats and decorative information

## Implemented presentation layers

- compact top HUD and bottom GAS/TURBO footprint; development badge and steering help are hidden during Turbo Hunt
- distinct RAID, damage, counter, escape, and field-event message palettes
- smaller off-center damage burst and Face Editor cut-ins
- five large directional landmarks plus eight muted far-depth pylons
- macro sector ground markers for field scale/orientation
- fixed 16-streak ground-speed layer, automatically reduced under frame pressure
- hero rear-wing/turbine signature and stronger blocker/chaser/heavy/boss silhouettes
- four fixed AOE vertical cage slots layered over the authoritative Phase104 ground footprint

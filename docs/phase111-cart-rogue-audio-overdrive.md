# Phase 111 — Cart Rogue Audio Overdrive

Phase111 connects a dedicated low-allocation Web Audio layer to the current Turbo Domino loop.

## Audio goals

- Unlock AudioContext synchronously from steering/Turbo/brake interaction for iPhone Safari.
- Give speed, Turbo and HEAT their own continuous procedural layers.
- Add distinct transient cues for RAM, enemy destruction, destructible smash, pickups and player damage.
- Score Phase110 state changes: HEAT rises, HUNTED warning, COUNTERATTACK release, TITAN arrival and CLEAR.
- Keep transient voices capped at 14 and reuse one deterministic noise buffer instead of loading audio assets.
- Cover both WebGL and Canvas fallback paths.

## Integration

`CartRoguePhase111AudioOverdrive` is composed immediately after Phase110 in `CartGameMenuRuntime`.
Audio remains dormant until the first gameplay interaction, fades during pause, resumes on interaction, and disposes with the demo.

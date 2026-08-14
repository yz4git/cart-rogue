# Voxel Rally

Voxel Rally is a mobile-first voxel anti-gravity arcade racer. The machine
accelerates automatically and follows the physical road, while the player
slides it continuously across the course to collect Boost pickups, avoid or
smash voxel walls, and ram through traffic.

The core loop is:

`AUTO ROAD FOLLOW → STRAFE → BOOST PICKUP → BOOST → SMASH → OVERTAKE`

It is an original low-poly game built from TypeScript, three.js, WebGL and
Canvas primitives. It does not use copied vehicles, tracks, sounds or assets.

## Playable content

- Three wide data-driven tracks: Forest Circuit, Mountain Pass and Voxel Badlands.
- Continuous lateral strafe inside a safe road envelope; this is not a fixed
  three-lane system and mobile input does not steer front wheels.
- Automatic forward acceleration and smooth road-tangent follow through bends.
- Boost is a charge action: a press spends one charge for a timed attack burst.
- Bright Boost pickups are placed on alternating sides and in chain routes.
- Destructible voxel walls can be avoided normally or smashed without losing
  speed while Boost is active.
- Player and AI cars use the same RallyCar physics. Each race participant has
  an independent pickup collection state, so one driver cannot remove another
  driver's route.
- Three vehicle classes: Compact (fast strafe), Muscle (speed and ram power),
  and Buggy (off-road and jump stability).
- TIME ATTACK, RACE and three-round CHAMPIONSHIP modes.
- Easy, Normal and Hard AI with Aggressive, Technical and Safe racecraft.
- Road surfaces, jumps, checkpoints, route branches, scenery collision and
  recoverable physics failures.
- WebGL renderer with a shared Canvas 3D Preview fallback.

## Mobile controls

- **Left thumb / STRAFE:** touch anywhere in the lower-left area. The touch
  point is neutral. Slide from that point left or right for continuous lateral
  movement; release to return toward neutral.
- **Right thumb / BOOST:** press once to spend one charge. Holding the button
  cannot spend additional charges. The HUD shows `BOOST × charges`.
- Forward motion and road-follow steering are automatic after GO. The mobile
  control path does not require GAS, BRAKE or drift timing.
- The floating touch control uses pointer capture and a separate pointer owner
  from BOOST, so both thumbs work at the same time. Safe-area insets and
  landscape iPhone Safari are first-class targets.

Keyboard fallback for desktop debugging remains `W` / `↑` for throttle,
`S` / `↓` for brake, `A` / `D` or `←` / `→` for classic steering, and
`Space` / `E` for Boost. Dragging the right side of the 3D view adjusts the
chase camera.

## Race rules

1. Press START and wait for the 3-2-1-GO countdown.
2. Pass every yellow CHECKPOINT in order and in the correct direction.
3. Use strafe to choose a pickup line, a safe gap, or a destructible wall.
4. Return through the green GOAL gate to finish one lap.
5. Restart to restore all pickups and destructible objects.

Normal wall contact breaks the object and costs momentum. Boost wall contact
produces BOOST SMASH and preserves the player's forward speed. Traffic uses a
lightweight separation rule: a boosted player keeps momentum and pushes the
other car aside; no rigid-body engine or teleporting is used.

## Modes and progression

TIME ATTACK disables damage and stores the best lap, splits and Ghost per
track, vehicle and environment. RACE adds three AI opponents. CHAMPIONSHIP
runs Track 01, Track 02 and Track 03 consecutively with round results, points,
final rank and unlocks. Invalid or old localStorage data falls back safely.

## Rendering and PWA

The normal renderer is three.js WebGL. If capability detection fails, WebGL
initialization throws, or Canvas is forced with `?renderer=canvas3d` or
`?test=2d`, the game starts the Canvas 3D Preview. Both adapters share
`RallyTrack`, `RallyCar`, `RallyRace`, AI, checkpoints, pickups, destructible
objects and input state; only presentation differs.

The app is designed for landscape iPhone Safari and can be installed as a
PWA. The service worker uses a versioned cache, network-first navigation and
old-cache cleanup so a published build can replace a previously opened app.

## Development

```bash
npm run build
npm test
npm run lint
npm run build:pages
npm run validate:artifact
npm run verify
```

`npm run test:rules` covers the shared vehicle, strafe, Boost, pickup, wall,
race and AI rules. `npm run test:track` covers closed-track geometry,
road-width consistency and WebGL winding. `npm run test:pwa` checks service
worker update behavior. `npm run test:pages` builds and validates the static
artifact.

## Architecture

`RallyRuntime` constructs the shared session. `RallyTrack` owns canonical road
geometry, query results, pickup definitions, obstacles, static colliders and
scenery. `RallyCar` owns the shared vehicle state, hover strafe, Boost charges,
collision and visual transform. `RallyRace`, `RallyRaceMode` and
`RallyAIDriver` own race rules and participant decisions. WebGL and Canvas are
renderer adapters; they do not contain alternate gameplay rules.

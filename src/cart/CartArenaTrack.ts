import type { RallyTrackDefinition } from "../rally/tracks/TrackDefinition";

/**
 * Physics-only adapter while Cart Rogue is migrated away from RallyTrack.
 * Phase 9 extends the shared surface beneath the longer branching run while
 * CartWorldGraph remains the authoritative playable bounds and route topology.
 */
export const CART_ARENA_TRACK: RallyTrackDefinition = {
  id: "cart-arena-run-01",
  name: "Pastel Branch Run",
  roadWidth: 14,
  segments: 320,
  checkpoints: [0.14, 0.3, 0.47],
  medalTimes: { bronze: 260, silver: 220, gold: 180 },
  scenery: { count: 0, radiusX: 180, radiusZ: 280 },
  controlPoints: [
    { x: 0, z: 28, y: 0, width: 56 },
    { x: 0, z: 50, y: 0, width: 40 },
    { x: 0, z: 72, y: 0, width: 13 },
    { x: 0, z: 94, y: 0, width: 40 },
    { x: 0, z: 116, y: 0, width: 60 },
    { x: 0, z: 158, y: 0, width: 42 },
    { x: 0, z: 198, y: 0, width: 82 },
    { x: 0, z: 238, y: 0, width: 42 },
    { x: 0, z: 280, y: 0, width: 66 },
    { x: 0, z: 322, y: 0, width: 42 },
    { x: 0, z: 362, y: 0, width: 82 },
    { x: 0, z: 402, y: 0, width: 42 },
    { x: 0, z: 448, y: 0, width: 70 },
    { x: 72, z: 486, y: 0, width: 14 },
    { x: 152, z: 438, y: 0, width: 14 },
    { x: 166, z: 300, y: 0, width: 14 },
    { x: 160, z: 158, y: 0, width: 14 },
    { x: 118, z: 42, y: 0, width: 14 },
    { x: 42, z: 2, y: 0, width: 18 },
  ],
  surfaceZones: [
    { id: "arena-asphalt", start: 0, end: 0.64, surface: "road" },
  ],
  pickups: [],
  obstacles: [],
};

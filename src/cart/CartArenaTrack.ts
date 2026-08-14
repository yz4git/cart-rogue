import type { RallyTrackDefinition } from "../rally/tracks/TrackDefinition";

/**
 * Physics-only adapter while Cart Rogue is migrated away from RallyTrack.
 * Rendering, combat enemies, pickups, and arena decoration are owned by the
 * Cart Rogue runtime. This adapter exists only to provide the proven terrain
 * and vehicle queries needed by RallyCar during the transition.
 */
export const CART_ARENA_TRACK: RallyTrackDefinition = {
  id: "cart-arena-run-01",
  name: "Pastel Test Run",
  roadWidth: 14,
  segments: 224,
  checkpoints: [0.18, 0.36, 0.54],
  medalTimes: { bronze: 180, silver: 150, gold: 120 },
  scenery: { count: 0, radiusX: 118, radiusZ: 126 },
  controlPoints: [
    { x: 0, z: 28, y: 0, width: 56 },
    { x: 0, z: 50, y: 0, width: 40 },
    { x: 0, z: 72, y: 0, width: 13 },
    { x: 0, z: 94, y: 0, width: 40 },
    { x: 0, z: 116, y: 0, width: 60 },
    { x: 0, z: 140, y: 0, width: 40 },
    { x: 0, z: 162, y: 0, width: 13 },
    { x: 0, z: 186, y: 0, width: 44 },
    { x: 0, z: 210, y: 0, width: 68 },
    { x: 50, z: 238, y: 0, width: 12 },
    { x: 112, z: 220, y: 0, width: 12 },
    { x: 122, z: 146, y: 0, width: 12 },
    { x: 122, z: 64, y: 0, width: 12 },
    { x: 82, z: 4, y: 0, width: 12 },
    { x: 34, z: 2, y: 0, width: 18 },
  ],
  surfaceZones: [
    { id: "arena-asphalt", start: 0, end: 0.58, surface: "road" },
  ],
  pickups: [],
  obstacles: [],
};

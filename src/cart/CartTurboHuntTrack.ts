import type { RallyTrackDefinition } from "../rally/tracks/TrackDefinition";

/**
 * Physics-only support surface for Turbo Hunt.
 *
 * Cart Rogue still delegates low-level suspension/surface queries to RallyTrack.
 * The Hunt field is deliberately one very wide flat road so the inherited car
 * physics remain stable while gameplay is free to use the whole 184×184 arena.
 */
export const CART_TURBO_HUNT_FIELD = {
  id: "hunt-field",
  centerX: 560,
  centerZ: 220,
  halfWidth: 92,
  halfDepth: 92,
  spawnX: 560,
  spawnZ: 162,
} as const;

export const CART_TURBO_HUNT_TRACK: RallyTrackDefinition = {
  id: "cart-turbo-hunt-field-01",
  name: "Turbo Hunt Field",
  roadWidth: 224,
  segments: 192,
  checkpoints: [0.25, 0.5, 0.75],
  medalTimes: { bronze: 300, silver: 240, gold: 190 },
  scenery: { count: 0, radiusX: 240, radiusZ: 240 },
  controlPoints: [
    { x: 560, z: 162, y: 0, width: 224 },
    { x: 610, z: 170, y: 0, width: 224 },
    { x: 638, z: 220, y: 0, width: 224 },
    { x: 610, z: 276, y: 0, width: 224 },
    { x: 560, z: 298, y: 0, width: 224 },
    { x: 510, z: 276, y: 0, width: 224 },
    { x: 482, z: 220, y: 0, width: 224 },
    { x: 510, z: 170, y: 0, width: 224 },
  ],
  surfaceZones: [
    { id: "hunt-surface", start: 0, end: 1, surface: "road" },
  ],
  pickups: [],
  obstacles: [],
};

import type { RallyTrackDefinition } from "../rally/tracks/TrackDefinition";

/**
 * Temporary physics/render adapter while Cart Rogue is migrated away from the
 * closed rally-course runtime. The playable route is the central spine:
 * broad arena -> narrow corridor -> broad arena -> corridor -> boss arena.
 * The far eastern points only close RallyTrack's legacy loop and are kept well
 * away from the playable spaces so they cannot become accidental shortcuts.
 */
export const CART_ARENA_TRACK: RallyTrackDefinition = {
  id: "cart-arena-run-01",
  name: "Pastel Test Run",
  roadWidth: 14,
  segments: 224,
  checkpoints: [0.18, 0.36, 0.54],
  medalTimes: { bronze: 180, silver: 150, gold: 120 },
  scenery: { count: 42, radiusX: 118, radiusZ: 126 },
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
  pickups: [
    { id: "turbo-corridor-01", progress: 0.115, lateral: 0, type: "boost" },
    { id: "turbo-corridor-02", progress: 0.33, lateral: 0, type: "boost" },
  ],
  obstacles: [
    { id: "arena-crate-a", x: -10, z: 34, radius: 1.25, kind: "wall", destructible: true, rotationY: 0.18 },
    { id: "arena-crate-b", x: 12, z: 22, radius: 1.2, kind: "wall", destructible: true, rotationY: -0.12 },
    { id: "arena-pillar-a", x: -16, z: 112, radius: 1.8, kind: "rock" },
    { id: "arena-pillar-b", x: 16, z: 122, radius: 1.8, kind: "rock" },
    { id: "boss-cover-a", x: -18, z: 212, radius: 1.55, kind: "wall", destructible: true },
    { id: "boss-cover-b", x: 18, z: 204, radius: 1.55, kind: "wall", destructible: true },
  ],
};

import type { RallyTrackDefinition, TrackControlPoint } from "./TrackDefinition";

// Track 01 is intentionally readable at first sight: a fast opening
// straight, an S section, a left hairpin, an uphill jump crest, and a wide
// descending forest-side return. The loop closes back at the start gate.
export const TRACK_01_CONTROL_POINTS: readonly TrackControlPoint[] = [
  { x: 0, z: 18, y: 1.1, width: 16 },
  { x: 72, z: 18, y: 1.1, width: 16 },
  { x: 94, z: 30, y: 1.35, width: 17 },
  { x: 82, z: 52, y: 1.75, width: 16 },
  { x: 52, z: 60, y: 1.55, width: 16 },
  { x: 16, z: 44, y: 1.3, width: 16 },
  { x: -28, z: 44, y: 1.55, width: 17 },
  { x: -55, z: 65, y: 2, width: 16 },
  { x: -55, z: 100, y: 2.35, width: 16 },
  { x: -24, z: 120, y: 2.55, width: 15.5 },
  { x: 10, z: 116, y: 2.2, width: 16.5 },
  { x: 8, z: 145, y: 2, width: 17 },
  { x: 32, z: 165, y: 2.35, width: 16 },
  // A pronounced crest/drop keeps the tutorial jump readable after widening
  // the hover racing envelope. The machine still leaves the surface through
  // the shared suspension query; this is not a scripted launch.
  { x: 55, z: 157, y: 4.2, width: 16 },
  { x: 70, z: 132, y: 0.8, width: 16 },
  { x: 64, z: 108, y: 1.2, width: 17 },
  { x: 50, z: 90, y: 0.95, width: 18 },
  { x: 28, z: 78, y: 0.8, width: 18 },
  { x: 10, z: 58, y: 0.9, width: 16.5 },
  { x: 0, z: 38, y: 1, width: 16 },
];

export const TRACK_01: RallyTrackDefinition = {
  id: "track-01",
  name: "Forest Circuit",
  controlPoints: TRACK_01_CONTROL_POINTS,
  roadWidth: 16,
  checkpoints: [0.25, 0.5, 0.75],
  startDistance: 0,
  surfaceZones: [
    { id: "forest-dirt-section", start: 0.42, end: 0.57, surface: "dirt" },
    { id: "forest-gravel-jump", start: 0.58, end: 0.7, surface: "gravel" },
  ],
  gameplayBeats: [
    { id: "forest-opening-straight", progress: 0.03, kind: "straight", label: "OPENING STRAIGHT" },
    { id: "forest-s-curve", progress: 0.16, kind: "s-curve", label: "S-CURVE" },
    { id: "forest-brake-corner", progress: 0.31, kind: "brake-corner", label: "BRAKE CORNER" },
    { id: "forest-section", progress: 0.46, kind: "forest", label: "FOREST RUN" },
    { id: "forest-jump-crest", progress: 0.63, kind: "jump", label: "JUMP CREST" },
    { id: "forest-smash-shortcut", progress: 0.76, kind: "destructible-shortcut", label: "SMASH SHORTCUT" },
    { id: "forest-finish-sprint", progress: 0.91, kind: "finish-sprint", label: "FINISH SPRINT" },
  ],
  shortcutZones: [
    { id: "shortcut-01", entryX: 67, entryZ: 140, exitX: 68, exitZ: 116, obstacleId: "shortcut-wall-01" },
  ],
  obstacles: [
    { id: "forest-cracked-rock-01", progress: 0.14, lateral: 0.52, radius: 2.1, kind: "rock", destructible: true, pattern: "offset-wall" },
    { id: "forest-tree-01", progress: 0.24, lateral: -0.58, radius: 1.7, kind: "tree", destructible: true, pattern: "double-gap" },
    { id: "fence-01", progress: 0.42, lateral: 0.62, radius: 1.5, kind: "fence", destructible: true, pattern: "offset-wall" },
    { id: "forest-cracked-rock-02", progress: 0.54, lateral: -0.48, radius: 2.4, kind: "rock", destructible: true, pattern: "pickup-behind-wall" },
    { id: "forest-tree-02", progress: 0.72, lateral: 0.58, radius: 1.8, kind: "tree", destructible: true, pattern: "offset-wall" },
    { id: "forest-wall-gate", progress: 0.12, lateral: 0.05, radius: 2.0, kind: "wall", destructible: true, pattern: "wall-gate" },
    { id: "forest-slalom-left", progress: 0.58, lateral: -0.7, radius: 1.8, kind: "wall", destructible: true, pattern: "slalom" },
    { id: "forest-slalom-right", progress: 0.63, lateral: 0.7, radius: 1.8, kind: "wall", destructible: true, pattern: "slalom" },
    { id: "shortcut-wall-01", x: 67, z: 129, radius: 2.2, kind: "wall", destructible: true, pattern: "smash-line" },
    { id: "forest-voxel-gate", progress: 0.18, lateral: 0.72, radius: 2.0, kind: "wall", destructible: true, pattern: "wall-gate" },
    { id: "forest-boost-wall", progress: 0.84, lateral: -0.68, radius: 2.0, kind: "wall", destructible: true, pattern: "smash-line" },
    { id: "forest-finish-smash", progress: 0.94, lateral: 0.55, radius: 1.9, kind: "wall", destructible: true, pattern: "smash-line" },
  ],
  safetyBlockZones: [
    { id: "forest-brake-safety", startProgress: 0.28, endProgress: 0.36, side: "right", offset: 1.5, spacing: 2.8, blockType: "voxel-safety" },
    { id: "forest-run-safety", startProgress: 0.4, endProgress: 0.48, side: "left", offset: 1.5, spacing: 2.8, blockType: "voxel-safety" },
    { id: "forest-jump-approach-safety", startProgress: 0.68, endProgress: 0.74, side: "right", offset: 1.6, spacing: 2.9, blockType: "voxel-safety" },
  ],
  pickups: [
    { id: "forest-boost-01", progress: 0.04, lateral: -0.55 },
    { id: "forest-boost-02", progress: 0.1, lateral: 0.55 },
    { id: "forest-boost-03", progress: 0.18, lateral: -0.68 },
    { id: "forest-boost-04", progress: 0.26, lateral: 0.62 },
    { id: "forest-boost-05", progress: 0.39, lateral: -0.58 },
    { id: "forest-boost-06", progress: 0.49, lateral: 0.6 },
    { id: "forest-boost-07", progress: 0.58, lateral: -0.7 },
    { id: "forest-boost-08", progress: 0.67, lateral: 0.62 },
    { id: "forest-boost-09", progress: 0.78, lateral: -0.58 },
    { id: "forest-boost-10", progress: 0.86, lateral: 0.56 },
    { id: "forest-boost-11", progress: 0.94, lateral: -0.48 },
  ],
  scenery: { count: 72, radiusX: 38, radiusZ: 82 },
  medalTimes: { gold: 30, silver: 36, bronze: 45 },
};

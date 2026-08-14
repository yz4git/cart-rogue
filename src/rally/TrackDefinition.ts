// Backward-compatible exports for existing gameplay and geometry tests.
export { TRACK_01, TRACK_01_CONTROL_POINTS } from "./tracks/Track01";
export { TRACK_02, TRACK_02_CONTROL_POINTS } from "./tracks/Track02";
export { TRACK_03, TRACK_03_CONTROL_POINTS } from "./tracks/Track03";
export type {
  RallyTrackDefinition,
  TrackControlPoint,
  TrackObstacleDefinition,
  TrackShortcutDefinition,
  TrackSurfaceZone,
  TrackSafetyBlockZone,
  TrackPickupDefinition,
} from "./tracks/TrackDefinition";
export { TRACK_01_CONTROL_POINTS as TRACK_01_DEFINITION } from "./tracks/Track01";

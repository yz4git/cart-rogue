import type { RallySurface } from "../RallyTypes";
import type { RallyObstacleKind } from "../RallyTrack";
import type { RallyRouteGraphDefinition } from "../RallyRouteGraph";
import type { RallyEnvironmentVariant } from "../RallySurface";

export interface TrackControlPoint {
  x: number;
  z: number;
  y: number;
  width: number;
}

export interface TrackSurfaceZone {
  id: string;
  start: number;
  end: number;
  surface: RallySurface;
}

export interface TrackObstacleDefinition {
  id: string;
  /** Legacy authored world position. Progress/lateral is preferred for gameplay obstacles. */
  x?: number;
  z?: number;
  /** Normalized closed-loop placement, resolved against the canonical road frame. */
  progress?: number;
  /** Road-relative placement, -1 left edge to +1 right edge. */
  lateral?: number;
  radius: number;
  kind: RallyObstacleKind;
  destructible?: boolean;
  rotationY?: number;
  pattern?: RallyObstaclePattern;
  /** Stable source id for obstacles expanded from a gameplay pattern. */
  patternParentId?: string;
  /** Child index within a deterministic gameplay pattern expansion. */
  patternIndex?: number;
}

export type RallyObstaclePattern = "wall-gate" | "double-gap" | "offset-wall" | "smash-line" | "pickup-behind-wall" | "slalom" | "enemy-wall";

export interface TrackShortcutDefinition {
  id: string;
  entryX: number;
  entryZ: number;
  exitX: number;
  exitZ: number;
  obstacleId: string;
}

export interface TrackSceneryRules {
  count: number;
  radiusX: number;
  radiusZ: number;
}

export interface TrackSafetyBlockZone {
  id: string;
  startProgress: number;
  endProgress: number;
  side: "left" | "right" | "both";
  /** Distance from the physical road edge to the block center, in world units. */
  offset: number;
  spacing: number;
  blockType?: "voxel-safety";
}

export interface TrackPickupDefinition {
  id: string;
  /** Normalized closed-loop course progress. */
  progress: number;
  /** Continuous road-relative position, -1 left to +1 right. */
  lateral: number;
  type?: "boost";
}

export type TrackGameplayBeatKind = "straight" | "s-curve" | "brake-corner" | "forest" | "jump" | "destructible-shortcut" | "finish-sprint" | "hairpin" | "rock-tunnel" | "descent" | "safe-route" | "fast-route" | "destruction-route" | "off-road";

export interface TrackGameplayBeat {
  id: string;
  progress: number;
  kind: TrackGameplayBeatKind;
  label: string;
}

export interface RallyTrackDefinition {
  id: string;
  name: string;
  controlPoints: readonly TrackControlPoint[];
  roadWidth: number;
  segments?: number;
  checkpoints: readonly number[];
  startDistance?: number;
  surfaceZones?: readonly TrackSurfaceZone[];
  shortcutZones?: readonly TrackShortcutDefinition[];
  obstacles?: readonly TrackObstacleDefinition[];
  safetyBlockZones?: readonly TrackSafetyBlockZone[];
  pickups?: readonly TrackPickupDefinition[];
  scenery?: TrackSceneryRules;
  gameplayBeats?: readonly TrackGameplayBeat[];
  environmentVariant?: RallyEnvironmentVariant;
  routeGraph?: RallyRouteGraphDefinition;
  medalTimes: Readonly<{ bronze: number; silver: number; gold: number }>;
}

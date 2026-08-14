import * as THREE from "three";
import { RALLY_CONFIG } from "./RallyConfig";
import { TRACK_01 } from "./tracks/Track01";
import type { RallyTrackDefinition, TrackControlPoint, TrackGameplayBeat, TrackObstacleDefinition, TrackPickupDefinition, TrackSafetyBlockZone } from "./tracks/TrackDefinition";
import type { RallySurface } from "./RallyTypes";
import { RallyRouteGraph } from "./RallyRouteGraph";
import type { RallyEnvironmentVariant } from "./RallySurface";
import type { RallyGraphicsQuality } from "./RallySettings";
import { getRallyVisualTheme } from "./RallyVisualTheme";
import { expandObstaclePatterns, type RallyObstaclePatternGroup } from "./RallyObstaclePatterns";

export interface TrackSample {
  x: number;
  y: number;
  z: number;
  tangentX: number;
  tangentZ: number;
  heading: number;
  distance: number;
  roadWidth: number;
}

export interface TrackNearestPoint extends TrackSample {
  lateralDistance: number;
  distanceSquared: number;
  segmentIndex: number;
}

export type RallyObstacleKind = "tree" | "rock" | "barrier" | "fence" | "wall" | "safety-block";

export interface RallyObstacle {
  id: string;
  x: number;
  z: number;
  radius: number;
  kind: RallyObstacleKind;
  destructible: boolean;
  active: boolean;
  shape: "circle" | "box";
  halfWidth: number;
  halfDepth: number;
  rotationY: number;
  pattern?: TrackObstacleDefinition["pattern"];
  patternParentId?: string;
  patternIndex?: number;
}

export interface RallyObstacleCollision extends RallyObstacle {
  normalX: number;
  normalZ: number;
  penetration: number;
}

export interface RallyPickup {
  id: string;
  type: "boost";
  progress: number;
  lateral: number;
  x: number;
  y: number;
  z: number;
  active: boolean;
}

export type RallySceneryKind = "building" | "tree" | "rock";
export type RallySceneryPriority = "solid" | "decorative";

export interface RallySceneryInstance {
  id: string;
  kind: RallySceneryKind;
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotationY: number;
  solid: boolean;
  priority: RallySceneryPriority;
  collisionRadius: number;
  footprint: number;
  height: number;
  /** Quality filtering is visual-only and never changes staticColliders. */
  visible: boolean;
  renderIndex: number;
}

export type RallyStaticColliderSource = "obstacle" | "scenery" | "gate-post";

export interface RallyStaticCollider {
  id: string;
  source: RallyStaticColliderSource;
  x: number;
  z: number;
  shape: "circle" | "box";
  radius: number;
  halfWidth: number;
  halfDepth: number;
  rotationY: number;
  solid: boolean;
  destructible: boolean;
  active: boolean;
}

export interface RallyStaticCollision extends RallyStaticCollider {
  normalX: number;
  normalZ: number;
  penetration: number;
}

export interface RallyShortcutZone {
  id: string;
  entryX: number;
  entryZ: number;
  exitX: number;
  exitZ: number;
  obstacleId: string;
}

export type RallyGuidanceKind = "corner" | "jump" | "shortcut";

export interface RallyGuidanceMarker {
  id: string;
  kind: RallyGuidanceKind;
  progress: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  roadWidth: number;
  intensity: number;
  label: string;
}

export interface RallyTrackQuery extends TrackNearestPoint {
  groundHeight: number;
  onRoad: boolean;
  roadHalfWidth: number;
  shoulderHalfWidth: number;
  gravelHalfWidth: number;
  surface: RallySurface;
  progress: number;
}

export interface RallyUpcomingTurn {
  strength: number;
  direction: number;
  headingDelta: number;
  distanceAhead: number;
  recommendedSpeed: number;
  /** Heading deltas sampled at near/mid/far physical distances. */
  nearHeadingDelta?: number;
  midHeadingDelta?: number;
  farHeadingDelta?: number;
  nearDistance?: number;
  midDistance?: number;
  farDistance?: number;
  brakingDistance?: number;
  requiredDeceleration?: number;
  targetHeading?: number;
}

const {
  terrainStep: TERRAIN_STEP,
  terrainMinX: TERRAIN_MIN_X,
  terrainMaxX: TERRAIN_MAX_X,
  terrainMinZ: TERRAIN_MIN_Z,
  terrainMaxZ: TERRAIN_MAX_Z,
} = RALLY_CONFIG.track;
const DEFAULT_SEGMENTS = RALLY_CONFIG.track.segments;

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function wrapDistance(distance: number, length: number): number {
  const wrapped = distance % length;
  return wrapped < 0 ? wrapped + length : wrapped;
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function distanceSquaredToSegment(
  x: number,
  z: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
): number {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const lengthSquared = dx * dx + dz * dz;
  const amount = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((x - startX) * dx + (z - startZ) * dz) / lengthSquared))
    : 0;
  const nearestX = startX + dx * amount;
  const nearestZ = startZ + dz * amount;
  return (x - nearestX) ** 2 + (z - nearestZ) ** 2;
}

function appendVertex(
  positions: number[],
  colors: number[],
  x: number,
  y: number,
  z: number,
  color: THREE.Color,
): number {
  positions.push(x, y, z);
  colors.push(color.r, color.g, color.b);
  return positions.length / 3 - 1;
}

function appendQuad(
  indices: number[],
  a: number,
  b: number,
  c: number,
  d: number,
): void {
  // Terrain and road vertices are laid out in increasing z order. Winding
  // this way keeps their front faces pointing upward (+Y), so WebGL's
  // default back-face culling does not hide the driving surface.
  indices.push(a, d, b, b, d, c);
}

export class RallyTrack {
  readonly group = new THREE.Group();
  readonly definition: RallyTrackDefinition;
  readonly id: string;
  readonly name: string;
  readonly segments: number;
  readonly length: number;
  readonly width: number;
  readonly checkpoints: readonly number[];
  readonly obstacles: RallyObstacle[];
  readonly obstaclePatterns: readonly RallyObstaclePatternGroup[];
  readonly pickups: RallyPickup[];
  readonly scenery: RallySceneryInstance[];
  readonly staticColliders: RallyStaticCollider[] = [];
  readonly gatePosts: RallyStaticCollider[] = [];
  readonly shortcutZones: readonly RallyShortcutZone[];
  readonly gameplayBeats: readonly TrackGameplayBeat[];
  readonly guidance: readonly RallyGuidanceMarker[];
  readonly routeGraph: RallyRouteGraph | null;
  readonly environmentVariant: RallyEnvironmentVariant;
  readonly visualTheme: ReturnType<typeof getRallyVisualTheme>;
  private readonly samples: TrackSample[];
  /** Cumulative XZ arc length of each closed-loop sample segment. */
  readonly segmentLengths: readonly number[];
  private readonly obstacleMeshes = new Map<string, THREE.Object3D>();
  private safetyBlockMesh: THREE.InstancedMesh | null = null;
  private readonly safetyBlockTransform = new THREE.Object3D();
  private readonly sceneryMeshes: THREE.InstancedMesh[] = [];
  private readonly sceneryCounts: number[] = [];
  private readonly sceneryItemsByMesh: RallySceneryInstance[][] = [];
  private readonly scenerySolidCounts: number[] = [];
  private pickupMesh: THREE.InstancedMesh | null = null;
  private readonly pickupTransform = new THREE.Object3D();
  /** Race participants collect the same authored route independently. */
  private readonly pickupOwners = new Map<string, Set<string>>();

  constructor(definition: RallyTrackDefinition = TRACK_01) {
    this.definition = definition;
    this.id = definition.id;
    this.name = definition.name;
    this.segments = definition.segments ?? DEFAULT_SEGMENTS;
    this.width = definition.roadWidth;
    this.checkpoints = [...definition.checkpoints];
    const sampleData = this.createSamples();
    this.samples = sampleData.samples;
    this.segmentLengths = sampleData.segmentLengths;
    this.length = sampleData.totalLength;
    const expandedPatterns = expandObstaclePatterns(definition.obstacles ?? [], {
      length: this.length,
      sampleAtProgress: (progress) => {
        const sample = this.sampleAtDistance(this.length * progress);
        return { x: sample.x, z: sample.z, heading: sample.heading, roadWidth: sample.roadWidth };
      },
      resolveWorldPlacement: (x, z) => {
        const query = this.queryAt(x, z);
        const usableHalfWidth = Math.max(1, query.roadHalfWidth - 1.2);
        return {
          progress: query.progress,
          lateral: Math.max(-0.92, Math.min(0.92, -query.lateralDistance / usableHalfWidth)),
        };
      },
    });
    this.obstaclePatterns = expandedPatterns.groups;
    const baseObstacles = expandedPatterns.obstacles.map((obstacle) => {
      const placement = this.resolveObstaclePlacement(obstacle);
      const isBoxObstacle = obstacle.kind === "barrier" || obstacle.kind === "fence" || obstacle.kind === "wall" || obstacle.kind === "safety-block";
      const visualScale = obstacle.radius / 1.7;
      return {
        ...obstacle,
        ...placement,
        destructible: obstacle.destructible ?? false,
        active: true,
        shape: isBoxObstacle ? "box" : "circle",
        halfWidth: isBoxObstacle ? (obstacle.kind === "wall" ? 1.8 : obstacle.kind === "safety-block" ? 1 : 1.4) * visualScale : obstacle.radius,
        halfDepth: isBoxObstacle ? (obstacle.kind === "wall" ? 0.5 : obstacle.kind === "safety-block" ? 0.72 : 0.325) * visualScale : obstacle.radius,
        rotationY: placement.rotationY,
      };
    });
    this.shortcutZones = [...(definition.shortcutZones ?? [])].map((shortcut) => ({
      ...shortcut,
      obstacleId: expandedPatterns.firstChildBySourceId.get(shortcut.obstacleId) ?? shortcut.obstacleId,
    }));
    this.gameplayBeats = [...(definition.gameplayBeats ?? [])].sort((first, second) => first.progress - second.progress);
    this.routeGraph = definition.routeGraph ? new RallyRouteGraph(definition.routeGraph) : null;
    this.environmentVariant = definition.environmentVariant ?? "dry";
    this.visualTheme = getRallyVisualTheme(this.id, this.environmentVariant);
    this.obstacles = [...baseObstacles, ...this.createSafetyBlockObstacles(definition.safetyBlockZones ?? [], baseObstacles)];
    this.pickups = this.createPickups(definition.pickups ?? []);
    this.guidance = this.createGuidanceMarkers();
    this.scenery = this.createSceneryPlacements();
    this.createStaticColliders();
    this.buildVisuals();
  }

  sampleAtDistance(distance: number): TrackSample {
    const wrapped = wrapDistance(distance, this.length);
    const index = this.segmentIndexAtDistance(wrapped);
    const nextIndex = (index + 1) % this.segments;
    const current = this.samples[index];
    const next = this.samples[nextIndex];
    const segmentStart = current.distance;
    const segmentLength = this.segmentLengths[index] ?? 0;
    const amount = segmentLength > 0
      ? Math.max(0, Math.min(1, (wrapped - segmentStart) / segmentLength))
      : 0;
    return {
      x: lerp(current.x, next.x, amount),
      y: lerp(current.y, next.y, amount),
      z: lerp(current.z, next.z, amount),
      tangentX: lerp(current.tangentX, next.tangentX, amount),
      tangentZ: lerp(current.tangentZ, next.tangentZ, amount),
      heading: Math.atan2(lerp(current.tangentX, next.tangentX, amount), lerp(current.tangentZ, next.tangentZ, amount)),
      distance: wrapped,
      roadWidth: lerp(current.roadWidth, next.roadWidth, amount),
    };
  }

  sampleCheckpoint(index: number): TrackSample {
    const fraction = index === this.checkpoints.length ? 0 : this.checkpoints[index];
    return this.sampleAtDistance(this.length * fraction);
  }

  nearest(x: number, z: number, hintSegment?: number): TrackNearestPoint {
    return this.queryAt(x, z, hintSegment);
  }

  queryAt(x: number, z: number, hintSegment?: number): RallyTrackQuery {
    // A hint belongs to the caller (player, AI, suspension, etc.). Queries
    // without one must be independent: a shared mutable track hint lets a
    // terrain, scenery, or another car query change somebody else's result.
    const local = hintSegment === undefined
      ? this.searchNearest(x, z)
      : this.searchNearest(x, z, hintSegment, 6);
    // A teleport, reset, or off-road shortcut can move the car farther than
    // the local window. Only then pay for a complete fallback search.
    const nearest = hintSegment !== undefined && local.distanceSquared > RALLY_CONFIG.track.queryFallbackDistance ** 2
      ? this.searchNearest(x, z, undefined)
      : local;
    const roadHalfWidth = nearest.roadWidth * 0.5;
    const shoulderHalfWidth = roadHalfWidth + nearest.roadWidth * RALLY_CONFIG.track.shoulderWidthRatio;
    const gravelHalfWidth = nearest.roadWidth * RALLY_CONFIG.track.gravelHalfWidthRatio;
    const terrainBlendWidth = Math.max(0.01, shoulderHalfWidth - roadHalfWidth);
    const distanceOutsideRoad = Math.max(0, Math.abs(nearest.lateralDistance) - roadHalfWidth);
    const roadBlend = Math.max(0, 1 - distanceOutsideRoad / terrainBlendWidth);
    const groundHeight = lerp(this.baseGroundHeight(x, z), nearest.y, roadBlend * roadBlend);
    const onRoad = Math.abs(nearest.lateralDistance) <= roadHalfWidth;
    const defaultSurface: RallySurface = onRoad
      ? "road"
      : Math.abs(nearest.lateralDistance) <= gravelHalfWidth ? "gravel" : "grass";
    const surface = this.surfaceAtProgress(nearest.distance / this.length, defaultSurface);
    return {
      ...nearest,
      groundHeight,
      onRoad,
      roadHalfWidth,
      shoulderHalfWidth,
      gravelHalfWidth,
      surface,
      progress: this.length > 0 ? nearest.distance / this.length : 0,
    };
  }

  /**
   * Look ahead along the physical racing line instead of guessing curvature
   * from renderer geometry. The result is shared by mobile input and race
   * rules, so Canvas and WebGL make the same throttle/drift decisions.
   */
  upcomingTurnAt(query: RallyTrackQuery, speed: number, boostActive = false): RallyUpcomingTurn {
    const absoluteSpeed = Math.max(0, Number.isFinite(speed) ? Math.abs(speed) : 0);
    const nearDistance = Math.max(7, absoluteSpeed * (boostActive ? 0.32 : 0.24));
    const midDistance = Math.max(15, absoluteSpeed * (boostActive ? 0.62 : 0.5));
    const farDistance = Math.max(28, absoluteSpeed * (boostActive ? 1.08 : 0.9));
    const near = this.sampleAtDistance(query.distance + nearDistance);
    const mid = this.sampleAtDistance(query.distance + midDistance);
    const far = this.sampleAtDistance(query.distance + farDistance);
    const nearDelta = wrapAngle(near.heading - query.heading);
    const midDelta = wrapAngle(mid.heading - query.heading);
    const farDelta = wrapAngle(far.heading - query.heading);
    const headingDelta = wrapAngle(nearDelta * 0.25 + midDelta * 0.4 + farDelta * 0.35);
    const strength = Math.max(0, Math.min(1, (
      Math.abs(nearDelta) * 0.45
      + Math.abs(midDelta) * 0.85
      + Math.abs(farDelta) * 0.65
    ) / 0.92));
    const recommendedSpeed = RALLY_CONFIG.vehicle.maxSpeed
      * Math.max(0.54, Math.min(1, 1 - strength * 0.54));
    const requiredDeceleration = 7.5 + strength * 5.5;
    const brakingDistance = absoluteSpeed > recommendedSpeed
      ? (absoluteSpeed ** 2 - recommendedSpeed ** 2) / (2 * requiredDeceleration)
      : 0;
    return {
      strength,
      direction: Math.abs(headingDelta) < 0.03 ? 0 : Math.sign(headingDelta),
      headingDelta,
      distanceAhead: nearDistance,
      recommendedSpeed,
      nearHeadingDelta: nearDelta,
      midHeadingDelta: midDelta,
      farHeadingDelta: farDelta,
      nearDistance,
      midDistance,
      farDistance,
      brakingDistance,
      requiredDeceleration,
      targetHeading: wrapAngle(query.heading + headingDelta),
    };
  }

  private surfaceAtProgress(progress: number, fallback: RallySurface): RallySurface {
    for (const zone of this.definition.surfaceZones ?? []) {
      const wraps = zone.start > zone.end;
      const inside = wraps
        ? progress >= zone.start || progress < zone.end
        : progress >= zone.start && progress < zone.end;
      if (inside) return zone.surface;
    }
    return fallback;
  }

  groundHeight(x: number, z: number): number {
    return this.queryAt(x, z).groundHeight;
  }

  isOnRoad(x: number, z: number): boolean {
    return this.queryAt(x, z).onRoad;
  }

  obstacleCollision(x: number, z: number, vehicleRadius: number): RallyObstacleCollision | null {
    const collision = this.staticCollision(x, z, vehicleRadius);
    if (!collision || collision.source !== "obstacle") return null;
    const obstacle = this.obstacles.find((candidate) => candidate.id === collision.id);
    return obstacle ? { ...obstacle, normalX: collision.normalX, normalZ: collision.normalZ, penetration: collision.penetration } : null;
  }

  staticCollision(x: number, z: number, vehicleRadius: number): RallyStaticCollision | null {
    for (const collider of this.staticColliders) {
      if (!collider.active || !collider.solid) continue;
      const collision = collider.shape === "circle"
        ? this.circleCollision(collider, x, z, vehicleRadius)
        : this.boxCollision(collider, x, z, vehicleRadius);
      if (collision) return collision;
    }
    return null;
  }

  staticColliderAhead(
    x: number,
    z: number,
    heading: number,
    maxDistance: number,
    lateralPadding: number,
  ): RallyStaticCollider | null {
    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);
    const rightX = Math.cos(heading);
    const rightZ = -Math.sin(heading);
    for (const collider of this.staticColliders) {
      if (!collider.active || !collider.solid) continue;
      const dx = collider.x - x;
      const dz = collider.z - z;
      const forwardDistance = dx * forwardX + dz * forwardZ;
      const lateralDistance = Math.abs(dx * rightX + dz * rightZ);
      if (forwardDistance < -1 || forwardDistance > maxDistance) continue;
      const radius = collider.shape === "circle"
        ? collider.radius
        : Math.hypot(collider.halfWidth, collider.halfDepth);
      if (lateralDistance <= radius + lateralPadding) return collider;
    }
    return null;
  }

  pickupCollision(x: number, z: number, radius: number, ownerId = "player"): RallyPickup | null {
    const maximum = Math.max(0, radius);
    const collected = this.pickupOwners.get(ownerId);
    let nearest: RallyPickup | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const pickup of this.pickups) {
      // `active` is the player-facing visual state. AI participants have
      // their own collected set so one driver's route choice never removes a
      // pickup from another driver's race.
      if ((ownerId === "player" && !pickup.active) || collected?.has(pickup.id)) continue;
      const distance = Math.hypot(pickup.x - x, pickup.z - z);
      if (distance > maximum || distance >= nearestDistance) continue;
      nearest = pickup;
      nearestDistance = distance;
    }
    return nearest;
  }

  collectPickup(id: string, ownerId = "player"): boolean {
    const pickup = this.pickups.find((candidate) => candidate.id === id);
    if (!pickup) return false;
    if (ownerId === "player") {
      if (!pickup.active) return false;
      pickup.active = false;
      this.packPickupInstances();
      return true;
    }
    let collected = this.pickupOwners.get(ownerId);
    if (!collected) {
      collected = new Set<string>();
      this.pickupOwners.set(ownerId, collected);
    }
    if (collected.has(id)) return false;
    collected.add(id);
    return true;
  }

  /** Find the nearest available pickup ahead of a participant on the loop. */
  pickupAhead(progress: number, maxDistance: number, ownerId = "player"): RallyPickup | null {
    const loopProgress = Number.isFinite(progress) ? ((progress % 1) + 1) % 1 : 0;
    const maximum = Math.max(0, maxDistance);
    const collected = this.pickupOwners.get(ownerId);
    let nearest: RallyPickup | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const pickup of this.pickups) {
      if ((ownerId === "player" && !pickup.active) || collected?.has(pickup.id)) continue;
      const delta = ((pickup.progress - loopProgress) + 1) % 1;
      const distance = delta * this.length;
      if (distance > maximum || distance >= nearestDistance) continue;
      nearest = pickup;
      nearestDistance = distance;
    }
    return nearest;
  }

  resetPickups(): void {
    this.pickups.forEach((pickup) => { pickup.active = true; });
    this.pickupOwners.clear();
    this.packPickupInstances();
  }

  destroyObstacle(id: string): boolean {
    const obstacle = this.obstacles.find((candidate) => candidate.id === id);
    if (!obstacle || !obstacle.active || !obstacle.destructible) return false;
    obstacle.active = false;
    const collider = this.staticColliders.find((candidate) => candidate.id === id && candidate.source === "obstacle");
    if (collider) collider.active = false;
    this.obstacleMeshes.get(id)?.removeFromParent();
    if (obstacle.kind === "safety-block") this.packSafetyBlockInstances();
    return true;
  }

  resetObstacles(): void {
    for (const obstacle of this.obstacles) {
      obstacle.active = true;
      const collider = this.staticColliders.find((candidate) => candidate.id === obstacle.id && candidate.source === "obstacle");
      if (collider) collider.active = true;
      const mesh = this.obstacleMeshes.get(obstacle.id);
      if (mesh && mesh.parent !== this.group) this.group.add(mesh);
    }
    this.packSafetyBlockInstances();
    this.resetPickups();
  }

  setGraphicsQuality(quality: RallyGraphicsQuality): void {
    const multiplier = quality === "low" ? 0.45 : quality === "high" ? 1 : 0.75;
    this.sceneryMeshes.forEach((mesh, index) => {
      const fullCount = this.sceneryCounts[index] ?? mesh.count;
      const items = this.sceneryItemsByMesh[index] ?? [];
      const solidCount = this.scenerySolidCounts[index] ?? items.filter((item) => item.solid).length;
      const decorativeCount = Math.max(0, fullCount - solidCount);
      const visibleCount = Math.min(fullCount, solidCount + Math.floor(decorativeCount * multiplier));
      mesh.count = visibleCount;
      items.forEach((item, itemIndex) => { item.visible = itemIndex < visibleCount; });
    });
  }

  private searchNearest(x: number, z: number, hintSegment?: number, radius?: number): TrackNearestPoint {
    let best = this.samples[0];
    let bestDistanceSquared = Number.POSITIVE_INFINITY;
    let bestLateral = 0;
    let bestSegmentIndex = 0;
    const searchRadius = radius ?? 0;
    const candidateCount = hintSegment === undefined ? this.segments : searchRadius * 2 + 1;
    for (let offset = 0; offset < candidateCount; offset += 1) {
      // Search the hinted segment first, then expand in both directions. A
      // sequential wrapped window used to inspect `hint - radius` first; at
      // the start vertex that made the closing segment win an exact-distance
      // tie over segment zero and flipped a hover racer backwards during the
      // countdown. The centered order keeps temporal locality while the
      // existing distance fallback still handles real jumps/teleports.
      const localOffset = hintSegment === undefined
        ? offset
        : offset === 0 ? 0 : offset % 2 === 1 ? (offset + 1) / 2 : -(offset / 2);
      const raw = hintSegment === undefined ? localOffset : hintSegment + localOffset;
      const index = (raw % this.segments + this.segments) % this.segments;
      const current = this.samples[index];
      const next = this.samples[(index + 1) % this.segments];
      const segmentLength = this.segmentLengths[index] ?? 0;
      const dx = next.x - current.x;
      const dz = next.z - current.z;
      const lengthSquared = dx * dx + dz * dz;
      const amount = lengthSquared > 0
        ? Math.max(0, Math.min(1, ((x - current.x) * dx + (z - current.z) * dz) / lengthSquared))
        : 0;
      const sampleX = current.x + dx * amount;
      const sampleZ = current.z + dz * amount;
      const sampleY = lerp(current.y, next.y, amount);
      const distanceSquared = (x - sampleX) ** 2 + (z - sampleZ) ** 2;
      if (distanceSquared < bestDistanceSquared) {
        bestDistanceSquared = distanceSquared;
        const tangentLength = Math.hypot(dx, dz) || 1;
        const tangentX = dx / tangentLength;
        const tangentZ = dz / tangentLength;
        best = {
          x: sampleX,
          y: sampleY,
          z: sampleZ,
          tangentX,
          tangentZ,
          heading: Math.atan2(tangentX, tangentZ),
          distance: wrapDistance(current.distance + segmentLength * amount, this.length),
          roadWidth: lerp(current.roadWidth, next.roadWidth, amount),
          segmentIndex: index,
        };
        bestLateral = (x - sampleX) * tangentZ - (z - sampleZ) * tangentX;
        bestSegmentIndex = index;
      }
    }
    return {
      ...best,
      lateralDistance: bestLateral,
      distanceSquared: bestDistanceSquared,
      segmentIndex: bestSegmentIndex,
    };
  }

  private baseGroundHeight(x: number, z: number): number {
    return 0.2
      + Math.sin(x * 0.13) * 0.38
      + Math.cos(z * 0.075 + x * 0.04) * 0.28
      + Math.sin((x + z) * 0.045) * 0.22;
  }

  dispose(): void {
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
      else mesh.material.dispose();
    });
  }

  private segmentIndexAtDistance(distance: number): number {
    let low = 0;
    let high = this.samples.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (this.samples[middle].distance <= distance) low = middle + 1;
      else high = middle - 1;
    }
    return Math.max(0, Math.min(this.segments - 1, high));
  }

  private createSamples(): {
    samples: TrackSample[];
    segmentLengths: number[];
    totalLength: number;
  } {
    const samples: TrackSample[] = [];
    const raw: Array<{ x: number; y: number; z: number; roadWidth: number }> = [];
    const pointCount = this.definition.controlPoints.length;
    const catmull = (a: number, b: number, c: number, d: number, amount: number): number => {
      const amountSquared = amount * amount;
      const amountCubed = amountSquared * amount;
      return 0.5 * ((2 * b) + (-a + c) * amount + (2 * a - 5 * b + 4 * c - d) * amountSquared
        + (-a + 3 * b - 3 * c + d) * amountCubed);
    };
    for (let index = 0; index < this.segments; index += 1) {
      const routePosition = (index / this.segments) * pointCount;
      const pointIndex = Math.floor(routePosition);
      const amount = routePosition - pointIndex;
      const point = (offset: number): TrackControlPoint => this.definition.controlPoints[
        (pointIndex + offset + pointCount) % pointCount
      ];
      const previous = point(-1);
      const current = point(0);
      const next = point(1);
      const following = point(2);
      raw.push({
        x: catmull(previous.x, current.x, next.x, following.x, amount),
        y: catmull(previous.y, current.y, next.y, following.y, amount),
        z: catmull(previous.z, current.z, next.z, following.z, amount),
        // Hover racing needs a usable lateral envelope even where legacy
        // control points were authored for wheel-based rally handling. The
        // definition roadWidth is the canonical minimum for both mesh and
        // physics; wider authored sections remain wider.
        roadWidth: Math.max(this.definition.roadWidth, lerp(current.width ?? this.definition.roadWidth, next.width ?? this.definition.roadWidth, amount)),
      });
    }
    let distance = 0;
    const segmentLengths: number[] = [];
    for (let index = 0; index < this.segments; index += 1) {
      const current = raw[index];
      const next = raw[(index + 1) % this.segments];
      const previous = raw[(index + this.segments - 1) % this.segments];
      const tangentX = next.x - previous.x;
      const tangentZ = next.z - previous.z;
      const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
      const segmentLength = Math.hypot(next.x - current.x, next.z - current.z);
      segmentLengths.push(segmentLength);
      samples.push({
        x: current.x,
        y: current.y,
        z: current.z,
        tangentX: tangentX / tangentLength,
        tangentZ: tangentZ / tangentLength,
        heading: Math.atan2(tangentX, tangentZ),
        distance,
        roadWidth: current.roadWidth,
      });
      distance += segmentLength;
    }
    return { samples, segmentLengths, totalLength: distance };
  }

  private resolveObstaclePlacement(obstacle: TrackObstacleDefinition): { x: number; z: number; rotationY: number } {
    const hasRoadPlacement = typeof obstacle.progress === "number"
      && Number.isFinite(obstacle.progress)
      && typeof obstacle.lateral === "number"
      && Number.isFinite(obstacle.lateral);
    if (hasRoadPlacement) {
      const sample = this.sampleAtDistance(this.length * Math.max(0, Math.min(1, obstacle.progress ?? 0)));
      const sideX = -sample.tangentZ;
      const sideZ = sample.tangentX;
      const lateral = Math.max(-0.92, Math.min(0.92, obstacle.lateral ?? 0));
      const usableHalfWidth = Math.max(1, sample.roadWidth * 0.5 - 1.2);
      return {
        x: sample.x + sideX * usableHalfWidth * lateral,
        z: sample.z + sideZ * usableHalfWidth * lateral,
        rotationY: obstacle.rotationY ?? sample.heading,
      };
    }
    return {
      x: obstacle.x ?? 0,
      z: obstacle.z ?? 0,
      rotationY: obstacle.rotationY ?? 0,
    };
  }

  private buildVisuals(): void {
    this.group.add(this.buildTerrainMesh());
    this.group.add(this.buildRoadMesh());
    this.group.add(this.buildRoadBoundaryMesh());
    this.group.add(this.buildRoadSurfaceMesh());
    this.group.add(this.buildRoadMarkings());
    this.group.add(this.buildVoxelScenery());
    this.buildObstacleVisuals();
    this.buildPickupVisuals();
    this.buildGuidanceVisuals();
    this.samples.forEach((sample, index) => {
      if (index === 0) this.group.add(this.createGate(sample, this.visualTheme.start, "START"));
    });
    this.checkpoints.forEach((fraction, index) => {
      this.group.add(this.createGate(this.sampleAtDistance(this.length * fraction), this.visualTheme.checkpoint, `CHECKPOINT ${index + 1}`));
    });
    this.group.add(this.createGate(this.sampleCheckpoint(this.checkpoints.length), this.visualTheme.goal, "GOAL"));
  }

  private buildTerrainMesh(): THREE.Mesh {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const color = new THREE.Color();
    const columns = Math.round((TERRAIN_MAX_X - TERRAIN_MIN_X) / TERRAIN_STEP);
    const rows = Math.round((TERRAIN_MAX_Z - TERRAIN_MIN_Z) / TERRAIN_STEP);
    const vertices: number[][] = [];
    for (let row = 0; row <= rows; row += 1) {
      vertices[row] = [];
      const z = TERRAIN_MIN_Z + row * TERRAIN_STEP;
      for (let column = 0; column <= columns; column += 1) {
        const x = TERRAIN_MIN_X + column * TERRAIN_STEP;
        const y = this.groundHeight(x, z) - RALLY_CONFIG.track.terrainVisualEpsilon;
        const shade = 0.19 + ((row + column) % 3) * 0.025;
        color.set(this.visualTheme.terrain);
        color.multiplyScalar(0.72 + shade);
        vertices[row][column] = appendVertex(positions, colors, x, y, z, color);
      }
    }
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        appendQuad(indices, vertices[row][column], vertices[row][column + 1], vertices[row + 1][column + 1], vertices[row + 1][column]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    return new THREE.Mesh(geometry, material);
  }

  private buildRoadMesh(): THREE.Mesh {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const roadColor = new THREE.Color(this.visualTheme.road);
    const edgeColor = new THREE.Color(this.visualTheme.roadEdge);
    const leftIndices: number[] = [];
    const rightIndices: number[] = [];
    const centerLeftIndices: number[] = [];
    const centerRightIndices: number[] = [];
    for (let index = 0; index <= this.segments; index += 1) {
      const sample = this.sampleAtDistance((this.length * index) / this.segments);
      const sideX = -sample.tangentZ;
      const sideZ = sample.tangentX;
      const halfWidth = sample.roadWidth / 2;
      const left = appendVertex(positions, colors, sample.x + sideX * halfWidth, sample.y + RALLY_CONFIG.track.roadVisualEpsilon, sample.z + sideZ * halfWidth, edgeColor);
      const right = appendVertex(positions, colors, sample.x - sideX * halfWidth, sample.y + RALLY_CONFIG.track.roadVisualEpsilon, sample.z - sideZ * halfWidth, edgeColor);
      leftIndices.push(left);
      rightIndices.push(right);
      if (index > 0) {
        appendQuad(indices, leftIndices[index - 1], rightIndices[index - 1], right, left);
      }
      if (index % 2 === 0) {
        const centerLeft = appendVertex(positions, colors, sample.x + sideX * 0.18, sample.y + RALLY_CONFIG.track.roadVisualEpsilon + 0.01, sample.z + sideZ * 0.18, roadColor);
        const centerRight = appendVertex(positions, colors, sample.x - sideX * 0.18, sample.y + RALLY_CONFIG.track.roadVisualEpsilon + 0.01, sample.z - sideZ * 0.18, roadColor);
        centerLeftIndices.push(centerLeft);
        centerRightIndices.push(centerRight);
      }
    }
    for (let index = 1; index < centerLeftIndices.length; index += 1) {
      appendQuad(indices, centerLeftIndices[index - 1], centerRightIndices[index - 1], centerRightIndices[index], centerLeftIndices[index]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  }

  private buildRoadBoundaryMesh(): THREE.Mesh {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const edgeColor = new THREE.Color(this.visualTheme.roadEdge);
    const shoulderColor = new THREE.Color(this.visualTheme.shoulder);
    const edgeLeftInner: number[] = [];
    const edgeLeftOuter: number[] = [];
    const edgeRightInner: number[] = [];
    const edgeRightOuter: number[] = [];
    const shoulderLeftInner: number[] = [];
    const shoulderLeftOuter: number[] = [];
    const shoulderRightInner: number[] = [];
    const shoulderRightOuter: number[] = [];
    for (let index = 0; index <= this.segments; index += 1) {
      const sample = this.sampleAtDistance((this.length * index) / this.segments);
      const query = this.queryAt(sample.x, sample.z);
      const sideX = -sample.tangentZ;
      const sideZ = sample.tangentX;
      const roadHalf = query.roadHalfWidth;
      const shoulderHalf = query.shoulderHalfWidth;
      const gravelHalf = query.gravelHalfWidth;
      const add = (side: number, distance: number, color: THREE.Color): number => {
        const x = sample.x + sideX * distance * side;
        const z = sample.z + sideZ * distance * side;
        return appendVertex(positions, colors, x, this.queryAt(x, z).groundHeight + RALLY_CONFIG.track.roadVisualEpsilon * 0.7, z, color);
      };
      edgeLeftInner.push(add(1, roadHalf, edgeColor));
      edgeLeftOuter.push(add(1, shoulderHalf, edgeColor));
      edgeRightInner.push(add(-1, roadHalf, edgeColor));
      edgeRightOuter.push(add(-1, shoulderHalf, edgeColor));
      shoulderLeftInner.push(add(1, shoulderHalf, shoulderColor));
      shoulderLeftOuter.push(add(1, gravelHalf, shoulderColor));
      shoulderRightInner.push(add(-1, shoulderHalf, shoulderColor));
      shoulderRightOuter.push(add(-1, gravelHalf, shoulderColor));
      if (index > 0) {
        appendQuad(indices, edgeLeftInner[index - 1], edgeLeftOuter[index - 1], edgeLeftOuter[index], edgeLeftInner[index]);
        appendQuad(indices, edgeRightOuter[index - 1], edgeRightInner[index - 1], edgeRightInner[index], edgeRightOuter[index]);
        appendQuad(indices, shoulderLeftInner[index - 1], shoulderLeftOuter[index - 1], shoulderLeftOuter[index], shoulderLeftInner[index]);
        appendQuad(indices, shoulderRightOuter[index - 1], shoulderRightInner[index - 1], shoulderRightInner[index], shoulderRightOuter[index]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.name = "rally-road-boundaries";
    return mesh;
  }

  private buildRoadSurfaceMesh(): THREE.Mesh {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const leftIndices: number[] = [];
    const rightIndices: number[] = [];
    const color = new THREE.Color();
    for (let index = 0; index <= this.segments; index += 1) {
      const progress = index / this.segments;
      const sample = this.sampleAtDistance(this.length * progress);
      const query = this.queryAt(sample.x, sample.z);
      color.set(this.surfaceVisualColor(query.surface));
      const sideX = -sample.tangentZ;
      const sideZ = sample.tangentX;
      const halfWidth = query.roadHalfWidth * 0.985;
      const y = sample.y + RALLY_CONFIG.track.roadVisualEpsilon + 0.018;
      leftIndices.push(appendVertex(positions, colors, sample.x + sideX * halfWidth, y, sample.z + sideZ * halfWidth, color));
      rightIndices.push(appendVertex(positions, colors, sample.x - sideX * halfWidth, y, sample.z - sideZ * halfWidth, color));
      if (index > 0) appendQuad(indices, leftIndices[index - 1], rightIndices[index - 1], rightIndices[index], leftIndices[index]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.name = "rally-road-surface";
    return mesh;
  }

  private buildRoadMarkings(): THREE.LineSegments {
    const positions: number[] = [];
    const dashCount = Math.max(1, Math.floor(this.segments / 6));
    for (let index = 0; index < this.segments; index += 6) {
      const start = this.sampleAtDistance((this.length * index) / this.segments + 0.12);
      const end = this.sampleAtDistance((this.length * (index + 2.6)) / this.segments);
      positions.push(start.x, start.y + RALLY_CONFIG.track.roadVisualEpsilon + 0.045, start.z, end.x, end.y + RALLY_CONFIG.track.roadVisualEpsilon + 0.045, end.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setDrawRange(0, dashCount * 2);
    const material = new THREE.LineBasicMaterial({ color: this.visualTheme.accent, transparent: true, opacity: 0.82, depthWrite: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = "rally-road-markings";
    return lines;
  }

  private surfaceVisualColor(surface: RallySurface): number {
    if (surface === "road" || surface === "asphalt") return this.visualTheme.road;
    if (surface === "dirt" || surface === "gravel") return this.visualTheme.shoulder;
    if (surface === "mud") return this.visualTheme.rock;
    return this.visualTheme.terrainAlt;
  }

  private createGuidanceMarkers(): RallyGuidanceMarker[] {
    const markers: RallyGuidanceMarker[] = [];
    const stepDistance = this.length / this.segments;
    let lastCornerProgress = -1;
    for (let index = 0; index < this.segments; index += 4) {
      const distance = index * stepDistance;
      const previous = this.sampleAtDistance(distance - stepDistance * 2);
      const current = this.sampleAtDistance(distance);
      const next = this.sampleAtDistance(distance + stepDistance * 2);
      const turn = Math.abs(wrapAngle(Math.atan2(next.tangentX, next.tangentZ) - Math.atan2(previous.tangentX, previous.tangentZ)));
      const progress = current.distance / this.length;
      if (turn > 0.22 && (lastCornerProgress < 0 || Math.abs(progress - lastCornerProgress) > 0.045)) {
        markers.push({
          id: `${this.id}-corner-${markers.length + 1}`,
          kind: "corner",
          progress,
          x: current.x,
          y: current.y,
          z: current.z,
          heading: current.heading,
          roadWidth: current.roadWidth,
          intensity: Math.min(1, turn / 0.9),
          label: turn > 0.62 ? "HAIRPIN" : "TURN",
        });
        lastCornerProgress = progress;
      }
      const slopeIn = current.y - previous.y;
      const slopeOut = next.y - current.y;
      if (slopeIn > 0.08 && slopeOut < -0.08) {
        markers.push({
          id: `${this.id}-jump-${markers.length + 1}`,
          kind: "jump",
          progress,
          x: current.x,
          y: current.y,
          z: current.z,
          heading: current.heading,
          roadWidth: current.roadWidth,
          intensity: Math.min(1, Math.abs(slopeIn - slopeOut) / 0.8),
          label: "JUMP",
        });
      }
    }
    for (const edge of this.routeGraph?.edges ?? []) {
      if (edge.kind !== "jump") continue;
      const sample = this.sampleAtDistance(this.length * edge.startProgress);
      markers.push({
        id: `${this.id}-${edge.id}-guide`,
        kind: "jump",
        progress: edge.startProgress,
        x: sample.x,
        y: sample.y,
        z: sample.z,
        heading: sample.heading,
        roadWidth: sample.roadWidth,
        intensity: 1,
        label: "JUMP",
      });
    }
    for (const beat of this.gameplayBeats) {
      if (beat.kind !== "jump") continue;
      if (markers.some((marker) => marker.kind === "jump" && Math.abs(marker.progress - beat.progress) < 0.05)) continue;
      const sample = this.sampleAtDistance(this.length * beat.progress);
      markers.push({
        id: `${this.id}-${beat.id}-guide`,
        kind: "jump",
        progress: beat.progress,
        x: sample.x,
        y: sample.y,
        z: sample.z,
        heading: sample.heading,
        roadWidth: sample.roadWidth,
        intensity: 0.9,
        label: beat.label,
      });
    }
    for (const shortcut of this.shortcutZones) {
      const query = this.queryAt(shortcut.entryX, shortcut.entryZ);
      markers.push({
        id: `${shortcut.id}-guide`,
        kind: "shortcut",
        progress: query.progress,
        x: shortcut.entryX,
        y: query.groundHeight,
        z: shortcut.entryZ,
        heading: query.heading,
        roadWidth: query.roadWidth,
        intensity: 1,
        label: "SHORTCUT",
      });
    }
    return markers.sort((a, b) => a.progress - b.progress);
  }

  private buildGuidanceVisuals(): void {
    const group = new THREE.Group();
    group.name = "rally-guidance";
    const cornerGeometry = new THREE.BoxGeometry(2.4, 0.16, 0.16);
    const jumpGeometry = new THREE.BoxGeometry(3.1, 0.1, 0.62);
    const shortcutGeometry = new THREE.BoxGeometry(3.2, 0.12, 0.18);
    const cornerMaterial = new THREE.MeshLambertMaterial({ color: this.visualTheme.warning, emissive: this.visualTheme.warning, emissiveIntensity: 0.25, flatShading: true });
    const jumpMaterial = new THREE.MeshLambertMaterial({ color: this.visualTheme.accent, emissive: this.visualTheme.accent, emissiveIntensity: 0.3, flatShading: true });
    const shortcutMaterial = new THREE.MeshLambertMaterial({ color: this.visualTheme.shortcut, emissive: this.visualTheme.shortcut, emissiveIntensity: 0.35, flatShading: true });
    for (const marker of this.guidance) {
      const geometry = marker.kind === "corner" ? cornerGeometry : marker.kind === "jump" ? jumpGeometry : shortcutGeometry;
      const material = marker.kind === "corner" ? cornerMaterial : marker.kind === "jump" ? jumpMaterial : shortcutMaterial;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `rally-guidance-${marker.kind}`;
      const side = marker.kind === "corner" ? (marker.intensity > 0.55 ? 1 : -1) : 0;
      const sideX = -Math.cos(marker.heading) * side;
      const sideZ = Math.sin(marker.heading) * side;
      mesh.position.set(marker.x + sideX * (marker.kind === "corner" ? marker.roadWidth * 0.55 : 0), marker.y + (marker.kind === "corner" ? 1.8 : 0.08), marker.z + sideZ * (marker.kind === "corner" ? marker.roadWidth * 0.55 : 0));
      mesh.rotation.y = marker.heading;
      mesh.userData.guidance = marker;
      group.add(mesh);
    }
    this.group.add(group);
  }

  private buildVoxelScenery(): THREE.Group {
    const group = new THREE.Group();
    group.name = "rally-scenery";
    const geometryByKind: Record<RallySceneryKind, THREE.BufferGeometry> = {
      building: new THREE.BoxGeometry(3.6, 3.6, 3.6),
      tree: new THREE.ConeGeometry(1.8, 3.6, 6),
      rock: new THREE.DodecahedronGeometry(1.8, 0),
    };
    const colorByKind: Record<RallySceneryKind, number> = {
      building: this.visualTheme.building,
      tree: this.visualTheme.foliage,
      rock: this.visualTheme.rock,
    };
    for (const kind of ["building", "tree", "rock"] as const) {
      // Keep every solid instance at the front of its pool. InstancedMesh can
      // then reduce only decorative scenery with count without hiding a
      // collider that remains active in the shared physics world.
      const items = this.scenery
        .filter((item) => item.kind === kind)
        .sort((first, second) => Number(second.solid) - Number(first.solid) || first.id.localeCompare(second.id));
      const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      const mesh = new THREE.InstancedMesh(geometryByKind[kind], material, Math.max(1, items.length));
      mesh.name = `rally-scenery-${kind}`;
      const transform = new THREE.Object3D();
      const color = new THREE.Color(colorByKind[kind]);
      items.forEach((item, index) => {
        item.renderIndex = index;
        item.visible = true;
        transform.position.set(item.x, item.y, item.z);
        transform.scale.set(item.scaleX, item.scaleY, item.scaleZ);
        transform.rotation.y = item.rotationY;
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
        color.set(colorByKind[kind]);
        color.multiplyScalar(0.86 + (index % 3) * 0.07);
        mesh.setColorAt(index, color);
      });
      mesh.count = items.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.sceneryMeshes.push(mesh);
      this.sceneryCounts.push(mesh.count);
      this.sceneryItemsByMesh.push(items);
      this.scenerySolidCounts.push(items.filter((item) => item.solid).length);
      group.add(mesh);
    }
    return group;
  }

  private createSceneryPlacements(): RallySceneryInstance[] {
    const rules = this.definition.scenery ?? { count: 72, radiusX: 38, radiusZ: 82 };
    const controlPointCount = Math.max(1, this.definition.controlPoints.length);
    const centerX = this.definition.controlPoints.reduce((sum, point) => sum + point.x, 0) / controlPointCount;
    const centerZ = this.definition.controlPoints.reduce((sum, point) => sum + point.z, 0) / controlPointCount;
    const placements: RallySceneryInstance[] = [];
    const maxAttempts = Math.max(rules.count * 32, 64);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let attempt = 0; attempt < maxAttempts && placements.length < rules.count; attempt += 1) {
      const theta = attempt * goldenAngle + (this.id.length * 0.17);
      const radialX = rules.radiusX * (0.54 + ((attempt * 37) % 100) / 100 * 0.72);
      const radialZ = rules.radiusZ * (0.54 + ((attempt * 53) % 100) / 100 * 0.72);
      const x = centerX + Math.cos(theta) * radialX;
      const z = centerZ + Math.sin(theta) * radialZ;
      if (x < TERRAIN_MIN_X + 2 || x > TERRAIN_MAX_X - 2 || z < TERRAIN_MIN_Z + 2 || z > TERRAIN_MAX_Z - 2) continue;

      const kind: RallySceneryKind = attempt % 9 === 0 ? "building" : attempt % 3 === 0 ? "rock" : "tree";
      const scaleX = kind === "building" ? 0.9 + (attempt % 3) * 0.18 : 0.62 + (attempt % 3) * 0.13;
      const scaleZ = kind === "building" ? 0.82 + (attempt % 2) * 0.2 : 0.62 + ((attempt + 1) % 3) * 0.12;
      const scaleY = kind === "building" ? 1.35 + (attempt % 3) * 0.24 : 0.7 + (attempt % 3) * 0.22;
      const footprint = Math.max(scaleX, scaleZ) * 1.8;
      const query = this.queryAt(x, z);
      if (!this.isSceneryPositionClear(
        x,
        z,
        footprint,
        query.gravelHalfWidth + footprint + RALLY_CONFIG.track.scenerySafetyMargin * 2,
      )) continue;
      const height = 3.6 * scaleY;
      const solid = kind === "building" || attempt % 5 !== 0;
      placements.push({
        id: `${this.id}-scenery-${placements.length + 1}`,
        kind,
        x,
        y: query.groundHeight + height / 2 + RALLY_CONFIG.track.terrainVisualEpsilon,
        z,
        scaleX,
        scaleY,
        scaleZ,
        rotationY: theta,
        solid,
        priority: solid ? "solid" : "decorative",
        collisionRadius: footprint,
        footprint,
        height,
        visible: true,
        renderIndex: -1,
      });
    }
    return placements;
  }

  private isSceneryPositionClear(x: number, z: number, footprint: number, roadClearance: number): boolean {
    const query = this.queryAt(x, z);
    if (Math.abs(query.lateralDistance) <= roadClearance) return false;
    const gateDistances = [0, ...this.checkpoints, 1].map((progress) => this.sampleAtDistance(this.length * progress));
    for (const [gateIndex, gate] of gateDistances.entries()) {
      const gateClearance = gate.roadWidth * 0.5 + footprint + RALLY_CONFIG.track.scenerySafetyMargin;
      if ((x - gate.x) ** 2 + (z - gate.z) ** 2 < gateClearance ** 2) return false;
      if ((gateIndex === 0 || gateIndex === gateDistances.length - 1)
        && (x - gate.x) ** 2 + (z - gate.z) ** 2 < (RALLY_CONFIG.track.protectedGateClearance + footprint) ** 2) return false;
    }
    for (const shortcut of this.shortcutZones) {
      const shortcutClearance = footprint + RALLY_CONFIG.track.scenerySafetyMargin + 5;
      if ((x - shortcut.entryX) ** 2 + (z - shortcut.entryZ) ** 2 < shortcutClearance ** 2) return false;
      if ((x - shortcut.exitX) ** 2 + (z - shortcut.exitZ) ** 2 < shortcutClearance ** 2) return false;
    }
    for (const obstacle of this.obstacles) {
      if ((x - obstacle.x) ** 2 + (z - obstacle.z) ** 2 < (obstacle.radius + footprint + RALLY_CONFIG.track.scenerySafetyMargin) ** 2) return false;
    }
    for (const edge of this.routeGraph?.edges ?? []) {
      const corridor = edge.corridorRadius + footprint + RALLY_CONFIG.track.scenerySafetyMargin;
      if (distanceSquaredToSegment(x, z, edge.entryX, edge.entryZ, edge.exitX, edge.exitZ) < corridor ** 2) return false;
    }
    return true;
  }

  private createSafetyBlockObstacles(
    zones: readonly TrackSafetyBlockZone[],
    existing: readonly RallyObstacle[],
  ): RallyObstacle[] {
    const blocks: RallyObstacle[] = [];
    const footprint = 1.18;
    for (const zone of zones) {
      const start = Math.max(0, Math.min(1, zone.startProgress));
      const end = Math.max(start, Math.min(1, zone.endProgress));
      const spacing = Math.max(2.2, zone.spacing);
      const progressStep = spacing / Math.max(1, this.length);
      const sides = zone.side === "both" ? [-1, 1] : [zone.side === "left" ? 1 : -1];
      let blockIndex = 0;
      for (let progress = start; progress <= end + progressStep * 0.25; progress += progressStep) {
        const sample = this.sampleAtDistance(this.length * progress);
        const sideX = -sample.tangentZ;
        const sideZ = sample.tangentX;
        // `zone.offset` is measured from the physical road edge, rather than
        // from the center or from an invisible terrain shoulder. This keeps
        // the visible rescue row close enough to catch an ordinary mistake.
        const offset = sample.roadWidth * 0.5 + Math.max(0.8, Math.min(1.4, zone.offset));
        for (const side of sides) {
          const x = sample.x + sideX * offset * side;
          const z = sample.z + sideZ * offset * side;
          if (!this.isSafetyBlockPositionClear(x, z, progress, footprint, existing, blocks)) continue;
          blocks.push({
            id: `${this.id}-${zone.id}-${blockIndex + 1}`,
            x,
            z,
            radius: footprint,
            kind: "safety-block",
            destructible: true,
            active: true,
            shape: "box",
            halfWidth: footprint,
            halfDepth: 0.78,
            rotationY: sample.heading,
          });
          blockIndex += 1;
        }
      }
    }
    return blocks;
  }

  private createPickups(definitions: readonly TrackPickupDefinition[]): RallyPickup[] {
    const safePickups: RallyPickup[] = [];
    for (const definition of definitions) {
      const progress = Math.max(0, Math.min(1, definition.progress));
      const sample = this.sampleAtDistance(this.length * progress);
      const query = this.queryAt(sample.x, sample.z);
      const sideX = -sample.tangentZ;
      const sideZ = sample.tangentX;
      const lateral = Math.max(-0.92, Math.min(0.92, definition.lateral));
      const usableHalfWidth = Math.max(1, query.roadHalfWidth - RALLY_CONFIG.vehicle.bodyWidth * 0.55);
      const x = sample.x + sideX * usableHalfWidth * lateral;
      const z = sample.z + sideZ * usableHalfWidth * lateral;
      safePickups.push({
        id: definition.id,
        type: definition.type ?? "boost",
        progress,
        lateral,
        x,
        y: this.queryAt(x, z).groundHeight + 1.25,
        z,
        active: true,
      });
    }
    return safePickups;
  }

  private isSafetyBlockPositionClear(
    x: number,
    z: number,
    progress: number,
    footprint: number,
    existing: readonly RallyObstacle[],
    generated: readonly RallyObstacle[],
  ): boolean {
    const query = this.queryAt(x, z);
    if (Math.abs(query.lateralDistance) <= query.roadHalfWidth + 0.65) return false;
    const protectedGates = [0, ...this.checkpoints, 1].map((fraction) => this.sampleAtDistance(this.length * fraction));
    for (const gate of protectedGates) {
      if ((x - gate.x) ** 2 + (z - gate.z) ** 2 < (gate.roadWidth * 0.5 + footprint + RALLY_CONFIG.track.protectedGateClearance * 0.08) ** 2) return false;
    }
    for (const shortcut of this.shortcutZones) {
      if ((x - shortcut.entryX) ** 2 + (z - shortcut.entryZ) ** 2 < (footprint + 7) ** 2) return false;
      if ((x - shortcut.exitX) ** 2 + (z - shortcut.exitZ) ** 2 < (footprint + 7) ** 2) return false;
    }
    for (const beat of this.gameplayBeats) {
      if (beat.kind !== "jump") continue;
      const delta = Math.abs(beat.progress - progress);
      if (Math.min(delta, 1 - delta) < 0.065) return false;
    }
    for (const edge of this.routeGraph?.edges ?? []) {
      // The normal route is already protected by the road-edge clearance. Only
      // alternate route corridors must remain open for a roadside safety row.
      if (edge.kind === "normal") continue;
      const corridor = edge.corridorRadius + footprint + 2;
      if (distanceSquaredToSegment(x, z, edge.entryX, edge.entryZ, edge.exitX, edge.exitZ) < corridor ** 2) return false;
    }
    for (const obstacle of [...existing, ...generated]) {
      if ((x - obstacle.x) ** 2 + (z - obstacle.z) ** 2 < (footprint + obstacle.radius + 1.5) ** 2) return false;
    }
    return true;
  }

  private buildObstacleVisuals(): void {
    const geometryByKind: Record<Exclude<RallyObstacleKind, "safety-block">, THREE.BufferGeometry> = {
      tree: new THREE.ConeGeometry(1.5, 4.8, 6),
      rock: new THREE.DodecahedronGeometry(1.7, 0),
      barrier: new THREE.BoxGeometry(2.8, 1.2, 0.65),
      fence: new THREE.BoxGeometry(2.8, 1.3, 0.28),
      wall: new THREE.BoxGeometry(3.6, 2.4, 1),
    };
    const materialByKind: Record<Exclude<RallyObstacleKind, "safety-block">, THREE.Material> = {
      tree: new THREE.MeshLambertMaterial({ color: this.visualTheme.foliage, flatShading: true }),
      rock: new THREE.MeshLambertMaterial({ color: this.visualTheme.rock, flatShading: true }),
      barrier: new THREE.MeshLambertMaterial({ color: this.visualTheme.warning, flatShading: true }),
      fence: new THREE.MeshLambertMaterial({ color: 0xc48a4b, flatShading: true }),
      wall: new THREE.MeshLambertMaterial({ color: this.visualTheme.shortcut, emissive: this.visualTheme.shortcut, emissiveIntensity: 0.22, flatShading: true }),
    };
    const crackedRockMaterial = new THREE.MeshLambertMaterial({
      color: this.visualTheme.shortcut,
      emissive: this.visualTheme.shortcut,
      emissiveIntensity: 0.18,
      flatShading: true,
    });
    for (const obstacle of this.obstacles) {
      if (obstacle.kind === "safety-block") continue;
      const material = obstacle.kind === "rock" && obstacle.destructible
        ? crackedRockMaterial
        : materialByKind[obstacle.kind];
      const mesh = new THREE.Mesh(geometryByKind[obstacle.kind], material);
      mesh.position.set(
        obstacle.x,
        this.groundHeight(obstacle.x, obstacle.z)
          + (obstacle.kind === "barrier" || obstacle.kind === "fence" ? 0.65 : obstacle.kind === "wall" ? 1.2 : 2.1),
        obstacle.z,
      );
      mesh.scale.setScalar(obstacle.radius / 1.7);
      mesh.rotation.y = obstacle.rotationY;
      mesh.userData.obstacleId = obstacle.id;
      mesh.userData.destructible = obstacle.destructible;
      mesh.userData.pattern = obstacle.pattern;
      this.obstacleMeshes.set(obstacle.id, mesh);
      this.group.add(mesh);
    }
    const safetyBlocks = this.obstacles.filter((obstacle) => obstacle.kind === "safety-block");
    if (safetyBlocks.length > 0) {
      this.safetyBlockMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(2.2, 1.6, 1.6),
        new THREE.MeshLambertMaterial({ color: this.visualTheme.shortcut, emissive: this.visualTheme.shortcut, emissiveIntensity: 0.26, flatShading: true }),
        safetyBlocks.length,
      );
      this.safetyBlockMesh.name = "rally-voxel-safety-blocks";
      this.group.add(this.safetyBlockMesh);
      this.packSafetyBlockInstances();
    }
  }

  private buildPickupVisuals(): void {
    if (this.pickups.length === 0) return;
    const geometry = new THREE.OctahedronGeometry(0.72, 0);
    const material = new THREE.MeshLambertMaterial({
      color: this.visualTheme.accent,
      emissive: this.visualTheme.accent,
      emissiveIntensity: 0.55,
      flatShading: true,
    });
    this.pickupMesh = new THREE.InstancedMesh(geometry, material, this.pickups.length);
    this.pickupMesh.name = "rally-boost-pickups";
    this.group.add(this.pickupMesh);
    this.packPickupInstances();
  }

  private packPickupInstances(): void {
    if (!this.pickupMesh) return;
    const active = this.pickups.filter((pickup) => pickup.active);
    active.forEach((pickup, index) => {
      this.pickupTransform.position.set(pickup.x, pickup.y, pickup.z);
      this.pickupTransform.rotation.set(0, pickup.progress * Math.PI * 8, 0);
      this.pickupTransform.scale.setScalar(1);
      this.pickupTransform.updateMatrix();
      this.pickupMesh?.setMatrixAt(index, this.pickupTransform.matrix);
    });
    this.pickupMesh.count = active.length;
    this.pickupMesh.instanceMatrix.needsUpdate = true;
  }

  private packSafetyBlockInstances(): void {
    if (!this.safetyBlockMesh) return;
    const activeBlocks = this.obstacles.filter((obstacle) => obstacle.kind === "safety-block" && obstacle.active);
    activeBlocks.forEach((obstacle, index) => {
      this.safetyBlockTransform.position.set(
        obstacle.x,
        this.groundHeight(obstacle.x, obstacle.z) + 0.8,
        obstacle.z,
      );
      this.safetyBlockTransform.rotation.set(0, obstacle.rotationY, 0);
      this.safetyBlockTransform.scale.set(obstacle.radius / 1.1, 1, obstacle.radius / 1.1);
      this.safetyBlockTransform.updateMatrix();
      this.safetyBlockMesh?.setMatrixAt(index, this.safetyBlockTransform.matrix);
    });
    this.safetyBlockMesh.count = activeBlocks.length;
    this.safetyBlockMesh.instanceMatrix.needsUpdate = true;
  }

  private createGate(sample: TrackSample, color: number, label: string): THREE.Group {
    const group = new THREE.Group();
    group.position.set(sample.x, sample.y, sample.z);
    group.rotation.y = sample.heading;
    group.userData.label = label;
    const material = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.18 });
    const postGeometry = new THREE.BoxGeometry(0.65, 3.8, 0.65);
    const topGeometry = new THREE.BoxGeometry(sample.roadWidth + 1.4, 0.65, 0.65);
    const left = new THREE.Mesh(postGeometry, material);
    const right = new THREE.Mesh(postGeometry, material);
    left.position.set(-(sample.roadWidth / 2 + 0.35), 1.9, 0);
    right.position.set(sample.roadWidth / 2 + 0.35, 1.9, 0);
    const top = new THREE.Mesh(topGeometry, material);
    top.position.y = 3.65;
    group.add(left, right, top);
    const gateOffset = sample.roadWidth / 2 + 0.35;
    const sideX = -sample.tangentZ;
    const sideZ = sample.tangentX;
    const postHalfSize = 0.325;
    for (const side of [-1, 1]) {
      const post: RallyStaticCollider = {
        id: `${label.toLowerCase().replaceAll(" ", "-")}-post-${side < 0 ? "left" : "right"}`,
        source: "gate-post",
        x: sample.x + sideX * gateOffset * side,
        z: sample.z + sideZ * gateOffset * side,
        shape: "box",
        radius: postHalfSize,
        halfWidth: postHalfSize,
        halfDepth: postHalfSize,
        rotationY: sample.heading,
        solid: true,
        destructible: false,
        active: true,
      };
      this.gatePosts.push(post);
      this.staticColliders.push(post);
    }
    return group;
  }

  private createStaticColliders(): void {
    for (const obstacle of this.obstacles) {
      this.staticColliders.push({
        id: obstacle.id,
        source: "obstacle",
        x: obstacle.x,
        z: obstacle.z,
        shape: obstacle.shape,
        radius: obstacle.radius,
        halfWidth: obstacle.halfWidth,
        halfDepth: obstacle.halfDepth,
        rotationY: obstacle.rotationY,
        solid: true,
        destructible: obstacle.destructible,
        active: obstacle.active,
      });
    }
    for (const item of this.scenery) {
      if (!item.solid) continue;
      this.staticColliders.push({
        id: item.id,
        source: "scenery",
        x: item.x,
        z: item.z,
        shape: "circle",
        radius: item.collisionRadius,
        halfWidth: item.collisionRadius,
        halfDepth: item.collisionRadius,
        rotationY: item.rotationY,
        solid: true,
        destructible: false,
        active: true,
      });
    }
  }

  private circleCollision(collider: RallyStaticCollider, x: number, z: number, vehicleRadius: number): RallyStaticCollision | null {
    const dx = x - collider.x;
    const dz = z - collider.z;
    const distance = Math.hypot(dx, dz);
    const minimumDistance = collider.radius + vehicleRadius;
    if (distance >= minimumDistance) return null;
    const normalLength = distance || 1;
    return {
      ...collider,
      normalX: dx / normalLength,
      normalZ: dz / normalLength,
      penetration: minimumDistance - distance,
    };
  }

  private boxCollision(collider: RallyStaticCollider, x: number, z: number, vehicleRadius: number): RallyStaticCollision | null {
    const cosine = Math.cos(collider.rotationY);
    const sine = Math.sin(collider.rotationY);
    const offsetX = x - collider.x;
    const offsetZ = z - collider.z;
    const localX = offsetX * cosine + offsetZ * sine;
    const localZ = -offsetX * sine + offsetZ * cosine;
    const closestX = Math.max(-collider.halfWidth, Math.min(collider.halfWidth, localX));
    const closestZ = Math.max(-collider.halfDepth, Math.min(collider.halfDepth, localZ));
    const deltaX = localX - closestX;
    const deltaZ = localZ - closestZ;
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance > vehicleRadius) return null;
    let localNormalX: number;
    let localNormalZ: number;
    let penetration: number;
    if (distance > 0) {
      localNormalX = deltaX / distance;
      localNormalZ = deltaZ / distance;
      penetration = vehicleRadius - distance;
    } else {
      const distanceToXFace = collider.halfWidth - Math.abs(localX);
      const distanceToZFace = collider.halfDepth - Math.abs(localZ);
      if (distanceToXFace < distanceToZFace) {
        localNormalX = localX < 0 ? -1 : 1;
        localNormalZ = 0;
        penetration = vehicleRadius + distanceToXFace;
      } else {
        localNormalX = 0;
        localNormalZ = localZ < 0 ? -1 : 1;
        penetration = vehicleRadius + distanceToZFace;
      }
    }
    return {
      ...collider,
      normalX: localNormalX * cosine - localNormalZ * sine,
      normalZ: localNormalX * sine + localNormalZ * cosine,
      penetration,
    };
  }
}

export const RALLY_TRACK_CONSTANTS = {
  segments: DEFAULT_SEGMENTS,
  width: RALLY_CONFIG.track.width,
  centerZ: RALLY_CONFIG.track.centerZ,
  roadVisualEpsilon: RALLY_CONFIG.track.roadVisualEpsilon,
  terrainVisualEpsilon: RALLY_CONFIG.track.terrainVisualEpsilon,
  scenerySafetyMargin: RALLY_CONFIG.track.scenerySafetyMargin,
};

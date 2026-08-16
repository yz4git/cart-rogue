import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import {
  cartWorldNodeById,
  type CartWorldLocation,
  type CartWorldNode,
} from "./CartWorldGraph";

interface Phase45Session {
  car: CartArenaSession["car"];
  location: CartWorldLocation;
  wallSlideTimer?: number;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface Phase45Demo {
  scene: THREE.Scene;
  buildWorld(): void;
}

interface TransitRecoveryState {
  stalledSeconds: number;
}

interface GuidePoint {
  x: number;
  z: number;
}

const transitRecovery = new WeakMap<object, TransitRecoveryState>();
const TRANSIT_WALL_INSET = 1.55;
const TRANSIT_WALL_BAND = 0.62;
const TRANSIT_RELEASE_NUDGE = 0.92;
const TRANSIT_STALL_SECONDS = 0.2;

/** The longest normal destroyed-enemy reaction is 0.78s. */
export const CART_PHASE45_STAGE_CLEAR_GRACE_MS = 900;
/** Boss destruction uses a 0.9s reaction. */
export const CART_PHASE45_BOSS_CLEAR_GRACE_MS = 1020;
export const CART_PHASE45_EXIT_GUIDE_MS = 4200;

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rotateToward(current: number, target: number, maxStep: number): number {
  const delta = normalizeAngle(target - current);
  return normalizeAngle(current + clamp(delta, -maxStep, maxStep));
}

function nextNodes(node: CartWorldNode): CartWorldNode[] {
  return node.next
    .map((id) => cartWorldNodeById(id))
    .filter((candidate): candidate is CartWorldNode => Boolean(candidate));
}

function guidePointForNode(node: CartWorldNode, x: number): GuidePoint | null {
  const candidates = nextNodes(node);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return { x: candidates[0].rect.centerX, z: candidates[0].rect.centerZ };
  }

  // Before a fork is committed, point down the middle of the route instead of
  // arbitrarily telling the player to choose left or right. Once the cart has
  // moved laterally into a branch, follow the nearest authored branch center.
  const lateralCommit = Math.abs(x - node.rect.centerX) > Math.max(2.2, node.rect.halfWidth * 0.14);
  if (!lateralCommit) {
    const sum = candidates.reduce((acc, candidate) => {
      acc.x += candidate.rect.centerX;
      acc.z += candidate.rect.centerZ;
      return acc;
    }, { x: 0, z: 0 });
    return { x: sum.x / candidates.length, z: sum.z / candidates.length };
  }

  let nearest = candidates[0];
  let nearestDistance = Math.abs(nearest.rect.centerX - x);
  for (const candidate of candidates.slice(1)) {
    const distance = Math.abs(candidate.rect.centerX - x);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return { x: nearest.rect.centerX, z: nearest.rect.centerZ };
}

export function cartPhase45ExitGuideAngle(
  snapshot: Pick<CartArenaSessionSnapshot, "nodeId" | "x" | "z" | "heading">,
): number | null {
  const node = cartWorldNodeById(snapshot.nodeId);
  if (!node) return null;
  const target = guidePointForNode(node, snapshot.x);
  if (!target) return null;
  const dx = target.x - snapshot.x;
  const dz = target.z - snapshot.z;
  if (Math.hypot(dx, dz) < 0.25) return 0;
  return normalizeAngle(Math.atan2(dx, dz) - snapshot.heading);
}

export function cartPhase45GroundSanitizesLegacyDetail(): boolean {
  return true;
}

function stabilizeGroundLayers(scene: THREE.Scene): void {
  // Phase 34 predates the reliable mosaic. It is an overlapping white-base
  // InstancedMesh layer that relies on instanceColor and was lifted *above*
  // the final road in Phase 36. On some mobile WebGL paths that combination can
  // degrade into a large white horizontal slab. Retire it completely; Phase 38
  // already supplies the final floor surface and color variation.
  const legacyDetail = scene.getObjectByName("phase34-floor-detail");
  if (legacyDetail) {
    legacyDetail.visible = false;
    legacyDetail.position.y = -20;
  }

  const legacyRoad = scene.getObjectByName("phase35-road-mosaic");
  if (legacyRoad) legacyRoad.visible = false;

  // The Phase 38 road is physically separated from the base floor, so a
  // polygon offset is unnecessary. Removing it avoids a second mobile depth
  // precision edge case while keeping the final fixed-color buckets intact.
  const reliableRoad = scene.getObjectByName("phase38-reliable-road-mosaic");
  reliableRoad?.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshBasicMaterial)) continue;
      material.polygonOffset = false;
      material.depthTest = true;
      material.depthWrite = true;
      material.transparent = false;
      material.opacity = 1;
      material.toneMapped = false;
      material.needsUpdate = true;
    }
    object.renderOrder = 0;
  });

  scene.userData.phase45GroundSanitized = true;
}

function syncHorizontalVelocity(session: Phase45Session): void {
  const forwardX = Math.sin(session.car.heading);
  const forwardZ = Math.cos(session.car.heading);
  const rightX = Math.cos(session.car.heading);
  const rightZ = -Math.sin(session.car.heading);
  session.car.velocity.x = forwardX * session.car.forwardVelocity + rightX * session.car.lateralVelocity;
  session.car.velocity.z = forwardZ * session.car.forwardVelocity + rightZ * session.car.lateralVelocity;
  session.car.speed = Math.hypot(session.car.velocity.x, session.car.velocity.z);
}

function isValidOutgoingMotion(
  session: Phase45Session,
  node: CartWorldNode,
  target: GuidePoint | null,
  input: RallyInputState,
): boolean {
  if (!target) return false;
  const dx = target.x - node.rect.centerX;
  const dz = target.z - node.rect.centerZ;
  const length = Math.hypot(dx, dz) || 1;
  const nx = dx / length;
  const nz = dz / length;
  const useZ = Math.abs(nz) >= Math.abs(nx);
  const face = useZ
    ? node.rect.centerZ + Math.sign(nz || 1) * node.rect.halfDepth
    : node.rect.centerX + Math.sign(nx || 1) * node.rect.halfWidth;
  const nearFace = useZ
    ? Math.abs(session.car.position.z - face) <= 2.7
    : Math.abs(session.car.position.x - face) <= 2.7;
  if (!nearFace) return false;

  const velocityDot = session.car.velocity.x * nx + session.car.velocity.z * nz;
  const forwardDot = Math.sin(session.car.heading) * nx + Math.cos(session.car.heading) * nz;
  return velocityDot > 0.18 || (input.throttle > 0.04 && forwardDot > 0.18);
}

function recoverTransitWallTrap(
  session: Phase45Session,
  input: RallyInputState,
  fixedDelta: number,
  beforeX: number,
  beforeZ: number,
): void {
  const key = session as unknown as object;
  const state = transitRecovery.get(key) ?? { stalledSeconds: 0 };
  transitRecovery.set(key, state);

  const node = session.location.node;
  if (node.kind !== "corridor" || input.boost || input.brake > 0.25) {
    state.stalledSeconds = 0;
    return;
  }

  const minX = node.rect.centerX - node.rect.halfWidth + TRANSIT_WALL_INSET;
  const maxX = node.rect.centerX + node.rect.halfWidth - TRANSIT_WALL_INSET;
  const minZ = node.rect.centerZ - node.rect.halfDepth + TRANSIT_WALL_INSET;
  const maxZ = node.rect.centerZ + node.rect.halfDepth - TRANSIT_WALL_INSET;
  const leftGap = session.car.position.x - minX;
  const rightGap = maxX - session.car.position.x;
  const rearGap = session.car.position.z - minZ;
  const frontGap = maxZ - session.car.position.z;
  const nearXWall = Math.min(leftGap, rightGap) <= TRANSIT_WALL_BAND;
  const nearZWall = Math.min(rearGap, frontGap) <= TRANSIT_WALL_BAND;
  const corner = nearXWall && nearZWall;
  if (!nearXWall && !nearZWall) {
    state.stalledSeconds = 0;
    return;
  }

  const target = guidePointForNode(node, session.car.position.x);
  if (isValidOutgoingMotion(session, node, target, input)) {
    state.stalledSeconds = 0;
    return;
  }

  const targetX = target?.x ?? node.rect.centerX;
  const targetZ = target?.z ?? node.rect.centerZ;
  const routeDx = targetX - beforeX;
  const routeDz = targetZ - beforeZ;
  const routeLength = Math.hypot(routeDx, routeDz) || 1;
  const progress = ((session.car.position.x - beforeX) * routeDx + (session.car.position.z - beforeZ) * routeDz) / routeLength;
  const moved = Math.hypot(session.car.position.x - beforeX, session.car.position.z - beforeZ);
  const tryingToMove = input.throttle > 0.04;
  const lowProgress = progress < 0.018 || moved < 0.025 || session.car.speed < 1.55;
  state.stalledSeconds = tryingToMove && lowProgress
    ? state.stalledSeconds + fixedDelta
    : Math.max(0, state.stalledSeconds - fixedDelta * 2.5);

  if (!corner && state.stalledSeconds < TRANSIT_STALL_SECONDS) return;

  let releaseX = clamp(session.car.position.x, minX, maxX);
  let releaseZ = clamp(session.car.position.z, minZ, maxZ);
  if (leftGap <= TRANSIT_WALL_BAND) releaseX = Math.min(maxX, minX + TRANSIT_RELEASE_NUDGE);
  else if (rightGap <= TRANSIT_WALL_BAND) releaseX = Math.max(minX, maxX - TRANSIT_RELEASE_NUDGE);
  if (rearGap <= TRANSIT_WALL_BAND) releaseZ = Math.min(maxZ, minZ + TRANSIT_RELEASE_NUDGE);
  else if (frontGap <= TRANSIT_WALL_BAND) releaseZ = Math.max(minZ, maxZ - TRANSIT_RELEASE_NUDGE);

  session.car.position.x = releaseX;
  session.car.position.z = releaseZ;
  const desiredHeading = Math.atan2(targetX - releaseX, targetZ - releaseZ);
  session.car.heading = rotateToward(session.car.heading, desiredHeading, corner ? 0.86 : 0.58);
  session.car.forwardVelocity = Math.max(3.6, Math.abs(session.car.forwardVelocity) * 0.78);
  session.car.lateralVelocity *= 0.08;
  session.car.collisionImpact = Math.max(session.car.collisionImpact, 0.34);
  if (typeof session.wallSlideTimer === "number") session.wallSlideTimer = Math.max(session.wallSlideTimer, 0.16);
  session.location = {
    node,
    localX: releaseX - node.rect.centerX,
    localZ: releaseZ - node.rect.centerZ,
  };
  syncHorizontalVelocity(session);
  state.stalledSeconds = 0;
}

export function installCartRoguePhase45StabilityGuidance(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase45Session;
  const originalStep = sessionPrototype.step;
  sessionPrototype.step = function phase45StabilityStep(
    this: Phase45Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const beforeX = this.car.position.x;
    const beforeZ = this.car.position.z;
    originalStep.call(this, input, fixedDelta);
    recoverTransitWallTrap(this, input, fixedDelta, beforeX, beforeZ);
  };

  const demoPrototype = CartRogueWebGLDemo.prototype as unknown as Phase45Demo;
  const originalWorld = demoPrototype.buildWorld;
  demoPrototype.buildWorld = function phase45StableWorld(this: Phase45Demo): void {
    originalWorld.call(this);
    stabilizeGroundLayers(this.scene);
  };
}

installCartRoguePhase45StabilityGuidance();

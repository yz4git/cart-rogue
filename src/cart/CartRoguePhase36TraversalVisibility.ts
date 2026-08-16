import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { aliveCartEnemies, type CartEnemyState } from "./CartCombat";
import {
  cartArenaContains,
  cartArenaShapeForNode,
  projectCartPointInsideArena,
} from "./CartArenaShapes";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import {
  cartWorldNodeById,
  type CartWorldLocation,
  type CartWorldNode,
  type CartWorldNodeKind,
} from "./CartWorldGraph";

interface Phase36Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  location: CartWorldLocation;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface Phase36Demo {
  scene: THREE.Scene;
  buildWorld(): void;
}

const GATE_LATERAL_TOLERANCE = 0.55;
const GATE_APPROACH_DEPTH = 1.35;
const ARENA_GATE_NEAR_MARGIN = 2.75;
const CORRIDOR_ENTRY_MARGIN = 1.35;
const MOSAIC_ROAD_LIFT = 0.058;
const MOSAIC_GRASS_LIFT = 0.035;
const MOSAIC_DECOR_LIFT = 0.045;
const FLOOR_DETAIL_LIFT = 0.065;

const FINAL_NORMAL_SPEED_CAPS: Readonly<Record<CartWorldNodeKind, number>> = {
  arena: 16.8,
  corridor: 19.6,
  boss: 16.0,
};

const MOSAIC_CONTRAST_PATTERN = [0.76, 1.08, 0.91, 1.0, 0.83, 1.13, 0.95] as const;

export function cartPhase36NormalSpeedCap(kind: CartWorldNodeKind): number {
  return FINAL_NORMAL_SPEED_CAPS[kind];
}

export function cartPhase36MosaicRoadLift(): number {
  return MOSAIC_ROAD_LIFT;
}

export function cartPhase36MosaicContrast(index: number): number {
  const normalized = Math.abs(Math.floor(index));
  return MOSAIC_CONTRAST_PATTERN[(normalized * 5 + 3) % MOSAIC_CONTRAST_PATTERN.length];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function axisToNext(from: CartWorldNode, to: CartWorldNode): { axis: "x" | "z"; sign: 1 | -1 } {
  const dx = to.rect.centerX - from.rect.centerX;
  const dz = to.rect.centerZ - from.rect.centerZ;
  if (Math.abs(dz) >= Math.abs(dx)) return { axis: "z", sign: dz >= 0 ? 1 : -1 };
  return { axis: "x", sign: dx >= 0 ? 1 : -1 };
}

function outgoingCorridors(node: CartWorldNode): CartWorldNode[] {
  return node.next
    .map((id) => cartWorldNodeById(id))
    .filter((candidate): candidate is CartWorldNode => Boolean(candidate && candidate.kind === "corridor"));
}

export function cartPhase36PointInStrictGateLane(
  from: CartWorldNode,
  corridor: CartWorldNode,
  x: number,
  z: number,
): boolean {
  const direction = axisToNext(from, corridor);
  if (direction.axis === "z") {
    return Math.abs(x - corridor.rect.centerX) <= corridor.rect.halfWidth + GATE_LATERAL_TOLERANCE;
  }
  return Math.abs(z - corridor.rect.centerZ) <= corridor.rect.halfDepth + GATE_LATERAL_TOLERANCE;
}

function pointNearOutgoingFace(
  from: CartWorldNode,
  to: CartWorldNode,
  x: number,
  z: number,
  depth = GATE_APPROACH_DEPTH,
): boolean {
  const direction = axisToNext(from, to);
  if (direction.axis === "z") {
    const seam = direction.sign > 0
      ? to.rect.centerZ - to.rect.halfDepth
      : to.rect.centerZ + to.rect.halfDepth;
    return direction.sign > 0 ? z >= seam - depth : z <= seam + depth;
  }
  const seam = direction.sign > 0
    ? to.rect.centerX - to.rect.halfWidth
    : to.rect.centerX + to.rect.halfWidth;
  return direction.sign > 0 ? x >= seam - depth : x <= seam + depth;
}

function bridgeIntoCorridor(session: Phase36Session, from: CartWorldNode, corridor: CartWorldNode): void {
  const minX = corridor.rect.centerX - corridor.rect.halfWidth + CORRIDOR_ENTRY_MARGIN;
  const maxX = corridor.rect.centerX + corridor.rect.halfWidth - CORRIDOR_ENTRY_MARGIN;
  const minZ = corridor.rect.centerZ - corridor.rect.halfDepth + CORRIDOR_ENTRY_MARGIN;
  const maxZ = corridor.rect.centerZ + corridor.rect.halfDepth - CORRIDOR_ENTRY_MARGIN;
  const direction = axisToNext(from, corridor);

  let targetX = clamp(session.car.position.x, minX, maxX);
  let targetZ = clamp(session.car.position.z, minZ, maxZ);
  if (direction.axis === "z") targetZ = direction.sign > 0 ? minZ : maxZ;
  else targetX = direction.sign > 0 ? minX : maxX;

  session.car.position.x = targetX;
  session.car.position.z = targetZ;
  session.location = {
    node: corridor,
    localX: targetX - corridor.rect.centerX,
    localZ: targetZ - corridor.rect.centerZ,
  };
}

function hasGateExitIntent(session: Phase36Session, from: CartWorldNode, to: CartWorldNode, input: RallyInputState): boolean {
  const direction = axisToNext(from, to);
  const directionX = direction.axis === "x" ? direction.sign : 0;
  const directionZ = direction.axis === "z" ? direction.sign : 0;
  const forwardX = Math.sin(session.car.heading);
  const forwardZ = Math.cos(session.car.heading);
  const forwardDot = forwardX * directionX + forwardZ * directionZ;
  const velocityDot = session.car.velocity.x * directionX + session.car.velocity.z * directionZ;
  return velocityDot > 0.15 || (input.throttle > 0.04 && forwardDot > -0.35);
}

function assistClearedArenaGate(session: Phase36Session, input: RallyInputState): boolean {
  const node = session.location.node;
  if (!cartArenaShapeForNode(node.id)) return false;
  if (aliveCartEnemies(session.enemies, node.id).length > 0) return false;

  for (const corridor of outgoingCorridors(node)) {
    const x = session.car.position.x;
    const z = session.car.position.z;
    if (!cartPhase36PointInStrictGateLane(node, corridor, x, z)) continue;
    if (!pointNearOutgoingFace(node, corridor, x, z)) continue;
    if (cartArenaContains(node.id, x, z, ARENA_GATE_NEAR_MARGIN)) continue;
    if (!hasGateExitIntent(session, node, corridor, input)) continue;
    bridgeIntoCorridor(session, node, corridor);
    return true;
  }
  return false;
}

function previousArenaExitWasValid(
  previous: CartWorldNode,
  current: CartWorldNode,
  fromX: number,
  fromZ: number,
): boolean {
  if (!previous.next.includes(current.id) || current.kind !== "corridor") return true;
  if (aliveCartEnemiesForNode(previous.id).length > 0) return false;
  return cartPhase36PointInStrictGateLane(previous, current, fromX, fromZ)
    && pointNearOutgoingFace(previous, current, fromX, fromZ, GATE_APPROACH_DEPTH + 0.35);
}

let activeValidationEnemies: readonly CartEnemyState[] = [];

function aliveCartEnemiesForNode(nodeId: string): CartEnemyState[] {
  return activeValidationEnemies.filter((enemy) => enemy.alive && enemy.nodeId === nodeId) as CartEnemyState[];
}

function corridorExitWasValid(previous: CartWorldNode, current: CartWorldNode, fromX: number, fromZ: number): boolean {
  if (previous.kind !== "corridor" || !previous.next.includes(current.id)) return true;
  const direction = axisToNext(previous, current);
  if (direction.axis === "z") {
    const lateral = Math.abs(fromX - previous.rect.centerX) <= previous.rect.halfWidth + 0.45;
    const face = previous.rect.centerZ + direction.sign * previous.rect.halfDepth;
    const nearFace = Math.abs(fromZ - face) <= 3.2;
    return lateral && nearFace;
  }
  const lateral = Math.abs(fromZ - previous.rect.centerZ) <= previous.rect.halfDepth + 0.45;
  const face = previous.rect.centerX + direction.sign * previous.rect.halfWidth;
  const nearFace = Math.abs(fromX - face) <= 3.2;
  return lateral && nearFace;
}

function syncHorizontalVelocity(session: Phase36Session): void {
  const forwardX = Math.sin(session.car.heading);
  const forwardZ = Math.cos(session.car.heading);
  const rightX = Math.cos(session.car.heading);
  const rightZ = -Math.sin(session.car.heading);
  session.car.velocity.x = forwardX * session.car.forwardVelocity + rightX * session.car.lateralVelocity;
  session.car.velocity.z = forwardZ * session.car.forwardVelocity + rightZ * session.car.lateralVelocity;
  session.car.speed = Math.hypot(session.car.velocity.x, session.car.velocity.z);
}

function restorePreviousNode(session: Phase36Session, previous: CartWorldNode, fromX: number, fromZ: number): void {
  let targetX = fromX;
  let targetZ = fromZ;
  if (cartArenaShapeForNode(previous.id)) {
    const projected = projectCartPointInsideArena(previous.id, fromX, fromZ, 1.72);
    targetX = projected.x;
    targetZ = projected.z;
  } else {
    targetX = clamp(fromX, previous.rect.centerX - previous.rect.halfWidth + 1.35, previous.rect.centerX + previous.rect.halfWidth - 1.35);
    targetZ = clamp(fromZ, previous.rect.centerZ - previous.rect.halfDepth + 1.35, previous.rect.centerZ + previous.rect.halfDepth - 1.35);
  }
  session.car.position.x = targetX;
  session.car.position.z = targetZ;
  session.location = {
    node: previous,
    localX: targetX - previous.rect.centerX,
    localZ: targetZ - previous.rect.centerZ,
  };
  session.car.forwardVelocity *= 0.42;
  session.car.lateralVelocity *= 0.12;
  session.car.collisionImpact = Math.max(session.car.collisionImpact, 0.48);
  syncHorizontalVelocity(session);
}

function capFinalNormalSpeed(session: Phase36Session, input: RallyInputState): void {
  if (session.car.boostActive || input.boost) return;
  const cap = cartPhase36NormalSpeedCap(session.location.node.kind);
  const motion = Math.hypot(session.car.forwardVelocity, session.car.lateralVelocity);
  if (motion <= cap || motion < 0.001) return;
  const scale = cap / motion;
  session.car.forwardVelocity *= scale;
  session.car.lateralVelocity *= scale;
  syncHorizontalVelocity(session);
}

function adjustInstancedColors(mesh: THREE.InstancedMesh, seed: number): void {
  if (!mesh.instanceColor) return;
  const color = new THREE.Color();
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getColorAt(index, color);
    color.multiplyScalar(cartPhase36MosaicContrast(index + seed));
    color.r = Math.min(1, color.r);
    color.g = Math.min(1, color.g);
    color.b = Math.min(1, color.b);
    mesh.setColorAt(index, color);
  }
  mesh.instanceColor.needsUpdate = true;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -1;
    material.needsUpdate = true;
  }
}

function liftMosaicLayer(scene: THREE.Scene, name: string, lift: number, seed: number): void {
  const object = scene.getObjectByName(name);
  if (!(object instanceof THREE.InstancedMesh)) return;
  object.position.y = lift;
  adjustInstancedColors(object, seed);
}

function strengthenMosaicVisibility(scene: THREE.Scene): void {
  liftMosaicLayer(scene, "phase35-road-mosaic", MOSAIC_ROAD_LIFT, 0);
  liftMosaicLayer(scene, "phase35-grass-mosaic", MOSAIC_GRASS_LIFT, 11);
  liftMosaicLayer(scene, "phase35-water-mosaic", MOSAIC_DECOR_LIFT, 19);
  liftMosaicLayer(scene, "phase35-stone-banks", MOSAIC_DECOR_LIFT + 0.008, 23);
  liftMosaicLayer(scene, "phase35-flower-beds", MOSAIC_DECOR_LIFT + 0.014, 29);

  const detailRoot = scene.getObjectByName("phase34-floor-detail");
  if (detailRoot) detailRoot.position.y = FLOOR_DETAIL_LIFT;
}

export function installCartRoguePhase36TraversalVisibility(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase36Session;
  const originalStep = sessionPrototype.step;
  sessionPrototype.step = function phase36TraversalVisibilityStep(
    this: Phase36Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const previous = this.location.node;
    const fromX = this.car.position.x;
    const fromZ = this.car.position.z;
    activeValidationEnemies = this.enemies;
    originalStep.call(this, input, fixedDelta);

    const current = this.location.node;
    const arenaTransitionValid = previous.kind === "corridor"
      || !cartArenaShapeForNode(previous.id)
      || previous.id === current.id
      || previousArenaExitWasValid(previous, current, fromX, fromZ);
    const corridorTransitionValid = corridorExitWasValid(previous, current, fromX, fromZ);

    if (!arenaTransitionValid || !corridorTransitionValid) {
      restorePreviousNode(this, previous, fromX, fromZ);
    } else if (this.location.node.id === previous.id) {
      assistClearedArenaGate(this, input);
    }

    capFinalNormalSpeed(this, input);
    activeValidationEnemies = [];
  };

  const demoPrototype = CartRogueWebGLDemo.prototype as unknown as Phase36Demo;
  const originalWorld = demoPrototype.buildWorld;
  demoPrototype.buildWorld = function phase36World(this: Phase36Demo): void {
    originalWorld.call(this);
    strengthenMosaicVisibility(this.scene);
  };
}

installCartRoguePhase36TraversalVisibility();

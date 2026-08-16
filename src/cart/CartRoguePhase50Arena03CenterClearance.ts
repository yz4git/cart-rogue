import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import { projectCartPointInsideArena } from "./CartArenaShapes";
import type { CartEnemyState } from "./CartCombat";
import type { CartObstacleState } from "./CartObstacles";
import { cartWorldNodeById, type CartWorldLocation } from "./CartWorldGraph";

interface Phase50Session {
  track: CartArenaSession["track"];
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  obstacles: CartObstacleState[];
  location: CartWorldLocation;
  step(input: RallyInputState, fixedDelta?: number): void;
  snapshot(): CartArenaSessionSnapshot;
  slideAroundEnemy(enemy: CartEnemyState, previousX: number, previousZ: number): void;
}

const initializedSessions = new WeakSet<object>();

export const CART_PHASE50_ARENA03_CENTER_CLEAR_RADIUS = 7.25;
export const CART_PHASE50_ARENA03_LEGACY_COLLIDER_HALF_WIDTH = 7.5;
export const CART_PHASE50_ARENA03_LEGACY_COLLIDER_HALF_DEPTH = 8.5;
export const CART_PHASE50_MOBILE_ENEMY_CLEARANCE = 1.86;
export const CART_PHASE50_CENTER_SEAM_HALF_WIDTH = 10.5;
export const CART_PHASE50_CENTER_SEAM_HALF_DEPTH = 0.42;
export const CART_PHASE50_CENTER_SEAM_BRIDGE_DISTANCE = 1.15;

function syncHorizontalVelocity(session: Phase50Session): void {
  const forwardX = Math.sin(session.car.heading);
  const forwardZ = Math.cos(session.car.heading);
  const rightX = Math.cos(session.car.heading);
  const rightZ = -Math.sin(session.car.heading);
  session.car.velocity.x = forwardX * session.car.forwardVelocity + rightX * session.car.lateralVelocity;
  session.car.velocity.z = forwardZ * session.car.forwardVelocity + rightZ * session.car.lateralVelocity;
  session.car.speed = Math.hypot(session.car.velocity.x, session.car.velocity.z);
}

function enemySide(id: string): -1 | 1 {
  let checksum = 0;
  for (let index = 0; index < id.length; index += 1) checksum += id.charCodeAt(index);
  return checksum % 2 === 0 ? -1 : 1;
}

function relocateArena03CenterEnemies(session: Phase50Session): number {
  const node = cartWorldNodeById("arena-03");
  if (!node) return 0;
  let moved = 0;
  for (const enemy of session.enemies) {
    if (!enemy.alive || enemy.nodeId !== node.id) continue;
    const dx = enemy.x - node.rect.centerX;
    const dz = enemy.z - node.rect.centerZ;
    if (dx * dx + dz * dz >= CART_PHASE50_ARENA03_CENTER_CLEAR_RADIUS ** 2) continue;

    const side = enemySide(enemy.id);
    const targetX = node.rect.centerX + side * Math.min(22, node.rect.halfWidth - 7);
    const targetZ = node.rect.centerZ + ((enemy.id.length % 3) - 1) * 3.4;
    const projected = projectCartPointInsideArena(node.id, targetX, targetZ, enemy.radius + 1.05);
    enemy.x = projected.x;
    enemy.z = projected.z;
    enemy.heading = Math.atan2(node.rect.centerX - enemy.x, node.rect.centerZ - enemy.z);
    moved += 1;
  }
  return moved;
}

function disableArena03LegacyCenterColliders(session: Phase50Session): number {
  const node = cartWorldNodeById("arena-03");
  if (!node) return 0;
  let disabled = 0;
  for (const collider of session.track.staticColliders) {
    if (!collider.active) continue;
    const localX = collider.x - node.rect.centerX;
    const localZ = collider.z - node.rect.centerZ;
    if (Math.abs(localX) > CART_PHASE50_ARENA03_LEGACY_COLLIDER_HALF_WIDTH) continue;
    if (Math.abs(localZ) > CART_PHASE50_ARENA03_LEGACY_COLLIDER_HALF_DEPTH) continue;
    collider.active = false;
    disabled += 1;
  }
  return disabled;
}

export function cartPhase50EnsureArena03CenterClear(session: Phase50Session): void {
  const key = session as unknown as object;
  if (initializedSessions.has(key)) return;
  initializedSessions.add(key);
  const relocated = relocateArena03CenterEnemies(session);
  const disabled = disableArena03LegacyCenterColliders(session);
  (session as unknown as { phase50Arena03Center?: { relocated: number; disabled: number } }).phase50Arena03Center = {
    relocated,
    disabled,
  };
}

function hasVisibleCenterCollision(session: Phase50Session): boolean {
  const x = session.car.position.x;
  const z = session.car.position.z;
  for (const enemy of session.enemies) {
    if (!enemy.alive || enemy.nodeId !== "arena-03") continue;
    const radius = enemy.radius + 1.45;
    const dx = enemy.x - x;
    const dz = enemy.z - z;
    if (dx * dx + dz * dz <= radius * radius) return true;
  }
  for (const obstacle of session.obstacles) {
    if (obstacle.destroyed || obstacle.nodeId !== "arena-03") continue;
    const radius = obstacle.radius + 1.45;
    const dx = obstacle.x - x;
    const dz = obstacle.z - z;
    if (dx * dx + dz * dz <= radius * radius) return true;
  }
  return false;
}

function bridgeArena03CenterSeam(
  session: Phase50Session,
  input: RallyInputState,
  beforeZ: number,
): boolean {
  if (session.location.node.id !== "arena-03") return false;
  if (input.boost || input.throttle <= 0.12 || input.brake >= 0.24) return false;

  const node = session.location.node;
  const centerZ = node.rect.centerZ;
  const currentZ = session.car.position.z;
  if (Math.abs(session.car.position.x - node.rect.centerX) > CART_PHASE50_CENTER_SEAM_HALF_WIDTH) return false;
  if (Math.abs(currentZ - centerZ) > CART_PHASE50_CENTER_SEAM_HALF_DEPTH) return false;
  if (hasVisibleCenterCollision(session)) return false;

  // The inherited low-level collision can rotate the car sideways exactly on
  // z=280. Do not use the post-collision heading to decide whether the player
  // intended to cross. The side the cart entered the seam from is authoritative.
  let direction: 1 | -1;
  if (beforeZ < centerZ - 0.001) direction = 1;
  else if (beforeZ > centerZ + 0.001) direction = -1;
  else direction = session.car.velocity.z >= 0 ? 1 : -1;

  const targetZ = centerZ + direction * CART_PHASE50_CENTER_SEAM_BRIDGE_DISTANCE;
  const projected = projectCartPointInsideArena(node.id, session.car.position.x, targetZ, 1.35);
  session.car.position.x = projected.x;
  session.car.position.z = projected.z;
  session.car.heading = direction > 0 ? 0 : Math.PI;
  session.car.forwardVelocity = Math.max(4.2, Math.abs(session.car.forwardVelocity));
  session.car.lateralVelocity *= 0.25;
  session.car.collisionImpact = Math.max(session.car.collisionImpact, 0.12);
  session.location = {
    node,
    localX: session.car.position.x - node.rect.centerX,
    localZ: session.car.position.z - node.rect.centerZ,
  };
  syncHorizontalVelocity(session);
  return true;
}

function yieldArena03MobileEnemyContact(session: Phase50Session, enemy: CartEnemyState): boolean {
  if (session.location.node.id !== "arena-03" || enemy.nodeId !== "arena-03" || !enemy.alive || enemy.kind !== "chaser") {
    return false;
  }

  let dx = enemy.x - session.car.position.x;
  let dz = enemy.z - session.car.position.z;
  let distance = Math.hypot(dx, dz);
  if (distance < 0.05) {
    dx = Math.sin(session.car.heading);
    dz = Math.cos(session.car.heading);
    distance = 1;
  }
  const nx = dx / distance;
  const nz = dz / distance;
  const desired = enemy.radius + CART_PHASE50_MOBILE_ENEMY_CLEARANCE;
  const push = Math.max(0.24, desired - distance + 0.18);

  enemy.x += nx * push;
  enemy.z += nz * push;
  const projected = projectCartPointInsideArena(enemy.nodeId, enemy.x, enemy.z, enemy.radius + 0.7);
  if (projected.corrected) {
    enemy.x = projected.x - projected.normalX * 0.08;
    enemy.z = projected.z - projected.normalZ * 0.08;
  }

  session.car.forwardVelocity = Math.max(3.2, Math.abs(session.car.forwardVelocity) * 0.97);
  session.car.lateralVelocity *= 0.72;
  session.car.collisionImpact = Math.max(session.car.collisionImpact, 0.32);
  syncHorizontalVelocity(session);
  return true;
}

export function installCartRoguePhase50Arena03CenterClearance(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase50Session;
  const originalStep = prototype.step;
  const originalSnapshot = prototype.snapshot;
  const originalEnemySlide = prototype.slideAroundEnemy;

  prototype.step = function phase50Arena03CenterStep(
    this: Phase50Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    cartPhase50EnsureArena03CenterClear(this);
    const beforeZ = this.car.position.z;
    originalStep.call(this, input, fixedDelta);
    bridgeArena03CenterSeam(this, input, beforeZ);
  };

  prototype.snapshot = function phase50Arena03CenterSnapshot(this: Phase50Session): CartArenaSessionSnapshot {
    cartPhase50EnsureArena03CenterClear(this);
    return originalSnapshot.call(this);
  };

  prototype.slideAroundEnemy = function phase50Arena03YieldingEnemyContact(
    this: Phase50Session,
    enemy: CartEnemyState,
    previousX: number,
    previousZ: number,
  ): void {
    if (yieldArena03MobileEnemyContact(this, enemy)) return;
    originalEnemySlide.call(this, enemy, previousX, previousZ);
  };
}

installCartRoguePhase50Arena03CenterClearance();

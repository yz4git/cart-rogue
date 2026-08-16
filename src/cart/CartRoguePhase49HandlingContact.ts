import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { cartArenaContains, cartArenaShapeForNode, projectCartPointInsideArena } from "./CartArenaShapes";
import { cartEnemyContact, type CartEnemyState } from "./CartCombat";
import { launchCartEnemyFromVector } from "./CartRoguePhase16Flow";
import { getCartTurboCombatState } from "./CartRoguePhase15Turbo";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import type { CartObstacleState } from "./CartObstacles";
import type { CartResourcePickupState } from "./CartResources";
import type { CartWorldLocation, CartWorldNode } from "./CartWorldGraph";

type Phase49Car = CartArenaSession["car"] & {
  drifting?: boolean;
};

interface Phase49Session {
  car: Phase49Car;
  enemies: CartEnemyState[];
  obstacles: CartObstacleState[];
  resources: CartResourcePickupState[];
  location: CartWorldLocation;
  gas: number;
  lastReward: string | null;
  rewardTimer: number;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface Phase49Demo {
  playerVisual: THREE.Group;
  buildPlayerVisual(): void;
}

interface StallState {
  seconds: number;
  nodeId: string;
}

const stallStates = new WeakMap<object, StallState>();
const normalContactCooldowns = new WeakMap<object, Map<string, number>>();

export const CART_PHASE49_PLAYER_VISUAL_SCALE = 0.88;
export const CART_PHASE49_PICKUP_GRAZE_RADIUS = 2.05;
export const CART_PHASE49_CONTACT_CAR_RADIUS = 1.28;
export const CART_PHASE49_DRIFT_TURN_SCALE = 0.78;
export const CART_PHASE49_DRIFT_MAX_YAW_RATE = 2.55;
export const CART_PHASE49_INTERIOR_STALL_SECONDS = 0.18;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function syncHorizontalVelocity(session: Phase49Session): void {
  const forwardX = Math.sin(session.car.heading);
  const forwardZ = Math.cos(session.car.heading);
  const rightX = Math.cos(session.car.heading);
  const rightZ = -Math.sin(session.car.heading);
  session.car.velocity.x = forwardX * session.car.forwardVelocity + rightX * session.car.lateralVelocity;
  session.car.velocity.z = forwardZ * session.car.forwardVelocity + rightZ * session.car.lateralVelocity;
  session.car.speed = Math.hypot(session.car.velocity.x, session.car.velocity.z);
}

export function cartPhase49PickupGrazeContact(
  pickup: Pick<CartResourcePickupState, "radius" | "x" | "z" | "collected">,
  x: number,
  z: number,
): boolean {
  if (pickup.collected) return false;
  const dx = x - pickup.x;
  const dz = z - pickup.z;
  const radius = pickup.radius + CART_PHASE49_PICKUP_GRAZE_RADIUS;
  return dx * dx + dz * dz <= radius * radius;
}

function collectGrazePickups(session: Phase49Session): void {
  for (const pickup of session.resources) {
    if (pickup.collected || pickup.nodeId !== session.location.node.id) continue;
    if (!cartPhase49PickupGrazeContact(pickup, session.car.position.x, session.car.position.z)) continue;
    if (pickup.kind === "gas") {
      if (session.gas >= 0.995) continue;
      pickup.collected = true;
      session.gas = Math.min(1, session.gas + 0.12);
      session.lastReward = "GAS CELL · +12%";
      session.rewardTimer = 1.6;
      continue;
    }
    if (session.car.boostCharges >= session.car.maxBoostCharges) continue;
    pickup.collected = true;
    session.car.addBoostCharge(1);
    session.lastReward = "TURBO CELL · +1 STOCK";
    session.rewardTimer = 1.6;
  }
}

function tickContactCooldowns(session: Phase49Session, delta: number): Map<string, number> {
  const key = session as unknown as object;
  const cooldowns = normalContactCooldowns.get(key) ?? new Map<string, number>();
  normalContactCooldowns.set(key, cooldowns);
  for (const [id, remaining] of cooldowns) {
    const next = remaining - delta;
    if (next <= 0) cooldowns.delete(id);
    else cooldowns.set(id, next);
  }
  return cooldowns;
}

function normalContactBeforeStep(session: Phase49Session): CartEnemyState | null {
  return session.enemies.find((enemy) =>
    enemy.alive
    && enemy.nodeId === session.location.node.id
    && cartEnemyContact(enemy, session.car.position.x, session.car.position.z, CART_PHASE49_CONTACT_CAR_RADIUS)
  ) ?? null;
}

function applyNormalContactKnockback(
  session: Phase49Session,
  enemy: CartEnemyState | null,
  beforeX: number,
  beforeZ: number,
  beforeSpeed: number,
  input: RallyInputState,
  cooldowns: Map<string, number>,
): void {
  if (!enemy || !enemy.alive || input.boost || cooldowns.has(enemy.id)) return;

  let dx = enemy.x - beforeX;
  let dz = enemy.z - beforeZ;
  let length = Math.hypot(dx, dz);
  if (length < 0.05) {
    dx = Math.sin(session.car.heading);
    dz = Math.cos(session.car.heading);
    length = 1;
  }
  const nx = dx / length;
  const nz = dz / length;
  const kindScale = enemy.kind === "boss" ? 0.34 : enemy.kind === "heavy" ? 0.58 : 1;
  const impulse = (0.3 + clamp(Math.abs(beforeSpeed), 0, 14) * 0.035) * kindScale;
  enemy.x += nx * impulse;
  enemy.z += nz * impulse;

  if (cartArenaShapeForNode(enemy.nodeId)) {
    const projected = projectCartPointInsideArena(enemy.nodeId, enemy.x, enemy.z, enemy.radius + 0.42);
    if (projected.corrected) {
      enemy.x = projected.x - projected.normalX * 0.08;
      enemy.z = projected.z - projected.normalZ * 0.08;
    }
  }

  launchCartEnemyFromVector(
    session as unknown as CartArenaSession,
    enemy,
    nx,
    nz,
    Math.max(3.2, Math.abs(beforeSpeed)),
    false,
    0,
    0,
  );
  cooldowns.set(enemy.id, enemy.kind === "boss" ? 0.28 : 0.2);
}

function capDriftTurn(
  session: Phase49Session,
  input: RallyInputState,
  headingBefore: number,
  fixedDelta: number,
): void {
  const turbo = getCartTurboCombatState(session as unknown as CartArenaSession);
  const driftActive = turbo.held
    || Boolean(session.car.drifting)
    || (input.brake > 0.18 && Math.abs(input.steer) > 0.14);
  if (!driftActive || Math.abs(input.steer) <= 0.035) return;

  const rawDelta = normalizeAngle(session.car.heading - headingBefore);
  const scaled = rawDelta * CART_PHASE49_DRIFT_TURN_SCALE;
  const maxDelta = CART_PHASE49_DRIFT_MAX_YAW_RATE * fixedDelta;
  session.car.heading = normalizeAngle(headingBefore + clamp(scaled, -maxDelta, maxDelta));
  syncHorizontalVelocity(session);
}

function insideNodeInterior(node: CartWorldNode, x: number, z: number): boolean {
  const margin = 3.4;
  if (cartArenaShapeForNode(node.id)) return cartArenaContains(node.id, x, z, margin);
  return Math.abs(x - node.rect.centerX) <= Math.max(0, node.rect.halfWidth - margin)
    && Math.abs(z - node.rect.centerZ) <= Math.max(0, node.rect.halfDepth - margin);
}

function hasNearbyVisibleCollision(session: Phase49Session): boolean {
  const x = session.car.position.x;
  const z = session.car.position.z;
  for (const enemy of session.enemies) {
    if (!enemy.alive || enemy.nodeId !== session.location.node.id) continue;
    const dx = enemy.x - x;
    const dz = enemy.z - z;
    const radius = enemy.radius + 2.15;
    if (dx * dx + dz * dz <= radius * radius) return true;
  }
  for (const obstacle of session.obstacles) {
    if (obstacle.destroyed || obstacle.nodeId !== session.location.node.id) continue;
    const dx = obstacle.x - x;
    const dz = obstacle.z - z;
    const radius = obstacle.radius + 1.9;
    if (dx * dx + dz * dz <= radius * radius) return true;
  }
  return false;
}

function recoverInteriorGhostStall(
  session: Phase49Session,
  input: RallyInputState,
  fixedDelta: number,
  beforeX: number,
  beforeZ: number,
): void {
  const key = session as unknown as object;
  const current = stallStates.get(key) ?? { seconds: 0, nodeId: session.location.node.id };
  stallStates.set(key, current);

  const node = session.location.node;
  if (current.nodeId !== node.id) {
    current.nodeId = node.id;
    current.seconds = 0;
  }

  const tryingForward = input.throttle > 0.12 && input.brake < 0.24 && !input.boost;
  const moved = Math.hypot(session.car.position.x - beforeX, session.car.position.z - beforeZ);
  const eligible = node.kind !== "corridor"
    && tryingForward
    && insideNodeInterior(node, session.car.position.x, session.car.position.z)
    && !hasNearbyVisibleCollision(session);

  if (!eligible || moved > 0.035) {
    current.seconds = Math.max(0, current.seconds - fixedDelta * 2);
    return;
  }

  current.seconds += fixedDelta;
  if (current.seconds < CART_PHASE49_INTERIOR_STALL_SECONDS) return;

  const forwardX = Math.sin(session.car.heading);
  const forwardZ = Math.cos(session.car.heading);
  session.car.position.x += forwardX * 0.9;
  session.car.position.z += forwardZ * 0.9;
  session.car.forwardVelocity = Math.max(4.4, Math.abs(session.car.forwardVelocity) * 0.82);
  session.car.lateralVelocity *= 0.18;
  session.car.collisionImpact = Math.max(session.car.collisionImpact, 0.18);
  session.location = {
    node,
    localX: session.car.position.x - node.rect.centerX,
    localZ: session.car.position.z - node.rect.centerZ,
  };
  syncHorizontalVelocity(session);
  current.seconds = 0;
}

function shrinkPlayerVisual(demo: Phase49Demo): void {
  demo.playerVisual.scale.setScalar(CART_PHASE49_PLAYER_VISUAL_SCALE);
  demo.playerVisual.userData.phase49Scale = CART_PHASE49_PLAYER_VISUAL_SCALE;
}

export function installCartRoguePhase49HandlingContact(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase49Session;
  const originalStep = sessionPrototype.step;
  sessionPrototype.step = function phase49HandlingContactStep(
    this: Phase49Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const beforeX = this.car.position.x;
    const beforeZ = this.car.position.z;
    const beforeHeading = this.car.heading;
    const beforeSpeed = this.car.forwardVelocity;
    const contact = normalContactBeforeStep(this);
    const cooldowns = tickContactCooldowns(this, fixedDelta);

    originalStep.call(this, input, fixedDelta);

    capDriftTurn(this, input, beforeHeading, fixedDelta);
    applyNormalContactKnockback(this, contact, beforeX, beforeZ, beforeSpeed, input, cooldowns);
    collectGrazePickups(this);
    recoverInteriorGhostStall(this, input, fixedDelta, beforeX, beforeZ);
  };

  const demoPrototype = CartRogueWebGLDemo.prototype as unknown as Phase49Demo;
  const originalBuildPlayer = demoPrototype.buildPlayerVisual;
  demoPrototype.buildPlayerVisual = function phase49SmallerPlayer(this: Phase49Demo): void {
    originalBuildPlayer.call(this);
    shrinkPlayerVisual(this);
  };
}

installCartRoguePhase49HandlingContact();

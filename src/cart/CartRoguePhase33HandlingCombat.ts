import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import {
  aliveCartEnemies,
  applyTurboRam,
  breakHeavyParallelContact,
  cartEnemyContact,
  type CartEnemyState,
} from "./CartCombat";
import { cartArenaContains, cartArenaShapeForNode } from "./CartArenaShapes";
import { cartEnemySweepContact } from "./CartRoguePhase22RamSweep";
import type { CartWorldLocation, CartWorldNodeKind } from "./CartWorldGraph";

interface Phase33Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  location: CartWorldLocation;
  gas: number;
  lastRamEnemyId: string | null;
  lastRamDamage: number;
  enemyHitCooldowns: Map<string, number>;
  registerFlowSmash(extraBoostSeconds?: number): void;
  step(input: RallyInputState, fixedDelta?: number): void;
}

const EXPANDED_RAM_RADIUS = 2.05;
const SANDWICH_CONTACT_PADDING = 1.58;
const SANDWICH_ESCAPE_DISTANCE = 0.72;
const TURBO_PIVOT_TURN_SCALE = 0.84;

export function cartNormalSpeedCap(kind: CartWorldNodeKind): number {
  if (kind === "corridor") return 22.2;
  if (kind === "boss") return 17.8;
  return 18.6;
}

export function cartExpandedRamRadius(): number {
  return EXPANDED_RAM_RADIUS;
}

export function cartTurboPivotTurnScale(): number {
  return TURBO_PIVOT_TURN_SCALE;
}

export function cartSandwichEscapeVector(
  enemies: readonly Pick<CartEnemyState, "x" | "z">[],
  playerX: number,
  playerZ: number,
  heading: number,
): { x: number; z: number } | null {
  if (enemies.length < 2) return null;
  const sorted = [...enemies].sort((a, b) =>
    Math.hypot(a.x - playerX, a.z - playerZ) - Math.hypot(b.x - playerX, b.z - playerZ));
  const a = sorted[0];
  const b = sorted[1];
  let axisX = b.x - a.x;
  let axisZ = b.z - a.z;
  let axisLength = Math.hypot(axisX, axisZ);
  if (axisLength < 0.001) {
    axisX = Math.cos(heading);
    axisZ = -Math.sin(heading);
    axisLength = 1;
  }
  axisX /= axisLength;
  axisZ /= axisLength;

  let escapeX = -axisZ;
  let escapeZ = axisX;
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  if (escapeX * forwardX + escapeZ * forwardZ < 0) {
    escapeX *= -1;
    escapeZ *= -1;
  }
  return { x: escapeX, z: escapeZ };
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function syncHorizontalVelocity(session: Phase33Session): void {
  const car = session.car;
  const forwardX = Math.sin(car.heading);
  const forwardZ = Math.cos(car.heading);
  const rightX = Math.cos(car.heading);
  const rightZ = -Math.sin(car.heading);
  car.velocity.x = forwardX * car.forwardVelocity + rightX * car.lateralVelocity;
  car.velocity.z = forwardZ * car.forwardVelocity + rightZ * car.lateralVelocity;
  car.speed = Math.hypot(car.velocity.x, car.velocity.z);
}

function capNormalSpeed(session: Phase33Session, input: RallyInputState): void {
  if (session.car.boostActive || input.boost) return;
  const cap = cartNormalSpeedCap(session.location.node.kind);
  const motion = Math.hypot(session.car.forwardVelocity, session.car.lateralVelocity);
  if (motion <= cap || motion < 0.001) return;
  const scale = cap / motion;
  session.car.forwardVelocity *= scale;
  session.car.lateralVelocity *= scale;
  syncHorizontalVelocity(session);
}

function positionIsSafe(session: Phase33Session, x: number, z: number): boolean {
  const node = session.location.node;
  if (cartArenaShapeForNode(node.id)) return cartArenaContains(node.id, x, z, 1.35);
  const margin = 1.35;
  return x >= node.rect.centerX - node.rect.halfWidth + margin
    && x <= node.rect.centerX + node.rect.halfWidth - margin
    && z >= node.rect.centerZ - node.rect.halfDepth + margin
    && z <= node.rect.centerZ + node.rect.halfDepth - margin;
}

function nearbySandwichIds(
  session: Phase33Session,
  nodeId: string,
  x: number,
  z: number,
): Set<string> {
  const result = new Set<string>();
  for (const enemy of aliveCartEnemies(session.enemies, nodeId)) {
    const radius = enemy.radius + SANDWICH_CONTACT_PADDING;
    if (Math.hypot(x - enemy.x, z - enemy.z) <= radius) result.add(enemy.id);
  }
  return result;
}

function releaseEnemySandwich(session: Phase33Session, touchingBefore: ReadonlySet<string>): void {
  const currentNodeId = session.location.node.id;
  const local = aliveCartEnemies(session.enemies, currentNodeId)
    .filter((enemy) => {
      const radius = enemy.radius + SANDWICH_CONTACT_PADDING;
      const touchingNow = Math.hypot(session.car.position.x - enemy.x, session.car.position.z - enemy.z) <= radius;
      return touchingNow || touchingBefore.has(enemy.id);
    });
  if (local.length < 2) return;

  const escape = cartSandwichEscapeVector(
    local,
    session.car.position.x,
    session.car.position.z,
    session.car.heading,
  );
  if (!escape) return;

  const candidates = [1, -1] as const;
  let moved = false;
  for (const direction of candidates) {
    const targetX = session.car.position.x + escape.x * SANDWICH_ESCAPE_DISTANCE * direction;
    const targetZ = session.car.position.z + escape.z * SANDWICH_ESCAPE_DISTANCE * direction;
    if (!positionIsSafe(session, targetX, targetZ)) continue;
    session.car.position.x = targetX;
    session.car.position.z = targetZ;
    moved = true;
    break;
  }

  for (const enemy of local.slice(0, 3)) {
    let dx = enemy.x - session.car.position.x;
    let dz = enemy.z - session.car.position.z;
    const distance = Math.hypot(dx, dz) || 1;
    dx /= distance;
    dz /= distance;
    const push = enemy.kind === "boss" ? 0.08 : enemy.kind === "heavy" ? 0.14 : 0.22;
    enemy.x += dx * push;
    enemy.z += dz * push;
    breakHeavyParallelContact(enemy, session.car.heading);
  }

  if (moved) {
    session.car.forwardVelocity = Math.max(2.7, Math.abs(session.car.forwardVelocity) * 0.92);
    session.car.lateralVelocity *= 0.25;
    session.car.collisionImpact = Math.max(session.car.collisionImpact, 0.5);
    syncHorizontalVelocity(session);
  }
}

function applyRecoveredEdgeRam(session: Phase33Session, target: CartEnemyState): void {
  const car = session.car;
  const impactSpeed = Math.max(8, Math.abs(car.forwardVelocity));
  const result = applyTurboRam(target, true, impactSpeed);
  if (result.damage <= 0) return;

  session.enemyHitCooldowns.set(target.id, target.kind === "boss" ? 0.38 : 0.28);
  session.lastRamEnemyId = result.enemyId;
  session.lastRamDamage = result.damage;
  car.collisionImpact = Math.max(car.collisionImpact, result.destroyed ? 1 : 0.9);

  if (result.destroyed) {
    const attackCap = car.definition.maxSpeed * 1.4;
    car.forwardVelocity = Math.min(attackCap, Math.max(0, car.forwardVelocity) * 0.99 + 0.8);
  } else {
    car.forwardVelocity *= target.kind === "boss" ? 0.84 : target.kind === "heavy" ? 0.88 : 0.92;
  }

  target.x += Math.sin(car.heading) * (result.destroyed ? 0.75 : target.kind === "boss" ? 1.2 : 1.6);
  target.z += Math.cos(car.heading) * (result.destroyed ? 0.75 : target.kind === "boss" ? 1.2 : 1.6);
  breakHeavyParallelContact(target, car.heading);
  car.boostTimeRemaining = Math.min(3.2, car.boostTimeRemaining + (result.destroyed ? 0.18 : 0.06));

  if (result.destroyed) {
    car.ramCount += 1;
    const gasReward = target.kind === "boss" ? 0.1 : target.kind === "heavy" ? 0.055 : 0.035;
    session.gas = Math.min(1, session.gas + gasReward);
    session.registerFlowSmash(target.kind === "boss" ? 0.12 : target.kind === "heavy" ? 0.1 : 0.08);
  }
  syncHorizontalVelocity(session);
}

function recoverMissedTurboEdgeHit(
  session: Phase33Session,
  fromX: number,
  fromZ: number,
  beforeHp: ReadonlyMap<string, number>,
  expandedTouchingBefore: ReadonlySet<string>,
  boostWasActive: boolean,
): void {
  if (!session.car.boostActive) return;

  const alreadyDamaged = session.enemies.some((enemy) => {
    const hp = beforeHp.get(enemy.id);
    return hp !== undefined && enemy.hp < hp;
  });
  if (alreadyDamaged) return;

  const boostJustStarted = !boostWasActive && session.car.boostActive;
  const target = session.enemies.find((enemy) => {
    if (!enemy.alive || enemy.nodeId !== session.location.node.id) return false;
    if (!beforeHp.has(enemy.id)) return false;
    if (!cartEnemySweepContact(
      enemy,
      session.location.node.id,
      fromX,
      fromZ,
      session.car.position.x,
      session.car.position.z,
      EXPANDED_RAM_RADIUS,
    )) return false;
    const wasAlreadyOnExpandedEdge = expandedTouchingBefore.has(enemy.id);
    if (session.enemyHitCooldowns.has(enemy.id) && wasAlreadyOnExpandedEdge && !boostJustStarted) return false;
    return true;
  });

  if (target) applyRecoveredEdgeRam(session, target);
}

export function installCartRoguePhase33HandlingCombat(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase33Session;
  const originalStep = prototype.step;

  prototype.step = function phase33HandlingCombatStep(
    this: Phase33Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const fromX = this.car.position.x;
    const fromZ = this.car.position.z;
    const headingBefore = this.car.heading;
    const boostWasActive = this.car.boostActive;
    const nodeId = this.location.node.id;
    const beforeHp = new Map<string, number>();
    const expandedTouchingBefore = new Set<string>();
    const sandwichTouchingBefore = nearbySandwichIds(this, nodeId, fromX, fromZ);

    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.nodeId !== nodeId) continue;
      beforeHp.set(enemy.id, enemy.hp);
      if (cartEnemyContact(enemy, fromX, fromZ, EXPANDED_RAM_RADIUS)) {
        expandedTouchingBefore.add(enemy.id);
      }
    }

    originalStep.call(this, input, fixedDelta);

    if (input.boost && Math.abs(this.car.speed) < 0.08) {
      const turn = normalizeAngle(this.car.heading - headingBefore);
      this.car.heading = normalizeAngle(headingBefore + turn * TURBO_PIVOT_TURN_SCALE);
    }

    recoverMissedTurboEdgeHit(
      this,
      fromX,
      fromZ,
      beforeHp,
      expandedTouchingBefore,
      boostWasActive,
    );
    releaseEnemySandwich(this, sandwichTouchingBefore);
    capNormalSpeed(this, input);
  };
}

installCartRoguePhase33HandlingCombat();

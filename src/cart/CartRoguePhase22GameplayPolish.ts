import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import {
  applyTurboRam,
  breakHeavyParallelContact,
  cartEnemyContact,
  type CartEnemyState,
} from "./CartCombat";
import type { CartWorldLocation } from "./CartWorldGraph";

interface Phase22Session {
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

export const CART_NORMAL_SPEED_RATIO = 0.93;
const CAR_CONTACT_RADIUS = 1.45;

export function cartNormalSpeedCap(baseMaxSpeed: number): number {
  return Math.max(0, baseMaxSpeed) * CART_NORMAL_SPEED_RATIO;
}

export function cartEnemySweepContact(
  enemy: CartEnemyState,
  nodeId: string,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  carRadius = CAR_CONTACT_RADIUS,
): boolean {
  if (!enemy.alive || enemy.nodeId !== nodeId) return false;
  const vx = toX - fromX;
  const vz = toZ - fromZ;
  const lengthSquared = vx * vx + vz * vz;
  let t = 0;
  if (lengthSquared > 1e-8) {
    t = ((enemy.x - fromX) * vx + (enemy.z - fromZ) * vz) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
  }
  const closestX = fromX + vx * t;
  const closestZ = fromZ + vz * t;
  return cartEnemyContact(enemy, closestX, closestZ, carRadius);
}

function syncHorizontalVelocity(session: Phase22Session): void {
  const car = session.car;
  const forwardX = Math.sin(car.heading);
  const forwardZ = Math.cos(car.heading);
  const rightX = Math.cos(car.heading);
  const rightZ = -Math.sin(car.heading);
  car.velocity.x = forwardX * car.forwardVelocity + rightX * car.lateralVelocity;
  car.velocity.z = forwardZ * car.forwardVelocity + rightZ * car.lateralVelocity;
  car.speed = Math.hypot(car.velocity.x, car.velocity.z);
}

function limitNormalTopSpeed(session: Phase22Session): void {
  const car = session.car;
  if (car.boostActive || car.forwardVelocity <= 0) return;
  const cap = cartNormalSpeedCap(car.definition.maxSpeed);
  if (car.forwardVelocity <= cap) return;
  car.forwardVelocity = cap;
  syncHorizontalVelocity(session);
}

function recoverMissedTurboRam(
  session: Phase22Session,
  previousX: number,
  previousZ: number,
  previousHp: ReadonlyMap<string, number>,
  previouslyTouching: ReadonlySet<string>,
): void {
  const car = session.car;
  if (!car.boostActive) return;
  const nodeId = session.location.node.id;
  const target = session.enemies.find((enemy) =>
    enemy.alive
    && enemy.nodeId === nodeId
    && cartEnemySweepContact(enemy, nodeId, previousX, previousZ, car.position.x, car.position.z));
  if (!target) return;

  const oldHp = previousHp.get(target.id);
  if (oldHp === undefined || target.hp < oldHp) return;

  const onCooldown = session.enemyHitCooldowns.has(target.id);
  const freshEntry = !previouslyTouching.has(target.id);
  if (onCooldown && !freshEntry) return;

  const result = applyTurboRam(target, true, car.forwardVelocity);
  if (result.damage <= 0) return;

  session.enemyHitCooldowns.set(target.id, target.kind === "boss" ? 0.42 : 0.34);
  session.lastRamEnemyId = result.enemyId;
  session.lastRamDamage = result.damage;
  car.collisionImpact = Math.max(car.collisionImpact, result.destroyed ? 1 : 0.88);

  if (result.destroyed) {
    const attackCap = car.definition.maxSpeed * 1.4;
    car.forwardVelocity = Math.min(attackCap, Math.max(0, car.forwardVelocity) * 0.99 + 0.8);
  } else {
    car.forwardVelocity *= target.kind === "boss" ? 0.82 : target.kind === "heavy" ? 0.86 : 0.9;
  }

  target.x += Math.sin(car.heading) * (result.destroyed ? 0.75 : target.kind === "boss" ? 1.35 : 1.75);
  target.z += Math.cos(car.heading) * (result.destroyed ? 0.75 : target.kind === "boss" ? 1.35 : 1.75);
  breakHeavyParallelContact(target, car.heading);
  car.boostTimeRemaining = Math.min(3.2, car.boostTimeRemaining + (result.destroyed ? 0.2 : 0.07));

  if (result.destroyed) {
    car.ramCount += 1;
    const gasReward = target.kind === "boss" ? 0.1 : target.kind === "heavy" ? 0.055 : 0.035;
    session.gas = Math.min(1, session.gas + gasReward);
    session.registerFlowSmash(target.kind === "boss" ? 0.12 : target.kind === "heavy" ? 0.1 : 0.08);
  }
  syncHorizontalVelocity(session);
}

export function installCartRoguePhase22GameplayPolish(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase22Session;
  const originalStep = prototype.step;

  prototype.step = function stepPhase22Gameplay(
    this: Phase22Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const previousX = this.car.position.x;
    const previousZ = this.car.position.z;
    const previousHp = new Map<string, number>();
    const previouslyTouching = new Set<string>();
    const nodeId = this.location.node.id;

    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.nodeId !== nodeId) continue;
      previousHp.set(enemy.id, enemy.hp);
      if (cartEnemyContact(enemy, previousX, previousZ, CAR_CONTACT_RADIUS)) previouslyTouching.add(enemy.id);
    }

    originalStep.call(this, input, fixedDelta);
    recoverMissedTurboRam(this, previousX, previousZ, previousHp, previouslyTouching);
    limitNormalTopSpeed(this);
  };
}

installCartRoguePhase22GameplayPolish();

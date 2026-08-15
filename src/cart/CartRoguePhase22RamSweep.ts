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

const CAR_RAM_RADIUS = 1.45;

export function cartEnemySweepContact(
  enemy: CartEnemyState,
  nodeId: string,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  carRadius = CAR_RAM_RADIUS,
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
  return cartEnemyContact(enemy, fromX + vx * t, fromZ + vz * t, carRadius);
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

function applyRecoveredRam(session: Phase22Session, target: CartEnemyState): void {
  const car = session.car;
  const impactSpeed = Math.max(8, Math.abs(car.forwardVelocity));
  const result = applyTurboRam(target, true, impactSpeed);
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

export function installCartRoguePhase22RamSweep(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase22Session;
  const originalStep = prototype.step;

  prototype.step = function phase22RamSweep(
    this: Phase22Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const fromX = this.car.position.x;
    const fromZ = this.car.position.z;
    const nodeId = this.location.node.id;
    const previousHp = new Map<string, number>();
    const touchingBefore = new Set<string>();

    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.nodeId !== nodeId) continue;
      previousHp.set(enemy.id, enemy.hp);
      if (cartEnemyContact(enemy, fromX, fromZ, CAR_RAM_RADIUS)) touchingBefore.add(enemy.id);
    }

    originalStep.call(this, input, fixedDelta);
    if (!this.car.boostActive) return;

    const currentNodeId = this.location.node.id;
    const target = this.enemies.find((enemy) =>
      enemy.alive
      && enemy.nodeId === currentNodeId
      && cartEnemySweepContact(
        enemy,
        currentNodeId,
        fromX,
        fromZ,
        this.car.position.x,
        this.car.position.z,
      ));
    if (!target) return;

    const oldHp = previousHp.get(target.id);
    if (oldHp === undefined || target.hp < oldHp) return;

    const staleCooldown = this.enemyHitCooldowns.has(target.id);
    const freshContact = !touchingBefore.has(target.id);
    if (staleCooldown && !freshContact) return;

    applyRecoveredRam(this, target);
  };
}

installCartRoguePhase22RamSweep();

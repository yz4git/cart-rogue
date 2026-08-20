import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { applyTurboRam, type CartEnemyState } from "./CartCombat";
import { getCartTurboAttackState } from "./CartRoguePhase54TurboAttack";
import { cartTraversalSyncHorizontalVelocity } from "./CartTraversalMath";

export interface CartTurboStrikeState {
  attackSerial: number;
  hitSerial: number;
  hitsThisAttack: number;
  totalHits: number;
  lastEnemyId: string | null;
  lastDamage: number;
  lastDestroyed: boolean;
}

interface InternalStrikeState extends CartTurboStrikeState {
  hitEnemyIds: Set<string>;
}

interface Phase55Session {
  car: CartArenaSession["car"];
  enemies: CartArenaSession["enemies"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

const stateBySession = new WeakMap<object, InternalStrikeState>();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function internalState(session: CartArenaSession | Phase55Session): InternalStrikeState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalStrikeState = {
    attackSerial: 0,
    hitSerial: 0,
    hitsThisAttack: 0,
    totalHits: 0,
    lastEnemyId: null,
    lastDamage: 0,
    lastDestroyed: false,
    hitEnemyIds: new Set<string>(),
  };
  stateBySession.set(key, created);
  return created;
}

export function cartTurboStrikeReach(charge: number): number {
  return 3.45 + clamp(charge, 0, 1) * 2.05;
}

export function cartTurboStrikeLaneHalfWidth(charge: number): number {
  return 1.45 + clamp(charge, 0, 1) * 1.15;
}

export function cartTurboStrikeKnockbackDistance(charge: number, destroyed: boolean): number {
  const normalized = clamp(charge, 0, 1);
  return destroyed
    ? 8.5 + normalized * 6.5
    : 2.6 + normalized * 3.4;
}

export function cartTurboStrikeCanReach(
  playerX: number,
  playerZ: number,
  heading: number,
  charge: number,
  enemy: Pick<CartEnemyState, "x" | "z" | "radius" | "alive">,
): boolean {
  if (!enemy.alive) return false;
  const dx = enemy.x - playerX;
  const dz = enemy.z - playerZ;
  const distance = Math.hypot(dx, dz);
  const minimumDistance = enemy.radius + 1.52;
  if (distance <= minimumDistance) return false;

  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const forward = dx * forwardX + dz * forwardZ;
  if (forward < 0.55 || forward > cartTurboStrikeReach(charge) + enemy.radius) return false;

  const lateral = Math.abs(dx * forwardZ - dz * forwardX);
  return lateral <= cartTurboStrikeLaneHalfWidth(charge) + enemy.radius * 0.58;
}

export function cartTurboStrikeTargetScore(
  playerX: number,
  playerZ: number,
  heading: number,
  enemy: Pick<CartEnemyState, "x" | "z">,
): number {
  const dx = enemy.x - playerX;
  const dz = enemy.z - playerZ;
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const forward = dx * forwardX + dz * forwardZ;
  const lateral = Math.abs(dx * forwardZ - dz * forwardX);
  return Math.max(0, forward) + lateral * 0.9;
}

export function getCartTurboStrikeState(session: CartArenaSession): CartTurboStrikeState {
  const state = internalState(session);
  return {
    attackSerial: state.attackSerial,
    hitSerial: state.hitSerial,
    hitsThisAttack: state.hitsThisAttack,
    totalHits: state.totalHits,
    lastEnemyId: state.lastEnemyId,
    lastDamage: state.lastDamage,
    lastDestroyed: state.lastDestroyed,
  };
}

export function installCartRoguePhase55TurboStrike(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase55Session;
  const previous = prototype.step;
  prototype.step = function phase55TurboStrikeStep(
    this: Phase55Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previous.call(this, input, fixedDelta);

    const session = this as unknown as CartArenaSession;
    const attack = getCartTurboAttackState(session);
    const state = internalState(this);
    if (attack.serial !== state.attackSerial) {
      state.attackSerial = attack.serial;
      state.hitsThisAttack = 0;
      state.hitEnemyIds.clear();
    }
    if (attack.mode !== "attack") return;

    const maxHits = attack.charge >= 0.82 ? 3 : 2;
    if (state.hitsThisAttack >= maxHits) return;

    const target = this.enemies
      .filter((enemy) => enemy.alive && !state.hitEnemyIds.has(enemy.id))
      .filter((enemy) => cartTurboStrikeCanReach(
        this.car.position.x,
        this.car.position.z,
        this.car.heading,
        attack.charge,
        enemy,
      ))
      .sort((a, b) => cartTurboStrikeTargetScore(
        this.car.position.x,
        this.car.position.z,
        this.car.heading,
        a,
      ) - cartTurboStrikeTargetScore(
        this.car.position.x,
        this.car.position.z,
        this.car.heading,
        b,
      ))[0];
    if (!target) return;

    state.hitEnemyIds.add(target.id);
    const effectiveSpeed = Math.max(Math.abs(this.car.forwardVelocity), 10.4 + attack.charge * 5.8);
    const result = applyTurboRam(target, true, effectiveSpeed, this.car.heading);
    if (result.damage <= 0) return;

    state.hitsThisAttack += 1;
    state.totalHits += 1;
    state.hitSerial += 1;
    state.lastEnemyId = target.id;
    state.lastDamage = result.damage;
    state.lastDestroyed = result.destroyed;

    const forwardX = Math.sin(this.car.heading);
    const forwardZ = Math.cos(this.car.heading);
    const knock = cartTurboStrikeKnockbackDistance(attack.charge, result.destroyed);
    target.x += forwardX * knock;
    target.z += forwardZ * knock;

    this.car.collisionImpact = Math.max(
      this.car.collisionImpact,
      result.destroyed ? 1.0 + attack.charge * 0.26 : 0.74 + attack.charge * 0.3,
    );
    this.car.boostTimeRemaining = Math.min(3.2, this.car.boostTimeRemaining + 0.04 + attack.charge * 0.055);
    if (result.destroyed) this.car.ramCount += 1;

    const cap = this.car.definition.maxSpeed * (1.46 + attack.charge * 0.04);
    this.car.forwardVelocity = Math.min(
      cap,
      Math.max(0, this.car.forwardVelocity) + 0.22 + attack.charge * 0.38,
    );
    this.car.lateralVelocity *= 0.84;
    cartTraversalSyncHorizontalVelocity(this.car);
  };
}

installCartRoguePhase55TurboStrike();
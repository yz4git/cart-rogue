import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { consumeCartPerfectRamWindow } from "./CartRoguePhase15Turbo";
import { launchCartEnemyFromVector } from "./CartRoguePhase16Flow";
import { getCartTurboStrikeState } from "./CartRoguePhase55TurboStrike";
import { getCartRunModifiers } from "./CartRunProgression";
import { cartTraversalSyncHorizontalVelocity } from "./CartTraversalMath";

export interface CartPerfectStrikeState {
  perfectSerial: number;
  lastStrikeHitSerial: number;
  lastEnemyId: string | null;
  lastBonusDamage: number;
  lastCharge: number;
  lastKO: boolean;
}

type InternalPerfectStrikeState = CartPerfectStrikeState;

interface Phase61Session {
  car: CartArenaSession["car"];
  enemies: CartArenaSession["enemies"];
  turboRechargeTimer?: number;
  step(input: RallyInputState, fixedDelta?: number): void;
}

const stateBySession = new WeakMap<object, InternalPerfectStrikeState>();

function internalState(session: CartArenaSession | Phase61Session): InternalPerfectStrikeState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalPerfectStrikeState = {
    perfectSerial: 0,
    lastStrikeHitSerial: getCartTurboStrikeState(session as CartArenaSession).hitSerial,
    lastEnemyId: null,
    lastBonusDamage: 0,
    lastCharge: 0,
    lastKO: false,
  };
  stateBySession.set(key, created);
  return created;
}

export function cartPerfectStrikeBonusDamage(baseDamage: number, charge: number, targetKind: string): number {
  const safeBase = Math.max(0, baseDamage);
  const safeCharge = Math.max(0, Math.min(1, charge));
  const kindScale = targetKind === "boss" ? 0.58 : targetKind === "heavy" ? 0.78 : 1;
  return Math.max(1, Math.round(safeBase * (0.24 + safeCharge * 0.2) * kindScale));
}

export function getCartPerfectStrikeState(session: CartArenaSession): CartPerfectStrikeState {
  const state = internalState(session);
  return { ...state };
}

export function installCartRoguePhase61PerfectStrike(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase61Session;
  const previous = prototype.step;
  prototype.step = function phase61PerfectStrikeStep(
    this: Phase61Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previous.call(this, input, fixedDelta);

    const session = this as unknown as CartArenaSession;
    const state = internalState(this);
    const strike = getCartTurboStrikeState(session);
    if (strike.hitSerial <= state.lastStrikeHitSerial) return;
    state.lastStrikeHitSerial = strike.hitSerial;

    const perfect = consumeCartPerfectRamWindow(session);
    if (!perfect || !strike.lastEnemyId || strike.lastDamage <= 0) return;
    const target = this.enemies.find((enemy) => enemy.id === strike.lastEnemyId);
    if (!target) return;

    const aliveBeforeBonus = target.alive;
    const bonus = cartPerfectStrikeBonusDamage(strike.lastDamage, perfect.charge, target.kind);
    if (target.alive) {
      target.hp = Math.max(0, target.hp - bonus);
      target.alive = target.hp > 0;
    }
    const perfectKO = aliveBeforeBonus && !target.alive;
    if (perfectKO) {
      this.car.ramCount += 1;
      launchCartEnemyFromVector(
        session,
        target,
        Math.sin(this.car.heading),
        Math.cos(this.car.heading),
        Math.max(16, Math.abs(this.car.forwardVelocity) + 4.5),
        true,
        bonus,
        0,
      );
    }

    const modifiers = getCartRunModifiers();
    if (typeof this.turboRechargeTimer === "number") {
      this.turboRechargeTimer += modifiers.perfectRechargeSeconds * 0.65;
    }
    this.car.boostTimeRemaining = Math.min(3.2, this.car.boostTimeRemaining + 0.11 + perfect.charge * 0.1);
    this.car.collisionImpact = Math.max(this.car.collisionImpact, 0.92 + perfect.charge * 0.08);
    const cap = this.car.definition.maxSpeed * 1.54;
    this.car.forwardVelocity = Math.min(cap, Math.max(0, this.car.forwardVelocity) + 0.28 + perfect.charge * 0.34);
    this.car.lateralVelocity *= 0.82;
    cartTraversalSyncHorizontalVelocity(this.car);

    state.perfectSerial += 1;
    state.lastEnemyId = target.id;
    state.lastBonusDamage = bonus;
    state.lastCharge = perfect.charge;
    state.lastKO = perfectKO;
  };
}

installCartRoguePhase61PerfectStrike();

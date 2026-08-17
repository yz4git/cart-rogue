import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { getCartTurboCombatState } from "./CartRoguePhase15Turbo";
import { cartTraversalSyncHorizontalVelocity } from "./CartTraversalMath";

export type CartTurboAttackMode = "idle" | "charging" | "ready" | "attack";

export interface CartTurboAttackState {
  mode: CartTurboAttackMode;
  charge: number;
  intensity: number;
  attackSecondsRemaining: number;
  attackDuration: number;
  serial: number;
}

interface InternalTurboAttackState {
  attackSecondsRemaining: number;
  attackDuration: number;
  releaseCharge: number;
  serial: number;
}

interface Phase54Session {
  car: CartArenaSession["car"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

const stateBySession = new WeakMap<object, InternalTurboAttackState>();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function internalState(session: CartArenaSession | Phase54Session): InternalTurboAttackState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalTurboAttackState = {
    attackSecondsRemaining: 0,
    attackDuration: 0,
    releaseCharge: 0,
    serial: 0,
  };
  stateBySession.set(key, created);
  return created;
}

export function cartTurboAttackWindowSeconds(charge: number): number {
  return 0.26 + clamp(charge, 0, 1) * 0.18;
}

export function cartTurboAttackReleaseKick(charge: number): number {
  return 0.35 + clamp(charge, 0, 1) * 0.75;
}

export function getCartTurboAttackState(session: CartArenaSession): CartTurboAttackState {
  const state = internalState(session);
  const turbo = getCartTurboCombatState(session);
  if (state.attackSecondsRemaining > 0 && state.attackDuration > 0) {
    const envelope = clamp(state.attackSecondsRemaining / state.attackDuration, 0, 1);
    return {
      mode: "attack",
      charge: state.releaseCharge,
      intensity: clamp(0.58 + state.releaseCharge * 0.32 + envelope * 0.1, 0, 1),
      attackSecondsRemaining: state.attackSecondsRemaining,
      attackDuration: state.attackDuration,
      serial: state.serial,
    };
  }
  if (turbo.held) {
    const ready = turbo.perfectReady;
    return {
      mode: ready ? "ready" : "charging",
      charge: turbo.charge,
      intensity: clamp((ready ? 0.72 : 0.18) + turbo.charge * (ready ? 0.28 : 0.62), 0, 1),
      attackSecondsRemaining: 0,
      attackDuration: 0,
      serial: state.serial,
    };
  }
  return {
    mode: "idle",
    charge: 0,
    intensity: 0,
    attackSecondsRemaining: 0,
    attackDuration: 0,
    serial: state.serial,
  };
}

export function cancelCartTurboAttack(session: CartArenaSession): void {
  const state = internalState(session);
  state.attackSecondsRemaining = 0;
  state.attackDuration = 0;
  state.releaseCharge = 0;
}

export function installCartRoguePhase54TurboAttack(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase54Session;
  const previous = prototype.step;
  prototype.step = function phase54TurboAttackStep(
    this: Phase54Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const state = internalState(this);
    const beforeTurbo = getCartTurboCombatState(this as unknown as CartArenaSession);
    const releasedThisStep = beforeTurbo.held && !input.boost;
    const releaseCharge = releasedThisStep ? beforeTurbo.charge : 0;

    previous.call(this, input, fixedDelta);

    const delta = Math.max(0, Math.min(0.05, fixedDelta));
    if (state.attackSecondsRemaining > 0) {
      state.attackSecondsRemaining = Math.max(0, state.attackSecondsRemaining - delta);
      if (state.attackSecondsRemaining <= 0) {
        state.attackDuration = 0;
        state.releaseCharge = 0;
      }
    }

    if (!releasedThisStep || !this.car.boostActive) return;

    state.releaseCharge = clamp(releaseCharge, 0, 1);
    state.attackDuration = cartTurboAttackWindowSeconds(state.releaseCharge);
    state.attackSecondsRemaining = state.attackDuration;
    state.serial += 1;

    // Phase 15 already owns the main launch. Phase 54 adds a small, bounded
    // attack kick so the release reads as an offensive commit without creating
    // a second boost physics system.
    const cap = this.car.definition.maxSpeed * (1.5 + state.releaseCharge * 0.06);
    this.car.forwardVelocity = Math.min(
      cap,
      Math.max(0, this.car.forwardVelocity) + cartTurboAttackReleaseKick(state.releaseCharge),
    );
    this.car.boostTimeRemaining = Math.min(
      3.2,
      this.car.boostTimeRemaining + 0.05 + state.releaseCharge * 0.08,
    );
    this.car.collisionImpact = Math.max(this.car.collisionImpact, 0.24 + state.releaseCharge * 0.18);
    cartTraversalSyncHorizontalVelocity(this.car);
  };
}

installCartRoguePhase54TurboAttack();

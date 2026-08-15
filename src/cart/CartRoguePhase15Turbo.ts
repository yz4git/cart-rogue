import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, cartSteeringInput, quickenCartSteering } from "./CartArenaSession";
import { CartRogueCanvasPreview } from "./CartRogueCanvasPreview";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { getCartRunModifiers } from "./CartRunProgression";

interface TurboHoldState {
  held: boolean;
  holdSeconds: number;
  lastCharge: number;
  recoverySeconds: number;
  perfectWindowSeconds: number;
  releaseCharge: number;
  releaseSerial: number;
}

interface Phase15Session {
  car: CartArenaSession["car"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface DemoWithSession {
  session: CartArenaSession;
  pause(): void;
}

export interface CartTurboCombatState {
  held: boolean;
  charge: number;
  perfectReady: boolean;
  perfectWindowSeconds: number;
  releaseCharge: number;
  releaseSerial: number;
}

const stateBySession = new WeakMap<object, TurboHoldState>();

export const CART_TURBO_DRIFT_FULL_CHARGE_SECONDS = 0.78;
export const CART_TURBO_DRIFT_MIN_SPEED = 4.4;
export const CART_PERFECT_RELEASE_CHARGE = 0.88;

function getState(session: Phase15Session): TurboHoldState {
  const key = session as unknown as object;
  const current = stateBySession.get(key);
  if (current) return current;
  const created: TurboHoldState = {
    held: false,
    holdSeconds: 0,
    lastCharge: 0,
    recoverySeconds: 0,
    perfectWindowSeconds: 0,
    releaseCharge: 0,
    releaseSerial: 0,
  };
  stateBySession.set(key, created);
  return created;
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function syncHorizontalVelocity(session: Phase15Session): void {
  const car = session.car;
  const forwardX = Math.sin(car.heading);
  const forwardZ = Math.cos(car.heading);
  const rightX = Math.cos(car.heading);
  const rightZ = -Math.sin(car.heading);
  car.velocity.x = forwardX * car.forwardVelocity + rightX * car.lateralVelocity;
  car.velocity.z = forwardZ * car.forwardVelocity + rightZ * car.lateralVelocity;
  car.speed = Math.hypot(car.velocity.x, car.velocity.z);
}

function clearDriftBrakeState(session: Phase15Session): void {
  const car = session.car as CartArenaSession["car"] & { drifting: boolean; lastBrake: number; driftDuration: number };
  car.drifting = false;
  car.lastBrake = 0;
  car.driftDuration = 0;
}

function applyTurboDriftHold(session: Phase15Session, input: RallyInputState, delta: number, charge: number): void {
  const car = session.car;
  const steer = quickenCartSteering(cartSteeringInput(input.steer));
  const steerMagnitude = Math.abs(steer);
  const speed = Math.abs(car.forwardVelocity);
  const direction = Math.sign(car.forwardVelocity || 1);

  if (speed > CART_TURBO_DRIFT_MIN_SPEED) {
    const damping = Math.pow(0.995 - charge * 0.001, delta * 60);
    car.forwardVelocity *= damping;
    if (Math.abs(car.forwardVelocity) < CART_TURBO_DRIFT_MIN_SPEED) {
      car.forwardVelocity = direction * CART_TURBO_DRIFT_MIN_SPEED;
    }
  }

  if (steerMagnitude > 0.035) {
    const yawRate = (0.3 + charge * 0.36) * steerMagnitude;
    car.heading = normalizeAngle(car.heading + Math.sign(steer) * direction * yawRate * delta);
    const targetSlip = -steer * Math.max(6, speed) * (0.15 + charge * 0.085);
    const slipBlend = Math.min(1, delta * (4.1 + charge * 1.2));
    car.lateralVelocity += (targetSlip - car.lateralVelocity) * slipBlend;
  } else {
    car.lateralVelocity *= Math.pow(0.965, delta * 60);
  }

  car.collisionImpact = Math.max(car.collisionImpact, steerMagnitude > 0.55 ? 0.06 + charge * 0.05 : 0);
  syncHorizontalVelocity(session);
}

function applyReleaseDash(session: Phase15Session, charge: number): boolean {
  const car = session.car;
  clearDriftBrakeState(session);

  if (!car.boostActive) {
    car.lateralVelocity *= 0.72;
    syncHorizontalVelocity(session);
    return false;
  }

  const launch = 1.8 + charge * 3.35;
  const cap = car.definition.maxSpeed * (1.43 + charge * 0.07);
  car.forwardVelocity = Math.min(cap, Math.max(0, car.forwardVelocity) + launch);
  car.lateralVelocity *= 0.44 - charge * 0.1;
  car.boostTimeRemaining = Math.min(3.2, car.boostTimeRemaining + 0.1 + charge * 0.3);
  car.collisionImpact = Math.max(car.collisionImpact, 0.2 + charge * 0.16);
  syncHorizontalVelocity(session);
  return true;
}

function applyReleaseRecovery(session: Phase15Session, state: TurboHoldState, delta: number): void {
  if (state.recoverySeconds <= 0) return;
  clearDriftBrakeState(session);
  session.car.lateralVelocity *= Math.pow(0.9, delta * 60);
  syncHorizontalVelocity(session);
  state.recoverySeconds = Math.max(0, state.recoverySeconds - delta);
}

export function cartTurboDriftCharge(seconds: number): number {
  return Math.max(0, Math.min(1, seconds / CART_TURBO_DRIFT_FULL_CHARGE_SECONDS));
}

export function getCartTurboCombatState(session: CartArenaSession): CartTurboCombatState {
  const state = getState(session as unknown as Phase15Session);
  const charge = state.held ? cartTurboDriftCharge(state.holdSeconds) : state.lastCharge;
  return {
    held: state.held,
    charge,
    perfectReady: state.held && charge >= CART_PERFECT_RELEASE_CHARGE,
    perfectWindowSeconds: state.perfectWindowSeconds,
    releaseCharge: state.releaseCharge,
    releaseSerial: state.releaseSerial,
  };
}

export function consumeCartPerfectRamWindow(session: CartArenaSession): { charge: number; serial: number } | null {
  const state = getState(session as unknown as Phase15Session);
  if (state.perfectWindowSeconds <= 0 || state.releaseCharge < CART_PERFECT_RELEASE_CHARGE) return null;
  const result = { charge: state.releaseCharge, serial: state.releaseSerial };
  state.perfectWindowSeconds = 0;
  return result;
}

export function cancelCartTurboHold(session: CartArenaSession): void {
  const state = getState(session as unknown as Phase15Session);
  state.held = false;
  state.holdSeconds = 0;
  state.lastCharge = 0;
  state.recoverySeconds = 0;
  state.perfectWindowSeconds = 0;
  state.releaseCharge = 0;
  clearDriftBrakeState(session as unknown as Phase15Session);
}

export function installCartRoguePhase15Turbo(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase15Session;
  const originalStep = prototype.step;

  prototype.step = function phase15TurboStep(this: Phase15Session, input: RallyInputState, fixedDelta = 1 / 60): void {
    const state = getState(this);
    const heldNow = Boolean(input.boost);
    const releasedThisStep = state.held && !heldNow;

    if (state.perfectWindowSeconds > 0 && !state.held) {
      state.perfectWindowSeconds = Math.max(0, state.perfectWindowSeconds - fixedDelta);
    }
    if (heldNow) {
      state.perfectWindowSeconds = 0;
      state.releaseCharge = 0;
      state.holdSeconds = Math.min(1.35, state.holdSeconds + fixedDelta);
    }
    const charge = cartTurboDriftCharge(state.holdSeconds);
    if (heldNow) state.lastCharge = charge;

    const transformed: RallyInputState = {
      ...input,
      boost: releasedThisStep,
      throttle: heldNow ? Math.min(input.throttle, 0.24) : input.throttle,
      brake: input.brake,
      steer: heldNow ? input.steer * 0.68 : input.steer,
    };

    originalStep.call(this, transformed, fixedDelta);

    if (heldNow) {
      state.recoverySeconds = 0;
      applyTurboDriftHold(this, input, fixedDelta, charge);
    } else if (releasedThisStep) {
      const releaseCharge = state.lastCharge;
      const fired = applyReleaseDash(this, releaseCharge);
      if (fired && releaseCharge >= CART_PERFECT_RELEASE_CHARGE) {
        state.releaseCharge = releaseCharge;
        state.releaseSerial += 1;
        state.perfectWindowSeconds = getCartRunModifiers().perfectWindowSeconds;
      } else {
        state.releaseCharge = 0;
        state.perfectWindowSeconds = 0;
      }
      state.recoverySeconds = 0.22;
      state.holdSeconds = 0;
      state.lastCharge = 0;
    } else {
      applyReleaseRecovery(this, state, fixedDelta);
    }

    state.held = heldNow;
  };

  const webglPrototype = CartRogueWebGLDemo.prototype as unknown as DemoWithSession;
  const originalWebglPause = webglPrototype.pause;
  webglPrototype.pause = function phase15WebglPause(this: DemoWithSession): void {
    originalWebglPause.call(this);
    cancelCartTurboHold(this.session);
  };

  const canvasPrototype = CartRogueCanvasPreview.prototype as unknown as DemoWithSession;
  const originalCanvasPause = canvasPrototype.pause;
  canvasPrototype.pause = function phase15CanvasPause(this: DemoWithSession): void {
    originalCanvasPause.call(this);
    cancelCartTurboHold(this.session);
  };
}

installCartRoguePhase15Turbo();

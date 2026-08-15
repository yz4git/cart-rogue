import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, cartSteeringInput, quickenCartSteering } from "./CartArenaSession";
import { CartRogueCanvasPreview } from "./CartRogueCanvasPreview";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface TurboHoldState {
  held: boolean;
  holdSeconds: number;
  lastCharge: number;
  recoverySeconds: number;
}

interface Phase15Session {
  car: CartArenaSession["car"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface DemoWithSession {
  session: CartArenaSession;
  pause(): void;
}

const stateBySession = new WeakMap<object, TurboHoldState>();

export const CART_TURBO_DRIFT_FULL_CHARGE_SECONDS = 0.78;
export const CART_TURBO_DRIFT_MIN_SPEED = 4.4;

function getState(session: Phase15Session): TurboHoldState {
  const key = session as unknown as object;
  const current = stateBySession.get(key);
  if (current) return current;
  const created: TurboHoldState = { held: false, holdSeconds: 0, lastCharge: 0, recoverySeconds: 0 };
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

  // Holding Turbo is a setup state, not a second brake button. Speed bleeds
  // progressively while steering creates a readable lateral slide.
  if (speed > CART_TURBO_DRIFT_MIN_SPEED) {
    const damping = Math.pow(0.995 - charge * 0.001, delta * 60);
    car.forwardVelocity *= damping;
    if (Math.abs(car.forwardVelocity) < CART_TURBO_DRIFT_MIN_SPEED) {
      car.forwardVelocity = direction * CART_TURBO_DRIFT_MIN_SPEED;
    }
  }

  if (steerMagnitude > 0.035) {
    // Phase 15 originally stacked a large manual yaw on top of Cart's already
    // quick steering. Keep the drift responsive, but make the nose rotate in
    // a controlled arc instead of snapping around the player.
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

  // Even with an empty Turbo rack, releasing the button must immediately exit
  // the deceleration/drift state and hand control back to normal acceleration.
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
  // Kill only the leftover sideways drift. Forward velocity is left to the
  // normal RallyCar throttle/boost path so the car never remains in a hidden
  // braking state after the finger comes off Turbo.
  session.car.lateralVelocity *= Math.pow(0.9, delta * 60);
  syncHorizontalVelocity(session);
  state.recoverySeconds = Math.max(0, state.recoverySeconds - delta);
}

export function cartTurboDriftCharge(seconds: number): number {
  return Math.max(0, Math.min(1, seconds / CART_TURBO_DRIFT_FULL_CHARGE_SECONDS));
}

export function cancelCartTurboHold(session: CartArenaSession): void {
  const state = getState(session as unknown as Phase15Session);
  state.held = false;
  state.holdSeconds = 0;
  state.lastCharge = 0;
  state.recoverySeconds = 0;
  clearDriftBrakeState(session as unknown as Phase15Session);
}

export function installCartRoguePhase15Turbo(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase15Session;
  const originalStep = prototype.step;

  prototype.step = function phase15TurboStep(this: Phase15Session, input: RallyInputState, fixedDelta = 1 / 60): void {
    const state = getState(this);
    const heldNow = Boolean(input.boost);
    const releasedThisStep = state.held && !heldNow;

    if (heldNow) state.holdSeconds = Math.min(1.35, state.holdSeconds + fixedDelta);
    const charge = cartTurboDriftCharge(state.holdSeconds);
    if (heldNow) state.lastCharge = charge;

    const transformed: RallyInputState = {
      ...input,
      // Never activate the existing Turbo while the button is held. Fire
      // exactly once on release. Do not inject RallyCar braking here: Phase 16
      // uses its own gentle speed bleed so the brake/drift latch cannot linger.
      boost: releasedThisStep,
      throttle: heldNow ? Math.min(input.throttle, 0.24) : input.throttle,
      brake: input.brake,
      // Cart's normal steering is deliberately very quick. During the Turbo
      // hold only, reduce the base steering sent into that path; the extra
      // slip/yaw layer below provides the drift aim without an abrupt snap.
      steer: heldNow ? input.steer * 0.68 : input.steer,
    };

    originalStep.call(this, transformed, fixedDelta);

    if (heldNow) {
      state.recoverySeconds = 0;
      applyTurboDriftHold(this, input, fixedDelta, charge);
    } else if (releasedThisStep) {
      applyReleaseDash(this, state.lastCharge);
      state.recoverySeconds = 0.22;
      state.holdSeconds = 0;
      state.lastCharge = 0;
    } else {
      applyReleaseRecovery(this, state, fixedDelta);
    }

    state.held = heldNow;
  };

  // Pausing a run must cancel a held button rather than producing a surprise
  // release dash on the first frame after a perk/result overlay closes.
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

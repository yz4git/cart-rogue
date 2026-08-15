import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, cartSteeringInput, quickenCartSteering } from "./CartArenaSession";
import { CartRogueCanvasPreview } from "./CartRogueCanvasPreview";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface TurboHoldState {
  held: boolean;
  holdSeconds: number;
  lastCharge: number;
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
  const created: TurboHoldState = { held: false, holdSeconds: 0, lastCharge: 0 };
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

function applyTurboDriftHold(session: Phase15Session, input: RallyInputState, delta: number, charge: number): void {
  const car = session.car;
  const steer = quickenCartSteering(cartSteeringInput(input.steer));
  const steerMagnitude = Math.abs(steer);
  const speed = Math.abs(car.forwardVelocity);
  const direction = Math.sign(car.forwardVelocity || 1);

  // Holding Turbo is a deliberate setup state: shed speed without coming to a stop.
  if (speed > CART_TURBO_DRIFT_MIN_SPEED) {
    const damping = Math.pow(0.9915 - charge * 0.0015, delta * 60);
    car.forwardVelocity *= damping;
    if (Math.abs(car.forwardVelocity) < CART_TURBO_DRIFT_MIN_SPEED) {
      car.forwardVelocity = direction * CART_TURBO_DRIFT_MIN_SPEED;
    }
  }

  if (steerMagnitude > 0.035) {
    // Pivot the nose quickly while keeping a controllable amount of lateral slip.
    const yawRate = (1.15 + charge * 1.2) * steerMagnitude;
    car.heading = normalizeAngle(car.heading + Math.sign(steer) * direction * yawRate * delta);
    const targetSlip = -steer * Math.max(6, speed) * (0.22 + charge * 0.16);
    const slipBlend = Math.min(1, delta * (6.2 + charge * 2.8));
    car.lateralVelocity += (targetSlip - car.lateralVelocity) * slipBlend;
  } else {
    car.lateralVelocity *= Math.pow(0.96, delta * 60);
  }

  car.collisionImpact = Math.max(car.collisionImpact, steerMagnitude > 0.45 ? 0.08 + charge * 0.08 : 0);
  syncHorizontalVelocity(session);
}

function applyReleaseDash(session: Phase15Session, charge: number): void {
  const car = session.car;
  if (!car.boostActive) return;
  const launch = 1.35 + charge * 3.25;
  const cap = car.definition.maxSpeed * (1.43 + charge * 0.07);
  car.forwardVelocity = Math.min(cap, Math.max(0, car.forwardVelocity) + launch);
  car.lateralVelocity *= 0.52 - charge * 0.12;
  car.boostTimeRemaining = Math.min(3.2, car.boostTimeRemaining + 0.08 + charge * 0.28);
  car.collisionImpact = Math.max(car.collisionImpact, 0.18 + charge * 0.16);
  syncHorizontalVelocity(session);
}

export function cartTurboDriftCharge(seconds: number): number {
  return Math.max(0, Math.min(1, seconds / CART_TURBO_DRIFT_FULL_CHARGE_SECONDS));
}

export function cancelCartTurboHold(session: CartArenaSession): void {
  const state = getState(session as unknown as Phase15Session);
  state.held = false;
  state.holdSeconds = 0;
  state.lastCharge = 0;
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
      // Never activate the existing Turbo while the button is held. Fire exactly
      // once on the held -> released edge so charge stocks remain authoritative.
      boost: releasedThisStep,
      throttle: heldNow ? Math.min(input.throttle, 0.18) : input.throttle,
      brake: heldNow ? Math.max(input.brake, 0.28) : input.brake,
    };

    originalStep.call(this, transformed, fixedDelta);

    if (heldNow) {
      applyTurboDriftHold(this, input, fixedDelta, charge);
    } else if (releasedThisStep) {
      applyReleaseDash(this, state.lastCharge);
      state.holdSeconds = 0;
      state.lastCharge = 0;
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

import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import {
  cancelCartRaidHazards,
  getCartRaidHazardState,
  queueCartRaidHazard,
  type CartRaidHazardPublicState,
} from "./CartRoguePhase88RaidHazards";
import { CART_TURBO_HUNT_FIELD } from "./CartTurboHuntTrack";

export interface CartForcedDodgeTrajectorySnapshot {
  active: boolean;
  correctedSerial: number;
  correctedHazardId: number | null;
  sourceLabel: string;
  lockSeconds: number;
  predictedX: number;
  predictedZ: number;
}

interface InternalState extends CartForcedDodgeTrajectorySnapshot {
  correctedIds: Set<number>;
  broadcastClock: number;
}

interface Phase93Session {
  car: CartArenaSession["car"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

const stateBySession = new WeakMap<object, InternalState>();
let latestSnapshot: CartForcedDodgeTrajectorySnapshot | null = null;

export const CART_FORCED_DODGE_TRAJECTORY_EVENT = "cart-forced-dodge-trajectory-snapshot";
export const CART_FORCED_DODGE_LOCK_MIN_SECONDS = 0.78;
export const CART_FORCED_DODGE_LOCK_MAX_SECONDS = 0.86;
export const CART_FORCED_DODGE_ACCELERATION = 8.5;
export const CART_FORCED_DODGE_FIELD_MARGIN = 7;
export const CART_FORCED_DODGE_LINE_WIDTH = 12.5;
export const CART_FORCED_DODGE_LINE_LENGTH = 44;
export const CART_FORCED_DODGE_CROSS_WIDTH = 9.5;
export const CART_FORCED_DODGE_LABEL_PREFIX = "LOCKED INTERCEPT";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stateFor(session: CartArenaSession | Phase93Session): InternalState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalState = {
    active: false,
    correctedSerial: 0,
    correctedHazardId: null,
    sourceLabel: "",
    lockSeconds: 0,
    predictedX: 0,
    predictedZ: 0,
    correctedIds: new Set(),
    broadcastClock: 0,
  };
  stateBySession.set(key, created);
  return created;
}

function snapshotOf(state: InternalState): CartForcedDodgeTrajectorySnapshot {
  return {
    active: state.active,
    correctedSerial: state.correctedSerial,
    correctedHazardId: state.correctedHazardId,
    sourceLabel: state.sourceLabel,
    lockSeconds: state.lockSeconds,
    predictedX: state.predictedX,
    predictedZ: state.predictedZ,
  };
}

export function getCartForcedDodgeTrajectoryState(session: CartArenaSession): CartForcedDodgeTrajectorySnapshot {
  return snapshotOf(stateFor(session));
}

export function getLatestCartForcedDodgeTrajectoryState(): CartForcedDodgeTrajectorySnapshot | null {
  return latestSnapshot ? { ...latestSnapshot } : null;
}

function broadcast(state: InternalState): void {
  const snapshot = snapshotOf(state);
  latestSnapshot = snapshot;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CartForcedDodgeTrajectorySnapshot>(CART_FORCED_DODGE_TRAJECTORY_EVENT, { detail: snapshot }));
  }
}

function clampField(x: number, z: number): { x: number; z: number } {
  return {
    x: clamp(
      x,
      CART_TURBO_HUNT_FIELD.centerX - CART_TURBO_HUNT_FIELD.halfWidth + CART_FORCED_DODGE_FIELD_MARGIN,
      CART_TURBO_HUNT_FIELD.centerX + CART_TURBO_HUNT_FIELD.halfWidth - CART_FORCED_DODGE_FIELD_MARGIN,
    ),
    z: clamp(
      z,
      CART_TURBO_HUNT_FIELD.centerZ - CART_TURBO_HUNT_FIELD.halfDepth + CART_FORCED_DODGE_FIELD_MARGIN,
      CART_TURBO_HUNT_FIELD.centerZ + CART_TURBO_HUNT_FIELD.halfDepth - CART_FORCED_DODGE_FIELD_MARGIN,
    ),
  };
}

/** Predict the no-new-evasion path from LOCK until impact. */
export function cartForcedDodgePredictedPoint(
  session: CartArenaSession,
  input: RallyInputState,
  seconds: number,
): { x: number; z: number; travel: number; lateral: number } {
  const t = clamp(seconds, 0.35, CART_FORCED_DODGE_LOCK_MAX_SECONDS);
  const car = session.car;
  const heading = car.heading;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  const speed = Math.max(0, Math.abs(car.forwardVelocity), Math.abs(car.speed));
  const throttle = clamp(input.throttle, 0, 1);
  const brake = clamp(input.brake, 0, 1);
  const acceleration = throttle * (1 - brake) * CART_FORCED_DODGE_ACCELERATION;
  const travel = speed * t + 0.5 * acceleration * t * t;
  const steer = clamp(input.strafe ?? input.steer, -1, 1);
  const lateral = car.lateralVelocity * t + steer * Math.min(3.2, speed * 0.12) * t;
  const point = clampField(
    car.position.x + fx * travel + rx * lateral,
    car.position.z + fz * travel + rz * lateral,
  );
  return { ...point, travel, lateral };
}

function correctedSpec(
  session: CartArenaSession,
  hazard: CartRaidHazardPublicState,
  input: RallyInputState,
): Parameters<typeof queueCartRaidHazard>[1] {
  const lockSeconds = clamp(hazard.secondsToFire, CART_FORCED_DODGE_LOCK_MIN_SECONDS, CART_FORCED_DODGE_LOCK_MAX_SECONDS);
  const predicted = cartForcedDodgePredictedPoint(session, input, lockSeconds);
  const heading = session.car.heading;
  let x = predicted.x;
  let z = predicted.z;

  if (hazard.kind === "DONUT") {
    const ringMid = (hazard.innerRadius + hazard.outerRadius) * 0.5;
    x -= Math.sin(heading) * ringMid;
    z -= Math.cos(heading) * ringMid;
    ({ x, z } = clampField(x, z));
  } else if (hazard.kind === "CONE") {
    const behind = Math.min(5.5, hazard.radius * 0.22);
    x -= Math.sin(heading) * behind;
    z -= Math.cos(heading) * behind;
    ({ x, z } = clampField(x, z));
  }

  const width = hazard.kind === "LINE"
    ? Math.max(hazard.width, CART_FORCED_DODGE_LINE_WIDTH)
    : hazard.kind === "CROSS"
      ? Math.max(hazard.width, CART_FORCED_DODGE_CROSS_WIDTH)
      : hazard.width;
  const length = hazard.kind === "LINE" || hazard.kind === "CROSS"
    ? Math.max(hazard.length, CART_FORCED_DODGE_LINE_LENGTH)
    : hazard.length;

  return {
    kind: hazard.kind,
    source: "FIELD",
    label: `${CART_FORCED_DODGE_LABEL_PREFIX} · ${hazard.label}`,
    x,
    z,
    heading: hazard.kind === "LINE" || hazard.kind === "CROSS" || hazard.kind === "CONE" ? heading : hazard.heading,
    width,
    length,
    radius: hazard.radius,
    innerRadius: hazard.innerRadius,
    outerRadius: hazard.outerRadius,
    coneAngle: hazard.coneAngle,
    telegraphSeconds: lockSeconds,
  };
}

function applyForcedLock(
  session: CartArenaSession,
  input: RallyInputState,
  state: InternalState,
  hazard: CartRaidHazardPublicState,
): void {
  const spec = correctedSpec(session, hazard, input);
  const predicted = cartForcedDodgePredictedPoint(session, input, spec.telegraphSeconds ?? CART_FORCED_DODGE_LOCK_MIN_SECONDS);
  cancelCartRaidHazards(session, "FIELD");
  const id = queueCartRaidHazard(session, spec);
  if (id === null) return;
  state.correctedIds.add(id);
  state.correctedSerial += 1;
  state.correctedHazardId = id;
  state.sourceLabel = hazard.label;
  state.lockSeconds = spec.telegraphSeconds ?? CART_FORCED_DODGE_LOCK_MIN_SECONDS;
  state.predictedX = predicted.x;
  state.predictedZ = predicted.z;
  state.active = true;
}

export function installCartRoguePhase93ForcedDodgeTrajectory2(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase93Session;
  const previousStep = prototype.step;
  prototype.step = function phase93ForcedDodgeTrajectory2Step(
    this: Phase93Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previousStep.call(this, input, fixedDelta);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return;
    const delta = clamp(fixedDelta, 0, 0.05);
    const state = stateFor(this);
    const raid = getCartRaidHazardState(session);
    const fieldHazards = raid.hazards.filter((hazard) => hazard.source === "FIELD");
    state.active = fieldHazards.some((hazard) => hazard.label.startsWith(CART_FORCED_DODGE_LABEL_PREFIX));

    const candidate = fieldHazards.find((hazard) =>
      hazard.phase === "LOCKED"
      && hazard.secondsToFire > 0.35
      && !hazard.label.startsWith(CART_FORCED_DODGE_LABEL_PREFIX)
      && !state.correctedIds.has(hazard.id),
    );
    if (candidate) {
      state.correctedIds.add(candidate.id);
      applyForcedLock(session, input, state, candidate);
    }

    const liveIds = new Set(getCartRaidHazardState(session).hazards.map((hazard) => hazard.id));
    for (const id of state.correctedIds) {
      if (!liveIds.has(id) && id !== state.correctedHazardId) state.correctedIds.delete(id);
    }

    state.broadcastClock += delta;
    if (state.broadcastClock >= 0.1) {
      state.broadcastClock %= 0.1;
      broadcast(state);
    }
  };
}

installCartRoguePhase93ForcedDodgeTrajectory2();

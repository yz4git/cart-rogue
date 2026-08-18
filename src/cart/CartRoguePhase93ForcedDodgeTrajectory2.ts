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
export const CART_FORCED_DODGE_LOCK_MIN_SECONDS = 0.94;
export const CART_FORCED_DODGE_LOCK_MAX_SECONDS = 1.04;
export const CART_FORCED_DODGE_ACCELERATION = 8.5;
export const CART_FORCED_DODGE_FIELD_MARGIN = 7;
export const CART_FORCED_DODGE_LINE_WIDTH = 8.8;
export const CART_FORCED_DODGE_LINE_LENGTH = 42;
export const CART_FORCED_DODGE_CROSS_WIDTH = 6.4;
export const CART_FORCED_DODGE_CIRCLE_RADIUS = 7.4;
export const CART_FORCED_DODGE_CONE_RADIUS = 19;
export const CART_FORCED_DODGE_CONE_ANGLE = Math.PI * 0.4;
export const CART_FORCED_DODGE_DONUT_OUTER_RADIUS = 13.2;
export const CART_FORCED_DODGE_REACTION_STEER_THRESHOLD = 0.42;
export const CART_FORCED_DODGE_REACTION_BRAKE_THRESHOLD = 0.32;
export const CART_FORCED_DODGE_REACTION_YAW_RATE = 0.92;
export const CART_FORCED_DODGE_REACTION_LATERAL_ACCELERATION = 7.5;
export const CART_FORCED_DODGE_REACTION_EXTRA_BRAKE = 7.5;
export const CART_FORCED_DODGE_REACTION_MAX_LATERAL_SPEED = 13.5;
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

  const width = hazard.kind === "LINE"
    ? clamp(hazard.width, 7.6, CART_FORCED_DODGE_LINE_WIDTH)
    : hazard.kind === "CROSS"
      ? clamp(hazard.width, 5.6, CART_FORCED_DODGE_CROSS_WIDTH)
      : hazard.width;
  const length = hazard.kind === "LINE" || hazard.kind === "CROSS"
    ? Math.max(hazard.length, CART_FORCED_DODGE_LINE_LENGTH)
    : hazard.length;
  const radius = hazard.kind === "CIRCLE"
    ? clamp(hazard.radius, 5.8, CART_FORCED_DODGE_CIRCLE_RADIUS)
    : hazard.kind === "CONE"
      ? clamp(hazard.radius, 15.5, CART_FORCED_DODGE_CONE_RADIUS)
      : hazard.radius;
  const outerRadius = hazard.kind === "DONUT"
    ? clamp(hazard.outerRadius, 10.8, CART_FORCED_DODGE_DONUT_OUTER_RADIUS)
    : hazard.outerRadius;
  const innerRadius = hazard.kind === "DONUT" ? outerRadius * 0.36 : hazard.innerRadius;
  const coneAngle = hazard.kind === "CONE"
    ? Math.min(hazard.coneAngle, CART_FORCED_DODGE_CONE_ANGLE)
    : hazard.coneAngle;

  if (hazard.kind === "DONUT") {
    const ringMid = (innerRadius + outerRadius) * 0.5;
    x -= Math.sin(heading) * ringMid;
    z -= Math.cos(heading) * ringMid;
    ({ x, z } = clampField(x, z));
  } else if (hazard.kind === "CONE") {
    const behind = Math.min(4.2, radius * 0.22);
    x -= Math.sin(heading) * behind;
    z -= Math.cos(heading) * behind;
    ({ x, z } = clampField(x, z));
  }

  return {
    kind: hazard.kind,
    source: "FIELD",
    label: `${CART_FORCED_DODGE_LABEL_PREFIX} · ${hazard.label}`,
    x,
    z,
    heading: hazard.kind === "LINE" || hazard.kind === "CROSS" || hazard.kind === "CONE" ? heading : hazard.heading,
    width,
    length,
    radius,
    innerRadius,
    outerRadius,
    coneAngle,
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

/**
 * During a forced FIELD lock, explicit player evasion gets a small arcade assist.
 * No input means no assist: passive straight driving is still punished. The
 * assist only amplifies a deliberate steer/brake decision so a readable raid
 * telegraph is mechanically escapable on a phone-sized control surface.
 */
function applyReactionAssist(session: CartArenaSession, input: RallyInputState, delta: number): void {
  const raid = getCartRaidHazardState(session);
  const forced = raid.hazards.find((hazard) =>
    hazard.source === "FIELD"
    && hazard.phase === "LOCKED"
    && hazard.secondsToFire > 0
    && hazard.label.startsWith(CART_FORCED_DODGE_LABEL_PREFIX),
  );
  if (!forced) return;

  const rawSteer = clamp(input.strafe ?? input.steer, -1, 1);
  const brake = clamp(input.brake, 0, 1);
  const steerMagnitude = Math.abs(rawSteer);
  if (steerMagnitude < CART_FORCED_DODGE_REACTION_STEER_THRESHOLD && brake < CART_FORCED_DODGE_REACTION_BRAKE_THRESHOLD) return;

  // Cart Rogue inverts the raw steering input before RallyCar consumes it.
  const effectiveSteer = -rawSteer;
  const urgency = clamp(1 - forced.secondsToFire / Math.max(0.001, forced.telegraphSeconds), 0, 1);
  const assistScale = 0.72 + urgency * 0.28;
  if (steerMagnitude >= CART_FORCED_DODGE_REACTION_STEER_THRESHOLD) {
    session.car.heading += effectiveSteer * CART_FORCED_DODGE_REACTION_YAW_RATE * assistScale * delta;
    session.car.lateralVelocity = clamp(
      session.car.lateralVelocity + effectiveSteer * CART_FORCED_DODGE_REACTION_LATERAL_ACCELERATION * assistScale * delta,
      -CART_FORCED_DODGE_REACTION_MAX_LATERAL_SPEED,
      CART_FORCED_DODGE_REACTION_MAX_LATERAL_SPEED,
    );
  }
  if (brake >= CART_FORCED_DODGE_REACTION_BRAKE_THRESHOLD && session.car.forwardVelocity > 0) {
    session.car.forwardVelocity = Math.max(
      0,
      session.car.forwardVelocity - CART_FORCED_DODGE_REACTION_EXTRA_BRAKE * brake * assistScale * delta,
    );
  }
}

export function installCartRoguePhase93ForcedDodgeTrajectory2(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase93Session;
  const previousStep = prototype.step;
  prototype.step = function phase93ForcedDodgeTrajectory2Step(
    this: Phase93Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const session = this as unknown as CartArenaSession;
    const delta = clamp(fixedDelta, 0, 0.05);
    if (isCartTurboHuntEnabled(session)) applyReactionAssist(session, input, delta);

    previousStep.call(this, input, fixedDelta);
    if (!isCartTurboHuntEnabled(session)) return;
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

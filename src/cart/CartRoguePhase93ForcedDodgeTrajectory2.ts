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
  reactionCommitted: boolean;
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
export const CART_FORCED_DODGE_FINAL_LOCK_SECONDS = 0.78;
export const CART_FORCED_DODGE_ACCELERATION = 8.5;
export const CART_FORCED_DODGE_FIELD_MARGIN = 7;
export const CART_FORCED_DODGE_PASSIVE_THROTTLE = 0.84;

// The reaction corridor is intentionally narrower than the passive pressure
// footprint. The instant the player commits to a dodge, the telegraph freezes
// and contracts to these dimensions.
export const CART_FORCED_DODGE_LINE_WIDTH = 8.8;
export const CART_FORCED_DODGE_LINE_LENGTH = 42;
export const CART_FORCED_DODGE_CROSS_WIDTH = 6.4;
export const CART_FORCED_DODGE_CIRCLE_RADIUS = 7.4;
export const CART_FORCED_DODGE_CONE_RADIUS = 19;
export const CART_FORCED_DODGE_CONE_ANGLE = Math.PI * 0.4;
export const CART_FORCED_DODGE_DONUT_OUTER_RADIUS = 13.2;

// Before the player reacts, the attack owns a visibly larger part of the
// predicted line so incidental enemy bumps cannot count as a free dodge.
export const CART_FORCED_DODGE_PASSIVE_LINE_WIDTH = 12.5;
export const CART_FORCED_DODGE_PASSIVE_CROSS_WIDTH = 9.5;
export const CART_FORCED_DODGE_PASSIVE_CIRCLE_RADIUS = 11;
export const CART_FORCED_DODGE_PASSIVE_CONE_RADIUS = 24;
export const CART_FORCED_DODGE_PASSIVE_CONE_ANGLE = Math.PI * 0.5;
export const CART_FORCED_DODGE_PASSIVE_DONUT_OUTER_RADIUS = 15.4;

export const CART_FORCED_DODGE_REACTION_STEER_THRESHOLD = 0.42;
export const CART_FORCED_DODGE_REACTION_BRAKE_THRESHOLD = 0.32;
export const CART_FORCED_DODGE_REACTION_YAW_RATE = 0.92;
export const CART_FORCED_DODGE_REACTION_LATERAL_ACCELERATION = 7.5;
export const CART_FORCED_DODGE_REACTION_EXTRA_BRAKE = 7.5;
export const CART_FORCED_DODGE_REACTION_MAX_LATERAL_SPEED = 13.5;
export const CART_FORCED_DODGE_REACTION_LATERAL_IMPULSE = 8.5;
export const CART_FORCED_DODGE_REACTION_YAW_KICK = 0.18;
export const CART_FORCED_DODGE_REACTION_FORWARD_DAMP = 0.82;
export const CART_FORCED_DODGE_LABEL_PREFIX = "LOCKED INTERCEPT";
// Phase96 followups are already authored around the player's chosen escape
// side. They deliberately skip Phase93's re-aim/reaction-assist path so the
// second and third decisions must be handled with ordinary vehicle control.
export const CART_FORCED_DODGE_CHAIN_LABEL_PREFIX = "CHAIN INTERCEPT";

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
    reactionCommitted: false,
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

/**
 * A forced raid intercept targets the trajectory the car would take if the
 * player made no NEW avoidance choice. A steer/brake input that arrives in the
 * same frame as the visible LOCK must therefore never move the target itself.
 */
function passivePredictionInput(input: RallyInputState): RallyInputState {
  return {
    ...input,
    throttle: Math.max(CART_FORCED_DODGE_PASSIVE_THROTTLE, input.throttle),
    brake: 0,
    steer: 0,
    strafe: 0,
  };
}

type HazardGeometry = Pick<CartRaidHazardPublicState, "width" | "length" | "radius" | "innerRadius" | "outerRadius" | "coneAngle">;

function reactionGeometry(hazard: CartRaidHazardPublicState): HazardGeometry {
  const width = hazard.kind === "LINE"
    ? CART_FORCED_DODGE_LINE_WIDTH
    : hazard.kind === "CROSS"
      ? CART_FORCED_DODGE_CROSS_WIDTH
      : hazard.width;
  const length = hazard.kind === "LINE" || hazard.kind === "CROSS"
    ? Math.max(hazard.length, CART_FORCED_DODGE_LINE_LENGTH)
    : hazard.length;
  const radius = hazard.kind === "CIRCLE"
    ? CART_FORCED_DODGE_CIRCLE_RADIUS
    : hazard.kind === "CONE"
      ? CART_FORCED_DODGE_CONE_RADIUS
      : hazard.radius;
  const outerRadius = hazard.kind === "DONUT" ? CART_FORCED_DODGE_DONUT_OUTER_RADIUS : hazard.outerRadius;
  const innerRadius = hazard.kind === "DONUT" ? outerRadius * 0.36 : hazard.innerRadius;
  const coneAngle = hazard.kind === "CONE" ? CART_FORCED_DODGE_CONE_ANGLE : hazard.coneAngle;
  return { width, length, radius, innerRadius, outerRadius, coneAngle };
}

function passiveGeometry(hazard: CartRaidHazardPublicState): HazardGeometry {
  const width = hazard.kind === "LINE"
    ? Math.max(hazard.width, CART_FORCED_DODGE_PASSIVE_LINE_WIDTH)
    : hazard.kind === "CROSS"
      ? Math.max(hazard.width, CART_FORCED_DODGE_PASSIVE_CROSS_WIDTH)
      : hazard.width;
  const length = hazard.kind === "LINE" || hazard.kind === "CROSS"
    ? Math.max(hazard.length, CART_FORCED_DODGE_LINE_LENGTH)
    : hazard.length;
  const radius = hazard.kind === "CIRCLE"
    ? Math.max(hazard.radius, CART_FORCED_DODGE_PASSIVE_CIRCLE_RADIUS)
    : hazard.kind === "CONE"
      ? Math.max(hazard.radius, CART_FORCED_DODGE_PASSIVE_CONE_RADIUS)
      : hazard.radius;
  const outerRadius = hazard.kind === "DONUT"
    ? Math.max(hazard.outerRadius, CART_FORCED_DODGE_PASSIVE_DONUT_OUTER_RADIUS)
    : hazard.outerRadius;
  const innerRadius = hazard.kind === "DONUT" ? outerRadius * 0.36 : hazard.innerRadius;
  const coneAngle = hazard.kind === "CONE" ? Math.max(hazard.coneAngle, CART_FORCED_DODGE_PASSIVE_CONE_ANGLE) : hazard.coneAngle;
  return { width, length, radius, innerRadius, outerRadius, coneAngle };
}

function predictedPlacement(
  session: CartArenaSession,
  hazard: CartRaidHazardPublicState,
  input: RallyInputState,
  seconds: number,
  geometry: HazardGeometry,
): { x: number; z: number; heading: number; predictedX: number; predictedZ: number } {
  const predicted = cartForcedDodgePredictedPoint(session, input, seconds);
  const heading = session.car.heading;
  let x = predicted.x;
  let z = predicted.z;
  if (hazard.kind === "DONUT") {
    const ringMid = (geometry.innerRadius + geometry.outerRadius) * 0.5;
    x -= Math.sin(heading) * ringMid;
    z -= Math.cos(heading) * ringMid;
    ({ x, z } = clampField(x, z));
  } else if (hazard.kind === "CONE") {
    const behind = Math.min(4.2, geometry.radius * 0.22);
    x -= Math.sin(heading) * behind;
    z -= Math.cos(heading) * behind;
    ({ x, z } = clampField(x, z));
  }
  return {
    x,
    z,
    heading: hazard.kind === "LINE" || hazard.kind === "CROSS" || hazard.kind === "CONE" ? heading : hazard.heading,
    predictedX: predicted.x,
    predictedZ: predicted.z,
  };
}

function correctedSpec(
  session: CartArenaSession,
  hazard: CartRaidHazardPublicState,
  input: RallyInputState,
): Parameters<typeof queueCartRaidHazard>[1] {
  const lockSeconds = clamp(hazard.secondsToFire, CART_FORCED_DODGE_LOCK_MIN_SECONDS, CART_FORCED_DODGE_LOCK_MAX_SECONDS);
  const geometry = passiveGeometry(hazard);
  const placement = predictedPlacement(session, hazard, input, lockSeconds, geometry);
  return {
    kind: hazard.kind,
    source: "FIELD",
    label: `${CART_FORCED_DODGE_LABEL_PREFIX} · ${hazard.label}`,
    x: placement.x,
    z: placement.z,
    heading: placement.heading,
    ...geometry,
    telegraphSeconds: lockSeconds,
  };
}

function applyForcedLock(
  session: CartArenaSession,
  input: RallyInputState,
  state: InternalState,
  hazard: CartRaidHazardPublicState,
): void {
  const passiveInput = passivePredictionInput(input);
  const spec = correctedSpec(session, hazard, passiveInput);
  const predicted = cartForcedDodgePredictedPoint(session, passiveInput, spec.telegraphSeconds ?? CART_FORCED_DODGE_LOCK_MIN_SECONDS);
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
  state.reactionCommitted = false;
  state.active = true;
}

function explicitEvasion(input: RallyInputState): boolean {
  const steerMagnitude = Math.abs(clamp(input.strafe ?? input.steer, -1, 1));
  const brake = clamp(input.brake, 0, 1);
  return steerMagnitude >= CART_FORCED_DODGE_REACTION_STEER_THRESHOLD
    || brake >= CART_FORCED_DODGE_REACTION_BRAKE_THRESHOLD;
}

/**
 * Before the player makes an explicit dodge choice, keep a forced hazard on
 * the latest no-new-evasion trajectory. Requeueing reuses the same fixed pool
 * and preserves the remaining countdown. The final window is always frozen.
 */
function softTrackPassiveLine(
  session: CartArenaSession,
  input: RallyInputState,
  state: InternalState,
  hazard: CartRaidHazardPublicState,
): void {
  if (state.reactionCommitted || hazard.secondsToFire <= CART_FORCED_DODGE_FINAL_LOCK_SECONDS) return;
  const remaining = hazard.secondsToFire;
  const geometry = passiveGeometry(hazard);
  const placement = predictedPlacement(session, hazard, passivePredictionInput(input), remaining, geometry);
  cancelCartRaidHazards(session, "FIELD");
  const id = queueCartRaidHazard(session, {
    kind: hazard.kind,
    source: "FIELD",
    label: hazard.label,
    x: placement.x,
    z: placement.z,
    heading: placement.heading,
    ...geometry,
    telegraphSeconds: remaining,
  });
  if (id === null) return;
  state.correctedIds.add(id);
  state.correctedHazardId = id;
  state.predictedX = placement.predictedX;
  state.predictedZ = placement.predictedZ;
}

/** Freeze the telegraph exactly where it is and open a readable dodge lane. */
function commitReactionWindow(
  session: CartArenaSession,
  state: InternalState,
  hazard: CartRaidHazardPublicState,
  input: RallyInputState,
): void {
  if (state.reactionCommitted) return;
  state.reactionCommitted = true;
  const geometry = reactionGeometry(hazard);
  const remaining = Math.max(CART_FORCED_DODGE_FINAL_LOCK_SECONDS, hazard.secondsToFire);
  cancelCartRaidHazards(session, "FIELD");
  const id = queueCartRaidHazard(session, {
    kind: hazard.kind,
    source: "FIELD",
    label: hazard.label,
    x: hazard.x,
    z: hazard.z,
    heading: hazard.heading,
    ...geometry,
    telegraphSeconds: remaining,
  });
  if (id === null) return;
  state.correctedIds.add(id);
  state.correctedHazardId = id;

  // One committed dodge gets a tactile arcade kick. This is velocity/heading
  // response, not a teleport, and only happens once when the player chooses to
  // evade. It is shared by keyboard and iPhone touch because both reach the
  // same RallyInputState path.
  const rawSteer = clamp(input.strafe ?? input.steer, -1, 1);
  const brake = clamp(input.brake, 0, 1);
  const effectiveSteer = -rawSteer;
  if (Math.abs(rawSteer) >= CART_FORCED_DODGE_REACTION_STEER_THRESHOLD) {
    session.car.heading += effectiveSteer * CART_FORCED_DODGE_REACTION_YAW_KICK;
    session.car.lateralVelocity = clamp(
      session.car.lateralVelocity + effectiveSteer * CART_FORCED_DODGE_REACTION_LATERAL_IMPULSE,
      -CART_FORCED_DODGE_REACTION_MAX_LATERAL_SPEED,
      CART_FORCED_DODGE_REACTION_MAX_LATERAL_SPEED,
    );
  }
  if (brake >= CART_FORCED_DODGE_REACTION_BRAKE_THRESHOLD && session.car.forwardVelocity > 0) {
    session.car.forwardVelocity *= CART_FORCED_DODGE_REACTION_FORWARD_DAMP;
  }
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
  if (!forced || !explicitEvasion(input)) return;

  const rawSteer = clamp(input.strafe ?? input.steer, -1, 1);
  const brake = clamp(input.brake, 0, 1);
  const steerMagnitude = Math.abs(rawSteer);
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
    const state = stateFor(this);

    if (isCartTurboHuntEnabled(session)) {
      const before = getCartRaidHazardState(session).hazards.find((hazard) =>
        hazard.source === "FIELD"
        && hazard.phase === "LOCKED"
        && hazard.secondsToFire > 0
        && hazard.label.startsWith(CART_FORCED_DODGE_LABEL_PREFIX),
      );
      if (before) {
        if (explicitEvasion(input)) {
          commitReactionWindow(session, state, before, input);
          applyReactionAssist(session, input, delta);
        } else {
          softTrackPassiveLine(session, input, state, before);
        }
      } else {
        state.reactionCommitted = false;
      }
    }

    previousStep.call(this, input, fixedDelta);
    if (!isCartTurboHuntEnabled(session)) return;
    const raid = getCartRaidHazardState(session);
    const fieldHazards = raid.hazards.filter((hazard) => hazard.source === "FIELD");
    state.active = fieldHazards.some((hazard) => hazard.label.startsWith(CART_FORCED_DODGE_LABEL_PREFIX));

    const candidate = fieldHazards.find((hazard) =>
      hazard.phase === "LOCKED"
      && hazard.secondsToFire > 0.35
      && !hazard.label.startsWith(CART_FORCED_DODGE_LABEL_PREFIX)
      && !hazard.label.startsWith(CART_FORCED_DODGE_CHAIN_LABEL_PREFIX)
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
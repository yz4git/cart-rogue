import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { getCartTitanBossState } from "./CartRoguePhase83Boss2";
import { getCartRaidHazardState, queueCartRaidHazard } from "./CartRoguePhase88RaidHazards";
import { CART_FORCED_DODGE_CHAIN_LABEL_PREFIX } from "./CartRoguePhase93ForcedDodgeTrajectory2";
import { getCartEscapeRhythmState } from "./CartRoguePhase94EscapeRhythmDirector2";
import {
  CART_RAID_PRESSURE_SWEEP_TELEGRAPH,
  getCartRaidPressureReaction,
  type CartRaidPressureReaction,
} from "./CartRoguePhase96RaidPressure3";
import { CART_TURBO_HUNT_FIELD } from "./CartTurboHuntTrack";

interface Phase97Session {
  car: CartArenaSession["car"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface CounterreadState {
  observedReactionSerial: number;
  pending: PendingCounterread | null;
  lastMode: CartRaidCounterreadMode | null;
  resolvedSerial: number;
}

interface PendingCounterread {
  reaction: CartRaidPressureReaction;
  ageSeconds: number;
  sampleWaitSeconds: number;
}

export type CartRaidCounterreadMode = "ESCAPE" | "CUTBACK" | "BRAKE" | "EDGE";

export interface CartRaidCounterreadSample {
  anchorX: number;
  anchorZ: number;
  anchorHeading: number;
  initialEscapeSide: -1 | 1;
  startForwardVelocity: number;
  x: number;
  z: number;
  heading: number;
  forwardVelocity: number;
  lateralVelocity: number;
  rawSteer: number;
  brake: number;
}

export interface CartRaidCounterreadPlacement {
  mode: CartRaidCounterreadMode;
  kind: "LINE" | "CIRCLE";
  x: number;
  z: number;
  heading: number;
  width: number;
  length: number;
  radius: number;
  observedSide: -1 | 1;
  rightDisplacement: number;
  edgeDistance: number;
}

export interface CartRaidCounterreadSnapshot {
  pending: boolean;
  pendingAgeSeconds: number;
  resolvedSerial: number;
  lastMode: CartRaidCounterreadMode | null;
}

const stateBySession = new WeakMap<object, CounterreadState>();

// Counterread is a deliberate second beat of the already-locked forced-dodge
// sequence. Keeping the established chain prefix is behaviorally important:
// Phase93 skips this prefix so the follow-up is not mistaken for a fresh
// ordinary FIELD attack and re-aimed again.
export const CART_RAID_COUNTERREAD_LABEL = `${CART_FORCED_DODGE_CHAIN_LABEL_PREFIX} · COUNTERREAD`;
export const CART_RAID_COUNTERREAD_SAMPLE_SECONDS = 0.38;
export const CART_RAID_COUNTERREAD_DELAY_SECONDS = 0.36;
export const CART_RAID_COUNTERREAD_TELEGRAPH_SECONDS = CART_RAID_PRESSURE_SWEEP_TELEGRAPH;
export const CART_RAID_COUNTERREAD_MAX_WAIT_SECONDS = 0.88;
export const CART_RAID_COUNTERREAD_EDGE_DISTANCE = 12.5;
export const CART_RAID_COUNTERREAD_BRAKE_THRESHOLD = 0.58;
export const CART_RAID_COUNTERREAD_SPEED_RATIO = 0.72;
export const CART_RAID_COUNTERREAD_STEER_THRESHOLD = 0.34;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function stateFor(session: Phase97Session): CounterreadState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: CounterreadState = {
    observedReactionSerial: 0,
    pending: null,
    lastMode: null,
    resolvedSerial: 0,
  };
  stateBySession.set(key, created);
  return created;
}

function fieldBounds(margin = 8): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return {
    minX: CART_TURBO_HUNT_FIELD.centerX - CART_TURBO_HUNT_FIELD.halfWidth + margin,
    maxX: CART_TURBO_HUNT_FIELD.centerX + CART_TURBO_HUNT_FIELD.halfWidth - margin,
    minZ: CART_TURBO_HUNT_FIELD.centerZ - CART_TURBO_HUNT_FIELD.halfDepth + margin,
    maxZ: CART_TURBO_HUNT_FIELD.centerZ + CART_TURBO_HUNT_FIELD.halfDepth - margin,
  };
}

function clampField(x: number, z: number, margin = 8): { x: number; z: number } {
  const bounds = fieldBounds(margin);
  return {
    x: clamp(x, bounds.minX, bounds.maxX),
    z: clamp(z, bounds.minZ, bounds.maxZ),
  };
}

function edgeDistanceAt(x: number, z: number): number {
  const bounds = fieldBounds(0);
  return Math.max(0, Math.min(x - bounds.minX, bounds.maxX - x, z - bounds.minZ, bounds.maxZ - z));
}

function sideFromSteer(rawSteer: number, fallback: -1 | 1): -1 | 1 {
  if (Math.abs(rawSteer) < CART_RAID_COUNTERREAD_STEER_THRESHOLD) return fallback;
  return (-Math.sign(rawSteer) || fallback) as -1 | 1;
}

/**
 * Samples the escape once, then commits. There is deliberately no fire-time
 * tracking: the enemy gets to read the player's first decision, while the
 * player still gets a full visible second decision after this function locks
 * the follow-up telegraph.
 */
export function cartRaidAdaptiveCounterread(sample: CartRaidCounterreadSample): CartRaidCounterreadPlacement {
  const arx = Math.cos(sample.anchorHeading);
  const arz = -Math.sin(sample.anchorHeading);
  const dx = sample.x - sample.anchorX;
  const dz = sample.z - sample.anchorZ;
  const rightDisplacement = dx * arx + dz * arz;

  let observedSide = sample.initialEscapeSide;
  if (Math.abs(rightDisplacement) >= 1.15) {
    observedSide = (Math.sign(rightDisplacement) || sample.initialEscapeSide) as -1 | 1;
  } else {
    observedSide = sideFromSteer(sample.rawSteer, sample.initialEscapeSide);
  }

  const strongReverseSteer = Math.abs(sample.rawSteer) >= CART_RAID_COUNTERREAD_STEER_THRESHOLD
    && sideFromSteer(sample.rawSteer, sample.initialEscapeSide) !== sample.initialEscapeSide;
  const displacedReverse = Math.abs(rightDisplacement) >= 1.15 && observedSide !== sample.initialEscapeSide;
  const reversed = strongReverseSteer || displacedReverse;

  const initialSpeed = Math.max(4, Math.abs(sample.startForwardVelocity));
  const currentSpeed = Math.abs(sample.forwardVelocity);
  const speedDropped = currentSpeed <= initialSpeed * CART_RAID_COUNTERREAD_SPEED_RATIO;
  const hardBrake = sample.brake >= CART_RAID_COUNTERREAD_BRAKE_THRESHOLD && speedDropped;
  const edgeDistance = edgeDistanceAt(sample.x, sample.z);

  let mode: CartRaidCounterreadMode;
  if (reversed) mode = "CUTBACK";
  else if (hardBrake) mode = "BRAKE";
  else if (edgeDistance <= CART_RAID_COUNTERREAD_EDGE_DISTANCE) mode = "EDGE";
  else mode = "ESCAPE";

  const heading = normalizeAngle(sample.heading);
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  const lead = clamp(currentSpeed * 0.58 + 4.4, 7.5, 15.5);
  const lateralLead = clamp(sample.lateralVelocity * 0.28, -4.2, 4.2);
  const projected = clampField(
    sample.x + fx * lead + rx * lateralLead,
    sample.z + fz * lead + rz * lateralLead,
  );

  if (mode === "BRAKE") {
    const brakeLead = clamp(currentSpeed * 0.34 + 3.5, 4.8, 8.2);
    const point = clampField(
      sample.x + fx * brakeLead + rx * observedSide * 1.8,
      sample.z + fz * brakeLead + rz * observedSide * 1.8,
    );
    return {
      mode,
      kind: "CIRCLE",
      x: point.x,
      z: point.z,
      heading,
      width: 0,
      length: 0,
      radius: 8.3,
      observedSide,
      rightDisplacement,
      edgeDistance,
    };
  }

  if (mode === "EDGE") {
    const towardCenterX = CART_TURBO_HUNT_FIELD.centerX - sample.x;
    const towardCenterZ = CART_TURBO_HUNT_FIELD.centerZ - sample.z;
    const centerLength = Math.max(0.001, Math.hypot(towardCenterX, towardCenterZ));
    const inwardX = towardCenterX / centerLength;
    const inwardZ = towardCenterZ / centerLength;
    // Put the danger on the player's current outward continuation, leaving the
    // visibly safer answer back toward the arena interior.
    const point = clampField(
      projected.x - inwardX * 2.6,
      projected.z - inwardZ * 2.6,
    );
    return {
      mode,
      kind: "CIRCLE",
      x: point.x,
      z: point.z,
      heading,
      width: 0,
      length: 0,
      radius: 8.6,
      observedSide,
      rightDisplacement,
      edgeDistance,
    };
  }

  const diagonal = mode === "CUTBACK" ? -observedSide * 0.66 : observedSide * 0.54;
  const lateralBias = mode === "CUTBACK" ? observedSide * 2.1 : observedSide * 2.8;
  const point = clampField(
    projected.x + rx * lateralBias,
    projected.z + rz * lateralBias,
  );
  return {
    mode,
    kind: "LINE",
    x: point.x,
    z: point.z,
    heading: normalizeAngle(heading + diagonal),
    width: mode === "CUTBACK" ? 7.0 : 7.2,
    length: mode === "CUTBACK" ? 31 : 33,
    radius: 0,
    observedSide,
    rightDisplacement,
    edgeDistance,
  };
}

function sampleFrom(session: CartArenaSession, input: RallyInputState, reaction: CartRaidPressureReaction): CartRaidCounterreadSample {
  return {
    anchorX: reaction.anchorX,
    anchorZ: reaction.anchorZ,
    anchorHeading: reaction.anchorHeading,
    initialEscapeSide: reaction.initialEscapeSide,
    startForwardVelocity: reaction.startForwardVelocity,
    x: session.car.position.x,
    z: session.car.position.z,
    heading: session.car.heading,
    forwardVelocity: session.car.forwardVelocity,
    lateralVelocity: session.car.lateralVelocity,
    rawSteer: clamp(input.strafe ?? input.steer, -1, 1),
    brake: clamp(input.brake, 0, 1),
  };
}

function queuePlacement(session: CartArenaSession, placement: CartRaidCounterreadPlacement): number | null {
  const label = `${CART_RAID_COUNTERREAD_LABEL} · ${placement.mode}`;
  if (placement.kind === "CIRCLE") {
    return queueCartRaidHazard(session, {
      kind: "CIRCLE",
      source: "FIELD",
      label,
      x: placement.x,
      z: placement.z,
      radius: placement.radius,
      telegraphSeconds: CART_RAID_COUNTERREAD_TELEGRAPH_SECONDS,
      delaySeconds: CART_RAID_COUNTERREAD_DELAY_SECONDS,
    });
  }
  return queueCartRaidHazard(session, {
    kind: "LINE",
    source: "FIELD",
    label,
    x: placement.x,
    z: placement.z,
    heading: placement.heading,
    width: placement.width,
    length: placement.length,
    telegraphSeconds: CART_RAID_COUNTERREAD_TELEGRAPH_SECONDS,
    delaySeconds: CART_RAID_COUNTERREAD_DELAY_SECONDS,
  });
}

function observeNewReaction(session: CartArenaSession, state: CounterreadState): boolean {
  const reaction = getCartRaidPressureReaction(session);
  if (!reaction || reaction.serial <= state.observedReactionSerial) return false;
  state.observedReactionSerial = reaction.serial;
  state.pending = {
    reaction,
    ageSeconds: 0,
    sampleWaitSeconds: 0,
  };
  return true;
}

function updateCounterread(
  session: CartArenaSession,
  input: RallyInputState,
  state: CounterreadState,
  delta: number,
): void {
  if (observeNewReaction(session, state)) return;
  const pending = state.pending;
  if (!pending) return;

  const titan = getCartTitanBossState(session);
  const escape = getCartEscapeRhythmState(session);
  if (titan.bossActive || escape.openingGraceSeconds > 0) {
    state.pending = null;
    return;
  }

  pending.ageSeconds += delta;
  if (pending.ageSeconds < CART_RAID_COUNTERREAD_SAMPLE_SECONDS) return;
  pending.sampleWaitSeconds += delta;

  const raid = getCartRaidHazardState(session);
  const cutbackStillLive = raid.hazards.some((hazard) => hazard.id === pending.reaction.cutbackHazardId);
  if (!cutbackStillLive && pending.sampleWaitSeconds > 0.18) {
    state.pending = null;
    return;
  }
  if (raid.activeCount >= 4) {
    if (pending.sampleWaitSeconds >= CART_RAID_COUNTERREAD_MAX_WAIT_SECONDS) state.pending = null;
    return;
  }

  const placement = cartRaidAdaptiveCounterread(sampleFrom(session, input, pending.reaction));
  if (queuePlacement(session, placement) === null) {
    if (pending.sampleWaitSeconds >= CART_RAID_COUNTERREAD_MAX_WAIT_SECONDS) state.pending = null;
    return;
  }
  state.lastMode = placement.mode;
  state.resolvedSerial += 1;
  state.pending = null;
}

export function getCartRaidCounterreadState(session: CartArenaSession): CartRaidCounterreadSnapshot {
  const state = stateFor(session as unknown as Phase97Session);
  return {
    pending: state.pending !== null,
    pendingAgeSeconds: state.pending?.ageSeconds ?? 0,
    resolvedSerial: state.resolvedSerial,
    lastMode: state.lastMode,
  };
}

export function installCartRoguePhase97AdaptiveCounterread(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase97Session;
  const previousStep = prototype.step;
  prototype.step = function phase97AdaptiveCounterreadStep(
    this: Phase97Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previousStep.call(this, input, fixedDelta);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return;
    updateCounterread(session, input, stateFor(this), clamp(fixedDelta, 0, 0.05));
  };
}

installCartRoguePhase97AdaptiveCounterread();

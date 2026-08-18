import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { cartRaidInterceptLead } from "./CartRaidHazardIntercept";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { getCartTitanBossState } from "./CartRoguePhase83Boss2";
import {
  getCartRaidHazardState,
  queueCartRaidHazard,
  type CartRaidHazardPublicState,
  type CartRaidHazardSpec,
} from "./CartRoguePhase88RaidHazards";
import {
  CART_FORCED_DODGE_CHAIN_LABEL_PREFIX,
  CART_FORCED_DODGE_LABEL_PREFIX,
  CART_FORCED_DODGE_REACTION_BRAKE_THRESHOLD,
  CART_FORCED_DODGE_REACTION_STEER_THRESHOLD,
} from "./CartRoguePhase93ForcedDodgeTrajectory2";
import { getCartEscapeRhythmState } from "./CartRoguePhase94EscapeRhythmDirector2";
import { CART_TURBO_HUNT_FIELD } from "./CartTurboHuntTrack";

interface Phase96Session {
  car: CartArenaSession["car"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface PressureState {
  chainSerial: number;
  chainedHazardIds: Set<number>;
  quietSeconds: number;
  reengageSerial: number;
  armed: boolean;
  latestReaction: CartRaidPressureReaction | null;
}

export interface CartRaidPressureChainPlacement {
  cutbackX: number;
  cutbackZ: number;
  sweepX: number;
  sweepZ: number;
  sweepHeading: number;
  escapeSide: -1 | 1;
}

export interface CartRaidPressureReaction {
  serial: number;
  forcedHazardId: number;
  cutbackHazardId: number;
  anchorX: number;
  anchorZ: number;
  anchorHeading: number;
  initialEscapeSide: -1 | 1;
  initialSteer: number;
  startForwardVelocity: number;
  startLateralVelocity: number;
}

const stateBySession = new WeakMap<object, PressureState>();

export const CART_RAID_PRESSURE_CHAIN_MAX = 2;
export const CART_RAID_PRESSURE_QUIET_LIMIT = 1.05;
export const CART_RAID_PRESSURE_CUTBACK_DELAY = 0.25;
export const CART_RAID_PRESSURE_CUTBACK_TELEGRAPH = 0.88;
export const CART_RAID_PRESSURE_SWEEP_DELAY = 0.76;
export const CART_RAID_PRESSURE_SWEEP_TELEGRAPH = 0.82;
export const CART_RAID_PRESSURE_CHAIN_LABEL = CART_FORCED_DODGE_CHAIN_LABEL_PREFIX;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stateFor(session: Phase96Session): PressureState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: PressureState = {
    chainSerial: 0,
    chainedHazardIds: new Set(),
    quietSeconds: 0,
    reengageSerial: 0,
    armed: false,
    latestReaction: null,
  };
  stateBySession.set(key, created);
  return created;
}

export function getCartRaidPressureReaction(session: CartArenaSession): CartRaidPressureReaction | null {
  const reaction = stateFor(session as unknown as Phase96Session).latestReaction;
  return reaction ? { ...reaction } : null;
}

function clampField(x: number, z: number, margin = 8): { x: number; z: number } {
  return {
    x: clamp(x, CART_TURBO_HUNT_FIELD.centerX - CART_TURBO_HUNT_FIELD.halfWidth + margin, CART_TURBO_HUNT_FIELD.centerX + CART_TURBO_HUNT_FIELD.halfWidth - margin),
    z: clamp(z, CART_TURBO_HUNT_FIELD.centerZ - CART_TURBO_HUNT_FIELD.halfDepth + margin, CART_TURBO_HUNT_FIELD.centerZ + CART_TURBO_HUNT_FIELD.halfDepth - margin),
  };
}

/**
 * Phase96 owns the first reaction beat only. The cutback is committed as soon
 * as the player deliberately evades. The historical sweep coordinates remain
 * available for deterministic regression comparisons, but the live runtime no
 * longer queues that sweep here; Phase97 re-reads the player's actual escape
 * before deciding the second beat.
 */
export function cartRaidPressureChainPlacement(
  x: number,
  z: number,
  heading: number,
  rawSteer: number,
  serial = 0,
): CartRaidPressureChainPlacement {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  const explicit = Math.abs(rawSteer) >= CART_FORCED_DODGE_REACTION_STEER_THRESHOLD;
  const escapeSide = (explicit ? -Math.sign(rawSteer) : serial % 2 === 0 ? 1 : -1) as -1 | 1;
  const cutback = clampField(
    x + fx * 12.5 + rx * escapeSide * 6.2,
    z + fz * 12.5 + rz * escapeSide * 6.2,
  );
  const sweep = clampField(
    x + fx * 19.5 - rx * escapeSide * 3.4,
    z + fz * 19.5 - rz * escapeSide * 3.4,
  );
  return {
    cutbackX: cutback.x,
    cutbackZ: cutback.z,
    sweepX: sweep.x,
    sweepZ: sweep.z,
    sweepHeading: heading + escapeSide * 0.58,
    escapeSide,
  };
}

function deliberateEvasion(input: RallyInputState): boolean {
  return Math.abs(clamp(input.strafe ?? input.steer, -1, 1)) >= CART_FORCED_DODGE_REACTION_STEER_THRESHOLD
    || clamp(input.brake, 0, 1) >= CART_FORCED_DODGE_REACTION_BRAKE_THRESHOLD;
}

function normalForcedHazard(hazards: readonly CartRaidHazardPublicState[]): CartRaidHazardPublicState | undefined {
  return hazards.find((hazard) =>
    hazard.source === "FIELD"
    && hazard.phase === "LOCKED"
    && hazard.secondsToFire > 0
    && hazard.label.startsWith(CART_FORCED_DODGE_LABEL_PREFIX),
  );
}

function queueReactionChain(session: CartArenaSession, input: RallyInputState, state: PressureState): boolean {
  const raid = getCartRaidHazardState(session);
  const forced = normalForcedHazard(raid.hazards);
  if (forced) state.armed = true;
  if (raid.activeCount > 2) return false;
  if (!forced || state.chainedHazardIds.has(forced.id) || !deliberateEvasion(input)) return false;

  const rawSteer = clamp(input.strafe ?? input.steer, -1, 1);
  const anchorX = session.car.position.x;
  const anchorZ = session.car.position.z;
  const anchorHeading = session.car.heading;
  const placement = cartRaidPressureChainPlacement(
    anchorX,
    anchorZ,
    anchorHeading,
    rawSteer,
    state.chainSerial,
  );
  const cutback = queueCartRaidHazard(session, {
    kind: "CIRCLE",
    source: "FIELD",
    label: `${CART_RAID_PRESSURE_CHAIN_LABEL} · CUTBACK`,
    x: placement.cutbackX,
    z: placement.cutbackZ,
    radius: 8.7,
    telegraphSeconds: CART_RAID_PRESSURE_CUTBACK_TELEGRAPH,
    delaySeconds: CART_RAID_PRESSURE_CUTBACK_DELAY,
  });
  if (cutback === null) return false;

  state.chainedHazardIds.add(forced.id);
  state.chainSerial += 1;
  state.latestReaction = {
    serial: state.chainSerial,
    forcedHazardId: forced.id,
    cutbackHazardId: cutback,
    anchorX,
    anchorZ,
    anchorHeading,
    initialEscapeSide: placement.escapeSide,
    initialSteer: rawSteer,
    startForwardVelocity: session.car.forwardVelocity,
    startLateralVelocity: session.car.lateralVelocity,
  };
  state.quietSeconds = 0;
  return true;
}

function reengageSpec(session: CartArenaSession, state: PressureState): CartRaidHazardSpec {
  const kind = state.reengageSerial % 2 === 0 ? "LINE" : "CROSS";
  const telegraphSeconds = kind === "LINE" ? 1.05 : 1.08;
  const followCarSeconds = 0.36;
  return {
    kind,
    source: "FIELD",
    label: kind === "LINE" ? "PRESSURE LINE" : "PRESSURE CROSS",
    width: kind === "LINE" ? 8.4 : 6.8,
    length: kind === "LINE" ? 34 : 36,
    telegraphSeconds,
    followCarSeconds,
    followForward: cartRaidInterceptLead(session.car, telegraphSeconds, followCarSeconds, 4.8),
    followHeading: true,
    headingOffset: kind === "CROSS" ? Math.PI * 0.25 : 0,
  };
}

function updateQuietPressure(session: CartArenaSession, state: PressureState, delta: number): void {
  const titan = getCartTitanBossState(session);
  const escape = getCartEscapeRhythmState(session);
  const raid = getCartRaidHazardState(session);
  // Phase89 owns the opening attack. Phase96 only compresses dead air after the
  // ordinary director has produced a real forced intercept at least once.
  if (!state.armed || titan.bossActive || escape.openingGraceSeconds > 0) {
    state.quietSeconds = 0;
    return;
  }
  if (raid.activeCount > 0) {
    state.quietSeconds = 0;
    return;
  }
  state.quietSeconds += delta;
  if (state.quietSeconds < CART_RAID_PRESSURE_QUIET_LIMIT) return;
  if (queueCartRaidHazard(session, reengageSpec(session, state)) !== null) {
    state.reengageSerial += 1;
    state.quietSeconds = 0;
  }
}

export function installCartRoguePhase96RaidPressure3(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase96Session;
  const previousStep = prototype.step;
  prototype.step = function phase96RaidPressure3Step(
    this: Phase96Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previousStep.call(this, input, fixedDelta);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return;
    const delta = clamp(fixedDelta, 0, 0.05);
    const state = stateFor(this);
    const escape = getCartEscapeRhythmState(session);
    const titan = getCartTitanBossState(session);

    const raid = getCartRaidHazardState(session);
    if (normalForcedHazard(raid.hazards)) state.armed = true;
    if (!titan.bossActive && escape.openingGraceSeconds <= 0) {
      queueReactionChain(session, input, state);
    }
    updateQuietPressure(session, state, delta);

    const liveIds = new Set(getCartRaidHazardState(session).hazards.map((hazard) => hazard.id));
    for (const id of state.chainedHazardIds) {
      if (!liveIds.has(id) && state.chainedHazardIds.size > 12) state.chainedHazardIds.delete(id);
    }
  };
}

installCartRoguePhase96RaidPressure3();

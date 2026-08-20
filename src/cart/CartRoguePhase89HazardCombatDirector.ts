import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { cartEncounterAllowsFieldRaid } from "./CartEncounterDirectorGate";
import { cartRaidDonutInterceptLead, cartRaidInterceptLead } from "./CartRaidHazardIntercept";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { getCartTitanBossState } from "./CartRoguePhase83Boss2";
import { getCartThreatPressureState } from "./CartRoguePhase87ThreatPressure2";
import {
  cancelCartRaidHazards,
  getCartRaidHazardState,
  queueCartRaidHazard,
  type CartRaidHazardKind,
} from "./CartRoguePhase88RaidHazards";

export interface CartHazardCombatDirectorSnapshot {
  active: boolean;
  serial: number;
  patternKind: CartRaidHazardKind;
  patternLabel: string;
  cooldownSeconds: number;
  fieldHazards: number;
}

interface InternalDirectorState extends CartHazardCombatDirectorSnapshot {
  broadcastClock: number;
}

interface Phase89Session {
  step(input: RallyInputState, fixedDelta?: number): void;
}

const stateBySession = new WeakMap<object, InternalDirectorState>();
let latestSnapshot: CartHazardCombatDirectorSnapshot | null = null;

export const CART_HAZARD_COMBAT_DIRECTOR_SNAPSHOT_EVENT = "cart-hazard-combat-director-snapshot";
export const CART_HAZARD_DIRECTOR_INITIAL_DELAY = 1.35;
export const CART_HAZARD_DIRECTOR_INTERVAL = 4.6;
export const CART_HAZARD_DIRECTOR_PRESSURE_INTERVAL = 3.75;

const PATTERN_ROTATION: readonly CartRaidHazardKind[] = ["LINE", "CIRCLE", "CROSS", "CONE", "DONUT"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function cartHazardDirectorKindForSerial(serial: number): CartRaidHazardKind {
  return PATTERN_ROTATION[Math.abs(Math.floor(serial)) % PATTERN_ROTATION.length];
}

function labelFor(kind: CartRaidHazardKind): string {
  if (kind === "LINE") return "LINE STRIKE";
  if (kind === "CIRCLE") return "BLAST CIRCLE";
  if (kind === "CROSS") return "CROSS BREAK";
  if (kind === "CONE") return "SWEEP CONE";
  return "DONUT CRUSH";
}

function stateFor(session: CartArenaSession | Phase89Session): InternalDirectorState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalDirectorState = {
    active: false,
    serial: 0,
    patternKind: "LINE",
    patternLabel: labelFor("LINE"),
    cooldownSeconds: CART_HAZARD_DIRECTOR_INITIAL_DELAY,
    fieldHazards: 0,
    broadcastClock: 0,
  };
  stateBySession.set(key, created);
  return created;
}

function snapshotOf(state: InternalDirectorState): CartHazardCombatDirectorSnapshot {
  return {
    active: state.active,
    serial: state.serial,
    patternKind: state.patternKind,
    patternLabel: state.patternLabel,
    cooldownSeconds: state.cooldownSeconds,
    fieldHazards: state.fieldHazards,
  };
}

export function getCartHazardCombatDirectorState(session: CartArenaSession): CartHazardCombatDirectorSnapshot {
  return snapshotOf(stateFor(session));
}

export function getLatestCartHazardCombatDirectorState(): CartHazardCombatDirectorSnapshot | null {
  return latestSnapshot ? { ...latestSnapshot } : null;
}

function broadcast(state: InternalDirectorState): void {
  const snapshot = snapshotOf(state);
  latestSnapshot = snapshot;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CartHazardCombatDirectorSnapshot>(CART_HAZARD_COMBAT_DIRECTOR_SNAPSHOT_EVENT, { detail: snapshot }));
  }
}

/**
 * Field patterns now target the predicted forward intercept point rather than
 * the car's current position. Continuing straight therefore drives into the
 * locked danger zone; the player has to steer, brake or change line.
 */
function queueFieldPattern(session: CartArenaSession, kind: CartRaidHazardKind): boolean {
  if (kind === "LINE") {
    const telegraphSeconds = 1.32;
    const followCarSeconds = 0.45;
    return queueCartRaidHazard(session, {
      kind,
      source: "FIELD",
      label: "LINE STRIKE",
      width: 8.6,
      length: 32,
      telegraphSeconds,
      followCarSeconds,
      followForward: cartRaidInterceptLead(session.car, telegraphSeconds, followCarSeconds, 4.5),
      followHeading: true,
    }) !== null;
  }
  if (kind === "CIRCLE") {
    const telegraphSeconds = 1.5;
    const followCarSeconds = 0.58;
    return queueCartRaidHazard(session, {
      kind,
      source: "FIELD",
      label: "BLAST CIRCLE",
      radius: 11.4,
      telegraphSeconds,
      followCarSeconds,
      followForward: cartRaidInterceptLead(session.car, telegraphSeconds, followCarSeconds, 4.4),
    }) !== null;
  }
  if (kind === "CROSS") {
    const telegraphSeconds = 1.56;
    const followCarSeconds = 0.55;
    return queueCartRaidHazard(session, {
      kind,
      source: "FIELD",
      label: "CROSS BREAK",
      width: 6.8,
      length: 36,
      telegraphSeconds,
      followCarSeconds,
      followForward: cartRaidInterceptLead(session.car, telegraphSeconds, followCarSeconds, 4.4),
      followHeading: true,
      headingOffset: Math.PI * 0.25,
    }) !== null;
  }
  if (kind === "CONE") {
    const telegraphSeconds = 1.46;
    const followCarSeconds = 0.5;
    const intercept = cartRaidInterceptLead(session.car, telegraphSeconds, followCarSeconds, 3.4);
    return queueCartRaidHazard(session, {
      kind,
      source: "FIELD",
      label: "SWEEP CONE",
      radius: 25,
      coneAngle: Math.PI * 0.5,
      telegraphSeconds,
      followCarSeconds,
      followForward: Math.max(2.5, intercept * 0.22),
      followHeading: true,
    }) !== null;
  }
  const telegraphSeconds = 1.62;
  const followCarSeconds = 0.58;
  return queueCartRaidHazard(session, {
    kind,
    source: "FIELD",
    label: "DONUT CRUSH",
    innerRadius: 5.5,
    outerRadius: 15.4,
    telegraphSeconds,
    followCarSeconds,
    followForward: cartRaidDonutInterceptLead(session.car, telegraphSeconds, followCarSeconds),
  }) !== null;
}

function scheduleNext(session: CartArenaSession, state: InternalDirectorState): void {
  const kind = cartHazardDirectorKindForSerial(state.serial);
  if (!queueFieldPattern(session, kind)) {
    state.cooldownSeconds = 0.55;
    return;
  }
  state.serial += 1;
  state.patternKind = kind;
  state.patternLabel = labelFor(kind);
  const pressure = getCartThreatPressureState(session);
  state.cooldownSeconds = pressure.active ? CART_HAZARD_DIRECTOR_PRESSURE_INTERVAL : CART_HAZARD_DIRECTOR_INTERVAL;
}

export function installCartRoguePhase89HazardCombatDirector(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase89Session;
  const previousStep = sessionPrototype.step;
  sessionPrototype.step = function phase89HazardCombatDirectorStep(
    this: Phase89Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previousStep.call(this, input, fixedDelta);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return;
    const delta = clamp(fixedDelta, 0, 0.05);
    const state = stateFor(this);
    const titan = getCartTitanBossState(session);
    const hazards = getCartRaidHazardState(session);
    state.fieldHazards = hazards.hazards.filter((hazard) => hazard.source === "FIELD").length;
    state.active = state.fieldHazards > 0;

    if (titan.bossActive) {
      if (state.fieldHazards > 0) cancelCartRaidHazards(session, "FIELD");
      state.fieldHazards = 0;
      state.active = false;
      state.cooldownSeconds = Math.min(Math.max(state.cooldownSeconds, 0), 1.2);
    } else {
      state.cooldownSeconds = Math.max(0, state.cooldownSeconds - delta);
      if (
        state.fieldHazards === 0
        && state.cooldownSeconds <= 0
        && cartEncounterAllowsFieldRaid(session)
      ) scheduleNext(session, state);
    }

    state.broadcastClock += delta;
    if (state.broadcastClock >= 0.1) {
      state.broadcastClock %= 0.1;
      broadcast(state);
    }
  };
}

installCartRoguePhase89HazardCombatDirector();

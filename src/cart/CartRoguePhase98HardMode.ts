import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import {
  CART_HARD_MODE_SNAPSHOT_EVENT,
  getCartRunDifficulty,
  type CartHardGameOverReason,
  type CartHardModeSnapshot,
  type CartRunDifficulty,
} from "./CartRunDifficulty";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import {
  getCartRaidHazardState,
  queueCartRaidHazard,
  type CartRaidHazardKind,
  type CartRaidHazardSpec,
} from "./CartRoguePhase88RaidHazards";

interface Phase98Session {
  car: CartArenaSession["car"];
  step(input: RallyInputState, fixedDelta?: number): void;
  snapshot(): ReturnType<CartArenaSession["snapshot"]>;
}

interface InternalHardState {
  difficulty: CartRunDifficulty;
  integrity: number;
  maxIntegrity: number;
  gameOver: boolean;
  gameOverReason: CartHardGameOverReason;
  seenHitSerial: number;
  seenPerfectSerial: number;
  raidHits: number;
  perfectDodges: number;
  pressureTimer: number;
  pressureSerial: number;
  broadcastClock: number;
}

export interface CartHardPressurePattern {
  kind: CartRaidHazardKind;
  label: string;
  telegraphSeconds: number;
  followCarSeconds: number;
  followForward: number;
  width?: number;
  length?: number;
  radius?: number;
  outerRadius?: number;
}

const stateBySession = new WeakMap<object, InternalHardState>();
let latestSnapshot: CartHardModeSnapshot | null = null;

export const CART_HARD_MAX_INTEGRITY = 3;
export const CART_HARD_OPENING_GRACE_SECONDS = 2.4;
export const CART_HARD_PRESSURE_INTERVAL_SECONDS = 2.65;
export const CART_HARD_PRESSURE_TELEGRAPH_SECONDS = 0.95;
export const CART_HARD_PRESSURE_FOLLOW_SECONDS = 0.28;
export const CART_HARD_PRESSURE_MAX_EXISTING = 2;
export const CART_HARD_PRESSURE_LABEL = "HARD RAID";

const MENU_PAUSE_EVENT = "cart-rogue-menu-pause";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function cartHardIntegrityAfterHits(currentIntegrity: number, newHits: number): number {
  return Math.max(0, Math.min(CART_HARD_MAX_INTEGRITY, currentIntegrity) - Math.max(0, Math.floor(newHits)));
}

export function cartHardPressurePattern(serial: number): CartHardPressurePattern {
  const index = Math.abs(Math.floor(serial)) % 4;
  if (index === 0) {
    return {
      kind: "LINE",
      label: `${CART_HARD_PRESSURE_LABEL} · SPEAR`,
      telegraphSeconds: CART_HARD_PRESSURE_TELEGRAPH_SECONDS,
      followCarSeconds: CART_HARD_PRESSURE_FOLLOW_SECONDS,
      followForward: 16,
      width: 7.2,
      length: 35,
    };
  }
  if (index === 1) {
    return {
      kind: "CIRCLE",
      label: `${CART_HARD_PRESSURE_LABEL} · CRUSH`,
      telegraphSeconds: CART_HARD_PRESSURE_TELEGRAPH_SECONDS,
      followCarSeconds: CART_HARD_PRESSURE_FOLLOW_SECONDS,
      followForward: 13,
      radius: 9.5,
    };
  }
  if (index === 2) {
    return {
      kind: "CROSS",
      label: `${CART_HARD_PRESSURE_LABEL} · CROSSCUT`,
      telegraphSeconds: CART_HARD_PRESSURE_TELEGRAPH_SECONDS,
      followCarSeconds: CART_HARD_PRESSURE_FOLLOW_SECONDS,
      followForward: 15,
      width: 5.8,
      length: 30,
    };
  }
  return {
    kind: "DONUT",
    label: `${CART_HARD_PRESSURE_LABEL} · RINGBREAK`,
    telegraphSeconds: CART_HARD_PRESSURE_TELEGRAPH_SECONDS,
    followCarSeconds: CART_HARD_PRESSURE_FOLLOW_SECONDS,
    followForward: 11,
    outerRadius: 14,
  };
}

function stateFor(session: CartArenaSession | Phase98Session): InternalHardState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const difficulty = getCartRunDifficulty();
  const raid = getCartRaidHazardState(session as CartArenaSession);
  const created: InternalHardState = {
    difficulty,
    integrity: CART_HARD_MAX_INTEGRITY,
    maxIntegrity: CART_HARD_MAX_INTEGRITY,
    gameOver: false,
    gameOverReason: null,
    seenHitSerial: raid.hitSerial,
    seenPerfectSerial: raid.perfectDodgeSerial,
    raidHits: 0,
    perfectDodges: 0,
    pressureTimer: CART_HARD_OPENING_GRACE_SECONDS,
    pressureSerial: 0,
    broadcastClock: 0,
  };
  stateBySession.set(key, created);
  return created;
}

function snapshotOf(state: InternalHardState): CartHardModeSnapshot {
  return {
    difficulty: state.difficulty,
    hardMode: state.difficulty === "hard",
    integrity: state.integrity,
    maxIntegrity: state.maxIntegrity,
    gameOver: state.gameOver,
    gameOverReason: state.gameOverReason,
    raidHits: state.raidHits,
    perfectDodges: state.perfectDodges,
    pressureSerial: state.pressureSerial,
  };
}

function broadcast(state: InternalHardState): void {
  const snapshot = snapshotOf(state);
  latestSnapshot = snapshot;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CartHardModeSnapshot>(CART_HARD_MODE_SNAPSHOT_EVENT, { detail: snapshot }));
  }
}

export function getCartHardModeState(session: CartArenaSession): CartHardModeSnapshot {
  return snapshotOf(stateFor(session));
}

export function getLatestCartHardModeState(): CartHardModeSnapshot | null {
  return latestSnapshot ? { ...latestSnapshot } : null;
}

function triggerGameOver(state: InternalHardState, reason: Exclude<CartHardGameOverReason, null>): void {
  if (state.gameOver) return;
  state.gameOver = true;
  state.gameOverReason = reason;
  broadcast(state);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MENU_PAUSE_EVENT));
}

function queueHardPressure(session: CartArenaSession, state: InternalHardState): void {
  const raid = getCartRaidHazardState(session);
  if (raid.activeCount > CART_HARD_PRESSURE_MAX_EXISTING) return;
  const pattern = cartHardPressurePattern(state.pressureSerial);
  const spec: CartRaidHazardSpec = {
    kind: pattern.kind,
    source: "FIELD",
    label: pattern.label,
    telegraphSeconds: pattern.telegraphSeconds,
    followCarSeconds: pattern.followCarSeconds,
    followForward: pattern.followForward,
    followHeading: pattern.kind === "LINE" || pattern.kind === "CROSS",
    width: pattern.width,
    length: pattern.length,
    radius: pattern.radius,
    outerRadius: pattern.outerRadius,
  };
  const id = queueCartRaidHazard(session, spec);
  if (id !== null) state.pressureSerial += 1;
}

function installHardMode(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase98Session;
  const previousStep = prototype.step;
  prototype.step = function phase98HardModeStep(
    this: Phase98Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const state = stateFor(this);
    if (state.gameOver) return;

    previousStep.call(this, input, fixedDelta);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return;

    const delta = clamp(fixedDelta, 0, 0.05);
    const raid = getCartRaidHazardState(session);
    const run = this.snapshot();

    if (raid.hitSerial > state.seenHitSerial) {
      const newHits = raid.hitSerial - state.seenHitSerial;
      state.seenHitSerial = raid.hitSerial;
      state.raidHits += newHits;
      if (state.difficulty === "hard") {
        state.integrity = cartHardIntegrityAfterHits(state.integrity, newHits);
      }
    }
    if (raid.perfectDodgeSerial > state.seenPerfectSerial) {
      const newPerfects = raid.perfectDodgeSerial - state.seenPerfectSerial;
      state.seenPerfectSerial = raid.perfectDodgeSerial;
      state.perfectDodges += newPerfects;
    }

    if (state.difficulty === "hard" && !run.runComplete) {
      if (state.integrity <= 0) {
        triggerGameOver(state, "HULL");
        return;
      }
      if (run.gas <= 0.0001) {
        triggerGameOver(state, "GAS");
        return;
      }

      state.pressureTimer -= delta;
      if (state.pressureTimer <= 0) {
        queueHardPressure(session, state);
        state.pressureTimer += CART_HARD_PRESSURE_INTERVAL_SECONDS;
      }
    }

    state.broadcastClock += delta;
    if (state.broadcastClock >= 0.1) {
      state.broadcastClock %= 0.1;
      broadcast(state);
    }
  };
}

export function installCartRoguePhase98HardMode(): void {
  installHardMode();
}

installCartRoguePhase98HardMode();

import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import type { CartEnemyState } from "./CartCombat";
import { setCartEncounterDirectorGatePolicy } from "./CartEncounterDirectorGate";
import { getCartRunDifficulty, type CartRunDifficulty } from "./CartRunDifficulty";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { getCartTurboHuntEventState } from "./CartRoguePhase81EventDirector2";
import { getCartTitanBossState } from "./CartRoguePhase83Boss2";
import { getCartPursuitEventState } from "./CartRoguePhase85PursuitEvents";
import { getCartThreatPressureState } from "./CartRoguePhase87ThreatPressure2";
import {
  cancelCartRaidHazards,
  getCartRaidHazardState,
} from "./CartRoguePhase88RaidHazards";
import { getCartEscapeRhythmState } from "./CartRoguePhase94EscapeRhythmDirector2";

export type CartEncounterBeat =
  | "OPENING"
  | "PRESSURE"
  | "DODGE"
  | "COUNTER"
  | "CHASE"
  | "RECOVERY"
  | "BOSS";

export interface CartEncounterBeatPolicy {
  intensity: number;
  commitCap: number;
  allowFieldHazards: boolean;
  attackCooldownFloor: number;
}

export interface CartEncounterDirectorSnapshot {
  beat: CartEncounterBeat;
  beatSerial: number;
  secondsRemaining: number;
  intensity: number;
  commitCap: number;
  fieldHazardsAllowed: boolean;
  reason: string;
  raidActiveCount: number;
  gasLifePercent: number;
  transitionCount: number;
}

interface Phase106Session {
  enemies: CartEnemyState[];
  gas: number;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface EncounterDirectorState extends CartEncounterDirectorSnapshot {
  broadcastClock: number;
  lowGasMercyLockout: number;
  lastRaidHitSerial: number;
  lastPerfectDodgeSerial: number;
  lastPursuitSuccessSerial: number;
  lastPursuitFailureSerial: number;
  lastEventRewardSerial: number;
}

const PATCHED_KEY = "__cartRoguePhase106EncounterDirector2Patched__";
const stateBySession = new WeakMap<object, EncounterDirectorState>();
let latestSnapshot: CartEncounterDirectorSnapshot | null = null;

export const CART_ENCOUNTER_DIRECTOR_SNAPSHOT_EVENT = "cart-encounter-director2-snapshot";
export const CART_ENCOUNTER_OPENING_SECONDS = 3.0;
export const CART_ENCOUNTER_LOW_GAS_THRESHOLD = 0.24;
export const CART_ENCOUNTER_LOW_GAS_MERCY_LOCKOUT_SECONDS = 8.0;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function cartEncounterBeatDuration(beat: CartEncounterBeat, difficulty: CartRunDifficulty): number {
  if (beat === "OPENING") return CART_ENCOUNTER_OPENING_SECONDS;
  if (beat === "PRESSURE") return difficulty === "hard" ? 4.15 : 4.6;
  if (beat === "DODGE") return difficulty === "hard" ? 4.2 : 3.8;
  if (beat === "COUNTER") return difficulty === "hard" ? 1.65 : 2.15;
  if (beat === "CHASE") return difficulty === "hard" ? 5.2 : 4.8;
  if (beat === "RECOVERY") return difficulty === "hard" ? 1.85 : 2.45;
  return 0;
}

export function cartEncounterBeatPolicy(
  beat: CartEncounterBeat,
  difficulty: CartRunDifficulty,
): CartEncounterBeatPolicy {
  if (beat === "OPENING") {
    return { intensity: 0.32, commitCap: 1, allowFieldHazards: false, attackCooldownFloor: 0.62 };
  }
  if (beat === "PRESSURE") {
    return { intensity: difficulty === "hard" ? 0.82 : 0.72, commitCap: difficulty === "hard" ? 3 : 2, allowFieldHazards: false, attackCooldownFloor: 0 };
  }
  if (beat === "DODGE") {
    return { intensity: difficulty === "hard" ? 0.92 : 0.84, commitCap: difficulty === "hard" ? 2 : 1, allowFieldHazards: true, attackCooldownFloor: 0 };
  }
  if (beat === "COUNTER") {
    return { intensity: 0.28, commitCap: 1, allowFieldHazards: false, attackCooldownFloor: difficulty === "hard" ? 0.62 : 0.78 };
  }
  if (beat === "CHASE") {
    return { intensity: difficulty === "hard" ? 0.86 : 0.76, commitCap: difficulty === "hard" ? 3 : 2, allowFieldHazards: false, attackCooldownFloor: 0 };
  }
  if (beat === "RECOVERY") {
    return { intensity: 0.18, commitCap: 1, allowFieldHazards: false, attackCooldownFloor: difficulty === "hard" ? 0.82 : 1.05 };
  }
  return { intensity: 0.94, commitCap: 3, allowFieldHazards: false, attackCooldownFloor: 0 };
}

export function cartEncounterTimedNextBeat(beat: CartEncounterBeat): CartEncounterBeat {
  if (beat === "OPENING") return "PRESSURE";
  if (beat === "PRESSURE") return "DODGE";
  if (beat === "DODGE") return "COUNTER";
  if (beat === "COUNTER") return "PRESSURE";
  if (beat === "CHASE") return "COUNTER";
  if (beat === "RECOVERY") return "PRESSURE";
  return "BOSS";
}

export function cartEncounterProtectsActiveDodge(
  beat: CartEncounterBeat,
  raidActiveCount: number,
  hitNow = false,
  perfectNow = false,
): boolean {
  return beat === "DODGE" && raidActiveCount > 0 && !hitNow && !perfectNow;
}

function snapshotOf(state: EncounterDirectorState): CartEncounterDirectorSnapshot {
  return {
    beat: state.beat,
    beatSerial: state.beatSerial,
    secondsRemaining: state.secondsRemaining,
    intensity: state.intensity,
    commitCap: state.commitCap,
    fieldHazardsAllowed: state.fieldHazardsAllowed,
    reason: state.reason,
    raidActiveCount: state.raidActiveCount,
    gasLifePercent: state.gasLifePercent,
    transitionCount: state.transitionCount,
  };
}

function stateFor(session: CartArenaSession | Phase106Session): EncounterDirectorState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const typed = session as unknown as CartArenaSession;
  const difficulty = getCartRunDifficulty();
  const raid = getCartRaidHazardState(typed);
  const pursuit = getCartPursuitEventState(typed);
  const event = getCartTurboHuntEventState(typed);
  const policy = cartEncounterBeatPolicy("OPENING", difficulty);
  const created: EncounterDirectorState = {
    beat: "OPENING",
    beatSerial: 1,
    secondsRemaining: cartEncounterBeatDuration("OPENING", difficulty),
    intensity: policy.intensity,
    commitCap: policy.commitCap,
    fieldHazardsAllowed: policy.allowFieldHazards,
    reason: "RUN OPENING",
    raidActiveCount: raid.activeCount,
    gasLifePercent: Math.round(clamp((session as Phase106Session).gas, 0, 1) * 100),
    transitionCount: 0,
    broadcastClock: 0,
    lowGasMercyLockout: 0,
    lastRaidHitSerial: raid.hitSerial,
    lastPerfectDodgeSerial: raid.perfectDodgeSerial,
    lastPursuitSuccessSerial: pursuit.successSerial,
    lastPursuitFailureSerial: pursuit.failureSerial,
    lastEventRewardSerial: event.rewardSerial,
  };
  stateBySession.set(key, created);
  return created;
}

function beginBeat(
  state: EncounterDirectorState,
  beat: CartEncounterBeat,
  difficulty: CartRunDifficulty,
  reason: string,
): void {
  const duration = cartEncounterBeatDuration(beat, difficulty);
  const policy = cartEncounterBeatPolicy(beat, difficulty);
  if (state.beat === beat) {
    state.secondsRemaining = Math.max(state.secondsRemaining, duration * 0.55);
    state.reason = reason;
  } else {
    state.beat = beat;
    state.beatSerial += 1;
    state.transitionCount += 1;
    state.secondsRemaining = duration;
    state.reason = reason;
  }
  state.intensity = policy.intensity;
  state.commitCap = policy.commitCap;
  state.fieldHazardsAllowed = policy.allowFieldHazards;
}

function applySchedulingGate(session: Phase106Session, state: EncounterDirectorState): void {
  setCartEncounterDirectorGatePolicy(session as unknown as CartArenaSession, {
    allowThreatPressure: state.beat === "PRESSURE",
    allowFieldRaid: state.beat === "DODGE",
    commitCap: state.commitCap,
  });
}

function enforceSafeWindow(
  session: Phase106Session,
  state: EncounterDirectorState,
  difficulty: CartRunDifficulty,
): void {
  const policy = cartEncounterBeatPolicy(state.beat, difficulty);
  if (!policy.allowFieldHazards) {
    cancelCartRaidHazards(session as unknown as CartArenaSession, "FIELD");
  }
  if (policy.attackCooldownFloor <= 0) return;
  for (const enemy of session.enemies) {
    if (!enemy.alive || enemy.kind === "boss") continue;
    enemy.chargeTime = 0;
    enemy.chargeCooldown = Math.max(enemy.chargeCooldown ?? 0, policy.attackCooldownFloor);
  }
}

function updateEncounter(
  session: Phase106Session,
  state: EncounterDirectorState,
  difficulty: CartRunDifficulty,
  delta: number,
): void {
  const typed = session as unknown as CartArenaSession;
  const boss = getCartTitanBossState(typed);
  const raid = getCartRaidHazardState(typed);
  const pursuit = getCartPursuitEventState(typed);
  const escape = getCartEscapeRhythmState(typed);
  const pressure = getCartThreatPressureState(typed);
  const event = getCartTurboHuntEventState(typed);

  state.raidActiveCount = raid.activeCount;
  state.gasLifePercent = Math.round(clamp(session.gas, 0, 1) * 100);
  state.lowGasMercyLockout = Math.max(0, state.lowGasMercyLockout - delta);
  if (state.beat !== "BOSS") state.secondsRemaining = Math.max(0, state.secondsRemaining - delta);

  const hitNow = raid.hitSerial > state.lastRaidHitSerial;
  const perfectNow = raid.perfectDodgeSerial > state.lastPerfectDodgeSerial;
  const pursuitWon = pursuit.successSerial > state.lastPursuitSuccessSerial;
  const pursuitLost = pursuit.failureSerial > state.lastPursuitFailureSerial;
  const eventCleared = event.rewardSerial > state.lastEventRewardSerial;
  const dodgeChallengeActive = cartEncounterProtectsActiveDodge(
    state.beat,
    raid.activeCount,
    hitNow,
    perfectNow,
  );

  state.lastRaidHitSerial = raid.hitSerial;
  state.lastPerfectDodgeSerial = raid.perfectDodgeSerial;
  state.lastPursuitSuccessSerial = pursuit.successSerial;
  state.lastPursuitFailureSerial = pursuit.failureSerial;
  state.lastEventRewardSerial = event.rewardSerial;

  if (boss.bossActive) {
    beginBeat(state, "BOSS", difficulty, "TITAN ACTIVE");
  } else if (state.beat === "BOSS") {
    beginBeat(state, "RECOVERY", difficulty, "TITAN PHASE RELEASE");
  } else if (hitNow || (!dodgeChallengeActive && pursuitLost)) {
    beginBeat(state, "RECOVERY", difficulty, hitNow ? "PLAYER HIT" : "PURSUIT FAILED");
  } else if (
    session.gas <= CART_ENCOUNTER_LOW_GAS_THRESHOLD
    && state.lowGasMercyLockout <= 0
    && state.beat !== "RECOVERY"
  ) {
    state.lowGasMercyLockout = CART_ENCOUNTER_LOW_GAS_MERCY_LOCKOUT_SECONDS;
    beginBeat(state, "RECOVERY", difficulty, "LOW GAS MERCY");
  } else if (perfectNow || (!dodgeChallengeActive && (pursuitWon || eventCleared))) {
    beginBeat(
      state,
      "COUNTER",
      difficulty,
      perfectNow ? "PERFECT DODGE" : pursuitWon ? "PURSUIT CLEAR" : "FIELD EVENT CLEAR",
    );
  } else if (!dodgeChallengeActive && (escape.active || pursuit.active)) {
    if (state.beat !== "RECOVERY") beginBeat(state, "CHASE", difficulty, escape.active ? "ESCAPE ACTIVE" : "PURSUIT ACTIVE");
  } else if (!dodgeChallengeActive && state.beat === "CHASE") {
    beginBeat(state, "COUNTER", difficulty, "CHASE RELEASE");
  } else if (!dodgeChallengeActive && state.secondsRemaining <= 0) {
    const next = cartEncounterTimedNextBeat(state.beat);
    beginBeat(state, next, difficulty, `RHYTHM ${state.beat} -> ${next}`);
  } else if (dodgeChallengeActive && state.secondsRemaining <= 0) {
    state.reason = "DODGE CHALLENGE RESOLVING";
  } else if (state.beat === "PRESSURE" && pressure.active) {
    state.intensity = Math.max(state.intensity, difficulty === "hard" ? 0.86 : 0.76);
  }

  applySchedulingGate(session, state);
  enforceSafeWindow(session, state, difficulty);
}

function broadcast(state: EncounterDirectorState): void {
  const snapshot = snapshotOf(state);
  latestSnapshot = snapshot;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CartEncounterDirectorSnapshot>(CART_ENCOUNTER_DIRECTOR_SNAPSHOT_EVENT, { detail: snapshot }));
  }
}

export function getCartEncounterDirectorState(session: CartArenaSession): CartEncounterDirectorSnapshot {
  return snapshotOf(stateFor(session));
}

export function getLatestCartEncounterDirectorState(): CartEncounterDirectorSnapshot | null {
  return latestSnapshot ? { ...latestSnapshot } : null;
}

function patchSession(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase106Session & Record<string, unknown>;
  if (prototype[PATCHED_KEY]) return;
  prototype[PATCHED_KEY] = true;
  const previousStep = prototype.step;
  prototype.step = function phase106EncounterDirector2Step(
    this: Phase106Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const typed = this as unknown as CartArenaSession;
    const state = stateFor(this);
    const difficulty = getCartRunDifficulty();
    const delta = clamp(fixedDelta, 0, 0.05);

    if (isCartTurboHuntEnabled(typed)) {
      applySchedulingGate(this, state);
      enforceSafeWindow(this, state, difficulty);
    }
    previousStep.call(this, input, fixedDelta);
    if (!isCartTurboHuntEnabled(typed)) return;

    updateEncounter(this, state, difficulty, delta);
    state.broadcastClock += delta;
    if (state.broadcastClock >= 0.1) {
      state.broadcastClock %= 0.1;
      broadcast(state);
    }
  };
}

export function installCartRoguePhase106EncounterDirector2(): void {
  patchSession();
}

installCartRoguePhase106EncounterDirector2();

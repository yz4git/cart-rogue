import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import type { CartEnemyArchetype, CartEnemyState } from "./CartCombat";
import { cartEncounterCommitCap } from "./CartEncounterDirectorGate";
import { getCartRunDifficulty, type CartRunDifficulty } from "./CartRunDifficulty";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { getCartThreatPressureState } from "./CartRoguePhase87ThreatPressure2";
import { getCartRaidHazardState } from "./CartRoguePhase88RaidHazards";

export type CartEnemyTacticalIntent = "PRESS" | "INTERCEPT" | "FLANK" | "SCREEN" | "RECOVER";
export type CartPhase105TacticalRole = CartEnemyArchetype | "heavy" | "blocker";

export interface CartEnemyIntelligenceSnapshot {
  difficulty: CartRunDifficulty;
  decisionSerial: number;
  commitBudget: number;
  committedEnemyIds: readonly string[];
  recoveringCount: number;
  raidActiveCount: number;
  gasLifePercent: number;
}

interface Phase105Car {
  position: { x: number; z: number };
  heading: number;
  forwardVelocity: number;
  lateralVelocity: number;
  boostActive: boolean;
}

interface Phase105Session {
  car: Phase105Car;
  enemies: CartEnemyState[];
  gas: number;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface EnemyBrain {
  baseSpeed: number;
  side: -1 | 1;
  intent: CartEnemyTacticalIntent;
  intentSeconds: number;
  recoverySeconds: number;
  wasCharging: boolean;
  wasAlive: boolean;
}

interface IntelligenceState {
  brains: Map<string, EnemyBrain>;
  decisionClock: number;
  decisionSerial: number;
  commitBudget: number;
  commitIds: [string | null, string | null, string | null];
  commitScores: [number, number, number];
  raidActiveCount: number;
  gasLifePercent: number;
}

const PATCHED_KEY = "__cartRoguePhase105EnemyIntelligenceBalancePatched__";
const stateBySession = new WeakMap<object, IntelligenceState>();

export const CART_PHASE105_PRESENTATION_ID = "phase105-enemy-intelligence-balance";
export const CART_PHASE105_NORMAL_DECISION_SECONDS = 0.18;
export const CART_PHASE105_HARD_DECISION_SECONDS = 0.14;
export const CART_PHASE105_MAX_COMMITTERS = 3;
export const CART_PHASE105_LOW_GAS_THRESHOLD = 0.28;
export const CART_PHASE105_RAID_STACK_THRESHOLD = 2;
export const CART_PHASE105_NORMAL_MAX_SPEED = 6.75;
export const CART_PHASE105_HARD_MAX_SPEED = 7.15;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(value: number): number {
  let result = value;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function rotateToward(current: number, target: number, maxDelta: number): number {
  const delta = normalizeAngle(target - current);
  return normalizeAngle(current + clamp(delta, -maxDelta, maxDelta));
}

function hashString(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function stableSide(id: string): -1 | 1 {
  return (hashString(id) & 1) === 0 ? -1 : 1;
}

function tacticalRole(enemy: CartEnemyState): CartPhase105TacticalRole {
  if (enemy.archetype) return enemy.archetype;
  if (enemy.kind === "heavy") return "heavy";
  return "blocker";
}

export function cartPhase105PredictionSeconds(
  role: CartPhase105TacticalRole,
  difficulty: CartRunDifficulty,
  playerSpeed: number,
): number {
  const base = role === "striker"
    ? 0.48
    : role === "bomber"
      ? 0.54
      : role === "heavy" || role === "tank"
        ? 0.42
        : role === "drifter"
          ? 0.36
          : role === "orbiter"
            ? 0.32
            : role === "standard"
              ? 0.28
              : 0.22;
  const speedBonus = clamp(Math.abs(playerSpeed) / 24, 0, 1) * 0.12;
  const difficultyBonus = difficulty === "hard" ? 0.14 : 0;
  return clamp(base + speedBonus + difficultyBonus, 0.2, difficulty === "hard" ? 0.78 : 0.62);
}

export function cartPhase105LeadDistance(playerSpeed: number, predictionSeconds: number): number {
  return clamp(Math.abs(playerSpeed) * Math.max(0, predictionSeconds), 0, 13);
}

export function cartPhase105CommitBudget(
  difficulty: CartRunDifficulty,
  gasRatio: number,
  raidActiveCount: number,
  aliveEnemyCount: number,
): number {
  if (aliveEnemyCount <= 0) return 0;
  let budget = difficulty === "hard" ? 3 : 2;
  if (gasRatio <= CART_PHASE105_LOW_GAS_THRESHOLD) budget -= 1;
  if (raidActiveCount >= CART_PHASE105_RAID_STACK_THRESHOLD) budget -= 1;
  return clamp(budget, 1, Math.min(CART_PHASE105_MAX_COMMITTERS, aliveEnemyCount));
}

export function cartPhase105RecoverySeconds(
  role: CartPhase105TacticalRole,
  difficulty: CartRunDifficulty,
): number {
  const normal = role === "striker"
    ? 0.82
    : role === "bomber"
      ? 0.72
      : role === "drifter"
        ? 0.58
        : role === "heavy" || role === "tank"
          ? 0.68
          : 0.5;
  return difficulty === "hard" ? normal * 0.76 : normal;
}

function stateFor(session: Phase105Session): IntelligenceState {
  const key = session as unknown as object;
  const current = stateBySession.get(key);
  if (current) return current;
  const created: IntelligenceState = {
    brains: new Map(),
    decisionClock: 0,
    decisionSerial: 0,
    commitBudget: 0,
    commitIds: [null, null, null],
    commitScores: [-Infinity, -Infinity, -Infinity],
    raidActiveCount: 0,
    gasLifePercent: 100,
  };
  stateBySession.set(key, created);
  return created;
}

function brainFor(state: IntelligenceState, enemy: CartEnemyState): EnemyBrain {
  const existing = state.brains.get(enemy.id);
  if (existing) return existing;
  const created: EnemyBrain = {
    baseSpeed: enemy.moveSpeed,
    side: stableSide(enemy.id),
    intent: "PRESS",
    intentSeconds: 0,
    recoverySeconds: 0,
    wasCharging: false,
    wasAlive: enemy.alive,
  };
  state.brains.set(enemy.id, created);
  return created;
}

function insertCandidate(state: IntelligenceState, enemyId: string, score: number): void {
  for (let slot = 0; slot < CART_PHASE105_MAX_COMMITTERS; slot += 1) {
    if (score <= state.commitScores[slot]) continue;
    for (let shift = CART_PHASE105_MAX_COMMITTERS - 1; shift > slot; shift -= 1) {
      state.commitScores[shift] = state.commitScores[shift - 1];
      state.commitIds[shift] = state.commitIds[shift - 1];
    }
    state.commitScores[slot] = score;
    state.commitIds[slot] = enemyId;
    return;
  }
}

function roleThreatScore(role: CartPhase105TacticalRole): number {
  if (role === "striker") return 4.0;
  if (role === "bomber") return 3.8;
  if (role === "drifter") return 3.6;
  if (role === "standard") return 3.4;
  if (role === "heavy" || role === "tank") return 3.2;
  if (role === "orbiter") return 3.0;
  return 2.6;
}

function isCommitted(state: IntelligenceState, enemyId: string): boolean {
  for (let index = 0; index < state.commitBudget; index += 1) {
    if (state.commitIds[index] === enemyId) return true;
  }
  return false;
}

function chooseIntent(enemy: CartEnemyState, brain: EnemyBrain, committed: boolean): CartEnemyTacticalIntent {
  if (brain.recoverySeconds > 0) return "RECOVER";
  if (committed) return "INTERCEPT";
  const role = tacticalRole(enemy);
  if (role === "orbiter" || role === "drifter") return "FLANK";
  if (role === "heavy" || role === "tank") return "SCREEN";
  return "PRESS";
}

function makeDecision(session: Phase105Session, state: IntelligenceState, difficulty: CartRunDifficulty): void {
  state.decisionSerial += 1;
  state.commitIds[0] = null;
  state.commitIds[1] = null;
  state.commitIds[2] = null;
  state.commitScores[0] = -Infinity;
  state.commitScores[1] = -Infinity;
  state.commitScores[2] = -Infinity;

  let aliveEnemyCount = 0;
  const pressure = getCartThreatPressureState(session as unknown as CartArenaSession);
  for (const enemy of session.enemies) {
    const brain = brainFor(state, enemy);
    if (!enemy.alive || enemy.kind === "boss" || enemy.moveSpeed <= 0) continue;
    aliveEnemyCount += 1;
    if (brain.recoverySeconds > 0) continue;
    const dx = session.car.position.x - enemy.x;
    const dz = session.car.position.z - enemy.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 31) continue;
    const role = tacticalRole(enemy);
    const rotation = ((hashString(enemy.id) + state.decisionSerial * 17) % 13) / 13 * 1.25;
    const proximity = clamp((30 - distance) / 20, 0, 1) * 1.35;
    const pressureBonus = pressure.active && role === "striker" ? 1.15 : 0;
    const readyBonus = (enemy.chargeCooldown ?? 0) <= 0.25 ? 0.35 : 0;
    insertCandidate(state, enemy.id, roleThreatScore(role) + rotation + proximity + pressureBonus + readyBonus);
  }

  state.commitBudget = cartPhase105CommitBudget(
    difficulty,
    session.gas,
    state.raidActiveCount,
    aliveEnemyCount,
  );
  state.commitBudget = cartEncounterCommitCap(
    session as unknown as CartArenaSession,
    state.commitBudget,
  );

  for (const enemy of session.enemies) {
    if (enemy.kind === "boss") continue;
    const brain = brainFor(state, enemy);
    if (!enemy.alive) continue;
    brain.intent = chooseIntent(enemy, brain, isCommitted(state, enemy.id));
    brain.intentSeconds = difficulty === "hard" ? CART_PHASE105_HARD_DECISION_SECONDS * 1.45 : CART_PHASE105_NORMAL_DECISION_SECONDS * 1.45;
  }
}

function desiredSpeed(
  enemy: CartEnemyState,
  brain: EnemyBrain,
  difficulty: CartRunDifficulty,
  pressureActive: boolean,
): number {
  const difficultyScale = difficulty === "hard" ? 1.045 : 0.985;
  let intentScale = 1;
  if (brain.intent === "INTERCEPT") intentScale = difficulty === "hard" ? 1.16 : 1.09;
  else if (brain.intent === "FLANK") intentScale = difficulty === "hard" ? 1.06 : 1.01;
  else if (brain.intent === "SCREEN") intentScale = difficulty === "hard" ? 0.99 : 0.93;
  else if (brain.intent === "RECOVER") intentScale = 0.74;
  else intentScale = difficulty === "hard" ? 1.04 : 0.98;

  let speed = brain.baseSpeed * difficultyScale * intentScale;
  if (pressureActive && brain.intent === "INTERCEPT" && enemy.kind === "chaser") {
    speed = Math.max(speed, difficulty === "hard" ? 6.7 : 6.45);
  }
  return Math.min(difficulty === "hard" ? CART_PHASE105_HARD_MAX_SPEED : CART_PHASE105_NORMAL_MAX_SPEED, speed);
}

function tacticalTurnRate(role: CartPhase105TacticalRole, intent: CartEnemyTacticalIntent, difficulty: CartRunDifficulty): number {
  let rate = role === "drifter"
    ? 1.6
    : role === "striker"
      ? 1.22
      : role === "bomber"
        ? 1.36
        : role === "heavy" || role === "tank"
          ? 0.82
          : 1.08;
  if (intent === "RECOVER") rate += 0.28;
  else if (intent === "FLANK") rate += 0.12;
  if (difficulty === "hard") rate += 0.18;
  return rate;
}

function applyTacticalHeading(
  session: Phase105Session,
  enemy: CartEnemyState,
  brain: EnemyBrain,
  difficulty: CartRunDifficulty,
  input: RallyInputState,
  delta: number,
): void {
  const car = session.car;
  const dx = car.position.x - enemy.x;
  const dz = car.position.z - enemy.z;
  const distance = Math.max(0.001, Math.hypot(dx, dz));
  const role = tacticalRole(enemy);
  const prediction = cartPhase105PredictionSeconds(role, difficulty, car.forwardVelocity);
  const intentPrediction = brain.intent === "INTERCEPT"
    ? prediction
    : brain.intent === "FLANK" || brain.intent === "SCREEN"
      ? prediction * 0.72
      : prediction * 0.42;
  const lead = cartPhase105LeadDistance(car.forwardVelocity, intentPrediction);
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const rx = Math.cos(car.heading);
  const rz = -Math.sin(car.heading);
  const lateralMotion = clamp(car.lateralVelocity * intentPrediction * 0.5, -3.8, 3.8);

  let lateral = lateralMotion;
  if (brain.intent === "FLANK") lateral += brain.side * (role === "orbiter" ? 7.2 : 5.6);
  else if (brain.intent === "SCREEN") lateral += brain.side * 2.8;
  else if (brain.intent === "INTERCEPT") {
    if (role === "bomber") lateral += brain.side * 3.2;
    else if (role === "drifter") {
      const actualSide = Math.abs(car.lateralVelocity) > 0.55
        ? (Math.sign(car.lateralVelocity) as -1 | 1)
        : brain.side;
      lateral += actualSide * 2.4;
    } else if (role === "striker") lateral += clamp(car.lateralVelocity * 0.16, -1.4, 1.4);
  }

  let targetX = car.position.x + fx * lead + rx * lateral;
  let targetZ = car.position.z + fz * lead + rz * lateral;
  if (brain.intent === "RECOVER") {
    const direct = Math.atan2(dx, dz);
    const recoverHeading = normalizeAngle(direct + brain.side * 1.42);
    targetX = enemy.x + Math.sin(recoverHeading) * 10;
    targetZ = enemy.z + Math.cos(recoverHeading) * 10;
  }

  const targetHeading = Math.atan2(targetX - enemy.x, targetZ - enemy.z);
  const turnRate = tacticalTurnRate(role, brain.intent, difficulty);
  enemy.heading = rotateToward(enemy.heading, targetHeading, turnRate * delta);

  if (role === "striker") {
    if (brain.intent !== "INTERCEPT" || brain.recoverySeconds > 0) {
      if ((enemy.chargeTime ?? 0) <= 0) enemy.chargeCooldown = Math.max(enemy.chargeCooldown ?? 0, 0.34);
    } else if ((enemy.chargeTime ?? 0) <= 0 && (enemy.chargeCooldown ?? 0) <= 0.12 && distance > 7.5 && distance < 25) {
      enemy.chargeTime = difficulty === "hard" ? 0.44 : 0.4;
      enemy.chargeCooldown = difficulty === "hard" ? 2.05 : 2.42;
    }
  }

  // Keep the raw input part of the tactical sample without letting the AI mirror
  // every steering twitch. Drifters only change side bias after a committed steer.
  const rawSteer = clamp(input.strafe ?? input.steer, -1, 1);
  if (role === "drifter" && brain.intent === "FLANK" && Math.abs(rawSteer) > 0.7 && brain.intentSeconds <= 0.04) {
    brain.side = (brain.side * -1) as -1 | 1;
  }
}

function prepareIntelligence(
  session: Phase105Session,
  input: RallyInputState,
  state: IntelligenceState,
  difficulty: CartRunDifficulty,
  delta: number,
): void {
  const raid = getCartRaidHazardState(session as unknown as CartArenaSession);
  state.raidActiveCount = raid.activeCount;
  state.gasLifePercent = Math.round(clamp(session.gas, 0, 1) * 100);
  const pressure = getCartThreatPressureState(session as unknown as CartArenaSession);

  for (const enemy of session.enemies) {
    if (enemy.kind === "boss") continue;
    const brain = brainFor(state, enemy);
    if (!enemy.alive) {
      brain.wasAlive = false;
      brain.recoverySeconds = 0;
      brain.intentSeconds = 0;
      brain.wasCharging = false;
      continue;
    }
    if (!brain.wasAlive) {
      brain.wasAlive = true;
      brain.recoverySeconds = 0;
      brain.intent = "PRESS";
      brain.intentSeconds = 0;
      brain.wasCharging = false;
    }
    brain.recoverySeconds = Math.max(0, brain.recoverySeconds - delta);
    brain.intentSeconds = Math.max(0, brain.intentSeconds - delta);
  }

  state.decisionClock -= delta;
  const decisionSeconds = difficulty === "hard" ? CART_PHASE105_HARD_DECISION_SECONDS : CART_PHASE105_NORMAL_DECISION_SECONDS;
  if (state.decisionClock <= 0) {
    makeDecision(session, state, difficulty);
    state.decisionClock += decisionSeconds;
  }

  for (const enemy of session.enemies) {
    if (!enemy.alive || enemy.kind === "boss" || enemy.moveSpeed <= 0) continue;
    const brain = brainFor(state, enemy);
    enemy.moveSpeed = desiredSpeed(enemy, brain, difficulty, pressure.active);
    applyTacticalHeading(session, enemy, brain, difficulty, input, delta);
    brain.wasCharging = (enemy.chargeTime ?? 0) > 0;
  }
}

function finishIntelligence(
  session: Phase105Session,
  state: IntelligenceState,
  difficulty: CartRunDifficulty,
): void {
  const pressure = getCartThreatPressureState(session as unknown as CartArenaSession);
  for (const enemy of session.enemies) {
    if (enemy.kind === "boss") continue;
    const brain = brainFor(state, enemy);
    if (!enemy.alive) continue;
    const chargingNow = (enemy.chargeTime ?? 0) > 0;
    if (brain.wasCharging && !chargingNow && tacticalRole(enemy) === "striker") {
      brain.recoverySeconds = Math.max(brain.recoverySeconds, cartPhase105RecoverySeconds("striker", difficulty));
      brain.intent = "RECOVER";
    }

    const distance = Math.hypot(session.car.position.x - enemy.x, session.car.position.z - enemy.z);
    const role = tacticalRole(enemy);
    if (brain.intent === "INTERCEPT" && distance < 3.7 && role !== "striker") {
      brain.recoverySeconds = Math.max(brain.recoverySeconds, cartPhase105RecoverySeconds(role, difficulty));
      brain.intent = "RECOVER";
    }

    if (brain.recoverySeconds > 0 && role === "striker" && (enemy.chargeTime ?? 0) <= 0) {
      enemy.chargeCooldown = Math.max(enemy.chargeCooldown ?? 0, brain.recoverySeconds);
    }
    enemy.moveSpeed = desiredSpeed(enemy, brain, difficulty, pressure.active);
    brain.wasCharging = chargingNow;
  }
}

export function getCartEnemyIntelligenceState(session: CartArenaSession): CartEnemyIntelligenceSnapshot {
  const typed = session as unknown as Phase105Session;
  const state = stateFor(typed);
  const committedEnemyIds: string[] = [];
  for (let index = 0; index < state.commitBudget; index += 1) {
    const id = state.commitIds[index];
    if (id) committedEnemyIds.push(id);
  }
  let recoveringCount = 0;
  for (const brain of state.brains.values()) {
    if (brain.recoverySeconds > 0) recoveringCount += 1;
  }
  return {
    difficulty: getCartRunDifficulty(),
    decisionSerial: state.decisionSerial,
    commitBudget: state.commitBudget,
    committedEnemyIds,
    recoveringCount,
    raidActiveCount: state.raidActiveCount,
    gasLifePercent: state.gasLifePercent,
  };
}

function patchSession(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase105Session & Record<string, unknown>;
  if (prototype[PATCHED_KEY]) return;
  prototype[PATCHED_KEY] = true;
  const previousStep = prototype.step;
  prototype.step = function phase105EnemyIntelligenceBalanceStep(
    this: Phase105Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const delta = clamp(fixedDelta, 0, 0.05);
    const session = this as unknown as CartArenaSession;
    const activeBefore = isCartTurboHuntEnabled(session) && this.gas > 0.0001;
    const state = stateFor(this);
    const difficulty = getCartRunDifficulty();

    if (activeBefore) prepareIntelligence(this, input, state, difficulty, delta);
    previousStep.call(this, input, fixedDelta);
    if (isCartTurboHuntEnabled(session) && this.gas > 0.0001) finishIntelligence(this, state, difficulty);
  };
}

export function installCartRoguePhase105EnemyIntelligenceBalance(): void {
  patchSession();
}

installCartRoguePhase105EnemyIntelligenceBalance();

import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import type { CartEnemyState } from "./CartCombat";
import { getCartTurboStrikeState } from "./CartRoguePhase55TurboStrike";
import { getCartTurboSmashState } from "./CartRoguePhase56TurboSmash";
import { getCartFlowSurgeState } from "./CartRoguePhase57FlowSurge";
import {
  CART_TURBO_HUNT_SNAPSHOT_EVENT,
  forceCartTurboHuntBoss,
  getCartTurboHuntSnapshot,
  isCartTurboHuntEnabled,
  setCartTurboHuntExternalOrdersCompleted,
  setCartTurboHuntExternalProgressionEnabled,
  type CartTurboHuntSnapshot,
} from "./CartRoguePhase67TurboHunt";
import { getCartPlayerDamageFeedbackState } from "./CartRoguePhase91DamageFeedback2";
import { restoreCartPrePhase108CoreLoopSessionMethods } from "./CartRoguePhase108CoreLoopBridge";
import { installCartRoguePhase109HandlingSmashDamage } from "./CartRoguePhase109HandlingSmashDamage";

const CART_PHASE110_TITAN_MAX_HP = 4200;

export const CART_PHASE110_TURBO_DOMINO_ID = "phase110-turbo-domino-core-loop-v1";
export const CART_PHASE110_HUNTED_HEAT = 66;
export const CART_PHASE110_TITAN_HEAT = 95;
export const CART_PHASE110_HEAT_DECAY_DELAY_SECONDS = 3.2;
export const CART_PHASE110_HEAT_DECAY_PER_SECOND = 2.7;
export const CART_PHASE110_COUNTER_SECONDS = 1.9;
export const CART_PHASE110_MIN_HUNTED_SECONDS_BEFORE_TITAN = 3.0;
export const CART_PHASE110_DOMINO_BONUS_STEP = 5;

export type CartTurboDominoStage =
  | "DROP_IN"
  | "TARGET"
  | "RAM"
  | "CHAIN"
  | "CHASE"
  | "HUNTED"
  | "COUNTERATTACK"
  | "TITAN"
  | "CLEAR";

export interface CartTurboDominoSnapshot {
  stage: CartTurboDominoStage;
  heat: number;
  heatLevel: number;
  dominoCount: number;
  chain: number;
  bestChain: number;
  targetEnemyId: string | null;
  targetDistance: number;
  huntedSeconds: number;
  bossTriggered: boolean;
  label: string;
}

interface Phase110Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  gas: number;
  turboRechargeTimer: number;
  rewardTimer: number;
  lastReward: string | null;
  step(input: RallyInputState, fixedDelta?: number): void;
  snapshot(): CartArenaSessionSnapshot;
}

interface DominoState {
  stage: CartTurboDominoStage;
  heat: number;
  dominoCount: number;
  bestChain: number;
  targetEnemyId: string | null;
  targetDistance: number;
  idleSeconds: number;
  dropInSeconds: number;
  ramSeconds: number;
  counterSeconds: number;
  huntedSeconds: number;
  huntedCycle: number;
  counterAwardedCycle: number;
  bossTriggered: boolean;
  bossResolved: boolean;
  lastStrikeSerial: number;
  lastSmashSerial: number;
  lastDamageSerial: number;
  lastHuntKills: number;
  lastFlowChain: number;
  nextDominoBonusAt: number;
  hudBroadcastClock: number;
  baseMoveSpeed: Map<string, number>;
}

const stateBySession = new WeakMap<object, DominoState>();
const PATCHED_KEY = "__cartRoguePhase110TurboDominoCoreLoopPatched__";
export const CART_TURBO_DOMINO_SNAPSHOT_EVENT = "cart-turbo-domino-snapshot";
let latestSnapshot: CartTurboDominoSnapshot | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function cartPhase110HeatLevel(heat: number): number {
  const value = clamp(heat, 0, 100);
  if (value >= 88) return 5;
  if (value >= 66) return 4;
  if (value >= 44) return 3;
  if (value >= 22) return 2;
  return 1;
}

export function cartPhase110HeatGain(
  strikeEvents: number,
  killEvents: number,
  smashEvents: number,
  chain: number,
): number {
  const strikes = Math.max(0, Math.floor(strikeEvents));
  const kills = Math.max(0, Math.floor(killEvents));
  const smashes = Math.max(0, Math.floor(smashEvents));
  const events = strikes + smashes;
  const chainBonus = events > 0 && chain >= 2
    ? Math.min(8, Math.max(0, chain - 1) * 0.9 + events * 0.7)
    : 0;
  return strikes * 3.8 + kills * 5.6 + smashes * 4.6 + chainBonus;
}

export function cartPhase110PressureMultiplier(heatLevel: number, hunted: boolean): number {
  const normalized = clamp(Math.floor(heatLevel), 1, 5);
  const base = [1, 1.035, 1.085, 1.145, 1.205][normalized - 1];
  return clamp(base + (hunted ? 0.06 : 0), 1, 1.28);
}

export function cartPhase110ShouldTriggerTitan(
  heat: number,
  huntedSeconds: number,
  dominoCount: number,
): boolean {
  return (
    heat >= CART_PHASE110_TITAN_HEAT
    && huntedSeconds >= CART_PHASE110_MIN_HUNTED_SECONDS_BEFORE_TITAN
  ) || dominoCount >= 22;
}

function stateFor(session: CartArenaSession | Phase110Session): DominoState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;

  const typed = session as unknown as CartArenaSession;
  const strike = getCartTurboStrikeState(typed);
  const smash = getCartTurboSmashState(typed);
  const damage = getCartPlayerDamageFeedbackState(typed);
  const hunt = getCartTurboHuntSnapshot(typed);
  const created: DominoState = {
    stage: "DROP_IN",
    heat: 0,
    dominoCount: 0,
    bestChain: 0,
    targetEnemyId: hunt?.huntTargetEnemyId ?? null,
    targetDistance: hunt?.huntTargetDistance ?? 0,
    idleSeconds: 0,
    dropInSeconds: 1.9,
    ramSeconds: 0,
    counterSeconds: 0,
    huntedSeconds: 0,
    huntedCycle: 0,
    counterAwardedCycle: -1,
    bossTriggered: false,
    bossResolved: false,
    lastStrikeSerial: strike.hitSerial,
    lastSmashSerial: smash.smashSerial,
    lastDamageSerial: damage.hitSerial,
    lastHuntKills: hunt?.huntKills ?? 0,
    lastFlowChain: 0,
    nextDominoBonusAt: CART_PHASE110_DOMINO_BONUS_STEP,
    hudBroadcastClock: 0,
    baseMoveSpeed: new Map(),
  };
  stateBySession.set(key, created);
  return created;
}

function setReward(session: Phase110Session, label: string, seconds = 1.55): void {
  session.lastReward = label;
  session.rewardTimer = Math.max(session.rewardTimer, seconds);
}

function syncTarget(state: DominoState, hunt: CartTurboHuntSnapshot | null): void {
  state.targetEnemyId = hunt?.huntTargetEnemyId ?? null;
  state.targetDistance = hunt?.huntTargetDistance ?? 0;
}

function tuneTitan(session: Phase110Session): void {
  const boss = session.enemies.find((enemy) => enemy.kind === "boss");
  if (!boss?.alive) return;
  if (boss.maxHp <= CART_PHASE110_TITAN_MAX_HP) return;
  const ratio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
  boss.maxHp = CART_PHASE110_TITAN_MAX_HP;
  boss.hp = Math.max(1, Math.round(boss.maxHp * ratio));
}

function pressurePopulation(session: CartArenaSession, heatLevel: number): void {
  const pressureBand = heatLevel >= 5 ? 4 : heatLevel >= 4 ? 3 : heatLevel >= 3 ? 2 : heatLevel >= 2 ? 1 : 0;
  setCartTurboHuntExternalOrdersCompleted(session, pressureBand);
}

function applyEnemyPressure(session: Phase110Session, state: DominoState): void {
  const level = cartPhase110HeatLevel(state.heat);
  const hunted = !state.bossTriggered && state.heat >= CART_PHASE110_HUNTED_HEAT;
  const multiplier = cartPhase110PressureMultiplier(level, hunted);

  for (const enemy of session.enemies) {
    if (enemy.kind === "boss") continue;
    let base = state.baseMoveSpeed.get(enemy.id);
    if (base === undefined) {
      base = enemy.moveSpeed;
      state.baseMoveSpeed.set(enemy.id, base);
    }
    if (!enemy.alive || base <= 0) continue;
    enemy.moveSpeed = Math.min(7.35, Math.max(enemy.moveSpeed, base * multiplier));

    if (enemy.archetype === "striker" && (enemy.chargeTime ?? 0) <= 0) {
      const floor = level >= 5 ? 0.42 : level >= 4 ? 0.54 : level >= 3 ? 0.68 : 0.82;
      enemy.chargeCooldown = Math.min(enemy.chargeCooldown ?? floor, floor);
    }
  }
}

function awardDominoBonus(session: Phase110Session, state: DominoState): void {
  while (state.dominoCount >= state.nextDominoBonusAt) {
    session.turboRechargeTimer += 0.55;
    session.gas = Math.min(1, session.gas + 0.025);
    setReward(session, `DOMINO ×${state.nextDominoBonusAt} · TURBO RECHARGE`, 1.55);
    state.nextDominoBonusAt += CART_PHASE110_DOMINO_BONUS_STEP;
  }
}

function awardCounterattack(session: Phase110Session, state: DominoState): void {
  if (state.counterAwardedCycle === state.huntedCycle) return;
  state.counterAwardedCycle = state.huntedCycle;
  state.counterSeconds = CART_PHASE110_COUNTER_SECONDS;
  state.stage = "COUNTERATTACK";
  state.heat = Math.max(0, state.heat - 11);
  session.gas = Math.min(1, session.gas + 0.035);
  session.turboRechargeTimer += 0.9;
  const before = session.car.boostCharges;
  session.car.addBoostCharge(1);
  setReward(
    session,
    session.car.boostCharges > before
      ? "COUNTER RAM · TURBO +1 · PRESSURE BROKEN"
      : "COUNTER RAM · FLOW MAX · PRESSURE BROKEN",
    2.0,
  );
}

function triggerTitan(session: Phase110Session, state: DominoState): void {
  if (state.bossTriggered) return;
  forceCartTurboHuntBoss(session as unknown as CartArenaSession);
  state.bossTriggered = true;
  state.heat = 100;
  state.stage = "TITAN";
  tuneTitan(session);
  setReward(session, "HEAT MAX · RAM TITAN INBOUND", 3.0);
}

function stageLabel(state: DominoState): string {
  if (state.stage === "DROP_IN") return "DROP IN · FIND THE FIRST TARGET";
  if (state.stage === "TARGET") return "LOCK TARGET · BUILD SPEED";
  if (state.stage === "RAM") return "RAM · KEEP THE DOMINO MOVING";
  if (state.stage === "CHAIN") return `DOMINO ×${Math.max(2, state.lastFlowChain)} · NEXT TARGET`;
  if (state.stage === "CHASE") return state.targetDistance > 0
    ? `CHASE · TARGET ${Math.round(state.targetDistance)}m`
    : "CHASE · FIND THE NEXT TARGET";
  if (state.stage === "HUNTED") return "HUNTED · EVADE · BUILD TURBO";
  if (state.stage === "COUNTERATTACK") return "COUNTERATTACK · RAM NOW";
  if (state.stage === "TITAN") return "RAM TITAN · USE THE CROWD";
  return "TURBO DOMINO CLEAR";
}

function updateStage(state: DominoState, actionEvents: number, flowChain: number): void {
  if (state.bossResolved) { state.stage = "CLEAR"; return; }
  if (state.bossTriggered) { state.stage = "TITAN"; return; }
  if (state.counterSeconds > 0) { state.stage = "COUNTERATTACK"; return; }
  if (state.heat >= CART_PHASE110_HUNTED_HEAT) { state.stage = "HUNTED"; return; }
  if (state.dropInSeconds > 0) { state.stage = "DROP_IN"; return; }
  if (actionEvents > 0 && flowChain >= 2) { state.stage = "CHAIN"; state.ramSeconds = 0.9; return; }
  if (actionEvents > 0) { state.stage = "RAM"; state.ramSeconds = 0.65; return; }
  if (state.ramSeconds > 0) return;
  state.stage = state.targetEnemyId ? "CHASE" : "TARGET";
}

function updateDominoLoop(session: Phase110Session, state: DominoState, delta: number): void {
  const typed = session as unknown as CartArenaSession;
  const hunt = getCartTurboHuntSnapshot(typed);
  syncTarget(state, hunt);

  const strike = getCartTurboStrikeState(typed);
  const smash = getCartTurboSmashState(typed);
  const flow = getCartFlowSurgeState(typed);
  const damage = getCartPlayerDamageFeedbackState(typed);

  const strikeEvents = Math.max(0, strike.hitSerial - state.lastStrikeSerial);
  const smashEvents = Math.max(0, smash.smashSerial - state.lastSmashSerial);
  const killEvents = Math.max(0, (hunt?.huntKills ?? state.lastHuntKills) - state.lastHuntKills);
  const actionEvents = strikeEvents + smashEvents;
  const dominoEvents = Math.max(actionEvents, killEvents);

  state.lastStrikeSerial = strike.hitSerial;
  state.lastSmashSerial = smash.smashSerial;
  state.lastHuntKills = hunt?.huntKills ?? state.lastHuntKills;
  state.lastFlowChain = flow.chain;
  state.bestChain = Math.max(state.bestChain, flow.chain);
  state.dropInSeconds = Math.max(0, state.dropInSeconds - delta);
  state.ramSeconds = Math.max(0, state.ramSeconds - delta);
  state.counterSeconds = Math.max(0, state.counterSeconds - delta);

  if (actionEvents > 0 || killEvents > 0) {
    state.idleSeconds = 0;
    state.dominoCount += dominoEvents;
    state.heat = clamp(state.heat + cartPhase110HeatGain(strikeEvents, killEvents, smashEvents, flow.chain), 0, 100);
    session.turboRechargeTimer += 0.14 * actionEvents + 0.09 * killEvents;
    if (session.car.boostActive && flow.chain >= 2) {
      session.car.boostTimeRemaining = Math.min(3.2, session.car.boostTimeRemaining + Math.min(0.18, actionEvents * 0.045 + flow.chain * 0.008));
    }
    awardDominoBonus(session, state);
  } else {
    state.idleSeconds += delta;
    if (state.idleSeconds > CART_PHASE110_HEAT_DECAY_DELAY_SECONDS && !state.bossTriggered) {
      state.heat = Math.max(0, state.heat - CART_PHASE110_HEAT_DECAY_PER_SECOND * delta);
    }
  }

  const huntedNow = !state.bossTriggered && state.heat >= CART_PHASE110_HUNTED_HEAT;
  const wasHunted = state.stage === "HUNTED" || state.stage === "COUNTERATTACK";
  if (huntedNow) {
    if (!wasHunted && state.counterSeconds <= 0) {
      state.huntedCycle += 1;
      setReward(session, "HEAT 4 · HUNTED · EVADE THEN COUNTER", 2.15);
    }
    state.huntedSeconds += delta;
  } else if (state.counterSeconds <= 0) {
    state.huntedSeconds = 0;
  }

  const tookDamage = damage.hitSerial > state.lastDamageSerial;
  state.lastDamageSerial = damage.hitSerial;
  if (tookDamage && huntedNow) state.heat = Math.max(CART_PHASE110_HUNTED_HEAT - 8, state.heat - 7);

  const counterReady = huntedNow && state.huntedSeconds >= 0.7 && actionEvents > 0 && (flow.chain >= 2 || strike.lastDestroyed);
  if (counterReady) awardCounterattack(session, state);

  const level = cartPhase110HeatLevel(state.heat);
  pressurePopulation(typed, level);
  applyEnemyPressure(session, state);

  if (cartPhase110ShouldTriggerTitan(state.heat, state.huntedSeconds, state.dominoCount)) triggerTitan(session, state);

  if (state.bossTriggered) {
    tuneTitan(session);
    const boss = session.enemies.find((enemy) => enemy.kind === "boss");
    if (boss && !boss.alive && !state.bossResolved) {
      state.bossResolved = true;
      state.stage = "CLEAR";
      setReward(session, "RAM TITAN DOWN · TURBO DOMINO CLEAR", 4.0);
    }
  }

  updateStage(state, actionEvents, flow.chain);
}

function snapshotOf(state: DominoState): CartTurboDominoSnapshot {
  return {
    stage: state.stage,
    heat: state.heat,
    heatLevel: cartPhase110HeatLevel(state.heat),
    dominoCount: state.dominoCount,
    chain: state.lastFlowChain,
    bestChain: state.bestChain,
    targetEnemyId: state.targetEnemyId,
    targetDistance: state.targetDistance,
    huntedSeconds: state.huntedSeconds,
    bossTriggered: state.bossTriggered,
    label: stageLabel(state),
  };
}

function broadcastDomino(state: DominoState): void {
  latestSnapshot = snapshotOf(state);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CartTurboDominoSnapshot>(CART_TURBO_DOMINO_SNAPSHOT_EVENT, { detail: latestSnapshot }));
}

export function getCartTurboDominoState(session: CartArenaSession): CartTurboDominoSnapshot {
  return snapshotOf(stateFor(session));
}

export function getLatestCartTurboDominoState(): CartTurboDominoSnapshot | null {
  return latestSnapshot ? { ...latestSnapshot } : null;
}

function objectiveKindFor(state: DominoState): "HUNT" | "FLOW" | "ELITE" {
  if (state.stage === "TITAN") return "ELITE";
  if (state.stage === "CHAIN" || state.stage === "HUNTED" || state.stage === "COUNTERATTACK") return "FLOW";
  return "HUNT";
}

function objectiveProgressFor(state: DominoState): { progress: number; target: number } {
  if (state.stage === "TITAN") return { progress: 0, target: 1 };
  if (state.stage === "HUNTED") return { progress: Math.min(3, state.huntedSeconds), target: 3 };
  if (state.stage === "CHAIN" || state.stage === "COUNTERATTACK") return { progress: Math.min(5, Math.max(0, state.lastFlowChain)), target: 5 };
  return { progress: Math.min(100, state.heat), target: 100 };
}

function patchSession(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase110Session & Record<string, unknown>;
  if (prototype[PATCHED_KEY]) return;
  prototype[PATCHED_KEY] = true;

  const previousStep = prototype.step;
  prototype.step = function phase110TurboDominoStep(this: Phase110Session, input: RallyInputState, fixedDelta = 1 / 60): void {
    previousStep.call(this, input, fixedDelta);
    const typed = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(typed)) return;
    const delta = clamp(fixedDelta, 0, 0.05);
    const state = stateFor(this);
    updateDominoLoop(this, state, delta);
    broadcastDomino(state);
    state.hudBroadcastClock += delta;
    if (state.hudBroadcastClock >= 0.1) {
      state.hudBroadcastClock %= 0.1;
      const snapshot = this.snapshot() as CartArenaSessionSnapshot & CartTurboHuntSnapshot;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent<CartTurboHuntSnapshot>(CART_TURBO_HUNT_SNAPSHOT_EVENT, { detail: snapshot }));
      }
    }
  };

  const previousSnapshot = prototype.snapshot;
  prototype.snapshot = function phase110TurboDominoSnapshot(this: Phase110Session): CartArenaSessionSnapshot {
    const base = previousSnapshot.call(this);
    const typed = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(typed)) return base;
    const state = stateFor(this);
    const objective = objectiveProgressFor(state);
    const boss = this.enemies.find((enemy) => enemy.kind === "boss");
    const phase = state.stage === "CLEAR" ? "clear" : state.stage === "TITAN" ? "boss-arrival" : state.heat >= 88 ? "overdrive" : state.heat >= 66 ? "elite-invasion" : state.heat >= 44 ? "heat-up" : "hunt";

    Object.assign(base as CartArenaSessionSnapshot & Record<string, unknown>, {
      huntPhase: phase,
      huntHeat: state.heat,
      huntHeatLevel: cartPhase110HeatLevel(state.heat),
      huntObjectiveSerial: state.dominoCount + state.huntedCycle + 1,
      huntObjectiveKind: objectiveKindFor(state),
      huntObjectiveLabel: stageLabel(state),
      huntObjectiveProgress: objective.progress,
      huntObjectiveTarget: objective.target,
      huntOrdersCompleted: Math.max(0, cartPhase110HeatLevel(state.heat) - 1),
      huntTargetEnemyId: state.targetEnemyId,
      huntTargetDistance: state.targetDistance,
      huntBossSpawned: state.bossTriggered,
      bossHp: state.bossTriggered ? boss?.hp ?? 0 : 0,
      bossMaxHp: state.bossTriggered ? boss?.maxHp ?? 0 : 0,
      runComplete: state.stage === "CLEAR",
      turboDominoStage: state.stage,
      turboDominoCount: state.dominoCount,
      turboDominoBestChain: state.bestChain,
    });
    return base;
  };
}

export function installCartRoguePhase110TurboDominoCoreLoop(): void {
  restoreCartPrePhase108CoreLoopSessionMethods();
  const prototype = CartArenaSession.prototype as unknown as Record<string, unknown>;
  prototype.__cartRoguePhase109HandlingSmashDamagePatched__ = false;
  installCartRoguePhase109HandlingSmashDamage();
  setCartTurboHuntExternalProgressionEnabled(true);
  patchSession();
}

installCartRoguePhase110TurboDominoCoreLoop();

import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import type { CartEnemyState } from "./CartCombat";
import { cartRaidDonutInterceptLead, cartRaidInterceptLead } from "./CartRaidHazardIntercept";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { getCartTitanBossState, type CartTitanStage } from "./CartRoguePhase83Boss2";
import { getCartTitanPredatorState } from "./CartRoguePhase86BossPredator";
import {
  cancelCartRaidHazards,
  getCartRaidHazardState,
  queueCartRaidHazard,
} from "./CartRoguePhase88RaidHazards";

export type CartTitanRaidPattern = "LINE_CHARGE" | "TITAN_SLAM" | "CROSS_CRUSH" | "HUNTING_BLAST" | "FURY_RAID" | "DONUT_CRUSH";

export interface CartTitanRaidBossSnapshot {
  active: boolean;
  raidSerial: number;
  pattern: CartTitanRaidPattern;
  patternLabel: string;
  cooldownSeconds: number;
  titanHazards: number;
  stage: CartTitanStage;
}

interface InternalRaidBossState extends CartTitanRaidBossSnapshot {
  broadcastClock: number;
  bossSeen: boolean;
  counterSeen: boolean;
}

interface Phase90Session {
  enemies: CartEnemyState[];
  rewardTimer: number;
  lastReward: string | null;
  step(input: RallyInputState, fixedDelta?: number): void;
}

const stateBySession = new WeakMap<object, InternalRaidBossState>();
let latestSnapshot: CartTitanRaidBossSnapshot | null = null;

export const CART_TITAN_RAID_BOSS_SNAPSHOT_EVENT = "cart-titan-raid-boss-snapshot";
export const CART_TITAN_RAID_ARMORED_INTERVAL = 4.35;
export const CART_TITAN_RAID_BREAKOUT_INTERVAL = 3.75;
export const CART_TITAN_RAID_FURY_INTERVAL = 2.85;
export const CART_TITAN_RAID_COUNTER_RECOVERY = 1.35;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function labelFor(pattern: CartTitanRaidPattern): string {
  if (pattern === "LINE_CHARGE") return "TITAN LINE CHARGE";
  if (pattern === "TITAN_SLAM") return "TITAN SLAM";
  if (pattern === "CROSS_CRUSH") return "CROSS CRUSH";
  if (pattern === "HUNTING_BLAST") return "HUNTING BLAST ×3";
  if (pattern === "FURY_RAID") return "FURY RAID ×3";
  return "TITAN DONUT CRUSH";
}

function stateFor(session: CartArenaSession | Phase90Session): InternalRaidBossState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalRaidBossState = {
    active: false,
    raidSerial: 0,
    pattern: "LINE_CHARGE",
    patternLabel: labelFor("LINE_CHARGE"),
    cooldownSeconds: 0.8,
    titanHazards: 0,
    stage: "ARMORED",
    broadcastClock: 0,
    bossSeen: false,
    counterSeen: false,
  };
  stateBySession.set(key, created);
  return created;
}

function snapshotOf(state: InternalRaidBossState): CartTitanRaidBossSnapshot {
  return {
    active: state.active,
    raidSerial: state.raidSerial,
    pattern: state.pattern,
    patternLabel: state.patternLabel,
    cooldownSeconds: state.cooldownSeconds,
    titanHazards: state.titanHazards,
    stage: state.stage,
  };
}

export function getCartTitanRaidBossState(session: CartArenaSession): CartTitanRaidBossSnapshot {
  return snapshotOf(stateFor(session));
}

export function getLatestCartTitanRaidBossState(): CartTitanRaidBossSnapshot | null {
  return latestSnapshot ? { ...latestSnapshot } : null;
}

function broadcast(state: InternalRaidBossState): void {
  const snapshot = snapshotOf(state);
  latestSnapshot = snapshot;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CartTitanRaidBossSnapshot>(CART_TITAN_RAID_BOSS_SNAPSHOT_EVENT, { detail: snapshot }));
  }
}

function bossOf(session: Phase90Session): CartEnemyState | null {
  return session.enemies.find((enemy) => enemy.kind === "boss" && enemy.alive) ?? null;
}

function setReward(session: Phase90Session, text: string, seconds = 1.8): void {
  session.lastReward = text;
  session.rewardTimer = Math.max(session.rewardTimer, seconds);
}

function intervalFor(stage: CartTitanStage): number {
  if (stage === "FURY") return CART_TITAN_RAID_FURY_INTERVAL;
  if (stage === "BREAKOUT") return CART_TITAN_RAID_BREAKOUT_INTERVAL;
  return CART_TITAN_RAID_ARMORED_INTERVAL;
}

export function cartTitanRaidPatternFor(stage: CartTitanStage, serial: number): CartTitanRaidPattern {
  const index = Math.abs(Math.floor(serial));
  if (stage === "FURY") {
    const fury: readonly CartTitanRaidPattern[] = ["HUNTING_BLAST", "FURY_RAID", "DONUT_CRUSH"];
    return fury[index % fury.length];
  }
  if (stage === "BREAKOUT") {
    const breakout: readonly CartTitanRaidPattern[] = ["CROSS_CRUSH", "LINE_CHARGE", "TITAN_SLAM"];
    return breakout[index % breakout.length];
  }
  const armored: readonly CartTitanRaidPattern[] = ["LINE_CHARGE", "TITAN_SLAM"];
  return armored[index % armored.length];
}

function forwardPoint(enemy: CartEnemyState, distance: number): { x: number; z: number } {
  return {
    x: enemy.x + Math.sin(enemy.heading) * distance,
    z: enemy.z + Math.cos(enemy.heading) * distance,
  };
}

function queueLineCharge(session: CartArenaSession, boss: CartEnemyState): boolean {
  const point = forwardPoint(boss, 16);
  return queueCartRaidHazard(session, {
    kind: "LINE",
    source: "TITAN",
    label: "TITAN LINE CHARGE",
    x: point.x,
    z: point.z,
    heading: boss.heading,
    width: 9,
    length: 38,
    telegraphSeconds: 1.22,
  }) !== null;
}

function queueTitanSlam(session: CartArenaSession, boss: CartEnemyState): boolean {
  return queueCartRaidHazard(session, {
    kind: "CIRCLE",
    source: "TITAN",
    label: "TITAN SLAM",
    x: boss.x,
    z: boss.z,
    radius: 13.5,
    telegraphSeconds: 1.55,
  }) !== null;
}

function queueCrossCrush(session: CartArenaSession): boolean {
  const telegraphSeconds = 1.5;
  const followCarSeconds = 0.54;
  return queueCartRaidHazard(session, {
    kind: "CROSS",
    source: "TITAN",
    label: "CROSS CRUSH",
    width: 7,
    length: 40,
    telegraphSeconds,
    followCarSeconds,
    followForward: cartRaidInterceptLead(session.car, telegraphSeconds, followCarSeconds, 4.8),
    followHeading: true,
    headingOffset: Math.PI * 0.25,
  }) !== null;
}

function queueHuntingBlast(session: CartArenaSession): boolean {
  const firstTelegraph = 1.05;
  const firstFollow = 0.52;
  const secondTelegraph = 1.02;
  const secondFollow = 0.5;
  const thirdTelegraph = 1.0;
  const thirdFollow = 0.48;
  const first = queueCartRaidHazard(session, {
    kind: "CIRCLE",
    source: "TITAN",
    label: "HUNTING BLAST 1/3",
    radius: 9.6,
    telegraphSeconds: firstTelegraph,
    followCarSeconds: firstFollow,
    followForward: cartRaidInterceptLead(session.car, firstTelegraph, firstFollow, 3.6),
  });
  const second = queueCartRaidHazard(session, {
    kind: "CIRCLE",
    source: "TITAN",
    label: "HUNTING BLAST 2/3",
    radius: 9.6,
    telegraphSeconds: secondTelegraph,
    followCarSeconds: secondFollow,
    followForward: cartRaidInterceptLead(session.car, secondTelegraph, secondFollow, 4.2),
    delaySeconds: 0.72,
  });
  const third = queueCartRaidHazard(session, {
    kind: "CIRCLE",
    source: "TITAN",
    label: "HUNTING BLAST 3/3",
    radius: 9.6,
    telegraphSeconds: thirdTelegraph,
    followCarSeconds: thirdFollow,
    followForward: cartRaidInterceptLead(session.car, thirdTelegraph, thirdFollow, 4.8),
    delaySeconds: 1.42,
  });
  return first !== null && second !== null && third !== null;
}

function queueFuryRaid(session: CartArenaSession): boolean {
  const lineTelegraph = 1.02;
  const lineFollow = 0.42;
  const circleTelegraph = 1.02;
  const circleFollow = 0.45;
  const donutTelegraph = 1.08;
  const donutFollow = 0.48;
  const line = queueCartRaidHazard(session, {
    kind: "LINE",
    source: "TITAN",
    label: "FURY LINE",
    width: 7.6,
    length: 36,
    telegraphSeconds: lineTelegraph,
    followCarSeconds: lineFollow,
    followForward: cartRaidInterceptLead(session.car, lineTelegraph, lineFollow, 4.6),
    followHeading: true,
  });
  const circle = queueCartRaidHazard(session, {
    kind: "CIRCLE",
    source: "TITAN",
    label: "FURY BLAST",
    radius: 10.5,
    telegraphSeconds: circleTelegraph,
    followCarSeconds: circleFollow,
    followForward: cartRaidInterceptLead(session.car, circleTelegraph, circleFollow, 4.4),
    delaySeconds: 0.7,
  });
  const donut = queueCartRaidHazard(session, {
    kind: "DONUT",
    source: "TITAN",
    label: "FURY DONUT",
    innerRadius: 5.4,
    outerRadius: 15,
    telegraphSeconds: donutTelegraph,
    followCarSeconds: donutFollow,
    followForward: cartRaidDonutInterceptLead(session.car, donutTelegraph, donutFollow),
    delaySeconds: 1.4,
  });
  return line !== null && circle !== null && donut !== null;
}

function queueDonutCrush(session: CartArenaSession): boolean {
  const telegraphSeconds = 1.42;
  const followCarSeconds = 0.58;
  return queueCartRaidHazard(session, {
    kind: "DONUT",
    source: "TITAN",
    label: "TITAN DONUT CRUSH",
    innerRadius: 5.4,
    outerRadius: 15,
    telegraphSeconds,
    followCarSeconds,
    followForward: cartRaidDonutInterceptLead(session.car, telegraphSeconds, followCarSeconds),
  }) !== null;
}

function queuePattern(session: CartArenaSession, boss: CartEnemyState, pattern: CartTitanRaidPattern): boolean {
  if (pattern === "LINE_CHARGE") return queueLineCharge(session, boss);
  if (pattern === "TITAN_SLAM") return queueTitanSlam(session, boss);
  if (pattern === "CROSS_CRUSH") return queueCrossCrush(session);
  if (pattern === "HUNTING_BLAST") return queueHuntingBlast(session);
  if (pattern === "FURY_RAID") return queueFuryRaid(session);
  return queueDonutCrush(session);
}

function beginPattern(session: CartArenaSession, raw: Phase90Session, state: InternalRaidBossState, boss: CartEnemyState): void {
  const pattern = cartTitanRaidPatternFor(state.stage, state.raidSerial);
  if (!queuePattern(session, boss, pattern)) {
    state.cooldownSeconds = 0.4;
    return;
  }
  state.raidSerial += 1;
  state.pattern = pattern;
  state.patternLabel = labelFor(pattern);
  state.cooldownSeconds = intervalFor(state.stage);
  setReward(raw, `${state.patternLabel} · INTERCEPT AHEAD`, 1.7);
}

function resetRaid(session: CartArenaSession, state: InternalRaidBossState): void {
  cancelCartRaidHazards(session, "TITAN");
  state.active = false;
  state.titanHazards = 0;
  state.cooldownSeconds = 0.8;
  state.bossSeen = false;
  state.counterSeen = false;
}

export function installCartRoguePhase90TitanRaidBoss4(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase90Session;
  const previousStep = sessionPrototype.step;
  sessionPrototype.step = function phase90TitanRaidBoss4Step(
    this: Phase90Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previousStep.call(this, input, fixedDelta);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return;
    const delta = clamp(fixedDelta, 0, 0.05);
    const state = stateFor(this);
    const titan = getCartTitanBossState(session);
    const predator = getCartTitanPredatorState(session);
    const boss = bossOf(this);

    if (!boss || !titan.bossActive || titan.stage === "DOWN") {
      if (state.bossSeen || state.titanHazards > 0) resetRaid(session, state);
    } else {
      state.bossSeen = true;
      state.active = true;
      state.stage = titan.stage;
      state.titanHazards = getCartRaidHazardState(session).hazards.filter((hazard) => hazard.source === "TITAN").length;

      if (predator.mode === "COUNTER") {
        if (!state.counterSeen || state.titanHazards > 0) cancelCartRaidHazards(session, "TITAN");
        state.counterSeen = true;
        state.titanHazards = 0;
        state.cooldownSeconds = CART_TITAN_RAID_COUNTER_RECOVERY;
      } else {
        if (state.counterSeen) {
          state.counterSeen = false;
          state.cooldownSeconds = Math.max(state.cooldownSeconds, CART_TITAN_RAID_COUNTER_RECOVERY);
        }
        state.cooldownSeconds = Math.max(0, state.cooldownSeconds - delta);
        if (state.titanHazards === 0 && state.cooldownSeconds <= 0) beginPattern(session, this, state, boss);
      }
    }

    state.broadcastClock += delta;
    if (state.broadcastClock >= 0.1) {
      state.broadcastClock %= 0.1;
      broadcast(state);
    }
  };
}

installCartRoguePhase90TitanRaidBoss4();

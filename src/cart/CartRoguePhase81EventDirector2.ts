import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import type { CartEnemyState } from "./CartCombat";
import type { CartObstacleState } from "./CartObstacles";
import type { CartResourcePickupState } from "./CartResources";
import { getCartPerfectStrikeState } from "./CartRoguePhase61PerfectStrike";
import {
  cartTurboHuntRegion,
  isCartTurboHuntEnabled,
  type CartTurboHuntRegion,
} from "./CartRoguePhase67TurboHunt";
import { CART_TURBO_HUNT_FIELD } from "./CartTurboHuntTrack";

export type CartTurboHuntEventKind = "CONVOY" | "SMASH_ZONE" | "TURBO_RUSH" | "CHAOS_WAVE" | "ELITE_HUNT";

export interface CartTurboHuntEventSnapshot {
  eventSerial: number;
  eventKind: CartTurboHuntEventKind;
  eventLabel: string;
  eventActive: boolean;
  eventProgress: number;
  eventTarget: number;
  eventSecondsRemaining: number;
  eventRegion: CartTurboHuntRegion;
  eventChain: number;
  eventChainSeconds: number;
  overdriveSeconds: number;
  rewardSerial: number;
  targetEnemyId: string | null;
}

interface EventDirectorState extends CartTurboHuntEventSnapshot {
  cooldownSeconds: number;
  chainSerial: number;
  broadcastClock: number;
  trackedEnemyIds: string[];
  trackedObstacleIds: string[];
  trackedResourceIds: string[];
  previousEnemyAlive: Map<string, boolean>;
  previousObstacleDestroyed: Map<string, boolean>;
  previousResourceCollected: Map<string, boolean>;
  lastRamCount: number;
  lastDestructionCount: number;
  lastPerfectSerial: number;
  awardedChainThresholds: Set<number>;
  overdriveApplied: boolean;
  preOverdriveMaxSpeed: number;
  preOverdriveHandling: number;
}

interface Phase81Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  obstacles: CartObstacleState[];
  resources: CartResourcePickupState[];
  gas: number;
  rewardTimer: number;
  lastReward: string | null;
  turboRechargeTimer: number;
  step(input: RallyInputState, fixedDelta?: number): void;
}

const stateBySession = new WeakMap<object, EventDirectorState>();
let latestEventSnapshot: CartTurboHuntEventSnapshot | null = null;

export const CART_TURBO_HUNT_EVENT_SNAPSHOT_EVENT = "cart-turbo-hunt-event-snapshot";
export const CART_TURBO_HUNT_EVENT_CHAIN_THRESHOLDS = [4, 8, 12] as const;
export const CART_TURBO_HUNT_EVENT_CHAIN_CAP = 16;
export const CART_TURBO_HUNT_EVENT_CHAIN_WINDOW = 3.1;
export const CART_TURBO_HUNT_OVERDRIVE_MAX_SPEED = 25.6;
export const CART_TURBO_HUNT_OVERDRIVE_HANDLING_MULTIPLIER = 1.025;
let fieldEventAutostartEnabled = true;

export function setCartTurboHuntFieldEventAutostartEnabled(enabled: boolean): void {
  fieldEventAutostartEnabled = enabled;
}

const REGION_EVENT_ROTATION: Readonly<Record<CartTurboHuntRegion, readonly CartTurboHuntEventKind[]>> = {
  "DROP YARD": ["SMASH_ZONE", "CONVOY", "TURBO_RUSH"],
  "SMASH GARDEN": ["SMASH_ZONE", "CHAOS_WAVE", "ELITE_HUNT"],
  "SPRINT LANE": ["CONVOY", "TURBO_RUSH", "CHAOS_WAVE"],
  "CROSSFIRE GARDEN": ["CHAOS_WAVE", "CONVOY", "ELITE_HUNT"],
  "CROWN GROUNDS": ["ELITE_HUNT", "CHAOS_WAVE", "CONVOY"],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function eventLabel(kind: CartTurboHuntEventKind): string {
  switch (kind) {
    case "CONVOY": return "BREAK THE MOVING CONVOY";
    case "SMASH_ZONE": return "SMASH THE DESTRUCTION ROUTE";
    case "TURBO_RUSH": return "SWEEP THE TURBO LINE";
    case "CHAOS_WAVE": return "CHAIN THE CROSSFIRE PACK";
    case "ELITE_HUNT": return "HUNT THE ELITE TARGET";
  }
}

function eventTarget(kind: CartTurboHuntEventKind): number {
  switch (kind) {
    case "CONVOY": return 4;
    case "SMASH_ZONE": return 5;
    case "TURBO_RUSH": return 4;
    case "CHAOS_WAVE": return 5;
    case "ELITE_HUNT": return 1;
  }
}

function eventDuration(kind: CartTurboHuntEventKind): number {
  return kind === "ELITE_HUNT" ? 24 : kind === "TURBO_RUSH" ? 20 : 22;
}

export function cartTurboHuntEventKindForRegion(region: CartTurboHuntRegion, serial: number): CartTurboHuntEventKind {
  const rotation = REGION_EVENT_ROTATION[region];
  return rotation[Math.abs(Math.floor(serial)) % rotation.length];
}

function internalState(session: CartArenaSession | Phase81Session): EventDirectorState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const raw = session as Phase81Session;
  const created: EventDirectorState = {
    eventSerial: 0,
    eventKind: "CONVOY",
    eventLabel: eventLabel("CONVOY"),
    eventActive: false,
    eventProgress: 0,
    eventTarget: eventTarget("CONVOY"),
    eventSecondsRemaining: 0,
    eventRegion: "DROP YARD",
    eventChain: 0,
    eventChainSeconds: 0,
    overdriveSeconds: 0,
    rewardSerial: 0,
    targetEnemyId: null,
    cooldownSeconds: 0.35,
    chainSerial: 0,
    broadcastClock: 0,
    trackedEnemyIds: [],
    trackedObstacleIds: [],
    trackedResourceIds: [],
    previousEnemyAlive: new Map(),
    previousObstacleDestroyed: new Map(),
    previousResourceCollected: new Map(),
    lastRamCount: raw.car.ramCount,
    lastDestructionCount: raw.car.destructionCount,
    lastPerfectSerial: getCartPerfectStrikeState(session as CartArenaSession).perfectSerial,
    awardedChainThresholds: new Set(),
    overdriveApplied: false,
    preOverdriveMaxSpeed: raw.car.definition.maxSpeed,
    preOverdriveHandling: raw.car.definition.handling,
  };
  stateBySession.set(key, created);
  return created;
}

function snapshotOf(state: EventDirectorState): CartTurboHuntEventSnapshot {
  return {
    eventSerial: state.eventSerial,
    eventKind: state.eventKind,
    eventLabel: state.eventLabel,
    eventActive: state.eventActive,
    eventProgress: state.eventProgress,
    eventTarget: state.eventTarget,
    eventSecondsRemaining: state.eventSecondsRemaining,
    eventRegion: state.eventRegion,
    eventChain: state.eventChain,
    eventChainSeconds: state.eventChainSeconds,
    overdriveSeconds: state.overdriveSeconds,
    rewardSerial: state.rewardSerial,
    targetEnemyId: state.targetEnemyId,
  };
}

export function getCartTurboHuntEventState(session: CartArenaSession): CartTurboHuntEventSnapshot {
  return snapshotOf(internalState(session));
}

export function getLatestCartTurboHuntEventState(): CartTurboHuntEventSnapshot | null {
  return latestEventSnapshot ? { ...latestEventSnapshot } : null;
}

function broadcast(state: EventDirectorState): void {
  const snapshot = snapshotOf(state);
  latestEventSnapshot = snapshot;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CartTurboHuntEventSnapshot>(CART_TURBO_HUNT_EVENT_SNAPSHOT_EVENT, { detail: snapshot }));
  }
}

function setReward(session: Phase81Session, text: string, seconds = 1.8): void {
  session.lastReward = text;
  session.rewardTimer = Math.max(session.rewardTimer, seconds);
}

function clampToField(x: number, z: number, margin = 7): { x: number; z: number } {
  return {
    x: clamp(x, CART_TURBO_HUNT_FIELD.centerX - CART_TURBO_HUNT_FIELD.halfWidth + margin, CART_TURBO_HUNT_FIELD.centerX + CART_TURBO_HUNT_FIELD.halfWidth - margin),
    z: clamp(z, CART_TURBO_HUNT_FIELD.centerZ - CART_TURBO_HUNT_FIELD.halfDepth + margin, CART_TURBO_HUNT_FIELD.centerZ + CART_TURBO_HUNT_FIELD.halfDepth - margin),
  };
}

function pointAhead(session: Phase81Session, forward: number, lateral: number): { x: number; z: number } {
  const heading = session.car.heading;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  return clampToField(
    session.car.position.x + fx * forward + rx * lateral,
    session.car.position.z + fz * forward + rz * lateral,
  );
}

function resetTracking(state: EventDirectorState): void {
  state.trackedEnemyIds = [];
  state.trackedObstacleIds = [];
  state.trackedResourceIds = [];
  state.previousEnemyAlive.clear();
  state.previousObstacleDestroyed.clear();
  state.previousResourceCollected.clear();
  state.targetEnemyId = null;
}

function arrangeConvoy(session: Phase81Session, state: EventDirectorState, chaos = false): void {
  const candidates = session.enemies
    .filter((enemy) => enemy.alive && enemy.kind !== "boss")
    .sort((a, b) => Number(a.kind === "heavy") - Number(b.kind === "heavy"));
  const count = Math.min(chaos ? 6 : 5, candidates.length);
  const lanes = [0, -4.2, 4.2, -7.2, 7.2, 0];
  for (let index = 0; index < count; index += 1) {
    const enemy = candidates[index];
    const distance = chaos ? 16 + (index % 3) * 6 : 21 + index * 5.4;
    const lateral = chaos ? lanes[index] * 1.25 : lanes[index] * 0.72;
    const point = pointAhead(session, distance, lateral);
    enemy.x = point.x;
    enemy.z = point.z;
    enemy.heading = chaos
      ? Math.atan2(session.car.position.x - enemy.x, session.car.position.z - enemy.z)
      : session.car.heading;
    enemy.aiClock = 0;
    enemy.chargeTime = 0;
    if (enemy.kind !== "heavy") enemy.moveSpeed = Math.max(enemy.moveSpeed, chaos ? 4.75 : 4.55);
    state.trackedEnemyIds.push(enemy.id);
    state.previousEnemyAlive.set(enemy.id, true);
  }
}

function arrangeSmashZone(session: Phase81Session, state: EventDirectorState): void {
  const count = Math.min(7, session.obstacles.length);
  const lanes = [-5.4, 4.8, -2.6, 6.4, 0, -6.8, 3.1];
  for (let index = 0; index < count; index += 1) {
    const obstacle = session.obstacles[index];
    const point = pointAhead(session, 16 + index * 6.4, lanes[index]);
    obstacle.x = point.x;
    obstacle.z = point.z;
    obstacle.destroyed = false;
    state.trackedObstacleIds.push(obstacle.id);
    state.previousObstacleDestroyed.set(obstacle.id, false);
  }
}

function arrangeTurboRush(session: Phase81Session, state: EventDirectorState): void {
  const count = Math.min(6, session.resources.length);
  const lanes = [0, -3.6, 3.6, -1.8, 1.8, 0];
  for (let index = 0; index < count; index += 1) {
    const resource = session.resources[index];
    const point = pointAhead(session, 13 + index * 7.2, lanes[index]);
    resource.x = point.x;
    resource.z = point.z;
    resource.collected = false;
    state.trackedResourceIds.push(resource.id);
    state.previousResourceCollected.set(resource.id, false);
  }
}

function arrangeEliteHunt(session: Phase81Session, state: EventDirectorState): void {
  const target = session.enemies.find((enemy) => enemy.alive && enemy.kind === "heavy")
    ?? session.enemies.find((enemy) => enemy.alive && enemy.kind !== "boss")
    ?? null;
  if (!target) return;
  const point = pointAhead(session, 29, 0);
  target.x = point.x;
  target.z = point.z;
  target.heading = Math.atan2(session.car.position.x - target.x, session.car.position.z - target.z);
  target.aiClock = 0;
  target.chargeTime = 0;
  state.targetEnemyId = target.id;
  state.trackedEnemyIds = [target.id];
  state.previousEnemyAlive.set(target.id, target.alive);
}

function startEvent(session: Phase81Session, state: EventDirectorState): void {
  resetTracking(state);
  state.eventSerial += 1;
  state.eventRegion = cartTurboHuntRegion(session.car.position.x, session.car.position.z);
  state.eventKind = cartTurboHuntEventKindForRegion(state.eventRegion, state.eventSerial - 1);
  state.eventLabel = eventLabel(state.eventKind);
  state.eventTarget = eventTarget(state.eventKind);
  state.eventProgress = 0;
  state.eventSecondsRemaining = eventDuration(state.eventKind);
  state.eventActive = true;
  state.cooldownSeconds = 0;

  if (state.eventKind === "CONVOY") arrangeConvoy(session, state, false);
  else if (state.eventKind === "CHAOS_WAVE") arrangeConvoy(session, state, true);
  else if (state.eventKind === "SMASH_ZONE") arrangeSmashZone(session, state);
  else if (state.eventKind === "TURBO_RUSH") arrangeTurboRush(session, state);
  else arrangeEliteHunt(session, state);

  setReward(session, `FIELD EVENT · ${state.eventKind.replaceAll("_", " ")}`, 1.5);
}

function finishEvent(session: Phase81Session, state: EventDirectorState, completed: boolean): void {
  if (!state.eventActive) return;
  state.eventActive = false;
  state.eventSecondsRemaining = 0;
  state.cooldownSeconds = completed ? 2.4 : 3.0;
  if (!completed) {
    setReward(session, "EVENT SHIFT · KEEP HUNTING", 1.15);
    return;
  }
  state.rewardSerial += 1;
  session.gas = Math.min(1, session.gas + 0.055);
  session.car.addBoostCharge(1);
  session.turboRechargeTimer += 0.8;
  state.overdriveSeconds = Math.max(state.overdriveSeconds, 2.8);
  session.car.collisionImpact = Math.max(session.car.collisionImpact, 0.82);
  setReward(session, `${state.eventKind.replaceAll("_", " ")} CLEAR · TURBO +1`, 2.1);
}

function updateTrackedProgress(session: Phase81Session, state: EventDirectorState): void {
  if (!state.eventActive) return;
  if (state.eventKind === "CONVOY" || state.eventKind === "CHAOS_WAVE" || state.eventKind === "ELITE_HUNT") {
    for (const id of state.trackedEnemyIds) {
      const enemy = session.enemies.find((candidate) => candidate.id === id);
      if (!enemy) continue;
      const previous = state.previousEnemyAlive.get(id) ?? enemy.alive;
      if (previous && !enemy.alive) state.eventProgress += 1;
      state.previousEnemyAlive.set(id, enemy.alive);
    }
  } else if (state.eventKind === "SMASH_ZONE") {
    for (const id of state.trackedObstacleIds) {
      const obstacle = session.obstacles.find((candidate) => candidate.id === id);
      if (!obstacle) continue;
      const previous = state.previousObstacleDestroyed.get(id) ?? obstacle.destroyed;
      if (!previous && obstacle.destroyed) state.eventProgress += 1;
      state.previousObstacleDestroyed.set(id, obstacle.destroyed);
    }
  } else if (state.eventKind === "TURBO_RUSH") {
    for (const id of state.trackedResourceIds) {
      const resource = session.resources.find((candidate) => candidate.id === id);
      if (!resource) continue;
      const previous = state.previousResourceCollected.get(id) ?? resource.collected;
      if (!previous && resource.collected) {
        state.eventProgress += 1;
        registerChain(session, state, 1);
      }
      state.previousResourceCollected.set(id, resource.collected);
    }
  }
  if (state.eventProgress >= state.eventTarget) finishEvent(session, state, true);
}

function awardChainThreshold(session: Phase81Session, state: EventDirectorState, threshold: number): void {
  if (state.awardedChainThresholds.has(threshold)) return;
  state.awardedChainThresholds.add(threshold);
  state.rewardSerial += 1;
  if (threshold === 4) {
    session.car.addBoostCharge(1);
    setReward(session, "FLOW ×4 · TURBO +1", 1.25);
  } else if (threshold === 8) {
    session.gas = Math.min(1, session.gas + 0.045);
    session.turboRechargeTimer += 0.65;
    setReward(session, "FLOW ×8 · HEAT SURGE", 1.35);
  } else if (threshold === 12) {
    session.car.addBoostCharge(1);
    session.gas = Math.min(1, session.gas + 0.055);
    state.overdriveSeconds = Math.max(state.overdriveSeconds, 6.0);
    session.car.collisionImpact = Math.max(session.car.collisionImpact, 1);
    setReward(session, "FLOW ×12 · OVERDRIVE", 2.0);
  }
}

function registerChain(session: Phase81Session, state: EventDirectorState, amount: number): void {
  const safeAmount = Math.max(0, Math.floor(amount));
  if (safeAmount <= 0) return;
  const previous = state.eventChainSeconds > 0 ? state.eventChain : 0;
  if (state.eventChainSeconds <= 0) state.awardedChainThresholds.clear();
  state.eventChain = Math.min(CART_TURBO_HUNT_EVENT_CHAIN_CAP, previous + safeAmount);
  state.eventChainSeconds = CART_TURBO_HUNT_EVENT_CHAIN_WINDOW;
  state.chainSerial += safeAmount;
  for (const threshold of CART_TURBO_HUNT_EVENT_CHAIN_THRESHOLDS) {
    if (previous < threshold && state.eventChain >= threshold) awardChainThreshold(session, state, threshold);
  }
}

function updateChainSignals(session: Phase81Session, state: EventDirectorState): void {
  const ramDelta = Math.max(0, session.car.ramCount - state.lastRamCount);
  const destructionDelta = Math.max(0, session.car.destructionCount - state.lastDestructionCount);
  const perfect = getCartPerfectStrikeState(session as unknown as CartArenaSession);
  const perfectDelta = Math.max(0, perfect.perfectSerial - state.lastPerfectSerial);
  state.lastRamCount = session.car.ramCount;
  state.lastDestructionCount = session.car.destructionCount;
  state.lastPerfectSerial = perfect.perfectSerial;
  const events = ramDelta + destructionDelta + perfectDelta;
  if (events > 0) registerChain(session, state, events);
}

function updateOverdrive(session: Phase81Session, state: EventDirectorState, delta: number): void {
  state.overdriveSeconds = Math.max(0, state.overdriveSeconds - delta);
  if (state.overdriveSeconds > 0) {
    if (!state.overdriveApplied) {
      state.overdriveApplied = true;
      state.preOverdriveMaxSpeed = session.car.definition.maxSpeed;
      state.preOverdriveHandling = session.car.definition.handling;
    }
    session.car.definition.maxSpeed = Math.max(state.preOverdriveMaxSpeed, CART_TURBO_HUNT_OVERDRIVE_MAX_SPEED);
    session.car.definition.handling = state.preOverdriveHandling * CART_TURBO_HUNT_OVERDRIVE_HANDLING_MULTIPLIER;
    session.turboRechargeTimer += delta * 0.36;
    if (session.car.boostActive) {
      session.car.boostTimeRemaining = Math.min(3.2, session.car.boostTimeRemaining + delta * 0.055);
    }
    return;
  }

  if (state.overdriveApplied) {
    session.car.definition.maxSpeed = state.preOverdriveMaxSpeed;
    session.car.definition.handling = state.preOverdriveHandling;
    state.overdriveApplied = false;
  }
}

export function installCartRoguePhase81EventDirector2(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase81Session;
  const previous = prototype.step;
  prototype.step = function phase81EventDirector2Step(
    this: Phase81Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previous.call(this, input, fixedDelta);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return;
    const state = internalState(this);
    const delta = clamp(fixedDelta, 0, 0.05);

    state.eventChainSeconds = Math.max(0, state.eventChainSeconds - delta);
    if (state.eventChainSeconds <= 0 && state.eventChain !== 0) {
      state.eventChain = 0;
      state.awardedChainThresholds.clear();
    }
    updateChainSignals(this, state);
    updateTrackedProgress(this, state);
    updateOverdrive(this, state, delta);

    if (state.eventActive) {
      state.eventSecondsRemaining = Math.max(0, state.eventSecondsRemaining - delta);
      if (state.eventSecondsRemaining <= 0) finishEvent(this, state, false);
    } else {
      state.cooldownSeconds = Math.max(0, state.cooldownSeconds - delta);
      if (state.cooldownSeconds <= 0 && fieldEventAutostartEnabled) startEvent(this, state);
    }

    state.broadcastClock += delta;
    if (state.broadcastClock >= 0.1) {
      state.broadcastClock %= 0.1;
      broadcast(state);
    }
  };
}

installCartRoguePhase81EventDirector2();
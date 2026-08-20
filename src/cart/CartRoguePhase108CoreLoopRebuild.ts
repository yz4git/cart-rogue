import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import type { CartEnemyState } from "./CartCombat";
import {
  CART_TURBO_HUNT_SNAPSHOT_EVENT,
  cartTurboHuntRegion,
  forceCartTurboHuntBoss,
  isCartTurboHuntEnabled,
  setCartTurboHuntExternalOrdersCompleted,
  setCartTurboHuntExternalProgressionEnabled,
  type CartTurboHuntRegion,
  type CartTurboHuntSnapshot,
} from "./CartRoguePhase67TurboHunt";
import { setCartTurboHuntFieldEventAutostartEnabled } from "./CartRoguePhase81EventDirector2";
import { CART_TURBO_HUNT_FIELD } from "./CartTurboHuntTrack";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

export const CART_PHASE108_CORE_LOOP_ID = "phase108-turbo-hunt-core-loop-rebuild-v1";
export const CART_PHASE108_CONTRACT_COUNT = 5;
export const CART_PHASE108_BREAK_SECONDS = 4.6;
export const CART_PHASE108_DROP_IN_SECONDS = 2.8;
export const CART_PHASE108_TITAN_MAX_HP = 4200;
export const CART_PHASE108_DEATH_FLIGHT_MIN_SECONDS = 0.72;

export type CartTurboHuntCoreStage = "DROP_IN" | "ROUTE" | "TRAVEL" | "ACTION" | "BREAK" | "BOSS" | "CLEAR";
export type CartTurboHuntContractKind = "HUNT" | "SMASH" | "CONVOY" | "CHAOS" | "ELITE";

export interface CartTurboHuntContractDefinition {
  region: CartTurboHuntRegion;
  kind: CartTurboHuntContractKind;
  target: number;
}

export interface CartTurboHuntCoreLoopSnapshot {
  stage: CartTurboHuntCoreStage;
  contractSerial: number;
  contractsCompleted: number;
  targetRegion: CartTurboHuntRegion;
  contractKind: CartTurboHuntContractKind;
  progress: number;
  target: number;
  breakSecondsRemaining: number;
  label: string;
}

const CONTRACTS: readonly CartTurboHuntContractDefinition[] = [
  { region: "DROP YARD", kind: "HUNT", target: 5 },
  { region: "SMASH GARDEN", kind: "SMASH", target: 4 },
  { region: "SPRINT LANE", kind: "CONVOY", target: 4 },
  { region: "CROSSFIRE GARDEN", kind: "CHAOS", target: 6 },
  { region: "CROWN GROUNDS", kind: "ELITE", target: 2 },
] as const;

interface CoreLoopState {
  stage: CartTurboHuntCoreStage;
  contractSerial: number;
  contractsCompleted: number;
  targetRegion: CartTurboHuntRegion;
  contractKind: CartTurboHuntContractKind;
  progress: number;
  target: number;
  breakSecondsRemaining: number;
  dropInSecondsRemaining: number;
  trackedEnemyIds: string[];
  trackedObstacleIds: string[];
  completedTargetIds: Set<string>;
  previousAlive: Map<string, boolean>;
  previousDestroyed: Map<string, boolean>;
  guideEnemyId: string | null;
  bossTriggered: boolean;
  bossResolved: boolean;
  routeOptions: CartTurboHuntRegion[];
  visitedRegions: Set<CartTurboHuntRegion>;
  hudBroadcastClock: number;
}

interface Phase108Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  obstacles: Array<{ id: string; x: number; z: number; destroyed: boolean }>;
  gas: number;
  turboRechargeTimer: number;
  rewardTimer: number;
  lastReward: string | null;
  step(input: RallyInputState, fixedDelta?: number): void;
  snapshot(): CartArenaSessionSnapshot;
}

interface PieceFlightState {
  object: THREE.Object3D;
  basePosition: THREE.Vector3;
  baseRotation: THREE.Euler;
  baseScale: THREE.Vector3;
  direction: THREE.Vector3;
  spin: THREE.Vector3;
}

interface DeathFlightState {
  group: THREE.Group;
  elapsed: number;
  duration: number;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  pieces: PieceFlightState[];
  baseScale: THREE.Vector3;
}

interface Phase108Demo {
  enemyGroups: Map<string, THREE.Group>;
  session: { snapshot(): CartArenaSessionSnapshot };
  updateVisuals(delta: number): void;
}

interface DemoFlightRegistry {
  previousAlive: Map<string, boolean>;
  flights: Map<string, DeathFlightState>;
}

const stateBySession = new WeakMap<object, CoreLoopState>();
const flightRegistryByDemo = new WeakMap<object, DemoFlightRegistry>();
let latestCoreLoopSnapshot: CartTurboHuntCoreLoopSnapshot | null = null;

export const CART_TURBO_HUNT_CORE_LOOP_SNAPSHOT_EVENT = "cart-turbo-hunt-core-loop-snapshot";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function cartPhase108ContractDefinition(index: number): CartTurboHuntContractDefinition {
  const normalized = Math.max(0, Math.min(CONTRACTS.length - 1, Math.floor(index)));
  return { ...CONTRACTS[normalized] };
}

const ROUTE_PRIORITY: readonly CartTurboHuntRegion[] = [
  "SMASH GARDEN",
  "SPRINT LANE",
  "CROSSFIRE GARDEN",
  "CROWN GROUNDS",
];

function contractForRegion(region: CartTurboHuntRegion): CartTurboHuntContractDefinition {
  return CONTRACTS.find((contract) => contract.region === region) ?? CONTRACTS[0];
}

function stateFor(session: CartArenaSession | Phase108Session): CoreLoopState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const first = CONTRACTS[0];
  const created: CoreLoopState = {
    stage: "DROP_IN",
    contractSerial: 0,
    contractsCompleted: 0,
    targetRegion: first.region,
    contractKind: first.kind,
    progress: 0,
    target: first.target,
    breakSecondsRemaining: 0,
    dropInSecondsRemaining: CART_PHASE108_DROP_IN_SECONDS,
    trackedEnemyIds: [],
    trackedObstacleIds: [],
    completedTargetIds: new Set(),
    previousAlive: new Map(),
    previousDestroyed: new Map(),
    guideEnemyId: null,
    bossTriggered: false,
    bossResolved: false,
    routeOptions: [],
    visitedRegions: new Set(),
    hudBroadcastClock: 0,
  };
  stateBySession.set(key, created);
  return created;
}

function setReward(session: Phase108Session, text: string, seconds = 1.75): void {
  session.lastReward = text;
  session.rewardTimer = Math.max(session.rewardTimer, seconds);
}

function regionAnchor(region: CartTurboHuntRegion): { x: number; z: number } {
  const cx = CART_TURBO_HUNT_FIELD.centerX;
  const cz = CART_TURBO_HUNT_FIELD.centerZ;
  if (region === "DROP YARD") return { x: cx, z: cz - 58 };
  if (region === "SMASH GARDEN") return { x: cx - 54, z: cz + 4 };
  if (region === "SPRINT LANE") return { x: cx + 54, z: cz + 4 };
  if (region === "CROWN GROUNDS") return { x: cx, z: cz + 58 };
  return { x: cx, z: cz };
}

function enemyCandidates(session: Phase108Session, kind: CartTurboHuntContractKind): CartEnemyState[] {
  const aliveOrReusable = session.enemies.filter((enemy) => enemy.kind !== "boss");
  if (kind === "ELITE") {
    return [...aliveOrReusable].sort((a, b) => Number(b.kind === "heavy") - Number(a.kind === "heavy"));
  }
  if (kind === "CONVOY") {
    return [...aliveOrReusable].sort((a, b) => Number(a.kind === "heavy") - Number(b.kind === "heavy"));
  }
  return aliveOrReusable;
}

function prepareEnemyContract(session: Phase108Session, state: CoreLoopState): void {
  const anchor = regionAnchor(state.targetRegion);
  const candidates = enemyCandidates(session, state.contractKind);
  const count = Math.min(state.target, candidates.length);
  const convoy = state.contractKind === "CONVOY";
  const chaos = state.contractKind === "CHAOS";
  const lanes = [-6.8, -3.4, 0, 3.4, 6.8, -1.8, 1.8];

  for (let index = 0; index < count; index += 1) {
    const enemy = candidates[index];
    enemy.hp = enemy.maxHp;
    enemy.alive = true;
    const row = Math.floor(index / 3);
    const lane = convoy ? lanes[index] * 0.72 : lanes[index] * (chaos ? 1.05 : 0.82);
    enemy.x = anchor.x + lane;
    enemy.z = anchor.z + (convoy ? index * 7.5 - 10 : row * 7 - 5);
    enemy.heading = convoy ? 0 : Math.atan2(anchor.x - enemy.x, anchor.z - enemy.z);
    enemy.aiClock = 0;
    enemy.chargeTime = 0;
    enemy.chargeCooldown = Math.max(enemy.chargeCooldown ?? 0, 0.8);
    state.trackedEnemyIds.push(enemy.id);
    state.previousAlive.set(enemy.id, true);
  }
  state.guideEnemyId = state.trackedEnemyIds[0] ?? null;
}

function prepareSmashContract(session: Phase108Session, state: CoreLoopState): void {
  const anchor = regionAnchor(state.targetRegion);
  const lanes = [-6.6, -2.2, 2.4, 6.5, 0, -4.4, 4.5];
  const count = Math.min(state.target, session.obstacles.length);
  for (let index = 0; index < count; index += 1) {
    const obstacle = session.obstacles[index];
    obstacle.destroyed = false;
    obstacle.x = anchor.x + lanes[index];
    obstacle.z = anchor.z + index * 6.4 - 8;
    state.trackedObstacleIds.push(obstacle.id);
    state.previousDestroyed.set(obstacle.id, false);
  }

  const guide = session.enemies.find((enemy) => enemy.kind === "blocker" && enemy.kind !== "boss")
    ?? session.enemies.find((enemy) => enemy.kind !== "boss")
    ?? null;
  if (guide) {
    guide.hp = guide.maxHp;
    guide.alive = true;
    guide.x = anchor.x;
    guide.z = anchor.z - 12;
    guide.moveSpeed = 0;
    state.guideEnemyId = guide.id;
  }
}

function prepareContract(session: Phase108Session, state: CoreLoopState, definition: CartTurboHuntContractDefinition): void {
  state.contractSerial += 1;
  state.targetRegion = definition.region;
  state.contractKind = definition.kind;
  state.progress = 0;
  state.target = definition.target;
  state.trackedEnemyIds = [];
  state.trackedObstacleIds = [];
  state.completedTargetIds.clear();
  state.previousAlive.clear();
  state.previousDestroyed.clear();
  state.guideEnemyId = null;

  if (definition.kind === "SMASH") prepareSmashContract(session, state);
  else prepareEnemyContract(session, state);

  const currentRegion = cartTurboHuntRegion(session.car.position.x, session.car.position.z);
  state.stage = currentRegion === state.targetRegion ? "ACTION" : "TRAVEL";
  setReward(session, `NEW CONTRACT · ${definition.region}`, 1.7);
}

function beginRouteChoice(session: Phase108Session, state: CoreLoopState): void {
  const available = ROUTE_PRIORITY.filter((region) => !state.visitedRegions.has(region));
  state.routeOptions = available.slice(0, Math.min(2, available.length));
  if (state.routeOptions.length === 0) {
    beginBoss(session, state);
    return;
  }
  state.stage = "ROUTE";
  state.progress = 0;
  state.target = 1;
  setReward(session, `ROUTE CHOICE · ${state.routeOptions.join(" / ")}`, 2.2);
}

function updateActionProgress(session: Phase108Session, state: CoreLoopState): void {
  if (state.contractKind === "SMASH") {
    for (const id of state.trackedObstacleIds) {
      if (state.completedTargetIds.has(id)) continue;
      const obstacle = session.obstacles.find((candidate) => candidate.id === id);
      if (!obstacle) continue;
      const previous = state.previousDestroyed.get(id) ?? obstacle.destroyed;
      if (!previous && obstacle.destroyed) state.completedTargetIds.add(id);
      state.previousDestroyed.set(id, obstacle.destroyed);
    }
  } else {
    for (const id of state.trackedEnemyIds) {
      if (state.completedTargetIds.has(id)) continue;
      const enemy = session.enemies.find((candidate) => candidate.id === id);
      if (!enemy) continue;
      const previous = state.previousAlive.get(id) ?? enemy.alive;
      if (previous && !enemy.alive) state.completedTargetIds.add(id);
      state.previousAlive.set(id, enemy.alive);
    }
  }
  state.progress = Math.min(state.target, state.completedTargetIds.size);
}

function suppressBreakPressure(session: Phase108Session): void {
  for (const enemy of session.enemies) {
    if (!enemy.alive || enemy.kind === "boss") continue;
    enemy.chargeTime = 0;
    enemy.chargeCooldown = Math.max(enemy.chargeCooldown ?? 0, 1.25);
  }
}

function finishContract(session: Phase108Session, state: CoreLoopState): void {
  state.contractsCompleted += 1;
  state.visitedRegions.add(state.targetRegion);
  setCartTurboHuntExternalOrdersCompleted(session as unknown as CartArenaSession, state.contractsCompleted);
  state.stage = "BREAK";
  state.breakSecondsRemaining = CART_PHASE108_BREAK_SECONDS;
  session.gas = Math.min(1, session.gas + 0.12);
  session.car.addBoostCharge(1);
  session.turboRechargeTimer += 1.25;
  session.car.collisionImpact = Math.max(session.car.collisionImpact, 0.9);
  setReward(session, "CONTRACT CLEAR · TURBO +1 · ROUTE OPEN", 2.2);
}

function tuneTitan(session: Phase108Session): void {
  const boss = session.enemies.find((enemy) => enemy.kind === "boss");
  if (!boss?.alive) return;
  if (boss.maxHp > CART_PHASE108_TITAN_MAX_HP) {
    const ratio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    boss.maxHp = CART_PHASE108_TITAN_MAX_HP;
    boss.hp = Math.max(1, Math.round(CART_PHASE108_TITAN_MAX_HP * ratio));
  }
}

function beginBoss(session: Phase108Session, state: CoreLoopState): void {
  if (!state.bossTriggered) {
    forceCartTurboHuntBoss(session as unknown as CartArenaSession);
    state.bossTriggered = true;
    setReward(session, "RAM TITAN · BREAK THE WEAK POINT", 2.6);
  }
  state.stage = "BOSS";
  tuneTitan(session);
}

function updateCoreLoop(session: Phase108Session, state: CoreLoopState, delta: number): void {
  if (state.stage === "DROP_IN") {
    state.dropInSecondsRemaining = Math.max(0, state.dropInSecondsRemaining - delta);
    if (state.dropInSecondsRemaining <= 0) prepareContract(session, state, CONTRACTS[0]);
    return;
  }

  if (state.stage === "ROUTE") {
    const currentRegion = cartTurboHuntRegion(session.car.position.x, session.car.position.z);
    if (state.routeOptions.includes(currentRegion)) {
      prepareContract(session, state, contractForRegion(currentRegion));
    }
    return;
  }

  if (state.stage === "TRAVEL") {
    if (cartTurboHuntRegion(session.car.position.x, session.car.position.z) === state.targetRegion) {
      state.stage = "ACTION";
      setReward(session, `${state.targetRegion} · CONTRACT LIVE`, 1.35);
    }
    return;
  }

  if (state.stage === "ACTION") {
    updateActionProgress(session, state);
    if (state.progress >= state.target) finishContract(session, state);
    return;
  }

  if (state.stage === "BREAK") {
    suppressBreakPressure(session);
    state.breakSecondsRemaining = Math.max(0, state.breakSecondsRemaining - delta);
    if (state.breakSecondsRemaining > 0) return;
    if (state.contractsCompleted >= CART_PHASE108_CONTRACT_COUNT) beginBoss(session, state);
    else beginRouteChoice(session, state);
    return;
  }

  if (state.stage === "BOSS") {
    tuneTitan(session);
    const boss = session.enemies.find((enemy) => enemy.kind === "boss");
    if (state.bossTriggered && boss && !boss.alive && !state.bossResolved) {
      state.bossResolved = true;
      state.stage = "CLEAR";
      setReward(session, "RAM TITAN DOWN · TURBO HUNT CLEAR", 4);
    }
  }
}

function contractLabel(state: CoreLoopState): string {
  if (state.stage === "DROP_IN") return "DROP IN · FIND YOUR FIRST TARGET";
  if (state.stage === "ROUTE") return `CHOOSE ROUTE · ${state.routeOptions.join(" / ")}`;
  if (state.stage === "TRAVEL") return `GO TO ${state.targetRegion}`;
  if (state.stage === "BREAK") return "BREAK · RELOAD TURBO · ROUTE OPENS NEXT";
  if (state.stage === "BOSS") return "BREAK RAM TITAN · TURBO THE WEAK POINT";
  if (state.stage === "CLEAR") return "TURBO HUNT CLEAR";
  if (state.contractKind === "SMASH") return `${state.targetRegion} · TURBO SMASH ${state.target} TARGETS`;
  if (state.contractKind === "CONVOY") return `${state.targetRegion} · BREAK THE CONVOY`;
  if (state.contractKind === "CHAOS") return `${state.targetRegion} · CHAIN ${state.target} TARGETS`;
  if (state.contractKind === "ELITE") return `${state.targetRegion} · BREAK ${state.target} HEAVIES`;
  return `${state.targetRegion} · DESTROY ${state.target} TARGETS`;
}

function preferredTarget(session: Phase108Session, state: CoreLoopState): { id: string | null; distance: number } {
  const ids = state.stage === "TRAVEL" || state.stage === "ACTION"
    ? (state.guideEnemyId ? [state.guideEnemyId, ...state.trackedEnemyIds] : state.trackedEnemyIds)
    : [];
  let best: CartEnemyState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const id of ids) {
    const enemy = session.enemies.find((candidate) => candidate.id === id && candidate.alive);
    if (!enemy) continue;
    const distance = Math.hypot(enemy.x - session.car.position.x, enemy.z - session.car.position.z);
    if (distance < bestDistance) {
      best = enemy;
      bestDistance = distance;
    }
  }
  return { id: best?.id ?? null, distance: Number.isFinite(bestDistance) ? bestDistance : 0 };
}

function snapshotOf(state: CoreLoopState): CartTurboHuntCoreLoopSnapshot {
  return {
    stage: state.stage,
    contractSerial: state.contractSerial,
    contractsCompleted: state.contractsCompleted,
    targetRegion: state.targetRegion,
    contractKind: state.contractKind,
    progress: state.progress,
    target: state.target,
    breakSecondsRemaining: state.breakSecondsRemaining,
    label: contractLabel(state),
  };
}

function broadcastCoreLoop(state: CoreLoopState): void {
  latestCoreLoopSnapshot = snapshotOf(state);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CartTurboHuntCoreLoopSnapshot>(CART_TURBO_HUNT_CORE_LOOP_SNAPSHOT_EVENT, {
    detail: latestCoreLoopSnapshot,
  }));
}

export function getCartTurboHuntCoreLoopState(session: CartArenaSession): CartTurboHuntCoreLoopSnapshot {
  return snapshotOf(stateFor(session));
}

export function getLatestCartTurboHuntCoreLoopState(): CartTurboHuntCoreLoopSnapshot | null {
  return latestCoreLoopSnapshot ? { ...latestCoreLoopSnapshot } : null;
}

function patchSession(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase108Session & Record<string, unknown>;
  if (prototype.__cartPhase108CoreLoopPatched__) return;
  prototype.__cartPhase108CoreLoopPatched__ = true;

  const previousStep = prototype.step;
  prototype.step = function phase108CoreLoopStep(
    this: Phase108Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previousStep.call(this, input, fixedDelta);
    const typed = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(typed)) return;
    const delta = clamp(fixedDelta, 0, 0.05);
    const state = stateFor(this);
    updateCoreLoop(this, state, delta);
    broadcastCoreLoop(state);
    state.hudBroadcastClock += delta;
    if (state.hudBroadcastClock >= 0.1) {
      state.hudBroadcastClock %= 0.1;
      const hudSnapshot = this.snapshot();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent<CartTurboHuntSnapshot>(CART_TURBO_HUNT_SNAPSHOT_EVENT, {
          detail: hudSnapshot as unknown as CartTurboHuntSnapshot,
        }));
      }
    }
  };

  const previousSnapshot = prototype.snapshot;
  prototype.snapshot = function phase108CoreLoopSnapshot(this: Phase108Session): CartArenaSessionSnapshot {
    const base = previousSnapshot.call(this);
    const typed = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(typed)) return base;
    const state = stateFor(this);
    const target = preferredTarget(this, state);
    const huntPhase = state.stage === "BOSS" ? "boss-arrival" : state.stage === "CLEAR" ? "clear" : "hunt";
    Object.assign(base as CartArenaSessionSnapshot & Record<string, unknown>, {
      huntPhase,
      huntObjectiveSerial: state.contractSerial,
      huntObjectiveKind: state.contractKind === "SMASH" ? "SMASH" : state.contractKind === "ELITE" ? "ELITE" : "HUNT",
      huntObjectiveLabel: contractLabel(state),
      huntObjectiveProgress: state.stage === "TRAVEL" || state.stage === "ROUTE" ? 0 : state.progress,
      huntObjectiveTarget: state.stage === "TRAVEL" || state.stage === "ROUTE" ? 1 : Math.max(1, state.target),
      huntOrdersCompleted: state.contractsCompleted,
      huntTargetEnemyId: target.id,
      huntTargetDistance: target.distance,
      huntBossSpawned: state.bossTriggered,
      runComplete: state.stage === "CLEAR",
    });
    return base;
  };
}

function hashText(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

function pieceDirection(enemyId: string, index: number): THREE.Vector3 {
  let seed = hashText(enemyId) ^ Math.imul(index + 1, 0x45d9f3b);
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  const angle = ((seed >>> 0) / 0xffffffff) * Math.PI * 2;
  const lift = 0.2 + (((seed >>> 8) & 255) / 255) * 0.75;
  return new THREE.Vector3(Math.cos(angle), lift, Math.sin(angle)).normalize();
}

function captureFlightPieces(group: THREE.Group, enemyId: string): PieceFlightState[] {
  return group.children.map((object, index) => ({
    object,
    basePosition: object.position.clone(),
    baseRotation: object.rotation.clone(),
    baseScale: object.scale.clone(),
    direction: pieceDirection(enemyId, index),
    spin: new THREE.Vector3(
      2.2 + (index % 4) * 0.7,
      2.8 + (index % 5) * 0.62,
      1.8 + (index % 3) * 0.76,
    ),
  }));
}

function flightRegistry(demo: Phase108Demo): DemoFlightRegistry {
  const key = demo as unknown as object;
  const existing = flightRegistryByDemo.get(key);
  if (existing) return existing;
  const created: DemoFlightRegistry = { previousAlive: new Map(), flights: new Map() };
  flightRegistryByDemo.set(key, created);
  return created;
}

function restoreFlight(flight: DeathFlightState): void {
  flight.group.scale.copy(flight.baseScale);
  flight.group.rotation.x = 0;
  flight.group.rotation.z = 0;
  for (const piece of flight.pieces) {
    piece.object.position.copy(piece.basePosition);
    piece.object.rotation.copy(piece.baseRotation);
    piece.object.scale.copy(piece.baseScale);
  }
}

function beginDeathFlight(
  group: THREE.Group,
  enemy: CartArenaSessionSnapshot["enemies"][number],
  snapshot: CartArenaSessionSnapshot,
): DeathFlightState {
  const forward = new THREE.Vector3(Math.sin(snapshot.heading), 0, Math.cos(snapshot.heading));
  const radial = new THREE.Vector3(group.position.x - snapshot.x, 0, group.position.z - snapshot.z);
  if (radial.lengthSq() > 0.001) radial.normalize();
  else radial.copy(forward);
  const playerRam = snapshot.lastRamEnemyId === enemy.id;
  const direction = playerRam ? forward.multiplyScalar(0.78).add(radial.multiplyScalar(0.22)).normalize() : radial;
  const launchSpeed = enemy.kind === "boss" ? 15 : enemy.kind === "heavy" ? 18 : 22;
  const boostScale = snapshot.boostActive ? 1.16 : 1;
  const duration = enemy.kind === "boss" ? 1.05 : enemy.kind === "heavy" ? 0.88 : CART_PHASE108_DEATH_FLIGHT_MIN_SECONDS;
  const groupScale = group.scale.clone();
  return {
    group,
    elapsed: 0,
    duration,
    velocity: new THREE.Vector3(direction.x * launchSpeed * boostScale, enemy.kind === "boss" ? 6.2 : 7.6, direction.z * launchSpeed * boostScale),
    spin: new THREE.Vector3(enemy.kind === "boss" ? 2.4 : 4.2, 0, playerRam ? 4.8 : 3.3),
    pieces: captureFlightPieces(group, enemy.id),
    baseScale: groupScale,
  };
}

function updateDeathFlight(flight: DeathFlightState, delta: number): boolean {
  flight.elapsed += delta;
  flight.velocity.y -= 14.5 * delta;
  flight.group.position.addScaledVector(flight.velocity, delta);
  flight.group.rotation.x += flight.spin.x * delta;
  flight.group.rotation.z += flight.spin.z * delta;
  flight.group.visible = true;

  const breakup = clamp((flight.elapsed - 0.18) / Math.max(0.01, flight.duration - 0.18), 0, 1);
  const spread = breakup * breakup;
  flight.pieces.forEach((piece, index) => {
    const distance = (0.45 + (index % 7) * 0.16) * (1 + spread * 3.6);
    piece.object.position.copy(piece.basePosition).addScaledVector(piece.direction, distance * spread);
    piece.object.rotation.x = piece.baseRotation.x + piece.spin.x * flight.elapsed * spread;
    piece.object.rotation.y = piece.baseRotation.y + piece.spin.y * flight.elapsed * spread;
    piece.object.rotation.z = piece.baseRotation.z + piece.spin.z * flight.elapsed * spread;
    const scale = 1 - Math.max(0, breakup - 0.72) * 0.72;
    piece.object.scale.copy(piece.baseScale).multiplyScalar(Math.max(0.18, scale));
  });

  if (flight.elapsed < flight.duration) return false;
  restoreFlight(flight);
  flight.group.visible = false;
  return true;
}

function patchDeathFlightPresentation(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase108Demo & Record<string, unknown>;
  if (prototype.__cartPhase108DeathFlightPatched__) return;
  prototype.__cartPhase108DeathFlightPatched__ = true;
  const previous = prototype.updateVisuals;
  prototype.updateVisuals = function phase108DeathFlightVisuals(this: Phase108Demo, delta: number): void {
    previous.call(this, delta);
    const snapshot = this.session.snapshot();
    const registry = flightRegistry(this);

    for (const enemy of snapshot.enemies) {
      const group = this.enemyGroups.get(enemy.id);
      if (!group) continue;
      const previousAlive = registry.previousAlive.get(enemy.id) ?? enemy.alive;
      if (previousAlive && !enemy.alive && !registry.flights.has(enemy.id)) {
        registry.flights.set(enemy.id, beginDeathFlight(group, enemy, snapshot));
      }
      if (enemy.alive) {
        const active = registry.flights.get(enemy.id);
        if (active) {
          restoreFlight(active);
          registry.flights.delete(enemy.id);
        }
      }
      registry.previousAlive.set(enemy.id, enemy.alive);
    }

    for (const [id, flight] of registry.flights) {
      if (updateDeathFlight(flight, clamp(delta, 0, 0.05))) registry.flights.delete(id);
    }
  };
}

export function installCartRoguePhase108CoreLoopRebuild(): void {
  setCartTurboHuntExternalProgressionEnabled(true);
  setCartTurboHuntFieldEventAutostartEnabled(false);
  patchSession();
  patchDeathFlightPresentation();
}

installCartRoguePhase108CoreLoopRebuild();
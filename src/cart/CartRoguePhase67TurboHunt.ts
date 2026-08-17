import * as THREE from "three";
import { RallyTrack } from "../rally/RallyTrack";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import type { CartEnemyArchetype, CartEnemyKind, CartEnemyState } from "./CartCombat";
import type { CartObstacleState } from "./CartObstacles";
import type { CartResourcePickupState } from "./CartResources";
import { getCartChainCombatState } from "./CartRoguePhase16Flow";
import { getCartPerfectStrikeState } from "./CartRoguePhase61PerfectStrike";
import { getCartPerfectShockwaveState } from "./CartRoguePhase62PerfectShockwave";
import { CartRogueCanvasPreview } from "./CartRogueCanvasPreview";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_TURBO_HUNT_FIELD, CART_TURBO_HUNT_TRACK } from "./CartTurboHuntTrack";
import {
  CART_WORLD_GRAPH,
  getActiveCartRunSeed,
  type CartWorldLocation,
  type CartWorldNode,
  type CartWorldNodeKind,
} from "./CartWorldGraph";

export type CartTurboHuntPhase = "drop-in" | "hunt" | "heat-up" | "elite-invasion" | "overdrive" | "boss-arrival" | "clear";
export type CartTurboHuntRegion = "DROP YARD" | "CROSSFIRE GARDEN" | "SMASH GARDEN" | "SPRINT LANE" | "CROWN GROUNDS";
export type CartTurboHuntObjectiveKind = "HUNT" | "FLOW" | "PERFECT" | "SMASH" | "ELITE";

export interface CartTurboHuntSnapshot {
  gameMode: "turbo-hunt";
  huntPhase: CartTurboHuntPhase;
  huntRegion: CartTurboHuntRegion;
  huntElapsedSeconds: number;
  huntHeat: number;
  huntHeatLevel: number;
  huntKills: number;
  huntObjectiveSerial: number;
  huntObjectiveKind: CartTurboHuntObjectiveKind;
  huntObjectiveLabel: string;
  huntObjectiveProgress: number;
  huntObjectiveTarget: number;
  huntOrdersCompleted: number;
  huntTargetEnemyId: string | null;
  huntTargetDistance: number;
  huntBossSpawned: boolean;
}

interface HuntObjective {
  serial: number;
  kind: CartTurboHuntObjectiveKind;
  label: string;
  progress: number;
  target: number;
}

interface TurboHuntState {
  enabled: boolean;
  elapsed: number;
  phase: CartTurboHuntPhase;
  heat: number;
  heatIdle: number;
  kills: number;
  ordersCompleted: number;
  objective: HuntObjective;
  randomState: number;
  spawnSerial: number;
  targetEnemyId: string | null;
  targetDistance: number;
  bossSpawned: boolean;
  previousAlive: Map<string, boolean>;
  enemyRespawn: Map<string, number>;
  spentBombers: Set<string>;
  previousDestroyed: Map<string, boolean>;
  obstacleRespawn: Map<string, number>;
  previousCollected: Map<string, boolean>;
  resourceRespawn: Map<string, number>;
  lastPerfectSerial: number;
  lastShockSerial: number;
  lastChainSerial: number;
  broadcastClock: number;
  broadcastReady: boolean;
}

interface MutableHuntSession {
  track: RallyTrack;
  car: CartArenaSession["car"] & { track: RallyTrack };
  enemies: CartEnemyState[];
  resources: CartResourcePickupState[];
  obstacles: CartObstacleState[];
  location: CartWorldLocation;
  gas: number;
  ramCombo: number;
  ramComboTimer: number;
  turboRechargeTimer: number;
  rewardTimer: number;
  lastReward: string | null;
  wallSlideTimer: number;
  rewardedNodes: Set<string>;
  enemyHitCooldowns: Map<string, number>;
  obstacleHitCooldowns: Map<string, number>;
  applyDriveProfile(kind: CartWorldNodeKind): void;
  step(input: RallyInputState, fixedDelta?: number): void;
  snapshot(): CartArenaSessionSnapshot;
}

interface HuntWebGLDemo {
  session: CartArenaSession;
  scene: THREE.Scene;
  enemyGroups: Map<string, THREE.Group>;
  enemyAlive: Map<string, boolean>;
  buildWorld(): void;
  buildEnemies(enemies: readonly CartArenaSessionSnapshot["enemies"]): void;
  updateVisuals(delta: number): void;
}

interface HuntCanvasDemo {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  session: CartArenaSession;
  draw(): void;
}

interface HuntVisualState {
  root: THREE.Group;
  targetMarker: THREE.Group;
  markerRing: THREE.Mesh;
  markerBeam: THREE.Mesh;
}

const huntStateBySession = new WeakMap<object, TurboHuntState>();
const visualStateByDemo = new WeakMap<object, HuntVisualState>();
let latestHuntSnapshot: CartTurboHuntSnapshot | null = null;

export const CART_TURBO_HUNT_SNAPSHOT_EVENT = "cart-turbo-hunt-snapshot";

const HUNT_NODE: CartWorldNode = {
  id: CART_TURBO_HUNT_FIELD.id,
  kind: "arena",
  rect: {
    centerX: CART_TURBO_HUNT_FIELD.centerX,
    centerZ: CART_TURBO_HUNT_FIELD.centerZ,
    halfWidth: CART_TURBO_HUNT_FIELD.halfWidth,
    halfDepth: CART_TURBO_HUNT_FIELD.halfDepth,
  },
  encounter: "combat",
  next: [],
  label: "TURBO HUNT",
  tier: 7,
  lane: "center",
  danger: 3,
  rewardHint: "CHAIN TARGETS",
};

const FIELD_MARGIN = 5.2;
const HUNT_MAX_SPEED = 22.5;
const HUNT_BOSS_MIN_SECONDS = 105;
const HUNT_BOSS_FALLBACK_SECONDS = 150;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function xorshift32(value: number): number {
  let x = value || 0x6d2b79f5;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x | 0;
}

function random01(state: TurboHuntState): number {
  state.randomState = xorshift32(state.randomState);
  return (state.randomState >>> 0) / 0xffffffff;
}

function initialObjective(): HuntObjective {
  return { serial: 1, kind: "HUNT", label: "DESTROY 6 TARGETS", progress: 0, target: 6 };
}

function stateFor(session: CartArenaSession | MutableHuntSession): TurboHuntState {
  const key = session as unknown as object;
  const current = huntStateBySession.get(key);
  if (current) return current;
  const created: TurboHuntState = {
    enabled: false,
    elapsed: 0,
    phase: "drop-in",
    heat: 0,
    heatIdle: 0,
    kills: 0,
    ordersCompleted: 0,
    objective: initialObjective(),
    randomState: getActiveCartRunSeed() ^ 0x6a09e667,
    spawnSerial: 0,
    targetEnemyId: null,
    targetDistance: 0,
    bossSpawned: false,
    previousAlive: new Map<string, boolean>(),
    enemyRespawn: new Map<string, number>(),
    spentBombers: new Set<string>(),
    previousDestroyed: new Map<string, boolean>(),
    obstacleRespawn: new Map<string, number>(),
    previousCollected: new Map<string, boolean>(),
    resourceRespawn: new Map<string, number>(),
    lastPerfectSerial: 0,
    lastShockSerial: 0,
    lastChainSerial: 0,
    broadcastClock: 0,
    broadcastReady: true,
  };
  huntStateBySession.set(key, created);
  return created;
}

function createEnemy(
  id: string,
  kind: CartEnemyKind,
  archetype: CartEnemyArchetype | undefined,
  hp: number,
  radius: number,
  speed: number,
): CartEnemyState {
  return {
    id,
    nodeId: HUNT_NODE.id,
    kind,
    archetype,
    x: CART_TURBO_HUNT_FIELD.centerX,
    z: CART_TURBO_HUNT_FIELD.centerZ,
    radius,
    maxHp: hp,
    hp,
    alive: false,
    heading: 0,
    moveSpeed: speed,
    aiClock: 0,
    chargeCooldown: archetype === "striker" ? 1.1 : undefined,
    chargeTime: archetype === "striker" ? 0 : undefined,
    armorSegments: kind === "boss" ? 3 : undefined,
    maxArmorSegments: kind === "boss" ? 3 : undefined,
    weakPointExposed: kind === "boss" ? false : undefined,
  };
}

export function createCartTurboHuntEnemyPool(): CartEnemyState[] {
  return [
    createEnemy("hunt-light-01", "blocker", undefined, 104, 1.72, 0),
    createEnemy("hunt-light-02", "blocker", undefined, 104, 1.72, 0),
    createEnemy("hunt-chaser-01", "chaser", "standard", 98, 1.68, 4.25),
    createEnemy("hunt-chaser-02", "chaser", "standard", 98, 1.68, 4.25),
    createEnemy("hunt-chaser-03", "chaser", "standard", 102, 1.7, 4.35),
    createEnemy("hunt-striker-01", "chaser", "striker", 90, 1.6, 5.0),
    createEnemy("hunt-striker-02", "chaser", "striker", 94, 1.62, 5.05),
    createEnemy("hunt-striker-03", "chaser", "striker", 96, 1.62, 5.1),
    createEnemy("hunt-orbiter-01", "chaser", "orbiter", 104, 1.66, 4.45),
    createEnemy("hunt-orbiter-02", "chaser", "orbiter", 108, 1.68, 4.5),
    createEnemy("hunt-drifter-01", "chaser", "drifter", 92, 1.6, 5.05),
    createEnemy("hunt-drifter-02", "chaser", "drifter", 96, 1.62, 5.1),
    createEnemy("hunt-bomber-01", "chaser", "bomber", 84, 1.58, 4.5),
    createEnemy("hunt-bomber-02", "chaser", "bomber", 86, 1.6, 4.55),
    createEnemy("hunt-bomber-03", "chaser", "bomber", 88, 1.6, 4.6),
    createEnemy("hunt-heavy-01", "heavy", undefined, 218, 2.35, 2.15),
    createEnemy("hunt-tank-01", "heavy", "tank", 248, 2.48, 1.9),
    createEnemy("hunt-heavy-02", "heavy", "tank", 258, 2.52, 1.92),
    createEnemy("hunt-boss", "boss", undefined, 620, 3.55, 2.95),
  ];
}

export function createCartTurboHuntObstacles(): CartObstacleState[] {
  const anchors = [
    [-68, -12], [-58, 4], [-70, 24], [-48, 34], [-38, 14], [-52, -34],
    [-24, 50], [18, -44], [42, -36], [58, 4], [44, 36], [12, 54],
  ] as const;
  return anchors.map(([x, z], index) => {
    const radius = 1.55 + (index % 3) * 0.22;
    return {
      id: `hunt-rock-${String(index + 1).padStart(2, "0")}`,
      nodeId: HUNT_NODE.id,
      kind: "rock" as const,
      x: CART_TURBO_HUNT_FIELD.centerX + x,
      z: CART_TURBO_HUNT_FIELD.centerZ + z,
      radius,
      scale: radius * 1.28,
      variant: (index % 3) as 0 | 1 | 2,
      destroyed: false,
    };
  });
}

export function createCartTurboHuntResources(): CartResourcePickupState[] {
  const anchors = [
    [0, -66, "turbo"], [-44, -42, "gas"], [48, -32, "turbo"], [-62, 42, "gas"], [56, 42, "turbo"], [0, 70, "gas"],
  ] as const;
  return anchors.map(([x, z, kind], index) => ({
    id: `hunt-${kind}-${index + 1}`,
    nodeId: HUNT_NODE.id,
    kind,
    x: CART_TURBO_HUNT_FIELD.centerX + x,
    z: CART_TURBO_HUNT_FIELD.centerZ + z,
    radius: 1.65,
    collected: false,
  }));
}

export function cartTurboHuntRegion(x: number, z: number): CartTurboHuntRegion {
  const localX = x - CART_TURBO_HUNT_FIELD.centerX;
  const localZ = z - CART_TURBO_HUNT_FIELD.centerZ;
  if (localZ < -38) return "DROP YARD";
  if (localZ > 40) return "CROWN GROUNDS";
  if (localX < -34) return "SMASH GARDEN";
  if (localX > 34) return "SPRINT LANE";
  return "CROSSFIRE GARDEN";
}

export function cartTurboHuntPhaseFor(
  elapsed: number,
  heat: number,
  ordersCompleted: number,
  bossSpawned: boolean,
  bossAlive: boolean,
): CartTurboHuntPhase {
  if (bossSpawned && !bossAlive) return "clear";
  if (bossSpawned) return "boss-arrival";
  if (elapsed < 7) return "drop-in";
  if (ordersCompleted >= 4 || heat >= 84 || elapsed >= 85) return "overdrive";
  if (ordersCompleted >= 3 || heat >= 65 || elapsed >= 60) return "elite-invasion";
  if (ordersCompleted >= 1 || heat >= 35 || elapsed >= 30) return "heat-up";
  return "hunt";
}

export function cartTurboHuntActiveTargetCount(phase: CartTurboHuntPhase): number {
  switch (phase) {
    case "drop-in": return 6;
    case "hunt": return 8;
    case "heat-up": return 10;
    case "elite-invasion": return 11;
    case "overdrive": return 13;
    case "boss-arrival": return 9;
    case "clear": return 0;
  }
}

export function cartTurboHuntShouldSpawnBoss(
  elapsed: number,
  kills: number,
  ordersCompleted: number,
  heat: number,
): boolean {
  return (elapsed >= HUNT_BOSS_MIN_SECONDS && kills >= 20 && ordersCompleted >= 4 && heat >= 52)
    || elapsed >= HUNT_BOSS_FALLBACK_SECONDS;
}

function ensureHuntNodeRegistered(): void {
  const nodes = CART_WORLD_GRAPH.nodes as CartWorldNode[];
  if (!nodes.some((node) => node.id === HUNT_NODE.id)) nodes.push(HUNT_NODE);
}

function resetHorizontalVelocity(session: MutableHuntSession): void {
  session.car.velocity.x = Math.sin(session.car.heading) * session.car.forwardVelocity;
  session.car.velocity.z = Math.cos(session.car.heading) * session.car.forwardVelocity;
  session.car.speed = Math.hypot(session.car.velocity.x, session.car.velocity.z);
}

function objectiveFor(ordersCompleted: number): HuntObjective {
  const cycle = Math.floor(ordersCompleted / 5);
  const sequence: readonly CartTurboHuntObjectiveKind[] = ["HUNT", "FLOW", "PERFECT", "SMASH", "ELITE"];
  const kind = sequence[ordersCompleted % sequence.length];
  const serial = ordersCompleted + 1;
  if (kind === "HUNT") {
    const target = 6 + Math.min(4, cycle * 2);
    return { serial, kind, target, progress: 0, label: `DESTROY ${target} TARGETS` };
  }
  if (kind === "FLOW") {
    const target = 4 + Math.min(2, cycle);
    return { serial, kind, target, progress: 0, label: `REACH FLOW ×${target}` };
  }
  if (kind === "PERFECT") return { serial, kind, target: 1, progress: 0, label: "LAND A PERFECT STRIKE" };
  if (kind === "SMASH") {
    const target = 3 + Math.min(2, cycle);
    return { serial, kind, target, progress: 0, label: `TURBO SMASH ${target} ROCKS` };
  }
  const target = 2 + Math.min(1, cycle);
  return { serial, kind, target, progress: 0, label: `BREAK ${target} HEAVY TARGETS` };
}

function setReward(session: MutableHuntSession, label: string, seconds = 1.45): void {
  session.lastReward = label;
  session.rewardTimer = Math.max(session.rewardTimer, seconds);
}

function addHeat(state: TurboHuntState, amount: number): void {
  state.heat = clamp(state.heat + amount, 0, 100);
  state.heatIdle = 0;
}

function completeObjective(session: MutableHuntSession, state: TurboHuntState): void {
  state.ordersCompleted += 1;
  addHeat(state, 10);
  session.gas = Math.min(1, session.gas + 0.05);
  session.turboRechargeTimer += 1.0;
  const before = session.car.boostCharges;
  session.car.addBoostCharge(1);
  setReward(session, session.car.boostCharges > before ? "HUNT ORDER CLEAR · TURBO +1" : "HUNT ORDER CLEAR · HEAT +10", 1.75);
  state.objective = objectiveFor(state.ordersCompleted);
}

function resetEnemyForSpawn(enemy: CartEnemyState, x: number, z: number, heading: number): void {
  enemy.x = x;
  enemy.z = z;
  enemy.heading = heading;
  enemy.hp = enemy.maxHp;
  enemy.alive = true;
  enemy.aiClock = 0;
  if (enemy.archetype === "striker") {
    enemy.chargeCooldown = 0.8 + (enemy.id.length % 5) * 0.14;
    enemy.chargeTime = 0;
  }
  if (enemy.kind === "boss") {
    enemy.armorSegments = 3;
    enemy.maxArmorSegments = 3;
    enemy.weakPointExposed = false;
    enemy.chargeCooldown = 1.5;
    enemy.chargeTime = 0;
  }
}

function safeSpawnPoint(
  session: MutableHuntSession,
  state: TurboHuntState,
  formationSlot: number,
): { x: number; z: number; heading: number } {
  const formation = state.spawnSerial % 5;
  const slot = formationSlot % 4;
  const forwardHeading = session.car.heading;
  let angleOffset = 0;
  let distance = 28;
  if (formation === 0) {
    angleOffset = (slot - 1.5) * 0.08;
    distance = 22 + slot * 7.5;
  } else if (formation === 1) {
    angleOffset = -0.72 + slot * 0.48;
    distance = 29 + Math.abs(slot - 1.5) * 3;
  } else if (formation === 2) {
    angleOffset = slot % 2 === 0 ? -0.62 : 0.62;
    distance = 24 + Math.floor(slot / 2) * 10;
  } else if (formation === 3) {
    angleOffset = -0.34 + slot * 0.23;
    distance = 27 + (slot % 2) * 5;
  } else {
    angleOffset = -0.9 + slot * 0.6;
    distance = 30 + (slot === 0 ? 7 : 0);
  }
  angleOffset += (random01(state) - 0.5) * 0.22;
  distance += (random01(state) - 0.5) * 4;

  let angle = forwardHeading + angleOffset;
  let x = session.car.position.x + Math.sin(angle) * distance;
  let z = session.car.position.z + Math.cos(angle) * distance;
  const minX = HUNT_NODE.rect.centerX - HUNT_NODE.rect.halfWidth + FIELD_MARGIN;
  const maxX = HUNT_NODE.rect.centerX + HUNT_NODE.rect.halfWidth - FIELD_MARGIN;
  const minZ = HUNT_NODE.rect.centerZ - HUNT_NODE.rect.halfDepth + FIELD_MARGIN;
  const maxZ = HUNT_NODE.rect.centerZ + HUNT_NODE.rect.halfDepth - FIELD_MARGIN;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    x = clamp(x, minX, maxX);
    z = clamp(z, minZ, maxZ);
    const farEnough = Math.hypot(x - session.car.position.x, z - session.car.position.z) >= 17;
    const separated = session.enemies.every((enemy) => !enemy.alive || Math.hypot(x - enemy.x, z - enemy.z) >= enemy.radius + 4.2);
    if (farEnough && separated) break;
    angle += 0.62 + attempt * 0.11;
    distance = 26 + attempt * 3;
    x = session.car.position.x + Math.sin(angle) * distance;
    z = session.car.position.z + Math.cos(angle) * distance;
  }

  const heading = normalizeAngle(Math.atan2(session.car.position.x - x, session.car.position.z - z) + (random01(state) - 0.5) * 1.1);
  return { x, z, heading };
}

function isSpawnEligible(enemy: CartEnemyState, state: TurboHuntState): boolean {
  if (enemy.alive || enemy.kind === "boss") return false;
  if ((state.enemyRespawn.get(enemy.id) ?? 0) > 0) return false;
  if (enemy.archetype === "bomber" && state.spentBombers.has(enemy.id)) return false;
  return true;
}

function chooseSpawnCandidate(session: MutableHuntSession, state: TurboHuntState): CartEnemyState | null {
  const candidates = session.enemies.filter((enemy) => isSpawnEligible(enemy, state));
  if (candidates.length === 0) return null;
  const needHeavy = (state.phase === "elite-invasion" || state.phase === "overdrive" || state.phase === "boss-arrival")
    && !session.enemies.some((enemy) => enemy.alive && enemy.kind === "heavy");
  if (needHeavy) {
    const heavy = candidates.find((enemy) => enemy.kind === "heavy");
    if (heavy) return heavy;
  }
  const bomberWanted = state.phase !== "drop-in" && state.spawnSerial % 7 === 4;
  if (bomberWanted) {
    const bomber = candidates.find((enemy) => enemy.archetype === "bomber");
    if (bomber) return bomber;
  }
  const index = Math.floor(random01(state) * candidates.length) % candidates.length;
  return candidates[index] ?? null;
}

function spawnSupportEnemy(session: MutableHuntSession, state: TurboHuntState, slot: number): boolean {
  const enemy = chooseSpawnCandidate(session, state);
  if (!enemy) return false;
  const point = safeSpawnPoint(session, state, slot);
  resetEnemyForSpawn(enemy, point.x, point.z, point.heading);
  state.previousAlive.set(enemy.id, true);
  state.spawnSerial += 1;
  return true;
}

function ensureTargetPopulation(session: MutableHuntSession, state: TurboHuntState): void {
  if (state.phase === "clear") return;
  const desired = cartTurboHuntActiveTargetCount(state.phase);
  let active = session.enemies.filter((enemy) => enemy.alive && enemy.kind !== "boss").length;
  let slot = 0;
  while (active < desired && slot < 20) {
    if (!spawnSupportEnemy(session, state, slot)) break;
    active += 1;
    slot += 1;
  }
}

function tickRecycleTimers(session: MutableHuntSession, state: TurboHuntState, delta: number): void {
  for (const [id, remaining] of [...state.enemyRespawn]) {
    const next = Math.max(0, remaining - delta);
    if (next <= 0) state.enemyRespawn.delete(id);
    else state.enemyRespawn.set(id, next);
  }
  for (const obstacle of session.obstacles) {
    if (!obstacle.destroyed) continue;
    const next = Math.max(0, (state.obstacleRespawn.get(obstacle.id) ?? 0) - delta);
    if (next <= 0) {
      obstacle.destroyed = false;
      state.obstacleRespawn.delete(obstacle.id);
      state.previousDestroyed.set(obstacle.id, false);
    } else state.obstacleRespawn.set(obstacle.id, next);
  }
  for (const resource of session.resources) {
    if (!resource.collected) continue;
    const next = Math.max(0, (state.resourceRespawn.get(resource.id) ?? 0) - delta);
    if (next <= 0) {
      resource.collected = false;
      state.resourceRespawn.delete(resource.id);
      state.previousCollected.set(resource.id, false);
    } else state.resourceRespawn.set(resource.id, next);
  }
}

function handleEnemyTransitions(session: MutableHuntSession, state: TurboHuntState): void {
  for (const enemy of session.enemies) {
    const wasAlive = state.previousAlive.get(enemy.id) ?? false;
    if (wasAlive && !enemy.alive) {
      if (enemy.kind === "boss") {
        addHeat(state, 20);
        setReward(session, "RAM TITAN DOWN · HUNT CLEAR", 4);
      } else {
        state.kills += 1;
        addHeat(state, enemy.kind === "heavy" ? 13 : enemy.archetype === "bomber" ? 10 : 7);
        state.enemyRespawn.set(enemy.id, enemy.kind === "heavy" ? 4.4 : 2.35 + random01(state) * 1.3);
        if (enemy.archetype === "bomber") state.spentBombers.add(enemy.id);
        if (state.objective.kind === "HUNT") state.objective.progress += 1;
        if (state.objective.kind === "ELITE" && enemy.kind === "heavy") state.objective.progress += 1;
      }
    }
    state.previousAlive.set(enemy.id, enemy.alive);
  }
}

function handleObstacleTransitions(session: MutableHuntSession, state: TurboHuntState): void {
  for (const obstacle of session.obstacles) {
    const wasDestroyed = state.previousDestroyed.get(obstacle.id) ?? obstacle.destroyed;
    if (!wasDestroyed && obstacle.destroyed) {
      addHeat(state, 2.5);
      state.obstacleRespawn.set(obstacle.id, 14 + random01(state) * 5);
      if (state.objective.kind === "SMASH") state.objective.progress += 1;
    }
    state.previousDestroyed.set(obstacle.id, obstacle.destroyed);
  }
  for (const resource of session.resources) {
    const wasCollected = state.previousCollected.get(resource.id) ?? resource.collected;
    if (!wasCollected && resource.collected) state.resourceRespawn.set(resource.id, 15 + random01(state) * 5);
    state.previousCollected.set(resource.id, resource.collected);
  }
}

function handleCombatSignals(session: MutableHuntSession, state: TurboHuntState): void {
  const typed = session as unknown as CartArenaSession;
  const perfect = getCartPerfectStrikeState(typed);
  if (perfect.perfectSerial > state.lastPerfectSerial) {
    state.lastPerfectSerial = perfect.perfectSerial;
    addHeat(state, 8);
    if (state.objective.kind === "PERFECT") state.objective.progress = state.objective.target;
  }
  const shock = getCartPerfectShockwaveState(typed);
  if (shock.shockSerial > state.lastShockSerial) {
    state.lastShockSerial = shock.shockSerial;
    if (shock.lastKOs > 0) addHeat(state, Math.min(8, shock.lastKOs * 2.5));
  }
  const chain = getCartChainCombatState(typed);
  if (chain.serial > state.lastChainSerial) {
    state.lastChainSerial = chain.serial;
    if (chain.combo >= 4) addHeat(state, 2 + Math.min(4, chain.combo * 0.35));
  }
  if (state.objective.kind === "FLOW") {
    state.objective.progress = Math.max(state.objective.progress, session.ramCombo, chain.combo);
  }
}

function selectPreferredTarget(session: MutableHuntSession, state: TurboHuntState): void {
  let best: CartEnemyState | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const enemy of session.enemies) {
    if (!enemy.alive) continue;
    const dx = enemy.x - session.car.position.x;
    const dz = enemy.z - session.car.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.5) continue;
    const angle = Math.abs(normalizeAngle(Math.atan2(dx, dz) - session.car.heading));
    const behindPenalty = angle > Math.PI * 0.65 ? 34 : angle > Math.PI * 0.42 ? 12 : 0;
    let relevance = 0;
    if (state.objective.kind === "ELITE" && enemy.kind === "heavy") relevance -= 18;
    if (state.phase === "boss-arrival" && enemy.kind === "boss") relevance -= 14;
    if (enemy.archetype === "bomber" && distance < 38) relevance -= 3;
    const score = distance + angle * 12 + behindPenalty + relevance;
    if (score < bestScore) {
      best = enemy;
      bestScore = score;
    }
  }
  state.targetEnemyId = best?.id ?? null;
  state.targetDistance = best ? Math.hypot(best.x - session.car.position.x, best.z - session.car.position.z) : 0;
}

function spawnBoss(session: MutableHuntSession, state: TurboHuntState): void {
  if (state.bossSpawned) return;
  const boss = session.enemies.find((enemy) => enemy.kind === "boss");
  if (!boss) return;
  state.bossSpawned = true;
  resetEnemyForSpawn(
    boss,
    CART_TURBO_HUNT_FIELD.centerX,
    CART_TURBO_HUNT_FIELD.centerZ + 62,
    Math.PI,
  );
  state.previousAlive.set(boss.id, true);
  addHeat(state, 8);
  setReward(session, "RAM TITAN INBOUND · KEEP THE FLOW ALIVE", 3.2);
}

function updateDirector(session: MutableHuntSession, state: TurboHuntState, delta: number): void {
  state.elapsed += delta;
  state.heatIdle += delta;
  if (state.heatIdle > 3.5 && !state.bossSpawned) state.heat = Math.max(0, state.heat - delta * 2.8);

  handleEnemyTransitions(session, state);
  handleObstacleTransitions(session, state);
  handleCombatSignals(session, state);

  if (state.objective.progress >= state.objective.target) completeObjective(session, state);

  if (!state.bossSpawned && cartTurboHuntShouldSpawnBoss(state.elapsed, state.kills, state.ordersCompleted, state.heat)) {
    spawnBoss(session, state);
  }
  const boss = session.enemies.find((enemy) => enemy.kind === "boss");
  state.phase = cartTurboHuntPhaseFor(state.elapsed, state.heat, state.ordersCompleted, state.bossSpawned, Boolean(boss?.alive));
  selectPreferredTarget(session, state);
  state.broadcastClock += delta;
  if (state.broadcastClock >= 0.1) {
    state.broadcastClock %= 0.1;
    state.broadcastReady = true;
  }
}

function installHuntDriveProfile(session: MutableHuntSession): void {
  const original = session.applyDriveProfile.bind(session);
  session.applyDriveProfile = (_kind: CartWorldNodeKind): void => {
    original("arena");
    session.car.definition.maxSpeed = HUNT_MAX_SPEED;
    session.car.definition.handling *= 1.025;
  };
}

export function enableCartTurboHunt(session: CartArenaSession): void {
  const raw = session as unknown as MutableHuntSession;
  const state = stateFor(raw);
  if (state.enabled) return;
  state.enabled = true;
  ensureHuntNodeRegistered();

  const oldTrack = raw.track;
  const huntTrack = new RallyTrack(CART_TURBO_HUNT_TRACK);
  raw.track = huntTrack;
  raw.car.track = huntTrack;
  oldTrack.dispose();
  raw.car.reset();
  raw.car.position.x = CART_TURBO_HUNT_FIELD.spawnX;
  raw.car.position.z = CART_TURBO_HUNT_FIELD.spawnZ;
  raw.car.heading = 0;
  raw.car.forwardVelocity = 0;
  raw.car.lateralVelocity = 0;
  resetHorizontalVelocity(raw);
  raw.location = {
    node: HUNT_NODE,
    localX: raw.car.position.x - HUNT_NODE.rect.centerX,
    localZ: raw.car.position.z - HUNT_NODE.rect.centerZ,
  };

  raw.enemies.splice(0, raw.enemies.length, ...createCartTurboHuntEnemyPool());
  raw.resources.splice(0, raw.resources.length, ...createCartTurboHuntResources());
  raw.obstacles.splice(0, raw.obstacles.length, ...createCartTurboHuntObstacles());
  raw.gas = 1;
  raw.ramCombo = 0;
  raw.ramComboTimer = 0;
  raw.turboRechargeTimer = 0;
  raw.rewardTimer = 0;
  raw.lastReward = null;
  raw.wallSlideTimer = 0;
  raw.enemyHitCooldowns.clear();
  raw.obstacleHitCooldowns.clear();
  raw.rewardedNodes.add(HUNT_NODE.id);
  installHuntDriveProfile(raw);

  state.phase = "drop-in";
  state.objective = initialObjective();
  ensureTargetPopulation(raw, state);
  raw.enemies.forEach((enemy) => state.previousAlive.set(enemy.id, enemy.alive));
  raw.obstacles.forEach((obstacle) => state.previousDestroyed.set(obstacle.id, obstacle.destroyed));
  raw.resources.forEach((resource) => state.previousCollected.set(resource.id, resource.collected));
  state.lastPerfectSerial = getCartPerfectStrikeState(session).perfectSerial;
  state.lastShockSerial = getCartPerfectShockwaveState(session).shockSerial;
  state.lastChainSerial = getCartChainCombatState(session).serial;
  selectPreferredTarget(raw, state);
}

export function isCartTurboHuntEnabled(session: CartArenaSession): boolean {
  return stateFor(session).enabled;
}

function makeHuntSnapshot(session: MutableHuntSession, state: TurboHuntState): CartTurboHuntSnapshot {
  return {
    gameMode: "turbo-hunt",
    huntPhase: state.phase,
    huntRegion: cartTurboHuntRegion(session.car.position.x, session.car.position.z),
    huntElapsedSeconds: state.elapsed,
    huntHeat: state.heat,
    huntHeatLevel: Math.min(5, 1 + Math.floor(state.heat / 20)),
    huntKills: state.kills,
    huntObjectiveSerial: state.objective.serial,
    huntObjectiveKind: state.objective.kind,
    huntObjectiveLabel: state.objective.label,
    huntObjectiveProgress: Math.min(state.objective.target, state.objective.progress),
    huntObjectiveTarget: state.objective.target,
    huntOrdersCompleted: state.ordersCompleted,
    huntTargetEnemyId: state.targetEnemyId,
    huntTargetDistance: state.targetDistance,
    huntBossSpawned: state.bossSpawned,
  };
}

export function getCartTurboHuntSnapshot(session: CartArenaSession): CartTurboHuntSnapshot | null {
  const raw = session as unknown as MutableHuntSession;
  const state = stateFor(raw);
  return state.enabled ? makeHuntSnapshot(raw, state) : null;
}

export function getLatestCartTurboHuntSnapshot(): CartTurboHuntSnapshot | null {
  return latestHuntSnapshot ? { ...latestHuntSnapshot } : null;
}

function broadcastHuntSnapshot(snapshot: CartTurboHuntSnapshot): void {
  latestHuntSnapshot = { ...snapshot };
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CartTurboHuntSnapshot>(CART_TURBO_HUNT_SNAPSHOT_EVENT, { detail: snapshot }));
}

function huntSnapshotOverride(
  session: MutableHuntSession,
  base: CartArenaSessionSnapshot,
  state: TurboHuntState,
): CartArenaSessionSnapshot {
  const boss = session.enemies.find((enemy) => enemy.kind === "boss");
  const bossAlive = Boolean(state.bossSpawned && boss?.alive);
  const active = session.enemies.filter((enemy) => enemy.alive).length;
  const hunt = makeHuntSnapshot(session, state);
  Object.assign(base, {
    nodeId: HUNT_NODE.id,
    nodeKind: bossAlive ? "boss" : "arena",
    encounter: bossAlive ? "boss" : "combat",
    gateLocked: false,
    arena1GateLocked: false,
    arena2GateLocked: false,
    enemiesAlive: active,
    enemiesTotal: session.enemies.length,
    bossHp: state.bossSpawned ? boss?.hp ?? 0 : 0,
    bossMaxHp: state.bossSpawned ? boss?.maxHp ?? 0 : 0,
    runComplete: state.phase === "clear",
    ...hunt,
  });
  if (state.broadcastReady) {
    state.broadcastReady = false;
    broadcastHuntSnapshot(hunt);
  }
  return base;
}

function addBox(
  root: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  color: number,
  emissive = 0,
): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.86,
    metalness: 0.02,
    flatShading: true,
    emissive: emissive || 0x000000,
    emissiveIntensity: emissive ? 0.7 : 0,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function buildHuntVisualWorld(demo: HuntWebGLDemo): HuntVisualState {
  const root = new THREE.Group();
  root.name = "phase67-turbo-hunt-world";
  const cx = CART_TURBO_HUNT_FIELD.centerX;
  const cz = CART_TURBO_HUNT_FIELD.centerZ;
  const hw = CART_TURBO_HUNT_FIELD.halfWidth;
  const hd = CART_TURBO_HUNT_FIELD.halfDepth;

  addBox(root, [hw * 2, 0.32, hd * 2], [cx, -0.24, cz], 0xdeb77e);
  addBox(root, [hw * 1.92, 0.035, 34], [cx, -0.045, cz - 66], 0xc9d8a0);
  addBox(root, [48, 0.04, 110], [cx - 62, -0.035, cz + 2], 0xb9cd86);
  addBox(root, [48, 0.04, 110], [cx + 62, -0.035, cz + 2], 0xd8c58c);
  addBox(root, [82, 0.045, 82], [cx, -0.025, cz], 0xe7c68f);
  addBox(root, [hw * 1.92, 0.04, 34], [cx, -0.035, cz + 66], 0xc8abd9);

  const boundaryMaterial = new THREE.MeshStandardMaterial({ color: 0xf1eadb, roughness: 0.78, flatShading: true });
  const postGeometry = new THREE.BoxGeometry(1.05, 3.2, 1.05);
  const posts: Array<{ x: number; z: number }> = [];
  const step = 9.5;
  for (let x = -hw; x <= hw; x += step) {
    posts.push({ x: cx + x, z: cz - hd }, { x: cx + x, z: cz + hd });
  }
  for (let z = -hd + step; z < hd; z += step) {
    posts.push({ x: cx - hw, z: cz + z }, { x: cx + hw, z: cz + z });
  }
  const postMesh = new THREE.InstancedMesh(postGeometry, boundaryMaterial, posts.length);
  const dummy = new THREE.Object3D();
  posts.forEach((post, index) => {
    dummy.position.set(post.x, 1.6, post.z);
    dummy.rotation.set(0, (index % 3 - 1) * 0.08, 0);
    dummy.scale.set(1, index % 4 === 0 ? 1.35 : 1, 1);
    dummy.updateMatrix();
    postMesh.setMatrixAt(index, dummy.matrix);
  });
  postMesh.instanceMatrix.needsUpdate = true;
  root.add(postMesh);

  const landmarkColors = [0x7ac9c0, 0xe798b9, 0x73b4d8, 0xe2cf72, 0xa78ad0];
  const landmarks = [
    [cx, cz - 72], [cx - 65, cz + 5], [cx + 65, cz + 5], [cx, cz], [cx, cz + 72],
  ] as const;
  landmarks.forEach(([x, z], index) => {
    const color = landmarkColors[index];
    for (const side of [-1, 1]) addBox(root, [1.5, 7 + index * 0.5, 1.5], [x + side * 7, 3.5 + index * 0.25, z], color);
    const beam = addBox(root, [15.5, 0.72, 1.4], [x, 7.1 + index * 0.5, z], 0xf5eee2);
    const material = beam.material as THREE.MeshStandardMaterial;
    material.emissive.setHex(color);
    material.emissiveIntensity = 0.18;
  });

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(360, 20, 10),
    new THREE.MeshBasicMaterial({ color: 0x9ed7ff, side: THREE.BackSide, depthWrite: false }),
  );
  sky.position.set(cx, 36, cz);
  root.add(sky);

  demo.scene.add(root);

  let firstDirectional = true;
  demo.scene.traverse((object) => {
    if (!(object instanceof THREE.DirectionalLight) || !firstDirectional) return;
    firstDirectional = false;
    object.position.set(cx - 46, 66, cz - 32);
    object.target.position.set(cx, 0, cz);
    if (!object.target.parent) demo.scene.add(object.target);
    object.shadow.camera.left = -110;
    object.shadow.camera.right = 110;
    object.shadow.camera.top = 110;
    object.shadow.camera.bottom = -110;
    object.shadow.camera.far = 220;
  });

  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x72efff, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false });
  const targetMarker = new THREE.Group();
  targetMarker.name = "turbo-hunt-target-marker";
  const markerRing = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.13, 6, 24), markerMaterial);
  markerRing.rotation.x = Math.PI / 2;
  markerRing.position.y = 0.18;
  const markerBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.28, 4.2, 6), markerMaterial);
  markerBeam.position.y = 3.0;
  const chevron = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), markerMaterial);
  chevron.position.y = 5.25;
  targetMarker.add(markerRing, markerBeam, chevron);
  targetMarker.visible = false;
  demo.scene.add(targetMarker);

  const created = { root, targetMarker, markerRing, markerBeam };
  visualStateByDemo.set(demo as unknown as object, created);
  return created;
}

function updateTargetMarker(demo: HuntWebGLDemo, delta: number): void {
  const visual = visualStateByDemo.get(demo as unknown as object);
  if (!visual) return;
  const hunt = getCartTurboHuntSnapshot(demo.session);
  if (!hunt?.huntTargetEnemyId) {
    visual.targetMarker.visible = false;
    return;
  }
  const enemy = demo.session.enemies.find((candidate) => candidate.id === hunt.huntTargetEnemyId && candidate.alive);
  if (!enemy) {
    visual.targetMarker.visible = false;
    return;
  }
  visual.targetMarker.visible = true;
  visual.targetMarker.position.set(enemy.x, 0, enemy.z);
  visual.targetMarker.rotation.y += delta * 1.8;
  const heatScale = 0.94 + hunt.huntHeat / 100 * 0.22;
  visual.markerRing.scale.setScalar(heatScale);
  visual.markerBeam.scale.y = 0.9 + Math.sin(hunt.huntElapsedSeconds * 5) * 0.12;
}

function drawHuntCanvas(demo: HuntCanvasDemo): void {
  const ctx = demo.context;
  const width = demo.canvas.clientWidth || demo.canvas.width;
  const height = demo.canvas.clientHeight || demo.canvas.height;
  const base = demo.session.snapshot();
  const hunt = getCartTurboHuntSnapshot(demo.session);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#a9dcf2";
  ctx.fillRect(0, 0, width, height);
  if (!hunt) return;

  const scale = Math.min(width / 112, height / 80);
  const centerX = width * 0.5;
  const centerY = height * 0.62;
  const worldToScreen = (x: number, z: number) => ({ x: centerX + (x - base.x) * scale, y: centerY - (z - base.z) * scale });
  const field = worldToScreen(CART_TURBO_HUNT_FIELD.centerX, CART_TURBO_HUNT_FIELD.centerZ);
  ctx.fillStyle = "#dfbb82";
  ctx.fillRect(field.x - CART_TURBO_HUNT_FIELD.halfWidth * scale, field.y - CART_TURBO_HUNT_FIELD.halfDepth * scale, CART_TURBO_HUNT_FIELD.halfWidth * 2 * scale, CART_TURBO_HUNT_FIELD.halfDepth * 2 * scale);

  const patches = [
    [0, -66, 176, 34, "#c8d99e"], [-62, 2, 46, 108, "#b6cf84"], [62, 2, 46, 108, "#dcc892"], [0, 0, 80, 80, "#e9ca93"], [0, 66, 176, 34, "#c9adde"],
  ] as const;
  for (const [x, z, w, d, color] of patches) {
    const p = worldToScreen(CART_TURBO_HUNT_FIELD.centerX + x, CART_TURBO_HUNT_FIELD.centerZ + z);
    ctx.fillStyle = color;
    ctx.fillRect(p.x - w * 0.5 * scale, p.y - d * 0.5 * scale, w * scale, d * scale);
  }

  ctx.strokeStyle = "rgba(255,255,255,.82)";
  ctx.lineWidth = Math.max(1.5, scale * 0.18);
  ctx.strokeRect(field.x - CART_TURBO_HUNT_FIELD.halfWidth * scale, field.y - CART_TURBO_HUNT_FIELD.halfDepth * scale, CART_TURBO_HUNT_FIELD.halfWidth * 2 * scale, CART_TURBO_HUNT_FIELD.halfDepth * 2 * scale);

  for (const obstacle of base.obstacles) {
    if (obstacle.destroyed) continue;
    const p = worldToScreen(obstacle.x, obstacle.z);
    ctx.fillStyle = obstacle.variant === 0 ? "#b9b3aa" : obstacle.variant === 1 ? "#c9c2b7" : "#a9a49c";
    ctx.beginPath();
    ctx.arc(p.x, p.y, obstacle.radius * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#64d9ed";
    ctx.stroke();
  }

  for (const resource of base.resources) {
    if (resource.collected) continue;
    const p = worldToScreen(resource.x, resource.z);
    ctx.fillStyle = resource.kind === "turbo" ? "#4bc9ee" : "#ef6a79";
    ctx.fillRect(p.x - 0.8 * scale, p.y - 0.8 * scale, 1.6 * scale, 1.6 * scale);
  }

  for (const enemy of base.enemies) {
    if (!enemy.alive) continue;
    const p = worldToScreen(enemy.x, enemy.z);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(enemy.heading);
    ctx.fillStyle = enemy.kind === "boss" ? "#4b4059" : enemy.kind === "heavy" ? "#8e7699" : enemy.kind === "chaser" ? "#86c96d" : "#e0d35e";
    ctx.fillRect(-enemy.radius * scale, -enemy.radius * scale, enemy.radius * 2 * scale, enemy.radius * 2 * scale);
    ctx.restore();
    if (enemy.id === hunt.huntTargetEnemyId) {
      ctx.strokeStyle = "#6cecff";
      ctx.lineWidth = Math.max(2, scale * 0.3);
      ctx.beginPath();
      ctx.arc(p.x, p.y, (enemy.radius + 1.25) * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(base.heading);
  ctx.fillStyle = base.boostActive ? "#35c8d6" : "#2aa6a0";
  ctx.fillRect(-1.35 * scale, -2.05 * scale, 2.7 * scale, 4.1 * scale);
  ctx.fillStyle = "#eef3e8";
  ctx.fillRect(-0.82 * scale, -0.4 * scale, 1.64 * scale, 1.35 * scale);
  ctx.restore();
}

export function installCartRoguePhase67TurboHunt(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as MutableHuntSession;
  const previousStep = sessionPrototype.step;
  sessionPrototype.step = function turboHuntStep(this: MutableHuntSession, input: RallyInputState, fixedDelta = 1 / 60): void {
    const state = stateFor(this);
    if (!state.enabled) {
      previousStep.call(this, input, fixedDelta);
      return;
    }
    const delta = clamp(fixedDelta, 0, 0.05);
    tickRecycleTimers(this, state, delta);
    ensureTargetPopulation(this, state);
    previousStep.call(this, input, fixedDelta);
    updateDirector(this, state, delta);
    ensureTargetPopulation(this, state);
  };

  const previousSnapshot = sessionPrototype.snapshot;
  sessionPrototype.snapshot = function turboHuntSnapshot(this: MutableHuntSession): CartArenaSessionSnapshot {
    const base = previousSnapshot.call(this);
    const state = stateFor(this);
    return state.enabled ? huntSnapshotOverride(this, base, state) : base;
  };

  const webglPrototype = CartRogueWebGLDemo.prototype as unknown as HuntWebGLDemo;
  const previousBuildWorld = webglPrototype.buildWorld;
  webglPrototype.buildWorld = function turboHuntBuildWorld(this: HuntWebGLDemo): void {
    previousBuildWorld.call(this);
    enableCartTurboHunt(this.session);
    buildHuntVisualWorld(this);
  };

  const previousBuildEnemies = webglPrototype.buildEnemies;
  webglPrototype.buildEnemies = function turboHuntBuildEnemies(this: HuntWebGLDemo, enemies: readonly CartArenaSessionSnapshot["enemies"]): void {
    previousBuildEnemies.call(this, enemies);
    if (!isCartTurboHuntEnabled(this.session)) return;
    for (const enemy of enemies) {
      const group = this.enemyGroups.get(enemy.id);
      if (!group) continue;
      group.visible = enemy.alive;
      group.position.set(enemy.x, 0, enemy.z);
      group.rotation.y = enemy.heading;
      group.userData.huntWasAlive = enemy.alive;
      this.enemyAlive.set(enemy.id, enemy.alive);
    }
  };

  const previousUpdateVisuals = webglPrototype.updateVisuals;
  webglPrototype.updateVisuals = function turboHuntUpdateVisuals(this: HuntWebGLDemo, delta: number): void {
    if (isCartTurboHuntEnabled(this.session)) {
      for (const enemy of this.session.enemies) {
        const group = this.enemyGroups.get(enemy.id);
        if (!group) continue;
        const wasAlive = Boolean(group.userData.huntWasAlive);
        if (!wasAlive && enemy.alive) {
          group.position.set(enemy.x, 0, enemy.z);
          group.rotation.y = enemy.heading;
          group.userData.lastX = enemy.x;
          group.userData.lastZ = enemy.z;
        }
      }
    }
    previousUpdateVisuals.call(this, delta);
    if (!isCartTurboHuntEnabled(this.session)) return;
    updateTargetMarker(this, delta);
    for (const enemy of this.session.enemies) {
      const group = this.enemyGroups.get(enemy.id);
      if (group) group.userData.huntWasAlive = enemy.alive;
    }
  };

  const canvasPrototype = CartRogueCanvasPreview.prototype as unknown as HuntCanvasDemo;
  const previousCanvasDraw = canvasPrototype.draw;
  canvasPrototype.draw = function turboHuntCanvasDraw(this: HuntCanvasDemo): void {
    if (!isCartTurboHuntEnabled(this.session)) enableCartTurboHunt(this.session);
    if (!isCartTurboHuntEnabled(this.session)) {
      previousCanvasDraw.call(this);
      return;
    }
    drawHuntCanvas(this);
  };
}

installCartRoguePhase67TurboHunt();

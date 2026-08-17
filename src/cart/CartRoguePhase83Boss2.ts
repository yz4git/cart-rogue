import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import type { CartEnemyState } from "./CartCombat";
import type { CartResourcePickupState } from "./CartResources";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { getCartTurboHuntSnapshot, isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { CART_TURBO_HUNT_FIELD } from "./CartTurboHuntTrack";

export type CartTitanStage = "ARMORED" | "BREAKOUT" | "FURY" | "DOWN";

export interface CartTitanBossSnapshot {
  bossActive: boolean;
  stage: CartTitanStage;
  stageSerial: number;
  hpRatio: number;
  armorSegments: number;
  maxArmorSegments: number;
  vulnerable: boolean;
  vulnerabilitySeconds: number;
  chargeTelegraph: number;
  supportWaveSerial: number;
  turboDropSerial: number;
}

interface InternalBossState extends CartTitanBossSnapshot {
  initialized: boolean;
  supportCooldown: number;
  turboDropCooldown: number;
  previousChargeTime: number;
  broadcastClock: number;
}

interface Phase83Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  resources: CartResourcePickupState[];
  gas: number;
  rewardTimer: number;
  lastReward: string | null;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface Phase83Demo {
  session: CartArenaSession;
  enemyGroups: Map<string, THREE.Group>;
  buildEnemies(enemies: CartArenaSessionSnapshot["enemies"]): void;
  updateVisuals(delta: number): void;
}

interface TitanVisualState {
  root: THREE.Group;
  armorRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
  weakCore: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshStandardMaterial>;
  telegraphRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  armorPips: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[];
}

const stateBySession = new WeakMap<object, InternalBossState>();
const visualByDemo = new WeakMap<object, TitanVisualState>();
let latestBossSnapshot: CartTitanBossSnapshot | null = null;

export const CART_TITAN_BOSS_SNAPSHOT_EVENT = "cart-titan-boss-snapshot";
export const CART_TITAN_MAX_HP = 820;
export const CART_TITAN_MAX_ARMOR = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function cartTitanStageFor(hp: number, maxHp: number): CartTitanStage {
  if (hp <= 0) return "DOWN";
  const ratio = hp / Math.max(1, maxHp);
  if (ratio > 0.68) return "ARMORED";
  if (ratio > 0.34) return "BREAKOUT";
  return "FURY";
}

function internalState(session: CartArenaSession | Phase83Session): InternalBossState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalBossState = {
    bossActive: false,
    stage: "ARMORED",
    stageSerial: 0,
    hpRatio: 1,
    armorSegments: 0,
    maxArmorSegments: CART_TITAN_MAX_ARMOR,
    vulnerable: false,
    vulnerabilitySeconds: 0,
    chargeTelegraph: 0,
    supportWaveSerial: 0,
    turboDropSerial: 0,
    initialized: false,
    supportCooldown: 5.5,
    turboDropCooldown: 4.5,
    previousChargeTime: 0,
    broadcastClock: 0,
  };
  stateBySession.set(key, created);
  return created;
}

function snapshotOf(state: InternalBossState): CartTitanBossSnapshot {
  return {
    bossActive: state.bossActive,
    stage: state.stage,
    stageSerial: state.stageSerial,
    hpRatio: state.hpRatio,
    armorSegments: state.armorSegments,
    maxArmorSegments: state.maxArmorSegments,
    vulnerable: state.vulnerable,
    vulnerabilitySeconds: state.vulnerabilitySeconds,
    chargeTelegraph: state.chargeTelegraph,
    supportWaveSerial: state.supportWaveSerial,
    turboDropSerial: state.turboDropSerial,
  };
}

export function getCartTitanBossState(session: CartArenaSession): CartTitanBossSnapshot {
  return snapshotOf(internalState(session));
}

export function getLatestCartTitanBossState(): CartTitanBossSnapshot | null {
  return latestBossSnapshot ? { ...latestBossSnapshot } : null;
}

function broadcast(state: InternalBossState): void {
  const snapshot = snapshotOf(state);
  latestBossSnapshot = snapshot;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CartTitanBossSnapshot>(CART_TITAN_BOSS_SNAPSHOT_EVENT, { detail: snapshot }));
  }
}

function setReward(session: Phase83Session, message: string, seconds = 2): void {
  session.lastReward = message;
  session.rewardTimer = Math.max(session.rewardTimer, seconds);
}

function initializeBoss(session: Phase83Session, state: InternalBossState, boss: CartEnemyState): void {
  if (state.initialized) return;
  state.initialized = true;
  boss.maxHp = Math.max(CART_TITAN_MAX_HP, boss.maxHp);
  boss.hp = boss.maxHp;
  boss.maxArmorSegments = CART_TITAN_MAX_ARMOR;
  boss.armorSegments = CART_TITAN_MAX_ARMOR;
  boss.weakPointExposed = false;
  boss.moveSpeed = Math.max(3.08, boss.moveSpeed);
  boss.chargeCooldown = 1.35;
  boss.chargeTime = 0;
  state.stage = "ARMORED";
  state.stageSerial = 1;
  state.supportCooldown = 5.5;
  state.turboDropCooldown = 4.8;
  state.previousChargeTime = 0;
  setReward(session, "RAM TITAN · BREAK FOUR ARMOR PLATES", 2.6);
}

function fieldPoint(x: number, z: number, margin = 8): { x: number; z: number } {
  return {
    x: clamp(x, CART_TURBO_HUNT_FIELD.centerX - CART_TURBO_HUNT_FIELD.halfWidth + margin, CART_TURBO_HUNT_FIELD.centerX + CART_TURBO_HUNT_FIELD.halfWidth - margin),
    z: clamp(z, CART_TURBO_HUNT_FIELD.centerZ - CART_TURBO_HUNT_FIELD.halfDepth + margin, CART_TURBO_HUNT_FIELD.centerZ + CART_TURBO_HUNT_FIELD.halfDepth - margin),
  };
}

function deploySupportWave(session: Phase83Session, state: InternalBossState, boss: CartEnemyState, count: number): void {
  const dead = session.enemies.filter((enemy) => !enemy.alive && enemy.kind !== "boss" && enemy.archetype !== "bomber");
  const fallback = session.enemies.filter((enemy) => enemy.alive && enemy.kind !== "boss" && enemy.archetype !== "bomber");
  const candidates = [...dead, ...fallback].slice(0, count);
  if (candidates.length === 0) return;
  const angles = [-0.9, 0.9, Math.PI, 0];
  candidates.forEach((enemy, index) => {
    const angle = boss.heading + angles[index % angles.length];
    const radius = 10 + index * 2.6;
    const point = fieldPoint(boss.x + Math.sin(angle) * radius, boss.z + Math.cos(angle) * radius);
    enemy.x = point.x;
    enemy.z = point.z;
    enemy.heading = Math.atan2(session.car.position.x - enemy.x, session.car.position.z - enemy.z);
    enemy.aiClock = 0;
    enemy.chargeTime = 0;
    if (!enemy.alive) {
      enemy.hp = Math.max(1, Math.round(enemy.maxHp * (state.stage === "FURY" ? 0.82 : 0.7)));
      enemy.alive = true;
    }
  });
  state.supportWaveSerial += 1;
  setReward(session, state.stage === "FURY" ? "TITAN FURY · FUEL WAVE INBOUND" : "TITAN BREAKOUT · SUPPORT WAVE", 1.35);
}

function dropTurboFuel(session: Phase83Session, state: InternalBossState): void {
  const turboCells = session.resources.filter((resource) => resource.kind === "turbo");
  if (turboCells.length === 0) return;
  const heading = session.car.heading;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  const lanes = [-4.2, 0, 4.2];
  turboCells.slice(0, 3).forEach((resource: CartResourcePickupState, index) => {
    const forward = 10 + index * 7;
    const lateral = lanes[index];
    const point = fieldPoint(
      session.car.position.x + fx * forward + rx * lateral,
      session.car.position.z + fz * forward + rz * lateral,
    );
    resource.x = point.x;
    resource.z = point.z;
    resource.collected = false;
  });
  state.turboDropSerial += 1;
}

function applyStageTransition(session: Phase83Session, state: InternalBossState, boss: CartEnemyState, next: CartTitanStage): void {
  if (state.stage === next) return;
  state.stage = next;
  state.stageSerial += 1;
  state.vulnerabilitySeconds = 0;

  if (next === "BREAKOUT") {
    boss.armorSegments = Math.max(boss.armorSegments ?? 0, 2);
    boss.maxArmorSegments = CART_TITAN_MAX_ARMOR;
    boss.weakPointExposed = false;
    boss.moveSpeed = Math.max(boss.moveSpeed, 3.42);
    boss.chargeCooldown = Math.min(boss.chargeCooldown ?? 1.2, 1.15);
    state.supportCooldown = 0.45;
    state.turboDropCooldown = 4.0;
    setReward(session, "TITAN PHASE 2 · BREAKOUT", 2.2);
  } else if (next === "FURY") {
    boss.armorSegments = 0;
    boss.weakPointExposed = true;
    boss.moveSpeed = Math.max(boss.moveSpeed, 3.82);
    boss.chargeCooldown = Math.min(boss.chargeCooldown ?? 0.9, 0.82);
    state.supportCooldown = 0.35;
    state.turboDropCooldown = 0.4;
    state.vulnerabilitySeconds = 2.2;
    setReward(session, "TITAN PHASE 3 · FURY · CORE EXPOSED", 2.6);
  } else if (next === "DOWN") {
    setReward(session, "RAM TITAN DOWN · TURBO HUNT CLEAR", 4);
  }
}

function updateBoss(session: Phase83Session, state: InternalBossState, boss: CartEnemyState, delta: number): void {
  initializeBoss(session, state, boss);
  const nextStage = cartTitanStageFor(boss.hp, boss.maxHp);
  applyStageTransition(session, state, boss, nextStage);
  state.bossActive = boss.alive;
  state.hpRatio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);

  if (!boss.alive) {
    state.stage = "DOWN";
    state.armorSegments = 0;
    state.vulnerable = false;
    state.vulnerabilitySeconds = 0;
    state.chargeTelegraph = 0;
    return;
  }

  const chargeTime = Math.max(0, boss.chargeTime ?? 0);
  if (state.previousChargeTime > 0 && chargeTime <= 0) {
    state.vulnerabilitySeconds = Math.max(state.vulnerabilitySeconds, state.stage === "FURY" ? 2.15 : 1.45);
  }
  state.previousChargeTime = chargeTime;
  state.chargeTelegraph = clamp(chargeTime / (state.stage === "FURY" ? 0.72 : state.stage === "BREAKOUT" ? 0.62 : 0.52), 0, 1);
  state.vulnerabilitySeconds = Math.max(0, state.vulnerabilitySeconds - delta);

  const armor = Math.max(0, boss.armorSegments ?? 0);
  state.armorSegments = armor;
  state.maxArmorSegments = Math.max(CART_TITAN_MAX_ARMOR, boss.maxArmorSegments ?? CART_TITAN_MAX_ARMOR);
  state.vulnerable = armor <= 0 && (state.vulnerabilitySeconds > 0 || state.stage === "FURY" || Boolean(boss.weakPointExposed));
  if (armor > 0) boss.weakPointExposed = false;
  else if (state.vulnerable) boss.weakPointExposed = true;

  if (state.stage === "ARMORED") {
    boss.moveSpeed = Math.max(boss.moveSpeed, 3.08);
    boss.chargeCooldown = Math.min(boss.chargeCooldown ?? 1.35, 1.35);
  } else if (state.stage === "BREAKOUT") {
    boss.moveSpeed = Math.max(boss.moveSpeed, 3.42);
    boss.chargeCooldown = Math.min(boss.chargeCooldown ?? 1.15, 1.15);
    state.supportCooldown = Math.max(0, state.supportCooldown - delta);
    state.turboDropCooldown = Math.max(0, state.turboDropCooldown - delta);
    if (state.supportCooldown <= 0) {
      deploySupportWave(session, state, boss, 2);
      state.supportCooldown = 7.6;
    }
    if (state.turboDropCooldown <= 0) {
      dropTurboFuel(session, state);
      state.turboDropCooldown = 8.5;
    }
  } else if (state.stage === "FURY") {
    boss.moveSpeed = Math.max(boss.moveSpeed, 3.82);
    boss.chargeCooldown = Math.min(boss.chargeCooldown ?? 0.82, 0.82);
    state.supportCooldown = Math.max(0, state.supportCooldown - delta);
    state.turboDropCooldown = Math.max(0, state.turboDropCooldown - delta);
    if (state.supportCooldown <= 0) {
      deploySupportWave(session, state, boss, 3);
      state.supportCooldown = 6.0;
    }
    if (state.turboDropCooldown <= 0) {
      dropTurboFuel(session, state);
      state.turboDropCooldown = 5.2;
    }
  }
}

function standardMaterial(color: number, emissive: number, intensity: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.58,
    metalness: 0.08,
    flatShading: true,
    emissive,
    emissiveIntensity: intensity,
  });
}

function attachBossVisuals(demo: Phase83Demo): TitanVisualState | null {
  const existing = visualByDemo.get(demo as unknown as object);
  if (existing) return existing;
  const boss = demo.session.enemies.find((enemy) => enemy.kind === "boss");
  if (!boss) return null;
  const group = demo.enemyGroups.get(boss.id);
  if (!group) return null;

  const root = new THREE.Group();
  root.name = "phase83-titan-visual-root";
  const armorRing = new THREE.Mesh(
    new THREE.TorusGeometry(3.95, 0.18, 6, 32),
    standardMaterial(0xf1c66d, 0x5b3b08, 0.32),
  );
  armorRing.name = "phase83-titan-armor-ring";
  armorRing.rotation.x = Math.PI / 2;
  armorRing.position.y = 1.55;
  armorRing.castShadow = false;
  armorRing.receiveShadow = false;

  const weakCore = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.72, 0),
    standardMaterial(0xff7b9e, 0xff315f, 1.15),
  );
  weakCore.name = "phase83-titan-weak-core";
  weakCore.position.set(0, 2.15, -1.55);
  weakCore.castShadow = false;
  weakCore.receiveShadow = false;

  const telegraphRing = new THREE.Mesh(
    new THREE.TorusGeometry(5.1, 0.1, 6, 36),
    new THREE.MeshBasicMaterial({
      color: 0xff6b64,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  telegraphRing.name = "phase83-titan-charge-telegraph";
  telegraphRing.rotation.x = Math.PI / 2;
  telegraphRing.position.y = 0.16;

  const armorPips: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
  for (let index = 0; index < CART_TITAN_MAX_ARMOR; index += 1) {
    const pip = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.34, 0.34),
      new THREE.MeshBasicMaterial({ color: 0xffdf79, toneMapped: false }),
    );
    pip.name = `phase83-titan-armor-pip-${index + 1}`;
    pip.position.set((index - 1.5) * 0.58, 3.25, 0);
    armorPips.push(pip);
    root.add(pip);
  }

  root.add(armorRing, weakCore, telegraphRing);
  group.add(root);
  const created = { root, armorRing, weakCore, telegraphRing, armorPips };
  visualByDemo.set(demo as unknown as object, created);
  return created;
}

function updateBossVisuals(demo: Phase83Demo, delta: number): void {
  const visual = visualByDemo.get(demo as unknown as object) ?? attachBossVisuals(demo);
  if (!visual) return;
  const state = getCartTitanBossState(demo.session);
  visual.root.visible = state.bossActive;
  if (!state.bossActive) return;

  const stagePulse = state.stage === "FURY" ? 1.18 : state.stage === "BREAKOUT" ? 0.78 : 0.5;
  visual.armorRing.visible = state.armorSegments > 0;
  visual.armorRing.rotation.z += delta * (0.6 + stagePulse);
  visual.armorRing.scale.setScalar(0.98 + Math.sin(performance.now() * 0.004) * 0.035);
  visual.weakCore.visible = state.vulnerable || state.stage === "FURY";
  visual.weakCore.rotation.y += delta * 3.2;
  visual.weakCore.rotation.x += delta * 1.4;
  visual.weakCore.scale.setScalar(0.92 + Math.sin(performance.now() * 0.009) * 0.16);
  visual.telegraphRing.visible = state.chargeTelegraph > 0.01;
  visual.telegraphRing.material.opacity = state.chargeTelegraph * 0.72;
  visual.telegraphRing.scale.setScalar(0.72 + state.chargeTelegraph * 0.72);
  visual.telegraphRing.rotation.z -= delta * 2.5;
  visual.armorPips.forEach((pip, index) => { pip.visible = index < state.armorSegments; });
  visual.root.userData.cartTitanStage = state.stage;
  visual.root.userData.cartTitanArmor = state.armorSegments;
  visual.root.userData.cartTitanVulnerable = state.vulnerable;
  visual.root.userData.cartTitanSupportWaveSerial = state.supportWaveSerial;
}

export function installCartRoguePhase83Boss2(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase83Session;
  const previousStep = sessionPrototype.step;
  sessionPrototype.step = function phase83Boss2Step(
    this: Phase83Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previousStep.call(this, input, fixedDelta);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return;
    const hunt = getCartTurboHuntSnapshot(session);
    const state = internalState(this);
    const delta = clamp(fixedDelta, 0, 0.05);
    const boss = this.enemies.find((enemy) => enemy.kind === "boss");
    if (!hunt?.huntBossSpawned || !boss) {
      state.bossActive = false;
    } else {
      updateBoss(this, state, boss, delta);
    }
    state.broadcastClock += delta;
    if (state.broadcastClock >= 0.1) {
      state.broadcastClock %= 0.1;
      broadcast(state);
    }
  };

  const demoPrototype = CartRogueWebGLDemo.prototype as unknown as Phase83Demo;
  const previousBuildEnemies = demoPrototype.buildEnemies;
  demoPrototype.buildEnemies = function phase83Boss2BuildEnemies(
    this: Phase83Demo,
    enemies: CartArenaSessionSnapshot["enemies"],
  ): void {
    previousBuildEnemies.call(this, enemies);
    attachBossVisuals(this);
  };

  const previousUpdateVisuals = demoPrototype.updateVisuals;
  demoPrototype.updateVisuals = function phase83Boss2UpdateVisuals(this: Phase83Demo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    updateBossVisuals(this, delta);
  };
}

installCartRoguePhase83Boss2();

import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { cartEncounterAllowsThreatPressure } from "./CartEncounterDirectorGate";
import type { CartEnemyState } from "./CartCombat";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { getCartTitanBossState } from "./CartRoguePhase83Boss2";
import { getCartPursuitEventState } from "./CartRoguePhase85PursuitEvents";
import { getCartTitanPredatorState } from "./CartRoguePhase86BossPredator";
import { CART_TURBO_HUNT_FIELD } from "./CartTurboHuntTrack";

export type CartThreatPressureKind = "DODGE_WAVE" | "CHASE_PRESSURE";

export interface CartThreatPressureSnapshot {
  active: boolean;
  kind: CartThreatPressureKind;
  serial: number;
  secondsRemaining: number;
  cooldownSeconds: number;
  participantCount: number;
  pressureRatio: number;
}

interface RestoreState {
  moveSpeed: number;
  chargeCooldown: number | undefined;
}

interface InternalPressureState extends CartThreatPressureSnapshot {
  broadcastClock: number;
  participants: Map<string, RestoreState>;
}

interface Phase87Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  rewardTimer: number;
  lastReward: string | null;
  turboRechargeTimer: number;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface Phase87Demo {
  scene: THREE.Scene;
  session: CartArenaSession;
  buildWorld(): void;
  updateVisuals(delta: number): void;
}

interface PressureVisualState {
  root: THREE.Group;
  outerRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  innerRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
}

const stateBySession = new WeakMap<object, InternalPressureState>();
const visualByDemo = new WeakMap<object, PressureVisualState>();
let latestPressureSnapshot: CartThreatPressureSnapshot | null = null;

export const CART_THREAT_PRESSURE_SNAPSHOT_EVENT = "cart-threat-pressure-snapshot";
export const CART_THREAT_PRESSURE_INITIAL_DELAY = 2.4;
export const CART_THREAT_PRESSURE_ACTIVE_SECONDS = 4.3;
export const CART_THREAT_PRESSURE_GAP_SECONDS = 4.5;
export const CART_THREAT_PRESSURE_STRIKER_SPEED = 6.45;
export const CART_THREAT_PRESSURE_STRIKER_COOLDOWN = 0.82;
export const CART_THREAT_PRESSURE_BOSS_SPEED = 4.65;
export const CART_THREAT_PRESSURE_BOSS_COOLDOWN = 0.95;
export const CART_THREAT_PRESSURE_FURY_SPEED = 5.4;
export const CART_THREAT_PRESSURE_FURY_COOLDOWN = 0.56;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function cartThreatPressureActiveRatio(): number {
  return CART_THREAT_PRESSURE_ACTIVE_SECONDS / (CART_THREAT_PRESSURE_ACTIVE_SECONDS + CART_THREAT_PRESSURE_GAP_SECONDS);
}

function stateFor(session: CartArenaSession | Phase87Session): InternalPressureState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalPressureState = {
    active: false,
    kind: "DODGE_WAVE",
    serial: 0,
    secondsRemaining: 0,
    cooldownSeconds: CART_THREAT_PRESSURE_INITIAL_DELAY,
    participantCount: 0,
    pressureRatio: cartThreatPressureActiveRatio(),
    broadcastClock: 0,
    participants: new Map(),
  };
  stateBySession.set(key, created);
  return created;
}

function snapshotOf(state: InternalPressureState): CartThreatPressureSnapshot {
  return {
    active: state.active,
    kind: state.kind,
    serial: state.serial,
    secondsRemaining: state.secondsRemaining,
    cooldownSeconds: state.cooldownSeconds,
    participantCount: state.participantCount,
    pressureRatio: state.pressureRatio,
  };
}

export function getCartThreatPressureState(session: CartArenaSession): CartThreatPressureSnapshot {
  return snapshotOf(stateFor(session));
}

export function getLatestCartThreatPressureState(): CartThreatPressureSnapshot | null {
  return latestPressureSnapshot ? { ...latestPressureSnapshot } : null;
}

function broadcast(state: InternalPressureState): void {
  const snapshot = snapshotOf(state);
  latestPressureSnapshot = snapshot;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CartThreatPressureSnapshot>(CART_THREAT_PRESSURE_SNAPSHOT_EVENT, { detail: snapshot }));
  }
}

function setReward(session: Phase87Session, text: string, seconds = 1.4): void {
  session.lastReward = text;
  session.rewardTimer = Math.max(session.rewardTimer, seconds);
}

function clampField(x: number, z: number, margin = 7): { x: number; z: number } {
  return {
    x: clamp(x, CART_TURBO_HUNT_FIELD.centerX - CART_TURBO_HUNT_FIELD.halfWidth + margin, CART_TURBO_HUNT_FIELD.centerX + CART_TURBO_HUNT_FIELD.halfWidth - margin),
    z: clamp(z, CART_TURBO_HUNT_FIELD.centerZ - CART_TURBO_HUNT_FIELD.halfDepth + margin, CART_TURBO_HUNT_FIELD.centerZ + CART_TURBO_HUNT_FIELD.halfDepth - margin),
  };
}

function saveParticipant(state: InternalPressureState, enemy: CartEnemyState): void {
  if (state.participants.has(enemy.id)) return;
  state.participants.set(enemy.id, {
    moveSpeed: enemy.moveSpeed,
    chargeCooldown: enemy.chargeCooldown,
  });
}

function restoreParticipants(session: Phase87Session, state: InternalPressureState): void {
  for (const [id, restore] of state.participants) {
    const enemy = session.enemies.find((candidate) => candidate.id === id);
    if (!enemy) continue;
    enemy.moveSpeed = restore.moveSpeed;
    enemy.chargeCooldown = restore.chargeCooldown;
  }
  state.participants.clear();
  state.participantCount = 0;
}

function placeAroundCar(session: Phase87Session, enemy: CartEnemyState, angle: number, distance: number): void {
  const point = clampField(
    session.car.position.x + Math.sin(angle) * distance,
    session.car.position.z + Math.cos(angle) * distance,
  );
  enemy.x = point.x;
  enemy.z = point.z;
  enemy.heading = Math.atan2(session.car.position.x - enemy.x, session.car.position.z - enemy.z);
  enemy.aiClock = 0;
  enemy.chargeTime = 0;
}

function beginDodgeWave(session: Phase87Session, state: InternalPressureState): void {
  const strikers = session.enemies
    .filter((enemy) => enemy.alive && enemy.archetype === "striker" && enemy.kind !== "boss")
    .slice(0, 2);
  const offsets = [-0.72, 0.72];
  strikers.forEach((enemy, index) => {
    saveParticipant(state, enemy);
    placeAroundCar(session, enemy, session.car.heading + offsets[index], 17.5 + index * 2.5);
    enemy.moveSpeed = Math.max(enemy.moveSpeed, 6.8);
    enemy.chargeCooldown = 0.1 + index * 0.1;
  });
  state.participantCount = strikers.length;
  setReward(session, "DODGE WAVE · DOUBLE CHARGE INBOUND", 1.7);
}

function beginChasePressure(session: Phase87Session, state: InternalPressureState): void {
  const candidates = session.enemies
    .filter((enemy) => enemy.alive && enemy.kind === "chaser")
    .slice(0, 3);
  const offsets = [-0.32, 0, 0.32];
  candidates.forEach((enemy, index) => {
    saveParticipant(state, enemy);
    const angle = session.car.heading + Math.PI + offsets[index];
    placeAroundCar(session, enemy, angle, 13.5 + index * 3.2);
    enemy.moveSpeed = Math.max(enemy.moveSpeed, 6.65 + index * 0.12);
    if (enemy.archetype === "striker") enemy.chargeCooldown = Math.min(enemy.chargeCooldown ?? 0.35, 0.28);
  });
  state.participantCount = candidates.length;
  setReward(session, "CHASE PRESSURE · BREAK AWAY", 1.7);
}

function beginPressure(session: Phase87Session, state: InternalPressureState): void {
  restoreParticipants(session, state);
  state.serial += 1;
  state.kind = state.serial % 2 === 1 ? "DODGE_WAVE" : "CHASE_PRESSURE";
  state.active = true;
  state.secondsRemaining = CART_THREAT_PRESSURE_ACTIVE_SECONDS;
  state.cooldownSeconds = 0;
  if (state.kind === "DODGE_WAVE") beginDodgeWave(session, state);
  else beginChasePressure(session, state);
}

function finishPressure(session: Phase87Session, state: InternalPressureState): void {
  if (!state.active) return;
  restoreParticipants(session, state);
  state.active = false;
  state.secondsRemaining = 0;
  state.cooldownSeconds = CART_THREAT_PRESSURE_GAP_SECONDS;
  session.turboRechargeTimer += 0.12;
  setReward(session, "PRESSURE CLEARED · TURN AND ATTACK", 1.1);
}

function updatePressureParticipants(session: Phase87Session, state: InternalPressureState): void {
  for (const id of state.participants.keys()) {
    const enemy = session.enemies.find((candidate) => candidate.id === id && candidate.alive);
    if (!enemy) continue;
    if (state.kind === "DODGE_WAVE") {
      enemy.moveSpeed = Math.max(enemy.moveSpeed, 6.8);
      if (enemy.archetype === "striker" && (enemy.chargeTime ?? 0) <= 0) {
        enemy.chargeCooldown = Math.min(enemy.chargeCooldown ?? 0.72, 0.72);
      }
    } else {
      enemy.moveSpeed = Math.max(enemy.moveSpeed, 6.65);
      if (enemy.archetype === "striker" && (enemy.chargeTime ?? 0) <= 0) {
        enemy.chargeCooldown = Math.min(enemy.chargeCooldown ?? 0.78, 0.78);
      }
    }
  }
}

function applyBaselinePressure(session: Phase87Session): void {
  const typed = session as unknown as CartArenaSession;
  const bossState = getCartTitanBossState(typed);
  const predator = getCartTitanPredatorState(typed);
  for (const enemy of session.enemies) {
    if (!enemy.alive) continue;
    if (enemy.archetype === "striker" && enemy.kind !== "boss") {
      enemy.moveSpeed = Math.max(enemy.moveSpeed, CART_THREAT_PRESSURE_STRIKER_SPEED);
      if ((enemy.chargeTime ?? 0) <= 0) {
        enemy.chargeCooldown = Math.min(enemy.chargeCooldown ?? CART_THREAT_PRESSURE_STRIKER_COOLDOWN, CART_THREAT_PRESSURE_STRIKER_COOLDOWN);
      }
      continue;
    }
    if (enemy.kind !== "boss" || !bossState.bossActive || predator.mode === "COUNTER") continue;
    const fury = bossState.stage === "FURY";
    enemy.moveSpeed = Math.max(enemy.moveSpeed, fury ? CART_THREAT_PRESSURE_FURY_SPEED : CART_THREAT_PRESSURE_BOSS_SPEED);
    if ((enemy.chargeTime ?? 0) <= 0) {
      const cap = fury ? CART_THREAT_PRESSURE_FURY_COOLDOWN : CART_THREAT_PRESSURE_BOSS_COOLDOWN;
      enemy.chargeCooldown = Math.min(enemy.chargeCooldown ?? cap, cap);
    }
  }
}

function basicMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}

function buildPressureVisuals(demo: Phase87Demo): PressureVisualState {
  const root = new THREE.Group();
  root.name = "phase87-threat-pressure-root";
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.12, 6, 40), basicMaterial(0xff4f61, 0));
  outerRing.name = "phase87-pressure-outer-ring";
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = 0.2;
  outerRing.renderOrder = 10;
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.08, 6, 32), basicMaterial(0xffc35c, 0));
  innerRing.name = "phase87-pressure-inner-ring";
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = 0.22;
  innerRing.renderOrder = 10;
  root.add(outerRing, innerRing);
  demo.scene.add(root);
  const created = { root, outerRing, innerRing };
  visualByDemo.set(demo as unknown as object, created);
  return created;
}

function updatePressureVisuals(demo: Phase87Demo, delta: number): void {
  const visual = visualByDemo.get(demo as unknown as object) ?? buildPressureVisuals(demo);
  const state = getCartThreatPressureState(demo.session);
  visual.root.visible = isCartTurboHuntEnabled(demo.session) && state.active;
  if (!visual.root.visible) return;
  visual.root.position.set(demo.session.car.position.x, 0, demo.session.car.position.z);
  const ratio = clamp(state.secondsRemaining / CART_THREAT_PRESSURE_ACTIVE_SECONDS, 0, 1);
  const pulse = 0.94 + Math.sin(performance.now() * 0.018) * 0.08;
  visual.outerRing.material.opacity = 0.24 + (1 - ratio) * 0.28;
  visual.outerRing.scale.setScalar(pulse);
  visual.outerRing.rotation.z += Math.max(0, delta) * 3.6;
  visual.innerRing.material.opacity = 0.2 + ratio * 0.22;
  visual.innerRing.scale.setScalar(1.08 - ratio * 0.12);
  visual.innerRing.rotation.z -= Math.max(0, delta) * 4.2;
  visual.root.userData.cartThreatPressureKind = state.kind;
  visual.root.userData.cartThreatPressureSerial = state.serial;
  visual.root.userData.cartThreatPressureParticipants = state.participantCount;
}

export function installCartRoguePhase87ThreatPressure2(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase87Session;
  const previousStep = sessionPrototype.step;
  sessionPrototype.step = function phase87ThreatPressure2Step(
    this: Phase87Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previousStep.call(this, input, fixedDelta);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return;
    const state = stateFor(this);
    const delta = clamp(fixedDelta, 0, 0.05);
    const pursuit = getCartPursuitEventState(session);
    const boss = getCartTitanBossState(session);

    applyBaselinePressure(this);

    if (boss.bossActive) {
      if (state.active) finishPressure(this, state);
      state.cooldownSeconds = Math.min(state.cooldownSeconds, 1.4);
    } else if (pursuit.active) {
      if (state.active) finishPressure(this, state);
      state.cooldownSeconds = Math.max(0, state.cooldownSeconds - delta * 1.8);
    } else if (state.active) {
      state.secondsRemaining = Math.max(0, state.secondsRemaining - delta);
      updatePressureParticipants(this, state);
      if (state.secondsRemaining <= 0) finishPressure(this, state);
    } else {
      state.cooldownSeconds = Math.max(0, state.cooldownSeconds - delta);
      if (state.cooldownSeconds <= 0 && cartEncounterAllowsThreatPressure(session)) beginPressure(this, state);
    }

    state.broadcastClock += delta;
    if (state.broadcastClock >= 0.1) {
      state.broadcastClock %= 0.1;
      broadcast(state);
    }
  };

  const demoPrototype = CartRogueWebGLDemo.prototype as unknown as Phase87Demo;
  const previousBuildWorld = demoPrototype.buildWorld;
  demoPrototype.buildWorld = function phase87ThreatPressure2BuildWorld(this: Phase87Demo): void {
    previousBuildWorld.call(this);
    buildPressureVisuals(this);
  };
  const previousUpdateVisuals = demoPrototype.updateVisuals;
  demoPrototype.updateVisuals = function phase87ThreatPressure2UpdateVisuals(this: Phase87Demo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    updatePressureVisuals(this, delta);
  };
}

installCartRoguePhase87ThreatPressure2();
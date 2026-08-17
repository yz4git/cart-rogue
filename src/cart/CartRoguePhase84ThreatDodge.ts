import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import type { CartEnemyState } from "./CartCombat";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";

export type CartDodgeGrade = "NONE" | "DODGE" | "PERFECT";
export type CartThreatKind = "STRIKER" | "TITAN";

export interface CartThreatDodgeSnapshot {
  threatActive: boolean;
  threatEnemyId: string | null;
  threatKind: CartThreatKind | null;
  threatDistance: number;
  threatTelegraph: number;
  threatX: number;
  threatZ: number;
  threatHeading: number;
  dodgeSerial: number;
  perfectDodgeSerial: number;
  lastDodgeGrade: CartDodgeGrade;
  dodgeFlashSeconds: number;
  counterSeconds: number;
}

interface TrackedCharge {
  active: boolean;
  minClearance: number;
}

interface InternalThreatState extends CartThreatDodgeSnapshot {
  broadcastClock: number;
  tracked: Map<string, TrackedCharge>;
}

interface Phase84Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  gas: number;
  turboRechargeTimer: number;
  rewardTimer: number;
  lastReward: string | null;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface Phase84Demo {
  scene: THREE.Scene;
  session: CartArenaSession;
  buildWorld(): void;
  updateVisuals(delta: number): void;
}

interface ThreatVisualState {
  root: THREE.Group;
  threatLine: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  warningRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  perfectRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
}

interface EnemyBeforeState {
  x: number;
  z: number;
  chargeTime: number;
}

const stateBySession = new WeakMap<object, InternalThreatState>();
const visualByDemo = new WeakMap<object, ThreatVisualState>();
let latestThreatSnapshot: CartThreatDodgeSnapshot | null = null;

export const CART_THREAT_DODGE_SNAPSHOT_EVENT = "cart-threat-dodge-snapshot";
export const CART_PERFECT_DODGE_CLEARANCE = 1.15;
export const CART_DODGE_CLEARANCE = 2.85;
export const CART_PERFECT_DODGE_COUNTER_SECONDS = 1.8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function cartDodgeGradeForClearance(clearance: number): CartDodgeGrade {
  if (!Number.isFinite(clearance) || clearance <= 0) return "NONE";
  if (clearance <= CART_PERFECT_DODGE_CLEARANCE) return "PERFECT";
  if (clearance <= CART_DODGE_CLEARANCE) return "DODGE";
  return "NONE";
}

export function cartRelativeMotionClearance(
  carStartX: number,
  carStartZ: number,
  carEndX: number,
  carEndZ: number,
  enemyStartX: number,
  enemyStartZ: number,
  enemyEndX: number,
  enemyEndZ: number,
  combinedRadius: number,
): number {
  const startX = enemyStartX - carStartX;
  const startZ = enemyStartZ - carStartZ;
  const endX = enemyEndX - carEndX;
  const endZ = enemyEndZ - carEndZ;
  const deltaX = endX - startX;
  const deltaZ = endZ - startZ;
  const denominator = deltaX * deltaX + deltaZ * deltaZ;
  const t = denominator > 1e-9
    ? clamp(-(startX * deltaX + startZ * deltaZ) / denominator, 0, 1)
    : 0;
  const closestX = startX + deltaX * t;
  const closestZ = startZ + deltaZ * t;
  return Math.hypot(closestX, closestZ) - Math.max(0, combinedRadius);
}

function isChargeThreat(enemy: CartEnemyState): boolean {
  return enemy.alive && (enemy.kind === "boss" || enemy.archetype === "striker");
}

function threatKind(enemy: CartEnemyState): CartThreatKind {
  return enemy.kind === "boss" ? "TITAN" : "STRIKER";
}

function internalState(session: CartArenaSession | Phase84Session): InternalThreatState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalThreatState = {
    threatActive: false,
    threatEnemyId: null,
    threatKind: null,
    threatDistance: 0,
    threatTelegraph: 0,
    threatX: 0,
    threatZ: 0,
    threatHeading: 0,
    dodgeSerial: 0,
    perfectDodgeSerial: 0,
    lastDodgeGrade: "NONE",
    dodgeFlashSeconds: 0,
    counterSeconds: 0,
    broadcastClock: 0,
    tracked: new Map(),
  };
  stateBySession.set(key, created);
  return created;
}

function snapshotOf(state: InternalThreatState): CartThreatDodgeSnapshot {
  return {
    threatActive: state.threatActive,
    threatEnemyId: state.threatEnemyId,
    threatKind: state.threatKind,
    threatDistance: state.threatDistance,
    threatTelegraph: state.threatTelegraph,
    threatX: state.threatX,
    threatZ: state.threatZ,
    threatHeading: state.threatHeading,
    dodgeSerial: state.dodgeSerial,
    perfectDodgeSerial: state.perfectDodgeSerial,
    lastDodgeGrade: state.lastDodgeGrade,
    dodgeFlashSeconds: state.dodgeFlashSeconds,
    counterSeconds: state.counterSeconds,
  };
}

export function getCartThreatDodgeState(session: CartArenaSession): CartThreatDodgeSnapshot {
  return snapshotOf(internalState(session));
}

export function getLatestCartThreatDodgeState(): CartThreatDodgeSnapshot | null {
  return latestThreatSnapshot ? { ...latestThreatSnapshot } : null;
}

function broadcast(state: InternalThreatState): void {
  const snapshot = snapshotOf(state);
  latestThreatSnapshot = snapshot;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CartThreatDodgeSnapshot>(CART_THREAT_DODGE_SNAPSHOT_EVENT, { detail: snapshot }));
  }
}

function rewardDodge(session: Phase84Session, state: InternalThreatState, grade: CartDodgeGrade): void {
  if (grade === "NONE") return;
  state.dodgeSerial += 1;
  state.lastDodgeGrade = grade;
  state.dodgeFlashSeconds = grade === "PERFECT" ? 0.8 : 0.45;
  state.counterSeconds = Math.max(state.counterSeconds, grade === "PERFECT" ? CART_PERFECT_DODGE_COUNTER_SECONDS : 0.85);
  if (grade === "PERFECT") {
    state.perfectDodgeSerial += 1;
    session.gas = Math.min(1, session.gas + 0.022);
    session.turboRechargeTimer += 0.42;
    session.car.collisionImpact = Math.max(session.car.collisionImpact, 0.72);
    session.lastReward = "PERFECT DODGE · COUNTER NOW";
    session.rewardTimer = Math.max(session.rewardTimer, 1.8);
  } else {
    session.turboRechargeTimer += 0.16;
    session.lastReward = "DODGE · TURN AND STRIKE";
    session.rewardTimer = Math.max(session.rewardTimer, 1.15);
  }
}

function updateThreatSelection(session: Phase84Session, state: InternalThreatState): void {
  let selected: CartEnemyState | null = null;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (const enemy of session.enemies) {
    if (!isChargeThreat(enemy)) continue;
    const distance = Math.hypot(enemy.x - session.car.position.x, enemy.z - session.car.position.z);
    const charging = (enemy.chargeTime ?? 0) > 0;
    const windingUp = (enemy.chargeCooldown ?? 99) <= 0.28 && distance < (enemy.kind === "boss" ? 36 : 24);
    if (!charging && !windingUp) continue;
    if (distance < selectedDistance) {
      selected = enemy;
      selectedDistance = distance;
    }
  }
  if (!selected) {
    state.threatActive = false;
    state.threatEnemyId = null;
    state.threatKind = null;
    state.threatDistance = 0;
    state.threatTelegraph = 0;
    return;
  }
  const chargeDuration = selected.kind === "boss" ? 0.72 : 0.42;
  const charging = (selected.chargeTime ?? 0) > 0;
  state.threatActive = true;
  state.threatEnemyId = selected.id;
  state.threatKind = threatKind(selected);
  state.threatDistance = selectedDistance;
  state.threatTelegraph = charging
    ? clamp((selected.chargeTime ?? 0) / chargeDuration, 0.2, 1)
    : clamp(1 - (selected.chargeCooldown ?? 0) / 0.28, 0.08, 0.35);
  state.threatX = selected.x;
  state.threatZ = selected.z;
  state.threatHeading = selected.heading;
}

function processCharges(
  session: Phase84Session,
  state: InternalThreatState,
  beforeCarX: number,
  beforeCarZ: number,
  beforeEnemies: Map<string, EnemyBeforeState>,
): void {
  for (const enemy of session.enemies) {
    if (!isChargeThreat(enemy)) continue;
    const before = beforeEnemies.get(enemy.id);
    if (!before) continue;
    const wasChargingAtFrameStart = before.chargeTime > 0;
    const chargingNow = (enemy.chargeTime ?? 0) > 0;
    let tracked = state.tracked.get(enemy.id);
    if (!tracked) {
      tracked = { active: false, minClearance: Number.POSITIVE_INFINITY };
      state.tracked.set(enemy.id, tracked);
    }
    if (chargingNow && !tracked.active) {
      tracked.active = true;
      tracked.minClearance = Number.POSITIVE_INFINITY;
    }
    if (tracked.active && (wasChargingAtFrameStart || chargingNow)) {
      const clearance = cartRelativeMotionClearance(
        beforeCarX,
        beforeCarZ,
        session.car.position.x,
        session.car.position.z,
        before.x,
        before.z,
        enemy.x,
        enemy.z,
        enemy.radius + 1.5,
      );
      tracked.minClearance = Math.min(tracked.minClearance, clearance);
    }
    if (tracked.active && wasChargingAtFrameStart && !chargingNow) {
      rewardDodge(session, state, cartDodgeGradeForClearance(tracked.minClearance));
      tracked.active = false;
      tracked.minClearance = Number.POSITIVE_INFINITY;
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

function buildThreatVisuals(demo: Phase84Demo): ThreatVisualState {
  const root = new THREE.Group();
  root.name = "phase84-threat-dodge-root";

  const threatLine = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.045, 14), basicMaterial(0xff5e52, 0));
  threatLine.name = "phase84-threat-line";
  threatLine.position.y = 0.08;
  threatLine.renderOrder = 8;

  const warningRing = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.09, 6, 32), basicMaterial(0xff9b55, 0));
  warningRing.name = "phase84-warning-ring";
  warningRing.rotation.x = Math.PI / 2;
  warningRing.position.y = 0.12;
  warningRing.renderOrder = 8;

  const perfectRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.11, 6, 36), basicMaterial(0x8ffcff, 0));
  perfectRing.name = "phase84-perfect-dodge-ring";
  perfectRing.rotation.x = Math.PI / 2;
  perfectRing.position.y = 0.18;
  perfectRing.renderOrder = 9;

  root.add(threatLine, warningRing, perfectRing);
  demo.scene.add(root);
  const created = { root, threatLine, warningRing, perfectRing };
  visualByDemo.set(demo as unknown as object, created);
  return created;
}

function updateThreatVisuals(demo: Phase84Demo, delta: number): void {
  const visual = visualByDemo.get(demo as unknown as object) ?? buildThreatVisuals(demo);
  const state = getCartThreatDodgeState(demo.session);
  visual.root.visible = isCartTurboHuntEnabled(demo.session);
  if (!visual.root.visible) return;

  visual.threatLine.visible = state.threatActive;
  visual.warningRing.visible = state.threatActive;
  if (state.threatActive) {
    const fx = Math.sin(state.threatHeading);
    const fz = Math.cos(state.threatHeading);
    visual.threatLine.position.set(state.threatX + fx * 7, 0.08, state.threatZ + fz * 7);
    visual.threatLine.rotation.y = state.threatHeading;
    visual.threatLine.material.opacity = 0.16 + state.threatTelegraph * 0.58;
    visual.threatLine.scale.set(1, 1, 0.72 + state.threatTelegraph * 0.42);
    visual.warningRing.position.set(state.threatX, 0.12, state.threatZ);
    visual.warningRing.material.opacity = 0.16 + state.threatTelegraph * 0.5;
    visual.warningRing.scale.setScalar(0.85 + state.threatTelegraph * 0.28);
    visual.warningRing.rotation.z += Math.max(0, delta) * 2.3;
  }

  const flash = clamp(state.dodgeFlashSeconds / 0.8, 0, 1);
  visual.perfectRing.visible = flash > 0.01 || state.counterSeconds > 0;
  visual.perfectRing.position.set(demo.session.car.position.x, 0.18, demo.session.car.position.z);
  visual.perfectRing.material.opacity = flash * 0.78 + (state.counterSeconds > 0 ? 0.15 : 0);
  visual.perfectRing.scale.setScalar(0.88 + (1 - flash) * 0.72);
  visual.perfectRing.rotation.z -= Math.max(0, delta) * 2.8;
  visual.root.userData.cartThreatActive = state.threatActive;
  visual.root.userData.cartPerfectDodgeSerial = state.perfectDodgeSerial;
  visual.root.userData.cartCounterSeconds = state.counterSeconds;
}

export function installCartRoguePhase84ThreatDodge(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase84Session;
  const previousStep = sessionPrototype.step;
  sessionPrototype.step = function phase84ThreatDodgeStep(
    this: Phase84Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const beforeCarX = this.car.position.x;
    const beforeCarZ = this.car.position.z;
    const beforeEnemies = new Map<string, EnemyBeforeState>();
    for (const enemy of this.enemies) {
      if (!isChargeThreat(enemy)) continue;
      beforeEnemies.set(enemy.id, { x: enemy.x, z: enemy.z, chargeTime: Math.max(0, enemy.chargeTime ?? 0) });
    }

    previousStep.call(this, input, fixedDelta);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return;
    const state = internalState(this);
    const delta = clamp(fixedDelta, 0, 0.05);
    state.dodgeFlashSeconds = Math.max(0, state.dodgeFlashSeconds - delta);
    state.counterSeconds = Math.max(0, state.counterSeconds - delta);
    processCharges(this, state, beforeCarX, beforeCarZ, beforeEnemies);
    updateThreatSelection(this, state);
    state.broadcastClock += delta;
    if (state.broadcastClock >= 0.1 || state.dodgeFlashSeconds > 0) {
      state.broadcastClock %= 0.1;
      broadcast(state);
    }
  };

  const demoPrototype = CartRogueWebGLDemo.prototype as unknown as Phase84Demo;
  const previousBuildWorld = demoPrototype.buildWorld;
  demoPrototype.buildWorld = function phase84ThreatDodgeBuildWorld(this: Phase84Demo): void {
    previousBuildWorld.call(this);
    buildThreatVisuals(this);
  };
  const previousUpdateVisuals = demoPrototype.updateVisuals;
  demoPrototype.updateVisuals = function phase84ThreatDodgeUpdateVisuals(this: Phase84Demo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    updateThreatVisuals(this, delta);
  };
}

installCartRoguePhase84ThreatDodge();

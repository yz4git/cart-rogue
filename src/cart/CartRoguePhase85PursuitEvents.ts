import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { cartEncounterAllowsChaseStart } from "./CartEncounterDirectorGate";
import type { CartEnemyState } from "./CartCombat";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { getCartTitanBossState } from "./CartRoguePhase83Boss2";
import { CART_TURBO_HUNT_FIELD } from "./CartTurboHuntTrack";

export type CartPursuitEventKind = "PURSUIT" | "DANGER_ZONE" | "BREAKOUT";

export interface CartPursuitEventSnapshot {
  active: boolean;
  eventSerial: number;
  kind: CartPursuitEventKind;
  label: string;
  secondsRemaining: number;
  duration: number;
  progress: number;
  dangerX: number;
  dangerZ: number;
  dangerRadius: number;
  successSerial: number;
  failureSerial: number;
}

interface PursuerRestoreState {
  moveSpeed: number;
  chargeCooldown: number | undefined;
}

interface InternalPursuitState extends CartPursuitEventSnapshot {
  cooldownSeconds: number;
  broadcastClock: number;
  startX: number;
  startZ: number;
  dangerArmSeconds: number;
  dangerResolved: boolean;
  pursuers: Map<string, PursuerRestoreState>;
}

interface Phase85Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  gas: number;
  turboRechargeTimer: number;
  rewardTimer: number;
  lastReward: string | null;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface Phase85Demo {
  scene: THREE.Scene;
  session: CartArenaSession;
  buildWorld(): void;
  updateVisuals(delta: number): void;
}

interface PursuitVisualState {
  root: THREE.Group;
  dangerZone: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  breakoutRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  pursuitWarning: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
}

const stateBySession = new WeakMap<object, InternalPursuitState>();
const visualByDemo = new WeakMap<object, PursuitVisualState>();
let latestPursuitSnapshot: CartPursuitEventSnapshot | null = null;

export const CART_PURSUIT_EVENT_SNAPSHOT_EVENT = "cart-pursuit-event-snapshot";
export const CART_PURSUIT_EVENT_COOLDOWN_SECONDS = 17.5;
export const CART_PURSUIT_EVENT_ACTIVE_RATIO_LIMIT = 0.3;

const EVENT_ROTATION: readonly CartPursuitEventKind[] = ["PURSUIT", "DANGER_ZONE", "BREAKOUT"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function cartPursuitKindForSerial(serial: number): CartPursuitEventKind {
  return EVENT_ROTATION[Math.abs(Math.floor(serial)) % EVENT_ROTATION.length];
}

export function cartPursuitDuration(kind: CartPursuitEventKind): number {
  if (kind === "PURSUIT") return 6.4;
  if (kind === "BREAKOUT") return 6.0;
  return 5.2;
}

export function cartPursuitActiveRatio(kind: CartPursuitEventKind): number {
  const active = cartPursuitDuration(kind);
  return active / (active + CART_PURSUIT_EVENT_COOLDOWN_SECONDS);
}

function labelFor(kind: CartPursuitEventKind): string {
  if (kind === "PURSUIT") return "PURSUIT · KEEP MOVING";
  if (kind === "DANGER_ZONE") return "DANGER ZONE · GET OUT";
  return "BREAKOUT · PUNCH THROUGH THE RING";
}

function internalState(session: CartArenaSession | Phase85Session): InternalPursuitState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalPursuitState = {
    active: false,
    eventSerial: 0,
    kind: "PURSUIT",
    label: labelFor("PURSUIT"),
    secondsRemaining: 0,
    duration: cartPursuitDuration("PURSUIT"),
    progress: 0,
    dangerX: 0,
    dangerZ: 0,
    dangerRadius: 0,
    successSerial: 0,
    failureSerial: 0,
    cooldownSeconds: 8.5,
    broadcastClock: 0,
    startX: 0,
    startZ: 0,
    dangerArmSeconds: 0,
    dangerResolved: false,
    pursuers: new Map(),
  };
  stateBySession.set(key, created);
  return created;
}

function snapshotOf(state: InternalPursuitState): CartPursuitEventSnapshot {
  return {
    active: state.active,
    eventSerial: state.eventSerial,
    kind: state.kind,
    label: state.label,
    secondsRemaining: state.secondsRemaining,
    duration: state.duration,
    progress: state.progress,
    dangerX: state.dangerX,
    dangerZ: state.dangerZ,
    dangerRadius: state.dangerRadius,
    successSerial: state.successSerial,
    failureSerial: state.failureSerial,
  };
}

export function getCartPursuitEventState(session: CartArenaSession): CartPursuitEventSnapshot {
  return snapshotOf(internalState(session));
}

export function getLatestCartPursuitEventState(): CartPursuitEventSnapshot | null {
  return latestPursuitSnapshot ? { ...latestPursuitSnapshot } : null;
}

function broadcast(state: InternalPursuitState): void {
  const snapshot = snapshotOf(state);
  latestPursuitSnapshot = snapshot;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CartPursuitEventSnapshot>(CART_PURSUIT_EVENT_SNAPSHOT_EVENT, { detail: snapshot }));
  }
}

function setReward(session: Phase85Session, text: string, seconds = 1.5): void {
  session.lastReward = text;
  session.rewardTimer = Math.max(session.rewardTimer, seconds);
}

function clampField(x: number, z: number, margin = 8): { x: number; z: number } {
  return {
    x: clamp(x, CART_TURBO_HUNT_FIELD.centerX - CART_TURBO_HUNT_FIELD.halfWidth + margin, CART_TURBO_HUNT_FIELD.centerX + CART_TURBO_HUNT_FIELD.halfWidth - margin),
    z: clamp(z, CART_TURBO_HUNT_FIELD.centerZ - CART_TURBO_HUNT_FIELD.halfDepth + margin, CART_TURBO_HUNT_FIELD.centerZ + CART_TURBO_HUNT_FIELD.halfDepth - margin),
  };
}

function restorePursuers(session: Phase85Session, state: InternalPursuitState): void {
  for (const [id, restore] of state.pursuers) {
    const enemy = session.enemies.find((candidate) => candidate.id === id);
    if (!enemy) continue;
    enemy.moveSpeed = restore.moveSpeed;
    enemy.chargeCooldown = restore.chargeCooldown;
  }
  state.pursuers.clear();
}

function arrangePursuit(session: Phase85Session, state: InternalPursuitState): void {
  const heading = session.car.heading;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  const candidates = session.enemies
    .filter((enemy) => enemy.alive && enemy.kind !== "boss" && enemy.kind !== "heavy")
    .slice(0, 2);
  const lanes = [-5.5, 5.5];
  candidates.forEach((enemy, index) => {
    state.pursuers.set(enemy.id, { moveSpeed: enemy.moveSpeed, chargeCooldown: enemy.chargeCooldown });
    const point = clampField(
      session.car.position.x - fx * (17 + index * 4) + rx * lanes[index],
      session.car.position.z - fz * (17 + index * 4) + rz * lanes[index],
    );
    enemy.x = point.x;
    enemy.z = point.z;
    enemy.heading = Math.atan2(session.car.position.x - enemy.x, session.car.position.z - enemy.z);
    enemy.moveSpeed = Math.max(enemy.moveSpeed, 5.25);
    enemy.aiClock = 0;
    enemy.chargeTime = 0;
    if (enemy.archetype === "striker") enemy.chargeCooldown = Math.min(enemy.chargeCooldown ?? 0.8, 0.7);
  });
}

function arrangeBreakout(session: Phase85Session): void {
  const candidates = session.enemies
    .filter((enemy) => enemy.alive && enemy.kind !== "boss")
    .slice(0, 4);
  const angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  candidates.forEach((enemy, index) => {
    const angle = angles[index];
    const point = clampField(
      session.car.position.x + Math.sin(angle) * 8.6,
      session.car.position.z + Math.cos(angle) * 8.6,
    );
    enemy.x = point.x;
    enemy.z = point.z;
    enemy.heading = Math.atan2(session.car.position.x - enemy.x, session.car.position.z - enemy.z);
    enemy.aiClock = 0;
    enemy.chargeTime = 0;
  });
}

function startEvent(session: Phase85Session, state: InternalPursuitState): void {
  restorePursuers(session, state);
  state.eventSerial += 1;
  state.kind = cartPursuitKindForSerial(state.eventSerial - 1);
  state.label = labelFor(state.kind);
  state.duration = cartPursuitDuration(state.kind);
  state.secondsRemaining = state.duration;
  state.progress = 0;
  state.active = true;
  state.startX = session.car.position.x;
  state.startZ = session.car.position.z;
  state.dangerResolved = false;
  state.dangerRadius = state.kind === "DANGER_ZONE" ? 9.2 : state.kind === "BREAKOUT" ? 15.5 : 0;
  state.dangerArmSeconds = state.kind === "DANGER_ZONE" ? 3.35 : 0;

  if (state.kind === "PURSUIT") {
    arrangePursuit(session, state);
  } else if (state.kind === "DANGER_ZONE") {
    const forward = 7.5;
    const point = clampField(
      session.car.position.x + Math.sin(session.car.heading) * forward,
      session.car.position.z + Math.cos(session.car.heading) * forward,
    );
    state.dangerX = point.x;
    state.dangerZ = point.z;
  } else {
    state.dangerX = session.car.position.x;
    state.dangerZ = session.car.position.z;
    arrangeBreakout(session);
  }
  setReward(session, state.label, 1.6);
}

function finishEvent(session: Phase85Session, state: InternalPursuitState, success: boolean): void {
  if (!state.active) return;
  state.active = false;
  state.secondsRemaining = 0;
  state.progress = success ? 1 : state.progress;
  state.cooldownSeconds = CART_PURSUIT_EVENT_COOLDOWN_SECONDS;
  restorePursuers(session, state);
  if (success) {
    state.successSerial += 1;
    session.gas = Math.min(1, session.gas + 0.026);
    session.turboRechargeTimer += 0.34;
    session.car.collisionImpact = Math.max(session.car.collisionImpact, 0.64);
    setReward(session, `${state.kind.replaceAll("_", " ")} CLEAR · TURN TO ATTACK`, 1.8);
  } else {
    state.failureSerial += 1;
    session.gas = Math.max(0, session.gas - 0.045);
    session.car.forwardVelocity *= 0.78;
    session.car.collisionImpact = Math.max(session.car.collisionImpact, 0.88);
    setReward(session, `${state.kind.replaceAll("_", " ")} HIT · RECOVER`, 1.4);
  }
}

function updateActiveEvent(session: Phase85Session, state: InternalPursuitState, delta: number): void {
  state.secondsRemaining = Math.max(0, state.secondsRemaining - delta);
  state.progress = clamp(1 - state.secondsRemaining / Math.max(0.01, state.duration), 0, 1);

  if (state.kind === "DANGER_ZONE") {
    state.dangerArmSeconds = Math.max(0, state.dangerArmSeconds - delta);
    if (!state.dangerResolved && state.dangerArmSeconds <= 0) {
      state.dangerResolved = true;
      const distance = Math.hypot(session.car.position.x - state.dangerX, session.car.position.z - state.dangerZ);
      finishEvent(session, state, distance > state.dangerRadius);
      return;
    }
  } else if (state.kind === "BREAKOUT") {
    const distance = Math.hypot(session.car.position.x - state.startX, session.car.position.z - state.startZ);
    state.progress = clamp(distance / state.dangerRadius, 0, 1);
    if (distance >= state.dangerRadius) {
      finishEvent(session, state, true);
      return;
    }
  }

  if (state.secondsRemaining <= 0) {
    finishEvent(session, state, state.kind === "PURSUIT");
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

function buildPursuitVisuals(demo: Phase85Demo): PursuitVisualState {
  const root = new THREE.Group();
  root.name = "phase85-pursuit-event-root";

  const dangerZone = new THREE.Mesh(new THREE.RingGeometry(7.6, 9.2, 48), basicMaterial(0xff574f, 0));
  dangerZone.name = "phase85-danger-zone";
  dangerZone.rotation.x = -Math.PI / 2;
  dangerZone.position.y = 0.09;
  dangerZone.renderOrder = 7;

  const breakoutRing = new THREE.Mesh(new THREE.TorusGeometry(15.5, 0.14, 6, 56), basicMaterial(0xffbe62, 0));
  breakoutRing.name = "phase85-breakout-ring";
  breakoutRing.rotation.x = Math.PI / 2;
  breakoutRing.position.y = 0.13;
  breakoutRing.renderOrder = 7;

  const pursuitWarning = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.12, 6, 36), basicMaterial(0xff697d, 0));
  pursuitWarning.name = "phase85-pursuit-warning";
  pursuitWarning.rotation.x = Math.PI / 2;
  pursuitWarning.position.y = 0.16;
  pursuitWarning.renderOrder = 8;

  root.add(dangerZone, breakoutRing, pursuitWarning);
  demo.scene.add(root);
  const created = { root, dangerZone, breakoutRing, pursuitWarning };
  visualByDemo.set(demo as unknown as object, created);
  return created;
}

function updatePursuitVisuals(demo: Phase85Demo, delta: number): void {
  const visual = visualByDemo.get(demo as unknown as object) ?? buildPursuitVisuals(demo);
  const state = getCartPursuitEventState(demo.session);
  visual.root.visible = isCartTurboHuntEnabled(demo.session);
  visual.dangerZone.visible = state.active && state.kind === "DANGER_ZONE";
  visual.breakoutRing.visible = state.active && state.kind === "BREAKOUT";
  visual.pursuitWarning.visible = state.active && state.kind === "PURSUIT";

  if (visual.dangerZone.visible) {
    visual.dangerZone.position.set(state.dangerX, 0.09, state.dangerZ);
    visual.dangerZone.material.opacity = 0.18 + state.progress * 0.48;
    const pulse = 0.96 + Math.sin(performance.now() * 0.012) * 0.06;
    visual.dangerZone.scale.setScalar(pulse);
    visual.dangerZone.rotation.z += Math.max(0, delta) * 1.6;
  }
  if (visual.breakoutRing.visible) {
    visual.breakoutRing.position.set(state.dangerX, 0.13, state.dangerZ);
    visual.breakoutRing.material.opacity = 0.28 + (1 - state.progress) * 0.28;
    visual.breakoutRing.rotation.z -= Math.max(0, delta) * 1.2;
  }
  if (visual.pursuitWarning.visible) {
    visual.pursuitWarning.position.set(demo.session.car.position.x, 0.16, demo.session.car.position.z);
    visual.pursuitWarning.material.opacity = 0.25 + Math.sin(performance.now() * 0.018) * 0.11;
    visual.pursuitWarning.scale.setScalar(0.92 + state.progress * 0.22);
    visual.pursuitWarning.rotation.z += Math.max(0, delta) * 2.5;
  }
  visual.root.userData.cartPursuitActive = state.active;
  visual.root.userData.cartPursuitKind = state.kind;
  visual.root.userData.cartPursuitSuccessSerial = state.successSerial;
}

export function installCartRoguePhase85PursuitEvents(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase85Session;
  const previousStep = sessionPrototype.step;
  sessionPrototype.step = function phase85PursuitEventsStep(
    this: Phase85Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previousStep.call(this, input, fixedDelta);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return;
    const state = internalState(this);
    const delta = clamp(fixedDelta, 0, 0.05);
    const titan = getCartTitanBossState(session);

    if (titan.bossActive) {
      if (state.active) {
        restorePursuers(this, state);
        state.active = false;
        state.secondsRemaining = 0;
      }
      state.cooldownSeconds = Math.max(state.cooldownSeconds, 3.5);
    } else if (state.active) {
      updateActiveEvent(this, state, delta);
    } else {
      state.cooldownSeconds = Math.max(0, state.cooldownSeconds - delta);
      if (state.cooldownSeconds <= 0 && cartEncounterAllowsChaseStart(session)) startEvent(this, state);
    }

    state.broadcastClock += delta;
    if (state.broadcastClock >= 0.1) {
      state.broadcastClock %= 0.1;
      broadcast(state);
    }
  };

  const demoPrototype = CartRogueWebGLDemo.prototype as unknown as Phase85Demo;
  const previousBuildWorld = demoPrototype.buildWorld;
  demoPrototype.buildWorld = function phase85PursuitEventsBuildWorld(this: Phase85Demo): void {
    previousBuildWorld.call(this);
    buildPursuitVisuals(this);
  };
  const previousUpdateVisuals = demoPrototype.updateVisuals;
  demoPrototype.updateVisuals = function phase85PursuitEventsUpdateVisuals(this: Phase85Demo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    updatePursuitVisuals(this, delta);
  };
}

installCartRoguePhase85PursuitEvents();
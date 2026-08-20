import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { cartEncounterAllowsChaseStart } from "./CartEncounterDirectorGate";
import type { CartEnemyState } from "./CartCombat";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { getCartTitanBossState } from "./CartRoguePhase83Boss2";
import { cancelCartRaidHazards } from "./CartRoguePhase88RaidHazards";
import { CART_TURBO_HUNT_FIELD } from "./CartTurboHuntTrack";

export type CartEscapeRhythmKind = "PURSUIT" | "BREAKOUT";

export interface CartEscapeRhythmSnapshot {
  active: boolean;
  serial: number;
  kind: CartEscapeRhythmKind;
  label: string;
  secondsRemaining: number;
  cooldownSeconds: number;
  participantCount: number;
  nearestThreatDistance: number;
  openingGraceSeconds: number;
}

interface EnemyRestore {
  moveSpeed: number;
  chargeCooldown: number | undefined;
}

interface InternalState extends CartEscapeRhythmSnapshot {
  broadcastClock: number;
  startX: number;
  startZ: number;
  participants: Map<string, EnemyRestore>;
}

interface Phase94Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  gas: number;
  turboRechargeTimer: number;
  rewardTimer: number;
  lastReward: string | null;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface Phase94Demo {
  scene: THREE.Scene;
  session: CartArenaSession;
  buildWorld(): void;
  updateVisuals(delta: number): void;
}

interface EscapeVisualState {
  root: THREE.Group;
  outerRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  innerRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  arrows: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>[];
}

const stateBySession = new WeakMap<object, InternalState>();
const visualByDemo = new WeakMap<object, EscapeVisualState>();
let latestSnapshot: CartEscapeRhythmSnapshot | null = null;

export const CART_ESCAPE_RHYTHM_EVENT = "cart-escape-rhythm-snapshot";
export const CART_ESCAPE_INITIAL_DELAY = 6.2;
export const CART_ESCAPE_COOLDOWN = 15.5;
export const CART_ESCAPE_DURATION = 6.4;
export const CART_ESCAPE_OPENING_GRACE = 1.6;
export const CART_ESCAPE_PURSUER_SPEED = 8.2;
export const CART_ESCAPE_PURSUER_CHARGE_COOLDOWN = 0.34;
export const CART_ESCAPE_BREAKOUT_DISTANCE = 18;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function labelFor(kind: CartEscapeRhythmKind): string {
  return kind === "PURSUIT" ? "ESCAPE · PURSUIT · BREAK AWAY" : "ESCAPE · BREAKOUT · LEAVE THE RING";
}

function stateFor(session: CartArenaSession | Phase94Session): InternalState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalState = {
    active: false,
    serial: 0,
    kind: "PURSUIT",
    label: labelFor("PURSUIT"),
    secondsRemaining: 0,
    cooldownSeconds: CART_ESCAPE_INITIAL_DELAY,
    participantCount: 0,
    nearestThreatDistance: 99,
    openingGraceSeconds: 0,
    broadcastClock: 0,
    startX: 0,
    startZ: 0,
    participants: new Map(),
  };
  stateBySession.set(key, created);
  return created;
}

function snapshotOf(state: InternalState): CartEscapeRhythmSnapshot {
  return {
    active: state.active,
    serial: state.serial,
    kind: state.kind,
    label: state.label,
    secondsRemaining: state.secondsRemaining,
    cooldownSeconds: state.cooldownSeconds,
    participantCount: state.participantCount,
    nearestThreatDistance: state.nearestThreatDistance,
    openingGraceSeconds: state.openingGraceSeconds,
  };
}

export function getCartEscapeRhythmState(session: CartArenaSession): CartEscapeRhythmSnapshot {
  return snapshotOf(stateFor(session));
}

export function getLatestCartEscapeRhythmState(): CartEscapeRhythmSnapshot | null {
  return latestSnapshot ? { ...latestSnapshot } : null;
}

function broadcast(state: InternalState): void {
  const snapshot = snapshotOf(state);
  latestSnapshot = snapshot;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CartEscapeRhythmSnapshot>(CART_ESCAPE_RHYTHM_EVENT, { detail: snapshot }));
  }
}

function clampField(x: number, z: number, margin = 7): { x: number; z: number } {
  return {
    x: clamp(x, CART_TURBO_HUNT_FIELD.centerX - CART_TURBO_HUNT_FIELD.halfWidth + margin, CART_TURBO_HUNT_FIELD.centerX + CART_TURBO_HUNT_FIELD.halfWidth - margin),
    z: clamp(z, CART_TURBO_HUNT_FIELD.centerZ - CART_TURBO_HUNT_FIELD.halfDepth + margin, CART_TURBO_HUNT_FIELD.centerZ + CART_TURBO_HUNT_FIELD.halfDepth - margin),
  };
}

function restoreParticipants(session: Phase94Session, state: InternalState): void {
  for (const [id, restore] of state.participants) {
    const enemy = session.enemies.find((candidate) => candidate.id === id);
    if (!enemy) continue;
    enemy.moveSpeed = restore.moveSpeed;
    enemy.chargeCooldown = restore.chargeCooldown;
  }
  state.participants.clear();
  state.participantCount = 0;
}

function saveParticipant(state: InternalState, enemy: CartEnemyState): void {
  if (state.participants.has(enemy.id)) return;
  state.participants.set(enemy.id, { moveSpeed: enemy.moveSpeed, chargeCooldown: enemy.chargeCooldown });
}

function placePursuers(session: Phase94Session, state: InternalState): void {
  const heading = session.car.heading;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  const candidates = session.enemies
    .filter((enemy) => enemy.alive && enemy.kind !== "boss" && enemy.kind !== "heavy")
    .sort((a, b) => Number(b.archetype === "striker") - Number(a.archetype === "striker"))
    .slice(0, 3);
  const lanes = [-4.8, 0, 4.8];
  candidates.forEach((enemy, index) => {
    saveParticipant(state, enemy);
    const point = clampField(
      session.car.position.x - fx * (10.5 + index * 2.6) + rx * lanes[index],
      session.car.position.z - fz * (10.5 + index * 2.6) + rz * lanes[index],
    );
    enemy.x = point.x;
    enemy.z = point.z;
    enemy.heading = Math.atan2(session.car.position.x - enemy.x, session.car.position.z - enemy.z);
    enemy.moveSpeed = Math.max(enemy.moveSpeed, CART_ESCAPE_PURSUER_SPEED + index * 0.16);
    enemy.aiClock = 0;
    enemy.chargeTime = 0;
    if (enemy.archetype === "striker") enemy.chargeCooldown = CART_ESCAPE_PURSUER_CHARGE_COOLDOWN + index * 0.06;
  });
  state.participantCount = candidates.length;
}

function placeBreakout(session: Phase94Session, state: InternalState): void {
  const candidates = session.enemies.filter((enemy) => enemy.alive && enemy.kind !== "boss").slice(0, 4);
  const angles = [0.15, Math.PI * 0.5 + 0.15, Math.PI + 0.15, Math.PI * 1.5 + 0.15];
  candidates.forEach((enemy, index) => {
    saveParticipant(state, enemy);
    const angle = angles[index];
    const point = clampField(
      session.car.position.x + Math.sin(angle) * 9.2,
      session.car.position.z + Math.cos(angle) * 9.2,
    );
    enemy.x = point.x;
    enemy.z = point.z;
    enemy.heading = Math.atan2(session.car.position.x - enemy.x, session.car.position.z - enemy.z);
    enemy.moveSpeed = Math.max(enemy.moveSpeed, 7.35);
    enemy.aiClock = 0;
    enemy.chargeTime = 0;
  });
  state.participantCount = candidates.length;
}

function startEscape(session: Phase94Session, state: InternalState): void {
  restoreParticipants(session, state);
  state.serial += 1;
  state.kind = state.serial % 2 === 1 ? "PURSUIT" : "BREAKOUT";
  state.label = labelFor(state.kind);
  state.active = true;
  state.secondsRemaining = CART_ESCAPE_DURATION;
  state.cooldownSeconds = 0;
  state.openingGraceSeconds = CART_ESCAPE_OPENING_GRACE;
  state.startX = session.car.position.x;
  state.startZ = session.car.position.z;
  state.nearestThreatDistance = 99;
  cancelCartRaidHazards(session as unknown as CartArenaSession, "FIELD");
  if (state.kind === "PURSUIT") placePursuers(session, state);
  else placeBreakout(session, state);
  session.lastReward = state.label;
  session.rewardTimer = Math.max(session.rewardTimer, 1.25);
}

function finishEscape(session: Phase94Session, state: InternalState): void {
  if (!state.active) return;
  restoreParticipants(session, state);
  state.active = false;
  state.secondsRemaining = 0;
  state.openingGraceSeconds = 0;
  state.cooldownSeconds = CART_ESCAPE_COOLDOWN;
  state.nearestThreatDistance = 99;
  session.gas = Math.min(1, session.gas + 0.02);
  session.turboRechargeTimer += 0.28;
  session.lastReward = "ESCAPE CLEAR · TURN AND ATTACK";
  session.rewardTimer = Math.max(session.rewardTimer, 1.25);
}

function updateParticipants(session: Phase94Session, state: InternalState): void {
  let nearest = 99;
  for (const id of state.participants.keys()) {
    const enemy = session.enemies.find((candidate) => candidate.id === id && candidate.alive);
    if (!enemy) continue;
    const distance = Math.hypot(enemy.x - session.car.position.x, enemy.z - session.car.position.z);
    nearest = Math.min(nearest, distance);
    if (state.kind === "PURSUIT") {
      enemy.moveSpeed = Math.max(enemy.moveSpeed, CART_ESCAPE_PURSUER_SPEED);
      if (enemy.archetype === "striker" && (enemy.chargeTime ?? 0) <= 0) {
        enemy.chargeCooldown = Math.min(enemy.chargeCooldown ?? CART_ESCAPE_PURSUER_CHARGE_COOLDOWN, CART_ESCAPE_PURSUER_CHARGE_COOLDOWN);
      }
    } else {
      enemy.moveSpeed = Math.max(enemy.moveSpeed, 7.35);
    }
  }
  state.nearestThreatDistance = nearest;
}

function updateEscape(session: Phase94Session, state: InternalState, delta: number): void {
  state.secondsRemaining = Math.max(0, state.secondsRemaining - delta);
  state.openingGraceSeconds = Math.max(0, state.openingGraceSeconds - delta);
  if (state.openingGraceSeconds > 0) cancelCartRaidHazards(session as unknown as CartArenaSession, "FIELD");
  updateParticipants(session, state);
  if (state.kind === "BREAKOUT") {
    const escaped = Math.hypot(session.car.position.x - state.startX, session.car.position.z - state.startZ) >= CART_ESCAPE_BREAKOUT_DISTANCE;
    if (escaped) {
      finishEscape(session, state);
      return;
    }
  }
  if (state.secondsRemaining <= 0) finishEscape(session, state);
}

function material(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
}

function buildVisuals(demo: Phase94Demo): EscapeVisualState {
  const root = new THREE.Group();
  root.name = "phase94-escape-rhythm-root";
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.18, 6, 48), material(0xff172e, 0.62));
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.1, 6, 40), material(0xffb000, 0.62));
  outerRing.rotation.x = Math.PI / 2;
  innerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = 0.2;
  innerRing.position.y = 0.22;
  outerRing.renderOrder = 13;
  innerRing.renderOrder = 13;
  outerRing.name = "phase94-escape-outer-ring";
  innerRing.name = "phase94-escape-inner-ring";
  const arrows = Array.from({ length: 3 }, (_, index) => {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 5), material(index === 1 ? 0xffb000 : 0xff1738, 0.82));
    arrow.rotation.x = Math.PI / 2;
    arrow.position.y = 0.32;
    arrow.renderOrder = 14;
    arrow.name = `phase94-escape-arrow-${index}`;
    root.add(arrow);
    return arrow;
  });
  root.add(outerRing, innerRing);
  demo.scene.add(root);
  const created = { root, outerRing, innerRing, arrows };
  visualByDemo.set(demo as unknown as object, created);
  return created;
}

function updateVisuals(demo: Phase94Demo, delta: number): void {
  const visual = visualByDemo.get(demo as unknown as object) ?? buildVisuals(demo);
  const state = getCartEscapeRhythmState(demo.session);
  visual.root.visible = isCartTurboHuntEnabled(demo.session) && state.active;
  if (!visual.root.visible) return;
  visual.root.position.set(demo.session.car.position.x, 0, demo.session.car.position.z);
  visual.root.rotation.y = demo.session.car.heading;
  const pulse = 0.94 + Math.sin(performance.now() * 0.02) * 0.08;
  visual.outerRing.scale.setScalar(pulse);
  visual.innerRing.scale.setScalar(1.02 + (1 - pulse) * 0.55);
  visual.outerRing.rotation.z += Math.max(0, delta) * 3.2;
  visual.innerRing.rotation.z -= Math.max(0, delta) * 4.1;
  const lanes = [-2.4, 0, 2.4];
  visual.arrows.forEach((arrow, index) => {
    arrow.position.x = lanes[index];
    arrow.position.z = -4.8 - index * 0.45;
    arrow.scale.setScalar(0.9 + Math.sin(performance.now() * 0.018 + index) * 0.12);
  });
  visual.root.userData.cartEscapeActive = state.active;
  visual.root.userData.cartEscapeKind = state.kind;
  visual.root.userData.cartEscapeSerial = state.serial;
  visual.root.userData.cartEscapeParticipants = state.participantCount;
}

export function installCartRoguePhase94EscapeRhythmDirector2(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase94Session;
  const previousStep = prototype.step;
  prototype.step = function phase94EscapeRhythmDirector2Step(
    this: Phase94Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previousStep.call(this, input, fixedDelta);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return;
    const delta = clamp(fixedDelta, 0, 0.05);
    const state = stateFor(this);
    const titan = getCartTitanBossState(session);
    if (titan.bossActive) {
      if (state.active) finishEscape(this, state);
      state.cooldownSeconds = Math.max(state.cooldownSeconds, 4);
    } else if (state.active) {
      updateEscape(this, state, delta);
    } else {
      state.cooldownSeconds = Math.max(0, state.cooldownSeconds - delta);
      if (state.cooldownSeconds <= 0 && cartEncounterAllowsChaseStart(session)) startEscape(this, state);
    }
    state.broadcastClock += delta;
    if (state.broadcastClock >= 0.1) {
      state.broadcastClock %= 0.1;
      broadcast(state);
    }
  };

  const demoPrototype = CartRogueWebGLDemo.prototype as unknown as Phase94Demo;
  const previousBuildWorld = demoPrototype.buildWorld;
  demoPrototype.buildWorld = function phase94EscapeRhythmBuildWorld(this: Phase94Demo): void {
    previousBuildWorld.call(this);
    buildVisuals(this);
  };
  const previousUpdateVisuals = demoPrototype.updateVisuals;
  demoPrototype.updateVisuals = function phase94EscapeRhythmUpdateVisuals(this: Phase94Demo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    updateVisuals(this, delta);
  };
}

installCartRoguePhase94EscapeRhythmDirector2();
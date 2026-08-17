import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import type { CartEnemyState } from "./CartCombat";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { getCartTitanBossState } from "./CartRoguePhase83Boss2";
import { getCartThreatDodgeState } from "./CartRoguePhase84ThreatDodge";

export type CartTitanPredatorMode = "HUNT" | "SURVIVE" | "COUNTER";

export interface CartTitanPredatorSnapshot {
  active: boolean;
  mode: CartTitanPredatorMode;
  cycleSerial: number;
  secondsRemaining: number;
  counterSeconds: number;
  pressure: number;
  perfectDodges: number;
  surviveSerial: number;
}

interface InternalPredatorState extends CartTitanPredatorSnapshot {
  cooldownSeconds: number;
  broadcastClock: number;
  furySeen: boolean;
  prePredatorMoveSpeed: number;
  prePredatorChargeCooldown: number;
  lastPerfectDodgeSerial: number;
}

interface Phase86Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  gas: number;
  turboRechargeTimer: number;
  rewardTimer: number;
  lastReward: string | null;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface Phase86Demo {
  session: CartArenaSession;
  enemyGroups: Map<string, THREE.Group>;
  buildEnemies(enemies: CartArenaSessionSnapshot["enemies"]): void;
  updateVisuals(delta: number): void;
}

interface PredatorVisualState {
  root: THREE.Group;
  predatorRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  counterRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  warningSpikes: THREE.Group;
}

const stateBySession = new WeakMap<object, InternalPredatorState>();
const visualByDemo = new WeakMap<object, PredatorVisualState>();
let latestPredatorSnapshot: CartTitanPredatorSnapshot | null = null;

export const CART_TITAN_PREDATOR_SNAPSHOT_EVENT = "cart-titan-predator-snapshot";
export const CART_TITAN_PREDATOR_SURVIVE_SECONDS = 7.5;
export const CART_TITAN_PREDATOR_COUNTER_SECONDS = 3.2;
export const CART_TITAN_PREDATOR_CYCLE_COOLDOWN = 10.5;
export const CART_TITAN_PREDATOR_SPEED = 4.45;
export const CART_TITAN_PREDATOR_CHARGE_COOLDOWN = 0.38;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function internalState(session: CartArenaSession | Phase86Session): InternalPredatorState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalPredatorState = {
    active: false,
    mode: "HUNT",
    cycleSerial: 0,
    secondsRemaining: 0,
    counterSeconds: 0,
    pressure: 0,
    perfectDodges: 0,
    surviveSerial: 0,
    cooldownSeconds: 1.8,
    broadcastClock: 0,
    furySeen: false,
    prePredatorMoveSpeed: 3.82,
    prePredatorChargeCooldown: 0.82,
    lastPerfectDodgeSerial: 0,
  };
  stateBySession.set(key, created);
  return created;
}

function snapshotOf(state: InternalPredatorState): CartTitanPredatorSnapshot {
  return {
    active: state.active,
    mode: state.mode,
    cycleSerial: state.cycleSerial,
    secondsRemaining: state.secondsRemaining,
    counterSeconds: state.counterSeconds,
    pressure: state.pressure,
    perfectDodges: state.perfectDodges,
    surviveSerial: state.surviveSerial,
  };
}

export function getCartTitanPredatorState(session: CartArenaSession): CartTitanPredatorSnapshot {
  return snapshotOf(internalState(session));
}

export function getLatestCartTitanPredatorState(): CartTitanPredatorSnapshot | null {
  return latestPredatorSnapshot ? { ...latestPredatorSnapshot } : null;
}

function broadcast(state: InternalPredatorState): void {
  const snapshot = snapshotOf(state);
  latestPredatorSnapshot = snapshot;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CartTitanPredatorSnapshot>(CART_TITAN_PREDATOR_SNAPSHOT_EVENT, { detail: snapshot }));
  }
}

function setReward(session: Phase86Session, text: string, seconds = 2): void {
  session.lastReward = text;
  session.rewardTimer = Math.max(session.rewardTimer, seconds);
}

function bossOf(session: Phase86Session): CartEnemyState | null {
  return session.enemies.find((enemy) => enemy.kind === "boss" && enemy.alive) ?? null;
}

function beginSurvive(session: Phase86Session, state: InternalPredatorState, boss: CartEnemyState): void {
  state.mode = "SURVIVE";
  state.active = true;
  state.cycleSerial += 1;
  state.surviveSerial += 1;
  state.secondsRemaining = CART_TITAN_PREDATOR_SURVIVE_SECONDS;
  state.counterSeconds = 0;
  state.pressure = 1;
  state.perfectDodges = 0;
  state.prePredatorMoveSpeed = boss.moveSpeed;
  state.prePredatorChargeCooldown = boss.chargeCooldown ?? 0.82;
  state.lastPerfectDodgeSerial = getCartThreatDodgeState(session as unknown as CartArenaSession).perfectDodgeSerial;
  boss.moveSpeed = Math.max(CART_TITAN_PREDATOR_SPEED, boss.moveSpeed);
  boss.chargeCooldown = Math.min(boss.chargeCooldown ?? CART_TITAN_PREDATOR_CHARGE_COOLDOWN, CART_TITAN_PREDATOR_CHARGE_COOLDOWN);
  boss.weakPointExposed = false;
  setReward(session, `PREDATOR MODE · SURVIVE ${CART_TITAN_PREDATOR_SURVIVE_SECONDS.toFixed(1)}s`, 2.1);
}

function beginCounter(session: Phase86Session, state: InternalPredatorState, boss: CartEnemyState): void {
  state.mode = "COUNTER";
  state.active = true;
  state.secondsRemaining = 0;
  state.counterSeconds = CART_TITAN_PREDATOR_COUNTER_SECONDS;
  state.pressure = 0;
  boss.chargeTime = 0;
  boss.chargeCooldown = 4.2;
  boss.moveSpeed = 2.05;
  boss.weakPointExposed = true;
  session.gas = Math.min(1, session.gas + 0.035);
  session.turboRechargeTimer += 0.55;
  session.car.collisionImpact = Math.max(session.car.collisionImpact, 0.92);
  setReward(session, "TITAN OVERHEAT · COUNTER WINDOW", 2.4);
}

function endCounter(state: InternalPredatorState, boss: CartEnemyState): void {
  state.mode = "HUNT";
  state.active = false;
  state.counterSeconds = 0;
  state.pressure = 0;
  state.cooldownSeconds = CART_TITAN_PREDATOR_CYCLE_COOLDOWN;
  boss.moveSpeed = Math.max(3.82, state.prePredatorMoveSpeed);
  boss.chargeCooldown = 0.82;
  boss.weakPointExposed = true;
}

function resetPredator(state: InternalPredatorState, boss: CartEnemyState | null): void {
  if (boss && state.active) {
    boss.moveSpeed = Math.max(3.82, state.prePredatorMoveSpeed);
    boss.chargeCooldown = Math.max(0.82, state.prePredatorChargeCooldown);
  }
  state.active = false;
  state.mode = "HUNT";
  state.secondsRemaining = 0;
  state.counterSeconds = 0;
  state.pressure = 0;
  state.furySeen = false;
  state.cooldownSeconds = 1.8;
}

function updateSurvive(session: Phase86Session, state: InternalPredatorState, boss: CartEnemyState, delta: number): void {
  state.secondsRemaining = Math.max(0, state.secondsRemaining - delta);
  const dodge = getCartThreatDodgeState(session as unknown as CartArenaSession);
  if (dodge.perfectDodgeSerial > state.lastPerfectDodgeSerial) {
    const deltaDodges = dodge.perfectDodgeSerial - state.lastPerfectDodgeSerial;
    state.lastPerfectDodgeSerial = dodge.perfectDodgeSerial;
    state.perfectDodges += deltaDodges;
    state.secondsRemaining = Math.max(0, state.secondsRemaining - Math.min(1.2, deltaDodges * 0.55));
    session.turboRechargeTimer += Math.min(0.45, deltaDodges * 0.18);
    setReward(session, "PERFECT DODGE · TITAN OVERHEATING", 1.25);
  }

  const elapsedRatio = 1 - state.secondsRemaining / CART_TITAN_PREDATOR_SURVIVE_SECONDS;
  state.pressure = clamp(0.78 + elapsedRatio * 0.22, 0, 1);
  boss.moveSpeed = Math.max(CART_TITAN_PREDATOR_SPEED, boss.moveSpeed);
  boss.chargeCooldown = Math.min(boss.chargeCooldown ?? CART_TITAN_PREDATOR_CHARGE_COOLDOWN, CART_TITAN_PREDATOR_CHARGE_COOLDOWN);
  boss.weakPointExposed = false;
  if (state.secondsRemaining <= 0) beginCounter(session, state, boss);
}

function updateCounter(state: InternalPredatorState, boss: CartEnemyState, delta: number): void {
  state.counterSeconds = Math.max(0, state.counterSeconds - delta);
  boss.chargeTime = 0;
  boss.chargeCooldown = Math.max(boss.chargeCooldown ?? 0, 3.7);
  boss.moveSpeed = 2.05;
  boss.weakPointExposed = true;
  if (state.counterSeconds <= 0) endCounter(state, boss);
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

function attachPredatorVisuals(demo: Phase86Demo): PredatorVisualState | null {
  const existing = visualByDemo.get(demo as unknown as object);
  if (existing) return existing;
  const boss = demo.session.enemies.find((enemy) => enemy.kind === "boss");
  if (!boss) return null;
  const group = demo.enemyGroups.get(boss.id);
  if (!group) return null;

  const root = new THREE.Group();
  root.name = "phase86-titan-predator-root";
  const predatorRing = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.13, 6, 44), basicMaterial(0xff4059, 0));
  predatorRing.name = "phase86-titan-predator-ring";
  predatorRing.rotation.x = Math.PI / 2;
  predatorRing.position.y = 0.22;
  predatorRing.renderOrder = 9;

  const counterRing = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.15, 6, 44), basicMaterial(0x83fbff, 0));
  counterRing.name = "phase86-titan-counter-ring";
  counterRing.rotation.x = Math.PI / 2;
  counterRing.position.y = 0.28;
  counterRing.renderOrder = 9;

  const warningSpikes = new THREE.Group();
  warningSpikes.name = "phase86-titan-predator-spikes";
  for (let index = 0; index < 4; index += 1) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 4), basicMaterial(0xff6c70, 0.65));
    const angle = index * Math.PI / 2;
    spike.position.set(Math.sin(angle) * 4.5, 3.1, Math.cos(angle) * 4.5);
    spike.rotation.z = Math.sin(angle) * 0.45;
    spike.rotation.x = Math.cos(angle) * -0.45;
    warningSpikes.add(spike);
  }

  root.add(predatorRing, counterRing, warningSpikes);
  group.add(root);
  const created = { root, predatorRing, counterRing, warningSpikes };
  visualByDemo.set(demo as unknown as object, created);
  return created;
}

function updatePredatorVisuals(demo: Phase86Demo, delta: number): void {
  const visual = visualByDemo.get(demo as unknown as object) ?? attachPredatorVisuals(demo);
  if (!visual) return;
  const state = getCartTitanPredatorState(demo.session);
  const titan = getCartTitanBossState(demo.session);
  visual.root.visible = titan.bossActive && titan.stage === "FURY";
  if (!visual.root.visible) return;

  const survive = state.mode === "SURVIVE";
  const counter = state.mode === "COUNTER";
  visual.predatorRing.visible = survive;
  visual.counterRing.visible = counter;
  visual.warningSpikes.visible = survive;
  if (survive) {
    visual.predatorRing.material.opacity = 0.28 + state.pressure * 0.42;
    visual.predatorRing.scale.setScalar(0.92 + Math.sin(performance.now() * 0.012) * 0.08);
    visual.predatorRing.rotation.z += Math.max(0, delta) * (2.4 + state.pressure * 2.1);
    visual.warningSpikes.rotation.y -= Math.max(0, delta) * 1.8;
  }
  if (counter) {
    const ratio = clamp(state.counterSeconds / CART_TITAN_PREDATOR_COUNTER_SECONDS, 0, 1);
    visual.counterRing.material.opacity = 0.3 + ratio * 0.46;
    visual.counterRing.scale.setScalar(0.9 + (1 - ratio) * 0.55);
    visual.counterRing.rotation.z -= Math.max(0, delta) * 3.2;
  }
  visual.root.userData.cartPredatorMode = state.mode;
  visual.root.userData.cartPredatorPressure = state.pressure;
  visual.root.userData.cartPredatorCounterSeconds = state.counterSeconds;
  visual.root.userData.cartPredatorPerfectDodges = state.perfectDodges;
}

export function installCartRoguePhase86BossPredator(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase86Session;
  const previousStep = sessionPrototype.step;
  sessionPrototype.step = function phase86BossPredatorStep(
    this: Phase86Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previousStep.call(this, input, fixedDelta);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return;
    const state = internalState(this);
    const delta = clamp(fixedDelta, 0, 0.05);
    const titan = getCartTitanBossState(session);
    const boss = bossOf(this);

    if (!boss || !titan.bossActive || titan.stage !== "FURY") {
      resetPredator(state, boss);
    } else {
      if (!state.furySeen) {
        state.furySeen = true;
        state.cooldownSeconds = 1.8;
        state.lastPerfectDodgeSerial = getCartThreatDodgeState(session).perfectDodgeSerial;
      }
      if (state.mode === "SURVIVE") {
        updateSurvive(this, state, boss, delta);
      } else if (state.mode === "COUNTER") {
        updateCounter(state, boss, delta);
      } else {
        state.cooldownSeconds = Math.max(0, state.cooldownSeconds - delta);
        if (state.cooldownSeconds <= 0) beginSurvive(this, state, boss);
      }
    }

    state.broadcastClock += delta;
    if (state.broadcastClock >= 0.1) {
      state.broadcastClock %= 0.1;
      broadcast(state);
    }
  };

  const demoPrototype = CartRogueWebGLDemo.prototype as unknown as Phase86Demo;
  const previousBuildEnemies = demoPrototype.buildEnemies;
  demoPrototype.buildEnemies = function phase86BossPredatorBuildEnemies(
    this: Phase86Demo,
    enemies: CartArenaSessionSnapshot["enemies"],
  ): void {
    previousBuildEnemies.call(this, enemies);
    attachPredatorVisuals(this);
  };
  const previousUpdateVisuals = demoPrototype.updateVisuals;
  demoPrototype.updateVisuals = function phase86BossPredatorUpdateVisuals(this: Phase86Demo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    updatePredatorVisuals(this, delta);
  };
}

installCartRoguePhase86BossPredator();

import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { getCartRunDifficulty, type CartRunDifficulty } from "./CartRunDifficulty";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { getCartRaidHazardState } from "./CartRoguePhase88RaidHazards";

export interface CartPlayerDamageFeedbackSnapshot {
  active: boolean;
  hitSerial: number;
  flashSeconds: number;
  shakeSeconds: number;
  label: string;
  gasLossPercent: number;
  speedLossPercent: number;
}

interface InternalDamageState extends CartPlayerDamageFeedbackSnapshot {
  difficulty: CartRunDifficulty;
  seenRaidHitSerial: number;
  broadcastClock: number;
}

interface Phase91Session {
  car: CartArenaSession["car"];
  rewardTimer: number;
  lastReward: string | null;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface GasLifeSession {
  gas: number;
}

interface Phase91Demo {
  session: CartArenaSession;
  playerVisual: THREE.Group;
  cameraShake: number;
  impactFlash: number;
  impactOverlayMaterial: THREE.MeshBasicMaterial;
  updateVisuals(delta: number): void;
  emitImpactSparks(position: THREE.Vector3, count: number): void;
}

const stateBySession = new WeakMap<object, InternalDamageState>();
const seenVisualSerial = new WeakMap<object, number>();
let latestSnapshot: CartPlayerDamageFeedbackSnapshot | null = null;

export const CART_PLAYER_DAMAGE_FEEDBACK_EVENT = "cart-player-damage-feedback";
export const CART_PLAYER_DAMAGE_FLASH_SECONDS = 0.62;
export const CART_PLAYER_DAMAGE_SHAKE_SECONDS = 0.48;
export const CART_PLAYER_DAMAGE_GAS_LOSS_PERCENT = 8;
export const CART_HARD_PLAYER_DAMAGE_GAS_LOSS_PERCENT = 34;
export const CART_PLAYER_DAMAGE_SPEED_LOSS_PERCENT = 42;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function cartRaidGasLifeDamagePercent(difficulty: CartRunDifficulty): number {
  return difficulty === "hard"
    ? CART_HARD_PLAYER_DAMAGE_GAS_LOSS_PERCENT
    : CART_PLAYER_DAMAGE_GAS_LOSS_PERCENT;
}

export function cartGasLifeAfterDamage(gas: number, lossPercent: number): number {
  return Math.max(0, clamp(gas, 0, 1) - Math.max(0, lossPercent) / 100);
}

function applyGasLifeDamage(session: Phase91Session, lossPercent: number): number {
  const gasSession = session as unknown as GasLifeSession;
  const before = clamp(gasSession.gas, 0, 1);
  gasSession.gas = cartGasLifeAfterDamage(before, lossPercent);
  return before - gasSession.gas;
}

function stateFor(session: CartArenaSession | Phase91Session): InternalDamageState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const raid = getCartRaidHazardState(session as CartArenaSession);
  const difficulty = getCartRunDifficulty();
  const created: InternalDamageState = {
    active: false,
    hitSerial: raid.hitSerial,
    flashSeconds: 0,
    shakeSeconds: 0,
    label: "RAID HIT",
    gasLossPercent: cartRaidGasLifeDamagePercent(difficulty),
    speedLossPercent: CART_PLAYER_DAMAGE_SPEED_LOSS_PERCENT,
    difficulty,
    seenRaidHitSerial: raid.hitSerial,
    broadcastClock: 0,
  };
  stateBySession.set(key, created);
  return created;
}

function snapshotOf(state: InternalDamageState): CartPlayerDamageFeedbackSnapshot {
  return {
    active: state.active,
    hitSerial: state.hitSerial,
    flashSeconds: state.flashSeconds,
    shakeSeconds: state.shakeSeconds,
    label: state.label,
    gasLossPercent: state.gasLossPercent,
    speedLossPercent: state.speedLossPercent,
  };
}

export function getCartPlayerDamageFeedbackState(session: CartArenaSession): CartPlayerDamageFeedbackSnapshot {
  return snapshotOf(stateFor(session));
}

export function getLatestCartPlayerDamageFeedbackState(): CartPlayerDamageFeedbackSnapshot | null {
  return latestSnapshot ? { ...latestSnapshot } : null;
}

function broadcast(state: InternalDamageState): void {
  const snapshot = snapshotOf(state);
  latestSnapshot = snapshot;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CartPlayerDamageFeedbackSnapshot>(CART_PLAYER_DAMAGE_FEEDBACK_EVENT, { detail: snapshot }));
  }
}

function beginDamageFeedback(session: Phase91Session, state: InternalDamageState, label: string): void {
  state.hitSerial += 1;
  state.flashSeconds = CART_PLAYER_DAMAGE_FLASH_SECONDS;
  state.shakeSeconds = CART_PLAYER_DAMAGE_SHAKE_SECONDS;
  state.active = true;
  state.label = label || "RAID HIT";
  applyGasLifeDamage(session, state.gasLossPercent);
  session.car.collisionImpact = Math.max(session.car.collisionImpact, 1.45);
  session.car.bodyDamage = Math.min(1, session.car.bodyDamage + 0.1);
  session.car.smokeLevel = Math.max(session.car.smokeLevel, 0.16);
  session.lastReward = `DIRECT HIT · LIFE/GAS -${state.gasLossPercent}% · SPEED BREAK`;
  session.rewardTimer = Math.max(session.rewardTimer, 1.7);
  broadcast(state);
}

function updateDamageTimers(state: InternalDamageState, delta: number): void {
  state.flashSeconds = Math.max(0, state.flashSeconds - delta);
  state.shakeSeconds = Math.max(0, state.shakeSeconds - delta);
  state.active = state.flashSeconds > 0 || state.shakeSeconds > 0;
}

function installSessionFeedback(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase91Session;
  const previousStep = prototype.step;
  prototype.step = function phase91DamageFeedbackStep(
    this: Phase91Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previousStep.call(this, input, fixedDelta);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return;
    const delta = clamp(fixedDelta, 0, 0.05);
    const state = stateFor(this);
    const raid = getCartRaidHazardState(session);

    if (raid.hitSerial > state.seenRaidHitSerial) {
      state.seenRaidHitSerial = raid.hitSerial;
      beginDamageFeedback(this, state, raid.primaryLabel ?? "RAID HIT");
    } else {
      updateDamageTimers(state, delta);
    }

    state.broadcastClock += delta;
    if (state.broadcastClock >= 0.1) {
      state.broadcastClock %= 0.1;
      broadcast(state);
    }
  };
}

function installWebGLFeedback(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase91Demo;
  const previousUpdateVisuals = prototype.updateVisuals;
  prototype.updateVisuals = function phase91DamageFeedbackVisuals(this: Phase91Demo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    const feedback = getCartPlayerDamageFeedbackState(this.session);
    const key = this as unknown as object;
    const previousSerial = seenVisualSerial.get(key) ?? 0;

    if (feedback.hitSerial > previousSerial) {
      seenVisualSerial.set(key, feedback.hitSerial);
      this.cameraShake = Math.max(this.cameraShake, 1.18);
      this.impactFlash = Math.max(this.impactFlash, 1);
      this.impactOverlayMaterial.color.setHex(0xff1238);
      const position = new THREE.Vector3(
        this.session.car.position.x,
        Math.max(0.9, this.session.car.position.y + 0.9),
        this.session.car.position.z,
      );
      this.emitImpactSparks(position, 20);
    }

    const shock = clamp(feedback.flashSeconds / CART_PLAYER_DAMAGE_FLASH_SECONDS, 0, 1);
    if (shock > 0) {
      const squash = Math.sin((1 - shock) * Math.PI * 5.2) * shock;
      this.playerVisual.scale.set(1 + Math.abs(squash) * 0.055, 1 - Math.abs(squash) * 0.06, 1 + Math.abs(squash) * 0.045);
      this.playerVisual.rotation.y = squash * 0.045;
      this.cameraShake = Math.max(this.cameraShake, shock * 0.92);
      this.impactFlash = Math.max(this.impactFlash, shock * 0.92);
    } else {
      const settle = Math.min(1, Math.max(0, delta) * 15);
      this.playerVisual.scale.x += (1 - this.playerVisual.scale.x) * settle;
      this.playerVisual.scale.y += (1 - this.playerVisual.scale.y) * settle;
      this.playerVisual.scale.z += (1 - this.playerVisual.scale.z) * settle;
      this.playerVisual.rotation.y += (0 - this.playerVisual.rotation.y) * settle;
    }
  };
}

export function installCartRoguePhase91DamageFeedback2(): void {
  installSessionFeedback();
  installWebGLFeedback();
}

installCartRoguePhase91DamageFeedback2();

import * as THREE from "three";
import { CartArenaSession } from "./CartArenaSession";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

export const CART_BATTERY_DPR_CAP = 1.35;
export const CART_BATTERY_DPR_MIN_DROP = 0.14;
export const CART_BATTERY_DPR_EVALUATION_SECONDS = 0.75;

export interface CartBatteryPerformanceSnapshot {
  currentDpr: number;
  maxDpr: number;
  minDpr: number;
  frameMsEma: number;
  dprChanges: number;
  staticShadowMap: boolean;
  rafSuspended: boolean;
}

interface BatteryState extends CartBatteryPerformanceSnapshot {
  evaluationClock: number;
  overloadClock: number;
  recoveryClock: number;
  configured: boolean;
}

interface BatteryDemo {
  renderer: THREE.WebGLRenderer;
  mount: HTMLElement;
  session: CartArenaSession;
  playerVisual: THREE.Group;
  enemyGroups: Map<string, THREE.Group>;
  resourceGroups: Map<string, THREE.Group>;
  obstacleGroups: Map<string, THREE.Group>;
  frameId: number;
  lastTime: number;
  paused: boolean;
  failed: boolean;
  disposed: boolean;
  animate(now: number): void;
  updateVisuals(delta: number): void;
  pause(): void;
  resume(): void;
}

const stateByDemo = new WeakMap<object, BatteryState>();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function cartBatteryDprBounds(devicePixelRatio: number): { min: number; max: number } {
  const safeDeviceDpr = Number.isFinite(devicePixelRatio) ? Math.max(1, devicePixelRatio) : 1;
  const max = Math.min(safeDeviceDpr, CART_BATTERY_DPR_CAP);
  const min = Math.max(1, max - CART_BATTERY_DPR_MIN_DROP);
  return { min, max };
}

export function cartBatteryNextDpr(
  current: number,
  min: number,
  max: number,
  frameMsEma: number,
  overloadSeconds: number,
  recoverySeconds: number,
): number {
  const safeCurrent = clamp(current, min, max);
  if (frameMsEma >= 22 && overloadSeconds >= 0.75) {
    return clamp(safeCurrent - 0.08, min, max);
  }
  if (frameMsEma >= 18.6 && overloadSeconds >= 1.5) {
    return clamp(safeCurrent - 0.05, min, max);
  }
  if (frameMsEma <= 17.1 && recoverySeconds >= 5) {
    return clamp(safeCurrent + 0.025, min, max);
  }
  return safeCurrent;
}

function createState(): BatteryState {
  const deviceDpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const bounds = cartBatteryDprBounds(deviceDpr);
  return {
    currentDpr: bounds.max,
    maxDpr: bounds.max,
    minDpr: bounds.min,
    frameMsEma: 16.67,
    dprChanges: 0,
    staticShadowMap: false,
    rafSuspended: false,
    evaluationClock: 0,
    overloadClock: 0,
    recoveryClock: 0,
    configured: false,
  };
}

function stateFor(demo: BatteryDemo): BatteryState {
  const key = demo as unknown as object;
  const existing = stateByDemo.get(key);
  if (existing) return existing;
  const created = createState();
  stateByDemo.set(key, created);
  return created;
}

export function getCartBatteryPerformanceSnapshot(demo: CartRogueWebGLDemo): CartBatteryPerformanceSnapshot {
  const state = stateFor(demo as unknown as BatteryDemo);
  return {
    currentDpr: state.currentDpr,
    maxDpr: state.maxDpr,
    minDpr: state.minDpr,
    frameMsEma: state.frameMsEma,
    dprChanges: state.dprChanges,
    staticShadowMap: state.staticShadowMap,
    rafSuspended: state.rafSuspended,
  };
}

function disableDynamicShadowCasting(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = false;
  });
}

function applyRendererSize(demo: BatteryDemo, state: BatteryState): void {
  const width = Math.max(1, demo.mount.clientWidth);
  const height = Math.max(1, demo.mount.clientHeight);
  demo.renderer.setPixelRatio(state.currentDpr);
  demo.renderer.setSize(width, height, false);
  demo.renderer.domElement.dataset.batteryDpr = state.currentDpr.toFixed(2);
}

function configureBatteryRendering(demo: BatteryDemo, state: BatteryState): void {
  if (state.configured || !isCartTurboHuntEnabled(demo.session)) return;
  state.configured = true;

  // Vehicles, pickups and smashable rocks already use authored contact shadows.
  // Keep those cheap moving shadows and bake the expensive directional shadow map once.
  disableDynamicShadowCasting(demo.session.car.group);
  disableDynamicShadowCasting(demo.playerVisual);
  demo.enemyGroups.forEach(disableDynamicShadowCasting);
  demo.resourceGroups.forEach(disableDynamicShadowCasting);
  demo.obstacleGroups.forEach(disableDynamicShadowCasting);

  demo.renderer.shadowMap.autoUpdate = false;
  demo.renderer.shadowMap.needsUpdate = true;
  state.staticShadowMap = true;
  applyRendererSize(demo, state);
  demo.renderer.domElement.dataset.batteryProfile = "performance-battery-2";
  demo.renderer.domElement.dataset.staticShadowMap = "true";
}

function updateAdaptiveDpr(demo: BatteryDemo, state: BatteryState, delta: number): void {
  const frameMs = clamp(delta * 1000, 1, 50);
  state.frameMsEma += (frameMs - state.frameMsEma) * 0.08;
  state.evaluationClock += delta;
  if (state.frameMsEma >= 18.6) {
    state.overloadClock += delta;
    state.recoveryClock = 0;
  } else if (state.frameMsEma <= 17.1) {
    state.recoveryClock += delta;
    state.overloadClock = Math.max(0, state.overloadClock - delta * 0.5);
  } else {
    state.overloadClock = Math.max(0, state.overloadClock - delta * 0.35);
    state.recoveryClock = Math.max(0, state.recoveryClock - delta * 0.5);
  }

  if (state.evaluationClock < CART_BATTERY_DPR_EVALUATION_SECONDS) return;
  state.evaluationClock %= CART_BATTERY_DPR_EVALUATION_SECONDS;
  const next = cartBatteryNextDpr(
    state.currentDpr,
    state.minDpr,
    state.maxDpr,
    state.frameMsEma,
    state.overloadClock,
    state.recoveryClock,
  );
  if (Math.abs(next - state.currentDpr) < 0.001) return;
  state.currentDpr = next;
  state.dprChanges += 1;
  state.overloadClock = 0;
  state.recoveryClock = 0;
  applyRendererSize(demo, state);
}

export function installCartRoguePhase79PerformanceBattery(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as BatteryDemo;
  const previousUpdateVisuals = prototype.updateVisuals;
  const previousPause = prototype.pause;
  const previousResume = prototype.resume;

  prototype.updateVisuals = function batteryAwareVisualUpdate(this: BatteryDemo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    const state = stateFor(this);
    configureBatteryRendering(this, state);
    updateAdaptiveDpr(this, state, delta);
  };

  prototype.pause = function batteryAwarePause(this: BatteryDemo): void {
    previousPause.call(this);
    const state = stateFor(this);
    cancelAnimationFrame(this.frameId);
    state.rafSuspended = true;
    this.renderer.domElement.dataset.rafSuspended = "true";
  };

  prototype.resume = function batteryAwareResume(this: BatteryDemo): void {
    const state = stateFor(this);
    const wasSuspended = state.rafSuspended;
    previousResume.call(this);
    if (!wasSuspended || this.failed || this.disposed || this.paused) return;
    state.rafSuspended = false;
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.animate);
    this.renderer.domElement.dataset.rafSuspended = "false";
  };
}

installCartRoguePhase79PerformanceBattery();

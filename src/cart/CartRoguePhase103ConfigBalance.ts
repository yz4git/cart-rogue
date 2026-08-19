import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import {
  CART_ROGUE_CAMERA_DISTANCE_MAX,
  CART_ROGUE_CAMERA_DISTANCE_MIN,
  CART_ROGUE_CONFIG_EVENT,
  loadCartRogueConfig,
  parseCartRogueConfig,
  type CartRogueConfig,
} from "./CartRogueConfig";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

export const CART_PHASE103_TITAN_HP_MULTIPLIER = 10;
export const CART_PHASE103_PREVIOUS_TITAN_HP = 820;
export const CART_PHASE103_TITAN_MAX_HP = CART_PHASE103_PREVIOUS_TITAN_HP * CART_PHASE103_TITAN_HP_MULTIPLIER;
export const CART_PHASE103_GROUND_GUARD = "phase103-rebuild-ground-dedup";

const PATCHED_KEY = "__cartRoguePhase103ConfigBalancePatched__";
const RETIRED_GROUND_NAMES = new Set([
  "phase34-floor-detail",
  "phase35-road-mosaic",
  "phase38-reliable-road-mosaic",
]);

interface BossLike {
  kind: string;
  alive: boolean;
  hp: number;
  maxHp: number;
}

interface Phase103Session {
  enemies: BossLike[];
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface CameraSnapshot {
  x: number;
  z: number;
}

interface Phase103Demo {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  buildWorld(): void;
  applyCameraPresentation(snapshot: CameraSnapshot): void;
}

const scaledBosses = new WeakSet<object>();
let activeCameraDistance = loadCartRogueConfig().cameraDistance;

function clampCameraDistance(value: number): number {
  return Math.min(CART_ROGUE_CAMERA_DISTANCE_MAX, Math.max(CART_ROGUE_CAMERA_DISTANCE_MIN, value));
}

export function scaleCartTitanHpForPhase103(boss: BossLike): boolean {
  if (!boss.alive || scaledBosses.has(boss as object)) return false;
  const previousMax = Math.max(1, boss.maxHp);
  const hpRatio = Math.max(0, Math.min(1, boss.hp / previousMax));
  boss.maxHp = CART_PHASE103_TITAN_MAX_HP;
  boss.hp = Math.round(CART_PHASE103_TITAN_MAX_HP * hpRatio);
  scaledBosses.add(boss as object);
  return true;
}

export function retireRebuiltLegacyGroundLayers(scene: THREE.Scene): number {
  let retired = 0;
  scene.traverse((object) => {
    if (!RETIRED_GROUND_NAMES.has(object.name)) return;
    object.visible = false;
    if (object.name === "phase38-reliable-road-mosaic") object.position.y = -20;
    retired += 1;
  });
  return retired;
}

export function applyCartCameraDistance(
  camera: THREE.PerspectiveCamera,
  snapshot: CameraSnapshot,
  requestedDistance = activeCameraDistance,
): void {
  const distance = clampCameraDistance(requestedDistance);
  if (Math.abs(distance - 1) < 0.0001) return;

  camera.position.x = snapshot.x + (camera.position.x - snapshot.x) * distance;
  camera.position.z = snapshot.z + (camera.position.z - snapshot.z) * distance;
  const verticalScale = 1 + (distance - 1) * 0.28;
  camera.position.y = 0.95 + (camera.position.y - 0.95) * verticalScale;
}

function installConfigListener(): void {
  if (typeof window === "undefined") return;
  window.addEventListener(CART_ROGUE_CONFIG_EVENT, (event) => {
    const detail = (event as CustomEvent<CartRogueConfig>).detail;
    activeCameraDistance = detail
      ? parseCartRogueConfig(detail).cameraDistance
      : loadCartRogueConfig().cameraDistance;
  });
}

function patchSession(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase103Session & Record<string, unknown>;
  const marker = `${PATCHED_KEY}Session`;
  if (prototype[marker]) return;
  prototype[marker] = true;
  const originalStep = prototype.step;
  prototype.step = function phase103BalanceStep(this: Phase103Session, input: RallyInputState, fixedDelta?: number): void {
    originalStep.call(this, input, fixedDelta);
    const boss = this.enemies.find((enemy) => enemy.kind === "boss");
    if (boss?.alive) scaleCartTitanHpForPhase103(boss);
  };
}

function patchWebGLDemo(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase103Demo & Record<string, unknown>;
  const marker = `${PATCHED_KEY}WebGL`;
  if (prototype[marker]) return;
  prototype[marker] = true;

  const originalBuildWorld = prototype.buildWorld;
  prototype.buildWorld = function phase103GroundDedupBuild(this: Phase103Demo): void {
    originalBuildWorld.call(this);
    retireRebuiltLegacyGroundLayers(this.scene);
    this.scene.userData.cartGroundRebuildGuard = CART_PHASE103_GROUND_GUARD;
  };

  const originalCamera = prototype.applyCameraPresentation;
  prototype.applyCameraPresentation = function phase103CameraDistancePresentation(
    this: Phase103Demo,
    snapshot: CameraSnapshot,
  ): void {
    originalCamera.call(this, snapshot);
    applyCartCameraDistance(this.camera, snapshot);
  };
}

export function installCartRoguePhase103ConfigBalance(): void {
  installConfigListener();
  patchSession();
  patchWebGLDemo();
}

installCartRoguePhase103ConfigBalance();

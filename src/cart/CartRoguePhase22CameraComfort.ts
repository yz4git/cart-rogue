import * as THREE from "three";
import type { CartArenaSessionSnapshot } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase22CameraDemo {
  camera: THREE.PerspectiveCamera;
  steer: number;
  applyCameraPresentation(snapshot: CartArenaSessionSnapshot): void;
}

export const CART_PHASE22_CAMERA = {
  normalDistance: 10.6,
  speedDistance: 0.75,
  turboDistance: 12.0,
  normalHeight: 6.2,
  speedHeight: 0.3,
  turboHeight: 7.0,
} as const;

function applyComfortCamera(demo: Phase22CameraDemo, snapshot: CartArenaSessionSnapshot): void {
  const forwardX = Math.sin(snapshot.heading);
  const forwardZ = Math.cos(snapshot.heading);
  const rightX = Math.cos(snapshot.heading);
  const rightZ = -Math.sin(snapshot.heading);
  const speedRatio = THREE.MathUtils.clamp(Math.abs(snapshot.speed) / 26, 0, 1);
  const distance = snapshot.boostActive
    ? CART_PHASE22_CAMERA.turboDistance
    : CART_PHASE22_CAMERA.normalDistance + speedRatio * CART_PHASE22_CAMERA.speedDistance;
  const height = snapshot.boostActive
    ? CART_PHASE22_CAMERA.turboHeight
    : CART_PHASE22_CAMERA.normalHeight + speedRatio * CART_PHASE22_CAMERA.speedHeight;
  const lateral = -demo.steer * 0.28;

  demo.camera.position.set(
    snapshot.x - forwardX * distance + rightX * lateral,
    height,
    snapshot.z - forwardZ * distance + rightZ * lateral,
  );
  const lookDistance = 5.9 + speedRatio * 1.6;
  demo.camera.lookAt(
    snapshot.x + forwardX * lookDistance,
    0.95,
    snapshot.z + forwardZ * lookDistance,
  );
  demo.camera.fov = snapshot.boostActive ? 60.5 : 55 + speedRatio * 1.4;
  demo.camera.updateProjectionMatrix();
}

export function installCartRoguePhase22CameraComfort(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase22CameraDemo;
  const originalCamera = prototype.applyCameraPresentation;
  prototype.applyCameraPresentation = function phase22ComfortCamera(
    this: Phase22CameraDemo,
    snapshot: CartArenaSessionSnapshot,
  ): void {
    originalCamera.call(this, snapshot);
    applyComfortCamera(this, snapshot);
  };
}

installCartRoguePhase22CameraComfort();

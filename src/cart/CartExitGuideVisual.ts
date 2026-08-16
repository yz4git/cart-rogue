import * as THREE from "three";
import { CartArenaSession } from "./CartArenaSession";
import {
  CART_EXIT_GUIDE_MS,
  cartExitGuideAngle,
} from "./CartExitGuidance";
import { cartStageClearNumber } from "./CartRoguePhase16Flow";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface ExitGuideDemo {
  camera: THREE.PerspectiveCamera;
  session: CartArenaSession;
  elapsed: number;
  buildWorld(): void;
  updateVisuals(delta: number): void;
}

interface ExitGuideState {
  root: THREE.Group;
  remainingSeconds: number;
  delaySeconds: number;
  lastSignal: boolean;
  lastNodeId: string;
}

const states = new WeakMap<object, ExitGuideState>();

function createExitGuide(demo: ExitGuideDemo): ExitGuideState {
  const key = demo as unknown as object;
  const existing = states.get(key);
  if (existing) return existing;

  const material = new THREE.MeshBasicMaterial({
    color: 0xffe36e,
    transparent: true,
    opacity: 0.96,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const accent = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.88,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const root = new THREE.Group();
  root.name = "phase45-exit-guide";
  root.position.set(0, 0.15, -1.15);

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 4, 18), accent);
  halo.renderOrder = 1001;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.17, 0.018), material);
  shaft.position.y = 0.025;
  shaft.renderOrder = 1002;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.078, 0.14, 4), material);
  head.position.y = 0.16;
  head.rotation.y = Math.PI / 4;
  head.renderOrder = 1002;
  root.add(halo, shaft, head);
  root.visible = false;
  demo.camera.add(root);

  const created: ExitGuideState = {
    root,
    remainingSeconds: 0,
    delaySeconds: 0,
    lastSignal: false,
    lastNodeId: "",
  };
  states.set(key, created);
  return created;
}

function updateExitGuide(demo: ExitGuideDemo, delta: number): void {
  const state = createExitGuide(demo);
  const snapshot = demo.session.snapshot();
  if (snapshot.nodeId !== state.lastNodeId) state.lastSignal = false;
  const clearSignal = snapshot.runComplete
    || (snapshot.nodeKind !== "boss"
      && snapshot.enemiesTotal > 0
      && snapshot.enemiesAlive === 0
      && !snapshot.gateLocked);

  if (clearSignal && !state.lastSignal) {
    const angle = cartExitGuideAngle(snapshot);
    if (angle !== null) {
      state.remainingSeconds = CART_EXIT_GUIDE_MS / 1000;
      state.delaySeconds = cartStageClearNumber(snapshot.nodeId) === null ? 0.72 : 0;
    }
  }
  state.lastSignal = clearSignal;
  state.lastNodeId = snapshot.nodeId;

  if (state.delaySeconds > 0) {
    state.delaySeconds = Math.max(0, state.delaySeconds - delta);
    state.root.visible = false;
    return;
  }
  if (state.remainingSeconds <= 0) {
    state.root.visible = false;
    return;
  }

  const angle = cartExitGuideAngle(snapshot);
  if (angle === null) {
    state.root.visible = false;
    state.remainingSeconds = 0;
    return;
  }
  state.remainingSeconds = Math.max(0, state.remainingSeconds - delta);
  state.root.visible = state.remainingSeconds > 0;
  state.root.rotation.z = -angle;
  const pulse = 1 + Math.sin(demo.elapsed * 7.2) * 0.075;
  state.root.scale.setScalar(pulse);
}

export function installCartExitGuideVisual(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as ExitGuideDemo;
  const originalWorld = prototype.buildWorld;
  const originalUpdate = prototype.updateVisuals;

  prototype.buildWorld = function exitGuideWorld(this: ExitGuideDemo): void {
    originalWorld.call(this);
    createExitGuide(this);
  };
  prototype.updateVisuals = function exitGuideUpdate(this: ExitGuideDemo, delta: number): void {
    originalUpdate.call(this, delta);
    updateExitGuide(this, delta);
  };
}

installCartExitGuideVisual();

import * as THREE from "three";
import { CartArenaSession } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { getCartTurboAttackState } from "./CartRoguePhase54TurboAttack";
import { getCartPerfectStrikeState } from "./CartRoguePhase61PerfectStrike";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { getCartTurboHuntEventState } from "./CartRoguePhase81EventDirector2";

interface Phase82Demo {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  session: CartArenaSession;
  cameraShake: number;
  cameraRoll: number;
  buildWorld(): void;
  updateVisuals(delta: number): void;
}

interface ImpactSpeedVisualState {
  root: THREE.Group;
  halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  impactRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  overdriveRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  speedLines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  linePositions: Float32Array;
  impactPulse: number;
  lastAttackSerial: number;
  lastPerfectSerial: number;
  lastRewardSerial: number;
}

const stateByDemo = new WeakMap<object, ImpactSpeedVisualState>();
export const CART_IMPACT_SPEED_LINE_COUNT = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function cartImpactSpeedIntensity(speedRatio: number, boostActive: boolean, chain: number, overdriveSeconds: number): number {
  const speed = clamp((speedRatio - 0.52) / 0.75, 0, 1);
  const boost = boostActive ? 0.22 : 0;
  const chainLift = clamp(chain / 12, 0, 1) * 0.24;
  const overdrive = overdriveSeconds > 0 ? 0.24 : 0;
  return clamp(speed * 0.7 + boost + chainLift + overdrive, 0, 1);
}

export function cartImpactSpeedFov(speedRatio: number, boostActive: boolean, chain: number, overdriveSeconds: number): number {
  const intensity = cartImpactSpeedIntensity(speedRatio, boostActive, chain, overdriveSeconds);
  const attackLift = boostActive ? 1.1 : 0;
  return clamp(57.5 + intensity * 5.5 + attackLift, 56, 65.5);
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

function buildVisualState(demo: Phase82Demo): ImpactSpeedVisualState {
  const root = new THREE.Group();
  root.name = "phase82-impact-speed-root";
  root.visible = false;

  const halo = new THREE.Mesh(new THREE.RingGeometry(2.5, 3.25, 32), basicMaterial(0x62e5ff, 0));
  halo.name = "phase82-speed-halo";
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.06;
  halo.renderOrder = 5;

  const impactRing = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.12, 6, 36), basicMaterial(0xffe38a, 0));
  impactRing.name = "phase82-impact-ring";
  impactRing.rotation.x = Math.PI / 2;
  impactRing.position.y = 0.3;
  impactRing.renderOrder = 6;

  const overdriveRing = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.09, 6, 40), basicMaterial(0xff8fd1, 0));
  overdriveRing.name = "phase82-overdrive-ring";
  overdriveRing.rotation.x = Math.PI / 2;
  overdriveRing.position.y = 0.72;
  overdriveRing.renderOrder = 6;

  const linePositions = new Float32Array(CART_IMPACT_SPEED_LINE_COUNT * 2 * 3);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(linePositions, 3);
  position.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", position);
  const speedLines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0xb9f5ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  speedLines.name = "phase82-speed-lines";
  speedLines.frustumCulled = false;
  speedLines.renderOrder = 4;

  root.add(halo, impactRing, overdriveRing, speedLines);
  demo.scene.add(root);

  const attack = getCartTurboAttackState(demo.session);
  const perfect = getCartPerfectStrikeState(demo.session);
  const events = getCartTurboHuntEventState(demo.session);
  const created: ImpactSpeedVisualState = {
    root,
    halo,
    impactRing,
    overdriveRing,
    speedLines,
    linePositions,
    impactPulse: 0,
    lastAttackSerial: attack.serial,
    lastPerfectSerial: perfect.perfectSerial,
    lastRewardSerial: events.rewardSerial,
  };
  stateByDemo.set(demo as unknown as object, created);
  return created;
}

function updateSpeedLines(state: ImpactSpeedVisualState, intensity: number, elapsed: number): void {
  const length = 3.5 + intensity * 9.5;
  for (let index = 0; index < CART_IMPACT_SPEED_LINE_COUNT; index += 1) {
    const lane = (index % 6) - 2.5;
    const side = index < 6 ? -1 : 1;
    const x = side * (4.2 + Math.abs(lane) * 0.7);
    const y = 0.55 + (index % 4) * 0.62;
    const phase = ((elapsed * (7.5 + index * 0.17) + index * 0.47) % 1) * 8;
    const frontZ = 4.5 - phase;
    const offset = index * 6;
    state.linePositions[offset] = x;
    state.linePositions[offset + 1] = y;
    state.linePositions[offset + 2] = frontZ;
    state.linePositions[offset + 3] = x + lane * 0.06;
    state.linePositions[offset + 4] = y + 0.08;
    state.linePositions[offset + 5] = frontZ - length;
  }
  const attribute = state.speedLines.geometry.getAttribute("position") as THREE.BufferAttribute;
  attribute.needsUpdate = true;
}

function updateImpactState(demo: Phase82Demo, state: ImpactSpeedVisualState, delta: number): void {
  const session = demo.session;
  if (!isCartTurboHuntEnabled(session)) {
    state.root.visible = false;
    return;
  }
  state.root.visible = true;
  const events = getCartTurboHuntEventState(session);
  const attack = getCartTurboAttackState(session);
  const perfect = getCartPerfectStrikeState(session);

  if (attack.serial > state.lastAttackSerial || perfect.perfectSerial > state.lastPerfectSerial || events.rewardSerial > state.lastRewardSerial) {
    state.impactPulse = Math.max(state.impactPulse, perfect.perfectSerial > state.lastPerfectSerial ? 1 : 0.82);
  }
  state.lastAttackSerial = attack.serial;
  state.lastPerfectSerial = perfect.perfectSerial;
  state.lastRewardSerial = events.rewardSerial;
  state.impactPulse = Math.max(0, state.impactPulse - Math.max(0, delta) * 2.8);

  const car = session.car;
  const speedRatio = Math.abs(car.forwardVelocity) / Math.max(1, car.definition.maxSpeed);
  const intensity = cartImpactSpeedIntensity(speedRatio, car.boostActive, events.eventChain, events.overdriveSeconds);
  const targetFov = cartImpactSpeedFov(speedRatio, car.boostActive, events.eventChain, events.overdriveSeconds);
  const fovBlend = 1 - Math.exp(-Math.max(0, delta) * 6.5);
  const nextFov = THREE.MathUtils.lerp(demo.camera.fov, targetFov, fovBlend);
  if (Math.abs(nextFov - demo.camera.fov) > 0.01) {
    demo.camera.fov = nextFov;
    demo.camera.updateProjectionMatrix();
  }

  state.root.position.set(car.position.x, 0, car.position.z);
  state.root.rotation.y = car.heading;
  state.root.userData.cartSpeedIntensity = intensity;
  state.root.userData.cartImpactPulse = state.impactPulse;
  state.root.userData.cartEventChain = events.eventChain;
  state.root.userData.cartOverdriveSeconds = events.overdriveSeconds;

  state.halo.material.opacity = 0.06 + intensity * 0.32;
  state.halo.scale.setScalar(0.9 + intensity * 0.28);
  state.halo.rotation.z += delta * (0.45 + intensity * 1.2);

  state.impactRing.visible = state.impactPulse > 0.015;
  state.impactRing.material.opacity = state.impactPulse * 0.78;
  state.impactRing.scale.setScalar(0.78 + (1 - state.impactPulse) * 1.35);
  state.impactRing.rotation.z -= delta * 2.1;

  const overdriveActive = events.overdriveSeconds > 0;
  state.overdriveRing.visible = overdriveActive;
  state.overdriveRing.material.opacity = overdriveActive ? 0.34 + Math.sin(events.overdriveSeconds * 8) * 0.08 : 0;
  state.overdriveRing.scale.setScalar(0.96 + Math.sin(events.overdriveSeconds * 5) * 0.08);
  state.overdriveRing.rotation.z += delta * 2.7;

  updateSpeedLines(state, intensity, performance.now() * 0.001);
  state.speedLines.material.opacity = intensity * 0.72;

  if (state.impactPulse > 0.3) {
    demo.cameraShake = Math.max(demo.cameraShake, 0.08 + state.impactPulse * 0.16);
    demo.cameraRoll = Math.max(-0.075, Math.min(0.075, demo.cameraRoll + Math.sin(performance.now() * 0.025) * 0.006 * state.impactPulse));
  }
}

export function installCartRoguePhase82ImpactSpeed3(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase82Demo;
  const previousBuildWorld = prototype.buildWorld;
  prototype.buildWorld = function phase82ImpactSpeedBuildWorld(this: Phase82Demo): void {
    previousBuildWorld.call(this);
    buildVisualState(this);
  };

  const previousUpdateVisuals = prototype.updateVisuals;
  prototype.updateVisuals = function phase82ImpactSpeedUpdateVisuals(this: Phase82Demo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    const state = stateByDemo.get(this as unknown as object) ?? buildVisualState(this);
    updateImpactState(this, state, delta);
  };
}

installCartRoguePhase82ImpactSpeed3();

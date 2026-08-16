import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import { aliveCartEnemies, type CartEnemyState } from "./CartCombat";
import { cartArenaShapeForNode } from "./CartArenaShapes";
import { getCartTurboCombatState } from "./CartRoguePhase15Turbo";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { cartWorldNodeById, type CartWorldLocation, type CartWorldNode } from "./CartWorldGraph";

interface Phase44Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  location: CartWorldLocation;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface Phase44Demo {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  playerVisual: THREE.Group;
  session: CartArenaSession;
  steer: number;
  buildPlayerVisual(): void;
  updateVisuals(delta: number): void;
  applyCameraPresentation(snapshot: CartArenaSessionSnapshot): void;
}

interface Phase44VisualState {
  skidMesh: THREE.InstancedMesh;
  skidDummy: THREE.Object3D;
  skidCursor: number;
  lastSkidHeading: number;
}

const visualStates = new WeakMap<object, Phase44VisualState>();
const PIVOT_RATE_SCALE = 0.84;
const REAR_GATE_LANE_PADDING = 1.6;
const REAR_GATE_CONTACT_DEPTH = 2.45;
const REAR_GATE_RELEASE_DEPTH = 3.15;
const SKID_CAPACITY = 72;

export const CART_PHASE44_CAMERA = {
  normalDistance: 11.35,
  speedDistance: 0.8,
  turboDistance: 12.8,
  normalHeight: 6.72,
  speedHeight: 0.34,
  turboHeight: 7.52,
} as const;

export function cartPhase44TurboPivotScale(): number {
  return PIVOT_RATE_SCALE;
}

export function cartPhase44PivotVisualStrength(held: boolean, charge: number, steer: number): number {
  if (!held || Math.abs(steer) <= 0.035) return 0;
  return THREE.MathUtils.clamp(0.42 + THREE.MathUtils.clamp(charge, 0, 1) * 0.36 + Math.abs(steer) * 0.22, 0, 1);
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function axisToNext(from: CartWorldNode, to: CartWorldNode): { axis: "x" | "z"; sign: 1 | -1 } {
  const dx = to.rect.centerX - from.rect.centerX;
  const dz = to.rect.centerZ - from.rect.centerZ;
  if (Math.abs(dz) >= Math.abs(dx)) return { axis: "z", sign: dz >= 0 ? 1 : -1 };
  return { axis: "x", sign: dx >= 0 ? 1 : -1 };
}

function outgoingCorridor(node: CartWorldNode): CartWorldNode | null {
  for (const id of node.next) {
    const candidate = cartWorldNodeById(id);
    if (candidate?.kind === "corridor") return candidate;
  }
  return null;
}

function syncHorizontalVelocity(session: Phase44Session): void {
  const forwardX = Math.sin(session.car.heading);
  const forwardZ = Math.cos(session.car.heading);
  const rightX = Math.cos(session.car.heading);
  const rightZ = -Math.sin(session.car.heading);
  session.car.velocity.x = forwardX * session.car.forwardVelocity + rightX * session.car.lateralVelocity;
  session.car.velocity.z = forwardZ * session.car.forwardVelocity + rightZ * session.car.lateralVelocity;
  session.car.speed = Math.hypot(session.car.velocity.x, session.car.velocity.z);
}

function releaseClearedArenaRearGate(session: Phase44Session): boolean {
  const node = session.location.node;
  if (!cartArenaShapeForNode(node.id)) return false;
  if (aliveCartEnemies(session.enemies, node.id).length > 0) return false;
  const corridor = outgoingCorridor(node);
  if (!corridor) return false;

  const direction = axisToNext(node, corridor);
  const x = session.car.position.x;
  const z = session.car.position.z;
  let inRearGateLane = false;
  let nearRearFace = false;
  let targetX = x;
  let targetZ = z;

  if (direction.axis === "z") {
    const rearFace = node.rect.centerZ - direction.sign * node.rect.halfDepth;
    inRearGateLane = Math.abs(x - node.rect.centerX) <= corridor.rect.halfWidth + REAR_GATE_LANE_PADDING;
    nearRearFace = Math.abs(z - rearFace) <= REAR_GATE_CONTACT_DEPTH;
    targetZ = rearFace + direction.sign * REAR_GATE_RELEASE_DEPTH;
    targetX = clamp(x, node.rect.centerX - corridor.rect.halfWidth, node.rect.centerX + corridor.rect.halfWidth);
  } else {
    const rearFace = node.rect.centerX - direction.sign * node.rect.halfWidth;
    inRearGateLane = Math.abs(z - node.rect.centerZ) <= corridor.rect.halfDepth + REAR_GATE_LANE_PADDING;
    nearRearFace = Math.abs(x - rearFace) <= REAR_GATE_CONTACT_DEPTH;
    targetX = rearFace + direction.sign * REAR_GATE_RELEASE_DEPTH;
    targetZ = clamp(z, node.rect.centerZ - corridor.rect.halfDepth, node.rect.centerZ + corridor.rect.halfDepth);
  }

  if (!inRearGateLane || !nearRearFace) return false;

  session.car.position.x = targetX;
  session.car.position.z = targetZ;
  session.car.heading = Math.atan2(node.rect.centerX - targetX, node.rect.centerZ - targetZ);
  session.car.forwardVelocity = Math.max(2.8, Math.abs(session.car.forwardVelocity) * 0.72);
  session.car.lateralVelocity *= 0.08;
  session.car.collisionImpact = Math.max(session.car.collisionImpact, 0.34);
  session.location = {
    node,
    localX: targetX - node.rect.centerX,
    localZ: targetZ - node.rect.centerZ,
  };
  syncHorizontalVelocity(session);
  return true;
}

function reduceStationaryPivotRate(session: Phase44Session, input: RallyInputState, headingBefore: number): void {
  if (!input.boost || Math.abs(input.steer) <= 0.035) return;
  const delta = normalizeAngle(session.car.heading - headingBefore);
  session.car.heading = normalizeAngle(headingBefore + delta * PIVOT_RATE_SCALE);
  syncHorizontalVelocity(session);
}

function createVisualState(demo: Phase44Demo): Phase44VisualState {
  const key = demo as unknown as object;
  const existing = visualStates.get(key);
  if (existing) return existing;

  const material = new THREE.MeshBasicMaterial({
    color: 0x4d4339,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const skidMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, SKID_CAPACITY);
  skidMesh.name = "phase44-stationary-turbo-skids";
  skidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  skidMesh.frustumCulled = false;
  const skidDummy = new THREE.Object3D();
  for (let index = 0; index < SKID_CAPACITY; index += 1) {
    skidDummy.position.set(0, -100, 0);
    skidDummy.scale.setScalar(0.001);
    skidDummy.updateMatrix();
    skidMesh.setMatrixAt(index, skidDummy.matrix);
  }
  skidMesh.instanceMatrix.needsUpdate = true;
  demo.scene.add(skidMesh);

  const created = { skidMesh, skidDummy, skidCursor: 0, lastSkidHeading: Number.NaN };
  visualStates.set(key, created);
  return created;
}

function fixBrightUndertray(demo: Phase44Demo): void {
  const root = demo.playerVisual.getObjectByName("phase28-hero-surface");
  if (!root) return;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!(object.material instanceof THREE.MeshStandardMaterial)) return;
    if (object.material.color.getHex() !== 0xbec7c8) return;
    if (object.position.y > 0.62 || object.scale.x < 1.4 || object.scale.z < 2.5) return;
    const material = object.material.clone();
    material.color.setHex(0x46545a);
    material.roughness = 0.68;
    material.metalness = 0.18;
    object.material = material;
    object.scale.x *= 0.84;
    object.scale.y *= 0.7;
    object.scale.z *= 0.82;
    object.position.y += 0.045;
    object.name = "phase44-dark-compact-undertray";
    object.castShadow = false;
    object.receiveShadow = false;
  });
}

function stampStationarySkids(demo: Phase44Demo, snapshot: CartArenaSessionSnapshot, strength: number): void {
  const state = createVisualState(demo);
  if (!Number.isFinite(state.lastSkidHeading)) {
    state.lastSkidHeading = snapshot.heading;
    return;
  }
  const headingDelta = Math.abs(normalizeAngle(snapshot.heading - state.lastSkidHeading));
  if (headingDelta < 0.035) return;
  state.lastSkidHeading = snapshot.heading;

  const forwardX = Math.sin(snapshot.heading);
  const forwardZ = Math.cos(snapshot.heading);
  const rightX = Math.cos(snapshot.heading);
  const rightZ = -Math.sin(snapshot.heading);
  const turnSign = Math.sign(demo.steer || 1);

  for (const lane of [-0.92, 0.92]) {
    const index = state.skidCursor;
    state.skidCursor = (state.skidCursor + 1) % SKID_CAPACITY;
    state.skidDummy.position.set(
      snapshot.x - forwardX * 1.18 + rightX * lane,
      0.112,
      snapshot.z - forwardZ * 1.18 + rightZ * lane,
    );
    state.skidDummy.rotation.set(0, snapshot.heading - turnSign * 0.1, 0);
    state.skidDummy.scale.set(0.22 + strength * 0.06, 0.012, 0.6 + strength * 0.24);
    state.skidDummy.updateMatrix();
    state.skidMesh.setMatrixAt(index, state.skidDummy.matrix);
  }
  state.skidMesh.instanceMatrix.needsUpdate = true;
}

function applyStationaryDriftPresentation(demo: Phase44Demo, delta: number): void {
  const turbo = getCartTurboCombatState(demo.session);
  const strength = cartPhase44PivotVisualStrength(turbo.held, turbo.charge, demo.steer);
  const state = createVisualState(demo);
  if (strength <= 0) {
    state.lastSkidHeading = Number.NaN;
    return;
  }

  const snapshot = demo.session.snapshot();
  const blend = Math.min(1, delta * 12);
  const rollTarget = -demo.steer * (0.11 + turbo.charge * 0.075);
  const pitchTarget = 0.025 + turbo.charge * 0.035;
  demo.playerVisual.rotation.z += (rollTarget - demo.playerVisual.rotation.z) * blend;
  demo.playerVisual.rotation.x += (pitchTarget - demo.playerVisual.rotation.x) * blend;
  stampStationarySkids(demo, snapshot, strength);
}

function applyPhase44Camera(demo: Phase44Demo, snapshot: CartArenaSessionSnapshot): void {
  const forwardX = Math.sin(snapshot.heading);
  const forwardZ = Math.cos(snapshot.heading);
  const rightX = Math.cos(snapshot.heading);
  const rightZ = -Math.sin(snapshot.heading);
  const speedRatio = THREE.MathUtils.clamp(Math.abs(snapshot.speed) / 26, 0, 1);
  const distance = snapshot.boostActive
    ? CART_PHASE44_CAMERA.turboDistance
    : CART_PHASE44_CAMERA.normalDistance + speedRatio * CART_PHASE44_CAMERA.speedDistance;
  const height = snapshot.boostActive
    ? CART_PHASE44_CAMERA.turboHeight
    : CART_PHASE44_CAMERA.normalHeight + speedRatio * CART_PHASE44_CAMERA.speedHeight;
  const lateral = -demo.steer * 0.25;

  demo.camera.position.set(
    snapshot.x - forwardX * distance + rightX * lateral,
    height,
    snapshot.z - forwardZ * distance + rightZ * lateral,
  );
  const lookDistance = 6.15 + speedRatio * 1.65;
  demo.camera.lookAt(
    snapshot.x + forwardX * lookDistance,
    0.9,
    snapshot.z + forwardZ * lookDistance,
  );
  demo.camera.fov = snapshot.boostActive ? 60.5 : 55.2 + speedRatio * 1.35;
  demo.camera.updateProjectionMatrix();
}

export function installCartRoguePhase44RequestedFixes(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase44Session;
  const originalStep = sessionPrototype.step;
  sessionPrototype.step = function phase44RequestedFixesStep(
    this: Phase44Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const headingBefore = this.car.heading;
    originalStep.call(this, input, fixedDelta);
    reduceStationaryPivotRate(this, input, headingBefore);
    releaseClearedArenaRearGate(this);
  };

  const demoPrototype = CartRogueWebGLDemo.prototype as unknown as Phase44Demo;
  const originalPlayer = demoPrototype.buildPlayerVisual;
  const originalUpdate = demoPrototype.updateVisuals;
  const originalCamera = demoPrototype.applyCameraPresentation;

  demoPrototype.buildPlayerVisual = function phase44Player(this: Phase44Demo): void {
    originalPlayer.call(this);
    fixBrightUndertray(this);
    createVisualState(this);
  };

  demoPrototype.updateVisuals = function phase44Update(this: Phase44Demo, delta: number): void {
    originalUpdate.call(this, delta);
    applyStationaryDriftPresentation(this, delta);
  };

  demoPrototype.applyCameraPresentation = function phase44Camera(
    this: Phase44Demo,
    snapshot: CartArenaSessionSnapshot,
  ): void {
    originalCamera.call(this, snapshot);
    applyPhase44Camera(this, snapshot);
  };
}

installCartRoguePhase44RequestedFixes();

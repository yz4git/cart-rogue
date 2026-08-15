import * as THREE from "three";
import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import { getCartTurboCombatState } from "./CartRoguePhase15Turbo";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase25Demo {
  scene: THREE.Scene;
  session: CartArenaSession;
  playerVisual: THREE.Group;
  boostLight: THREE.PointLight;
  steer: number;
  elapsed: number;
  cameraShake: number;
  impactFlash: number;
  buildPlayerVisual(): void;
  updateVisuals(delta: number): void;
  spawnImpact(position: THREE.Vector3, color: number, scale?: number): void;
  emitImpactSparks(position: THREE.Vector3, count: number): void;
}

interface Phase25State {
  pivotRing: THREE.Group;
  dustMesh: THREE.InstancedMesh;
  dustDummy: THREE.Object3D;
  wasHeld: boolean;
  lastCharge: number;
}

const states = new WeakMap<object, Phase25State>();
const PIVOT_DUST_COUNT = 42;
const TURBO_COLOR = 0x55ddff;

export function cartPivotGraphicStrength(held: boolean, charge: number, steer: number): number {
  if (!held) return 0;
  const normalizedCharge = THREE.MathUtils.clamp(charge, 0, 1);
  const steerMagnitude = THREE.MathUtils.clamp(Math.abs(steer), 0, 1);
  return THREE.MathUtils.clamp(0.28 + normalizedCharge * 0.52 + steerMagnitude * 0.2, 0, 1);
}

function createState(demo: Phase25Demo): Phase25State {
  const pivotRing = new THREE.Group();
  pivotRing.name = "phase25-turbo-pivot-ring";
  pivotRing.visible = false;
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: TURBO_COLOR,
    transparent: true,
    opacity: 0.38,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const segmentGeometry = new THREE.BoxGeometry(0.15, 0.035, 0.72);
  const segmentCount = 18;
  for (let index = 0; index < segmentCount; index += 1) {
    const angle = index / segmentCount * Math.PI * 2;
    const radius = 1.95;
    const segment = new THREE.Mesh(segmentGeometry, ringMaterial);
    segment.position.set(Math.cos(angle) * radius, 0.06, Math.sin(angle) * radius);
    segment.rotation.y = -angle;
    segment.scale.z = index % 3 === 0 ? 1.35 : 0.88;
    pivotRing.add(segment);
  }
  demo.session.car.group.add(pivotRing);

  const dustMaterial = new THREE.MeshBasicMaterial({
    color: 0xe9bf83,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const dustMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.26, 0), dustMaterial, PIVOT_DUST_COUNT);
  dustMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dustMesh.frustumCulled = false;
  const dustDummy = new THREE.Object3D();
  for (let index = 0; index < PIVOT_DUST_COUNT; index += 1) {
    dustDummy.position.set(0, -100, 0);
    dustDummy.scale.setScalar(0.001);
    dustDummy.updateMatrix();
    dustMesh.setMatrixAt(index, dustDummy.matrix);
  }
  dustMesh.instanceMatrix.needsUpdate = true;
  demo.scene.add(dustMesh);

  return { pivotRing, dustMesh, dustDummy, wasHeld: false, lastCharge: 0 };
}

function state(demo: Phase25Demo): Phase25State {
  const key = demo as unknown as object;
  const existing = states.get(key);
  if (existing) return existing;
  const created = createState(demo);
  states.set(key, created);
  return created;
}

function hideDust(s: Phase25State): void {
  for (let index = 0; index < PIVOT_DUST_COUNT; index += 1) {
    s.dustDummy.position.set(0, -100, 0);
    s.dustDummy.scale.setScalar(0.001);
    s.dustDummy.updateMatrix();
    s.dustMesh.setMatrixAt(index, s.dustDummy.matrix);
  }
  s.dustMesh.instanceMatrix.needsUpdate = true;
}

function updatePivotDust(
  demo: Phase25Demo,
  snapshot: CartArenaSessionSnapshot,
  charge: number,
  strength: number,
  delta: number,
): void {
  const s = state(demo);
  const direction = Math.sign(demo.steer || 1);
  for (let index = 0; index < PIVOT_DUST_COUNT; index += 1) {
    const phase = index / PIVOT_DUST_COUNT * Math.PI * 2;
    const orbit = demo.elapsed * (1.8 + charge * 2.4) * direction + phase;
    const radialWave = Math.sin(demo.elapsed * 4.2 + index * 0.73) * 0.24;
    const radius = 1.35 + (index % 6) * 0.19 + radialWave;
    const rise = ((demo.elapsed * (0.65 + (index % 5) * 0.08) + index * 0.11) % 1);
    const spread = 1 + rise * (0.65 + charge * 0.45);
    s.dustDummy.position.set(
      snapshot.x + Math.cos(orbit) * radius * spread,
      0.12 + rise * (0.65 + charge * 0.5),
      snapshot.z + Math.sin(orbit) * radius * spread,
    );
    s.dustDummy.rotation.set(orbit * 0.4, orbit, phase);
    const size = (0.28 + (index % 4) * 0.055) * strength * (1 - rise * 0.52);
    s.dustDummy.scale.setScalar(Math.max(0.02, size));
    s.dustDummy.updateMatrix();
    s.dustMesh.setMatrixAt(index, s.dustDummy.matrix);
  }
  s.dustMesh.instanceMatrix.needsUpdate = true;

  // Wheels keep visibly scrubbing while the vehicle itself remains stationary.
  demo.playerVisual.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.CylinderGeometry)) return;
    if (Math.abs(object.position.x) < 0.7 || object.position.y > 1.25) return;
    object.rotation.x -= direction * delta * (5.5 + charge * 5.5);
  });
}

function updatePivotVisuals(demo: Phase25Demo, delta: number): void {
  const s = state(demo);
  const snapshot = demo.session.snapshot();
  const turbo = getCartTurboCombatState(demo.session);
  const strength = cartPivotGraphicStrength(turbo.held, turbo.charge, demo.steer);

  s.pivotRing.visible = turbo.held && Math.abs(demo.steer) > 0.035;
  if (s.pivotRing.visible) {
    s.pivotRing.rotation.y += Math.sign(demo.steer || 1) * delta * (1.8 + turbo.charge * 2.4);
    const scale = 0.9 + turbo.charge * 0.18 + Math.sin(demo.elapsed * 8) * 0.018;
    s.pivotRing.scale.setScalar(scale);
    updatePivotDust(demo, snapshot, turbo.charge, strength, delta);
    demo.boostLight.intensity = Math.max(demo.boostLight.intensity, 0.8 + turbo.charge * 2.2);
    demo.boostLight.color.setHex(TURBO_COLOR);
    demo.cameraShake = Math.max(demo.cameraShake, turbo.charge * Math.abs(demo.steer) * 0.075);
    s.lastCharge = turbo.charge;
  } else {
    hideDust(s);
  }

  if (s.wasHeld && !turbo.held) {
    const launchCharge = s.lastCharge;
    const at = new THREE.Vector3(snapshot.x, 0.02, snapshot.z);
    demo.spawnImpact(at, TURBO_COLOR, 0.62 + launchCharge * 0.48);
    demo.emitImpactSparks(at, 7 + Math.round(launchCharge * 9));
    demo.cameraShake = Math.max(demo.cameraShake, 0.18 + launchCharge * 0.24);
    demo.impactFlash = Math.max(demo.impactFlash, 0.24 + launchCharge * 0.26);
    s.lastCharge = 0;
  }
  s.wasHeld = turbo.held;
}

export function installCartRoguePhase25TurboVisuals(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase25Demo;
  const oldPlayer = prototype.buildPlayerVisual;
  const oldUpdate = prototype.updateVisuals;

  prototype.buildPlayerVisual = function phase25Player(this: Phase25Demo): void {
    oldPlayer.call(this);
    state(this);
  };

  prototype.updateVisuals = function phase25Update(this: Phase25Demo, delta: number): void {
    oldUpdate.call(this, delta);
    updatePivotVisuals(this, delta);
  };
}

installCartRoguePhase25TurboVisuals();

import * as THREE from "three";
import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import { getCartTurboCombatState } from "./CartRoguePhase15Turbo";
import { cartGraphicStageForNode } from "./CartRoguePhase26StageIdentity";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase29Demo {
  scene: THREE.Scene;
  session: CartArenaSession;
  steer: number;
  brake: boolean;
  elapsed: number;
  buildWorld(): void;
  updateVisuals(delta: number): void;
}

interface Phase29State {
  root: THREE.Group;
  debris: THREE.InstancedMesh;
  dummy: THREE.Object3D;
  water: THREE.Mesh[];
}

const states = new WeakMap<object, Phase29State>();
const DEBRIS_COUNT = 54;

export function cartSurfaceLifeStrength(speed: number, steer: number, braking: boolean, pivotHeld: boolean): number {
  const speedRatio = THREE.MathUtils.clamp(Math.abs(speed) / 24, 0, 1);
  const maneuver = Math.max(Math.abs(steer), braking ? 0.9 : 0, pivotHeld ? 1 : 0);
  return THREE.MathUtils.clamp(speedRatio * 0.52 + maneuver * 0.7, 0, 1);
}

function createState(demo: Phase29Demo): Phase29State {
  const root = new THREE.Group();
  root.name = "phase29-surface-life";
  demo.scene.add(root);

  const debrisMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0, flatShading: true, vertexColors: true });
  const debris = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.18, 0), debrisMaterial, DEBRIS_COUNT);
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debris.frustumCulled = false;
  const dummy = new THREE.Object3D();
  for (let index = 0; index < DEBRIS_COUNT; index += 1) {
    dummy.position.set(0, -100, 0);
    dummy.scale.setScalar(0.001);
    dummy.updateMatrix();
    debris.setMatrixAt(index, dummy.matrix);
    debris.setColorAt(index, new THREE.Color(index % 3 === 0 ? 0xf0c985 : index % 3 === 1 ? 0xc69b61 : 0x9bb66e));
  }
  debris.instanceMatrix.needsUpdate = true;
  if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
  demo.scene.add(debris);

  const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x6fd8df, roughness: 0.3, metalness: 0.03, transparent: true, opacity: 0.68, emissive: 0x4ab8c6, emissiveIntensity: 0.14, flatShading: true });
  const water: THREE.Mesh[] = [];
  const channels: Array<[number, number, number, number]> = [
    [-33, 254, 12, 54],
    [34, 288, 11, 45],
    [-35, 369, 10, 38],
  ];
  channels.forEach(([x, z, w, d], index) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 1, 5), waterMaterial.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, -0.02 - index * 0.002, z);
    mesh.receiveShadow = false;
    root.add(mesh);
    water.push(mesh);
  });

  const created = { root, debris, dummy, water };
  states.set(demo as unknown as object, created);
  return created;
}

function state(demo: Phase29Demo): Phase29State {
  return states.get(demo as unknown as object) ?? createState(demo);
}

function updateGroundReaction(demo: Phase29Demo, snapshot: CartArenaSessionSnapshot): void {
  const s = state(demo);
  const turbo = getCartTurboCombatState(demo.session);
  const strength = cartSurfaceLifeStrength(snapshot.speed, demo.steer, demo.brake, turbo.held);
  const fx = Math.sin(snapshot.heading);
  const fz = Math.cos(snapshot.heading);
  const rx = Math.cos(snapshot.heading);
  const rz = -Math.sin(snapshot.heading);
  const turnDirection = Math.sign(demo.steer || 1);

  for (let index = 0; index < DEBRIS_COUNT; index += 1) {
    if (strength < 0.08) {
      s.dummy.position.set(0, -100, 0);
      s.dummy.scale.setScalar(0.001);
    } else {
      const phase = (index / DEBRIS_COUNT) * Math.PI * 2 + demo.elapsed * (turbo.held ? 2.8 : 0.9) * turnDirection;
      const lane = ((index % 2) * 2 - 1) * (0.72 + (index % 5) * 0.08);
      const back = 1.15 + (index % 9) * 0.22;
      const orbit = turbo.held ? Math.cos(phase) * (1.4 + (index % 6) * 0.11) : lane;
      const rise = strength * (0.05 + ((index * 0.173 + demo.elapsed * 0.7) % 1) * 0.32);
      s.dummy.position.set(
        snapshot.x - fx * back + rx * orbit,
        0.04 + rise,
        snapshot.z - fz * back + rz * orbit,
      );
      s.dummy.rotation.set(phase * 0.7, phase, phase * 0.35);
      const scale = (0.45 + (index % 4) * 0.12) * strength;
      s.dummy.scale.set(scale, Math.max(0.18, scale * 0.65), scale);
    }
    s.dummy.updateMatrix();
    s.debris.setMatrixAt(index, s.dummy.matrix);
  }
  s.debris.instanceMatrix.needsUpdate = true;
}

function updateWater(demo: Phase29Demo, snapshot: CartArenaSessionSnapshot): void {
  const s = state(demo);
  const stage = cartGraphicStageForNode(snapshot.nodeId);
  s.water.forEach((water, index) => {
    const material = water.material as THREE.MeshStandardMaterial;
    const active = stage === "grove" || stage === "canyon";
    material.opacity += (((active ? 0.76 : 0.54) + Math.sin(demo.elapsed * 1.4 + index) * 0.045) - material.opacity) * 0.08;
    material.emissiveIntensity = active ? 0.17 + Math.sin(demo.elapsed * 1.8 + index * 0.7) * 0.035 : 0.1;
    water.position.y = -0.025 + Math.sin(demo.elapsed * 1.25 + index * 1.7) * 0.018;
    water.rotation.z = Math.sin(demo.elapsed * 0.28 + index) * 0.008;
  });
}

export function installCartRoguePhase29SurfaceLife(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase29Demo;
  const oldWorld = prototype.buildWorld;
  const oldUpdate = prototype.updateVisuals;
  prototype.buildWorld = function phase29World(this: Phase29Demo): void {
    oldWorld.call(this);
    createState(this);
  };
  prototype.updateVisuals = function phase29Update(this: Phase29Demo, delta: number): void {
    oldUpdate.call(this, delta);
    const snapshot = this.session.snapshot();
    updateGroundReaction(this, snapshot);
    updateWater(this, snapshot);
  };
}

installCartRoguePhase29SurfaceLife();

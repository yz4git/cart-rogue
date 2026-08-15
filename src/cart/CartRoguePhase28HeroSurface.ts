import * as THREE from "three";
import type { CartArenaSessionSnapshot } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase28Session {
  snapshot(): CartArenaSessionSnapshot;
}

interface Phase28Demo {
  playerVisual: THREE.Group;
  session: Phase28Session;
  elapsed: number;
  steer: number;
  buildPlayerVisual(): void;
  updateVisuals(delta: number): void;
}

interface Phase28State {
  root: THREE.Group;
  suspensionLinks: THREE.Mesh[];
  aeroFins: THREE.Mesh[];
  headlightGlow: THREE.MeshBasicMaterial;
  brakeGlow: THREE.MeshBasicMaterial;
}

const states = new WeakMap<object, Phase28State>();
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);

export function cartHeroSurfaceMotion(speed: number, steer: number, boost: boolean): { compression: number; roll: number; glow: number } {
  const speedRatio = THREE.MathUtils.clamp(Math.abs(speed) / 24, 0, 1);
  return {
    compression: THREE.MathUtils.clamp(0.12 + speedRatio * 0.48 + (boost ? 0.28 : 0), 0, 1),
    roll: THREE.MathUtils.clamp(Math.abs(steer) * (0.35 + speedRatio * 0.65), 0, 1),
    glow: THREE.MathUtils.clamp(0.2 + speedRatio * 0.45 + (boost ? 0.55 : 0), 0, 1),
  };
}

function standard(color: number, roughness: number, metalness: number, emissive = 0, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true, emissive, emissiveIntensity });
}

function addBox(root: THREE.Object3D, material: THREE.Material, p: [number, number, number], s: [number, number, number], r: [number, number, number] = [0, 0, 0]): THREE.Mesh {
  const mesh = new THREE.Mesh(BOX, material);
  mesh.position.set(...p);
  mesh.scale.set(...s);
  mesh.rotation.set(...r);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function addCylinder(root: THREE.Object3D, material: THREE.Material, p: [number, number, number], s: [number, number, number], r: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(CYL, material);
  mesh.position.set(...p);
  mesh.scale.set(...s);
  mesh.rotation.set(...r);
  mesh.castShadow = true;
  root.add(mesh);
  return mesh;
}

function buildSurfaceRig(demo: Phase28Demo): Phase28State {
  const key = demo as unknown as object;
  const existing = states.get(key);
  if (existing) return existing;

  const root = new THREE.Group();
  root.name = "phase28-hero-surface";
  const teal = standard(0x34bdb4, 0.52, 0.12);
  const tealDark = standard(0x126f75, 0.64, 0.18);
  const metal = standard(0xbec7c8, 0.34, 0.7);
  const black = standard(0x20272d, 0.68, 0.08);
  const white = standard(0xf7f2e9, 0.48, 0.08);
  const headlightGlow = new THREE.MeshBasicMaterial({ color: 0x9eeeff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const brakeGlow = new THREE.MeshBasicMaterial({ color: 0xff5968, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const suspensionLinks: THREE.Mesh[] = [];
  const aeroFins: THREE.Mesh[] = [];

  addBox(root, tealDark, [0, 0.56, 2.23], [2.7, 0.22, 0.24]);
  addBox(root, teal, [0, 1.22, 1.72], [2.35, 0.16, 0.7], [-0.08, 0, 0]);
  addBox(root, white, [0, 2.18, 0.1], [1.72, 0.12, 1.5]);
  addBox(root, black, [0, 0.55, -2.25], [2.62, 0.2, 0.24]);
  addBox(root, metal, [0, 0.42, 0.02], [1.78, 0.11, 3.1]);

  for (const side of [-1, 1]) {
    const x = side * 1.32;
    addBox(root, tealDark, [x, 0.94, 0.18], [0.16, 0.56, 2.7]);
    const fin = addBox(root, teal, [side * 1.42, 1.02, -1.2], [0.12, 0.48, 0.98], [0, 0, side * 0.08]);
    aeroFins.push(fin);
    for (const z of [-1.22, 1.2]) {
      const link = addCylinder(root, metal, [side * 1.18, 0.52, z], [0.08, 0.56, 0.08], [0, 0, side * 0.54]);
      suspensionLinks.push(link);
      addCylinder(root, black, [side * 1.16, 0.52, z], [0.13, 0.38, 0.13], [0, 0, side * 0.54]);
    }
  }

  for (const x of [-0.78, 0.78]) {
    addBox(root, headlightGlow, [x, 1.1, 2.34], [0.5, 0.16, 0.055]);
    addBox(root, brakeGlow, [x, 0.93, -2.34], [0.42, 0.14, 0.055]);
  }
  for (const x of [-0.72, -0.24, 0.24, 0.72]) addBox(root, black, [x, 0.74, 2.36], [0.24, 0.14, 0.06]);

  demo.playerVisual.add(root);
  const created = { root, suspensionLinks, aeroFins, headlightGlow, brakeGlow };
  states.set(key, created);
  return created;
}

function updateSurfaceRig(demo: Phase28Demo, delta: number): void {
  const s = buildSurfaceRig(demo);
  const snapshot = demo.session.snapshot();
  const motion = cartHeroSurfaceMotion(snapshot.speed, demo.steer, snapshot.boostActive);
  const blend = Math.min(1, delta * 10);
  s.root.position.y += ((-motion.compression * 0.035) - s.root.position.y) * blend;
  s.root.rotation.z += ((-demo.steer * 0.025 * motion.roll) - s.root.rotation.z) * blend;
  s.suspensionLinks.forEach((link, index) => {
    const pulse = Math.sin(demo.elapsed * (7 + index * 0.35)) * 0.035 * motion.compression;
    link.scale.y += ((0.46 - motion.compression * 0.11 + pulse) - link.scale.y) * blend;
  });
  s.aeroFins.forEach((fin, index) => {
    fin.rotation.y = Math.sin(demo.elapsed * 1.8 + index * Math.PI) * 0.018 * motion.roll;
  });
  s.headlightGlow.opacity = 0.45 + motion.glow * 0.42;
  s.brakeGlow.opacity = 0.35 + motion.compression * 0.45;
}

export function installCartRoguePhase28HeroSurface(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase28Demo;
  const oldPlayer = prototype.buildPlayerVisual;
  const oldUpdate = prototype.updateVisuals;
  prototype.buildPlayerVisual = function phase28Player(this: Phase28Demo): void {
    oldPlayer.call(this);
    buildSurfaceRig(this);
  };
  prototype.updateVisuals = function phase28Update(this: Phase28Demo, delta: number): void {
    oldUpdate.call(this, delta);
    updateSurfaceRig(this, delta);
  };
}

installCartRoguePhase28HeroSurface();

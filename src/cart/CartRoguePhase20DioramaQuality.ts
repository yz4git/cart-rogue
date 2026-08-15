import * as THREE from "three";
import type { CartArenaSessionSnapshot } from "./CartArenaSession";
import { cartArenaBoundaryPoints, cartArenaPointInPortal } from "./CartArenaShapes";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_WORLD_GRAPH } from "./CartWorldGraph";

interface Phase20Demo {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  playerVisual: THREE.Group;
  elapsed: number;
  steer: number;
  buildWorld(): void;
  buildPlayerVisual(): void;
  updateVisuals(delta: number): void;
  applyCameraPresentation(snapshot: CartArenaSessionSnapshot): void;
}

interface Petal {
  mesh: THREE.Mesh;
  phase: number;
  radius: number;
  speed: number;
  baseY: number;
}

interface Phase20State {
  root: THREE.Group;
  petals: Petal[];
  heroDone: boolean;
}

const states = new WeakMap<object, Phase20State>();
const BOX = new THREE.BoxGeometry(1, 1, 1);
const COLORS = {
  grass: 0x9fd575,
  grassHi: 0xbbe493,
  grassLo: 0x78b65a,
  stone: 0xeee9df,
  stoneShade: 0xd6d0c5,
  trunk: 0x76513c,
  blossom: 0xf28fbd,
  blossomHi: 0xffb3d5,
  blossomHot: 0xff73ad,
  water: 0x6ed7dc,
  waterHi: 0xa6edf0,
  bridge: 0xd76f5d,
  lantern: 0x4b5158,
  warm: 0xffd985,
  teal: 0x2eb8b0,
  tealDark: 0x187f80,
  white: 0xf8f5ef,
  glass: 0x385d6b,
  tire: 0x273038,
};

function mat(color: number, roughness = 0.86, emissive = 0, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true, emissive, emissiveIntensity });
}

function box(parent: THREE.Object3D, material: THREE.Material, p: [number, number, number], s: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(BOX, material);
  mesh.position.set(...p);
  mesh.scale.set(...s);
  parent.add(mesh);
  return mesh;
}

function state(demo: Phase20Demo): Phase20State {
  const key = demo as unknown as object;
  const existing = states.get(key);
  if (existing) return existing;
  const root = new THREE.Group();
  root.name = "phase20-diorama-quality";
  demo.scene.add(root);
  const created = { root, petals: [], heroDone: false };
  states.set(key, created);
  return created;
}

function addCherryTree(root: THREE.Group, x: number, z: number, scale = 1): void {
  const trunk = mat(COLORS.trunk);
  const pink = [mat(COLORS.blossom), mat(COLORS.blossomHi), mat(COLORS.blossomHot)];
  box(root, trunk, [x, 2.25 * scale, z], [0.72 * scale, 4.5 * scale, 0.72 * scale]);
  for (const [index, branch] of [[-0.85, 3.35, 0.15], [0.82, 3.6, -0.12], [0.05, 4.0, 0.72]] .entries()) {
    const b = branch as number[];
    box(root, trunk, [x + b[0] * scale, b[1] * scale, z + b[2] * scale], [1.65 * scale, 0.34 * scale, 0.34 * scale]);
    const offsets = [[0,0,0],[-0.8,0.15,0.2],[0.75,0.1,-0.1],[0.15,0.55,0.55],[-0.25,0.7,-0.5]];
    offsets.forEach((o, i) => box(root, pink[(i + index) % pink.length], [x + (b[0] + o[0]) * scale, (b[1] + 1.05 + o[1]) * scale, z + (b[2] + o[2]) * scale], [1.35 * scale, 1.0 * scale, 1.35 * scale]));
  }
  box(root, pink[1], [x, 6.1 * scale, z], [1.7 * scale, 1.15 * scale, 1.7 * scale]);
}

function addLantern(root: THREE.Group, x: number, z: number): void {
  const stone = mat(COLORS.stoneShade);
  const dark = mat(COLORS.lantern);
  const glow = mat(COLORS.warm, 0.55, COLORS.warm, 1.6);
  box(root, stone, [x, 0.55, z], [0.85, 1.1, 0.85]);
  box(root, dark, [x, 1.42, z], [0.46, 0.7, 0.46]);
  box(root, glow, [x, 1.48, z], [0.3, 0.38, 0.3]);
  box(root, dark, [x, 1.9, z], [0.72, 0.12, 0.72]);
}

function addBridge(root: THREE.Group, x: number, z: number, rotationY: number): void {
  const bridge = new THREE.Group();
  bridge.position.set(x, 0, z);
  bridge.rotation.y = rotationY;
  root.add(bridge);
  const red = mat(COLORS.bridge, 0.78);
  const pale = mat(0xf2c49c, 0.88);
  for (let i = -3; i <= 3; i += 1) box(bridge, pale, [i * 0.72, 0.52 + (1 - Math.abs(i) / 4) * 0.34, 0], [0.68, 0.18, 2.0]);
  for (const side of [-1, 1]) {
    for (let i = -3; i <= 3; i += 1) box(bridge, red, [i * 0.72, 1.05 + (1 - Math.abs(i) / 4) * 0.34, side * 1.12], [0.12, 1.15, 0.12]);
    box(bridge, red, [0, 1.55, side * 1.12], [5.1, 0.14, 0.14]);
  }
}

function buildDiorama(demo: Phase20Demo): void {
  const root = state(demo).root;
  const grass = [mat(COLORS.grass), mat(COLORS.grassHi), mat(COLORS.grassLo)];
  const stone = [mat(COLORS.stone), mat(COLORS.stoneShade)];
  const water = mat(COLORS.water, 0.52, COLORS.waterHi, 0.22);
  let arenaIndex = 0;
  for (const node of CART_WORLD_GRAPH.nodes) {
    if (node.kind === "corridor") continue;
    const points = cartArenaBoundaryPoints(node.id, 24, 0);
    if (points.length === 0) continue;
    const cx = node.rect.centerX;
    const cz = node.rect.centerZ;
    points.forEach((point, index) => {
      if (cartArenaPointInPortal(node, point.x, point.z, 4.6)) return;
      const dx = point.x - cx;
      const dz = point.z - cz;
      const len = Math.hypot(dx, dz) || 1;
      const nx = dx / len;
      const nz = dz / len;
      const tx = -nz;
      const tz = nx;
      if (index % 2 === 0) {
        for (let tier = 0; tier < 3; tier += 1) {
          const out = 3.2 + tier * 2.05;
          box(root, grass[(tier + index) % grass.length], [point.x + nx * out, 0.34 + tier * 0.42, point.z + nz * out], [2.9, 0.68 + tier * 0.22, 2.6]);
        }
      }
      if (index % 6 === 1) addCherryTree(root, point.x + nx * 7.2 + tx * 0.7, point.z + nz * 7.2 + tz * 0.7, 0.9 + (index % 3) * 0.08);
      if (index % 6 === 4) addLantern(root, point.x + nx * 3.2, point.z + nz * 3.2);
      if (index % 4 === 2) {
        for (let s = 0; s < 3; s += 1) box(root, stone[(s + index) % 2], [point.x + nx * (3.6 + s * 0.55) + tx * (s - 1) * 0.62, 0.32 + s * 0.12, point.z + nz * (3.6 + s * 0.55) + tz * (s - 1) * 0.62], [0.72 + s * 0.12, 0.58 + s * 0.08, 0.72 + s * 0.1]);
      }
    });
    if (arenaIndex % 2 === 0) {
      const pondX = cx + node.rect.halfWidth * 0.62;
      const pondZ = cz - node.rect.halfDepth * 0.62;
      box(root, water, [pondX, 0.08, pondZ], [6.2, 0.08, 3.6]);
      for (let i = -3; i <= 3; i += 1) box(root, grass[(i + 6) % grass.length], [pondX + i * 1.25, 0.25, pondZ + (Math.abs(i) % 2 ? 2.2 : -2.2)], [1.3, 0.45, 1.1]);
      addBridge(root, pondX, pondZ, 0);
    }
    arenaIndex += 1;
  }
}

function upgradeHero(demo: Phase20Demo): void {
  const s = state(demo);
  if (s.heroDone) return;
  s.heroDone = true;
  const root = demo.playerVisual;
  const teal = mat(COLORS.teal, 0.58);
  const tealDark = mat(COLORS.tealDark, 0.66);
  const white = mat(COLORS.white, 0.55);
  const glass = mat(COLORS.glass, 0.42);
  const tire = mat(COLORS.tire, 0.72);
  box(root, tealDark, [0, 0.52, 0.25], [2.75, 0.32, 3.7]);
  box(root, teal, [0, 1.0, 0.25], [2.58, 0.78, 3.45]);
  box(root, white, [0, 1.72, -0.05], [2.12, 1.18, 2.2]);
  box(root, glass, [0, 1.74, 1.1], [1.72, 0.72, 0.09]);
  box(root, tealDark, [0, 0.78, 2.0], [2.68, 0.36, 0.42]);
  for (const x of [-1.38, 1.38]) {
    box(root, tealDark, [x, 0.9, 0.45], [0.24, 0.62, 2.65]);
    for (const z of [-1.18, 1.28]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.38, 10), tire);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.48, z);
      root.add(wheel);
    }
  }
  box(root, white, [0, 2.38, -0.35], [1.75, 0.12, 1.05]);
  box(root, tealDark, [0, 2.56, -1.05], [2.25, 0.13, 0.3]);
}

function createPetals(demo: Phase20Demo): void {
  const s = state(demo);
  if (s.petals.length > 0) return;
  const material = new THREE.MeshBasicMaterial({ color: COLORS.blossomHi, transparent: true, opacity: 0.72, depthWrite: false });
  for (let i = 0; i < 28; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.16), material);
    demo.scene.add(mesh);
    s.petals.push({ mesh, phase: i * 1.731, radius: 7 + (i % 7) * 2.1, speed: 0.18 + (i % 5) * 0.025, baseY: 2.2 + (i % 8) * 0.62 });
  }
}

function updatePetals(demo: Phase20Demo): void {
  const s = state(demo);
  const t = demo.elapsed;
  for (const petal of s.petals) {
    const a = petal.phase + t * petal.speed;
    petal.mesh.position.set(demo.camera.position.x + Math.cos(a) * petal.radius, petal.baseY + Math.sin(a * 1.7) * 1.2, demo.camera.position.z + Math.sin(a) * petal.radius);
    petal.mesh.rotation.set(a * 1.8, a * 0.7, a * 1.3);
  }
}

function cinematicCamera(demo: Phase20Demo, snapshot: CartArenaSessionSnapshot): void {
  const fx = Math.sin(snapshot.heading);
  const fz = Math.cos(snapshot.heading);
  const rx = Math.cos(snapshot.heading);
  const rz = -Math.sin(snapshot.heading);
  const speed = THREE.MathUtils.clamp(Math.abs(snapshot.speed) / 28, 0, 1);
  const distance = snapshot.boostActive ? 10.8 : 9.15 + speed * 0.5;
  const height = snapshot.boostActive ? 7.15 : 6.35 + speed * 0.28;
  const lateral = -demo.steer * 0.24;
  demo.camera.position.set(snapshot.x - fx * distance + rx * lateral, height, snapshot.z - fz * distance + rz * lateral);
  demo.camera.lookAt(snapshot.x + fx * (5.2 + speed * 1.6), 0.88, snapshot.z + fz * (5.2 + speed * 1.6));
  demo.camera.fov = snapshot.boostActive ? 60.5 : 53.8 + speed * 1.4;
  demo.camera.updateProjectionMatrix();
}

export function installCartRoguePhase20DioramaQuality(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase20Demo;
  const oldWorld = prototype.buildWorld;
  const oldPlayer = prototype.buildPlayerVisual;
  const oldUpdate = prototype.updateVisuals;
  const oldCamera = prototype.applyCameraPresentation;
  prototype.buildWorld = function phase20World(this: Phase20Demo): void {
    oldWorld.call(this);
    buildDiorama(this);
    createPetals(this);
  };
  prototype.buildPlayerVisual = function phase20Hero(this: Phase20Demo): void {
    oldPlayer.call(this);
    upgradeHero(this);
  };
  prototype.updateVisuals = function phase20Update(this: Phase20Demo, delta: number): void {
    oldUpdate.call(this, delta);
    updatePetals(this);
  };
  prototype.applyCameraPresentation = function phase20Camera(this: Phase20Demo, snapshot: CartArenaSessionSnapshot): void {
    oldCamera.call(this, snapshot);
    cinematicCamera(this, snapshot);
  };
}

installCartRoguePhase20DioramaQuality();

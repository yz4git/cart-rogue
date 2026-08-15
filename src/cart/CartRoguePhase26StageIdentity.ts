import * as THREE from "three";
import type { CartArenaSessionSnapshot } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

export type CartGraphicStage = "meadow" | "orchard" | "grove" | "canyon" | "boss";

export interface CartGraphicPalette {
  skyTint: number;
  fog: number;
  hemiSky: number;
  hemiGround: number;
}

const PALETTES: Readonly<Record<CartGraphicStage, CartGraphicPalette>> = {
  meadow: { skyTint: 0xffffff, fog: 0xdaf0ff, hemiSky: 0xf2fbff, hemiGround: 0x68875c },
  orchard: { skyTint: 0xfff0f1, fog: 0xf4e2dc, hemiSky: 0xfff3ec, hemiGround: 0x7e805c },
  grove: { skyTint: 0xe0f3e8, fog: 0xd0e4d4, hemiSky: 0xeaf9ef, hemiGround: 0x4f745b },
  canyon: { skyTint: 0xffe3c6, fog: 0xf0d0ad, hemiSky: 0xffead0, hemiGround: 0x8d6852 },
  boss: { skyTint: 0xe3d9f2, fog: 0xd1c8dc, hemiSky: 0xf0e7fa, hemiGround: 0x554c63 },
};

export function cartGraphicStageForNode(nodeId: string): CartGraphicStage {
  if (nodeId === "boss-01") return "boss";
  if (nodeId === "route-04-left" || nodeId === "route-04-right" || nodeId === "corridor-02") return "canyon";
  if (nodeId === "junction-03" || nodeId === "arena-03" || nodeId === "junction-04") return "grove";
  if (nodeId === "arena-02" || nodeId === "junction-02" || nodeId === "route-03-left" || nodeId === "route-03-right") return "orchard";
  return "meadow";
}

export function cartGraphicPaletteForStage(stage: CartGraphicStage): CartGraphicPalette {
  return PALETTES[stage];
}

interface Phase26Session {
  snapshot(): CartArenaSessionSnapshot;
}

interface Phase26Demo {
  scene: THREE.Scene;
  session: Phase26Session;
  buildWorld(): void;
  updateVisuals(delta: number): void;
}

interface Phase26State {
  root: THREE.Group;
  skyMaterial: THREE.MeshBasicMaterial | null;
  hemi: THREE.HemisphereLight | null;
  skyTint: THREE.Color;
  fogTint: THREE.Color;
}

const states = new WeakMap<object, Phase26State>();
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CONE = new THREE.ConeGeometry(1, 1, 6);

function material(color: number, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
    emissive,
    emissiveIntensity: emissive ? 0.22 : 0,
  });
}

function addBox(root: THREE.Group, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0): void {
  const mesh = new THREE.Mesh(BOX, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.y = ry;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  root.add(mesh);
}

function addCone(root: THREE.Group, mat: THREE.Material, x: number, y: number, z: number, radius: number, height: number, ry = 0): void {
  const mesh = new THREE.Mesh(CONE, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(radius, height, radius);
  mesh.rotation.y = ry;
  mesh.castShadow = false;
  root.add(mesh);
}

function createState(demo: Phase26Demo): Phase26State {
  const root = new THREE.Group();
  root.name = "phase26-stage-identity";
  demo.scene.add(root);
  let skyMaterial: THREE.MeshBasicMaterial | null = null;
  let hemi: THREE.HemisphereLight | null = null;
  demo.scene.traverse((object) => {
    if (!hemi && object instanceof THREE.HemisphereLight) hemi = object;
    if (skyMaterial || !(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.SphereGeometry)) return;
    const radius = Number(object.geometry.parameters.radius ?? 0);
    if (radius < 250 || !(object.material instanceof THREE.MeshBasicMaterial)) return;
    skyMaterial = object.material;
  });
  return {
    root,
    skyMaterial,
    hemi,
    skyTint: new THREE.Color(0xffffff),
    fogTint: new THREE.Color(PALETTES.meadow.fog),
  };
}

function state(demo: Phase26Demo): Phase26State {
  const key = demo as unknown as object;
  const current = states.get(key);
  if (current) return current;
  const created = createState(demo);
  states.set(key, created);
  return created;
}

function addStageLandmarks(demo: Phase26Demo): void {
  const root = state(demo).root;
  const green = material(0x79b85f);
  const greenHi = material(0xa7d875);
  const blossom = material(0xf39ac3);
  const blossomHi = material(0xffc2dc);
  const trunk = material(0x77513c);
  const stone = material(0xc7c5ba);
  const stoneDark = material(0x78847f);
  const canyon = material(0xc77b59);
  const canyonHi = material(0xe5a06d);
  const bossStone = material(0x5c5367);
  const bossGlow = material(0xa96ef0, 0x8d4ed9);

  // Stage 1: broad green silhouettes establish the toy-diorama horizon.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 5; index += 1) {
      addCone(root, index % 2 ? greenHi : green, side * (54 + index * 8), 4.5 + index * 0.7, 26 + index * 18, 8 + index * 1.5, 9 + index * 1.2, index * 0.3);
    }
  }

  // Stage 2: oversized blossom groves become the visual landmark after the first clear.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 4; index += 1) {
      const x = side * (46 + index * 9);
      const z = 128 + index * 24;
      addBox(root, trunk, x, 4, z, 1.2, 8, 1.2, 0.1 * index);
      addBox(root, index % 2 ? blossomHi : blossom, x - side * 1.8, 10, z, 6.8, 4.3, 6.2, index * 0.2);
      addBox(root, blossom, x + side * 2.2, 11.4, z + 1.8, 5.4, 3.7, 5.2, -index * 0.18);
    }
  }

  // Stage 3: darker stone ruins and tall grove silhouettes.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 5; index += 1) {
      const x = side * (50 + (index % 2) * 12);
      const z = 238 + index * 19;
      addBox(root, index % 2 ? stone : stoneDark, x, 3.5 + index * 0.6, z, 4 + (index % 3), 7 + index * 1.2, 4.2, index * 0.13);
      addCone(root, green, x + side * 7, 7.5, z + 4, 5.2, 15, index * 0.5);
    }
  }

  // Stage 4: warm canyon stacks and a simple arch silhouette.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 4; index += 1) {
      const x = side * (52 + index * 8);
      const z = 350 + index * 22;
      addBox(root, index % 2 ? canyonHi : canyon, x, 4.5 + index, z, 8 - index * 0.6, 9 + index * 2, 6.5, index * 0.11);
    }
    addBox(root, canyon, side * 60, 13, 414, 5.5, 26, 5.5);
    addBox(root, canyonHi, side * 52, 13, 414, 11, 4.2, 5.5);
  }

  // Boss horizon: sparse dark monoliths with emissive cores.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index += 1) {
      const x = side * (48 + index * 10);
      const z = 438 + index * 10;
      addBox(root, bossStone, x, 8 + index * 2, z, 4.8, 16 + index * 4, 4.8, side * 0.1 * index);
      addBox(root, bossGlow, x, 9 + index * 2, z - 2.45, 1.1, 7 + index * 1.5, 0.22);
    }
  }
}

function updateStageGrade(demo: Phase26Demo, delta: number): void {
  const s = state(demo);
  const snapshot = demo.session.snapshot();
  const palette = cartGraphicPaletteForStage(cartGraphicStageForNode(snapshot.nodeId));
  const blend = 1 - Math.exp(-delta * 0.9);
  s.skyTint.lerp(new THREE.Color(palette.skyTint), blend);
  s.fogTint.lerp(new THREE.Color(palette.fog), blend);

  if (s.skyMaterial) s.skyMaterial.color.copy(s.skyTint);
  if (demo.scene.fog instanceof THREE.Fog) demo.scene.fog.color.copy(s.fogTint);
  if (demo.scene.background instanceof THREE.Color) demo.scene.background.lerp(s.skyTint, blend * 0.5);
  if (s.hemi) {
    s.hemi.color.lerp(new THREE.Color(palette.hemiSky), blend);
    s.hemi.groundColor.lerp(new THREE.Color(palette.hemiGround), blend);
  }
}

export function installCartRoguePhase26StageIdentity(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase26Demo;
  const oldWorld = prototype.buildWorld;
  const oldUpdate = prototype.updateVisuals;

  prototype.buildWorld = function phase26World(this: Phase26Demo): void {
    oldWorld.call(this);
    addStageLandmarks(this);
  };

  prototype.updateVisuals = function phase26Update(this: Phase26Demo, delta: number): void {
    oldUpdate.call(this, delta);
    updateStageGrade(this, delta);
  };
}

installCartRoguePhase26StageIdentity();

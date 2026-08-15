import * as THREE from "three";
import type { CartArenaSessionSnapshot } from "./CartArenaSession";
import { cartArenaBoundaryPoints, cartArenaPointInPortal } from "./CartArenaShapes";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_WORLD_GRAPH } from "./CartWorldGraph";

interface Phase20MatchDemo {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  playerVisual: THREE.Group;
  steer: number;
  buildWorld(): void;
  buildPlayerVisual(): void;
  applyCameraPresentation(snapshot: CartArenaSessionSnapshot): void;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const COLORS = {
  sky: 0x7fc7ff,
  fog: 0xc4e5ff,
  grass: 0x9fd574,
  grassHi: 0xc1e99a,
  grassDark: 0x72ac55,
  trunk: 0x9b6d50,
  stone: 0xeae5dc,
  stoneShade: 0xd4cec3,
  blossom: 0xf58fbe,
  blossomHi: 0xffbad9,
  blossomHot: 0xff72ad,
  red: 0xd96559,
  redDark: 0x9d443f,
  white: 0xf8f5ef,
  teal: 0x31b9b1,
  tealDark: 0x157f80,
  glass: 0x385d6b,
};

function material(color: number, roughness = 0.84, emissive = 0, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true, emissive, emissiveIntensity });
}

function addBox(parent: THREE.Object3D, mat: THREE.Material, p: [number, number, number], s: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(BOX, mat);
  mesh.position.set(...p);
  mesh.scale.set(...s);
  parent.add(mesh);
  return mesh;
}

function lightness(color: THREE.Color): number {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return hsl.l;
}

function retintLegacyScenery(demo: Phase20MatchDemo): void {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const instanceColor = new THREE.Color();
  const brown = new THREE.Color(COLORS.trunk);
  const pale = new THREE.Color(COLORS.stone);
  const green = new THREE.Color(COLORS.grassDark);

  demo.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    if (object instanceof THREE.InstancedMesh && object.instanceColor) {
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      const base = new THREE.Vector3(1, 1, 1);
      object.geometry.boundingBox?.getSize(base);
      let changed = false;
      for (let index = 0; index < object.count; index += 1) {
        object.getColorAt(index, instanceColor);
        if (lightness(instanceColor) >= 0.2) continue;
        object.getMatrixAt(index, matrix);
        matrix.decompose(position, quaternion, scale);
        const sx = Math.abs(base.x * scale.x);
        const sy = Math.abs(base.y * scale.y);
        const sz = Math.abs(base.z * scale.z);
        const tall = sy > Math.max(sx, sz) * 1.22;
        const rail = sy < 0.85 && Math.max(sx, sz) > 1.6;
        object.setColorAt(index, tall ? brown : rail ? pale : green);
        changed = true;
      }
      if (changed && object.instanceColor) object.instanceColor.needsUpdate = true;
      return;
    }
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    object.geometry.boundingBox?.getSize(size);
    size.multiply(new THREE.Vector3(Math.abs(object.scale.x), Math.abs(object.scale.y), Math.abs(object.scale.z)));
    const tall = size.y > Math.max(size.x, size.z) * 1.22;
    const rail = size.y < 0.85 && Math.max(size.x, size.z) > 1.6;
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial) && !(mat instanceof THREE.MeshBasicMaterial)) continue;
      if (lightness(mat.color) >= 0.2) continue;
      mat.color.copy(tall ? brown : rail ? pale : green);
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.metalness = 0;
        mat.roughness = Math.max(mat.roughness, 0.78);
      }
      mat.needsUpdate = true;
    }
  });
}

function applyReferenceDaylight(demo: Phase20MatchDemo): void {
  demo.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  demo.renderer.toneMappingExposure = 1.3;
  demo.scene.background = new THREE.Color(COLORS.sky);
  if (demo.scene.fog instanceof THREE.Fog) {
    demo.scene.fog.color.setHex(COLORS.fog);
    demo.scene.fog.near = 112;
    demo.scene.fog.far = 330;
  }
  let keyLight = false;
  demo.scene.traverse((object) => {
    if (object instanceof THREE.HemisphereLight) {
      object.color.setHex(0xe8f6ff);
      object.groundColor.setHex(0xa6bf83);
      object.intensity = Math.max(object.intensity, 2.15);
    }
    if (object instanceof THREE.DirectionalLight) {
      if (!keyLight) {
        object.color.setHex(0xffe2bd);
        object.intensity = 2.5;
        object.position.set(-34, 52, 26);
        keyLight = true;
      } else {
        object.intensity = Math.min(object.intensity, 1.15);
      }
    }
  });
}

function addDenseCherry(root: THREE.Group, x: number, z: number, scale = 1): void {
  const trunk = material(COLORS.trunk, 0.9);
  const blossoms = [material(COLORS.blossom), material(COLORS.blossomHi), material(COLORS.blossomHot)];
  addBox(root, trunk, [x, 2.45 * scale, z], [0.78 * scale, 4.9 * scale, 0.78 * scale]);
  const clusters = [
    [0, 5.25, 0, 1.8], [-1.45, 5.0, 0.3, 1.55], [1.5, 5.15, -0.2, 1.6],
    [-0.65, 6.1, -1.05, 1.55], [0.8, 6.15, 0.95, 1.55], [0, 6.9, 0, 1.5],
  ];
  clusters.forEach((c, index) => addBox(root, blossoms[index % blossoms.length], [x + c[0] * scale, c[1] * scale, z + c[2] * scale], [c[3] * scale, 1.12 * scale, c[3] * scale]));
}

function addTorii(root: THREE.Group, x: number, z: number, rotationY = 0): void {
  const torii = new THREE.Group();
  torii.position.set(x, 0, z);
  torii.rotation.y = rotationY;
  root.add(torii);
  const red = material(COLORS.red, 0.76);
  const dark = material(COLORS.redDark, 0.82);
  for (const side of [-1, 1]) {
    addBox(torii, red, [side * 3.45, 2.65, 0], [0.48, 5.3, 0.55]);
    addBox(torii, dark, [side * 3.45, 0.18, 0], [0.75, 0.36, 0.82]);
  }
  addBox(torii, red, [0, 5.12, 0], [8.0, 0.52, 0.62]);
  addBox(torii, dark, [0, 5.7, 0], [9.2, 0.34, 0.82]);
  addBox(torii, red, [0, 4.45, 0], [6.2, 0.34, 0.48]);
}

function addNearGardenLayer(demo: Phase20MatchDemo): void {
  const root = new THREE.Group();
  root.name = "phase20-reference-match-world";
  demo.scene.add(root);
  const grass = [material(COLORS.grass), material(COLORS.grassHi), material(COLORS.grassDark)];
  const stones = [material(COLORS.stone), material(COLORS.stoneShade)];
  const flowerPalette = [0x84a9ff, 0xb48cff, 0xff91bf, 0xffda6d].map((c) => material(c, 0.82));

  for (const node of CART_WORLD_GRAPH.nodes) {
    if (node.kind === "corridor") continue;
    const points = cartArenaBoundaryPoints(node.id, 20, 0);
    points.forEach((point, index) => {
      if (cartArenaPointInPortal(node, point.x, point.z, 5.1)) return;
      const dx = point.x - node.rect.centerX;
      const dz = point.z - node.rect.centerZ;
      const len = Math.hypot(dx, dz) || 1;
      const nx = dx / len;
      const nz = dz / len;
      const tx = -nz;
      const tz = nx;
      if (index % 2 === 0) {
        const out = 2.85;
        addBox(root, grass[index % grass.length], [point.x + nx * out, 0.42, point.z + nz * out], [3.2, 0.82, 2.75]);
        addBox(root, grass[(index + 1) % grass.length], [point.x + nx * (out + 2.0) + tx * 0.7, 0.72, point.z + nz * (out + 2.0) + tz * 0.7], [2.7, 1.15, 2.4]);
      }
      if (index % 5 === 1) addDenseCherry(root, point.x + nx * 5.7 + tx * 0.8, point.z + nz * 5.7 + tz * 0.8, 0.92);
      if (index % 4 === 1) {
        for (let f = 0; f < 4; f += 1) addBox(root, flowerPalette[(index + f) % flowerPalette.length], [point.x + nx * 3.0 + tx * (f - 1.5) * 0.48, 0.35, point.z + nz * 3.0 + tz * (f - 1.5) * 0.48], [0.24, 0.54, 0.24]);
      }
      if (index % 5 === 3) {
        for (let s = 0; s < 3; s += 1) addBox(root, stones[(index + s) % 2], [point.x + nx * (3.1 + s * 0.35) + tx * (s - 1) * 0.7, 0.34 + s * 0.08, point.z + nz * (3.1 + s * 0.35) + tz * (s - 1) * 0.7], [0.78 + s * 0.08, 0.62 + s * 0.05, 0.78]);
      }
    });
  }

  addTorii(root, 0, 57, 0);
  addTorii(root, 0, 418, 0);
}

function polishHero(demo: Phase20MatchDemo): void {
  const root = demo.playerVisual;
  const white = material(COLORS.white, 0.55);
  const teal = material(COLORS.teal, 0.58);
  const tealDark = material(COLORS.tealDark, 0.66);
  const glass = material(COLORS.glass, 0.5);
  addBox(root, white, [-1.08, 1.24, -0.05], [0.16, 0.8, 2.15]);
  addBox(root, white, [1.08, 1.24, -0.05], [0.16, 0.8, 2.15]);
  addBox(root, teal, [0, 1.25, -1.42], [2.05, 0.48, 0.4]);
  addBox(root, tealDark, [0, 0.55, -1.78], [2.4, 0.32, 0.34]);
  addBox(root, glass, [0, 1.72, -1.19], [1.65, 0.64, 0.08]);
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x493a32, transparent: true, opacity: 0.14, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.8, 20), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.25, 1.8, 1);
  shadow.position.y = 0.04;
  root.add(shadow);
}

function closerReferenceCamera(demo: Phase20MatchDemo, snapshot: CartArenaSessionSnapshot): void {
  const fx = Math.sin(snapshot.heading);
  const fz = Math.cos(snapshot.heading);
  const rx = Math.cos(snapshot.heading);
  const rz = -Math.sin(snapshot.heading);
  const speed = THREE.MathUtils.clamp(Math.abs(snapshot.speed) / 28, 0, 1);
  const distance = snapshot.boostActive ? 9.65 : 8.2 + speed * 0.42;
  const height = snapshot.boostActive ? 6.15 : 5.25 + speed * 0.22;
  const lateral = -demo.steer * 0.2;
  demo.camera.position.set(snapshot.x - fx * distance + rx * lateral, height, snapshot.z - fz * distance + rz * lateral);
  demo.camera.lookAt(snapshot.x + fx * (5.4 + speed * 1.45), 0.84, snapshot.z + fz * (5.4 + speed * 1.45));
  demo.camera.fov = snapshot.boostActive ? 59.2 : 51.8 + speed * 1.25;
  demo.camera.updateProjectionMatrix();
}

export function installCartRoguePhase20ReferenceMatch(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase20MatchDemo;
  const oldWorld = prototype.buildWorld;
  const oldHero = prototype.buildPlayerVisual;
  const oldCamera = prototype.applyCameraPresentation;

  prototype.buildWorld = function phase20MatchWorld(this: Phase20MatchDemo): void {
    oldWorld.call(this);
    retintLegacyScenery(this);
    applyReferenceDaylight(this);
    addNearGardenLayer(this);
  };
  prototype.buildPlayerVisual = function phase20MatchHero(this: Phase20MatchDemo): void {
    oldHero.call(this);
    polishHero(this);
  };
  prototype.applyCameraPresentation = function phase20MatchCamera(this: Phase20MatchDemo, snapshot: CartArenaSessionSnapshot): void {
    oldCamera.call(this, snapshot);
    closerReferenceCamera(this, snapshot);
  };
}

installCartRoguePhase20ReferenceMatch();

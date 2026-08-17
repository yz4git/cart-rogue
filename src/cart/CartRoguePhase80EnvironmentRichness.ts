import * as THREE from "three";
import { CartArenaSession } from "./CartArenaSession";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_TURBO_HUNT_FIELD } from "./CartTurboHuntTrack";

export const CART_ENVIRONMENT_RICHNESS_COUNTS = {
  surfacePatches: 18,
  roadRhythm: 30,
  distantHills: 36,
  trees: 44,
  shrubs: 56,
  flowerBeds: 34,
  landmarkRegions: 5,
} as const;

export const CART_ENVIRONMENT_RICHNESS_DRAW_CALL_BUDGET = 16;

interface EnvironmentDemo {
  scene: THREE.Scene;
  session: CartArenaSession;
  buildWorld(): void;
}

interface SurfacePatch {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
  color: number;
  y: number;
}

const installedDemos = new WeakSet<object>();

function hash01(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function material(color = 0xffffff, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.015,
    flatShading: true,
    vertexColors: true,
  });
}

function addInstancedBoxes(
  root: THREE.Group,
  name: string,
  entries: readonly SurfacePatch[],
  baseHeight: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, baseHeight, 1),
    material(),
    entries.length,
  );
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    dummy.position.set(entry.x, entry.y, entry.z);
    dummy.rotation.set(0, entry.rotation, 0);
    dummy.scale.set(entry.width, 1, entry.depth);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, new THREE.Color(entry.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  root.add(mesh);
  return mesh;
}

function createSurfacePatches(cx: number, cz: number): SurfacePatch[] {
  const raw: Array<[number, number, number, number, number, number]> = [
    [-54, -62, 29, 18, -0.16, 0xc4d68f], [-18, -66, 32, 15, 0.08, 0xd2dd9a],
    [23, -63, 34, 17, -0.09, 0xb9d08b], [59, -58, 23, 21, 0.18, 0xd8cf8c],
    [-67, -26, 24, 29, 0.12, 0x9fc778], [-59, 16, 29, 31, -0.08, 0xb6d18b],
    [-61, 55, 31, 20, 0.17, 0xaacb7f], [62, -25, 27, 30, -0.13, 0xe1c37d],
    [64, 18, 31, 29, 0.11, 0xd8bd7a], [59, 55, 30, 18, -0.18, 0xe5ca8d],
    [-30, -21, 28, 24, 0.16, 0xe7bf84], [18, -18, 31, 25, -0.11, 0xedcf94],
    [-25, 24, 30, 25, -0.15, 0xdab780], [22, 25, 31, 24, 0.14, 0xe8c88f],
    [-54, 73, 30, 16, 0.05, 0xbca8d8], [-17, 72, 30, 16, -0.07, 0xcfb3e0],
    [21, 73, 30, 16, 0.09, 0xb9a0d3], [57, 71, 27, 17, -0.08, 0xd0b5dc],
  ];
  return raw.map(([x, z, width, depth, rotation, color]) => ({
    x: cx + x,
    z: cz + z,
    width,
    depth,
    rotation,
    color,
    y: -0.045,
  }));
}

function addRoadRhythm(root: THREE.Group, cx: number, cz: number): void {
  const entries: SurfacePatch[] = [];
  for (let index = 0; index < CART_ENVIRONMENT_RICHNESS_COUNTS.roadRhythm; index += 1) {
    const lane = index % 3;
    const vertical = lane !== 1;
    const offset = (index - CART_ENVIRONMENT_RICHNESS_COUNTS.roadRhythm / 2) * 5.3;
    entries.push({
      x: vertical ? cx + (lane === 0 ? -38 : 38) : cx + offset,
      z: vertical ? cz + offset : cz + 4,
      width: vertical ? 0.7 : 4.1,
      depth: vertical ? 4.2 : 0.64,
      rotation: lane === 2 ? 0.08 : lane === 0 ? -0.08 : 0,
      color: lane === 1 ? 0xf6e6b7 : index % 2 === 0 ? 0xf1d6a2 : 0xe7c88f,
      y: -0.018,
    });
  }
  addInstancedBoxes(root, "phase80-road-rhythm", entries, 0.025);
}

function addDistantHills(root: THREE.Group, cx: number, cz: number): void {
  const count = CART_ENVIRONMENT_RICHNESS_COUNTS.distantHills;
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const hillMaterial = material();
  const hills = new THREE.InstancedMesh(geometry, hillMaterial, count);
  hills.name = "phase80-distant-hills";
  hills.castShadow = false;
  hills.receiveShadow = false;
  hills.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const dummy = new THREE.Object3D();
  const colors = [0x7faf79, 0x86b982, 0x74a875, 0x9bc78a, 0x879f78];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + hash01(index + 4) * 0.12;
    const radius = 118 + hash01(index + 18) * 43;
    const height = 10 + hash01(index + 31) * 18;
    const width = 16 + hash01(index + 47) * 24;
    dummy.position.set(cx + Math.cos(angle) * radius, height * 0.22 - 1.2, cz + Math.sin(angle) * radius);
    dummy.rotation.set(0, angle + hash01(index + 71) * 0.7, 0);
    dummy.scale.set(width, height, width * (0.55 + hash01(index + 93) * 0.28));
    dummy.updateMatrix();
    hills.setMatrixAt(index, dummy.matrix);
    hills.setColorAt(index, new THREE.Color(colors[index % colors.length]));
  }
  hills.instanceMatrix.needsUpdate = true;
  if (hills.instanceColor) hills.instanceColor.needsUpdate = true;
  root.add(hills);
}

function addTreeGroves(root: THREE.Group, cx: number, cz: number): void {
  const count = CART_ENVIRONMENT_RICHNESS_COUNTS.trees;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.72, 1, 6), material(0xffffff), count);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), material(0xffffff), count);
  trunk.name = "phase80-tree-trunks";
  crown.name = "phase80-tree-crowns";
  trunk.castShadow = false;
  crown.castShadow = false;
  trunk.receiveShadow = false;
  crown.receiveShadow = false;
  trunk.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  crown.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const dummy = new THREE.Object3D();
  const trunkColors = [0x8c6b52, 0x735a48, 0x9b7456];
  const leafColors = [0x6fae6d, 0x7fbe72, 0x5f9f68, 0x91c67b];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + hash01(index + 205) * 0.2;
    const radius = 99 + hash01(index + 211) * 15;
    const height = 4.8 + hash01(index + 219) * 4.3;
    const spread = 2.8 + hash01(index + 233) * 2.7;
    const x = cx + Math.cos(angle) * radius;
    const z = cz + Math.sin(angle) * radius;
    dummy.position.set(x, height * 0.5, z);
    dummy.rotation.set(0, hash01(index + 241) * Math.PI, 0);
    dummy.scale.set(0.72 + hash01(index + 249) * 0.42, height, 0.72 + hash01(index + 257) * 0.42);
    dummy.updateMatrix();
    trunk.setMatrixAt(index, dummy.matrix);
    trunk.setColorAt(index, new THREE.Color(trunkColors[index % trunkColors.length]));
    dummy.position.set(x, height + spread * 0.52, z);
    dummy.rotation.set(hash01(index + 267) * 0.12, hash01(index + 277) * Math.PI, hash01(index + 283) * 0.12);
    dummy.scale.set(spread, spread * (0.8 + hash01(index + 291) * 0.32), spread);
    dummy.updateMatrix();
    crown.setMatrixAt(index, dummy.matrix);
    crown.setColorAt(index, new THREE.Color(leafColors[index % leafColors.length]));
  }
  trunk.instanceMatrix.needsUpdate = true;
  crown.instanceMatrix.needsUpdate = true;
  if (trunk.instanceColor) trunk.instanceColor.needsUpdate = true;
  if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
  root.add(trunk, crown);
}

function addLowScenery(root: THREE.Group, cx: number, cz: number): void {
  const shrubCount = CART_ENVIRONMENT_RICHNESS_COUNTS.shrubs;
  const shrubs = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), material(), shrubCount);
  shrubs.name = "phase80-shrub-clusters";
  shrubs.castShadow = false;
  shrubs.receiveShadow = false;
  shrubs.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const dummy = new THREE.Object3D();
  const shrubColors = [0x78b66b, 0x8bc476, 0x65a969, 0xa2cf84];
  for (let index = 0; index < shrubCount; index += 1) {
    const angle = hash01(index + 317) * Math.PI * 2;
    const radius = 73 + hash01(index + 329) * 20;
    const x = cx + Math.cos(angle) * radius;
    const z = cz + Math.sin(angle) * radius;
    const scale = 0.7 + hash01(index + 337) * 1.35;
    dummy.position.set(x, 0.3 + scale * 0.22, z);
    dummy.rotation.set(0, hash01(index + 347) * Math.PI, 0);
    dummy.scale.set(scale * 1.4, scale * 0.7, scale);
    dummy.updateMatrix();
    shrubs.setMatrixAt(index, dummy.matrix);
    shrubs.setColorAt(index, new THREE.Color(shrubColors[index % shrubColors.length]));
  }
  shrubs.instanceMatrix.needsUpdate = true;
  if (shrubs.instanceColor) shrubs.instanceColor.needsUpdate = true;

  const flowerCount = CART_ENVIRONMENT_RICHNESS_COUNTS.flowerBeds;
  const flowerBeds = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.06, 10), material(), flowerCount);
  flowerBeds.name = "phase80-flower-beds";
  flowerBeds.castShadow = false;
  flowerBeds.receiveShadow = false;
  flowerBeds.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const flowerColors = [0xf2a8c8, 0xe9cf71, 0x9bbcf1, 0xd7a9e8, 0xf4c08b];
  for (let index = 0; index < flowerCount; index += 1) {
    const angle = (index / flowerCount) * Math.PI * 2 + hash01(index + 367) * 0.26;
    const radius = 61 + hash01(index + 373) * 25;
    const x = cx + Math.cos(angle) * radius;
    const z = cz + Math.sin(angle) * radius;
    const scale = 1.2 + hash01(index + 389) * 2.1;
    dummy.position.set(x, 0.015, z);
    dummy.rotation.set(0, hash01(index + 397) * Math.PI, 0);
    dummy.scale.set(scale * 1.8, 1, scale);
    dummy.updateMatrix();
    flowerBeds.setMatrixAt(index, dummy.matrix);
    flowerBeds.setColorAt(index, new THREE.Color(flowerColors[index % flowerColors.length]));
  }
  flowerBeds.instanceMatrix.needsUpdate = true;
  if (flowerBeds.instanceColor) flowerBeds.instanceColor.needsUpdate = true;
  root.add(shrubs, flowerBeds);
}

function landmarkBox(
  root: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  color: number,
  rotationY = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, 0.76));
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  root.add(mesh);
  return mesh;
}

function addLandmarks(root: THREE.Group, cx: number, cz: number, hw: number, hd: number): void {
  const landmarkRoot = new THREE.Group();
  landmarkRoot.name = "phase80-region-landmarks";

  // DROP YARD: a monumental gantry just beyond the north edge.
  const dropZ = cz - hd - 7;
  landmarkBox(landmarkRoot, [4, 18, 4], [cx - 17, 9, dropZ], 0x5f9f87);
  landmarkBox(landmarkRoot, [4, 18, 4], [cx + 17, 9, dropZ], 0x5f9f87);
  landmarkBox(landmarkRoot, [38, 3.2, 4], [cx, 17, dropZ], 0xe8d690);
  for (const x of [-11, -5.5, 0, 5.5, 11]) landmarkBox(landmarkRoot, [1.2, 5.5, 0.8], [cx + x, 13.2, dropZ + 0.5], 0xf0b48c, x * 0.008);

  // SMASH GARDEN: giant angular stone teeth outside the west edge.
  const smashX = cx - hw - 9;
  for (let index = 0; index < 4; index += 1) {
    const monolith = landmarkBox(
      landmarkRoot,
      [7 + index * 1.2, 15 + index * 3.3, 6.5],
      [smashX - index * 3.2, 7.5 + index * 1.65, cz - 24 + index * 17],
      index % 2 === 0 ? 0x8e8793 : 0xa29aa3,
      -0.24 + index * 0.11,
    );
    monolith.rotation.z = index % 2 === 0 ? -0.08 : 0.08;
  }

  // SPRINT LANE: repeated high arches beyond the east edge.
  const sprintX = cx + hw + 8;
  for (let index = 0; index < 5; index += 1) {
    const z = cz - 42 + index * 21;
    landmarkBox(landmarkRoot, [2, 13, 2], [sprintX - 5.5, 6.5, z], 0x65aeca);
    landmarkBox(landmarkRoot, [2, 13, 2], [sprintX + 5.5, 6.5, z], 0x65aeca);
    landmarkBox(landmarkRoot, [13, 1.5, 2], [sprintX, 12.4, z], index % 2 === 0 ? 0xf3d56c : 0xe7b96f);
  }

  // CROWN GROUNDS: tall crown towers beyond the south edge.
  const crownZ = cz + hd + 8;
  for (const side of [-1, 1]) {
    const x = cx + side * 16;
    landmarkBox(landmarkRoot, [5.2, 24, 5.2], [x, 12, crownZ], 0x9a7dc0);
    for (const spike of [-1, 0, 1]) {
      const crown = landmarkBox(landmarkRoot, [1.8, 7 + Math.abs(spike) * 2, 1.8], [x + spike * 3.2, 25.5, crownZ], 0xd8b5e5);
      crown.rotation.z = spike * 0.12;
    }
  }
  landmarkBox(landmarkRoot, [37, 2, 3], [cx, 18.5, crownZ], 0xe9d8ee);

  // CROSSFIRE GARDEN: floating ring and fins overhead, keeping the drive surface unobstructed.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(12, 0.72, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0x66c6bb, roughness: 0.62, metalness: 0.04, flatShading: true, emissive: 0x143d39, emissiveIntensity: 0.22 }),
  );
  ring.name = "phase80-crossfire-ring";
  ring.position.set(cx, 19, cz);
  ring.rotation.x = Math.PI / 2;
  ring.castShadow = false;
  ring.receiveShadow = false;
  landmarkRoot.add(ring);
  for (let index = 0; index < 4; index += 1) {
    const angle = index * Math.PI * 0.5 + Math.PI * 0.25;
    landmarkBox(landmarkRoot, [1.2, 7.5, 3.4], [cx + Math.cos(angle) * 15, 18.5, cz + Math.sin(angle) * 15], 0xf1ca72, angle);
  }

  root.add(landmarkRoot);
}

function addBackdropBands(root: THREE.Group, cx: number, cz: number): void {
  const entries: SurfacePatch[] = [];
  for (let index = 0; index < 24; index += 1) {
    const angle = (index / 24) * Math.PI * 2;
    const radius = 105;
    entries.push({
      x: cx + Math.cos(angle) * radius,
      z: cz + Math.sin(angle) * radius,
      width: 8 + (index % 4) * 2.5,
      depth: 2.2,
      rotation: -angle,
      color: index % 3 === 0 ? 0xd8e2af : index % 3 === 1 ? 0xc8d7a0 : 0xe2ca9a,
      y: 0.08,
    });
  }
  addInstancedBoxes(root, "phase80-backdrop-bands", entries, 0.18);
}

export function buildCartEnvironmentRichness(scene: THREE.Scene): THREE.Group {
  const root = new THREE.Group();
  root.name = "phase80-environment-richness";
  const { centerX: cx, centerZ: cz, halfWidth: hw, halfDepth: hd } = CART_TURBO_HUNT_FIELD;
  addInstancedBoxes(root, "phase80-surface-patches", createSurfacePatches(cx, cz), 0.04);
  addRoadRhythm(root, cx, cz);
  addLowScenery(root, cx, cz);
  addTreeGroves(root, cx, cz);
  addDistantHills(root, cx, cz);
  addBackdropBands(root, cx, cz);
  addLandmarks(root, cx, cz, hw, hd);
  root.userData.environmentRichness = {
    counts: { ...CART_ENVIRONMENT_RICHNESS_COUNTS },
    drawCallBudget: CART_ENVIRONMENT_RICHNESS_DRAW_CALL_BUDGET,
    textureless: true,
    gameplayCollisionChanged: false,
  };
  scene.add(root);
  return root;
}

export function installCartRoguePhase80EnvironmentRichness(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as EnvironmentDemo;
  const previousBuildWorld = prototype.buildWorld;
  prototype.buildWorld = function environmentRichnessBuildWorld(this: EnvironmentDemo): void {
    previousBuildWorld.call(this);
    if (!isCartTurboHuntEnabled(this.session) || installedDemos.has(this as unknown as object)) return;
    installedDemos.add(this as unknown as object);
    buildCartEnvironmentRichness(this.scene);
  };
}

installCartRoguePhase80EnvironmentRichness();

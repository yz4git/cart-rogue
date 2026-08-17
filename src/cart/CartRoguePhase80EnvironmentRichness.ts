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

// Fixed-material color buckets deliberately trade a few static draw calls for
// reliable WebGL color rendering. Phase80 previously used per-instance colors,
// which repeated the older static instanceColor black-render failure.
export const CART_ENVIRONMENT_RICHNESS_DRAW_CALL_BUDGET = 24;
export const CART_ENVIRONMENT_SURFACE_Y = 0.006;
export const CART_ENVIRONMENT_ROAD_RHYTHM_Y = 0.014;

interface EnvironmentDemo {
  scene: THREE.Scene;
  session: CartArenaSession;
  buildWorld(): void;
}

interface InstanceEntry {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ry: number;
  rz?: number;
  color: number;
}

interface ColorBucket {
  entries: InstanceEntry[];
  r: number;
  g: number;
  b: number;
  count: number;
}

const installedDemos = new WeakSet<object>();
const COLOR_BUCKET_STEPS = 2;

function hash01(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function colorChannels(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

function colorBucketKey(color: number): string {
  const [r, g, b] = colorChannels(color);
  return [r, g, b]
    .map((channel) => Math.round((channel / 255) * COLOR_BUCKET_STEPS))
    .join(":");
}

function fixedStandardMaterial(color: number, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.015,
    flatShading: true,
    vertexColors: false,
    emissive: color,
    emissiveIntensity: 0.055,
  });
}

function fixedUnlitMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    vertexColors: false,
    toneMapped: false,
    depthTest: true,
    depthWrite: true,
  });
}

function bucketEntries(entries: readonly InstanceEntry[]): ColorBucket[] {
  const buckets = new Map<string, ColorBucket>();
  for (const entry of entries) {
    const key = colorBucketKey(entry.color);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { entries: [], r: 0, g: 0, b: 0, count: 0 };
      buckets.set(key, bucket);
    }
    const [r, g, b] = colorChannels(entry.color);
    bucket.entries.push(entry);
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
  }
  return [...buckets.values()];
}

function averageBucketColor(bucket: ColorBucket): number {
  const count = Math.max(1, bucket.count);
  const r = Math.round(bucket.r / count);
  const g = Math.round(bucket.g / count);
  const b = Math.round(bucket.b / count);
  return (r << 16) | (g << 8) | b;
}

function addFixedColorInstances(
  root: THREE.Object3D,
  name: string,
  geometry: THREE.BufferGeometry,
  entries: readonly InstanceEntry[],
  options: { roughness?: number; unlit?: boolean; frustumCulled?: boolean } = {},
): number {
  const layer = new THREE.Group();
  layer.name = name;
  const dummy = new THREE.Object3D();
  const buckets = bucketEntries(entries);

  buckets.forEach((bucket, bucketIndex) => {
    const color = averageBucketColor(bucket);
    const material = options.unlit
      ? fixedUnlitMaterial(color)
      : fixedStandardMaterial(color, options.roughness ?? 0.9);
    const mesh = new THREE.InstancedMesh(geometry, material, bucket.entries.length);
    mesh.name = `${name}-bucket-${bucketIndex}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = options.frustumCulled ?? true;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    bucket.entries.forEach((entry, index) => {
      dummy.position.set(entry.x, entry.y, entry.z);
      dummy.rotation.set(0, entry.ry, entry.rz ?? 0);
      dummy.scale.set(entry.sx, entry.sy, entry.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    layer.add(mesh);
  });

  root.add(layer);
  return buckets.length;
}

function createSurfacePatches(cx: number, cz: number): InstanceEntry[] {
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
    y: CART_ENVIRONMENT_SURFACE_Y,
    z: cz + z,
    sx: width,
    sy: 0.006,
    sz: depth,
    ry: rotation,
    color,
  }));
}

function createRoadRhythm(cx: number, cz: number): InstanceEntry[] {
  const entries: InstanceEntry[] = [];
  for (let index = 0; index < CART_ENVIRONMENT_RICHNESS_COUNTS.roadRhythm; index += 1) {
    const lane = index % 3;
    const vertical = lane !== 1;
    const offset = (index - CART_ENVIRONMENT_RICHNESS_COUNTS.roadRhythm / 2) * 5.3;
    entries.push({
      x: vertical ? cx + (lane === 0 ? -38 : 38) : cx + offset,
      y: CART_ENVIRONMENT_ROAD_RHYTHM_Y,
      z: vertical ? cz + offset : cz + 4,
      sx: vertical ? 0.7 : 4.1,
      sy: 0.004,
      sz: vertical ? 4.2 : 0.64,
      ry: lane === 2 ? 0.08 : lane === 0 ? -0.08 : 0,
      color: lane === 1 ? 0xf6e6b7 : index % 2 === 0 ? 0xf1d6a2 : 0xe7c88f,
    });
  }
  return entries;
}

function createDistantHills(cx: number, cz: number): InstanceEntry[] {
  const entries: InstanceEntry[] = [];
  const colors = [0x7faf79, 0x86b982, 0x74a875, 0x9bc78a, 0x879f78];
  for (let index = 0; index < CART_ENVIRONMENT_RICHNESS_COUNTS.distantHills; index += 1) {
    const angle = (index / CART_ENVIRONMENT_RICHNESS_COUNTS.distantHills) * Math.PI * 2 + hash01(index + 4) * 0.12;
    const radius = 118 + hash01(index + 18) * 43;
    const height = 10 + hash01(index + 31) * 18;
    const width = 16 + hash01(index + 47) * 24;
    entries.push({
      x: cx + Math.cos(angle) * radius,
      y: height * 0.22 - 1.2,
      z: cz + Math.sin(angle) * radius,
      sx: width,
      sy: height,
      sz: width * (0.55 + hash01(index + 93) * 0.28),
      ry: angle + hash01(index + 71) * 0.7,
      color: colors[index % colors.length],
    });
  }
  return entries;
}

function createTreeEntries(cx: number, cz: number): { trunks: InstanceEntry[]; crowns: InstanceEntry[] } {
  const trunks: InstanceEntry[] = [];
  const crowns: InstanceEntry[] = [];
  const trunkColors = [0x8c6b52, 0x735a48, 0x9b7456];
  const leafColors = [0x6fae6d, 0x7fbe72, 0x5f9f68, 0x91c67b];
  for (let index = 0; index < CART_ENVIRONMENT_RICHNESS_COUNTS.trees; index += 1) {
    const angle = (index / CART_ENVIRONMENT_RICHNESS_COUNTS.trees) * Math.PI * 2 + hash01(index + 205) * 0.2;
    const radius = 99 + hash01(index + 211) * 15;
    const height = 4.8 + hash01(index + 219) * 4.3;
    const spread = 2.8 + hash01(index + 233) * 2.7;
    const x = cx + Math.cos(angle) * radius;
    const z = cz + Math.sin(angle) * radius;
    trunks.push({
      x,
      y: height * 0.5,
      z,
      sx: 0.72 + hash01(index + 249) * 0.42,
      sy: height,
      sz: 0.72 + hash01(index + 257) * 0.42,
      ry: hash01(index + 241) * Math.PI,
      color: trunkColors[index % trunkColors.length],
    });
    crowns.push({
      x,
      y: height + spread * 0.52,
      z,
      sx: spread,
      sy: spread * (0.8 + hash01(index + 291) * 0.32),
      sz: spread,
      ry: hash01(index + 277) * Math.PI,
      rz: (hash01(index + 283) - 0.5) * 0.12,
      color: leafColors[index % leafColors.length],
    });
  }
  return { trunks, crowns };
}

function createShrubs(cx: number, cz: number): InstanceEntry[] {
  const entries: InstanceEntry[] = [];
  const colors = [0x78b66b, 0x8bc476, 0x65a969, 0xa2cf84];
  for (let index = 0; index < CART_ENVIRONMENT_RICHNESS_COUNTS.shrubs; index += 1) {
    const angle = hash01(index + 317) * Math.PI * 2;
    const radius = 73 + hash01(index + 329) * 20;
    const scale = 0.7 + hash01(index + 337) * 1.35;
    entries.push({
      x: cx + Math.cos(angle) * radius,
      y: 0.3 + scale * 0.22,
      z: cz + Math.sin(angle) * radius,
      sx: scale * 1.4,
      sy: scale * 0.7,
      sz: scale,
      ry: hash01(index + 347) * Math.PI,
      color: colors[index % colors.length],
    });
  }
  return entries;
}

function createFlowerBeds(cx: number, cz: number): InstanceEntry[] {
  const entries: InstanceEntry[] = [];
  const colors = [0xf2a8c8, 0xe9cf71, 0x9bbcf1, 0xd7a9e8, 0xf4c08b];
  for (let index = 0; index < CART_ENVIRONMENT_RICHNESS_COUNTS.flowerBeds; index += 1) {
    const angle = (index / CART_ENVIRONMENT_RICHNESS_COUNTS.flowerBeds) * Math.PI * 2 + hash01(index + 367) * 0.26;
    const radius = 61 + hash01(index + 373) * 25;
    const scale = 1.2 + hash01(index + 389) * 2.1;
    entries.push({
      x: cx + Math.cos(angle) * radius,
      y: 0.03,
      z: cz + Math.sin(angle) * radius,
      sx: scale * 1.8,
      sy: 1,
      sz: scale,
      ry: hash01(index + 397) * Math.PI,
      color: colors[index % colors.length],
    });
  }
  return entries;
}

function createBackdropBands(cx: number, cz: number): InstanceEntry[] {
  const entries: InstanceEntry[] = [];
  for (let index = 0; index < 24; index += 1) {
    const angle = (index / 24) * Math.PI * 2;
    const radius = 105;
    entries.push({
      x: cx + Math.cos(angle) * radius,
      y: 0.08,
      z: cz + Math.sin(angle) * radius,
      sx: 8 + (index % 4) * 2.5,
      sy: 0.18,
      sz: 2.2,
      ry: -angle,
      color: index % 3 === 0 ? 0xd8e2af : index % 3 === 1 ? 0xc8d7a0 : 0xe2ca9a,
    });
  }
  return entries;
}

function createLandmarkBoxes(cx: number, cz: number, hw: number, hd: number): InstanceEntry[] {
  const entries: InstanceEntry[] = [];
  const push = (sx: number, sy: number, sz: number, x: number, y: number, z: number, color: number, ry = 0, rz = 0) => {
    entries.push({ x, y, z, sx, sy, sz, color, ry, rz });
  };

  const dropZ = cz - hd - 7;
  push(4, 18, 4, cx - 17, 9, dropZ, 0x5f9f87);
  push(4, 18, 4, cx + 17, 9, dropZ, 0x5f9f87);
  push(38, 3.2, 4, cx, 17, dropZ, 0xe8d690);
  for (const x of [-11, -5.5, 0, 5.5, 11]) push(1.2, 5.5, 0.8, cx + x, 13.2, dropZ + 0.5, 0xf0b48c, x * 0.008);

  const smashX = cx - hw - 9;
  for (let index = 0; index < 4; index += 1) {
    push(
      7 + index * 1.2,
      15 + index * 3.3,
      6.5,
      smashX - index * 3.2,
      7.5 + index * 1.65,
      cz - 24 + index * 17,
      index % 2 === 0 ? 0x8e8793 : 0xa29aa3,
      -0.24 + index * 0.11,
      index % 2 === 0 ? -0.08 : 0.08,
    );
  }

  const sprintX = cx + hw + 8;
  for (let index = 0; index < 5; index += 1) {
    const z = cz - 42 + index * 21;
    push(2, 13, 2, sprintX - 5.5, 6.5, z, 0x65aeca);
    push(2, 13, 2, sprintX + 5.5, 6.5, z, 0x65aeca);
    push(13, 1.5, 2, sprintX, 12.4, z, index % 2 === 0 ? 0xf3d56c : 0xe7b96f);
  }

  const crownZ = cz + hd + 8;
  for (const side of [-1, 1]) {
    const x = cx + side * 16;
    push(5.2, 24, 5.2, x, 12, crownZ, 0x9a7dc0);
    for (const spike of [-1, 0, 1]) {
      push(1.8, 7 + Math.abs(spike) * 2, 1.8, x + spike * 3.2, 25.5, crownZ, 0xd8b5e5, 0, spike * 0.12);
    }
  }
  push(37, 2, 3, cx, 18.5, crownZ, 0xe9d8ee);

  for (let index = 0; index < 4; index += 1) {
    const angle = index * Math.PI * 0.5 + Math.PI * 0.25;
    push(1.2, 7.5, 3.4, cx + Math.cos(angle) * 15, 18.5, cz + Math.sin(angle) * 15, 0xf1ca72, angle);
  }
  return entries;
}

function addLandmarks(root: THREE.Group, cx: number, cz: number, hw: number, hd: number): number {
  const landmarkRoot = new THREE.Group();
  landmarkRoot.name = "phase80-region-landmarks";
  let batches = addFixedColorInstances(
    landmarkRoot,
    "phase80-landmark-boxes",
    new THREE.BoxGeometry(1, 1, 1),
    createLandmarkBoxes(cx, cz, hw, hd),
    { roughness: 0.76, frustumCulled: false },
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(12, 0.72, 8, 32),
    new THREE.MeshStandardMaterial({
      color: 0x66c6bb,
      roughness: 0.62,
      metalness: 0.04,
      flatShading: true,
      emissive: 0x143d39,
      emissiveIntensity: 0.22,
    }),
  );
  ring.name = "phase80-crossfire-ring";
  ring.position.set(cx, 19, cz);
  ring.rotation.x = Math.PI / 2;
  ring.castShadow = false;
  ring.receiveShadow = false;
  landmarkRoot.add(ring);
  batches += 1;
  root.add(landmarkRoot);
  return batches;
}

export function buildCartEnvironmentRichness(scene: THREE.Scene): THREE.Group {
  const root = new THREE.Group();
  root.name = "phase80-environment-richness";
  const { centerX: cx, centerZ: cz, halfWidth: hw, halfDepth: hd } = CART_TURBO_HUNT_FIELD;
  let renderableBatchCount = 0;

  renderableBatchCount += addFixedColorInstances(
    root,
    "phase80-surface-patches",
    new THREE.BoxGeometry(1, 1, 1),
    createSurfacePatches(cx, cz),
    { unlit: true, frustumCulled: false },
  );
  renderableBatchCount += addFixedColorInstances(
    root,
    "phase80-road-rhythm",
    new THREE.BoxGeometry(1, 1, 1),
    createRoadRhythm(cx, cz),
    { unlit: true, frustumCulled: false },
  );
  renderableBatchCount += addFixedColorInstances(
    root,
    "phase80-shrub-clusters",
    new THREE.DodecahedronGeometry(1, 0),
    createShrubs(cx, cz),
  );
  renderableBatchCount += addFixedColorInstances(
    root,
    "phase80-flower-beds",
    new THREE.CylinderGeometry(1, 1, 0.06, 10),
    createFlowerBeds(cx, cz),
  );

  const trees = createTreeEntries(cx, cz);
  renderableBatchCount += addFixedColorInstances(
    root,
    "phase80-tree-trunks",
    new THREE.CylinderGeometry(0.5, 0.72, 1, 6),
    trees.trunks,
  );
  renderableBatchCount += addFixedColorInstances(
    root,
    "phase80-tree-crowns",
    new THREE.IcosahedronGeometry(1, 1),
    trees.crowns,
  );
  renderableBatchCount += addFixedColorInstances(
    root,
    "phase80-distant-hills",
    new THREE.DodecahedronGeometry(1, 0),
    createDistantHills(cx, cz),
    { frustumCulled: false },
  );
  renderableBatchCount += addFixedColorInstances(
    root,
    "phase80-backdrop-bands",
    new THREE.BoxGeometry(1, 1, 1),
    createBackdropBands(cx, cz),
    { unlit: true, frustumCulled: false },
  );
  renderableBatchCount += addLandmarks(root, cx, cz, hw, hd);

  root.userData.environmentRichness = {
    counts: { ...CART_ENVIRONMENT_RICHNESS_COUNTS },
    drawCallBudget: CART_ENVIRONMENT_RICHNESS_DRAW_CALL_BUDGET,
    renderableBatchCount,
    textureless: true,
    gameplayCollisionChanged: false,
    staticOnly: true,
    safeColorPipeline: "fixed-material-buckets",
    usesInstanceColor: false,
    surfaceY: CART_ENVIRONMENT_SURFACE_Y,
    roadRhythmY: CART_ENVIRONMENT_ROAD_RHYTHM_Y,
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
import * as THREE from "three";
import { cartArenaContains, cartArenaShapeForNode } from "./CartArenaShapes";
import {
  cartGraphicStageForNode,
  type CartGraphicStage,
} from "./CartRoguePhase26StageIdentity";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_WORLD_GRAPH, type CartWorldNode } from "./CartWorldGraph";

interface Phase35Demo {
  scene: THREE.Scene;
  buildWorld(): void;
}

interface TileEntry {
  x: number;
  z: number;
  sx: number;
  sz: number;
  color: THREE.Color;
}

interface TreeEntry {
  x: number;
  z: number;
  scale: number;
  stage: CartGraphicStage;
}

const states = new WeakMap<object, THREE.Group>();
const TILE_GEOMETRY = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const ROAD_TILE_SIZE = 2.6;
const APRON_TILE_SIZE = 3.2;
const APRON_WIDTH = 8.2;

/**
 * Kept as an exported visual-reference palette for tests/tools. Runtime road
 * rendering is owned by the fixed-color Phase 46 ground renderer.
 */
const ROAD_PALETTES: Readonly<Record<CartGraphicStage, readonly number[]>> = {
  meadow: [0xe7c887, 0xd8b673, 0xf0d397, 0xcda665, 0xe1bf7c],
  orchard: [0xe9c58b, 0xdcb477, 0xf2d19b, 0xcda16a, 0xe4bb82],
  grove: [0xc6ae79, 0xb29a6b, 0xd4bd8a, 0xa68c61, 0xc0a574],
  canyon: [0xc98558, 0xb8734e, 0xda9967, 0xa96247, 0xcd7f55],
  boss: [0x7b7180, 0x69616f, 0x8b7e91, 0x5f5965, 0x756978],
};

const GRASS_PALETTES: Readonly<Record<CartGraphicStage, readonly number[]>> = {
  meadow: [0x83c86c, 0x71b95e, 0x96d47c, 0x67a856, 0xa2d487],
  orchard: [0x87c96b, 0x74b85d, 0x9bd17c, 0x6ba452, 0xa7d589],
  grove: [0x5f9764, 0x508656, 0x71a870, 0x47784e, 0x7eb17b],
  canyon: [0x9b8e58, 0x887b4d, 0xa79b62, 0x786d46, 0xb0a16a],
  boss: [0x67636a, 0x5c5860, 0x716b75, 0x514f55, 0x7a7380],
};

const FLOWER_COLORS: Readonly<Record<CartGraphicStage, readonly number[]>> = {
  meadow: [0xff78b4, 0xffd25f, 0xa976ff, 0xffffff],
  orchard: [0xff87b9, 0xffb8cf, 0xd68cff, 0xffffff],
  grove: [0xd989ff, 0xffdd70, 0x79d6ff, 0xf5f0d8],
  canyon: [0xffa45e, 0xffd56d, 0xe98274, 0xf8e5b7],
  boss: [0xc488ff, 0x8d9dff, 0xee8cff, 0xd9c8ff],
};

export function cartMosaicRoadTileSize(): number {
  return ROAD_TILE_SIZE;
}

export function cartMosaicApronWidth(): number {
  return APRON_WIDTH;
}

export function cartMosaicRoadPalette(stage: CartGraphicStage): readonly number[] {
  return ROAD_PALETTES[stage];
}

export function cartMosaicGrassPalette(stage: CartGraphicStage): readonly number[] {
  return GRASS_PALETTES[stage];
}

function seeded(a: number, b: number, salt: number): number {
  const value = Math.sin(a * 91.73 + b * 47.11 + salt * 13.37) * 43758.5453123;
  return value - Math.floor(value);
}

function pointInsideNode(node: CartWorldNode, x: number, z: number, margin = 0.15): boolean {
  if (cartArenaShapeForNode(node.id)) return cartArenaContains(node.id, x, z, margin);
  return x >= node.rect.centerX - node.rect.halfWidth + margin
    && x <= node.rect.centerX + node.rect.halfWidth - margin
    && z >= node.rect.centerZ - node.rect.halfDepth + margin
    && z <= node.rect.centerZ + node.rect.halfDepth - margin;
}

function nodeForPoint(x: number, z: number): CartWorldNode | null {
  let match: CartWorldNode | null = null;
  let matchArea = Number.POSITIVE_INFINITY;
  for (const node of CART_WORLD_GRAPH.nodes) {
    if (!pointInsideNode(node, x, z)) continue;
    const area = node.rect.halfWidth * node.rect.halfDepth;
    if (area < matchArea) {
      match = node;
      matchArea = area;
    }
  }
  return match;
}

function distanceToRect(node: CartWorldNode, x: number, z: number): number {
  const dx = Math.max(Math.abs(x - node.rect.centerX) - node.rect.halfWidth, 0);
  const dz = Math.max(Math.abs(z - node.rect.centerZ) - node.rect.halfDepth, 0);
  return Math.hypot(dx, dz);
}

function nearestNode(x: number, z: number, maxDistance: number): CartWorldNode | null {
  let best: CartWorldNode | null = null;
  let bestDistance = maxDistance;
  for (const node of CART_WORLD_GRAPH.nodes) {
    const distance = distanceToRect(node, x, z);
    if (distance > bestDistance) continue;
    bestDistance = distance;
    best = node;
  }
  return best;
}

function worldBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const node of CART_WORLD_GRAPH.nodes) {
    minX = Math.min(minX, node.rect.centerX - node.rect.halfWidth);
    maxX = Math.max(maxX, node.rect.centerX + node.rect.halfWidth);
    minZ = Math.min(minZ, node.rect.centerZ - node.rect.halfDepth);
    maxZ = Math.max(maxZ, node.rect.centerZ + node.rect.halfDepth);
  }
  return { minX, maxX, minZ, maxZ };
}

function colorFromPalette(palette: readonly number[], xIndex: number, zIndex: number, salt: number): THREE.Color {
  const value = seeded(xIndex, zIndex, salt);
  return new THREE.Color(palette[Math.floor(value * palette.length) % palette.length]);
}

function createTileMesh(entries: readonly TileEntry[], name: string, y: number): THREE.InstancedMesh {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.98,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  const mesh = new THREE.InstancedMesh(TILE_GEOMETRY, material, entries.length);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    dummy.position.set(entry.x, y, entry.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(entry.sx, 1, entry.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, entry.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function buildApronTiles(): { grass: TileEntry[]; flowers: TileEntry[] } {
  const bounds = worldBounds();
  const grass: TileEntry[] = [];
  const flowers: TileEntry[] = [];
  const minX = bounds.minX - APRON_WIDTH;
  const maxX = bounds.maxX + APRON_WIDTH;
  const minZ = bounds.minZ - APRON_WIDTH;
  const maxZ = bounds.maxZ + APRON_WIDTH;
  const startX = Math.floor(minX / APRON_TILE_SIZE) * APRON_TILE_SIZE;
  const startZ = Math.floor(minZ / APRON_TILE_SIZE) * APRON_TILE_SIZE;

  let xi = 0;
  for (let x = startX; x <= maxX; x += APRON_TILE_SIZE, xi += 1) {
    let zi = 0;
    for (let z = startZ; z <= maxZ; z += APRON_TILE_SIZE, zi += 1) {
      if (nodeForPoint(x, z)) continue;
      const nearby = nearestNode(x, z, APRON_WIDTH);
      if (!nearby) continue;
      const stage = cartGraphicStageForNode(nearby.id);
      const palette = GRASS_PALETTES[stage];
      grass.push({
        x,
        z,
        sx: APRON_TILE_SIZE * 0.97,
        sz: APRON_TILE_SIZE * 0.97,
        color: colorFromPalette(palette, xi, zi, 31 + (nearby.tier ?? 0)),
      });

      const flowerChance = seeded(xi, zi, 73 + nearby.id.length);
      if (flowerChance > 0.84) {
        const flowerPalette = FLOWER_COLORS[stage];
        flowers.push({
          x: x + (seeded(xi, zi, 81) - 0.5) * 1.4,
          z: z + (seeded(xi, zi, 89) - 0.5) * 1.4,
          sx: 0.38 + seeded(xi, zi, 97) * 0.48,
          sz: 0.38 + seeded(xi, zi, 101) * 0.48,
          color: colorFromPalette(flowerPalette, xi, zi, 107),
        });
      }
    }
  }
  return { grass, flowers };
}

function buildWaterAndBanks(): { water: TileEntry[]; banks: TileEntry[] } {
  const water: TileEntry[] = [];
  const banks: TileEntry[] = [];
  const ribbons = [
    { nodeId: "arena-01", side: -1, width: 5.4, inset: 3.8 },
    { nodeId: "arena-02", side: 1, width: 5.0, inset: 4.2 },
    { nodeId: "arena-03", side: -1, width: 5.8, inset: 4.0 },
  ] as const;

  for (const ribbon of ribbons) {
    const node = CART_WORLD_GRAPH.nodes.find((candidate) => candidate.id === ribbon.nodeId);
    if (!node) continue;
    const stage = cartGraphicStageForNode(node.id);
    const x = node.rect.centerX + ribbon.side * (node.rect.halfWidth + ribbon.inset);
    const startZ = node.rect.centerZ - node.rect.halfDepth * 0.78;
    const endZ = node.rect.centerZ + node.rect.halfDepth * 0.78;
    let index = 0;
    for (let z = startZ; z <= endZ; z += 2.8, index += 1) {
      const shimmer = seeded(index, node.id.length, 119);
      const waterColor = stage === "grove"
        ? new THREE.Color(shimmer > 0.5 ? 0x56bfb5 : 0x68cbbd)
        : new THREE.Color(shimmer > 0.5 ? 0x58c9d7 : 0x6fd9df);
      water.push({ x, z, sx: ribbon.width, sz: 2.62, color: waterColor });
      banks.push({
        x: x - ribbon.side * (ribbon.width * 0.58),
        z,
        sx: 0.6,
        sz: 1.18,
        color: new THREE.Color(stage === "grove" ? 0xa8a28f : 0xc5bca4),
      });
    }
  }
  return { water, banks };
}

function heroTrees(): TreeEntry[] {
  return [
    { x: -34, z: 13, scale: 1.15, stage: "meadow" },
    { x: 34, z: 18, scale: 1.25, stage: "meadow" },
    { x: -35, z: 43, scale: 1.3, stage: "meadow" },
    { x: 36, z: 105, scale: 1.35, stage: "orchard" },
    { x: -37, z: 124, scale: 1.45, stage: "orchard" },
    { x: 36, z: 287, scale: 1.4, stage: "grove" },
    { x: -38, z: 271, scale: 1.32, stage: "grove" },
    { x: -29, z: 350, scale: 1.1, stage: "canyon" },
  ];
}

function addHeroTrees(root: THREE.Group): void {
  const trees = heroTrees();
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x6f5038,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const trunkMesh = new THREE.InstancedMesh(BOX_GEOMETRY, trunkMaterial, trees.length);
  trunkMesh.name = "phase35-hero-tree-trunks";
  const trunkDummy = new THREE.Object3D();
  trees.forEach((tree, index) => {
    trunkDummy.position.set(tree.x, 3.2 * tree.scale, tree.z);
    trunkDummy.rotation.set(0, (index % 3) * 0.11, 0);
    trunkDummy.scale.set(1.45 * tree.scale, 6.4 * tree.scale, 1.45 * tree.scale);
    trunkDummy.updateMatrix();
    trunkMesh.setMatrixAt(index, trunkDummy.matrix);
  });
  trunkMesh.instanceMatrix.needsUpdate = true;
  trunkMesh.castShadow = false;
  trunkMesh.receiveShadow = false;
  root.add(trunkMesh);

  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  const canopyMesh = new THREE.InstancedMesh(BOX_GEOMETRY, canopyMaterial, trees.length * 5);
  canopyMesh.name = "phase35-hero-tree-canopies";
  const canopyDummy = new THREE.Object3D();
  let cursor = 0;
  for (let treeIndex = 0; treeIndex < trees.length; treeIndex += 1) {
    const tree = trees[treeIndex];
    const colors = tree.stage === "meadow" || tree.stage === "orchard"
      ? [0xff9fc5, 0xffb4d2, 0xff8fba, 0xffc2da, 0xf694bd]
      : tree.stage === "grove"
        ? [0x65a96d, 0x72b678, 0x57945f, 0x83be84, 0x4f8857]
        : [0xb89668, 0xc3a472, 0xa9875e, 0xcfb27e, 0x987854];
    const offsets = [
      [0, 0, 0, 1.0],
      [-2.6, -0.3, 0.5, 0.78],
      [2.5, -0.15, 0.2, 0.82],
      [-0.5, 0.35, -2.1, 0.72],
      [0.8, 0.2, 2.1, 0.74],
    ] as const;
    for (let part = 0; part < offsets.length; part += 1) {
      const [ox, oy, oz, scale] = offsets[part];
      canopyDummy.position.set(
        tree.x + ox * tree.scale,
        (8.4 + oy) * tree.scale,
        tree.z + oz * tree.scale,
      );
      canopyDummy.rotation.set(0, ((treeIndex + part) % 4) * 0.13, 0);
      canopyDummy.scale.set(5.1 * tree.scale * scale, 3.1 * tree.scale * scale, 4.7 * tree.scale * scale);
      canopyDummy.updateMatrix();
      canopyMesh.setMatrixAt(cursor, canopyDummy.matrix);
      canopyMesh.setColorAt(cursor, new THREE.Color(colors[part]));
      cursor += 1;
    }
  }
  canopyMesh.instanceMatrix.needsUpdate = true;
  if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
  canopyMesh.castShadow = false;
  canopyMesh.receiveShadow = false;
  root.add(canopyMesh);
}

function buildMosaicDiorama(demo: Phase35Demo): void {
  const key = demo as unknown as object;
  if (states.has(key)) return;
  const root = new THREE.Group();
  root.name = "phase35-mosaic-diorama";
  demo.scene.add(root);
  states.set(key, root);

  // Road rendering used to be generated here and then replaced twice by later
  // phases. Phase 35 now owns roadside-only scenery; Phase 46 is the sole road.
  const apron = buildApronTiles();
  const waterAndBanks = buildWaterAndBanks();

  root.add(createTileMesh(apron.grass, "phase35-grass-mosaic", 0.012));
  root.add(createTileMesh(waterAndBanks.water, "phase35-water-mosaic", 0.028));
  root.add(createTileMesh(waterAndBanks.banks, "phase35-stone-banks", 0.033));
  root.add(createTileMesh(apron.flowers, "phase35-flower-beds", 0.038));
  addHeroTrees(root);
}

export function installCartRoguePhase35MosaicDiorama(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase35Demo;
  const oldWorld = prototype.buildWorld;
  prototype.buildWorld = function phase35World(this: Phase35Demo): void {
    oldWorld.call(this);
    buildMosaicDiorama(this);
  };
}

installCartRoguePhase35MosaicDiorama();

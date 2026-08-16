import * as THREE from "three";
import { cartArenaContains, cartArenaShapeForNode } from "./CartArenaShapes";
import {
  cartGraphicStageForNode,
  type CartGraphicStage,
} from "./CartRoguePhase26StageIdentity";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_WORLD_GRAPH, type CartWorldNode } from "./CartWorldGraph";

interface Phase38Demo {
  scene: THREE.Scene;
  buildWorld(): void;
}

interface TilePosition {
  x: number;
  z: number;
  shade: number;
  stage: CartGraphicStage;
}

const states = new WeakMap<object, THREE.Group>();
const TILE_SIZE = 2.65;
const TILE_SCALE = 0.945;
const TILE_Y = 0.084;
const TILE_GEOMETRY = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

const PALETTES: Readonly<Record<CartGraphicStage, readonly [number, number, number]>> = {
  meadow: [0xe8c77e, 0xd1a75f, 0xf3d99a],
  orchard: [0xe9bf7f, 0xd6a466, 0xf3d19a],
  grove: [0xc4a86f, 0xa88b5c, 0xd7bc83],
  canyon: [0xcc8152, 0xa95f43, 0xdf9a68],
  boss: [0x82748b, 0x625a69, 0x9a88a1],
};

const STAGES: readonly CartGraphicStage[] = ["meadow", "orchard", "grove", "canyon", "boss"];

export function cartPhase38RoadTileSize(): number {
  return TILE_SIZE;
}

export function cartPhase38RoadTileY(): number {
  return TILE_Y;
}

export function cartPhase38RoadPalette(stage: CartGraphicStage): readonly [number, number, number] {
  return PALETTES[stage];
}

export function cartPhase38UsesInstanceColors(): boolean {
  return false;
}

function pointInsideNode(node: CartWorldNode, x: number, z: number): boolean {
  if (cartArenaShapeForNode(node.id)) return cartArenaContains(node.id, x, z, 0.22);
  return Math.abs(x - node.rect.centerX) <= node.rect.halfWidth - 0.1
    && Math.abs(z - node.rect.centerZ) <= node.rect.halfDepth - 0.1;
}

function nodeForPoint(x: number, z: number): CartWorldNode | null {
  let best: CartWorldNode | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const node of CART_WORLD_GRAPH.nodes) {
    if (!pointInsideNode(node, x, z)) continue;
    const area = node.rect.halfWidth * node.rect.halfDepth;
    if (area >= bestArea) continue;
    best = node;
    bestArea = area;
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

function shadeForTile(xIndex: number, zIndex: number, node: CartWorldNode): number {
  const hash = Math.abs(Math.imul(xIndex + 101, 73856093) ^ Math.imul(zIndex + 211, 19349663) ^ Math.imul((node.tier ?? 1) + node.id.length, 83492791));
  if (hash % 11 < 3) return 1;
  if (hash % 11 > 8) return 2;
  return 0;
}

function collectTiles(): TilePosition[] {
  const bounds = worldBounds();
  const tiles: TilePosition[] = [];
  const startX = Math.floor(bounds.minX / TILE_SIZE) * TILE_SIZE;
  const endX = Math.ceil(bounds.maxX / TILE_SIZE) * TILE_SIZE;
  const startZ = Math.floor(bounds.minZ / TILE_SIZE) * TILE_SIZE;
  const endZ = Math.ceil(bounds.maxZ / TILE_SIZE) * TILE_SIZE;

  let xi = 0;
  for (let x = startX; x <= endX; x += TILE_SIZE, xi += 1) {
    let zi = 0;
    for (let z = startZ; z <= endZ; z += TILE_SIZE, zi += 1) {
      const node = nodeForPoint(x, z);
      if (!node) continue;
      tiles.push({
        x,
        z,
        shade: shadeForTile(xi, zi, node),
        stage: cartGraphicStageForNode(node.id),
      });
    }
  }
  return tiles;
}

function addBucket(root: THREE.Group, entries: readonly TilePosition[], stage: CartGraphicStage, shade: number): void {
  if (entries.length === 0) return;
  const material = new THREE.MeshBasicMaterial({
    color: PALETTES[stage][shade],
    depthTest: true,
    depthWrite: true,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(TILE_GEOMETRY, material, entries.length);
  mesh.name = `phase38-road-${stage}-${shade}`;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    dummy.position.set(entry.x, TILE_Y, entry.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(TILE_SIZE * TILE_SCALE, 1, TILE_SIZE * TILE_SCALE);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
}

function buildReliableMosaic(demo: Phase38Demo): void {
  const key = demo as unknown as object;
  if (states.has(key)) return;

  const oldRoad = demo.scene.getObjectByName("phase35-road-mosaic");
  if (oldRoad) oldRoad.visible = false;

  const root = new THREE.Group();
  root.name = "phase38-reliable-road-mosaic";
  demo.scene.add(root);
  states.set(key, root);

  const tiles = collectTiles();
  for (const stage of STAGES) {
    for (let shade = 0; shade < 3; shade += 1) {
      addBucket(root, tiles.filter((tile) => tile.stage === stage && tile.shade === shade), stage, shade);
    }
  }
}

export function installCartRoguePhase38ReliableMosaic(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase38Demo;
  const oldWorld = prototype.buildWorld;
  prototype.buildWorld = function phase38World(this: Phase38Demo): void {
    oldWorld.call(this);
    buildReliableMosaic(this);
  };
}

installCartRoguePhase38ReliableMosaic();

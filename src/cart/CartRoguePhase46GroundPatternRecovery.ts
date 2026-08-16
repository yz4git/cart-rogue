import * as THREE from "three";
import { cartArenaContains, cartArenaShapeForNode } from "./CartArenaShapes";
import {
  cartGraphicStageForNode,
  type CartGraphicStage,
} from "./CartRoguePhase26StageIdentity";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_WORLD_GRAPH, type CartWorldNode } from "./CartWorldGraph";

interface Phase46Demo {
  scene: THREE.Scene;
  buildWorld(): void;
}

interface PatternTile {
  x: number;
  z: number;
  rotationY: number;
  scaleX: number;
  scaleZ: number;
  stage: CartGraphicStage;
  shade: number;
}

interface WearMark {
  x: number;
  z: number;
  rotationY: number;
  scaleX: number;
  scaleZ: number;
  stage: CartGraphicStage;
}

const states = new WeakMap<object, THREE.Group>();
const TILE_GEOMETRY = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const TILE_SIZE = 2.55;
const TILE_SCALE = 0.87;
// Phase19 reference ground cover sits at y=0.145. Keep the replacement road
// clearly above that surface without lifting it high enough to look detached.
const TILE_Y = 0.185;
const WEAR_Y = 0.202;

const STAGES: readonly CartGraphicStage[] = ["meadow", "orchard", "grove", "canyon", "boss"];

// Very light fixed-color pastel buckets keep the mosaic readable while making
// the ground recede behind the brighter cart, foliage and combat effects.
const PALETTES: Readonly<Record<CartGraphicStage, readonly [number, number, number, number, number]>> = {
  meadow: [0xf2e6c9, 0xeadcbc, 0xf8edd7, 0xefe2c3, 0xe4d4b2],
  orchard: [0xf4dfd1, 0xebd3c4, 0xf9e9df, 0xf0dbce, 0xe3c8b8],
  grove: [0xd9dac8, 0xced0be, 0xe6e7d8, 0xc4c7b5, 0xd2d3c2],
  canyon: [0xf0d4ca, 0xe6c4b9, 0xf7e2da, 0xdfb9af, 0xeacad0],
  boss: [0xc3becd, 0xb3adbd, 0xd3cedc, 0xa8a2b2, 0xbab4c4],
};

const WEAR_COLORS: Readonly<Record<CartGraphicStage, number>> = {
  meadow: 0xd9c5a6,
  orchard: 0xdab9ab,
  grove: 0xb4b39f,
  canyon: 0xd1aba1,
  boss: 0x918b99,
};

export function cartPhase46UsesInstanceColors(): boolean {
  return false;
}

export function cartPhase46TileGapRatio(): number {
  return 1 - TILE_SCALE;
}

export function cartPhase46TileY(): number {
  return TILE_Y;
}

export function cartPhase46RoadPalette(stage: CartGraphicStage): readonly [number, number, number, number, number] {
  return PALETTES[stage];
}

export function cartPhase46ShadeIndex(xIndex: number, zIndex: number, nodeSeed: number): number {
  const diagonal = Math.abs(xIndex + zIndex * 2 + nodeSeed) % 9;
  if (diagonal === 0 || diagonal === 6) return 4;
  if (diagonal === 2 || diagonal === 7) return 1;
  if (diagonal === 4) return 2;
  const hash = Math.abs(Math.imul(xIndex + 97, 73856093) ^ Math.imul(zIndex + 193, 19349663) ^ Math.imul(nodeSeed + 17, 83492791));
  return hash % 3 === 0 ? 3 : 0;
}

function pointInsideNode(node: CartWorldNode, x: number, z: number): boolean {
  if (cartArenaShapeForNode(node.id)) return cartArenaContains(node.id, x, z, 0.38);
  return x >= node.rect.centerX - node.rect.halfWidth + 0.26
    && x <= node.rect.centerX + node.rect.halfWidth - 0.26
    && z >= node.rect.centerZ - node.rect.halfDepth + 0.26
    && z <= node.rect.centerZ + node.rect.halfDepth - 0.26;
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

function collectPattern(): { tiles: PatternTile[]; wear: WearMark[] } {
  const bounds = worldBounds();
  const tiles: PatternTile[] = [];
  const wear: WearMark[] = [];
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
      const stage = cartGraphicStageForNode(node.id);
      const nodeSeed = node.id.length * 11 + (node.tier ?? 0) * 7;
      const shade = cartPhase46ShadeIndex(xi, zi, nodeSeed);
      const elongated = (xi + zi + nodeSeed) % 11 === 0;
      tiles.push({
        x,
        z,
        rotationY: elongated ? ((xi + zi) % 2 === 0 ? 0.055 : -0.055) : 0,
        scaleX: TILE_SIZE * TILE_SCALE * (elongated ? 0.78 : 1),
        scaleZ: TILE_SIZE * TILE_SCALE * (elongated ? 1.08 : 1),
        stage,
        shade,
      });

      const localCenter = Math.abs(x - node.rect.centerX) <= Math.max(2.4, node.rect.halfWidth * 0.22);
      const wearCandidate = localCenter && ((xi * 3 + zi + nodeSeed) % 8 === 0);
      if (wearCandidate) {
        wear.push({
          x: x + ((xi + zi) % 2 === 0 ? -0.42 : 0.42),
          z: z + ((zi + nodeSeed) % 3 - 1) * 0.22,
          rotationY: ((xi + zi) % 3 - 1) * 0.12,
          scaleX: 0.16 + ((xi + nodeSeed) % 3) * 0.045,
          scaleZ: 0.68 + ((zi + nodeSeed) % 4) * 0.15,
          stage,
        });
      }
    }
  }
  return { tiles, wear };
}

function addFixedColorBucket(root: THREE.Group, entries: readonly PatternTile[], stage: CartGraphicStage, shade: number): void {
  if (entries.length === 0) return;
  const material = new THREE.MeshBasicMaterial({
    color: PALETTES[stage][shade],
    transparent: false,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
    toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(TILE_GEOMETRY, material, entries.length);
  mesh.name = `phase46-ground-${stage}-${shade}`;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // A bucket spans several authored rooms hundreds of world units apart. Keep
  // it out of object-level frustum culling so the current room's instances are
  // never discarded because of a stale/approximate aggregate bounds sphere.
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    dummy.position.set(entry.x, TILE_Y, entry.z);
    dummy.rotation.set(0, entry.rotationY, 0);
    dummy.scale.set(entry.scaleX, 1, entry.scaleZ);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
}

function addWearBucket(root: THREE.Group, entries: readonly WearMark[], stage: CartGraphicStage): void {
  if (entries.length === 0) return;
  const material = new THREE.MeshBasicMaterial({
    color: WEAR_COLORS[stage],
    transparent: false,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
    toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(TILE_GEOMETRY, material, entries.length);
  mesh.name = `phase46-wear-${stage}`;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    dummy.position.set(entry.x, WEAR_Y, entry.z);
    dummy.rotation.set(0, entry.rotationY, 0);
    dummy.scale.set(entry.scaleX, 1, entry.scaleZ);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
}

function buildSafeGroundPattern(demo: Phase46Demo): void {
  const key = demo as unknown as object;
  if (states.has(key)) return;

  // Phase 45 correctly removed the risky white-base detail layer. Phase 46
  // replaces only the visual pattern with fixed-color buckets, rather than
  // re-enabling the old instanceColor surface.
  const phase38 = demo.scene.getObjectByName("phase38-reliable-road-mosaic");
  if (phase38) {
    phase38.visible = false;
    phase38.position.y = -20;
  }
  const phase35Road = demo.scene.getObjectByName("phase35-road-mosaic");
  if (phase35Road) phase35Road.visible = false;
  const phase34Detail = demo.scene.getObjectByName("phase34-floor-detail");
  if (phase34Detail) phase34Detail.visible = false;

  const root = new THREE.Group();
  root.name = "phase46-safe-ground-pattern";
  demo.scene.add(root);
  states.set(key, root);

  const pattern = collectPattern();
  for (const stage of STAGES) {
    for (let shade = 0; shade < 5; shade += 1) {
      addFixedColorBucket(root, pattern.tiles.filter((tile) => tile.stage === stage && tile.shade === shade), stage, shade);
    }
    addWearBucket(root, pattern.wear.filter((mark) => mark.stage === stage), stage);
  }

  demo.scene.userData.phase46GroundPatternRecovered = true;
  demo.scene.userData.phase46GroundTileCount = pattern.tiles.length;
  demo.scene.userData.phase46GroundWearCount = pattern.wear.length;
}

export function installCartRoguePhase46GroundPatternRecovery(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase46Demo;
  const oldWorld = prototype.buildWorld;
  prototype.buildWorld = function phase46GroundPatternWorld(this: Phase46Demo): void {
    oldWorld.call(this);
    buildSafeGroundPattern(this);
  };
}

installCartRoguePhase46GroundPatternRecovery();

import * as THREE from "three";
import { cartArenaContains, cartArenaShapeForNode } from "./CartArenaShapes";
import { cartGraphicStageForNode } from "./CartRoguePhase26StageIdentity";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_WORLD_GRAPH, type CartWorldNodeKind } from "./CartWorldGraph";

interface Phase34Demo {
  scene: THREE.Scene;
  buildWorld(): void;
}

const states = new WeakMap<object, THREE.Group>();
const PATCH_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const PEBBLE_GEOMETRY = new THREE.DodecahedronGeometry(1, 0);

export function cartFloorDetailDensity(kind: CartWorldNodeKind): number {
  if (kind === "corridor") return 24;
  if (kind === "boss") return 54;
  return 42;
}

function seeded(seed: number): number {
  const value = Math.sin(seed * 97.319 + 11.731) * 43758.5453123;
  return value - Math.floor(value);
}

function stagePatchColors(nodeId: string): readonly number[] {
  const stage = cartGraphicStageForNode(nodeId);
  if (stage === "orchard") return [0xe0ba8f, 0xcfa678, 0xefd0a5, 0xb99069];
  if (stage === "grove") return [0xb59d73, 0x9f8a67, 0xc6b185, 0x7f8665];
  if (stage === "canyon") return [0xc68159, 0xa9674b, 0xde9d6b, 0x8f5b48];
  if (stage === "boss") return [0x716878, 0x5b5561, 0x887b8e, 0x4f4a54];
  return [0xcbb98b, 0xb8a676, 0xd8c79d, 0x9ea06e];
}

function insideNode(nodeId: string, kind: CartWorldNodeKind, x: number, z: number): boolean {
  const node = CART_WORLD_GRAPH.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return false;
  if (cartArenaShapeForNode(nodeId)) return cartArenaContains(nodeId, x, z, 1.75);
  const margin = kind === "corridor" ? 0.85 : 1.5;
  return x >= node.rect.centerX - node.rect.halfWidth + margin
    && x <= node.rect.centerX + node.rect.halfWidth - margin
    && z >= node.rect.centerZ - node.rect.halfDepth + margin
    && z <= node.rect.centerZ + node.rect.halfDepth - margin;
}

function buildFloorDetails(demo: Phase34Demo): void {
  const key = demo as unknown as object;
  if (states.has(key)) return;
  const root = new THREE.Group();
  root.name = "phase34-floor-detail";
  demo.scene.add(root);
  states.set(key, root);

  const patchEntries: Array<{ x: number; z: number; sx: number; sz: number; ry: number; color: THREE.Color }> = [];
  const pebbleEntries: Array<{ x: number; z: number; y: number; scale: number; ry: number; color: THREE.Color }> = [];

  for (let nodeIndex = 0; nodeIndex < CART_WORLD_GRAPH.nodes.length; nodeIndex += 1) {
    const node = CART_WORLD_GRAPH.nodes[nodeIndex];
    const density = cartFloorDetailDensity(node.kind);
    const colors = stagePatchColors(node.id);

    for (let index = 0; index < density; index += 1) {
      const seed = nodeIndex * 1009 + index * 37;
      const x = node.rect.centerX + (seeded(seed + 1) * 2 - 1) * node.rect.halfWidth * 0.94;
      const z = node.rect.centerZ + (seeded(seed + 2) * 2 - 1) * node.rect.halfDepth * 0.94;
      if (!insideNode(node.id, node.kind, x, z)) continue;
      const nearCenter = Math.abs(x - node.rect.centerX) < node.rect.halfWidth * 0.22;
      const lengthBias = nearCenter ? 1.35 : 1;
      patchEntries.push({
        x,
        z,
        sx: (0.28 + seeded(seed + 3) * 0.72) * lengthBias,
        sz: 0.2 + seeded(seed + 4) * 0.78,
        ry: seeded(seed + 5) * Math.PI,
        color: new THREE.Color(colors[index % colors.length]),
      });

      if (index % 3 === 0) {
        pebbleEntries.push({
          x: x + (seeded(seed + 6) - 0.5) * 0.9,
          z: z + (seeded(seed + 7) - 0.5) * 0.9,
          y: 0.055 + seeded(seed + 8) * 0.035,
          scale: 0.07 + seeded(seed + 9) * 0.13,
          ry: seeded(seed + 10) * Math.PI * 2,
          color: new THREE.Color(colors[(index + 2) % colors.length]),
        });
      }
    }

    // A subtle worn ribbon gives every route a readable driven-through surface.
    const ribbonCount = node.kind === "corridor" ? 14 : 10;
    for (let index = 0; index < ribbonCount; index += 1) {
      const t = ribbonCount <= 1 ? 0.5 : index / (ribbonCount - 1);
      const z = node.rect.centerZ + (t * 2 - 1) * node.rect.halfDepth * 0.82;
      const x = node.rect.centerX + Math.sin(t * Math.PI * 2 + nodeIndex) * Math.min(1.8, node.rect.halfWidth * 0.08);
      if (!insideNode(node.id, node.kind, x, z)) continue;
      patchEntries.push({
        x,
        z,
        sx: node.kind === "corridor" ? 1.15 : 0.92,
        sz: node.kind === "corridor" ? 0.42 : 0.34,
        ry: 0,
        color: new THREE.Color(colors[1]).multiplyScalar(0.82),
      });
    }
  }

  const patchMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.99,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  const patches = new THREE.InstancedMesh(PATCH_GEOMETRY, patchMaterial, patchEntries.length);
  const patchDummy = new THREE.Object3D();
  patchEntries.forEach((entry, index) => {
    patchDummy.position.set(entry.x, 0.026, entry.z);
    patchDummy.rotation.set(0, entry.ry, 0);
    patchDummy.scale.set(entry.sx, 0.018, entry.sz);
    patchDummy.updateMatrix();
    patches.setMatrixAt(index, patchDummy.matrix);
    patches.setColorAt(index, entry.color);
  });
  patches.instanceMatrix.needsUpdate = true;
  if (patches.instanceColor) patches.instanceColor.needsUpdate = true;
  patches.receiveShadow = false;
  patches.castShadow = false;
  root.add(patches);

  const pebbleMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  const pebbles = new THREE.InstancedMesh(PEBBLE_GEOMETRY, pebbleMaterial, pebbleEntries.length);
  const pebbleDummy = new THREE.Object3D();
  pebbleEntries.forEach((entry, index) => {
    pebbleDummy.position.set(entry.x, entry.y, entry.z);
    pebbleDummy.rotation.set(entry.ry * 0.31, entry.ry, entry.ry * 0.17);
    pebbleDummy.scale.set(entry.scale * 1.2, entry.scale * 0.65, entry.scale);
    pebbleDummy.updateMatrix();
    pebbles.setMatrixAt(index, pebbleDummy.matrix);
    pebbles.setColorAt(index, entry.color);
  });
  pebbles.instanceMatrix.needsUpdate = true;
  if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
  pebbles.castShadow = false;
  pebbles.receiveShadow = false;
  root.add(pebbles);
}

export function installCartRoguePhase34FloorDetail(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase34Demo;
  const oldWorld = prototype.buildWorld;
  prototype.buildWorld = function phase34World(this: Phase34Demo): void {
    oldWorld.call(this);
    buildFloorDetails(this);
  };
}

installCartRoguePhase34FloorDetail();

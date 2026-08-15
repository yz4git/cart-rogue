import * as THREE from "three";
import { cartArenaBoundaryPoints, cartArenaPointInPortal, cartArenaShapeForNode } from "./CartArenaShapes";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_WORLD_GRAPH } from "./CartWorldGraph";

interface GardenPolishDemo {
  scene: THREE.Scene;
  buildWorld(): void;
}

interface BoxEntry {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: THREE.Color;
  rotation?: number;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);

function addInstancedBoxes(root: THREE.Group, entries: readonly BoxEntry[], roughness = 0.9): void {
  if (entries.length === 0) return;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness: 0, flatShading: true });
  const mesh = new THREE.InstancedMesh(BOX, material, entries.length);
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    dummy.position.set(entry.x, entry.y, entry.z);
    dummy.scale.set(entry.sx, entry.sy, entry.sz);
    dummy.rotation.set(0, entry.rotation ?? 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, entry.color);
  });
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  root.add(mesh);
}

function buildNearGarden(root: THREE.Group): void {
  const terraces: BoxEntry[] = [];
  const trunks: BoxEntry[] = [];
  const blossoms: BoxEntry[] = [];
  const bushes: BoxEntry[] = [];

  const greenPalette = [new THREE.Color(0x79b95c), new THREE.Color(0x96cf6e), new THREE.Color(0xb2dd84)];
  const pinkPalette = [new THREE.Color(0xe975ab), new THREE.Color(0xf18bbb), new THREE.Color(0xffadd2)];
  const trunk = new THREE.Color(0x936b4f);

  for (const node of CART_WORLD_GRAPH.nodes) {
    if (node.kind === "corridor" || !cartArenaShapeForNode(node.id)) continue;
    const points = cartArenaBoundaryPoints(node.id, 40, 0.2);
    points.forEach((point, index) => {
      if (cartArenaPointInPortal(node, point.x, point.z, 4.4)) return;
      const dx = point.x - node.rect.centerX;
      const dz = point.z - node.rect.centerZ;
      const length = Math.hypot(dx, dz) || 1;
      const nx = dx / length;
      const nz = dz / length;
      const tx = -nz;
      const tz = nx;

      if (index % 2 === 0) {
        for (let tier = 0; tier < 2; tier += 1) {
          const outward = 1.7 + tier * 1.65;
          const tangentOffset = ((index % 5) - 2) * 0.34;
          terraces.push({
            x: point.x + nx * outward + tx * tangentOffset,
            y: 0.48 + tier * 0.52,
            z: point.z + nz * outward + tz * tangentOffset,
            sx: 3.8 + (index % 3) * 0.65,
            sy: 0.9 + tier * 0.26,
            sz: 3.35 + ((index + tier) % 3) * 0.62,
            color: greenPalette[(index + tier) % greenPalette.length],
            rotation: ((index % 5) - 2) * 0.035,
          });
        }
      }

      if (index % 4 === 0) {
        const outward = 3.0 + (index % 3) * 0.62;
        const treeX = point.x + nx * outward;
        const treeZ = point.z + nz * outward;
        trunks.push({ x: treeX, y: 2.75, z: treeZ, sx: 0.95, sy: 5.5, sz: 0.95, color: trunk });
        const crownY = 6.05 + (index % 2) * 0.22;
        const offsets: Array<[number, number, number]> = [
          [0, 0, 0], [-1.35, 0.08, 0], [1.35, 0.12, 0], [0, 0.1, -1.32], [0, 0.08, 1.32],
          [-0.9, 0.9, -0.72], [0.9, 0.82, -0.72], [0.86, 0.84, 0.72], [-0.86, 0.76, 0.72], [0, 1.5, 0],
        ];
        offsets.forEach((offset, crownIndex) => {
          blossoms.push({
            x: treeX + offset[0],
            y: crownY + offset[1],
            z: treeZ + offset[2],
            sx: 1.68 + (crownIndex % 3) * 0.14,
            sy: 1.3 + (crownIndex % 2) * 0.12,
            sz: 1.68 + (crownIndex % 4) * 0.1,
            color: pinkPalette[(index + crownIndex) % pinkPalette.length],
          });
        });
      } else if (index % 2 === 1) {
        const outward = 2.25 + (index % 3) * 0.35;
        for (let shrub = 0; shrub < 3; shrub += 1) {
          bushes.push({
            x: point.x + nx * outward + tx * (shrub - 1) * 0.72,
            y: 0.58 + (shrub % 2) * 0.12,
            z: point.z + nz * outward + tz * (shrub - 1) * 0.72,
            sx: 1.18,
            sy: 0.95,
            sz: 1.18,
            color: greenPalette[(index + shrub) % greenPalette.length],
          });
        }
      }
    });
  }

  addInstancedBoxes(root, terraces, 0.94);
  addInstancedBoxes(root, trunks, 0.9);
  addInstancedBoxes(root, blossoms, 0.86);
  addInstancedBoxes(root, bushes, 0.9);
}

export function installCartRoguePhase19GardenPolish(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as GardenPolishDemo;
  const originalBuildWorld = prototype.buildWorld;
  prototype.buildWorld = function buildWorldPhase19GardenPolish(this: GardenPolishDemo): void {
    originalBuildWorld.call(this);
    const root = new THREE.Group();
    root.name = "phase19-near-garden-polish";
    this.scene.add(root);
    buildNearGarden(root);
  };
}

installCartRoguePhase19GardenPolish();

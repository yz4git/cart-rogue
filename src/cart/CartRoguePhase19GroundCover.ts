import * as THREE from "three";
import { cartArenaBoundaryPoints, cartArenaPointInPortal, cartArenaShapeForNode } from "./CartArenaShapes";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_WORLD_GRAPH } from "./CartWorldGraph";

interface Phase19GroundDemo {
  scene: THREE.Scene;
  buildWorld(): void;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);

function mat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.94, metalness: 0, flatShading: true });
}

function shapeFor(nodeId: string, cx: number, cz: number): THREE.Shape | null {
  const points = cartArenaBoundaryPoints(nodeId, 72, 0.05);
  if (points.length < 3) return null;
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    const x = point.x - cx;
    const y = point.z - cz;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

function seeded(index: number, salt = 0): number {
  const value = Math.sin(index * 74.73 + salt * 31.19) * 43758.5453;
  return value - Math.floor(value);
}

function addTopSurface(root: THREE.Group): void {
  const sandMaterials = [mat(0xf1ca86), mat(0xf7d99a), mat(0xe6b873)];
  for (const node of CART_WORLD_GRAPH.nodes) {
    if (node.kind === "corridor") {
      const floor = new THREE.Mesh(new THREE.BoxGeometry(node.rect.halfWidth * 2 - 0.1, 0.12, node.rect.halfDepth * 2 - 0.1), sandMaterials[0]);
      floor.position.set(node.rect.centerX, 0.095, node.rect.centerZ);
      floor.receiveShadow = false;
      root.add(floor);
      continue;
    }
    const shape = shapeFor(node.id, node.rect.centerX, node.rect.centerZ);
    if (!shape) continue;
    const geometry = new THREE.ShapeGeometry(shape, 1);
    const floor = new THREE.Mesh(geometry, sandMaterials[node.id === "arena-02" ? 1 : node.kind === "boss" ? 2 : 0]);
    // ShapeGeometry starts in XY with a +Z normal. Rotate -90° around X so
    // the reference-art arena cover faces upward (+Y) and actually occludes
    // all legacy floor layers beneath it from the gameplay camera.
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(node.rect.centerX, 0.145, node.rect.centerZ);
    floor.receiveShadow = false;
    root.add(floor);
  }
}

function addWarmPavers(root: THREE.Group): void {
  const entries: Array<{ x: number; z: number; sx: number; sz: number; color: THREE.Color }> = [];
  const palette = [new THREE.Color(0xf8dfa8), new THREE.Color(0xe9bd79), new THREE.Color(0xf3cf91)];
  for (const node of CART_WORLD_GRAPH.nodes) {
    const step = node.kind === "corridor" ? 3.8 : 4.8;
    let index = 0;
    for (let x = node.rect.centerX - node.rect.halfWidth + 1.6; x < node.rect.centerX + node.rect.halfWidth - 1.4; x += step) {
      for (let z = node.rect.centerZ - node.rect.halfDepth + 1.6; z < node.rect.centerZ + node.rect.halfDepth - 1.4; z += step) {
        index += 1;
        if (index % 3 !== 0) continue;
        if (cartArenaShapeForNode(node.id)) {
          const dx = (x - node.rect.centerX) / Math.max(1, node.rect.halfWidth);
          const dz = (z - node.rect.centerZ) / Math.max(1, node.rect.halfDepth);
          if (dx * dx + dz * dz > 0.79) continue;
        }
        const random = seeded(index, node.rect.centerX * 0.02 + node.rect.centerZ * 0.01);
        entries.push({ x, z, sx: 1.2 + random * 0.55, sz: 0.75 + seeded(index, 7) * 0.45, color: palette[index % palette.length] });
      }
    }
  }
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, flatShading: true });
  const mesh = new THREE.InstancedMesh(BOX, material, entries.length);
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    dummy.position.set(entry.x, 0.215, entry.z);
    dummy.scale.set(entry.sx, 0.035, entry.sz);
    dummy.rotation.set(0, ((index % 5) - 2) * 0.035, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, entry.color);
  });
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = false;
  root.add(mesh);
}

function addGardenRing(root: THREE.Group): void {
  const greenA = mat(0x91c964);
  const greenB = mat(0xa8d77a);
  const greenC = mat(0x78ad55);
  const trunkMat = mat(0x76533d);
  const pinkA = mat(0xf08cb9);
  const pinkB = mat(0xffacd0);
  const pinkC = mat(0xe875a8);
  const stone = mat(0xe6e1d8);

  for (let nodeIndex = 0; nodeIndex < CART_WORLD_GRAPH.nodes.length; nodeIndex += 1) {
    const node = CART_WORLD_GRAPH.nodes[nodeIndex];
    if (node.kind === "corridor" || !cartArenaShapeForNode(node.id)) continue;
    const points = cartArenaBoundaryPoints(node.id, 36, 0);
    points.forEach((point, index) => {
      if (cartArenaPointInPortal(node, point.x, point.z, 5.2)) return;
      const dx = point.x - node.rect.centerX;
      const dz = point.z - node.rect.centerZ;
      const length = Math.hypot(dx, dz) || 1;
      const nx = dx / length;
      const nz = dz / length;
      const tx = -nz;
      const tz = nx;

      if (index % 2 === 0) {
        for (let tier = 0; tier < 3; tier += 1) {
          const block = new THREE.Mesh(BOX, tier === 0 ? greenC : tier === 1 ? greenA : greenB);
          const offset = 3.8 + tier * 2.4;
          block.position.set(point.x + nx * offset + tx * ((index % 4) - 1.5) * 0.38, 0.55 + tier * 0.48, point.z + nz * offset + tz * ((index % 4) - 1.5) * 0.38);
          block.scale.set(3.4 + (index % 3) * 0.75, 1.1 + tier * 0.36, 3.1 + ((index + tier) % 3) * 0.65);
          root.add(block);
        }
      }

      if (index % 4 === 0) {
        const outward = 7.2 + (index % 3) * 1.05;
        const x = point.x + nx * outward;
        const z = point.z + nz * outward;
        const trunk = new THREE.Mesh(BOX, trunkMat);
        trunk.position.set(x, 2.45, z);
        trunk.scale.set(1.05, 4.9, 1.05);
        root.add(trunk);
        const offsets: Array<[number, number, number]> = [
          [0, 0, 0], [-1.35, 0.15, 0], [1.35, 0.08, 0], [0, 0.1, -1.3], [0, 0.12, 1.3],
          [-0.9, 0.9, -0.75], [0.9, 0.82, -0.65], [0.82, 0.8, 0.75], [-0.82, 0.76, 0.72], [0, 1.52, 0],
        ];
        offsets.forEach((offset, crownIndex) => {
          const crown = new THREE.Mesh(BOX, crownIndex % 4 === 0 ? pinkB : crownIndex % 5 === 0 ? pinkC : pinkA);
          crown.position.set(x + offset[0], 5.4 + offset[1], z + offset[2]);
          crown.scale.set(1.55 + (crownIndex % 3) * 0.15, 1.22 + (crownIndex % 2) * 0.14, 1.55 + (crownIndex % 4) * 0.1);
          root.add(crown);
        });
      }

      if (index % 6 === 3) {
        const pile = new THREE.Group();
        for (let s = 0; s < 5; s += 1) {
          const rock = new THREE.Mesh(BOX, stone);
          rock.position.set((s % 3 - 1) * 0.62, 0.42 + Math.floor(s / 3) * 0.58, (s % 2) * 0.48);
          rock.scale.set(0.82, 0.78, 0.82);
          pile.add(rock);
        }
        pile.position.set(point.x + nx * 3.1 - tx * 0.8, 0, point.z + nz * 3.1 - tz * 0.8);
        root.add(pile);
      }
    });
  }
}

export function installCartRoguePhase19GroundCover(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase19GroundDemo;
  const originalBuildWorld = prototype.buildWorld;
  prototype.buildWorld = function buildWorldPhase19GroundCover(this: Phase19GroundDemo): void {
    originalBuildWorld.call(this);
    const root = new THREE.Group();
    root.name = "phase19-reference-ground-cover";
    this.scene.add(root);
    addTopSurface(root);
    addWarmPavers(root);
    addGardenRing(root);
  };
}

installCartRoguePhase19GroundCover();

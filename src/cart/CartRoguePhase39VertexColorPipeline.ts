import * as THREE from "three";
import type { CartEnemySnapshot } from "./CartArenaSession";
import { applyCartPerFaceVertexColor } from "./CartFaceColor";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

export { applyCartPerFaceVertexColor } from "./CartFaceColor";

interface Phase39Demo {
  scene: THREE.Scene;
  buildWorld(): void;
}

interface Phase40Demo extends Phase39Demo {
  playerVisual: THREE.Group;
  buildPlayerVisual(): void;
}

interface Phase41Demo extends Phase40Demo {
  buildEnemyVehicle(enemy: CartEnemySnapshot): THREE.Group;
}

type Phase42Demo = Phase39Demo;

const STATIC_WORLD_COLORS = new Set([
  0xc8c2b7, 0xd8d2c7, 0xb7b0a5, 0xaad98f,
  0x82c47d, 0x5da96a, 0xd4caba, 0xe7dfd1,
]);

const HERO_CART_COLORS = new Set([
  0x42bdb7, 0x258d8f, 0x73e0d5, 0xf4efe7, 0x496b79,
  0x31484c, 0xfff5df, 0x34434a, 0x3b4a51,
]);

const ENEMY_EXCLUDED_COLORS = new Set([
  0x252b31, 0xf05463, 0x2c333c, 0xd9e0de, 0x7c858b,
]);

const VEGETATION_COLORS = new Set([
  0xf29ac2, 0xe779aa, 0xf4afd0, 0xffc4dc,
  0x8bc977, 0x6fb46c, 0x70b56f, 0x8f674f, 0x6f5038,
]);

function colorizeStaticWorld(scene: THREE.Scene): void {
  let colored = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.userData.cartPerFaceVertexColor) return;
    if (Array.isArray(object.material) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
    const baseHex = object.material.color.getHex();
    if (!STATIC_WORLD_COLORS.has(baseHex)) return;
    const isStone = baseHex === 0xc8c2b7 || baseHex === 0xd8d2c7 || baseHex === 0xb7b0a5 || baseHex === 0xd4caba || baseHex === 0xe7dfd1;
    if (applyCartPerFaceVertexColor(object, {
      variance: isStone ? 0.085 : 0.06,
      topLift: isStone ? 1.12 : 1.09,
      sideShade: isStone ? 0.94 : 0.97,
      bottomShade: isStone ? 0.78 : 0.84,
      hueJitter: isStone ? 0.008 : 0.016,
      seed: colored + 1,
    })) colored += 1;
  });
  scene.userData.phase39VertexColoredMeshes = colored;
}

function colorizeHeroCart(playerVisual: THREE.Group): void {
  let colored = 0;
  playerVisual.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (Array.isArray(object.material) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
    const baseHex = object.material.color.getHex();
    if (!HERO_CART_COLORS.has(baseHex)) return;
    const bodyLike = baseHex === 0x42bdb7 || baseHex === 0x258d8f || baseHex === 0x73e0d5;
    const glassLike = baseHex === 0x496b79;
    if (applyCartPerFaceVertexColor(object, {
      variance: bodyLike ? 0.075 : glassLike ? 0.025 : 0.045,
      topLift: bodyLike ? 1.15 : 1.09,
      sideShade: bodyLike ? 0.93 : 0.97,
      bottomShade: bodyLike ? 0.72 : 0.8,
      hueJitter: bodyLike ? 0.018 : 0.006,
      seed: 100 + colored,
    })) colored += 1;
  });
  playerVisual.userData.phase40VertexColoredMeshes = colored;
}

function colorizeEnemyVehicle(group: THREE.Group, enemy: CartEnemySnapshot): void {
  let colored = 0;
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.name === "hp-fill") return;
    if (Array.isArray(object.material) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
    const baseHex = object.material.color.getHex();
    if (ENEMY_EXCLUDED_COLORS.has(baseHex)) return;
    if (object.material.emissive.getHex() !== 0x000000 && object.material.emissiveIntensity > 0.5) return;
    const heavyLike = enemy.kind === "heavy" || enemy.kind === "boss";
    if (applyCartPerFaceVertexColor(object, {
      variance: heavyLike ? 0.085 : 0.075,
      topLift: heavyLike ? 1.13 : 1.15,
      sideShade: heavyLike ? 0.92 : 0.94,
      bottomShade: heavyLike ? 0.7 : 0.75,
      hueJitter: enemy.kind === "boss" ? 0.01 : 0.02,
      seed: 200 + colored + enemy.id.length * 7,
    })) colored += 1;
  });
  group.userData.phase41VertexColoredMeshes = colored;
}

function rebuildHeroCanopiesWithoutInstanceColor(scene: THREE.Scene): number {
  const source = scene.getObjectByName("phase35-hero-tree-canopies");
  if (!(source instanceof THREE.InstancedMesh) || !source.instanceColor || !source.parent) return 0;
  const parent = source.parent;
  const root = new THREE.Group();
  root.name = "phase42-hero-tree-canopies";
  const buckets = new Map<string, { color: THREE.Color; matrices: THREE.Matrix4[] }>();
  const color = new THREE.Color();
  const matrix = new THREE.Matrix4();

  for (let index = 0; index < source.count; index += 1) {
    source.getColorAt(index, color);
    source.getMatrixAt(index, matrix);
    const key = `${Math.round(color.r * 255)}:${Math.round(color.g * 255)}:${Math.round(color.b * 255)}`;
    const bucket = buckets.get(key) ?? { color: color.clone(), matrices: [] };
    bucket.matrices.push(matrix.clone());
    buckets.set(key, bucket);
  }

  let bucketIndex = 0;
  for (const bucket of buckets.values()) {
    const material = new THREE.MeshStandardMaterial({
      color: bucket.color,
      roughness: 0.94,
      metalness: 0,
      flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(source.geometry, material, bucket.matrices.length);
    mesh.name = `phase42-canopy-${bucketIndex}`;
    bucket.matrices.forEach((item, index) => mesh.setMatrixAt(index, item));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    applyCartPerFaceVertexColor(mesh, {
      variance: 0.07,
      topLift: 1.13,
      sideShade: 0.96,
      bottomShade: 0.78,
      hueJitter: 0.018,
      seed: 300 + bucketIndex,
    });
    root.add(mesh);
    bucketIndex += 1;
  }

  source.visible = false;
  parent.add(root);
  return bucketIndex;
}

function colorizeVegetation(scene: THREE.Scene): void {
  const canopyBuckets = rebuildHeroCanopiesWithoutInstanceColor(scene);
  let colored = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.userData.cartPerFaceVertexColor) return;
    if (object instanceof THREE.InstancedMesh && object.instanceColor) return;
    if (Array.isArray(object.material) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
    const baseHex = object.material.color.getHex();
    if (!VEGETATION_COLORS.has(baseHex)) return;
    if (applyCartPerFaceVertexColor(object, {
      variance: baseHex === 0x8f674f || baseHex === 0x6f5038 ? 0.055 : 0.08,
      topLift: 1.12,
      sideShade: 0.96,
      bottomShade: 0.8,
      hueJitter: baseHex === 0x8f674f || baseHex === 0x6f5038 ? 0.008 : 0.024,
      seed: 400 + colored,
    })) colored += 1;
  });
  scene.userData.phase42VegetationVertexColors = colored;
  scene.userData.phase42CanopyBuckets = canopyBuckets;
}

export function installCartRoguePhase39StaticVertexColors(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase39Demo;
  const oldWorld = prototype.buildWorld;
  prototype.buildWorld = function phase39World(this: Phase39Demo): void {
    oldWorld.call(this);
    colorizeStaticWorld(this.scene);
  };
}

export function installCartRoguePhase40HeroVertexColors(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase40Demo;
  const oldPlayer = prototype.buildPlayerVisual;
  prototype.buildPlayerVisual = function phase40Player(this: Phase40Demo): void {
    oldPlayer.call(this);
    colorizeHeroCart(this.playerVisual);
  };
}

export function installCartRoguePhase41EnemyVertexColors(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase41Demo;
  const oldEnemy = prototype.buildEnemyVehicle;
  prototype.buildEnemyVehicle = function phase41Enemy(this: Phase41Demo, enemy: CartEnemySnapshot): THREE.Group {
    const group = oldEnemy.call(this, enemy);
    colorizeEnemyVehicle(group, enemy);
    return group;
  };
}

export function installCartRoguePhase42VegetationVertexColors(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase42Demo;
  const oldWorld = prototype.buildWorld;
  prototype.buildWorld = function phase42World(this: Phase42Demo): void {
    oldWorld.call(this);
    colorizeVegetation(this.scene);
  };
}

installCartRoguePhase39StaticVertexColors();
installCartRoguePhase40HeroVertexColors();
installCartRoguePhase41EnemyVertexColors();
installCartRoguePhase42VegetationVertexColors();

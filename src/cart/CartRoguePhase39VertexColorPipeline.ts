import * as THREE from "three";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase39Demo {
  scene: THREE.Scene;
  buildWorld(): void;
}

interface Phase40Demo extends Phase39Demo {
  playerVisual: THREE.Group;
  buildPlayerVisual(): void;
}

interface FaceColorOptions {
  variance?: number;
  topLift?: number;
  sideShade?: number;
  bottomShade?: number;
  hueJitter?: number;
  seed?: number;
}

const STATIC_WORLD_COLORS = new Set([
  0xc8c2b7,
  0xd8d2c7,
  0xb7b0a5,
  0xaad98f,
  0x82c47d,
  0x5da96a,
  0xd4caba,
  0xe7dfd1,
]);

const HERO_CART_COLORS = new Set([
  0x42bdb7,
  0x258d8f,
  0x73e0d5,
  0xf4efe7,
  0x496b79,
  0x31484c,
  0xfff5df,
  0x34434a,
  0x3b4a51,
]);

function hash01(value: number): number {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function faceNormalY(position: THREE.BufferAttribute, index: number): number {
  const ax = position.getX(index);
  const ay = position.getY(index);
  const az = position.getZ(index);
  const bx = position.getX(index + 1);
  const by = position.getY(index + 1);
  const bz = position.getZ(index + 1);
  const cx = position.getX(index + 2);
  const cy = position.getY(index + 2);
  const cz = position.getZ(index + 2);
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return ny / length;
}

export function applyCartPerFaceVertexColor(
  mesh: THREE.Mesh,
  options: FaceColorOptions = {},
): boolean {
  if (Array.isArray(mesh.material) || !(mesh.material instanceof THREE.MeshStandardMaterial)) return false;
  const sourcePosition = mesh.geometry.getAttribute("position");
  if (!(sourcePosition instanceof THREE.BufferAttribute) || sourcePosition.count < 3) return false;

  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  geometry.computeVertexNormals();
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const baseMaterial = mesh.material;
  const base = baseMaterial.color.clone();
  const color = new THREE.Color();
  const variance = options.variance ?? 0.055;
  const topLift = options.topLift ?? 1.08;
  const sideShade = options.sideShade ?? 0.96;
  const bottomShade = options.bottomShade ?? 0.84;
  const hueJitter = options.hueJitter ?? 0.012;
  const seed = options.seed ?? 0;

  for (let face = 0; face + 2 < position.count; face += 3) {
    const normalY = faceNormalY(position, face);
    const faceIndex = face / 3;
    const noise = hash01(faceIndex * 17.37 + seed * 31.7);
    const hue = (hash01(faceIndex * 9.11 + seed * 7.3) - 0.5) * hueJitter;
    const direction = normalY > 0.55 ? topLift : normalY < -0.35 ? bottomShade : sideShade;
    const shade = direction * (1 + (noise * 2 - 1) * variance);
    color.copy(base).offsetHSL(hue, 0, (noise - 0.5) * 0.025).multiplyScalar(shade);
    color.r = Math.min(1, Math.max(0, color.r));
    color.g = Math.min(1, Math.max(0, color.g));
    color.b = Math.min(1, Math.max(0, color.b));
    for (let corner = 0; corner < 3; corner += 1) {
      const offset = (face + corner) * 3;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = baseMaterial.clone();
  material.color.set(0xffffff);
  material.vertexColors = true;
  material.flatShading = true;
  material.needsUpdate = true;
  mesh.geometry = geometry;
  mesh.material = material;
  mesh.userData.cartPerFaceVertexColor = true;
  return true;
}

function colorizeStaticWorld(scene: THREE.Scene): void {
  let colored = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
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

installCartRoguePhase39StaticVertexColors();
installCartRoguePhase40HeroVertexColors();

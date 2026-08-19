import * as THREE from "three";
import type { CartEnemySnapshot, CartObstacleSnapshot, CartResourceSnapshot } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase100Demo {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  playerVisual: THREE.Group;
  enemyGroups: Map<string, THREE.Group>;
  obstacleGroups: Map<string, THREE.Group>;
  resourceGroups: Map<string, THREE.Group>;
  mat(color: number, emissive?: number): THREE.MeshStandardMaterial;
  buildWorld(): void;
  buildPlayerVisual(): void;
  buildEnemies(enemies: readonly CartEnemySnapshot[]): void;
  buildObstacles(obstacles: readonly CartObstacleSnapshot[]): void;
  buildResources(resources: readonly CartResourceSnapshot[]): void;
}

export const CART_CASUAL_ANIME_THEME = "casual-anime-world-v1";
export const CART_CASUAL_ANIME_SKY = 0x3fbfff;
export const CART_CASUAL_ANIME_FOG = 0xcceeff;
export const CART_CASUAL_ANIME_PLAYER = 0x2f78ed;
export const CART_CASUAL_ANIME_PLAYER_ACCENT = 0xff5b50;
export const CART_CASUAL_ANIME_ENEMY = 0xffc83d;
export const CART_CASUAL_ANIME_BOSS = 0x57428d;

// Phase 100 is deliberately a palette/material pass instead of a replacement
// world renderer. Keeping the existing geometry, pools and gameplay markers lets
// the large Turbo Hunt map adopt a new art direction without re-paying its CPU,
// memory or draw-call budget on iPhone.
const COLOR_REMAP = new Map<number, number>([
  [0xf1cd94, 0xf3ad4d], // sand
  [0xe6b778, 0xe99a3d],
  [0xffe3ad, 0xffcd67],
  [0xd69e64, 0xcf7535],
  [0xaad98f, 0x74ca5c],
  [0x82c47d, 0x4fb65f],
  [0x5da96a, 0x318a51],
  [0xc5e7a6, 0x9bdc65],
  [0xc8addf, 0x9b7ee8],
  [0xfff5df, 0xfff6e8],
  [0xeee6d8, 0xdbe7ed],
  [0xd4caba, 0xaec3ce],
  [0x8f674f, 0x955a37],
  [0xf29ac2, 0xff72b6],
  [0xe779aa, 0xe84b98],
  [0xb8a0e5, 0x9d82e9],
  [0x91b8f3, 0x54aff8],
  [0xf3d46c, 0xffca3f],
  [0x8bc977, 0x5fc45f],
  [0x6fb46c, 0x409e56],
  [0x42bdb7, CART_CASUAL_ANIME_PLAYER],
  [0x258d8f, 0x234f91],
  [0x73e0d5, CART_CASUAL_ANIME_PLAYER_ACCENT],
  [0xf4efe7, 0xfff8e9],
  [0x496b79, 0x29496f],
  [0x2c333c, 0x202735],
  [0xd9e0de, 0xdfeaf3],
  [0x7c858b, 0x6d7d91],
  [0xe0d95d, CART_CASUAL_ANIME_ENEMY],
  [0x92d361, 0x58c95f],
  [0x7d6c86, 0x8c63ce],
  [0x34313a, CART_CASUAL_ANIME_BOSS],
  [0xf05f64, 0xff4361],
  [0xf05463, 0xff3858],
  [0x252b31, 0x24293a],
  [0x42c7ff, 0x22bfff],
  [0xe95f66, 0xff4860],
  [0x6bd3a4, 0x49d88f],
  [0xf05f70, 0xff526c],
  [0x55c8f3, 0x31c1fb],
  [0xc8c2b7, 0xd27c3d],
  [0xd8d2c7, 0xe99449],
  [0xb7b0a5, 0xc26d38],
  [0x58d7ee, 0x30cff7],
  [0x26323a, 0x243047],
  [0xffd36c, 0xffcc40],
  [0xf0e879, 0xffd542],
  [0xb8e879, 0x7fd852],
  [0x5f9e58, 0x3b9652],
  [0xb9e27a, 0x84d74f],
  [0x62586a, 0x724ba2],
  [0x544c5d, 0x604087],
  [0x93839e, 0xa274d6],
  [0x55505b, 0x624984],
  [0x514955, 0x5c3c77],
]);

const styledGeometries = new WeakSet<THREE.BufferGeometry>();
const scratchColor = new THREE.Color();

export function cartCasualAnimeColor(hex: number): number {
  if (hex === 0) return 0;
  const direct = COLOR_REMAP.get(hex);
  if (direct !== undefined) return direct;

  // Unknown legacy phase colors still get the same art direction: stronger hue
  // separation and darker high-midtones instead of the old pastel wash.
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (hsl.l < 0.09 || (hsl.l > 0.94 && hsl.s < 0.08)) return hex;
  const saturationFloor = hsl.l > 0.16 && hsl.l < 0.9 ? 0.44 : 0.14;
  hsl.s = THREE.MathUtils.clamp(Math.max(hsl.s * 1.24, saturationFloor), 0, 0.94);
  if (hsl.l > 0.78) hsl.l -= 0.075;
  else if (hsl.l > 0.62) hsl.l -= 0.045;
  else if (hsl.l < 0.28) hsl.l += 0.025;
  hsl.l = THREE.MathUtils.clamp(hsl.l, 0.08, 0.9);
  color.setHSL(hsl.h, hsl.s, hsl.l);
  return color.getHex();
}

function styleVertexColors(geometry: THREE.BufferGeometry): void {
  if (styledGeometries.has(geometry)) return;
  styledGeometries.add(geometry);
  const attribute = geometry.getAttribute("color");
  if (!(attribute instanceof THREE.BufferAttribute) || attribute.itemSize < 3) return;

  for (let index = 0; index < attribute.count; index += 1) {
    scratchColor.setRGB(attribute.getX(index), attribute.getY(index), attribute.getZ(index));
    scratchColor.setHex(cartCasualAnimeColor(scratchColor.getHex()));
    attribute.setXYZ(index, scratchColor.r, scratchColor.g, scratchColor.b);
  }
  attribute.needsUpdate = true;
}

function styleStandardMaterial(material: THREE.MeshStandardMaterial): void {
  material.color.setHex(cartCasualAnimeColor(material.color.getHex()));
  material.roughness = Math.max(material.roughness, 0.86);
  material.metalness = Math.min(material.metalness, 0.03);
  material.flatShading = true;
  material.envMapIntensity = Math.min(material.envMapIntensity, 0.2);
  material.dithering = true;
  if (material.emissive.getHex() !== 0) {
    material.emissive.setHex(cartCasualAnimeColor(material.emissive.getHex()));
    material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.4);
  }
  material.needsUpdate = true;
}

function styleMesh(object: THREE.Mesh): void {
  styleVertexColors(object.geometry);
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  for (const material of materials) {
    if (material instanceof THREE.MeshStandardMaterial) styleStandardMaterial(material);
  }
}

function styleObject(root: THREE.Object3D, role: string): void {
  root.userData.cartVisualTheme = CART_CASUAL_ANIME_THEME;
  root.userData.cartVisualRole = role;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) styleMesh(object);
  });
}

function styleScene(demo: Phase100Demo): void {
  demo.scene.background = new THREE.Color(CART_CASUAL_ANIME_SKY);
  if (demo.scene.fog instanceof THREE.Fog) {
    demo.scene.fog.color.setHex(CART_CASUAL_ANIME_FOG);
    demo.scene.fog.near = Math.max(demo.scene.fog.near, 148);
    demo.scene.fog.far = Math.max(demo.scene.fog.far, 360);
  }

  // Lower exposure and softer fill preserve bold color blocks instead of washing
  // them toward white. Shadows stay enabled; this is still the existing renderer.
  demo.renderer.toneMappingExposure = 1.0;
  demo.renderer.domElement.dataset.cartVisualTheme = CART_CASUAL_ANIME_THEME;

  demo.scene.traverse((object) => {
    if (object instanceof THREE.HemisphereLight) {
      object.color.setHex(0xfff0cf);
      object.groundColor.setHex(0xa95f3f);
      object.intensity = 1.72;
      return;
    }
    if (object instanceof THREE.DirectionalLight) {
      if (object.intensity > 2) {
        object.color.setHex(0xffe9b8);
        object.intensity = 2.35;
      } else if (object.intensity > 0.5) {
        object.color.setHex(0xb5ddff);
        object.intensity = 0.62;
      } else {
        object.color.setHex(0xffb4d4);
        object.intensity = 0.2;
      }
      return;
    }
    if (object instanceof THREE.Mesh) styleMesh(object);
  });

  demo.scene.userData.cartVisualTheme = CART_CASUAL_ANIME_THEME;
  demo.scene.userData.artDirection = "bright-cel-shaded-toy-mecha";
  demo.scene.userData.performanceIntent = "reuse-existing-geometry-and-pools";
  demo.scene.userData.vertexColorPass = "one-time-at-build";
}

export function installCartRoguePhase100CasualAnimeWorld(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase100Demo;

  const previousMat = prototype.mat;
  prototype.mat = function phase100CasualAnimeMaterial(
    this: Phase100Demo,
    color: number,
    emissive = 0,
  ): THREE.MeshStandardMaterial {
    const material = previousMat.call(
      this,
      cartCasualAnimeColor(color),
      emissive ? cartCasualAnimeColor(emissive) : 0,
    );
    styleStandardMaterial(material);
    return material;
  };

  const previousBuildWorld = prototype.buildWorld;
  prototype.buildWorld = function phase100CasualAnimeWorld(this: Phase100Demo): void {
    previousBuildWorld.call(this);
    styleScene(this);
  };

  const previousBuildPlayerVisual = prototype.buildPlayerVisual;
  prototype.buildPlayerVisual = function phase100CasualAnimePlayer(this: Phase100Demo): void {
    previousBuildPlayerVisual.call(this);
    styleObject(this.playerVisual, "HERO_TOY_MECHA");
  };

  const previousBuildEnemies = prototype.buildEnemies;
  prototype.buildEnemies = function phase100CasualAnimeEnemies(
    this: Phase100Demo,
    enemies: readonly CartEnemySnapshot[],
  ): void {
    previousBuildEnemies.call(this, enemies);
    for (const enemy of enemies) {
      const group = this.enemyGroups.get(enemy.id);
      if (!group) continue;
      styleObject(group, enemy.kind === "boss" ? "TITAN_TOY_MECHA" : `ENEMY_${enemy.kind.toUpperCase()}`);
      group.userData.cartEnemyKind = enemy.kind;
    }
  };

  const previousBuildObstacles = prototype.buildObstacles;
  prototype.buildObstacles = function phase100CasualAnimeObstacles(
    this: Phase100Demo,
    obstacles: readonly CartObstacleSnapshot[],
  ): void {
    previousBuildObstacles.call(this, obstacles);
    for (const obstacle of obstacles) {
      const group = this.obstacleGroups.get(obstacle.id);
      if (group) styleObject(group, "CHUNKY_DESTRUCTIBLE");
    }
  };

  // Phase 99 stays responsible for the recovery cross / Turbo bolt semantics.
  // Phase 100 only gives their standard materials the same bright toy finish;
  // additive glows and gameplay colors are intentionally left untouched.
  const previousBuildResources = prototype.buildResources;
  prototype.buildResources = function phase100CasualAnimeResources(
    this: Phase100Demo,
    resources: readonly CartResourceSnapshot[],
  ): void {
    previousBuildResources.call(this, resources);
    for (const resource of resources) {
      const group = this.resourceGroups.get(resource.id);
      if (group) styleObject(group, resource.kind === "gas" ? "LIFE_RECOVERY" : "TURBO_PICKUP");
    }
  };
}

installCartRoguePhase100CasualAnimeWorld();

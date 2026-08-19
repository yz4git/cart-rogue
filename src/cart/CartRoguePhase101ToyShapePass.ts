import * as THREE from "three";
import type { CartEnemySnapshot, CartObstacleSnapshot } from "./CartArenaSession";
import {
  CART_CASUAL_ANIME_BOSS,
  CART_CASUAL_ANIME_ENEMY,
  CART_CASUAL_ANIME_PLAYER,
  CART_CASUAL_ANIME_PLAYER_ACCENT,
  CART_CASUAL_ANIME_THEME,
} from "./CartRoguePhase100CasualAnimeWorld";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_TURBO_HUNT_FIELD } from "./CartTurboHuntTrack";

interface Phase101Demo {
  scene: THREE.Scene;
  playerVisual: THREE.Group;
  enemyGroups: Map<string, THREE.Group>;
  obstacleGroups: Map<string, THREE.Group>;
  buildWorld(): void;
  buildPlayerVisual(): void;
  buildEnemies(enemies: readonly CartEnemySnapshot[]): void;
  buildObstacles(obstacles: readonly CartObstacleSnapshot[]): void;
}

interface ToyShapeState {
  heroBodyGeometry: THREE.SphereGeometry;
  heroCanopyGeometry: THREE.SphereGeometry;
  podGeometry: THREE.DodecahedronGeometry;
  bumperGeometry: THREE.BoxGeometry;
  visorGeometry: THREE.BoxGeometry;
  hornGeometry: THREE.ConeGeometry;
  rockGeometry: THREE.DodecahedronGeometry;
  towerGeometry: THREE.CylinderGeometry;
  towerCapGeometry: THREE.DodecahedronGeometry;
  landmarkRingGeometry: THREE.TorusGeometry;
  playerBlue: THREE.MeshStandardMaterial;
  playerRed: THREE.MeshStandardMaterial;
  playerDark: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  enemyYellow: THREE.MeshStandardMaterial;
  enemyGreen: THREE.MeshStandardMaterial;
  enemyPurple: THREE.MeshStandardMaterial;
  bossPurple: THREE.MeshStandardMaterial;
  bossRed: THREE.MeshStandardMaterial;
  rockWarm: THREE.MeshStandardMaterial;
  rockLight: THREE.MeshStandardMaterial;
  worldBlue: THREE.MeshStandardMaterial;
  worldCream: THREE.MeshStandardMaterial;
  worldPink: THREE.MeshStandardMaterial;
}

const stateByDemo = new WeakMap<object, ToyShapeState>();

export const CART_TOY_SHAPE_PASS = "toy-mecha-casual-shape-v1";
export const CART_TOY_WORLD_LANDMARK_COUNT = 6;
export const CART_TOY_HERO_SHELL_PARTS = 9;
export const CART_TOY_ENEMY_ROLE_COLORS = {
  blocker: CART_CASUAL_ANIME_ENEMY,
  chaser: 0x59ce67,
  heavy: 0x9668d8,
  boss: CART_CASUAL_ANIME_BOSS,
} as const;

function toyMaterial(color: number, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.018,
    flatShading: true,
    emissive: emissive || 0x000000,
    emissiveIntensity: emissive ? 0.42 : 0,
    dithering: true,
  });
}

function stateFor(demo: Phase101Demo): ToyShapeState {
  const key = demo as unknown as object;
  const existing = stateByDemo.get(key);
  if (existing) return existing;

  const created: ToyShapeState = {
    heroBodyGeometry: new THREE.SphereGeometry(1, 10, 6),
    heroCanopyGeometry: new THREE.SphereGeometry(1, 8, 5),
    podGeometry: new THREE.DodecahedronGeometry(1, 0),
    bumperGeometry: new THREE.BoxGeometry(1, 1, 1),
    visorGeometry: new THREE.BoxGeometry(1, 1, 1),
    hornGeometry: new THREE.ConeGeometry(1, 1, 5),
    rockGeometry: new THREE.DodecahedronGeometry(1, 0),
    towerGeometry: new THREE.CylinderGeometry(1, 1.18, 1, 8),
    towerCapGeometry: new THREE.DodecahedronGeometry(1, 0),
    landmarkRingGeometry: new THREE.TorusGeometry(1, 0.16, 5, 12),
    playerBlue: toyMaterial(CART_CASUAL_ANIME_PLAYER),
    playerRed: toyMaterial(CART_CASUAL_ANIME_PLAYER_ACCENT),
    playerDark: toyMaterial(0x223a69),
    glass: toyMaterial(0x203d66),
    enemyYellow: toyMaterial(CART_TOY_ENEMY_ROLE_COLORS.blocker),
    enemyGreen: toyMaterial(CART_TOY_ENEMY_ROLE_COLORS.chaser),
    enemyPurple: toyMaterial(CART_TOY_ENEMY_ROLE_COLORS.heavy),
    bossPurple: toyMaterial(CART_TOY_ENEMY_ROLE_COLORS.boss),
    bossRed: toyMaterial(0xff3f61, 0xff244c),
    rockWarm: toyMaterial(0xc86c36),
    rockLight: toyMaterial(0xe89a4a),
    worldBlue: toyMaterial(0x4ebcf4),
    worldCream: toyMaterial(0xffe2a1),
    worldPink: toyMaterial(0xff72ae),
  };
  stateByDemo.set(key, created);
  return created;
}

function part(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function markRoot(root: THREE.Group, role: string): void {
  root.userData.cartVisualTheme = CART_CASUAL_ANIME_THEME;
  root.userData.cartShapePass = CART_TOY_SHAPE_PASS;
  root.userData.cartShapeRole = role;
}

function decorateHero(demo: Phase101Demo): void {
  if (demo.playerVisual.getObjectByName("phase101-hero-toy-shell")) return;
  const state = stateFor(demo);
  const shell = new THREE.Group();
  shell.name = "phase101-hero-toy-shell";
  markRoot(shell, "HERO_CHUNKY_TOY_MECHA");

  const body = part(state.heroBodyGeometry, state.playerBlue, "phase101-hero-body");
  body.position.set(0, 1.04, -0.08);
  body.scale.set(1.48, 0.68, 2.02);

  const canopy = part(state.heroCanopyGeometry, state.glass, "phase101-hero-canopy");
  canopy.position.set(0, 1.72, -0.34);
  canopy.scale.set(0.78, 0.42, 0.92);

  const leftPod = part(state.podGeometry, state.playerBlue, "phase101-hero-pod-left");
  leftPod.position.set(-1.27, 0.94, 0.05);
  leftPod.scale.set(0.48, 0.46, 1.1);
  const rightPod = leftPod.clone();
  rightPod.name = "phase101-hero-pod-right";
  rightPod.position.x = 1.27;

  const leftBumper = part(state.podGeometry, state.playerRed, "phase101-hero-bumper-left");
  leftBumper.position.set(-0.67, 0.78, 1.83);
  leftBumper.scale.set(0.54, 0.34, 0.52);
  const rightBumper = leftBumper.clone();
  rightBumper.name = "phase101-hero-bumper-right";
  rightBumper.position.x = 0.67;

  const rearDeck = part(state.bumperGeometry, state.playerDark, "phase101-hero-rear-deck");
  rearDeck.position.set(0, 1.26, -1.7);
  rearDeck.scale.set(1.42, 0.22, 0.48);

  const leftJet = part(state.podGeometry, state.playerRed, "phase101-hero-jet-left");
  leftJet.position.set(-0.72, 0.69, -2.02);
  leftJet.scale.set(0.34, 0.32, 0.56);
  const rightJet = leftJet.clone();
  rightJet.name = "phase101-hero-jet-right";
  rightJet.position.x = 0.72;

  shell.add(body, canopy, leftPod, rightPod, leftBumper, rightBumper, rearDeck, leftJet, rightJet);
  shell.userData.partCount = CART_TOY_HERO_SHELL_PARTS;
  demo.playerVisual.add(shell);
  demo.playerVisual.userData.cartShapePass = CART_TOY_SHAPE_PASS;
}

function enemyBodyMaterial(state: ToyShapeState, kind: CartEnemySnapshot["kind"]): THREE.MeshStandardMaterial {
  if (kind === "chaser") return state.enemyGreen;
  if (kind === "heavy") return state.enemyPurple;
  if (kind === "boss") return state.bossPurple;
  return state.enemyYellow;
}

function decorateEnemy(demo: Phase101Demo, enemy: CartEnemySnapshot): void {
  const group = demo.enemyGroups.get(enemy.id);
  if (!group || group.getObjectByName(`phase101-enemy-shell-${enemy.id}`)) return;
  const state = stateFor(demo);
  const shell = new THREE.Group();
  shell.name = `phase101-enemy-shell-${enemy.id}`;
  markRoot(shell, enemy.kind === "boss" ? "TITAN_CHUNKY_TOY_MECHA" : `ENEMY_${enemy.kind.toUpperCase()}_TOY`);

  const boss = enemy.kind === "boss";
  const heavy = enemy.kind === "heavy";
  const chaser = enemy.kind === "chaser";
  const body = part(state.heroBodyGeometry, enemyBodyMaterial(state, enemy.kind), `phase101-${enemy.id}-body`);
  body.position.y = boss ? 1.5 : heavy ? 1.0 : 0.82;
  body.scale.set(
    enemy.radius * (boss ? 1.08 : heavy ? 0.98 : 0.9),
    boss ? 1.14 : heavy ? 0.8 : 0.62,
    enemy.radius * (boss ? 1.34 : chaser ? 1.34 : 1.08),
  );
  shell.add(body);

  const visor = part(state.visorGeometry, boss ? state.bossRed : state.glass, `phase101-${enemy.id}-visor`);
  visor.position.set(0, boss ? 2.15 : heavy ? 1.48 : 1.28, enemy.radius * (boss ? 1.16 : 0.94));
  visor.scale.set(enemy.radius * (boss ? 0.7 : 0.58), boss ? 0.26 : 0.19, 0.13);
  shell.add(visor);

  if (chaser) {
    for (const side of [-1, 1] as const) {
      const fin = part(state.podGeometry, state.enemyGreen, `phase101-${enemy.id}-fin-${side}`);
      fin.position.set(side * enemy.radius * 0.78, 1.2, -enemy.radius * 0.9);
      fin.scale.set(0.3, 0.5, 0.76);
      shell.add(fin);
    }
  }

  if (heavy || boss) {
    for (const side of [-1, 1] as const) {
      const shoulder = part(state.podGeometry, boss ? state.bossPurple : state.enemyPurple, `phase101-${enemy.id}-shoulder-${side}`);
      shoulder.position.set(side * enemy.radius * 0.92, boss ? 1.54 : 1.04, 0.05);
      shoulder.scale.set(boss ? 0.78 : 0.58, boss ? 0.72 : 0.55, boss ? 1.05 : 0.8);
      shell.add(shoulder);
    }
  }

  if (boss) {
    const core = part(state.podGeometry, state.bossRed, `phase101-${enemy.id}-core`);
    core.position.set(0, 1.42, enemy.radius * 1.38);
    core.scale.setScalar(0.45);
    shell.add(core);
    for (const side of [-1, 1] as const) {
      const horn = part(state.hornGeometry, state.bossRed, `phase101-${enemy.id}-horn-${side}`);
      horn.position.set(side * enemy.radius * 0.56, 2.72, 0.18);
      horn.rotation.z = side * 0.42;
      horn.rotation.x = Math.PI * 0.5;
      horn.scale.set(0.26, 0.84, 0.26);
      shell.add(horn);
    }
  }

  shell.userData.enemyKind = enemy.kind;
  group.add(shell);
  group.userData.cartShapePass = CART_TOY_SHAPE_PASS;
}

function decorateObstacle(demo: Phase101Demo, obstacle: CartObstacleSnapshot): void {
  const group = demo.obstacleGroups.get(obstacle.id);
  if (!group || group.getObjectByName(`phase101-rock-shell-${obstacle.id}`)) return;
  const state = stateFor(demo);
  const shell = new THREE.Group();
  shell.name = `phase101-rock-shell-${obstacle.id}`;
  markRoot(shell, "CHUNKY_CARTOON_BOULDER");

  const main = part(state.rockGeometry, obstacle.variant === 1 ? state.rockLight : state.rockWarm, `phase101-${obstacle.id}-main`);
  main.position.set(0, obstacle.scale * 0.72, 0);
  main.scale.set(obstacle.scale * 0.95, obstacle.scale * 0.82, obstacle.scale * 0.92);
  shell.add(main);

  for (const side of [-1, 1] as const) {
    const chunk = part(state.rockGeometry, side < 0 ? state.rockLight : state.rockWarm, `phase101-${obstacle.id}-chunk-${side}`);
    chunk.position.set(side * obstacle.scale * 0.58, obstacle.scale * 0.42, -side * obstacle.scale * 0.22);
    chunk.rotation.set(0.16 * side, 0.48 * side, 0.1);
    chunk.scale.setScalar(obstacle.scale * 0.48);
    shell.add(chunk);
  }

  group.add(shell);
  group.userData.cartShapePass = CART_TOY_SHAPE_PASS;
}

function buildToyWorldLandmarks(demo: Phase101Demo): void {
  if (demo.scene.getObjectByName("phase101-toy-industrial-landmarks")) return;
  const state = stateFor(demo);
  const root = new THREE.Group();
  root.name = "phase101-toy-industrial-landmarks";
  markRoot(root, "CASUAL_TOY_INDUSTRIAL_WORLD");
  root.userData.landmarkCount = CART_TOY_WORLD_LANDMARK_COUNT;
  root.userData.staticInstancedDrawCalls = 3;

  const towerBodies = new THREE.InstancedMesh(state.towerGeometry, state.worldBlue, CART_TOY_WORLD_LANDMARK_COUNT);
  towerBodies.name = "phase101-landmark-towers";
  const towerCaps = new THREE.InstancedMesh(state.towerCapGeometry, state.worldCream, CART_TOY_WORLD_LANDMARK_COUNT);
  towerCaps.name = "phase101-landmark-caps";
  const landmarkRings = new THREE.InstancedMesh(state.landmarkRingGeometry, state.worldPink, CART_TOY_WORLD_LANDMARK_COUNT);
  landmarkRings.name = "phase101-landmark-rings";
  towerBodies.castShadow = true;
  towerBodies.receiveShadow = true;
  towerCaps.castShadow = true;
  landmarkRings.castShadow = false;

  // Phase67 moves Turbo Hunt to a 184×184 field centered far from the legacy
  // route map. Keep these visual-only landmarks just outside its playable edge,
  // so they frame the arena without creating ghost collision expectations.
  const zOffsets = [-70, -42, -14, 14, 42, 70] as const;
  const dummy = new THREE.Object3D();
  for (let index = 0; index < CART_TOY_WORLD_LANDMARK_COUNT; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const height = 7.2 + (index % 3) * 1.35;
    const x = CART_TURBO_HUNT_FIELD.centerX
      + side * (CART_TURBO_HUNT_FIELD.halfWidth + 11 + (index % 3) * 3.5);
    const z = CART_TURBO_HUNT_FIELD.centerZ + zOffsets[index];

    dummy.position.set(x, height * 0.5, z);
    dummy.rotation.set(0, index * 0.27, 0);
    dummy.scale.set(2.5 + (index % 2) * 0.4, height, 2.5 + (index % 2) * 0.4);
    dummy.updateMatrix();
    towerBodies.setMatrixAt(index, dummy.matrix);

    dummy.position.set(x, height + 1.0, z);
    dummy.rotation.set(0, index * 0.38, 0);
    dummy.scale.set(2.05, 1.35, 2.05);
    dummy.updateMatrix();
    towerCaps.setMatrixAt(index, dummy.matrix);

    dummy.position.set(x, height * 0.72, z);
    dummy.rotation.set(Math.PI / 2, 0, index * 0.31);
    dummy.scale.setScalar(2.45);
    dummy.updateMatrix();
    landmarkRings.setMatrixAt(index, dummy.matrix);
  }
  towerBodies.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  towerCaps.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  landmarkRings.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  towerBodies.instanceMatrix.needsUpdate = true;
  towerCaps.instanceMatrix.needsUpdate = true;
  landmarkRings.instanceMatrix.needsUpdate = true;

  root.add(towerBodies, towerCaps, landmarkRings);
  demo.scene.add(root);
  demo.scene.userData.cartShapePass = CART_TOY_SHAPE_PASS;
  demo.scene.userData.shapeDirection = "chunky-rounded-toy-mecha-and-industrial-props";
  demo.scene.userData.shapePerformanceIntent = "shared-geometry-fixed-entity-shells-static-landmarks";
  demo.scene.userData.landmarkPlacement = "turbo-hunt-field-exterior-relative";
}

export function installCartRoguePhase101ToyShapePass(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase101Demo;

  const previousBuildWorld = prototype.buildWorld;
  prototype.buildWorld = function phase101ToyWorld(this: Phase101Demo): void {
    previousBuildWorld.call(this);
    buildToyWorldLandmarks(this);
  };

  const previousBuildPlayerVisual = prototype.buildPlayerVisual;
  prototype.buildPlayerVisual = function phase101ToyHero(this: Phase101Demo): void {
    previousBuildPlayerVisual.call(this);
    decorateHero(this);
  };

  const previousBuildEnemies = prototype.buildEnemies;
  prototype.buildEnemies = function phase101ToyEnemies(
    this: Phase101Demo,
    enemies: readonly CartEnemySnapshot[],
  ): void {
    previousBuildEnemies.call(this, enemies);
    for (const enemy of enemies) decorateEnemy(this, enemy);
  };

  const previousBuildObstacles = prototype.buildObstacles;
  prototype.buildObstacles = function phase101ToyObstacles(
    this: Phase101Demo,
    obstacles: readonly CartObstacleSnapshot[],
  ): void {
    previousBuildObstacles.call(this, obstacles);
    for (const obstacle of obstacles) decorateObstacle(this, obstacle);
  };
}

installCartRoguePhase101ToyShapePass();

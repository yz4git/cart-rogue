import * as THREE from "three";
import { CART_WORLD_GRAPH } from "./CartWorldGraph";
import type { CartArenaSessionSnapshot, CartEnemySnapshot } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface VisualSession {
  snapshot(): CartArenaSessionSnapshot;
  car: { group: THREE.Group };
}

interface Phase13Demo {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  chaseCamera: { target: THREE.Vector3 };
  session: VisualSession;
  playerVisual: THREE.Group;
  enemyGroups: Map<string, THREE.Group>;
  elapsed: number;
  steer: number;
  brake: boolean;
  boost: boolean;
  buildWorld(): void;
  buildPlayerVisual(): void;
  buildEnemies(enemies: readonly CartEnemySnapshot[]): void;
  spawnImpact(position: THREE.Vector3, color: number, scale?: number): void;
  updateVisuals(delta: number): void;
  applyCameraPresentation(boostActive: boolean): void;
}

interface CinematicBurst {
  group: THREE.Group;
  materials: THREE.Material[];
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  spin: number;
}

interface Phase13State {
  skidMarks: THREE.InstancedMesh;
  skidDummy: THREE.Object3D;
  skidCursor: number;
  skidTimer: number;
  bursts: CinematicBurst[];
  heroGlow: THREE.Mesh | null;
}

const stateByDemo = new WeakMap<object, Phase13State>();
const skidGeometry = new THREE.BoxGeometry(0.2, 0.018, 1.35);
const darkRubber = new THREE.MeshBasicMaterial({ color: 0x50483f, transparent: true, opacity: 0.17, depthWrite: false });

function standard(color: number, roughness = 0.7, emissive = 0, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.035, flatShading: true, emissive, emissiveIntensity });
}

function box(w: number, h: number, d: number, color: number, roughness = 0.7): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), standard(color, roughness));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function getState(demo: Phase13Demo): Phase13State {
  const key = demo as unknown as object;
  const current = stateByDemo.get(key);
  if (current) return current;
  const skidMarks = new THREE.InstancedMesh(skidGeometry, darkRubber, 56);
  skidMarks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  skidMarks.frustumCulled = false;
  const dummy = new THREE.Object3D();
  for (let index = 0; index < skidMarks.count; index += 1) {
    dummy.position.set(0, -100, 0);
    dummy.scale.setScalar(0.001);
    dummy.updateMatrix();
    skidMarks.setMatrixAt(index, dummy.matrix);
  }
  skidMarks.instanceMatrix.needsUpdate = true;
  demo.scene.add(skidMarks);
  const created: Phase13State = { skidMarks, skidDummy: dummy, skidCursor: 0, skidTimer: 0, bursts: [], heroGlow: null };
  stateByDemo.set(key, created);
  return created;
}

function addGroundRelief(demo: Phase13Demo): void {
  const transforms: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; color: THREE.Color }> = [];
  const palette = [new THREE.Color(0xe1aa6c), new THREE.Color(0xf3cf91), new THREE.Color(0xd99f62), new THREE.Color(0xa8d68d)];
  for (const node of CART_WORLD_GRAPH.nodes) {
    const { centerX: cx, centerZ: cz, halfWidth: hw, halfDepth: hd } = node.rect;
    const corridor = node.kind === "corridor";
    const edgeStep = corridor ? 5 : 7;
    for (let z = -hd + 2; z <= hd - 2; z += edgeStep) {
      for (const side of [-1, 1]) {
        const seed = Math.abs(Math.floor((cz + z) * 7 + side * 13 + cx));
        transforms.push({
          x: cx + side * (hw + 1.38 + (seed % 3) * 0.22),
          y: 0.08,
          z: cz + z,
          sx: corridor ? 1.4 : 1.8,
          sy: 0.2 + (seed % 2) * 0.08,
          sz: 1.6 + (seed % 3) * 0.34,
          color: palette[(seed + (side > 0 ? 1 : 0)) % palette.length],
        });
      }
    }
    const paverStep = corridor ? 5.5 : 7.5;
    for (let x = -hw + 2.5; x < hw - 2; x += paverStep) {
      for (let z = -hd + 2.5; z < hd - 2; z += paverStep) {
        const seed = Math.abs(Math.floor((x + cx) * 11 + (z + cz) * 5));
        if (seed % 3 !== 0) continue;
        transforms.push({
          x: cx + x + ((seed % 5) - 2) * 0.18,
          y: -0.025,
          z: cz + z + ((seed % 7) - 3) * 0.13,
          sx: 0.72 + (seed % 4) * 0.11,
          sy: 0.045,
          sz: 0.68 + (seed % 3) * 0.15,
          color: palette[seed % 3],
        });
      }
    }
    if (corridor) {
      for (const lane of [-1.35, 1.35]) {
        for (let z = -hd + 3; z < hd - 2; z += 5.2) {
          transforms.push({ x: cx + lane, y: -0.012, z: cz + z, sx: 0.28, sy: 0.026, sz: 3.8, color: new THREE.Color(0xc98f58) });
        }
      }
    }
  }

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const dummy = new THREE.Object3D();
  transforms.forEach((entry, index) => {
    dummy.position.set(entry.x, entry.y, entry.z);
    dummy.scale.set(entry.sx, entry.sy, entry.sz);
    dummy.rotation.y = ((index % 5) - 2) * 0.06;
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, entry.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  demo.scene.add(mesh);
}

function addHeroCarDetails(demo: Phase13Demo): void {
  const root = demo.playerVisual;
  const chrome = 0xe8ece8;
  const dark = 0x2e4148;
  const teal = 0x23a9a6;

  for (const x of [-1.02, 1.02]) {
    const guard = box(0.22, 0.62, 0.28, chrome, 0.42);
    guard.position.set(x, 0.76, -2.28);
    const mudflap = box(0.42, 0.5, 0.08, 0x283136, 0.9);
    mudflap.position.set(x * 1.28, 0.37, -1.78);
    const mirror = box(0.3, 0.22, 0.48, dark, 0.55);
    mirror.position.set(x * 1.23, 1.72, 0.18);
    root.add(guard, mudflap, mirror);
  }

  const towRing = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.055, 6, 14), standard(0xf4c84f, 0.42));
  towRing.rotation.x = Math.PI / 2;
  towRing.position.set(0, 0.48, -2.37);
  root.add(towRing);

  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xe8fbff, emissive: 0x78dcff, emissiveIntensity: 1.55, roughness: 0.35 });
  for (const x of [-0.63, -0.21, 0.21, 0.63]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.22), lampMaterial);
    lamp.position.set(x, 2.53, 0.02);
    root.add(lamp);
  }

  const rearPlate = box(0.82, 0.26, 0.08, 0xf5eee0, 0.75);
  rearPlate.position.set(0, 0.82, -2.34);
  const plateInset = box(0.46, 0.09, 0.02, teal, 0.72);
  plateInset.position.set(0, 0.82, -2.39);
  root.add(rearPlate, plateInset);

  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x65dded, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.75, 24), glowMaterial);
  glow.rotation.x = -Math.PI / 2;
  glow.scale.set(1, 1.45, 1);
  glow.position.y = 0.035;
  root.add(glow);
  getState(demo).heroGlow = glow;
}

function addEnemyPersonality(demo: Phase13Demo, enemies: readonly CartEnemySnapshot[]): void {
  for (const enemy of enemies) {
    const group = demo.enemyGroups.get(enemy.id);
    if (!group) continue;
    const boss = enemy.kind === "boss";
    const heavy = enemy.kind === "heavy";
    const chaser = enemy.kind === "chaser";
    const browColor = boss ? 0xff5962 : heavy ? 0x514957 : 0x4f673d;
    for (const x of [-enemy.radius * 0.24, enemy.radius * 0.24]) {
      const brow = box(enemy.radius * 0.32, 0.1, 0.08, browColor, 0.58);
      brow.position.set(x, boss ? 2.46 : heavy ? 1.89 : 1.69, enemy.radius * 0.66);
      brow.rotation.z = x < 0 ? -0.18 : 0.18;
      group.add(brow);
    }
    if (!boss) {
      const tooth = box(enemy.radius * 0.55, 0.1, 0.09, 0xf4efe1, 0.8);
      tooth.position.set(0, heavy ? 1.41 : 1.22, enemy.radius * 0.67);
      group.add(tooth);
    }
    if (chaser) {
      for (const x of [-enemy.radius * 0.42, enemy.radius * 0.42]) {
        const fin = box(0.12, 0.7, 0.62, 0x5b9f55, 0.7);
        fin.position.set(x, 1.78, -enemy.radius * 0.72);
        fin.rotation.z = x < 0 ? -0.12 : 0.12;
        group.add(fin);
      }
    }
    if (heavy) {
      for (const x of [-enemy.radius * 0.82, enemy.radius * 0.82]) {
        const shoulder = box(0.42, 0.58, enemy.radius * 1.12, 0x71637a, 0.82);
        shoulder.position.set(x, 1.26, 0.08);
        group.add(shoulder);
      }
    }
    if (boss) {
      const coreMaterial = new THREE.MeshStandardMaterial({ color: 0xff7880, emissive: 0xff3948, emissiveIntensity: 2.1, roughness: 0.35 });
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.46, 0), coreMaterial);
      core.position.set(0, 2.5, enemy.radius * 0.7);
      group.add(core);
      const bossLight = new THREE.PointLight(0xff3d4c, 2.2, 8, 2);
      bossLight.position.copy(core.position);
      group.add(bossLight);
      for (const side of [-1, 1]) {
        const blade = box(0.18, 0.4, 1.75, 0xc04f58, 0.48);
        blade.position.set(side * enemy.radius * 0.72, 0.76, enemy.radius * 1.25);
        blade.rotation.y = side * 0.16;
        group.add(blade);
      }
    }
  }
}

function spawnCinematicBurst(demo: Phase13Demo, position: THREE.Vector3, color: number, scale: number): void {
  const group = new THREE.Group();
  const materials: THREE.Material[] = [];
  const rayMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const hotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  materials.push(rayMaterial, hotMaterial);
  for (let index = 0; index < 18; index += 1) {
    const ray = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, (1.5 + (index % 5) * 0.44) * scale), index % 3 === 0 ? hotMaterial : rayMaterial);
    ray.position.y = 1.0 + (index % 4) * 0.12;
    ray.rotation.y = (index / 18) * Math.PI * 2;
    ray.rotation.x = ((index % 3) - 1) * 0.24;
    group.add(ray);
  }
  for (const radius of [0.95, 1.48]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * scale, 0.055 * scale, 5, 24), rayMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.0;
    group.add(ring);
  }
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.82 * scale, 0), hotMaterial);
  flash.position.y = 1.02;
  group.add(flash);
  const light = new THREE.PointLight(color, 5.2 * scale, 14 * scale, 2);
  light.position.y = 1.15;
  group.add(light);
  group.position.copy(position);
  demo.scene.add(group);
  getState(demo).bursts.push({ group, materials, light, life: 0.42, maxLife: 0.42, spin: (position.x + position.z) * 0.013 });
}

function emitSkidMarks(demo: Phase13Demo, delta: number): void {
  const state = getState(demo);
  const snapshot = demo.session.snapshot();
  const speed = Math.abs(snapshot.speed);
  state.skidTimer += delta;
  if (speed < 8 || (!demo.brake && Math.abs(demo.steer) < 0.58) || state.skidTimer < 0.052) return;
  state.skidTimer = 0;
  const rightX = Math.cos(snapshot.heading);
  const rightZ = -Math.sin(snapshot.heading);
  const backX = -Math.sin(snapshot.heading);
  const backZ = -Math.cos(snapshot.heading);
  for (const lane of [-0.78, 0.78]) {
    const dummy = state.skidDummy;
    dummy.position.set(
      snapshot.x + backX * 1.35 + rightX * lane,
      0.027,
      snapshot.z + backZ * 1.35 + rightZ * lane,
    );
    dummy.rotation.set(0, snapshot.heading, 0);
    dummy.scale.set(1, 1, 0.85 + Math.min(0.55, speed / 40));
    dummy.updateMatrix();
    state.skidMarks.setMatrixAt(state.skidCursor, dummy.matrix);
    state.skidCursor = (state.skidCursor + 1) % state.skidMarks.count;
  }
  state.skidMarks.instanceMatrix.needsUpdate = true;
}

function updatePhase13(demo: Phase13Demo, delta: number): void {
  const state = getState(demo);
  emitSkidMarks(demo, delta);
  const snapshot = demo.session.snapshot();
  if (state.heroGlow) {
    const material = state.heroGlow.material as THREE.MeshBasicMaterial;
    material.opacity += (((snapshot.boostActive ? 0.24 : 0.08)) - material.opacity) * Math.min(1, delta * 10);
    state.heroGlow.scale.set(1 + Math.abs(demo.steer) * 0.08, 1.42 + (snapshot.boostActive ? 0.22 : 0), 1);
  }
  for (let index = state.bursts.length - 1; index >= 0; index -= 1) {
    const burst = state.bursts[index];
    burst.life -= delta;
    const ratio = Math.max(0, burst.life / burst.maxLife);
    const expand = 1 + (1 - ratio) * 2.8;
    burst.group.scale.setScalar(expand);
    burst.group.rotation.y += delta * (2.5 + burst.spin);
    burst.materials.forEach((material) => {
      if (material instanceof THREE.MeshBasicMaterial) material.opacity = ratio * ratio * 0.92;
    });
    burst.light.intensity = ratio * 5.2;
    if (burst.life <= 0) {
      demo.scene.remove(burst.group);
      burst.group.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      burst.materials.forEach((material) => material.dispose());
      state.bursts.splice(index, 1);
    }
  }
}

function tightenHeroCamera(demo: Phase13Demo, boostActive: boolean): void {
  const towardTarget = demo.chaseCamera.target.clone().sub(demo.camera.position);
  const distance = towardTarget.length();
  if (distance > 0.001) {
    towardTarget.multiplyScalar(1 / distance);
    demo.camera.position.addScaledVector(towardTarget, boostActive ? 1.05 : 1.48);
    demo.camera.position.y -= boostActive ? 0.08 : 0.2;
  }
  demo.camera.fov = Math.max(54, demo.camera.fov - (boostActive ? 0.3 : 1.7));
  demo.camera.updateProjectionMatrix();
}

export function installCartRoguePhase13Visuals(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase13Demo;
  const originalBuildWorld = prototype.buildWorld;
  const originalBuildPlayerVisual = prototype.buildPlayerVisual;
  const originalBuildEnemies = prototype.buildEnemies;
  const originalSpawnImpact = prototype.spawnImpact;
  const originalUpdateVisuals = prototype.updateVisuals;
  const originalCameraPresentation = prototype.applyCameraPresentation;

  prototype.buildWorld = function buildWorldPhase13(this: Phase13Demo): void {
    originalBuildWorld.call(this);
    getState(this);
    addGroundRelief(this);
  };
  prototype.buildPlayerVisual = function buildPlayerPhase13(this: Phase13Demo): void {
    originalBuildPlayerVisual.call(this);
    addHeroCarDetails(this);
  };
  prototype.buildEnemies = function buildEnemiesPhase13(this: Phase13Demo, enemies: readonly CartEnemySnapshot[]): void {
    originalBuildEnemies.call(this, enemies);
    addEnemyPersonality(this, enemies);
  };
  prototype.spawnImpact = function spawnImpactPhase13(this: Phase13Demo, position: THREE.Vector3, color: number, scale = 1): void {
    originalSpawnImpact.call(this, position, color, scale);
    spawnCinematicBurst(this, position, color, scale);
  };
  prototype.updateVisuals = function updateVisualsPhase13(this: Phase13Demo, delta: number): void {
    originalUpdateVisuals.call(this, delta);
    updatePhase13(this, delta);
  };
  prototype.applyCameraPresentation = function cameraPhase13(this: Phase13Demo, boostActive: boolean): void {
    originalCameraPresentation.call(this, boostActive);
    tightenHeroCamera(this, boostActive);
  };
}

installCartRoguePhase13Visuals();

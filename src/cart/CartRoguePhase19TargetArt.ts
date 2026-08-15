import * as THREE from "three";
import type { CartArenaSessionSnapshot, CartEnemySnapshot } from "./CartArenaSession";
import type { CartEnemyState } from "./CartCombat";
import { cartArenaBoundaryPoints, cartArenaPointInPortal, cartArenaShapeForNode } from "./CartArenaShapes";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_WORLD_GRAPH } from "./CartWorldGraph";

interface Phase19Session {
  enemies: CartEnemyState[];
  snapshot(): CartArenaSessionSnapshot;
}

interface Phase19Demo {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  chaseCamera: { target: THREE.Vector3 };
  session: Phase19Session;
  playerVisual: THREE.Group;
  enemyGroups: Map<string, THREE.Group>;
  elapsed: number;
  steer: number;
  boost: boolean;
  brake: boolean;
  buildWorld(): void;
  buildPlayerVisual(): void;
  buildEnemies(enemies: readonly CartEnemySnapshot[]): void;
  updateVisuals(delta: number): void;
  applyCameraPresentation(snapshot: CartArenaSessionSnapshot): void;
}

interface VoxelParticle {
  active: boolean;
  life: number;
  maxLife: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  size: number;
  color: THREE.Color;
}

interface Phase19State {
  root: THREE.Group;
  particleMesh: THREE.InstancedMesh;
  particleDummy: THREE.Object3D;
  particles: VoxelParticle[];
  particleCursor: number;
  bursts: Array<{ group: THREE.Group; materials: THREE.MeshBasicMaterial[]; life: number; maxLife: number }>;
  heroDecorated: boolean;
  enemyDecorated: Set<string>;
  lastRamSignature: string;
}

const stateByDemo = new WeakMap<object, Phase19State>();

const C = {
  sky: 0x94ceff,
  fog: 0xc8e4ff,
  sand: 0xefc983,
  sandLight: 0xf6d99c,
  sandDark: 0xdcae65,
  grass: 0x9ed06f,
  grassLight: 0xb4dd86,
  grassDark: 0x78ad57,
  leaf: 0x91c962,
  leafDark: 0x6ea84f,
  blossom: 0xf18bbb,
  blossomLight: 0xffb0d4,
  blossomHot: 0xff6fae,
  trunk: 0x75513c,
  stone: 0xe8e4dd,
  stoneShade: 0xcfc9c0,
  teal: 0x32b7b0,
  tealDark: 0x188c8a,
  white: 0xf6f4ef,
  black: 0x26313a,
  blue: 0x59d5ff,
  purple: 0xa868e6,
  yellow: 0xf2cf56,
  green: 0x8fd05e,
};

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const PARTICLE_BOX = new THREE.BoxGeometry(1, 1, 1);

function standard(color: number, roughness = 0.82, emissive = 0, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.01, flatShading: true, emissive, emissiveIntensity });
}

function scaledBox(parent: THREE.Object3D, material: THREE.Material, position: [number, number, number], scale: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(UNIT_BOX, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = material instanceof THREE.MeshStandardMaterial;
  mesh.receiveShadow = material instanceof THREE.MeshStandardMaterial;
  parent.add(mesh);
  return mesh;
}

function makeState(demo: Phase19Demo): Phase19State {
  const root = new THREE.Group();
  root.name = "phase19-target-art-world";
  demo.scene.add(root);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, flatShading: true, vertexColors: true });
  const particles = Array.from({ length: 108 }, () => ({
    active: false,
    life: 0,
    maxLife: 0,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    size: 0.12,
    color: new THREE.Color(C.white),
  }));
  const particleMesh = new THREE.InstancedMesh(PARTICLE_BOX, material, particles.length);
  particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particleMesh.frustumCulled = false;
  particleMesh.castShadow = true;
  const dummy = new THREE.Object3D();
  particles.forEach((_, index) => {
    dummy.position.set(0, -100, 0);
    dummy.scale.setScalar(0.001);
    dummy.updateMatrix();
    particleMesh.setMatrixAt(index, dummy.matrix);
    particleMesh.setColorAt(index, new THREE.Color(C.white));
  });
  particleMesh.instanceMatrix.needsUpdate = true;
  if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
  demo.scene.add(particleMesh);
  return { root, particleMesh, particleDummy: dummy, particles, particleCursor: 0, bursts: [], heroDecorated: false, enemyDecorated: new Set(), lastRamSignature: "" };
}

function getState(demo: Phase19Demo): Phase19State {
  const key = demo as unknown as object;
  const current = stateByDemo.get(key);
  if (current) return current;
  const created = makeState(demo);
  stateByDemo.set(key, created);
  return created;
}

function hideAbstractPhase18World(demo: Phase19Demo): void {
  const oldRoot = demo.scene.getObjectByName("phase18-visual-overdrive-world");
  if (oldRoot) oldRoot.visible = false;
}

function applyReferenceGrade(demo: Phase19Demo): void {
  demo.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  demo.renderer.toneMappingExposure = 1.24;
  demo.scene.background = new THREE.Color(C.sky);
  if (demo.scene.fog instanceof THREE.Fog) {
    demo.scene.fog.color.setHex(C.fog);
    demo.scene.fog.near = 88;
    demo.scene.fog.far = 265;
  }
  let sunFound = false;
  demo.scene.traverse((object) => {
    if (object instanceof THREE.HemisphereLight) {
      object.color.setHex(0xe4f5ff);
      object.groundColor.setHex(0x9ebc7c);
      object.intensity = 1.78;
    }
    if (object instanceof THREE.DirectionalLight) {
      if (!sunFound) {
        object.color.setHex(0xffe5bf);
        object.intensity = 3.25;
        object.position.set(-38, 54, 24);
        object.castShadow = true;
        object.shadow.mapSize.width = Math.min(1536, Math.max(1024, object.shadow.mapSize.width));
        object.shadow.mapSize.height = Math.min(1536, Math.max(1024, object.shadow.mapSize.height));
        sunFound = true;
      } else {
        object.intensity *= 0.62;
      }
    }
  });
}

interface Transform {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  color: THREE.Color;
  rotationY?: number;
}

function makeInstancedBoxes(root: THREE.Group, entries: Transform[], roughness = 0.88, castShadow = false, receiveShadow = true): THREE.InstancedMesh | null {
  if (entries.length === 0) return null;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness: 0, flatShading: true, vertexColors: true });
  const mesh = new THREE.InstancedMesh(UNIT_BOX, material, entries.length);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    dummy.position.copy(entry.position);
    dummy.scale.copy(entry.scale);
    dummy.rotation.set(0, entry.rotationY ?? 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, entry.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  root.add(mesh);
  return mesh;
}

function seeded(index: number, salt = 0): number {
  const x = Math.sin(index * 91.73 + salt * 47.11) * 43758.5453;
  return x - Math.floor(x);
}

function addVoxelGardenWorld(demo: Phase19Demo): void {
  const root = getState(demo).root;
  const ground: Transform[] = [];
  const terraces: Transform[] = [];
  const trunks: Transform[] = [];
  const blossomCubes: Transform[] = [];
  const bushes: Transform[] = [];
  const flowers: Transform[] = [];
  const stones: Transform[] = [];

  for (const node of CART_WORLD_GRAPH.nodes) {
    const { centerX: cx, centerZ: cz, halfWidth: hw, halfDepth: hd } = node.rect;
    const shaped = Boolean(cartArenaShapeForNode(node.id));
    const corridor = node.kind === "corridor";
    const tileStep = corridor ? 3.4 : 4.1;
    let tileIndex = 0;
    for (let x = cx - hw + 1.2; x <= cx + hw - 1.2; x += tileStep) {
      for (let z = cz - hd + 1.2; z <= cz + hd - 1.2; z += tileStep) {
        if (shaped) {
          const dx = (x - cx) / Math.max(1, hw);
          const dz = (z - cz) / Math.max(1, hd);
          if (dx * dx + dz * dz > 0.96) continue;
        }
        const r = seeded(tileIndex++, cx * 0.01 + cz * 0.02);
        if (r < 0.36) continue;
        const color = r > 0.82 ? C.sandLight : r > 0.58 ? C.sand : C.sandDark;
        ground.push({ position: new THREE.Vector3(x + (r - 0.5) * 0.42, 0.035, z + (seeded(tileIndex, 4) - 0.5) * 0.38), scale: new THREE.Vector3(1.05 + r * 0.42, 0.05, 1.05 + seeded(tileIndex, 7) * 0.42), color: new THREE.Color(color), rotationY: (r - 0.5) * 0.06 });
      }
    }
    if (corridor) continue;
    const points = cartArenaBoundaryPoints(node.id, 28, 0);
    points.forEach((point, index) => {
      if (cartArenaPointInPortal(node, point.x, point.z, 4.1)) return;
      const dx = point.x - cx;
      const dz = point.z - cz;
      const len = Math.hypot(dx, dz) || 1;
      const nx = dx / len;
      const nz = dz / len;
      const tangentX = -nz;
      const tangentZ = nx;
      const noise = seeded(index + Math.floor(cx + cz), 9);
      if (index % 2 === 0) {
        for (let tier = 0; tier < 3; tier += 1) {
          const outward = 3.4 + tier * 2.15;
          const offset = (noise - 0.5) * 1.5;
          terraces.push({ position: new THREE.Vector3(point.x + nx * outward + tangentX * offset, 0.35 + tier * 0.28, point.z + nz * outward + tangentZ * offset), scale: new THREE.Vector3(2.1 + noise * 1.3, 0.65 + tier * 0.18, 2.0 + seeded(index, tier + 2) * 1.5), color: new THREE.Color(tier === 0 ? C.grassDark : tier === 1 ? C.grass : C.grassLight), rotationY: (noise - 0.5) * 0.22 });
        }
      }
      if (index % 4 === 0) {
        const outward = 6.1 + (index % 3) * 1.1;
        const tx = point.x + nx * outward;
        const tz = point.z + nz * outward;
        trunks.push({ position: new THREE.Vector3(tx, 2.25, tz), scale: new THREE.Vector3(1.0, 4.5, 1.0), color: new THREE.Color(C.trunk) });
        const canopyBaseY = 5.1 + (index % 2) * 0.25;
        const cubeOffsets = [[0, 0, 0], [-1.25, 0.15, 0.15], [1.25, 0.05, 0], [0.15, 0.18, -1.2], [-0.2, 0.08, 1.2], [-0.82, 0.85, -0.7], [0.85, 0.78, -0.58], [0.72, 0.72, 0.76], [-0.8, 0.68, 0.7], [0, 1.42, 0]];
        cubeOffsets.forEach((offset, cubeIndex) => {
          blossomCubes.push({ position: new THREE.Vector3(tx + offset[0], canopyBaseY + offset[1], tz + offset[2]), scale: new THREE.Vector3(1.45 + (cubeIndex % 3) * 0.14, 1.1 + (cubeIndex % 2) * 0.16, 1.45 + (cubeIndex % 4) * 0.1), color: new THREE.Color(cubeIndex % 4 === 0 ? C.blossomLight : cubeIndex % 5 === 0 ? C.blossomHot : C.blossom) });
        });
      }
      if (index % 3 === 1) {
        const outward = 4.1 + noise * 2.2;
        const bx = point.x + nx * outward + tangentX * 1.15;
        const bz = point.z + nz * outward + tangentZ * 1.15;
        const bushCount = 3 + (index % 2);
        for (let b = 0; b < bushCount; b += 1) bushes.push({ position: new THREE.Vector3(bx + tangentX * (b - 1) * 0.72, 0.62 + (b % 2) * 0.15, bz + tangentZ * (b - 1) * 0.72), scale: new THREE.Vector3(1.15, 1.0, 1.15), color: new THREE.Color(b % 2 === 0 ? C.leaf : C.leafDark) });
      }
      if (index % 5 === 2) {
        const sx = point.x + nx * 3.2 - tangentX * 0.8;
        const sz = point.z + nz * 3.2 - tangentZ * 0.8;
        for (let s = 0; s < 4; s += 1) stones.push({ position: new THREE.Vector3(sx + (s % 2) * 0.72, 0.45 + Math.floor(s / 2) * 0.52, sz + Math.floor(s / 2) * 0.55), scale: new THREE.Vector3(0.82, 0.78, 0.84), color: new THREE.Color(s % 3 === 0 ? C.stoneShade : C.stone) });
      }
      if (index % 2 === 1) {
        const fx = point.x + nx * 3.9 + tangentX * 0.7;
        const fz = point.z + nz * 3.9 + tangentZ * 0.7;
        for (let f = 0; f < 3; f += 1) {
          const palette = [0x79a7ff, 0xb383ff, 0xff90bf, 0xffdc6c];
          flowers.push({ position: new THREE.Vector3(fx + tangentX * (f - 1) * 0.5, 0.32, fz + tangentZ * (f - 1) * 0.5), scale: new THREE.Vector3(0.25, 0.5, 0.25), color: new THREE.Color(palette[(index + f) % palette.length]) });
        }
      }
    });
  }
  makeInstancedBoxes(root, ground, 0.93, false, true);
  makeInstancedBoxes(root, terraces, 0.9, true, true);
  makeInstancedBoxes(root, trunks, 0.9, true, true);
  makeInstancedBoxes(root, blossomCubes, 0.86, true, true);
  makeInstancedBoxes(root, bushes, 0.88, true, true);
  makeInstancedBoxes(root, flowers, 0.84, false, true);
  makeInstancedBoxes(root, stones, 0.92, true, true);
}

function addReferenceHero(demo: Phase19Demo): void {
  const state = getState(demo);
  if (state.heroDecorated) return;
  state.heroDecorated = true;
  const root = demo.playerVisual;
  root.scale.multiplyScalar(1.06);
  const teal = standard(C.teal, 0.55);
  const tealDark = standard(C.tealDark, 0.65);
  const white = standard(C.white, 0.52);
  const black = standard(C.black, 0.68);
  const red = standard(0xf06069, 0.5, 0xff273d, 0.35);
  const blue = standard(0x6876ff, 0.5, 0x3657ff, 0.5);
  scaledBox(root, teal, [0, 0.95, -0.1], [2.45, 0.78, 3.15]);
  scaledBox(root, tealDark, [0, 0.58, -0.18], [2.62, 0.38, 3.42]);
  scaledBox(root, white, [0, 1.68, -0.08], [2.08, 1.18, 2.22]);
  scaledBox(root, black, [0, 1.63, 1.08], [1.62, 0.73, 0.08]);
  scaledBox(root, black, [0, 1.63, -1.18], [1.62, 0.72, 0.08]);
  scaledBox(root, black, [0, 0.78, -1.78], [2.22, 0.36, 0.35]);
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.36, 10), black);
  spare.rotation.z = Math.PI / 2;
  spare.position.set(0, 0.94, -2.08);
  spare.castShadow = true;
  root.add(spare);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 8), white);
  hub.rotation.z = Math.PI / 2;
  hub.position.copy(spare.position);
  root.add(hub);
  scaledBox(root, red, [-0.48, 2.47, -0.08], [0.66, 0.22, 0.55]);
  scaledBox(root, blue, [0.48, 2.47, -0.08], [0.66, 0.22, 0.55]);
  scaledBox(root, black, [0, 2.31, -0.08], [1.55, 0.12, 0.46]);
  for (const x of [-0.82, 0.82]) {
    const exhaustMaterial = new THREE.MeshBasicMaterial({ color: C.blue, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false });
    const exhaust = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 1.05), exhaustMaterial);
    exhaust.position.set(x, 0.55, -2.46);
    root.add(exhaust);
  }
}

function enemyPalette(enemy: CartEnemyState): { body: number; light: number; dark: number } {
  if (enemy.kind === "boss") return { body: 0x39414c, light: 0x555f6c, dark: 0x222a33 };
  if (enemy.kind === "heavy" || enemy.archetype === "tank") return { body: 0x4b5665, light: 0x697487, dark: 0x2c3440 };
  if (enemy.archetype === "bomber") return { body: 0xf17a83, light: 0xffa0a6, dark: 0x9d4550 };
  if (enemy.archetype === "drifter") return { body: C.purple, light: 0xc498f2, dark: 0x7146aa };
  if (enemy.archetype === "striker") return { body: C.yellow, light: 0xffe97e, dark: 0xb08c2c };
  if (enemy.archetype === "orbiter") return { body: C.green, light: 0xb7e67f, dark: 0x62933d };
  return { body: C.purple, light: 0xba8ee8, dark: 0x72479f };
}

function addCubeCreature(group: THREE.Group, enemy: CartEnemyState): void {
  if (enemy.kind === "boss" || enemy.kind === "heavy" || enemy.archetype === "tank") return;
  const palette = enemyPalette(enemy);
  const bodyMaterial = standard(palette.body, 0.74);
  const lightMaterial = standard(palette.light, 0.7);
  const darkMaterial = standard(palette.dark, 0.72);
  const eyeMaterial = standard(0xfaf7ec, 0.65);
  const pupilMaterial = standard(0x25232c, 0.7);
  const radius = Math.max(1.1, enemy.radius);
  const shell = new THREE.Group();
  shell.name = "phase19-cube-creature";
  scaledBox(shell, bodyMaterial, [0, 1.05, 0], [radius * 1.35, radius * 1.25, radius * 1.28]);
  scaledBox(shell, lightMaterial, [0, 1.7, 0.08], [radius * 1.05, 0.3, radius * 0.94]);
  for (const x of [-radius * 0.34, radius * 0.34]) {
    scaledBox(shell, eyeMaterial, [x, 1.28, radius * 0.66], [0.36, 0.34, 0.08]);
    scaledBox(shell, pupilMaterial, [x + (x < 0 ? 0.08 : -0.08), 1.25, radius * 0.72], [0.12, 0.13, 0.04]);
  }
  scaledBox(shell, darkMaterial, [0, 0.86, radius * 0.68], [0.72, 0.12, 0.08]);
  for (const x of [-radius * 0.52, radius * 0.52]) scaledBox(shell, darkMaterial, [x, 0.22, -radius * 0.18], [0.28, 0.42, 0.36]);
  group.add(shell);
}

function addHeavyFace(group: THREE.Group, enemy: CartEnemyState): void {
  const palette = enemyPalette(enemy);
  const face = standard(0xf2efe8, 0.62);
  const black = standard(0x252a31, 0.68);
  scaledBox(group, face, [0, 1.62, enemy.radius * 0.7], [enemy.radius * 0.82, 0.7, 0.12]);
  for (const x of [-enemy.radius * 0.22, enemy.radius * 0.22]) scaledBox(group, black, [x, 1.69, enemy.radius * 0.77], [0.16, 0.16, 0.05]);
  scaledBox(group, standard(palette.body, 0.62), [0, 0.78, enemy.radius * 0.86], [enemy.radius * 1.4, 0.34, 0.22]);
}

function decorateEnemies(demo: Phase19Demo): void {
  const state = getState(demo);
  for (const enemy of demo.session.enemies) {
    if (state.enemyDecorated.has(enemy.id)) continue;
    const group = demo.enemyGroups.get(enemy.id);
    if (!group) continue;
    state.enemyDecorated.add(enemy.id);
    if (enemy.kind === "boss" || enemy.kind === "heavy" || enemy.archetype === "tank") addHeavyFace(group, enemy);
    else addCubeCreature(group, enemy);
  }
}

function spawnReferenceParticles(demo: Phase19Demo, position: THREE.Vector3, color: number, strength: number): void {
  const state = getState(demo);
  const colors = [new THREE.Color(C.white), new THREE.Color(color), new THREE.Color(C.sandLight)];
  const count = Math.min(44, 20 + Math.round(strength * 18));
  for (let index = 0; index < count; index += 1) {
    const particle = state.particles[state.particleCursor];
    state.particleCursor = (state.particleCursor + 1) % state.particles.length;
    const angle = index / count * Math.PI * 2 + seeded(index, Math.floor(position.x + position.z)) * 0.5;
    const speed = 3.2 + (index % 7) * 0.72 + strength * 1.6;
    particle.active = true;
    particle.maxLife = 0.6 + (index % 5) * 0.055;
    particle.life = particle.maxLife;
    particle.position.copy(position).add(new THREE.Vector3(0, 0.65 + (index % 4) * 0.18, 0));
    particle.velocity.set(Math.cos(angle) * speed, 3.3 + (index % 6) * 0.52, Math.sin(angle) * speed);
    particle.spin.set((index % 5) * 1.8 + 2, (index % 7) * 1.3 + 2, (index % 3) * 2.1 + 1.4);
    particle.size = 0.13 + (index % 4) * 0.055;
    particle.color.copy(colors[index % colors.length]);
  }
}

function spawnReferenceHit(demo: Phase19Demo, position: THREE.Vector3, color: number, strength: number): void {
  const state = getState(demo);
  const group = new THREE.Group();
  const hot = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.98, blending: THREE.AdditiveBlending, depthWrite: false });
  const warm = new THREE.MeshBasicMaterial({ color: 0xffd76f, transparent: true, opacity: 0.94, blending: THREE.AdditiveBlending, depthWrite: false });
  const accent = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending, depthWrite: false });
  const materials = [hot, warm, accent];
  for (let index = 0; index < 22; index += 1) {
    const material = index % 4 === 0 ? warm : index % 5 === 0 ? accent : hot;
    const ray = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 1.4 + (index % 6) * 0.42 + strength * 0.5), material);
    ray.position.y = 0.9 + (index % 4) * 0.1;
    ray.rotation.y = index / 22 * Math.PI * 2;
    ray.rotation.x = ((index % 3) - 1) * 0.2;
    group.add(ray);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9 + strength * 0.25, 0.07, 5, 24), warm);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.95;
  group.add(ring);
  group.position.copy(position);
  demo.scene.add(group);
  state.bursts.push({ group, materials, life: 0.34, maxLife: 0.34 });
  spawnReferenceParticles(demo, position, color, strength);
}

function updateParticles(demo: Phase19Demo, delta: number): void {
  const state = getState(demo);
  const dummy = state.particleDummy;
  state.particles.forEach((particle, index) => {
    if (!particle.active) {
      dummy.position.set(0, -100, 0);
      dummy.scale.setScalar(0.001);
    } else {
      particle.life -= delta;
      particle.velocity.y -= 10.5 * delta;
      particle.position.addScaledVector(particle.velocity, delta);
      if (particle.position.y < 0.11 && particle.velocity.y < 0) {
        particle.position.y = 0.11;
        particle.velocity.y *= -0.26;
        particle.velocity.x *= 0.76;
        particle.velocity.z *= 0.76;
      }
      const ratio = Math.max(0, particle.life / particle.maxLife);
      dummy.position.copy(particle.position);
      dummy.rotation.x += particle.spin.x * delta;
      dummy.rotation.y += particle.spin.y * delta;
      dummy.rotation.z += particle.spin.z * delta;
      dummy.scale.setScalar(Math.max(0.001, particle.size * (0.55 + ratio)));
      if (particle.life <= 0) particle.active = false;
      state.particleMesh.setColorAt(index, particle.color);
    }
    dummy.updateMatrix();
    state.particleMesh.setMatrixAt(index, dummy.matrix);
  });
  state.particleMesh.instanceMatrix.needsUpdate = true;
  if (state.particleMesh.instanceColor) state.particleMesh.instanceColor.needsUpdate = true;
  for (let index = state.bursts.length - 1; index >= 0; index -= 1) {
    const burst = state.bursts[index];
    burst.life -= delta;
    const ratio = Math.max(0, burst.life / burst.maxLife);
    burst.group.scale.setScalar(0.9 + (1 - ratio) * 1.9);
    burst.group.rotation.y += delta * 1.8;
    burst.materials.forEach((material) => { material.opacity = ratio; });
    if (burst.life <= 0) {
      demo.scene.remove(burst.group);
      burst.group.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      burst.materials.forEach((material) => material.dispose());
      state.bursts.splice(index, 1);
    }
  }
}

function updateReferencePresentation(demo: Phase19Demo, delta: number): void {
  const snapshot = demo.session.snapshot();
  decorateEnemies(demo);
  const state = getState(demo);
  const signature = `${snapshot.nodeId}:${snapshot.lastRamEnemyId ?? "none"}:${Math.round(snapshot.lastRamDamage)}:${snapshot.ramCombo}`;
  if (snapshot.lastRamEnemyId && snapshot.lastRamDamage > 0 && signature !== state.lastRamSignature) {
    state.lastRamSignature = signature;
    const target = demo.enemyGroups.get(snapshot.lastRamEnemyId);
    if (target) {
      const enemy = demo.session.enemies.find((candidate) => candidate.id === snapshot.lastRamEnemyId);
      const color = enemy ? enemyPalette(enemy).body : C.purple;
      spawnReferenceHit(demo, target.position, color, Math.min(1.8, 0.65 + snapshot.lastRamDamage / 125));
    }
  }
  if (!snapshot.lastRamEnemyId) state.lastRamSignature = "";
  updateParticles(demo, delta);
}

function applyReferenceCamera(demo: Phase19Demo, snapshot: CartArenaSessionSnapshot): void {
  const forwardX = Math.sin(snapshot.heading);
  const forwardZ = Math.cos(snapshot.heading);
  const rightX = Math.cos(snapshot.heading);
  const rightZ = -Math.sin(snapshot.heading);
  const speedRatio = THREE.MathUtils.clamp(Math.abs(snapshot.speed) / 28, 0, 1);
  const distance = snapshot.boostActive ? 10.7 : 9.4 + speedRatio * 0.75;
  const height = snapshot.boostActive ? 6.9 : 6.2 + speedRatio * 0.35;
  const lateral = -demo.steer * 0.45;
  const desired = new THREE.Vector3(snapshot.x - forwardX * distance + rightX * lateral, height, snapshot.z - forwardZ * distance + rightZ * lateral);
  demo.camera.position.lerp(desired, 0.42);
  const lookDistance = 5.0 + speedRatio * 2.1;
  demo.camera.lookAt(new THREE.Vector3(snapshot.x + forwardX * lookDistance, 1.15, snapshot.z + forwardZ * lookDistance));
  demo.camera.fov = snapshot.boostActive ? 65 : 59 + speedRatio * 2.2;
  demo.camera.updateProjectionMatrix();
}

export function installCartRoguePhase19TargetArt(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase19Demo;
  const originalBuildWorld = prototype.buildWorld;
  const originalBuildPlayer = prototype.buildPlayerVisual;
  const originalBuildEnemies = prototype.buildEnemies;
  const originalUpdate = prototype.updateVisuals;
  const originalCamera = prototype.applyCameraPresentation;
  prototype.buildWorld = function buildWorldPhase19(this: Phase19Demo): void {
    originalBuildWorld.call(this);
    getState(this);
    hideAbstractPhase18World(this);
    applyReferenceGrade(this);
    addVoxelGardenWorld(this);
  };
  prototype.buildPlayerVisual = function buildPlayerPhase19(this: Phase19Demo): void {
    originalBuildPlayer.call(this);
    addReferenceHero(this);
  };
  prototype.buildEnemies = function buildEnemiesPhase19(this: Phase19Demo, enemies: readonly CartEnemySnapshot[]): void {
    originalBuildEnemies.call(this, enemies);
    decorateEnemies(this);
  };
  prototype.updateVisuals = function updateVisualsPhase19(this: Phase19Demo, delta: number): void {
    originalUpdate.call(this, delta);
    updateReferencePresentation(this, delta);
  };
  prototype.applyCameraPresentation = function cameraPhase19(this: Phase19Demo, snapshot: CartArenaSessionSnapshot): void {
    originalCamera.call(this, snapshot);
    applyReferenceCamera(this, snapshot);
  };
}

installCartRoguePhase19TargetArt();

import * as THREE from "three";
import type { CartArenaSessionSnapshot, CartEnemySnapshot } from "./CartArenaSession";
import { cartArenaBoundaryPoints, cartArenaContains, cartArenaPointInPortal } from "./CartArenaShapes";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_WORLD_GRAPH } from "./CartWorldGraph";

interface Phase21Session {
  snapshot(): CartArenaSessionSnapshot;
}

interface Phase21Demo {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  playerVisual: THREE.Group;
  enemyGroups: Map<string, THREE.Group>;
  session: Phase21Session;
  elapsed: number;
  steer: number;
  buildWorld(): void;
  buildPlayerVisual(): void;
  buildEnemies(enemies: readonly CartEnemySnapshot[]): void;
  updateVisuals(delta: number): void;
  applyCameraPresentation(snapshot: CartArenaSessionSnapshot): void;
}

interface DetailEntry {
  p: THREE.Vector3;
  s: THREE.Vector3;
  c: THREE.Color;
  ry?: number;
}

interface ImpactParticle {
  active: boolean;
  life: number;
  maxLife: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  size: number;
  color: THREE.Color;
}

interface ImpactRing {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  grow: number;
}

interface Phase21State {
  root: THREE.Group;
  heroDone: boolean;
  enemiesDone: Set<string>;
  impactMesh: THREE.InstancedMesh;
  impactDummy: THREE.Object3D;
  particles: ImpactParticle[];
  cursor: number;
  rings: ImpactRing[];
  lastRamSignature: string;
  impactAt: number;
  impactStrength: number;
}

const states = new WeakMap<object, Phase21State>();
const BOX = new THREE.BoxGeometry(1, 1, 1);
const IMPACT_BOX = new THREE.BoxGeometry(1, 1, 1);
const C = {
  sand: 0xf2cc8d,
  sandHi: 0xffdda6,
  sandLo: 0xdbae6d,
  stone: 0xeee9df,
  stoneShade: 0xd8d0c5,
  grass: 0x9fd370,
  grassHi: 0xc0e58e,
  grassLo: 0x73ad52,
  blossom: 0xf48fbe,
  blossomHi: 0xffb8d8,
  blossomHot: 0xff6eaa,
  trunk: 0x80563e,
  teal: 0x31bbb3,
  tealDark: 0x137e81,
  white: 0xfaf6ef,
  glass: 0x355d6c,
  tire: 0x273039,
  red: 0xf05c69,
  blue: 0x57d8ff,
  yellow: 0xffd85a,
  purple: 0xb66fea,
  green: 0x8fd35d,
};

function standard(color: number, roughness = 0.8, emissive = 0, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true, emissive, emissiveIntensity });
}

function addBox(parent: THREE.Object3D, material: THREE.Material, p: [number, number, number], s: [number, number, number], rotation: [number, number, number] = [0, 0, 0]): THREE.Mesh {
  const mesh = new THREE.Mesh(BOX, material);
  mesh.position.set(...p);
  mesh.scale.set(...s);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function seeded(index: number, salt = 0): number {
  const value = Math.sin(index * 83.147 + salt * 41.773) * 43758.5453123;
  return value - Math.floor(value);
}

function makeInstanced(root: THREE.Group, entries: DetailEntry[], roughness = 0.9): THREE.InstancedMesh | null {
  if (entries.length === 0) return null;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness: 0, flatShading: true, vertexColors: true });
  const mesh = new THREE.InstancedMesh(BOX, material, entries.length);
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    dummy.position.copy(entry.p);
    dummy.scale.copy(entry.s);
    dummy.rotation.set(0, entry.ry ?? 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, entry.c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  root.add(mesh);
  return mesh;
}

function makeState(demo: Phase21Demo): Phase21State {
  const root = new THREE.Group();
  root.name = "phase21-impact-polish";
  demo.scene.add(root);
  const particles: ImpactParticle[] = Array.from({ length: 132 }, () => ({
    active: false,
    life: 0,
    maxLife: 0,
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    size: 0.12,
    color: new THREE.Color(C.white),
  }));
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0, flatShading: true, vertexColors: true });
  const impactMesh = new THREE.InstancedMesh(IMPACT_BOX, material, particles.length);
  impactMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  impactMesh.frustumCulled = false;
  const impactDummy = new THREE.Object3D();
  particles.forEach((_, index) => {
    impactDummy.position.set(0, -100, 0);
    impactDummy.scale.setScalar(0.001);
    impactDummy.updateMatrix();
    impactMesh.setMatrixAt(index, impactDummy.matrix);
    impactMesh.setColorAt(index, new THREE.Color(C.white));
  });
  impactMesh.instanceMatrix.needsUpdate = true;
  if (impactMesh.instanceColor) impactMesh.instanceColor.needsUpdate = true;
  demo.scene.add(impactMesh);
  return {
    root,
    heroDone: false,
    enemiesDone: new Set(),
    impactMesh,
    impactDummy,
    particles,
    cursor: 0,
    rings: [],
    lastRamSignature: "",
    impactAt: -99,
    impactStrength: 0,
  };
}

function state(demo: Phase21Demo): Phase21State {
  const key = demo as unknown as object;
  const current = states.get(key);
  if (current) return current;
  const created = makeState(demo);
  states.set(key, created);
  return created;
}

function addGroundMicroDetail(demo: Phase21Demo): void {
  const root = state(demo).root;
  const tiles: DetailEntry[] = [];
  const border: DetailEntry[] = [];
  const blossom: DetailEntry[] = [];
  const trunks: DetailEntry[] = [];
  let runningIndex = 0;
  for (const node of CART_WORLD_GRAPH.nodes) {
    if (node.kind === "corridor") continue;
    const { centerX: cx, centerZ: cz, halfWidth: hw, halfDepth: hd } = node.rect;
    const step = 2.55;
    for (let x = cx - hw + 1.4; x <= cx + hw - 1.4; x += step) {
      for (let z = cz - hd + 1.4; z <= cz + hd - 1.4; z += step) {
        runningIndex += 1;
        if (!cartArenaContains(node.id, x, z, 2.1)) continue;
        const r = seeded(runningIndex, cx * 0.03 + cz * 0.01);
        if (r < 0.53) continue;
        const color = r > 0.83 ? C.sandHi : r > 0.66 ? C.sand : C.sandLo;
        tiles.push({
          p: new THREE.Vector3(x + (r - 0.5) * 0.28, 0.085, z + (seeded(runningIndex, 9) - 0.5) * 0.28),
          s: new THREE.Vector3(0.72 + r * 0.24, 0.045, 0.72 + seeded(runningIndex, 5) * 0.24),
          c: new THREE.Color(color),
          ry: (r - 0.5) * 0.18,
        });
      }
    }
    const points = cartArenaBoundaryPoints(node.id, 40, 0);
    points.forEach((point, index) => {
      if (cartArenaPointInPortal(node, point.x, point.z, 4.8)) return;
      const dx = point.x - cx;
      const dz = point.z - cz;
      const len = Math.hypot(dx, dz) || 1;
      const nx = dx / len;
      const nz = dz / len;
      const tx = -nz;
      const tz = nx;
      if (index % 2 === 0) {
        const out = 1.65 + (index % 3) * 0.22;
        border.push({
          p: new THREE.Vector3(point.x + nx * out, 0.24 + (index % 2) * 0.06, point.z + nz * out),
          s: new THREE.Vector3(0.86 + (index % 3) * 0.18, 0.38 + (index % 4) * 0.06, 0.72 + (index % 2) * 0.14),
          c: new THREE.Color(index % 4 === 0 ? C.stoneShade : C.stone),
          ry: Math.atan2(tx, tz),
        });
      }
      if (index % 5 === 1) {
        const treeX = point.x + nx * 5.1 + tx * ((index % 2 ? 1 : -1) * 0.8);
        const treeZ = point.z + nz * 5.1 + tz * ((index % 2 ? 1 : -1) * 0.8);
        trunks.push({ p: new THREE.Vector3(treeX, 2.15, treeZ), s: new THREE.Vector3(0.68, 4.3, 0.68), c: new THREE.Color(C.trunk) });
        const offsets = [[0,0,0],[-1.1,0.15,0.2],[1.05,0.12,-0.18],[0.15,0.22,-1.0],[-0.2,0.12,1.08],[-0.65,0.85,-0.52],[0.72,0.8,0.55],[0,1.42,0]];
        offsets.forEach((offset, petalIndex) => blossom.push({
          p: new THREE.Vector3(treeX + offset[0], 5.0 + offset[1], treeZ + offset[2]),
          s: new THREE.Vector3(1.28 + (petalIndex % 3) * 0.16, 0.95 + (petalIndex % 2) * 0.13, 1.3 + (petalIndex % 4) * 0.12),
          c: new THREE.Color(petalIndex % 4 === 0 ? C.blossomHi : petalIndex % 5 === 0 ? C.blossomHot : C.blossom),
        }));
      }
    });
  }
  makeInstanced(root, tiles, 0.96);
  makeInstanced(root, border, 0.92);
  makeInstanced(root, trunks, 0.9);
  makeInstanced(root, blossom, 0.86);
}

function upgradeHero(demo: Phase21Demo): void {
  const s = state(demo);
  if (s.heroDone) return;
  s.heroDone = true;
  const root = demo.playerVisual;
  const white = standard(C.white, 0.56);
  const teal = standard(C.teal, 0.58);
  const tealDark = standard(C.tealDark, 0.68);
  const glass = standard(C.glass, 0.48);
  const tire = standard(C.tire, 0.76);
  const red = standard(C.red, 0.55, 0xff3147, 0.4);
  const blue = standard(C.blue, 0.48, 0x35cfff, 0.65);

  const hero = new THREE.Group();
  hero.name = "phase21-hero-detail";
  addBox(hero, white, [0, 1.42, 0.86], [2.12, 0.34, 1.45], [-0.12, 0, 0]);
  addBox(hero, teal, [0, 0.92, 1.82], [2.58, 0.5, 0.58], [-0.08, 0, 0]);
  addBox(hero, tealDark, [0, 0.64, 2.12], [2.72, 0.28, 0.32]);
  addBox(hero, glass, [0, 1.78, 1.22], [1.74, 0.56, 0.08], [-0.08, 0, 0]);
  for (const x of [-1.22, 1.22]) {
    addBox(hero, white, [x, 0.88, 0.82], [0.34, 0.72, 2.18]);
    addBox(hero, tealDark, [x, 0.54, 1.45], [0.42, 0.24, 0.72]);
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.12, 5, 12, Math.PI), tire);
    guard.rotation.y = Math.PI / 2;
    guard.rotation.z = Math.PI / 2;
    guard.position.set(x, 0.67, 1.15);
    hero.add(guard);
  }
  addBox(hero, tire, [0, 0.78, 2.35], [0.92, 0.24, 0.14]);
  for (const x of [-0.77, 0.77]) addBox(hero, blue, [x, 1.05, 2.18], [0.48, 0.22, 0.12]);
  for (const x of [-0.86, 0.86]) addBox(hero, red, [x, 0.82, -2.13], [0.38, 0.2, 0.12]);
  addBox(hero, tealDark, [0, 2.48, -0.7], [2.18, 0.12, 0.32]);
  for (const x of [-0.75, -0.25, 0.25, 0.75]) addBox(hero, white, [x, 2.55, 0.18], [0.22, 0.18, 0.28]);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.85, 24), new THREE.MeshBasicMaterial({ color: 0x3b4d45, transparent: true, opacity: 0.16, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1, 1.48, 1);
  shadow.position.y = 0.025;
  hero.add(shadow);
  root.add(hero);
}

function palette(enemy: CartEnemySnapshot): number {
  if (enemy.kind === "boss") return 0xff5b68;
  if (enemy.kind === "heavy" || enemy.archetype === "tank") return 0x798493;
  if (enemy.archetype === "bomber") return 0xff7780;
  if (enemy.archetype === "striker") return C.yellow;
  if (enemy.archetype === "orbiter") return C.green;
  return C.purple;
}

function upgradeEnemy(group: THREE.Group, enemy: CartEnemySnapshot): void {
  if (group.userData.phase21Detailed) return;
  group.userData.phase21Detailed = true;
  const radius = Math.max(1.05, enemy.radius);
  const accent = standard(palette(enemy), 0.67);
  const dark = standard(0x303841, 0.74);
  const white = standard(0xf7f2e9, 0.7);
  const glow = standard(C.yellow, 0.55, C.yellow, 0.7);
  const detail = new THREE.Group();
  detail.name = "phase21-enemy-detail";

  if (enemy.kind === "boss") {
    addBox(detail, dark, [0, 1.15, radius * 0.78], [radius * 1.55, 0.4, 0.5]);
    addBox(detail, accent, [0, 2.1, 0], [radius * 1.45, 0.36, radius * 1.2]);
    for (const x of [-radius * 0.72, radius * 0.72]) {
      addBox(detail, dark, [x, 1.45, radius * 0.95], [0.38, 0.42, 1.12], [0, x < 0 ? -0.18 : 0.18, 0]);
      addBox(detail, glow, [x * 0.58, 2.25, radius * 0.7], [0.28, 0.22, 0.12]);
    }
  } else if (enemy.kind === "heavy" || enemy.archetype === "tank") {
    for (const x of [-radius * 0.82, radius * 0.82]) addBox(detail, dark, [x, 1.15, 0], [0.42, 0.9, radius * 1.3]);
    addBox(detail, accent, [0, 1.75, -radius * 0.45], [radius * 1.25, 0.32, 0.72]);
    addBox(detail, white, [0, 1.5, radius * 0.82], [radius * 0.82, 0.18, 0.08]);
  } else {
    const creature = group.getObjectByName("phase19-cube-creature") ?? group;
    const attach = new THREE.Group();
    attach.name = "phase21-creature-silhouette";
    if (enemy.archetype === "striker") {
      for (const x of [-radius * 0.55, radius * 0.55]) addBox(attach, accent, [x, 1.95, 0], [0.22, 0.58, 0.22], [0, 0, x < 0 ? -0.45 : 0.45]);
    } else if (enemy.archetype === "orbiter") {
      for (let i = 0; i < 4; i += 1) {
        const a = i / 4 * Math.PI * 2;
        addBox(attach, accent, [Math.cos(a) * radius * 0.65, 1.92, Math.sin(a) * radius * 0.65], [0.24, 0.48, 0.24], [0, -a, 0.35]);
      }
    } else if (enemy.archetype === "bomber") {
      addBox(attach, dark, [0, 2.0, 0], [0.18, 0.68, 0.18]);
      addBox(attach, glow, [0, 2.42, 0], [0.3, 0.3, 0.3]);
    } else {
      for (const x of [-radius * 0.65, radius * 0.65]) addBox(attach, accent, [x, 1.92, -0.12], [0.36, 0.42, 0.36]);
    }
    creature.add(attach);
  }
  group.add(detail);
}

function decorateEnemies(demo: Phase21Demo, enemies?: readonly CartEnemySnapshot[]): void {
  const s = state(demo);
  const snapshots = enemies ?? demo.session.snapshot().enemies;
  for (const enemy of snapshots) {
    if (s.enemiesDone.has(enemy.id)) continue;
    const group = demo.enemyGroups.get(enemy.id);
    if (!group) continue;
    s.enemiesDone.add(enemy.id);
    upgradeEnemy(group, enemy);
  }
}

function spawnImpact(demo: Phase21Demo, position: THREE.Vector3, color: number, damage: number): void {
  const s = state(demo);
  const strength = THREE.MathUtils.clamp(0.75 + damage / 105, 0.85, 2.15);
  const colors = [new THREE.Color(C.white), new THREE.Color(C.yellow), new THREE.Color(color), new THREE.Color(C.sandHi)];
  const count = Math.min(58, 28 + Math.round(strength * 13));
  for (let index = 0; index < count; index += 1) {
    const particle = s.particles[s.cursor];
    s.cursor = (s.cursor + 1) % s.particles.length;
    const angle = index / count * Math.PI * 2 + seeded(index, Math.floor(position.x + position.z)) * 0.35;
    const speed = 4.0 + (index % 8) * 0.65 + strength * 1.7;
    particle.active = true;
    particle.maxLife = 0.62 + (index % 5) * 0.055;
    particle.life = particle.maxLife;
    particle.p.copy(position).add(new THREE.Vector3(0, 0.72 + (index % 5) * 0.13, 0));
    particle.v.set(Math.cos(angle) * speed, 3.9 + (index % 7) * 0.54, Math.sin(angle) * speed);
    particle.spin.set(2.1 + (index % 4) * 1.4, 2.6 + (index % 5) * 1.2, 1.8 + (index % 6) * 1.1);
    particle.size = 0.14 + (index % 5) * 0.045;
    particle.color.copy(colors[index % colors.length]);
  }

  for (let ringIndex = 0; ringIndex < 2; ringIndex += 1) {
    const material = new THREE.MeshBasicMaterial({ color: ringIndex === 0 ? 0xffffff : C.yellow, transparent: true, opacity: ringIndex === 0 ? 0.96 : 0.82, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.82 + ringIndex * 0.25, 0.075 + ringIndex * 0.02, 5, 28), material);
    mesh.position.copy(position);
    mesh.position.y += 0.95 + ringIndex * 0.1;
    mesh.rotation.x = Math.PI / 2;
    demo.scene.add(mesh);
    s.rings.push({ mesh, material, life: 0.34 + ringIndex * 0.08, maxLife: 0.34 + ringIndex * 0.08, grow: 2.1 + strength * 0.65 + ringIndex * 0.5 });
  }
  s.impactAt = demo.elapsed;
  s.impactStrength = strength;
}

function updateImpacts(demo: Phase21Demo, delta: number): void {
  const s = state(demo);
  const dummy = s.impactDummy;
  for (let index = 0; index < s.particles.length; index += 1) {
    const particle = s.particles[index];
    if (!particle.active) {
      dummy.position.set(0, -100, 0);
      dummy.scale.setScalar(0.001);
    } else {
      particle.life -= delta;
      particle.v.y -= 11.8 * delta;
      particle.p.addScaledVector(particle.v, delta);
      if (particle.p.y < 0.1 && particle.v.y < 0) {
        particle.p.y = 0.1;
        particle.v.y *= -0.24;
        particle.v.x *= 0.74;
        particle.v.z *= 0.74;
      }
      const ratio = Math.max(0, particle.life / particle.maxLife);
      dummy.position.copy(particle.p);
      dummy.rotation.x += particle.spin.x * delta;
      dummy.rotation.y += particle.spin.y * delta;
      dummy.rotation.z += particle.spin.z * delta;
      dummy.scale.setScalar(Math.max(0.001, particle.size * (0.5 + ratio * 0.8)));
      if (particle.life <= 0) particle.active = false;
      s.impactMesh.setColorAt(index, particle.color);
    }
    dummy.updateMatrix();
    s.impactMesh.setMatrixAt(index, dummy.matrix);
  }
  s.impactMesh.instanceMatrix.needsUpdate = true;
  if (s.impactMesh.instanceColor) s.impactMesh.instanceColor.needsUpdate = true;

  for (let index = s.rings.length - 1; index >= 0; index -= 1) {
    const ring = s.rings[index];
    ring.life -= delta;
    const ratio = Math.max(0, ring.life / ring.maxLife);
    const scale = 0.9 + (1 - ratio) * ring.grow;
    ring.mesh.scale.setScalar(scale);
    ring.material.opacity = ratio * 0.9;
    if (ring.life <= 0) {
      demo.scene.remove(ring.mesh);
      ring.mesh.geometry.dispose();
      ring.material.dispose();
      s.rings.splice(index, 1);
    }
  }
}

function updatePresentation(demo: Phase21Demo, delta: number): void {
  const snapshot = demo.session.snapshot();
  decorateEnemies(demo);
  const s = state(demo);
  const signature = `${snapshot.nodeId}:${snapshot.lastRamEnemyId ?? "none"}:${Math.round(snapshot.lastRamDamage)}:${snapshot.ramCombo}`;
  if (snapshot.lastRamEnemyId && snapshot.lastRamDamage > 0 && signature !== s.lastRamSignature) {
    s.lastRamSignature = signature;
    const target = demo.enemyGroups.get(snapshot.lastRamEnemyId);
    const enemy = snapshot.enemies.find((candidate) => candidate.id === snapshot.lastRamEnemyId);
    if (target) spawnImpact(demo, target.position, enemy ? palette(enemy) : C.purple, snapshot.lastRamDamage);
  }
  if (!snapshot.lastRamEnemyId) s.lastRamSignature = "";
  updateImpacts(demo, delta);
}

function addImpactCameraPunch(demo: Phase21Demo): void {
  const s = state(demo);
  const age = demo.elapsed - s.impactAt;
  if (age < 0 || age > 0.18) return;
  const ratio = 1 - age / 0.18;
  const amplitude = 0.075 * s.impactStrength * ratio;
  const phase = demo.elapsed * 190;
  demo.camera.position.x += Math.sin(phase) * amplitude;
  demo.camera.position.y += Math.cos(phase * 1.31) * amplitude * 0.55;
  demo.camera.position.z += Math.sin(phase * 0.73) * amplitude * 0.7;
  demo.camera.fov += 1.25 * s.impactStrength * ratio;
  demo.camera.updateProjectionMatrix();
}

export function installCartRoguePhase21ImpactPolish(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase21Demo;
  const oldWorld = prototype.buildWorld;
  const oldPlayer = prototype.buildPlayerVisual;
  const oldEnemies = prototype.buildEnemies;
  const oldUpdate = prototype.updateVisuals;
  const oldCamera = prototype.applyCameraPresentation;

  prototype.buildWorld = function phase21World(this: Phase21Demo): void {
    oldWorld.call(this);
    state(this);
    addGroundMicroDetail(this);
  };
  prototype.buildPlayerVisual = function phase21Player(this: Phase21Demo): void {
    oldPlayer.call(this);
    upgradeHero(this);
  };
  prototype.buildEnemies = function phase21Enemies(this: Phase21Demo, enemies: readonly CartEnemySnapshot[]): void {
    oldEnemies.call(this, enemies);
    decorateEnemies(this, enemies);
  };
  prototype.updateVisuals = function phase21Update(this: Phase21Demo, delta: number): void {
    oldUpdate.call(this, delta);
    updatePresentation(this, delta);
  };
  prototype.applyCameraPresentation = function phase21Camera(this: Phase21Demo, snapshot: CartArenaSessionSnapshot): void {
    oldCamera.call(this, snapshot);
    addImpactCameraPunch(this);
  };
}

installCartRoguePhase21ImpactPolish();

import * as THREE from "three";
import type { CartArenaSessionSnapshot, CartEnemySnapshot } from "./CartArenaSession";
import type { CartEnemyState } from "./CartCombat";
import { cartArenaBoundaryPoints, cartArenaContains, cartArenaShapeForNode } from "./CartArenaShapes";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_WORLD_GRAPH } from "./CartWorldGraph";

interface Phase18Session {
  enemies: CartEnemyState[];
  snapshot(): CartArenaSessionSnapshot;
}

interface Phase18Demo {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  chaseCamera: { target: THREE.Vector3 };
  session: Phase18Session;
  playerVisual: THREE.Group;
  enemyGroups: Map<string, THREE.Group>;
  elapsed: number;
  steer: number;
  boost: boolean;
  brake: boolean;
  buildWorld(): void;
  buildPlayerVisual(): void;
  buildEnemies(enemies: readonly CartEnemySnapshot[]): void;
  spawnImpact(position: THREE.Vector3, color: number, scale?: number): void;
  updateVisuals(delta: number): void;
  applyCameraPresentation(snapshot: CartArenaSessionSnapshot): void;
}

interface OverdriveBurst {
  group: THREE.Group;
  materials: THREE.Material[];
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  rotationSpeed: number;
}

interface EnemyVisualFx {
  root: THREE.Group;
  core: THREE.Mesh | null;
  rings: THREE.Mesh[];
  glowMaterial: THREE.MeshBasicMaterial | null;
  archetype: CartEnemyState["archetype"];
  kind: CartEnemyState["kind"];
}

interface Phase18State {
  worldRoot: THREE.Group;
  heroRoot: THREE.Group | null;
  heroGlowMaterials: THREE.MeshBasicMaterial[];
  heroTurbines: THREE.Mesh[];
  enemyFx: Map<string, EnemyVisualFx>;
  bursts: OverdriveBurst[];
  speedStreaks: THREE.LineSegments;
  speedStreakGeometry: THREE.BufferGeometry;
  speedStreakMaterial: THREE.LineBasicMaterial;
  streakSeeds: Array<{ x: number; y: number; phase: number; length: number }>;
  skylineGlowMaterials: THREE.MeshBasicMaterial[];
}

const stateByDemo = new WeakMap<object, Phase18State>();
const decoratedHero = new WeakSet<THREE.Group>();
const decoratedEnemies = new WeakSet<THREE.Group>();

const P = {
  deep: 0x243442,
  ink: 0x18232d,
  slate: 0x42566a,
  metal: 0x8ca2ad,
  sand: 0xd99c62,
  sandBright: 0xf0c47d,
  cream: 0xf8e0b1,
  cyan: 0x4de4ef,
  cyanHot: 0xb8fbff,
  teal: 0x20b7b6,
  magenta: 0xf15f9a,
  violet: 0x7b6de8,
  amber: 0xffc857,
  red: 0xff5e68,
  green: 0x8fdb70,
};

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_OCTA = new THREE.OctahedronGeometry(1, 0);
const UNIT_DODECA = new THREE.DodecahedronGeometry(1, 0);

function standard(color: number, roughness = 0.62, metalness = 0.08, emissive = 0, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: true,
    emissive,
    emissiveIntensity,
  });
}

function glow(color: number, opacity = 0.8): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function scaledBox(
  parent: THREE.Object3D,
  material: THREE.Material,
  position: [number, number, number],
  scale: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const mesh = new THREE.Mesh(UNIT_BOX, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = material instanceof THREE.MeshStandardMaterial;
  mesh.receiveShadow = material instanceof THREE.MeshStandardMaterial;
  parent.add(mesh);
  return mesh;
}

function makeSpeedStreaks(): Pick<Phase18State, "speedStreaks" | "speedStreakGeometry" | "speedStreakMaterial" | "streakSeeds"> {
  const count = 34;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 2 * 3), 3));
  const material = new THREE.LineBasicMaterial({
    color: P.cyanHot,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = 996;
  lines.frustumCulled = false;
  const seeds = Array.from({ length: count }, (_, index) => {
    const angle = index * 2.399963229728653;
    const radius = 0.18 + (index % 8) * 0.043;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.55,
      phase: (index * 0.173) % 1,
      length: 0.32 + (index % 6) * 0.11,
    };
  });
  return { speedStreaks: lines, speedStreakGeometry: geometry, speedStreakMaterial: material, streakSeeds: seeds };
}

function getState(demo: Phase18Demo): Phase18State {
  const key = demo as unknown as object;
  const current = stateByDemo.get(key);
  if (current) return current;
  const streaks = makeSpeedStreaks();
  demo.camera.add(streaks.speedStreaks);
  const worldRoot = new THREE.Group();
  worldRoot.name = "phase18-visual-overdrive-world";
  demo.scene.add(worldRoot);
  const created: Phase18State = {
    worldRoot,
    heroRoot: null,
    heroGlowMaterials: [],
    heroTurbines: [],
    enemyFx: new Map(),
    bursts: [],
    skylineGlowMaterials: [],
    ...streaks,
  };
  stateByDemo.set(key, created);
  return created;
}

function enhanceBasePalette(demo: Phase18Demo): void {
  const touched = new Set<THREE.Material>();
  demo.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (touched.has(material) || !(material instanceof THREE.MeshStandardMaterial)) continue;
      touched.add(material);
      const hsl = { h: 0, s: 0, l: 0 };
      material.color.getHSL(hsl);
      if (hsl.l < 0.9) {
        material.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.12 + 0.035), Math.max(0.07, hsl.l * 0.94));
      }
      if (material.emissiveIntensity === 0) material.metalness = Math.max(material.metalness, hsl.l < 0.62 ? 0.045 : 0.02);
    }
  });

  demo.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  demo.renderer.toneMappingExposure = 1.04;
  demo.scene.background = new THREE.Color(0x72b9d8);
  if (demo.scene.fog instanceof THREE.Fog) {
    demo.scene.fog.color.setHex(0xa9d1dc);
    demo.scene.fog.near = 82;
    demo.scene.fog.far = 318;
  }

  let directionalIndex = 0;
  demo.scene.traverse((object) => {
    if (object instanceof THREE.HemisphereLight) {
      object.intensity = 1.55;
      object.color.setHex(0xd8f4ff);
      object.groundColor.setHex(0x5e6258);
    } else if (object instanceof THREE.DirectionalLight) {
      if (directionalIndex === 0) {
        object.intensity = 3.75;
        object.color.setHex(0xffdfb2);
      } else if (directionalIndex === 1) {
        object.intensity = 0.68;
        object.color.setHex(0x82cfff);
      } else {
        object.intensity = 0.46;
        object.color.setHex(0xff9fc8);
      }
      directionalIndex += 1;
    }
  });

  const rim = new THREE.DirectionalLight(P.cyan, 0.55);
  rim.position.set(34, 24, -46);
  rim.name = "phase18-cyan-rim";
  demo.scene.add(rim);
}

function addFacetedHorizon(demo: Phase18Demo): void {
  const state = getState(demo);
  const root = state.worldRoot;
  const mountainGeometry = new THREE.ConeGeometry(1, 1, 5, 1, false);
  const mountainMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, flatShading: true, vertexColors: true });
  const mountainCount = 42;
  const mountains = new THREE.InstancedMesh(mountainGeometry, mountainMaterial, mountainCount);
  const dummy = new THREE.Object3D();
  const mountainPalette = [0x5c7580, 0x6d7e8d, 0x4d6971, 0x7a7184];
  for (let index = 0; index < mountainCount; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const layer = Math.floor(index / 2);
    const z = -28 + layer * 28;
    const x = side * (82 + (index % 5) * 11 + (layer % 3) * 5);
    const width = 24 + (index % 6) * 6;
    const height = 18 + (index % 7) * 5;
    dummy.position.set(x, height * 0.48 - 1.5, z);
    dummy.scale.set(width, height, width * (0.68 + (index % 3) * 0.08));
    dummy.rotation.set(0, (index % 5 - 2) * 0.12, 0);
    dummy.updateMatrix();
    mountains.setMatrixAt(index, dummy.matrix);
    mountains.setColorAt(index, new THREE.Color(mountainPalette[index % mountainPalette.length]));
  }
  mountains.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mountains.instanceMatrix.needsUpdate = true;
  if (mountains.instanceColor) mountains.instanceColor.needsUpdate = true;
  mountains.castShadow = false;
  mountains.receiveShadow = false;
  root.add(mountains);

  const towerGeometry = new THREE.BoxGeometry(1, 1, 1);
  const towerMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.16, flatShading: true, vertexColors: true });
  const towerCount = 34;
  const towers = new THREE.InstancedMesh(towerGeometry, towerMaterial, towerCount);
  for (let index = 0; index < towerCount; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const layer = Math.floor(index / 2);
    const z = 12 + layer * 32;
    const height = 8 + (index % 5) * 3.4;
    dummy.position.set(side * (66 + (index % 4) * 8), height * 0.5, z);
    dummy.scale.set(3.2 + (index % 3), height, 3.4 + ((index + 1) % 3));
    dummy.rotation.set(0, side * (0.04 + (index % 3) * 0.045), 0);
    dummy.updateMatrix();
    towers.setMatrixAt(index, dummy.matrix);
    towers.setColorAt(index, new THREE.Color(index % 3 === 0 ? 0x314956 : index % 3 === 1 ? 0x526979 : 0x40556a));
  }
  towers.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  towers.instanceMatrix.needsUpdate = true;
  if (towers.instanceColor) towers.instanceColor.needsUpdate = true;
  root.add(towers);

  const beaconMat = glow(P.magenta, 0.58);
  state.skylineGlowMaterials.push(beaconMat);
  for (let index = 0; index < 18; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const beacon = new THREE.Mesh(UNIT_OCTA, beaconMat);
    beacon.position.set(side * (66 + (index % 4) * 8), 10 + (index % 5) * 3.4, 12 + Math.floor(index / 2) * 32);
    beacon.scale.setScalar(0.32 + (index % 3) * 0.08);
    root.add(beacon);
  }
}

function addArenaInlays(demo: Phase18Demo): void {
  const root = getState(demo).worldRoot;
  const tileGeometry = new THREE.BoxGeometry(1, 1, 1);
  const tileMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68, metalness: 0.04, flatShading: true, vertexColors: true });
  const transforms: Array<{ x: number; z: number; sx: number; sz: number; r: number; color: THREE.Color }> = [];
  const colors = [new THREE.Color(0xbd7f53), new THREE.Color(0xe3aa68), new THREE.Color(0x7f8d8d), new THREE.Color(0xc18972)];
  for (const node of CART_WORLD_GRAPH.nodes) {
    const step = node.kind === "corridor" ? 5.2 : 6.4;
    for (let x = node.rect.centerX - node.rect.halfWidth + 2; x <= node.rect.centerX + node.rect.halfWidth - 2; x += step) {
      for (let z = node.rect.centerZ - node.rect.halfDepth + 2; z <= node.rect.centerZ + node.rect.halfDepth - 2; z += step) {
        const seed = Math.abs(Math.floor(x * 17 + z * 11));
        if (seed % 4 !== 0) continue;
        if (cartArenaShapeForNode(node.id) && !cartArenaContains(node.id, x, z, 1.3)) continue;
        transforms.push({
          x,
          z,
          sx: 0.55 + (seed % 4) * 0.13,
          sz: 1.15 + (seed % 5) * 0.2,
          r: ((seed % 7) - 3) * 0.08,
          color: colors[seed % colors.length],
        });
      }
    }
  }
  const mesh = new THREE.InstancedMesh(tileGeometry, tileMaterial, Math.max(1, transforms.length));
  const dummy = new THREE.Object3D();
  transforms.forEach((entry, index) => {
    dummy.position.set(entry.x, 0.047, entry.z);
    dummy.scale.set(entry.sx, 0.026, entry.sz);
    dummy.rotation.set(0, entry.r, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, entry.color);
  });
  mesh.count = transforms.length;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  root.add(mesh);
}

function addGuidanceLights(demo: Phase18Demo): void {
  const root = getState(demo).worldRoot;
  const entries: Array<{ x: number; z: number; rotation: number; color: THREE.Color }> = [];
  const cyan = new THREE.Color(P.cyan);
  const magenta = new THREE.Color(P.magenta);
  const amber = new THREE.Color(P.amber);
  for (const node of CART_WORLD_GRAPH.nodes) {
    if (node.kind === "corridor") {
      for (let z = node.rect.centerZ - node.rect.halfDepth + 2.5, index = 0; z < node.rect.centerZ + node.rect.halfDepth - 2; z += 4.8, index += 1) {
        for (const side of [-1, 1]) {
          entries.push({
            x: node.rect.centerX + side * Math.max(1.6, node.rect.halfWidth - 0.8),
            z,
            rotation: 0,
            color: index % 5 === 0 ? amber : side < 0 ? cyan : magenta,
          });
        }
      }
      continue;
    }
    if (!cartArenaShapeForNode(node.id)) continue;
    const points = cartArenaBoundaryPoints(node.id, 72, 1.15);
    for (let index = 0; index < points.length; index += 4) {
      const point = points[index];
      const next = points[(index + 1) % points.length];
      entries.push({
        x: point.x,
        z: point.z,
        rotation: Math.atan2(next.x - point.x, next.z - point.z),
        color: node.kind === "boss" ? magenta : index % 12 === 0 ? amber : cyan,
      });
    }
  }

  const geometry = new THREE.BoxGeometry(0.17, 0.07, 1.25);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false });
  const markers = new THREE.InstancedMesh(geometry, material, Math.max(1, entries.length));
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    dummy.position.set(entry.x, 0.12, entry.z);
    dummy.rotation.set(0, entry.rotation, 0);
    dummy.scale.set(1, 1, 0.72 + (index % 3) * 0.18);
    dummy.updateMatrix();
    markers.setMatrixAt(index, dummy.matrix);
    markers.setColorAt(index, entry.color);
  });
  markers.count = entries.length;
  markers.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  markers.instanceMatrix.needsUpdate = true;
  if (markers.instanceColor) markers.instanceColor.needsUpdate = true;
  markers.frustumCulled = true;
  root.add(markers);
}

function addArenaArchitecture(demo: Phase18Demo): void {
  const root = getState(demo).worldRoot;
  const dark = standard(P.deep, 0.56, 0.12);
  const metal = standard(P.metal, 0.4, 0.24);
  const warm = standard(P.sandBright, 0.72, 0.04);
  const cyanGlow = glow(P.cyan, 0.66);
  const magentaGlow = glow(P.magenta, 0.6);

  for (let nodeIndex = 0; nodeIndex < CART_WORLD_GRAPH.nodes.length; nodeIndex += 1) {
    const node = CART_WORLD_GRAPH.nodes[nodeIndex];
    if (node.kind === "corridor") continue;
    for (const side of [-1, 1]) {
      const tower = new THREE.Group();
      const x = node.rect.centerX + side * (node.rect.halfWidth + 6.2);
      const z = node.rect.centerZ + ((nodeIndex + (side > 0 ? 1 : 0)) % 2 === 0 ? -1 : 1) * node.rect.halfDepth * 0.55;
      tower.position.set(x, 0, z);
      tower.rotation.y = side * 0.08;
      scaledBox(tower, warm, [0, 0.35, 0], [3.2, 0.7, 3.2]);
      scaledBox(tower, dark, [0, 3.4, 0], [1.05, 6.2, 1.05]);
      scaledBox(tower, metal, [0, 6.6, 0], [1.55, 0.32, 1.55], [0, Math.PI / 4, 0]);
      for (const y of [2.0, 3.8, 5.6]) {
        const lightMaterial = (node.kind === "boss" || (nodeIndex + y) % 2 === 0) ? magentaGlow : cyanGlow;
        scaledBox(tower, lightMaterial, [0, y, side * 0.57], [0.16, 0.24, 0.9]);
      }
      const cap = new THREE.Mesh(UNIT_OCTA, node.kind === "boss" ? magentaGlow : cyanGlow);
      cap.position.y = 7.25;
      cap.scale.set(0.5, 0.7, 0.5);
      tower.add(cap);
      root.add(tower);
    }
  }
}

function addAtmosphereAccents(demo: Phase18Demo): void {
  const root = getState(demo).worldRoot;
  const sunOuter = new THREE.Mesh(new THREE.CircleGeometry(19, 28), glow(0xffd78b, 0.13));
  sunOuter.position.set(-92, 78, -179.5);
  sunOuter.lookAt(0, 18, 70);
  root.add(sunOuter);
  const sunInner = new THREE.Mesh(new THREE.CircleGeometry(10, 24), glow(0xfff0bb, 0.34));
  sunInner.position.set(-92, 78, -179);
  sunInner.lookAt(0, 18, 70);
  root.add(sunInner);

  const hazeMaterial = new THREE.MeshBasicMaterial({ color: 0x8ec2cf, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
  for (let index = 0; index < 7; index += 1) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(190 + index * 22, 16 + (index % 3) * 4), hazeMaterial);
    band.position.set((index % 2 ? -1 : 1) * 22, 10 + (index % 3) * 3, 55 + index * 72);
    band.rotation.y = index % 2 ? 0.06 : -0.06;
    root.add(band);
  }
}

function buildOverdriveWorld(demo: Phase18Demo): void {
  getState(demo);
  enhanceBasePalette(demo);
  addFacetedHorizon(demo);
  addArenaInlays(demo);
  addGuidanceLights(demo);
  addArenaArchitecture(demo);
  addAtmosphereAccents(demo);
}

function addHeroOverdrive(demo: Phase18Demo): void {
  if (decoratedHero.has(demo.playerVisual)) return;
  decoratedHero.add(demo.playerVisual);
  const state = getState(demo);
  const root = new THREE.Group();
  root.name = "phase18-hero-overdrive";
  demo.playerVisual.add(root);
  state.heroRoot = root;

  const graphite = standard(P.ink, 0.4, 0.28);
  const metal = standard(0xb9c8ca, 0.32, 0.32);
  const teal = standard(P.teal, 0.38, 0.16);
  const amber = standard(P.amber, 0.42, 0.12, 0x6b3c00, 0.25);
  const cyanGlow = glow(P.cyanHot, 0.9);
  const magentaGlow = glow(P.magenta, 0.76);
  state.heroGlowMaterials.push(cyanGlow, magentaGlow);

  scaledBox(root, graphite, [0, 0.62, 2.42], [2.95, 0.24, 0.34]);
  scaledBox(root, metal, [0, 0.9, 2.48], [1.36, 0.2, 0.22]);
  for (const x of [-1.16, 1.16]) {
    scaledBox(root, graphite, [x, 0.92, 1.72], [0.32, 0.34, 1.05], [0, x < 0 ? -0.08 : 0.08, 0]);
    scaledBox(root, teal, [x, 1.24, 1.14], [0.16, 0.16, 1.45]);
    scaledBox(root, metal, [x * 1.02, 0.54, -1.72], [0.26, 0.22, 0.84]);
    scaledBox(root, cyanGlow, [x * 0.83, 0.46, -2.38], [0.18, 0.11, 0.22]);
  }

  scaledBox(root, graphite, [0, 1.55, 1.13], [1.42, 0.16, 0.92], [-0.1, 0, 0]);
  scaledBox(root, amber, [0, 1.67, 1.08], [0.68, 0.08, 0.68], [-0.1, 0, 0]);
  for (const x of [-0.55, 0, 0.55]) scaledBox(root, graphite, [x, 1.78, 1.02], [0.14, 0.12, 0.74], [-0.12, 0, 0]);

  const spoilerBar = scaledBox(root, graphite, [0, 1.72, -2.05], [2.55, 0.18, 0.36]);
  spoilerBar.rotation.x = -0.04;
  for (const x of [-0.95, 0.95]) scaledBox(root, graphite, [x, 1.32, -1.9], [0.18, 0.8, 0.2], [0.08, 0, 0]);
  scaledBox(root, magentaGlow, [0, 1.66, -2.26], [1.45, 0.08, 0.08]);

  for (const x of [-0.62, 0.62]) {
    const turbine = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 6, 14), metal);
    turbine.position.set(x, 0.56, -2.56);
    turbine.rotation.x = Math.PI / 2;
    root.add(turbine);
    state.heroTurbines.push(turbine);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.72, 7), cyanGlow);
    flame.position.set(x, 0.56, -2.86);
    flame.rotation.x = -Math.PI / 2;
    flame.scale.y = 0.55;
    flame.name = "phase18-hero-flame";
    root.add(flame);
  }

  for (const side of [-1, 1]) {
    const blade = new THREE.Mesh(UNIT_OCTA, graphite);
    blade.position.set(side * 1.34, 0.86, 1.85);
    blade.scale.set(0.18, 0.32, 0.72);
    blade.rotation.z = side * 0.16;
    root.add(blade);
  }
}

function addEnemyOverdrive(demo: Phase18Demo): void {
  const state = getState(demo);
  for (const enemy of demo.session.enemies) {
    const group = demo.enemyGroups.get(enemy.id);
    if (!group || decoratedEnemies.has(group)) continue;
    decoratedEnemies.add(group);
    const root = new THREE.Group();
    root.name = `phase18-enemy-${enemy.archetype ?? enemy.kind}`;
    group.add(root);

    const dark = standard(P.ink, 0.46, 0.2);
    const metal = standard(P.metal, 0.38, 0.24);
    const cyanGlow = glow(P.cyan, 0.78);
    const greenGlow = glow(P.green, 0.76);
    const redGlow = glow(P.red, 0.84);
    const amberGlow = glow(P.amber, 0.76);
    const magentaGlow = glow(P.magenta, 0.84);
    let core: THREE.Mesh | null = null;
    const rings: THREE.Mesh[] = [];
    let glowMaterial: THREE.MeshBasicMaterial | null = null;

    if (enemy.kind === "boss") {
      for (const side of [-1, 1]) {
        scaledBox(root, dark, [side * 2.35, 1.45, -0.15], [0.38, 1.15, 2.8], [0, side * 0.08, side * 0.08]);
        scaledBox(root, metal, [side * 2.22, 2.12, 0.35], [0.2, 0.28, 1.75]);
        const fin = new THREE.Mesh(UNIT_OCTA, dark);
        fin.position.set(side * 2.5, 2.55, -0.95);
        fin.scale.set(0.28, 1.2, 0.7);
        fin.rotation.z = side * 0.2;
        root.add(fin);
      }
      core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), magentaGlow);
      core.position.set(0, 2.45, 1.92);
      root.add(core);
      glowMaterial = magentaGlow;
      for (const radius of [0.9, 1.25]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.055, 6, 24), magentaGlow);
        ring.position.copy(core.position);
        ring.rotation.x = Math.PI / 2;
        root.add(ring);
        rings.push(ring);
      }
      scaledBox(root, magentaGlow, [0, 0.34, -0.15], [3.3, 0.06, 2.4]);
    } else if (enemy.archetype === "drifter") {
      glowMaterial = cyanGlow;
      for (const side of [-1, 1]) {
        scaledBox(root, dark, [side * 1.22, 1.05, -0.2], [0.2, 0.45, 1.75], [0, side * 0.12, side * 0.08]);
        scaledBox(root, cyanGlow, [side * 1.34, 1.2, -0.36], [0.08, 0.12, 1.18]);
      }
      scaledBox(root, metal, [0, 1.86, -0.72], [2.25, 0.15, 0.32]);
      scaledBox(root, dark, [-0.85, 1.48, -0.68], [0.12, 0.8, 0.18]);
      scaledBox(root, dark, [0.85, 1.48, -0.68], [0.12, 0.8, 0.18]);
    } else if (enemy.archetype === "bomber") {
      glowMaterial = redGlow;
      core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.56, 1), redGlow);
      core.position.set(0, 1.55, 0.05);
      root.add(core);
      for (const radius of [0.78, 1.04]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.06, 6, 18), radius < 0.9 ? amberGlow : redGlow);
        ring.position.copy(core.position);
        ring.rotation.x = Math.PI / 2;
        root.add(ring);
        rings.push(ring);
      }
      for (let index = 0; index < 6; index += 1) {
        const angle = index / 6 * Math.PI * 2;
        const cage = scaledBox(root, dark, [Math.cos(angle) * 0.92, 1.55, Math.sin(angle) * 0.92], [0.12, 0.85, 0.12]);
        cage.rotation.z = Math.cos(angle) * 0.12;
      }
    } else if (enemy.archetype === "tank" || enemy.kind === "heavy") {
      glowMaterial = amberGlow;
      scaledBox(root, dark, [0, 0.78, 1.55], [3.15, 0.52, 0.54]);
      scaledBox(root, metal, [0, 1.12, 1.35], [2.45, 0.18, 0.28]);
      for (const side of [-1, 1]) {
        scaledBox(root, dark, [side * 1.58, 0.9, 0], [0.42, 0.62, 2.32]);
        scaledBox(root, amberGlow, [side * 1.77, 0.98, 0.3], [0.08, 0.16, 1.34]);
      }
    } else if (enemy.archetype === "orbiter") {
      glowMaterial = magentaGlow;
      for (const side of [-1, 1]) scaledBox(root, magentaGlow, [side * 0.92, 1.42, -0.74], [0.11, 0.15, 1.16], [0, side * 0.15, 0]);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.045, 5, 20), magentaGlow);
      halo.position.y = 1.62;
      halo.rotation.x = Math.PI / 2;
      root.add(halo);
      rings.push(halo);
    } else if (enemy.archetype === "striker") {
      glowMaterial = redGlow;
      scaledBox(root, dark, [0, 0.68, 1.38], [2.35, 0.38, 0.58]);
      for (const side of [-1, 1]) scaledBox(root, redGlow, [side * 0.8, 0.87, 1.68], [0.16, 0.18, 0.22]);
    } else {
      glowMaterial = greenGlow;
      for (const side of [-1, 1]) scaledBox(root, greenGlow, [side * 0.72, 1.2, 1.18], [0.14, 0.14, 0.22]);
      scaledBox(root, dark, [0, 0.58, 1.4], [2.12, 0.32, 0.46]);
    }

    state.enemyFx.set(enemy.id, { root, core, rings, glowMaterial, archetype: enemy.archetype, kind: enemy.kind });
  }
}

function spawnOverdriveImpact(demo: Phase18Demo, position: THREE.Vector3, color: number, scale: number): void {
  const state = getState(demo);
  const group = new THREE.Group();
  group.position.copy(position);
  const materials: THREE.Material[] = [];
  const outer = glow(color, 0.92);
  const hot = glow(0xffffff, 0.96);
  const accent = glow(color === 0xffd46a ? P.cyan : P.amber, 0.72);
  materials.push(outer, hot, accent);

  for (const radius of [0.82, 1.26, 1.72]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * scale, 0.045 * scale, 5, 26), outer);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.96;
    group.add(ring);
  }
  for (let index = 0; index < 14; index += 1) {
    const shard = new THREE.Mesh(UNIT_OCTA, index % 4 === 0 ? hot : index % 3 === 0 ? accent : outer);
    const angle = index / 14 * Math.PI * 2;
    const radius = (0.75 + (index % 4) * 0.28) * scale;
    shard.position.set(Math.cos(angle) * radius, 0.72 + (index % 5) * 0.19, Math.sin(angle) * radius);
    shard.scale.set(0.08 + (index % 3) * 0.035, 0.08 + ((index + 1) % 3) * 0.04, 0.42 + (index % 4) * 0.14);
    shard.rotation.set(angle * 0.7, angle, angle * 0.3);
    group.add(shard);
  }
  const flash = new THREE.Mesh(UNIT_DODECA, hot);
  flash.position.y = 1;
  flash.scale.setScalar(0.74 * scale);
  group.add(flash);
  const light = new THREE.PointLight(color, 6.2 * scale, 16 * scale, 2);
  light.position.y = 1.1;
  group.add(light);
  demo.scene.add(group);
  state.bursts.push({ group, materials, light, life: 0.4, maxLife: 0.4, rotationSpeed: 2.6 + ((position.x + position.z) % 5) * 0.12 });
}

function updateSpeedStreaks(demo: Phase18Demo, snapshot: CartArenaSessionSnapshot): void {
  const state = getState(demo);
  const speed = Math.abs(snapshot.speed);
  const strength = THREE.MathUtils.clamp((speed - 8) / 20, 0, 1);
  const active = snapshot.boostActive ? 1 : strength * 0.68;
  state.speedStreakMaterial.opacity = active * 0.54;
  state.speedStreaks.visible = active > 0.025;
  const positions = state.speedStreakGeometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < state.streakSeeds.length; index += 1) {
    const seed = state.streakSeeds[index];
    const pulse = (demo.elapsed * (snapshot.boostActive ? 2.8 : 1.45) + seed.phase) % 1;
    const spread = 0.88 + pulse * 0.55;
    const front = -0.52 - pulse * 2.8;
    const back = front - seed.length * (0.8 + active * 2.5);
    positions.setXYZ(index * 2, seed.x * spread, seed.y * spread, front);
    positions.setXYZ(index * 2 + 1, seed.x * spread * 1.34, seed.y * spread * 1.34, back);
  }
  positions.needsUpdate = true;
}

function updateHeroFx(demo: Phase18Demo, snapshot: CartArenaSessionSnapshot, delta: number): void {
  const state = getState(demo);
  const boost = snapshot.boostActive ? 1 : 0;
  const speed = THREE.MathUtils.clamp(Math.abs(snapshot.speed) / 24, 0, 1);
  for (let index = 0; index < state.heroGlowMaterials.length; index += 1) {
    const material = state.heroGlowMaterials[index];
    const target = index === 0 ? 0.54 + boost * 0.42 + speed * 0.12 : 0.5 + Math.abs(demo.steer) * 0.22;
    material.opacity += (target - material.opacity) * Math.min(1, delta * 10);
  }
  for (let index = 0; index < state.heroTurbines.length; index += 1) {
    state.heroTurbines[index].rotation.z += delta * (4.5 + speed * 12 + boost * 13) * (index % 2 === 0 ? 1 : -1);
  }
  if (state.heroRoot) {
    for (const child of state.heroRoot.children) {
      if (child.name === "phase18-hero-flame") {
        child.scale.y += (((snapshot.boostActive ? 1.45 : 0.52) + speed * 0.22) - child.scale.y) * Math.min(1, delta * 13);
        child.visible = speed > 0.08 || snapshot.boostActive;
      }
    }
  }
}

function updateEnemyFx(demo: Phase18Demo, delta: number): void {
  const state = getState(demo);
  for (const enemy of demo.session.enemies) {
    const fx = state.enemyFx.get(enemy.id);
    if (!fx) continue;
    const hp = Math.max(0, enemy.hp / Math.max(1, enemy.maxHp));
    const pulse = 0.5 + 0.5 * Math.sin(demo.elapsed * (enemy.archetype === "bomber" ? 12 : enemy.kind === "boss" ? 6.5 : 4.8) + enemy.x * 0.08);
    if (fx.glowMaterial) {
      const lowHpBoost = (1 - hp) * 0.18;
      fx.glowMaterial.opacity = Math.min(1, 0.55 + pulse * 0.22 + lowHpBoost);
    }
    if (fx.core) {
      fx.core.rotation.x += delta * (enemy.kind === "boss" ? 1.8 : 3.2);
      fx.core.rotation.y += delta * (enemy.kind === "boss" ? 2.6 : 4.3);
      const scale = enemy.archetype === "bomber" ? 0.92 + pulse * 0.18 : 0.96 + pulse * 0.08;
      fx.core.scale.setScalar(scale);
    }
    fx.rings.forEach((ring, index) => {
      ring.rotation.z += delta * (1.4 + index * 0.7) * (index % 2 === 0 ? 1 : -1);
      if (enemy.kind === "boss") ring.rotation.y += delta * (0.5 + index * 0.3);
    });
  }
}

function updateBursts(demo: Phase18Demo, delta: number): void {
  const state = getState(demo);
  for (let index = state.bursts.length - 1; index >= 0; index -= 1) {
    const burst = state.bursts[index];
    burst.life -= delta;
    const ratio = Math.max(0, burst.life / burst.maxLife);
    const progress = 1 - ratio;
    burst.group.scale.setScalar(1 + progress * 3.4);
    burst.group.rotation.y += delta * burst.rotationSpeed;
    burst.materials.forEach((material) => {
      if (material instanceof THREE.MeshBasicMaterial) material.opacity = ratio * ratio * 0.92;
    });
    burst.light.intensity = ratio * 6.2;
    if (burst.life > 0) continue;
    demo.scene.remove(burst.group);
    burst.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.geometry !== UNIT_BOX && object.geometry !== UNIT_OCTA && object.geometry !== UNIT_DODECA) object.geometry.dispose();
    });
    burst.materials.forEach((material) => material.dispose());
    state.bursts.splice(index, 1);
  }
}

function updateVisualOverdrive(demo: Phase18Demo, delta: number): void {
  const snapshot = demo.session.snapshot();
  updateSpeedStreaks(demo, snapshot);
  updateHeroFx(demo, snapshot, delta);
  updateEnemyFx(demo, delta);
  updateBursts(demo, delta);
  const state = getState(demo);
  const skylinePulse = 0.48 + Math.sin(demo.elapsed * 1.7) * 0.08;
  state.skylineGlowMaterials.forEach((material) => { material.opacity = skylinePulse; });
  const targetExposure = snapshot.boostActive ? 1.095 : 1.035;
  demo.renderer.toneMappingExposure += (targetExposure - demo.renderer.toneMappingExposure) * Math.min(1, delta * 5);
}

function applyOverdriveCamera(demo: Phase18Demo, snapshot: CartArenaSessionSnapshot): void {
  const speed = THREE.MathUtils.clamp(Math.abs(snapshot.speed) / 25, 0, 1);
  const boost = snapshot.boostActive ? 1 : 0;
  demo.camera.fov = Math.min(66, demo.camera.fov + speed * 0.65 + boost * 1.35);
  const rollTarget = -demo.steer * speed * (boost ? 0.018 : 0.011);
  demo.camera.rotation.z += (rollTarget - demo.camera.rotation.z) * 0.18;
  demo.camera.updateProjectionMatrix();
}

export function installCartRoguePhase18VisualOverdrive(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase18Demo;
  const originalBuildWorld = prototype.buildWorld;
  const originalBuildPlayer = prototype.buildPlayerVisual;
  const originalBuildEnemies = prototype.buildEnemies;
  const originalSpawnImpact = prototype.spawnImpact;
  const originalUpdate = prototype.updateVisuals;
  const originalCamera = prototype.applyCameraPresentation;

  prototype.buildWorld = function buildWorldPhase18(this: Phase18Demo): void {
    originalBuildWorld.call(this);
    buildOverdriveWorld(this);
  };

  prototype.buildPlayerVisual = function buildPlayerPhase18(this: Phase18Demo): void {
    originalBuildPlayer.call(this);
    addHeroOverdrive(this);
  };

  prototype.buildEnemies = function buildEnemiesPhase18(this: Phase18Demo, enemies: readonly CartEnemySnapshot[]): void {
    originalBuildEnemies.call(this, enemies);
    addEnemyOverdrive(this);
  };

  prototype.spawnImpact = function spawnImpactPhase18(this: Phase18Demo, position: THREE.Vector3, color: number, scale = 1): void {
    originalSpawnImpact.call(this, position, color, scale);
    spawnOverdriveImpact(this, position, color, scale);
  };

  prototype.updateVisuals = function updateVisualsPhase18(this: Phase18Demo, delta: number): void {
    originalUpdate.call(this, delta);
    addEnemyOverdrive(this);
    updateVisualOverdrive(this, delta);
  };

  prototype.applyCameraPresentation = function cameraPhase18(this: Phase18Demo, snapshot: CartArenaSessionSnapshot): void {
    originalCamera.call(this, snapshot);
    applyOverdriveCamera(this, snapshot);
  };
}

installCartRoguePhase18VisualOverdrive();

import * as THREE from "three";
import type { CartEnemySnapshot } from "./CartArenaSession";
import { CartArenaSession } from "./CartArenaSession";
import { getCartBatteryPerformanceSnapshot } from "./CartRoguePhase79PerformanceBattery";
import { getCartTurboHuntEventState } from "./CartRoguePhase81EventDirector2";
import {
  CART_RAID_HAZARD_MAX_ACTIVE,
  getCartRaidHazardState,
  type CartRaidHazardPublicState,
} from "./CartRoguePhase88RaidHazards";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { CART_TURBO_HUNT_FIELD } from "./CartTurboHuntTrack";

interface Phase107Demo {
  scene: THREE.Scene;
  session: CartArenaSession;
  playerVisual: THREE.Group;
  enemyGroups: Map<string, THREE.Group>;
  buildWorld(): void;
  buildPlayerVisual(): void;
  buildEnemies(enemies: readonly CartEnemySnapshot[]): void;
  updateVisuals(delta: number): void;
}

interface AoeCageSlot {
  root: THREE.Group;
  crown: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  pillars: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  pillarPositions: Float32Array;
}

interface Phase107VisualState {
  root: THREE.Group;
  worldRoot: THREE.Group;
  speedRoot: THREE.Group;
  speedLines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  speedPositions: Float32Array;
  aoeRoot: THREE.Group;
  aoeSlots: AoeCageSlot[];
  heroBlue: THREE.MeshStandardMaterial;
  heroRed: THREE.MeshStandardMaterial;
  heroDark: THREE.MeshStandardMaterial;
  heroGlow: THREE.MeshBasicMaterial;
  blockerMaterial: THREE.MeshStandardMaterial;
  chaserMaterial: THREE.MeshStandardMaterial;
  heavyMaterial: THREE.MeshStandardMaterial;
  bossMaterial: THREE.MeshStandardMaterial;
  worldMaterials: THREE.MeshStandardMaterial[];
  boxGeometry: THREE.BoxGeometry;
  finGeometry: THREE.ConeGeometry;
  ringGeometry: THREE.TorusGeometry;
  elapsed: number;
}

const stateByDemo = new WeakMap<object, Phase107VisualState>();
const CUTIN_OVERRIDE_ID = "cart-phase107-cutin-override";

export const CART_PHASE107_PRESENTATION_ID = "phase107-visual-hierarchy-arcade-v1";
export const CART_PHASE107_LANDMARK_COUNT = 5;
export const CART_PHASE107_FAR_PYLON_COUNT = 8;
export const CART_PHASE107_SPEED_STREAK_COUNT = 16;
export const CART_PHASE107_AOE_CAGE_SLOTS = CART_RAID_HAZARD_MAX_ACTIVE;
export const CART_PHASE107_REDUCED_FX_FRAME_MS = 20.5;

const COLOR_HERO_BLUE = 0x2477f2;
const COLOR_HERO_RED = 0xff4e57;
const COLOR_DARK = 0x172d55;
const COLOR_CHASER = 0x48d56c;
const COLOR_BLOCKER = 0xffc43a;
const COLOR_HEAVY = 0x8b61da;
const COLOR_BOSS = 0x5d3d91;
const COLOR_TRACKING = 0xff38d1;
const COLOR_LOCKED = 0xff173f;
const COLOR_IMMINENT = 0xffd343;
const COLOR_FIRED = 0xffffff;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function standardMaterial(color: number, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.86,
    metalness: 0.025,
    flatShading: true,
    emissive: emissive || 0x000000,
    emissiveIntensity: emissive ? 0.22 : 0,
    dithering: true,
  });
}

function additiveMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.castShadow = false;
  result.receiveShadow = false;
  return result;
}

function buildWorldPresentation(state: Phase107VisualState): void {
  if (state.worldRoot.children.length > 0) return;
  const field = CART_TURBO_HUNT_FIELD;
  const outsideX = field.halfWidth + 19;
  const outsideZ = field.halfDepth + 19;

  const landmarks = [
    { x: field.centerX - outsideX, z: field.centerZ - 38, color: 0, type: "loop" },
    { x: field.centerX + outsideX, z: field.centerZ + 28, color: 1, type: "tower" },
    { x: field.centerX - 34, z: field.centerZ - outsideZ, color: 2, type: "stack" },
    { x: field.centerX + 43, z: field.centerZ + outsideZ, color: 3, type: "mast" },
    { x: field.centerX + outsideX + 8, z: field.centerZ - outsideZ + 22, color: 4, type: "dome" },
  ] as const;

  const cylinder = new THREE.CylinderGeometry(1, 1.12, 1, 8);
  const torus = new THREE.TorusGeometry(1, 0.14, 6, 18);
  const sphere = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const cone = new THREE.ConeGeometry(1, 1, 7);

  for (let index = 0; index < landmarks.length; index += 1) {
    const spec = landmarks[index];
    const group = new THREE.Group();
    group.name = `phase107-mega-landmark-${index}-${spec.type}`;
    group.position.set(spec.x, 0, spec.z);
    group.userData.cartLandmarkRole = spec.type;
    const material = state.worldMaterials[spec.color];

    if (spec.type === "loop") {
      const arch = mesh(torus, material, `phase107-landmark-${index}-loop`);
      arch.position.y = 10.5;
      arch.rotation.y = Math.PI * 0.5;
      arch.scale.setScalar(7.8);
      const base = mesh(state.boxGeometry, material, `phase107-landmark-${index}-base`);
      base.position.y = 1.2;
      base.scale.set(8.4, 2.4, 3.2);
      group.add(arch, base);
    } else if (spec.type === "tower") {
      const body = mesh(cylinder, material, `phase107-landmark-${index}-body`);
      body.position.y = 12;
      body.scale.set(3.8, 24, 3.8);
      const crown = mesh(torus, state.heroGlow, `phase107-landmark-${index}-crown`);
      crown.position.y = 23.5;
      crown.rotation.x = Math.PI * 0.5;
      crown.scale.setScalar(3.9);
      group.add(body, crown);
    } else if (spec.type === "stack") {
      const body = mesh(cylinder, material, `phase107-landmark-${index}-stack`);
      body.position.y = 8.5;
      body.scale.set(5.8, 17, 5.8);
      const cap = mesh(torus, state.heroRed, `phase107-landmark-${index}-rim`);
      cap.position.y = 17.1;
      cap.rotation.x = Math.PI * 0.5;
      cap.scale.setScalar(5.3);
      group.add(body, cap);
    } else if (spec.type === "mast") {
      const mast = mesh(cylinder, material, `phase107-landmark-${index}-mast`);
      mast.position.y = 14;
      mast.scale.set(1.15, 28, 1.15);
      const signal = mesh(cone, state.heroRed, `phase107-landmark-${index}-signal`);
      signal.position.y = 28.8;
      signal.scale.set(2.5, 4.6, 2.5);
      const bar = mesh(state.boxGeometry, material, `phase107-landmark-${index}-bar`);
      bar.position.y = 20;
      bar.scale.set(8.5, 0.55, 0.55);
      group.add(mast, signal, bar);
    } else {
      const dome = mesh(sphere, material, `phase107-landmark-${index}-dome`);
      dome.position.y = 1.2;
      dome.scale.set(9.4, 8.1, 9.4);
      const beacon = mesh(cone, state.heroGlow, `phase107-landmark-${index}-beacon`);
      beacon.position.y = 10.5;
      beacon.scale.set(1.8, 5.5, 1.8);
      group.add(dome, beacon);
    }
    state.worldRoot.add(group);
  }

  const farGeometry = new THREE.CylinderGeometry(0.9, 1.6, 1, 6);
  const farMaterial = standardMaterial(0xa7d1dc);
  farMaterial.transparent = true;
  farMaterial.opacity = 0.48;
  const farPylons = new THREE.InstancedMesh(farGeometry, farMaterial, CART_PHASE107_FAR_PYLON_COUNT);
  farPylons.name = "phase107-far-depth-pylons";
  farPylons.castShadow = false;
  farPylons.receiveShadow = false;
  const dummy = new THREE.Object3D();
  const radiusX = field.halfWidth + 42;
  const radiusZ = field.halfDepth + 42;
  for (let index = 0; index < CART_PHASE107_FAR_PYLON_COUNT; index += 1) {
    const angle = (index / CART_PHASE107_FAR_PYLON_COUNT) * Math.PI * 2 + 0.31;
    const height = 10 + (index % 3) * 4.5;
    dummy.position.set(field.centerX + Math.cos(angle) * radiusX, height * 0.5, field.centerZ + Math.sin(angle) * radiusZ);
    dummy.scale.set(2.2 + (index % 2) * 0.8, height, 2.2 + (index % 2) * 0.8);
    dummy.rotation.y = angle;
    dummy.updateMatrix();
    farPylons.setMatrixAt(index, dummy.matrix);
  }
  farPylons.instanceMatrix.needsUpdate = true;
  state.worldRoot.add(farPylons);

  const sectorGeometry = new THREE.PlaneGeometry(18, 3.2);
  sectorGeometry.rotateX(-Math.PI / 2);
  const sectorMaterial = additiveMaterial(0x9de9ff, 0.16);
  const sectorMarkers = new THREE.InstancedMesh(sectorGeometry, sectorMaterial, 8);
  sectorMarkers.name = "phase107-macro-sector-markers";
  sectorMarkers.renderOrder = 2;
  for (let index = 0; index < 8; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const lane = Math.floor(index / 2) - 1.5;
    dummy.position.set(field.centerX + side * (field.halfWidth - 14), 0.019, field.centerZ + lane * 38);
    dummy.rotation.set(0, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    sectorMarkers.setMatrixAt(index, dummy.matrix);
  }
  sectorMarkers.instanceMatrix.needsUpdate = true;
  state.worldRoot.add(sectorMarkers);

  state.worldRoot.userData.cartLandmarkCount = CART_PHASE107_LANDMARK_COUNT;
  state.worldRoot.userData.cartFarDepthPylonCount = CART_PHASE107_FAR_PYLON_COUNT;
}

function buildSpeedPresentation(state: Phase107VisualState): void {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(CART_PHASE107_SPEED_STREAK_COUNT * 2 * 3);
  const attribute = new THREE.BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", attribute);
  const material = new THREE.LineBasicMaterial({
    color: 0xd8fbff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = "phase107-ground-speed-streaks";
  lines.frustumCulled = false;
  lines.renderOrder = 4;
  state.speedPositions = positions;
  state.speedLines = lines;
  state.speedRoot.add(lines);
}

function buildAoePresentation(state: Phase107VisualState): void {
  for (let index = 0; index < CART_PHASE107_AOE_CAGE_SLOTS; index += 1) {
    const root = new THREE.Group();
    root.name = `phase107-aoe-cage-${index}`;
    root.visible = false;

    const crown = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.09, 5, 20), additiveMaterial(COLOR_TRACKING, 0));
    crown.name = `phase107-aoe-crown-${index}`;
    crown.rotation.x = Math.PI / 2;
    crown.renderOrder = 9;

    const pillarPositions = new Float32Array(4 * 2 * 3);
    const pillarGeometry = new THREE.BufferGeometry();
    const pillarAttribute = new THREE.BufferAttribute(pillarPositions, 3);
    pillarAttribute.setUsage(THREE.DynamicDrawUsage);
    pillarGeometry.setAttribute("position", pillarAttribute);
    const pillars = new THREE.LineSegments(
      pillarGeometry,
      new THREE.LineBasicMaterial({
        color: COLOR_TRACKING,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    pillars.name = `phase107-aoe-pillars-${index}`;
    pillars.frustumCulled = false;
    pillars.renderOrder = 9;

    root.add(crown, pillars);
    state.aoeRoot.add(root);
    state.aoeSlots.push({ root, crown, pillars, pillarPositions });
  }
}

function stateFor(demo: Phase107Demo): Phase107VisualState {
  const key = demo as unknown as object;
  const existing = stateByDemo.get(key);
  if (existing) {
    if (!existing.root.parent) demo.scene.add(existing.root);
    return existing;
  }

  const root = new THREE.Group();
  root.name = "phase107-visual-hierarchy-root";
  root.userData.cartPresentationPhase = CART_PHASE107_PRESENTATION_ID;
  const worldRoot = new THREE.Group();
  worldRoot.name = "phase107-world-depth-root";
  const speedRoot = new THREE.Group();
  speedRoot.name = "phase107-speed-root";
  const aoeRoot = new THREE.Group();
  aoeRoot.name = "phase107-aoe-inworld-root";
  root.add(worldRoot, speedRoot, aoeRoot);
  demo.scene.add(root);

  const created = {
    root,
    worldRoot,
    speedRoot,
    speedLines: null as unknown as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>,
    speedPositions: new Float32Array(0),
    aoeRoot,
    aoeSlots: [],
    heroBlue: standardMaterial(COLOR_HERO_BLUE),
    heroRed: standardMaterial(COLOR_HERO_RED, COLOR_HERO_RED),
    heroDark: standardMaterial(COLOR_DARK),
    heroGlow: additiveMaterial(0x7defff, 0.72),
    blockerMaterial: standardMaterial(COLOR_BLOCKER),
    chaserMaterial: standardMaterial(COLOR_CHASER),
    heavyMaterial: standardMaterial(COLOR_HEAVY),
    bossMaterial: standardMaterial(COLOR_BOSS, 0x2a103f),
    worldMaterials: [
      standardMaterial(0x3bbbe9),
      standardMaterial(0xffcf59),
      standardMaterial(0xff7e85),
      standardMaterial(0x62d69d),
      standardMaterial(0x9a79e9),
    ],
    boxGeometry: new THREE.BoxGeometry(1, 1, 1),
    finGeometry: new THREE.ConeGeometry(1, 1, 5),
    ringGeometry: new THREE.TorusGeometry(1, 0.14, 5, 14),
    elapsed: 0,
  } satisfies Phase107VisualState;
  stateByDemo.set(key, created);
  buildWorldPresentation(created);
  buildSpeedPresentation(created);
  buildAoePresentation(created);
  return created;
}

function decorateHero(demo: Phase107Demo, state: Phase107VisualState): void {
  if (demo.playerVisual.getObjectByName("phase107-hero-silhouette")) return;
  const root = new THREE.Group();
  root.name = "phase107-hero-silhouette";
  root.userData.cartVisualRole = "HERO_SIGNATURE_REAR";

  const wing = mesh(state.boxGeometry, state.heroDark, "phase107-hero-rear-wing");
  wing.position.set(0, 1.58, -1.76);
  wing.scale.set(3.1, 0.15, 0.46);

  for (const side of [-1, 1] as const) {
    const fin = mesh(state.finGeometry, state.heroRed, `phase107-hero-fin-${side}`);
    fin.position.set(side * 1.42, 1.68, -1.64);
    fin.rotation.z = side * 0.24;
    fin.rotation.x = Math.PI * 0.5;
    fin.scale.set(0.34, 1.18, 0.34);
    root.add(fin);
  }

  const turbine = mesh(state.ringGeometry, state.heroGlow, "phase107-hero-turbine-ring");
  turbine.position.set(0, 0.78, -2.55);
  turbine.scale.setScalar(0.7);
  root.add(wing, turbine);
  demo.playerVisual.add(root);
}

function decorateEnemy(demo: Phase107Demo, state: Phase107VisualState, enemy: CartEnemySnapshot): void {
  const group = demo.enemyGroups.get(enemy.id);
  if (!group || group.getObjectByName(`phase107-enemy-silhouette-${enemy.id}`)) return;
  const root = new THREE.Group();
  root.name = `phase107-enemy-silhouette-${enemy.id}`;
  root.userData.enemyKind = enemy.kind;

  if (enemy.kind === "chaser") {
    for (const side of [-1, 1] as const) {
      const fin = mesh(state.finGeometry, state.chaserMaterial, `phase107-${enemy.id}-long-fin-${side}`);
      fin.position.set(side * enemy.radius * 0.9, 1.45, -enemy.radius * 1.34);
      fin.rotation.x = Math.PI * 0.5;
      fin.rotation.z = side * 0.18;
      fin.scale.set(0.34, 1.45, 0.34);
      root.add(fin);
    }
  } else if (enemy.kind === "heavy") {
    for (const side of [-1, 1] as const) {
      const shoulder = mesh(state.boxGeometry, state.heavyMaterial, `phase107-${enemy.id}-wide-shoulder-${side}`);
      shoulder.position.set(side * enemy.radius * 1.15, 1.08, -0.04);
      shoulder.scale.set(enemy.radius * 0.64, 0.62, enemy.radius * 1.0);
      root.add(shoulder);
    }
  } else if (enemy.kind === "boss") {
    const crown = mesh(state.ringGeometry, state.heroRed, `phase107-${enemy.id}-boss-crown`);
    crown.position.y = 3.15;
    crown.rotation.x = Math.PI * 0.5;
    crown.scale.setScalar(enemy.radius * 0.9);
    root.add(crown);
    for (const side of [-1, 1] as const) {
      const horn = mesh(state.finGeometry, state.bossMaterial, `phase107-${enemy.id}-boss-horn-${side}`);
      horn.position.set(side * enemy.radius * 0.86, 2.8, -0.1);
      horn.rotation.z = side * 0.38;
      horn.scale.set(0.52, 2.1, 0.52);
      root.add(horn);
    }
  } else {
    const bumper = mesh(state.boxGeometry, state.blockerMaterial, `phase107-${enemy.id}-broad-bumper`);
    bumper.position.set(0, 0.72, enemy.radius * 1.06);
    bumper.scale.set(enemy.radius * 1.35, 0.34, 0.42);
    root.add(bumper);
  }

  group.add(root);
}

function speedIntensity(demo: Phase107Demo): number {
  const car = demo.session.car;
  const events = getCartTurboHuntEventState(demo.session);
  const speedRatio = Math.abs(car.forwardVelocity) / Math.max(1, car.definition.maxSpeed);
  return clamp((speedRatio - 0.3) / 0.7 + (car.boostActive ? 0.34 : 0) + Math.min(0.18, events.eventChain * 0.012), 0, 1);
}

function updateSpeed(demo: Phase107Demo, state: Phase107VisualState, delta: number): void {
  const car = demo.session.car;
  const intensity = speedIntensity(demo);
  const performance = getCartBatteryPerformanceSnapshot(demo as unknown as CartRogueWebGLDemo);
  const reduced = performance.frameMsEma > CART_PHASE107_REDUCED_FX_FRAME_MS;
  state.speedRoot.visible = intensity > 0.035;
  state.speedRoot.position.set(car.position.x, 0, car.position.z);
  state.speedRoot.rotation.y = car.heading;
  state.elapsed += Math.max(0, delta);

  const activeCount = reduced ? 8 : CART_PHASE107_SPEED_STREAK_COUNT;
  const length = 2.4 + intensity * (car.boostActive ? 13.5 : 9.2);
  for (let index = 0; index < CART_PHASE107_SPEED_STREAK_COUNT; index += 1) {
    const offset = index * 6;
    if (index >= activeCount) {
      state.speedPositions.fill(0, offset, offset + 6);
      continue;
    }
    const side = index % 2 === 0 ? -1 : 1;
    const lane = Math.floor(index / 2) % 8;
    const x = side * (2.55 + lane * 0.76);
    const phase = (state.elapsed * (7.4 + intensity * 12.5) + index * 0.63) % 1;
    const frontZ = 7.5 - phase * 15;
    const y = 0.065 + (index % 3) * 0.018;
    state.speedPositions[offset] = x;
    state.speedPositions[offset + 1] = y;
    state.speedPositions[offset + 2] = frontZ;
    state.speedPositions[offset + 3] = x * 1.025;
    state.speedPositions[offset + 4] = y;
    state.speedPositions[offset + 5] = frontZ - length;
  }
  const position = state.speedLines.geometry.getAttribute("position") as THREE.BufferAttribute;
  position.needsUpdate = true;
  state.speedLines.material.opacity = intensity * (reduced ? 0.32 : 0.6);
  state.speedRoot.userData.cartSpeedIntensity = intensity;
  state.speedRoot.userData.cartReducedFx = reduced;
}

function hazardExtent(hazard: CartRaidHazardPublicState): { x: number; z: number } {
  if (hazard.kind === "LINE") return { x: Math.max(2.2, hazard.width * 0.48), z: Math.max(4, hazard.length * 0.48) };
  if (hazard.kind === "CROSS") return { x: Math.max(4, hazard.length * 0.34), z: Math.max(4, hazard.length * 0.34) };
  if (hazard.kind === "DONUT") return { x: Math.max(4, hazard.outerRadius), z: Math.max(4, hazard.outerRadius) };
  const radius = Math.max(4, hazard.radius || hazard.outerRadius || 8);
  return { x: radius, z: radius };
}

function phaseColor(hazard: CartRaidHazardPublicState): number {
  if (hazard.phase === "FIRED") return COLOR_FIRED;
  if (hazard.secondsToFire <= 0.35) return COLOR_IMMINENT;
  if (hazard.phase === "LOCKED") return COLOR_LOCKED;
  return COLOR_TRACKING;
}

function updateAoe(demo: Phase107Demo, state: Phase107VisualState, delta: number): void {
  const raid = getCartRaidHazardState(demo.session);
  for (let index = 0; index < CART_PHASE107_AOE_CAGE_SLOTS; index += 1) {
    const slot = state.aoeSlots[index];
    const hazard = raid.hazards[index];
    if (!hazard?.active) {
      slot.root.visible = false;
      continue;
    }
    slot.root.visible = true;
    slot.root.position.set(hazard.x, 0.1, hazard.z);
    slot.root.rotation.y = hazard.heading;
    const extent = hazardExtent(hazard);
    const height = hazard.phase === "FIRED" ? 5.8 : 3.4 + (1 - clamp(hazard.secondsToFire / Math.max(0.1, hazard.telegraphSeconds), 0, 1)) * 1.7;
    const color = phaseColor(hazard);
    slot.crown.position.y = height;
    slot.crown.scale.setScalar(clamp(Math.min(extent.x, extent.z) / 4.8, 0.72, 1.45));
    slot.crown.rotation.z += Math.max(0, delta) * (hazard.phase === "LOCKED" ? 2.8 : 1.45);
    slot.crown.material.color.setHex(color);
    slot.crown.material.opacity = hazard.phase === "FIRED" ? 0.82 : hazard.phase === "LOCKED" ? 0.56 : 0.38;

    const points = [
      [-extent.x, -extent.z],
      [extent.x, -extent.z],
      [extent.x, extent.z],
      [-extent.x, extent.z],
    ] as const;
    for (let pillar = 0; pillar < 4; pillar += 1) {
      const offset = pillar * 6;
      slot.pillarPositions[offset] = points[pillar][0];
      slot.pillarPositions[offset + 1] = 0;
      slot.pillarPositions[offset + 2] = points[pillar][1];
      slot.pillarPositions[offset + 3] = points[pillar][0] * 0.7;
      slot.pillarPositions[offset + 4] = height;
      slot.pillarPositions[offset + 5] = points[pillar][1] * 0.7;
    }
    const attribute = slot.pillars.geometry.getAttribute("position") as THREE.BufferAttribute;
    attribute.needsUpdate = true;
    slot.pillars.material.color.setHex(color);
    slot.pillars.material.opacity = hazard.phase === "FIRED" ? 0.78 : hazard.phase === "LOCKED" ? 0.48 : 0.27;
    slot.root.userData.cartHazardId = hazard.id;
    slot.root.userData.cartHazardKind = hazard.kind;
  }
}

function ensureCutinOverride(): void {
  if (typeof document === "undefined" || document.getElementById(CUTIN_OVERRIDE_ID)) return;
  const style = document.createElement("style");
  style.id = CUTIN_OVERRIDE_ID;
  style.textContent = `
#cart-anime-cutin-v1{top:max(calc(env(safe-area-inset-top) + 48px),48px)!important;width:min(34vw,318px)!important;height:clamp(92px,31vh,126px)!important;filter:drop-shadow(0 5px 9px rgba(22,37,67,.2))!important}
#cart-anime-cutin-v1 .cart-cutin-portrait{width:34%!important;min-width:82px!important}
#cart-anime-cutin-v1 .cart-cutin-copy{padding:9px 17px 8px 9px!important;gap:2px!important}
#cart-anime-cutin-v1[data-side="left"] .cart-cutin-copy{padding-left:17px!important;padding-right:8px!important}
#cart-anime-cutin-v1 .cart-cutin-speaker{font-size:clamp(9px,1.1vw,12px)!important}
#cart-anime-cutin-v1 .cart-cutin-line{font-size:clamp(14px,1.9vw,21px)!important;line-height:1.04!important}
#cart-anime-cutin-v1 .cart-cutin-expression{font-size:7px!important;padding:1px 5px!important}
@media(max-height:360px){#cart-anime-cutin-v1{top:max(calc(env(safe-area-inset-top) + 43px),43px)!important;width:min(32vw,278px)!important;height:86px!important}#cart-anime-cutin-v1 .cart-cutin-line{font-size:clamp(12px,1.65vw,17px)!important}#cart-anime-cutin-v1 .cart-cutin-expression{display:none!important}}
@media(max-width:650px){#cart-anime-cutin-v1{width:min(40vw,286px)!important}}
`;
  document.head.appendChild(style);
}

function installCutinHierarchyOverride(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("cart-anime-cutin", ensureCutinOverride);
  if (document.getElementById("cart-anime-cutin-v1")) ensureCutinOverride();
}

export function installCartRoguePhase107VisualHierarchyArcade(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase107Demo;
  const previousBuildWorld = prototype.buildWorld;
  prototype.buildWorld = function phase107VisualHierarchyBuildWorld(this: Phase107Demo): void {
    previousBuildWorld.call(this);
    const state = stateFor(this);
    if (!state.root.parent) this.scene.add(state.root);
  };

  const previousBuildPlayerVisual = prototype.buildPlayerVisual;
  prototype.buildPlayerVisual = function phase107VisualHierarchyBuildPlayer(this: Phase107Demo): void {
    previousBuildPlayerVisual.call(this);
    decorateHero(this, stateFor(this));
  };

  const previousBuildEnemies = prototype.buildEnemies;
  prototype.buildEnemies = function phase107VisualHierarchyBuildEnemies(
    this: Phase107Demo,
    enemies: readonly CartEnemySnapshot[],
  ): void {
    previousBuildEnemies.call(this, enemies);
    const state = stateFor(this);
    for (const enemy of enemies) decorateEnemy(this, state, enemy);
  };

  const previousUpdateVisuals = prototype.updateVisuals;
  prototype.updateVisuals = function phase107VisualHierarchyUpdate(this: Phase107Demo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    if (!isCartTurboHuntEnabled(this.session)) return;
    const state = stateFor(this);
    updateSpeed(this, state, delta);
    updateAoe(this, state, delta);
  };

  installCutinHierarchyOverride();
}

installCartRoguePhase107VisualHierarchyArcade();

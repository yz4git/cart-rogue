import * as THREE from "three";
import type { CartArenaSessionSnapshot } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_WORLD_GRAPH } from "./CartWorldGraph";

interface Phase24Session {
  snapshot(): CartArenaSessionSnapshot;
}

interface Phase24Demo {
  scene: THREE.Scene;
  playerVisual: THREE.Group;
  session: Phase24Session;
  steer: number;
  brake: boolean;
  elapsed: number;
  buildWorld(): void;
  buildPlayerVisual(): void;
  updateVisuals(delta: number): void;
}

interface Phase24State {
  root: THREE.Group;
  trailMesh: THREE.InstancedMesh;
  trailDummy: THREE.Object3D;
  trailCursor: number;
  lastTrailX: number;
  lastTrailZ: number;
  frontWheelParts: THREE.Mesh[];
  heroBaseY: number;
}

const states = new WeakMap<object, Phase24State>();
const TRAIL_CAPACITY = 128;
const TUFT_CAPACITY = 320;

export function cartGraphicTrailSpacing(speed: number, steering: number, braking: boolean): number {
  const speedRatio = THREE.MathUtils.clamp(Math.abs(speed) / 24, 0, 1);
  const action = Math.max(Math.abs(steering), braking ? 1 : 0);
  return THREE.MathUtils.lerp(1.05, 0.58, Math.max(speedRatio, action * 0.72));
}

function createState(demo: Phase24Demo): Phase24State {
  const root = new THREE.Group();
  root.name = "phase24-ground-motion";
  demo.scene.add(root);

  const trailMaterial = new THREE.MeshBasicMaterial({
    color: 0x5f5548,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const trailMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), trailMaterial, TRAIL_CAPACITY);
  trailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trailMesh.frustumCulled = false;
  const trailDummy = new THREE.Object3D();
  for (let index = 0; index < TRAIL_CAPACITY; index += 1) {
    trailDummy.position.set(0, -100, 0);
    trailDummy.scale.setScalar(0.001);
    trailDummy.updateMatrix();
    trailMesh.setMatrixAt(index, trailDummy.matrix);
  }
  trailMesh.instanceMatrix.needsUpdate = true;
  root.add(trailMesh);

  return {
    root,
    trailMesh,
    trailDummy,
    trailCursor: 0,
    lastTrailX: Number.NaN,
    lastTrailZ: Number.NaN,
    frontWheelParts: [],
    heroBaseY: demo.playerVisual.position.y,
  };
}

function state(demo: Phase24Demo): Phase24State {
  const key = demo as unknown as object;
  const current = states.get(key);
  if (current) return current;
  const created = createState(demo);
  states.set(key, created);
  return created;
}

function seeded(seed: number): number {
  const value = Math.sin(seed * 91.733 + 17.17) * 43758.5453123;
  return value - Math.floor(value);
}

function addShoulderDensity(demo: Phase24Demo): void {
  const root = state(demo).root;
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 0.82, 5), material, TUFT_CAPACITY);
  const dummy = new THREE.Object3D();
  const colors = [new THREE.Color(0x78b65a), new THREE.Color(0x9fd575), new THREE.Color(0xb7df82), new THREE.Color(0xc8b778)];
  let cursor = 0;

  for (let nodeIndex = 0; nodeIndex < CART_WORLD_GRAPH.nodes.length && cursor < TUFT_CAPACITY; nodeIndex += 1) {
    const node = CART_WORLD_GRAPH.nodes[nodeIndex];
    const count = node.kind === "corridor" ? 18 : 26;
    for (let index = 0; index < count && cursor < TUFT_CAPACITY; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const along = seeded(nodeIndex * 101 + index * 7.3);
      const offset = 2.35 + seeded(nodeIndex * 43 + index * 11.9) * 4.4;
      const x = node.rect.centerX + side * (node.rect.halfWidth + offset);
      const z = node.rect.centerZ + (along * 2 - 1) * node.rect.halfDepth * 0.98;
      const scale = 0.72 + seeded(nodeIndex * 71 + index * 5.1) * 0.95;
      dummy.position.set(x, 0.39 * scale, z);
      dummy.rotation.set(0, seeded(nodeIndex * 19 + index * 3.7) * Math.PI * 2, (seeded(index * 13.3) - 0.5) * 0.18);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(cursor, dummy.matrix);
      mesh.setColorAt(cursor, colors[(nodeIndex + index) % colors.length]);
      cursor += 1;
    }
  }

  mesh.count = cursor;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  root.add(mesh);
}

function cacheHeroParts(demo: Phase24Demo): void {
  const s = state(demo);
  s.heroBaseY = demo.playerVisual.position.y;
  s.frontWheelParts.length = 0;
  demo.playerVisual.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.CylinderGeometry)) return;
    if (object.position.z < 0.72 || Math.abs(object.position.x) < 0.7 || object.position.y > 1.25) return;
    s.frontWheelParts.push(object);
  });
}

function updateHeroMotion(demo: Phase24Demo, snapshot: CartArenaSessionSnapshot, delta: number): void {
  const s = state(demo);
  const speedRatio = THREE.MathUtils.clamp(Math.abs(snapshot.speed) / 24, 0, 1);
  const suspensionBob = Math.sin(demo.elapsed * (5.4 + speedRatio * 7.6)) * (0.008 + speedRatio * 0.018);
  const yTarget = s.heroBaseY + suspensionBob + (snapshot.boostActive ? -0.025 : 0);
  demo.playerVisual.position.y += (yTarget - demo.playerVisual.position.y) * Math.min(1, delta * 12);

  const rollTarget = -demo.steer * (0.055 + speedRatio * 0.065);
  const pitchTarget = demo.brake ? -0.058 : snapshot.boostActive ? 0.046 : -speedRatio * 0.012;
  demo.playerVisual.rotation.z += (rollTarget - demo.playerVisual.rotation.z) * Math.min(1, delta * 8.5);
  demo.playerVisual.rotation.x += (pitchTarget - demo.playerVisual.rotation.x) * Math.min(1, delta * 8.5);

  const steerAngle = demo.steer * 0.34;
  for (const wheel of s.frontWheelParts) {
    wheel.rotation.y += (steerAngle - wheel.rotation.y) * Math.min(1, delta * 14);
  }
}

function writeTireTracks(demo: Phase24Demo, snapshot: CartArenaSessionSnapshot): void {
  const s = state(demo);
  const activity = demo.brake || Math.abs(demo.steer) > 0.42 || snapshot.boostActive;
  if (!activity || Math.abs(snapshot.speed) < 4.8) {
    s.lastTrailX = snapshot.x;
    s.lastTrailZ = snapshot.z;
    return;
  }

  const dx = snapshot.x - s.lastTrailX;
  const dz = snapshot.z - s.lastTrailZ;
  const distance = Number.isFinite(s.lastTrailX) ? Math.hypot(dx, dz) : Number.POSITIVE_INFINITY;
  if (distance < cartGraphicTrailSpacing(snapshot.speed, demo.steer, demo.brake)) return;
  s.lastTrailX = snapshot.x;
  s.lastTrailZ = snapshot.z;

  const fx = Math.sin(snapshot.heading);
  const fz = Math.cos(snapshot.heading);
  const rx = Math.cos(snapshot.heading);
  const rz = -Math.sin(snapshot.heading);
  for (const lane of [-0.96, 0.96]) {
    const index = s.trailCursor;
    s.trailCursor = (s.trailCursor + 1) % TRAIL_CAPACITY;
    s.trailDummy.position.set(
      snapshot.x - fx * 1.18 + rx * lane,
      0.045,
      snapshot.z - fz * 1.18 + rz * lane,
    );
    s.trailDummy.rotation.set(0, snapshot.heading, 0);
    s.trailDummy.scale.set(0.27, 0.018, 0.92 + Math.min(0.38, Math.abs(snapshot.speed) * 0.012));
    s.trailDummy.updateMatrix();
    s.trailMesh.setMatrixAt(index, s.trailDummy.matrix);
  }
  s.trailMesh.instanceMatrix.needsUpdate = true;
}

export function installCartRoguePhase24GroundMotion(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase24Demo;
  const oldWorld = prototype.buildWorld;
  const oldPlayer = prototype.buildPlayerVisual;
  const oldUpdate = prototype.updateVisuals;

  prototype.buildWorld = function phase24World(this: Phase24Demo): void {
    oldWorld.call(this);
    addShoulderDensity(this);
  };

  prototype.buildPlayerVisual = function phase24Player(this: Phase24Demo): void {
    oldPlayer.call(this);
    cacheHeroParts(this);
  };

  prototype.updateVisuals = function phase24Update(this: Phase24Demo, delta: number): void {
    oldUpdate.call(this, delta);
    const snapshot = this.session.snapshot();
    updateHeroMotion(this, snapshot, delta);
    writeTireTracks(this, snapshot);
  };
}

installCartRoguePhase24GroundMotion();

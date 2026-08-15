import * as THREE from "three";
import type { CartArenaSessionSnapshot } from "./CartArenaSession";
import { cartGraphicStageForNode } from "./CartRoguePhase26StageIdentity";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase32Session {
  snapshot(): CartArenaSessionSnapshot;
}

interface Phase32Demo {
  camera: THREE.PerspectiveCamera;
  session: Phase32Session;
  elapsed: number;
  updateVisuals(delta: number): void;
}

interface Phase32State {
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  points: THREE.Points;
  positions: Float32Array;
  seeds: Float32Array;
}

const states = new WeakMap<object, Phase32State>();
const COUNT = 72;

export function cartNearCameraParticleStrength(speed: number, boost: boolean): number {
  const speedRatio = THREE.MathUtils.clamp((Math.abs(speed) - 4) / 20, 0, 1);
  return THREE.MathUtils.clamp(speedRatio * 0.72 + (boost ? 0.4 : 0), 0, 1);
}

function stageColor(nodeId: string): number {
  const stage = cartGraphicStageForNode(nodeId);
  if (stage === "orchard") return 0xffc1da;
  if (stage === "grove") return 0xbbe6bd;
  if (stage === "canyon") return 0xffc28a;
  if (stage === "boss") return 0xd5a7ff;
  return 0xeaf7d3;
}

function createState(demo: Phase32Demo): Phase32State {
  const key = demo as unknown as object;
  const existing = states.get(key);
  if (existing) return existing;
  const positions = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT * 4);
  for (let index = 0; index < COUNT; index += 1) {
    const a = index * 2.399963;
    const radius = 0.55 + (index % 9) * 0.12;
    seeds[index * 4] = Math.cos(a) * radius;
    seeds[index * 4 + 1] = Math.sin(a) * radius * 0.62;
    seeds[index * 4 + 2] = (index * 0.173) % 1;
    seeds[index * 4 + 3] = 0.5 + (index % 7) * 0.11;
    positions[index * 3] = 0;
    positions[index * 3 + 1] = 0;
    positions[index * 3 + 2] = -4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xeaf7d3,
    size: 0.035,
    transparent: true,
    opacity: 0,
    sizeAttenuation: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "phase32-near-camera-particles";
  points.frustumCulled = false;
  points.renderOrder = 997;
  demo.camera.add(points);
  const created = { geometry, material, points, positions, seeds };
  states.set(key, created);
  return created;
}

function updateParticles(demo: Phase32Demo): void {
  const s = createState(demo);
  const snapshot = demo.session.snapshot();
  const strength = cartNearCameraParticleStrength(snapshot.speed, snapshot.boostActive);
  s.material.opacity = strength * 0.58;
  s.material.size = 0.025 + strength * 0.055;
  s.material.color.lerp(new THREE.Color(stageColor(snapshot.nodeId)), 0.12);
  s.points.visible = strength > 0.025;
  if (!s.points.visible) return;

  for (let index = 0; index < COUNT; index += 1) {
    const baseX = s.seeds[index * 4];
    const baseY = s.seeds[index * 4 + 1];
    const phase = s.seeds[index * 4 + 2];
    const speedSeed = s.seeds[index * 4 + 3];
    const travel = (demo.elapsed * (0.8 + strength * 3.4) * speedSeed + phase) % 1;
    const depth = -0.65 - travel * (4.2 + strength * 2.6);
    const spread = 0.35 + travel * (1.05 + strength * 0.35);
    s.positions[index * 3] = baseX * spread + Math.sin(demo.elapsed * 0.7 + index) * 0.012;
    s.positions[index * 3 + 1] = baseY * spread + Math.cos(demo.elapsed * 0.55 + index * 0.4) * 0.01;
    s.positions[index * 3 + 2] = depth;
  }
  const attribute = s.geometry.getAttribute("position") as THREE.BufferAttribute;
  attribute.needsUpdate = true;
}

export function installCartRoguePhase32NearCameraParticles(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase32Demo;
  const oldUpdate = prototype.updateVisuals;
  prototype.updateVisuals = function phase32Update(this: Phase32Demo, delta: number): void {
    oldUpdate.call(this, delta);
    updateParticles(this);
  };
}

installCartRoguePhase32NearCameraParticles();

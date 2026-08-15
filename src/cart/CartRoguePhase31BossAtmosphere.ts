import * as THREE from "three";
import type { CartArenaSessionSnapshot } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase31Session {
  snapshot(): CartArenaSessionSnapshot;
}

interface Phase31Demo {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  session: Phase31Session;
  elapsed: number;
  buildWorld(): void;
  updateVisuals(delta: number): void;
}

interface Phase31State {
  root: THREE.Group;
  beams: THREE.Mesh[];
  pylons: THREE.Group[];
  lights: THREE.PointLight[];
  baseExposure: number;
  baseFogNear: number;
  baseFogFar: number;
}

const states = new WeakMap<object, Phase31State>();

export function cartBossAtmosphereStrength(nodeId: string, speed: number, boost: boolean): number {
  const zone = nodeId === "boss-01" ? 1 : nodeId === "corridor-02" ? 0.45 : nodeId.startsWith("route-04") ? 0.18 : 0;
  const motion = THREE.MathUtils.clamp(Math.abs(speed) / 24, 0, 1) * 0.12 + (boost ? 0.12 : 0);
  return THREE.MathUtils.clamp(zone + motion * zone, 0, 1);
}

function buildState(demo: Phase31Demo): Phase31State {
  const key = demo as unknown as object;
  const existing = states.get(key);
  if (existing) return existing;
  const root = new THREE.Group();
  root.name = "phase31-boss-atmosphere";
  demo.scene.add(root);
  const beams: THREE.Mesh[] = [];
  const pylons: THREE.Group[] = [];
  const lights: THREE.PointLight[] = [];
  const dark = new THREE.MeshStandardMaterial({ color: 0x40384a, roughness: 0.72, metalness: 0.12, flatShading: true });
  const glow = new THREE.MeshBasicMaterial({ color: 0xb97bff, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false });

  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index += 1) {
      const pylon = new THREE.Group();
      const x = side * (31 + index * 8);
      const z = 430 + index * 13;
      pylon.position.set(x, 0, z);
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.5, 16 + index * 4, 3.5), dark);
      body.position.y = (16 + index * 4) * 0.5;
      body.rotation.z = side * (0.03 + index * 0.015);
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.72, 10 + index * 3, 3.62), glow.clone());
      core.position.set(0, 8 + index * 2, -0.05);
      pylon.add(body, core);
      root.add(pylon);
      pylons.push(pylon);

      const light = new THREE.PointLight(index === 2 ? 0xff6f91 : 0xb36dff, 0, 34 + index * 6, 2);
      light.position.set(x, 8 + index * 3, z);
      demo.scene.add(light);
      lights.push(light);
    }
  }

  for (let index = 0; index < 5; index += 1) {
    const material = glow.clone();
    material.opacity = 0.13 + index * 0.02;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5 + index * 0.25, 4.2 + index * 0.4, 34, 8, 1, true), material);
    beam.position.set((index - 2) * 12, 17, 444 + (index % 2) * 7);
    beam.rotation.z = (index - 2) * 0.018;
    beam.visible = false;
    root.add(beam);
    beams.push(beam);
  }

  const fog = demo.scene.fog instanceof THREE.Fog ? demo.scene.fog : null;
  const created = {
    root,
    beams,
    pylons,
    lights,
    baseExposure: demo.renderer.toneMappingExposure,
    baseFogNear: fog?.near ?? 106,
    baseFogFar: fog?.far ?? 326,
  };
  states.set(key, created);
  return created;
}

function updateBossAtmosphere(demo: Phase31Demo, delta: number): void {
  const s = buildState(demo);
  const snapshot = demo.session.snapshot();
  const strength = cartBossAtmosphereStrength(snapshot.nodeId, snapshot.speed, snapshot.boostActive);
  const blend = 1 - Math.exp(-delta * 2.4);
  demo.renderer.toneMappingExposure += ((s.baseExposure + strength * 0.12) - demo.renderer.toneMappingExposure) * blend;

  if (demo.scene.fog instanceof THREE.Fog) {
    const nearTarget = THREE.MathUtils.lerp(s.baseFogNear, 58, strength);
    const farTarget = THREE.MathUtils.lerp(s.baseFogFar, 208, strength);
    demo.scene.fog.near += (nearTarget - demo.scene.fog.near) * blend;
    demo.scene.fog.far += (farTarget - demo.scene.fog.far) * blend;
  }

  s.beams.forEach((beam, index) => {
    beam.visible = strength > 0.16;
    if (!beam.visible) return;
    const material = beam.material as THREE.MeshBasicMaterial;
    material.opacity = (0.06 + strength * 0.16) * (0.78 + Math.sin(demo.elapsed * 1.3 + index) * 0.22);
    beam.rotation.y = demo.elapsed * (0.08 + index * 0.012);
    beam.scale.x = beam.scale.z = 0.94 + Math.sin(demo.elapsed * 1.7 + index * 0.6) * 0.06;
  });
  s.pylons.forEach((pylon, index) => {
    pylon.visible = strength > 0.05;
    pylon.rotation.y = Math.sin(demo.elapsed * 0.35 + index) * 0.015 * strength;
  });
  s.lights.forEach((light, index) => {
    light.intensity += (((0.4 + (index % 3) * 0.18) * strength * (1 + Math.sin(demo.elapsed * 3.2 + index) * 0.16)) - light.intensity) * blend;
  });
}

export function installCartRoguePhase31BossAtmosphere(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase31Demo;
  const oldWorld = prototype.buildWorld;
  const oldUpdate = prototype.updateVisuals;
  prototype.buildWorld = function phase31World(this: Phase31Demo): void {
    oldWorld.call(this);
    buildState(this);
  };
  prototype.updateVisuals = function phase31Update(this: Phase31Demo, delta: number): void {
    oldUpdate.call(this, delta);
    updateBossAtmosphere(this, delta);
  };
}

installCartRoguePhase31BossAtmosphere();

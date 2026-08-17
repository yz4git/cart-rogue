import * as THREE from "three";
import { CartArenaSession } from "./CartArenaSession";
import { getCartPerfectStrikeState } from "./CartRoguePhase61PerfectStrike";
import { getCartPerfectShockwaveState } from "./CartRoguePhase62PerfectShockwave";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase65VisualDemo {
  session: CartArenaSession;
  elapsed: number;
  boostLight: THREE.PointLight;
  cameraShake: number;
  buildPlayerVisual(): void;
  updateVisuals(delta: number): void;
  pause(): void;
}

interface PerfectVisualState {
  root: THREE.Group;
  perfectMaterial: THREE.MeshBasicMaterial;
  shockMaterial: THREE.MeshBasicMaterial;
  lastPerfectSerial: number;
  lastShockSerial: number;
  pulseLife: number;
  shockLife: number;
}

const states = new WeakMap<object, PerfectVisualState>();
const PERFECT_LIFE = 0.32;
const SHOCK_LIFE = 0.42;
const PERFECT_COLOR = 0xffe69a;
const SHOCK_COLOR = 0x91f2ff;

function buildPerfectFeedback(demo: Phase65VisualDemo): PerfectVisualState {
  const root = new THREE.Group();
  root.name = "phase65-perfect-combat-feedback";
  root.visible = false;
  root.position.set(0, 0.5, 1.35);

  const perfectMaterial = new THREE.MeshBasicMaterial({
    color: PERFECT_COLOR,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const shockMaterial = new THREE.MeshBasicMaterial({
    color: SHOCK_COLOR,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const frontRing = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.78, 20), perfectMaterial);
  frontRing.rotation.x = -Math.PI * 0.5;
  frontRing.position.z = 0.55;
  root.add(frontRing);

  const shockRing = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.02, 24), shockMaterial);
  shockRing.rotation.x = -Math.PI * 0.5;
  shockRing.position.y = -0.22;
  root.add(shockRing);

  const spokeGeometry = new THREE.BoxGeometry(0.075, 0.055, 1.35);
  for (let index = 0; index < 6; index += 1) {
    const spoke = new THREE.Mesh(spokeGeometry, perfectMaterial);
    const angle = (index / 6) * Math.PI * 2;
    spoke.rotation.y = angle;
    spoke.position.set(Math.sin(angle) * 0.48, 0.08, Math.cos(angle) * 0.48 + 0.5);
    root.add(spoke);
  }

  demo.session.car.group.add(root);
  return {
    root,
    perfectMaterial,
    shockMaterial,
    lastPerfectSerial: 0,
    lastShockSerial: 0,
    pulseLife: 0,
    shockLife: 0,
  };
}

function state(demo: Phase65VisualDemo): PerfectVisualState {
  const key = demo as unknown as object;
  const existing = states.get(key);
  if (existing) return existing;
  const created = buildPerfectFeedback(demo);
  states.set(key, created);
  return created;
}

function updatePerfectFeedback(demo: Phase65VisualDemo, delta: number): void {
  const visual = state(demo);
  const perfect = getCartPerfectStrikeState(demo.session);
  const shock = getCartPerfectShockwaveState(demo.session);
  if (perfect.perfectSerial !== visual.lastPerfectSerial) visual.pulseLife = PERFECT_LIFE;
  if (shock.shockSerial !== visual.lastShockSerial) visual.shockLife = SHOCK_LIFE;
  visual.lastPerfectSerial = perfect.perfectSerial;
  visual.lastShockSerial = shock.shockSerial;

  const safeDelta = Math.max(0, Math.min(0.05, delta));
  visual.pulseLife = Math.max(0, visual.pulseLife - safeDelta);
  visual.shockLife = Math.max(0, visual.shockLife - safeDelta);
  const perfectPulse = THREE.MathUtils.clamp(visual.pulseLife / PERFECT_LIFE, 0, 1);
  const shockPulse = THREE.MathUtils.clamp(visual.shockLife / SHOCK_LIFE, 0, 1);
  const intensity = Math.max(perfectPulse, shockPulse * 0.86);

  visual.root.userData.cartPerfectStrikeSerial = perfect.perfectSerial;
  visual.root.userData.cartPerfectShockSerial = shock.shockSerial;
  visual.root.userData.cartPerfectCombatIntensity = intensity;
  visual.root.visible = intensity > 0.02;
  if (!visual.root.visible) return;

  const expand = 0.7 + (1 - perfectPulse) * 0.62 + (1 - shockPulse) * 0.4;
  visual.root.scale.set(expand, 0.9 + intensity * 0.18, expand * (1.08 + perfectPulse * 0.22));
  visual.root.position.z = 1.25 + perfectPulse * 0.9;
  visual.root.rotation.y = Math.sin(demo.elapsed * 12) * intensity * 0.08;
  visual.perfectMaterial.opacity = THREE.MathUtils.clamp(perfectPulse * 0.72 + shockPulse * 0.18, 0, 0.78);
  visual.shockMaterial.opacity = THREE.MathUtils.clamp(shockPulse * 0.58, 0, 0.62);
  demo.boostLight.color.setHex(perfectPulse >= shockPulse ? PERFECT_COLOR : SHOCK_COLOR);
  demo.boostLight.intensity = Math.max(demo.boostLight.intensity, 1 + intensity * 2.5);
  demo.cameraShake = Math.max(demo.cameraShake, 0.08 + intensity * 0.16);
}

export function installCartRoguePhase65PerfectCombatVisual(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase65VisualDemo;
  const previousBuild = prototype.buildPlayerVisual;
  const previousUpdate = prototype.updateVisuals;
  const previousPause = prototype.pause;

  prototype.buildPlayerVisual = function phase65PerfectCombatVisualBuild(this: Phase65VisualDemo): void {
    previousBuild.call(this);
    state(this);
  };

  prototype.updateVisuals = function phase65PerfectCombatVisualUpdate(this: Phase65VisualDemo, delta: number): void {
    previousUpdate.call(this, delta);
    updatePerfectFeedback(this, delta);
  };

  prototype.pause = function phase65PerfectCombatVisualPause(this: Phase65VisualDemo): void {
    previousPause.call(this);
    const visual = states.get(this as unknown as object);
    if (visual) {
      visual.pulseLife = 0;
      visual.shockLife = 0;
      visual.root.visible = false;
    }
  };
}

installCartRoguePhase65PerfectCombatVisual();

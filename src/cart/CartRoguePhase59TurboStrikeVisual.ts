import * as THREE from "three";
import { CartArenaSession } from "./CartArenaSession";
import { getCartTurboStrikeState } from "./CartRoguePhase55TurboStrike";
import { getCartTurboSmashState } from "./CartRoguePhase56TurboSmash";
import { getCartFlowSurgeState, resetCartFlowSurge } from "./CartRoguePhase57FlowSurge";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase59VisualDemo {
  session: CartArenaSession;
  elapsed: number;
  boostLight: THREE.PointLight;
  cameraShake: number;
  buildPlayerVisual(): void;
  updateVisuals(delta: number): void;
  pause(): void;
}

interface TurboStrikeVisualState {
  root: THREE.Group;
  impactMaterial: THREE.MeshBasicMaterial;
  flowMaterial: THREE.MeshBasicMaterial;
  lastHitSerial: number;
  lastSmashSerial: number;
  pulseLife: number;
}

const states = new WeakMap<object, TurboStrikeVisualState>();
const IMPACT_LIFE = 0.24;
const ENEMY_COLOR = 0xfff0af;
const ROCK_COLOR = 0x74e6ff;
const FLOW_COLOR = 0x7af5d8;

function buildTurboStrikeFeedback(demo: Phase59VisualDemo): TurboStrikeVisualState {
  const root = new THREE.Group();
  root.name = "phase59-turbo-strike-feedback";
  root.visible = false;
  root.position.set(0, 0.22, 0.75);

  const impactMaterial = new THREE.MeshBasicMaterial({
    color: ENEMY_COLOR,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const flowMaterial = new THREE.MeshBasicMaterial({
    color: FLOW_COLOR,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 1.08, 24), impactMaterial);
  ring.rotation.x = -Math.PI * 0.5;
  root.add(ring);

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.055, 4, 24), flowMaterial);
  halo.rotation.x = Math.PI * 0.5;
  halo.position.y = 0.16;
  root.add(halo);

  const slashGeometry = new THREE.BoxGeometry(0.08, 0.07, 1.4);
  for (const side of [-1, 1] as const) {
    const slash = new THREE.Mesh(slashGeometry, impactMaterial);
    slash.position.set(side * 0.72, 0.16, 0.66);
    slash.rotation.y = side * 0.5;
    root.add(slash);
  }

  const state: TurboStrikeVisualState = {
    root,
    impactMaterial,
    flowMaterial,
    lastHitSerial: 0,
    lastSmashSerial: 0,
    pulseLife: 0,
  };
  demo.session.car.group.add(root);
  return state;
}

function state(demo: Phase59VisualDemo): TurboStrikeVisualState {
  const key = demo as unknown as object;
  const existing = states.get(key);
  if (existing) return existing;
  const created = buildTurboStrikeFeedback(demo);
  states.set(key, created);
  return created;
}

function updateTurboStrikeFeedback(demo: Phase59VisualDemo, delta: number): void {
  const visual = state(demo);
  const strike = getCartTurboStrikeState(demo.session);
  const smash = getCartTurboSmashState(demo.session);
  const flow = getCartFlowSurgeState(demo.session);
  const hitChanged = strike.hitSerial !== visual.lastHitSerial;
  const smashChanged = smash.smashSerial !== visual.lastSmashSerial;
  if (hitChanged || smashChanged) visual.pulseLife = IMPACT_LIFE;
  visual.lastHitSerial = strike.hitSerial;
  visual.lastSmashSerial = smash.smashSerial;
  visual.pulseLife = Math.max(0, visual.pulseLife - Math.max(0, Math.min(0.05, delta)));

  const pulse = THREE.MathUtils.clamp(visual.pulseLife / IMPACT_LIFE, 0, 1);
  const intensity = Math.max(pulse, flow.flow * 0.55);
  visual.root.userData.cartTurboStrikeHitSerial = strike.hitSerial;
  visual.root.userData.cartTurboSmashSerial = smash.smashSerial;
  visual.root.userData.cartFlowSurge = flow.flow;
  visual.root.userData.cartFlowChain = flow.chain;
  visual.root.visible = intensity > 0.025;
  if (!visual.root.visible) return;

  const pulseScale = 0.78 + (1 - pulse) * 0.88 + flow.flow * 0.24;
  visual.root.scale.set(pulseScale, 0.9 + intensity * 0.16, pulseScale * (1.05 + pulse * 0.34));
  visual.root.position.z = 0.65 + pulse * 1.15;
  visual.root.rotation.y = Math.sin(demo.elapsed * 7.5) * flow.flow * 0.08;

  const sourceColor = smashChanged || flow.lastSource === "rock"
    ? ROCK_COLOR
    : flow.lastSource === "mixed"
      ? FLOW_COLOR
      : ENEMY_COLOR;
  visual.impactMaterial.color.setHex(sourceColor);
  visual.impactMaterial.opacity = THREE.MathUtils.clamp(0.08 + pulse * 0.72 + flow.flow * 0.16, 0, 0.84);
  visual.flowMaterial.color.setHex(FLOW_COLOR);
  visual.flowMaterial.opacity = THREE.MathUtils.clamp(flow.flow * 0.44 + pulse * 0.18, 0, 0.58);

  demo.boostLight.intensity = Math.max(demo.boostLight.intensity, 0.65 + intensity * 2.2);
  if (pulse > 0.15) demo.cameraShake = Math.max(demo.cameraShake, 0.08 + pulse * 0.16);
}

export function installCartRoguePhase59TurboStrikeVisual(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase59VisualDemo;
  const previousBuild = prototype.buildPlayerVisual;
  const previousUpdate = prototype.updateVisuals;
  const previousPause = prototype.pause;

  prototype.buildPlayerVisual = function phase59TurboStrikeVisualBuild(this: Phase59VisualDemo): void {
    previousBuild.call(this);
    state(this);
  };

  prototype.updateVisuals = function phase59TurboStrikeVisualUpdate(this: Phase59VisualDemo, delta: number): void {
    previousUpdate.call(this, delta);
    updateTurboStrikeFeedback(this, delta);
  };

  prototype.pause = function phase59TurboStrikeVisualPause(this: Phase59VisualDemo): void {
    previousPause.call(this);
    resetCartFlowSurge(this.session);
    const visual = states.get(this as unknown as object);
    if (visual) {
      visual.pulseLife = 0;
      visual.root.visible = false;
    }
  };
}

installCartRoguePhase59TurboStrikeVisual();

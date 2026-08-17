import * as THREE from "three";
import { CartArenaSession } from "./CartArenaSession";
import { cancelCartTurboAttack, getCartTurboAttackState } from "./CartRoguePhase54TurboAttack";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase54VisualDemo {
  session: CartArenaSession;
  elapsed: number;
  boostLight: THREE.PointLight;
  cameraShake: number;
  buildPlayerVisual(): void;
  updateVisuals(delta: number): void;
  pause(): void;
}

interface AttackVisualState {
  root: THREE.Group;
  material: THREE.MeshBasicMaterial;
}

const states = new WeakMap<object, AttackVisualState>();
const CHARGE_COLOR = 0x56dcff;
const READY_COLOR = 0xeefcff;
const ATTACK_COLOR = 0xffe9a8;

function buildAttackFrame(demo: Phase54VisualDemo): AttackVisualState {
  const root = new THREE.Group();
  root.name = "phase54-turbo-attack-frame";
  root.visible = false;
  root.position.set(0, 0.52, 2.35);
  root.userData.cartTurboAttackObservedAttackSerial = 0;
  root.userData.cartTurboAttackPeakIntensity = 0;

  const material = new THREE.MeshBasicMaterial({
    color: CHARGE_COLOR,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const railGeometry = new THREE.BoxGeometry(0.12, 0.08, 1.45);
  const slashGeometry = new THREE.BoxGeometry(0.12, 0.08, 1.1);
  for (const side of [-1, 1] as const) {
    const rail = new THREE.Mesh(railGeometry, material);
    rail.position.set(side * 0.72, 0, 0.35);
    root.add(rail);

    const slash = new THREE.Mesh(slashGeometry, material);
    slash.position.set(side * 0.5, 0.04, 1.22);
    slash.rotation.y = side * 0.48;
    root.add(slash);
  }

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.0, 4), material);
  tip.rotation.x = Math.PI * 0.5;
  tip.position.set(0, 0.05, 1.88);
  root.add(tip);

  const cross = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.07, 0.12), material);
  cross.position.set(0, -0.03, 0.2);
  root.add(cross);

  demo.session.car.group.add(root);
  return { root, material };
}

function state(demo: Phase54VisualDemo): AttackVisualState {
  const key = demo as unknown as object;
  const existing = states.get(key);
  if (existing) return existing;
  const created = buildAttackFrame(demo);
  states.set(key, created);
  return created;
}

function updateAttackFrame(demo: Phase54VisualDemo): void {
  const visual = state(demo);
  const attack = getCartTurboAttackState(demo.session);
  visual.root.userData.cartTurboAttackMode = attack.mode;
  visual.root.userData.cartTurboAttackIntensity = attack.intensity;
  visual.root.userData.cartTurboAttackSerial = attack.serial;

  // Keep durable evidence that the WebGL presentation actually rendered an
  // attack frame. Headless Chrome can miss the short live envelope between
  // remote diagnostic polls, while this latch is written only from a real
  // visual update with attack mode active.
  if (attack.mode === "attack") {
    visual.root.userData.cartTurboAttackObservedAttackSerial = attack.serial;
    visual.root.userData.cartTurboAttackPeakIntensity = Math.max(
      Number(visual.root.userData.cartTurboAttackPeakIntensity) || 0,
      attack.intensity,
    );
  }

  if (attack.mode === "idle" || attack.intensity <= 0.01) {
    visual.root.visible = false;
    return;
  }

  visual.root.visible = true;
  const pulse = Math.sin(demo.elapsed * (attack.mode === "attack" ? 23 : 11)) * 0.035;
  const baseScale = 0.86 + attack.intensity * 0.25 + pulse;
  const forwardStretch = attack.mode === "attack" ? 1.35 + attack.intensity * 0.55 : 1 + attack.charge * 0.18;
  visual.root.scale.set(baseScale, baseScale, baseScale * forwardStretch);
  visual.root.position.z = attack.mode === "attack" ? 2.65 : 2.35;
  visual.root.rotation.z = attack.mode === "charging" ? Math.sin(demo.elapsed * 7) * 0.018 : 0;

  visual.material.color.setHex(
    attack.mode === "attack" ? ATTACK_COLOR : attack.mode === "ready" ? READY_COLOR : CHARGE_COLOR,
  );
  visual.material.opacity = THREE.MathUtils.clamp(0.18 + attack.intensity * 0.58, 0.18, 0.78);
  visual.material.needsUpdate = true;

  demo.boostLight.intensity = Math.max(demo.boostLight.intensity, 0.75 + attack.intensity * 2.4);
  demo.boostLight.color.setHex(attack.mode === "attack" ? ATTACK_COLOR : CHARGE_COLOR);
  if (attack.mode === "attack") demo.cameraShake = Math.max(demo.cameraShake, 0.1 + attack.intensity * 0.1);
}

export function installCartTurboAttackVisual(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase54VisualDemo;
  const previousBuild = prototype.buildPlayerVisual;
  const previousUpdate = prototype.updateVisuals;
  const previousPause = prototype.pause;

  prototype.buildPlayerVisual = function phase54AttackVisualBuild(this: Phase54VisualDemo): void {
    previousBuild.call(this);
    state(this);
  };

  prototype.updateVisuals = function phase54AttackVisualUpdate(this: Phase54VisualDemo, delta: number): void {
    previousUpdate.call(this, delta);
    updateAttackFrame(this);
  };

  prototype.pause = function phase54AttackVisualPause(this: Phase54VisualDemo): void {
    previousPause.call(this);
    cancelCartTurboAttack(this.session);
    const visual = states.get(this as unknown as object);
    if (visual) visual.root.visible = false;
  };
}

installCartTurboAttackVisual();

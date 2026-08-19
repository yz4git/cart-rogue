import * as THREE from "three";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase88AlignmentDemo {
  scene: THREE.Scene;
  updateVisuals(delta: number): void;
}

interface SlotPresentationState {
  initialized: boolean;
  wasVisible: boolean;
  lastX: number;
  lastZ: number;
  lastHeading: number;
  retargetHoldSeconds: number;
  lockSettleSeconds: number;
  wasRetargeting: boolean;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
}

interface AoePresentationState {
  root: THREE.Group;
  retargetMaterial: THREE.MeshBasicMaterial;
  slots: SlotPresentationState[];
}

const upgradedWarningMaterials = new WeakSet<THREE.Material>();
const presentationByDemo = new WeakMap<object, AoePresentationState>();

export const CART_AOE_TRACKING_COLOR = 0xff38d1;
export const CART_AOE_LOCKED_COLOR = 0xff1200;
export const CART_AOE_IMMINENT_COLOR = 0xffd000;
export const CART_AOE_FIRE_COLOR = 0xffffff;
export const CART_AOE_RETARGET_POSITION_EPSILON = 0.08;
export const CART_AOE_RETARGET_ANGLE_EPSILON = 0.012;
export const CART_AOE_RETARGET_HOLD_SECONDS = 0.12;
export const CART_AOE_LOCK_SETTLE_SECONDS = 0.16;
export const CART_AOE_RETARGET_RING_SECONDS = 0.18;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function angleDistance(a: number, b: number): number {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta);
}

export function cartAoeRetargetMoved(
  previous: { x: number; z: number; heading: number },
  current: { x: number; z: number; heading: number },
): boolean {
  return Math.hypot(current.x - previous.x, current.z - previous.z) > CART_AOE_RETARGET_POSITION_EPSILON
    || angleDistance(current.heading, previous.heading) > CART_AOE_RETARGET_ANGLE_EPSILON;
}

function upgradeWarningMaterial(material: THREE.MeshBasicMaterial): void {
  if (upgradedWarningMaterials.has(material)) return;
  const hex = material.color.getHex();
  if (hex === 0xff1238) {
    // TRACKING is deliberately not red: a moving magenta warning reads as an
    // active targeting sweep instead of a supposedly final danger footprint.
    material.color.setHex(CART_AOE_TRACKING_COLOR);
    material.opacity = 0.62;
  } else if (hex === 0xff2416) {
    material.color.setHex(CART_AOE_LOCKED_COLOR);
    material.opacity = 0.74;
  } else if (hex === 0xffb000) {
    material.color.setHex(CART_AOE_IMMINENT_COLOR);
    material.opacity = 0.84;
  } else if (hex === CART_AOE_FIRE_COLOR) {
    material.opacity = 0.94;
  }
  material.needsUpdate = true;
  upgradedWarningMaterials.add(material);
}

function enforceHighContrastWarningMaterials(scene: THREE.Scene): void {
  const root = scene.getObjectByName("phase88-raid-hazard-root");
  if (!root) return;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshBasicMaterial)) return;
    upgradeWarningMaterial(object.material);
  });
  root.userData.highContrastWarning = true;
  root.userData.warningPalette = "tracking-magenta-lock-red-amber-white";
  root.userData.retargetAnimation = "pulse-ring-lock-settle";
}

function retargetMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: CART_AOE_TRACKING_COLOR,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function retargetRing(index: number): SlotPresentationState["ring"] {
  // The missing quarter of the ring makes heading changes visible as the arc
  // rotates toward the new target angle. Geometry/material counts stay fixed.
  const geometry = new THREE.RingGeometry(0.76, 1, 32, 1, 0, Math.PI * 1.5);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: CART_AOE_TRACKING_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(geometry, material);
  ring.name = `phase88-aoe-retarget-ring-${index}`;
  ring.position.y = 0.066;
  ring.renderOrder = 14;
  ring.visible = false;
  return ring;
}

function presentationFor(demo: Phase88AlignmentDemo): AoePresentationState {
  const key = demo as unknown as object;
  const existing = presentationByDemo.get(key);
  if (existing) return existing;

  const root = new THREE.Group();
  root.name = "phase88-aoe-retarget-presentation";
  const slots = Array.from({ length: 4 }, (_, index): SlotPresentationState => {
    const ring = retargetRing(index);
    root.add(ring);
    return {
      initialized: false,
      wasVisible: false,
      lastX: 0,
      lastZ: 0,
      lastHeading: 0,
      retargetHoldSeconds: 0,
      lockSettleSeconds: 0,
      wasRetargeting: false,
      ring,
    };
  });
  demo.scene.add(root);
  const created = { root, retargetMaterial: retargetMaterial(), slots };
  presentationByDemo.set(key, created);
  return created;
}

function visibleHazardMeshes(scene: THREE.Scene, index: number): THREE.Mesh[] {
  const names = [
    `phase88-hazard-line-${index}`,
    `phase88-hazard-circle-${index}`,
    `phase88-hazard-cross-a-${index}`,
    `phase88-hazard-cross-b-${index}`,
    `phase88-hazard-cone-${index}`,
    `phase88-hazard-donut-${index}`,
  ];
  const meshes: THREE.Mesh[] = [];
  for (const name of names) {
    const object = scene.getObjectByName(name);
    if (object instanceof THREE.Mesh && object.visible) meshes.push(object);
  }
  return meshes;
}

function isLockedMaterial(mesh: THREE.Mesh): boolean {
  return mesh.material instanceof THREE.MeshBasicMaterial
    && mesh.material.color.getHex() === CART_AOE_LOCKED_COLOR;
}

function isTrackingMaterial(mesh: THREE.Mesh): boolean {
  return mesh.material instanceof THREE.MeshBasicMaterial
    && mesh.material.color.getHex() === CART_AOE_TRACKING_COLOR;
}

function applyScalePulse(meshes: THREE.Mesh[], multiplier: number): void {
  for (const mesh of meshes) mesh.scale.multiplyScalar(multiplier);
}

function updateRetargetRing(
  state: SlotPresentationState,
  anchor: THREE.Mesh,
  retargeting: boolean,
  delta: number,
): void {
  const ring = state.ring;
  const extent = clamp(Math.max(Math.abs(anchor.scale.x), Math.abs(anchor.scale.z)) * 0.34, 3.5, 12);
  ring.position.x = anchor.position.x;
  ring.position.z = anchor.position.z;
  ring.rotation.y = anchor.rotation.y;

  if (retargeting) {
    ring.userData.life = CART_AOE_RETARGET_RING_SECONDS;
    ring.material.color.setHex(CART_AOE_TRACKING_COLOR);
  } else if (state.lockSettleSeconds > 0) {
    ring.userData.life = Math.max(Number(ring.userData.life) || 0, state.lockSettleSeconds);
    ring.material.color.setHex(CART_AOE_LOCKED_COLOR);
  } else {
    ring.userData.life = Math.max(0, (Number(ring.userData.life) || 0) - delta);
  }

  const life = Math.max(0, Number(ring.userData.life) || 0);
  ring.visible = life > 0;
  if (!ring.visible) return;
  if (!retargeting && state.lockSettleSeconds <= 0) ring.userData.life = Math.max(0, life - delta);

  const normalized = clamp(life / CART_AOE_RETARGET_RING_SECONDS, 0, 1);
  const scale = extent * (0.96 + normalized * 0.5);
  ring.scale.set(scale, 1, scale);
  ring.material.opacity = retargeting
    ? 0.28 + normalized * 0.48
    : 0.18 + clamp(state.lockSettleSeconds / CART_AOE_LOCK_SETTLE_SECONDS, 0, 1) * 0.42;
}

function updateSlotPresentation(
  demo: Phase88AlignmentDemo,
  presentation: AoePresentationState,
  index: number,
  delta: number,
  now: number,
): void {
  const state = presentation.slots[index];
  const meshes = visibleHazardMeshes(demo.scene, index);
  const anchor = meshes[0];
  if (!anchor) {
    state.wasVisible = false;
    state.retargetHoldSeconds = 0;
    state.lockSettleSeconds = 0;
    state.wasRetargeting = false;
    state.ring.visible = false;
    return;
  }

  const current = { x: anchor.position.x, z: anchor.position.z, heading: anchor.rotation.y };
  const moved = state.initialized && state.wasVisible && cartAoeRetargetMoved(
    { x: state.lastX, z: state.lastZ, heading: state.lastHeading },
    current,
  );
  const authoredTracking = isTrackingMaterial(anchor);
  const lockedButMoving = isLockedMaterial(anchor) && moved;

  if (authoredTracking || lockedButMoving) state.retargetHoldSeconds = CART_AOE_RETARGET_HOLD_SECONDS;
  else state.retargetHoldSeconds = Math.max(0, state.retargetHoldSeconds - delta);
  const retargeting = authoredTracking || state.retargetHoldSeconds > 0;

  if (state.wasRetargeting && !retargeting && isLockedMaterial(anchor)) {
    state.lockSettleSeconds = CART_AOE_LOCK_SETTLE_SECONDS;
  } else {
    state.lockSettleSeconds = Math.max(0, state.lockSettleSeconds - delta);
  }

  if (retargeting) {
    // Phase93 deliberately re-aims some LOCKED intercepts. Painting that motion
    // magenta plus a bounded pulse makes the coordinate/angle change read as a
    // targeting sweep rather than a rendering jump. The mesh stays on the real
    // gameplay hitbox; only presentation changes, so warning accuracy is exact.
    for (const mesh of meshes) mesh.material = presentation.retargetMaterial;
    const pulse = 1 + Math.sin(now * 0.024) * 0.055;
    applyScalePulse(meshes, pulse);
  } else if (state.lockSettleSeconds > 0 && isLockedMaterial(anchor)) {
    const settle = clamp(state.lockSettleSeconds / CART_AOE_LOCK_SETTLE_SECONDS, 0, 1);
    applyScalePulse(meshes, 1 + settle * 0.095);
  }

  updateRetargetRing(state, anchor, retargeting, delta);

  state.initialized = true;
  state.wasVisible = true;
  state.wasRetargeting = retargeting;
  state.lastX = current.x;
  state.lastZ = current.z;
  state.lastHeading = current.heading;
}

/**
 * CircleGeometry sectors are authored around local +X while gameplay heading 0
 * points toward world +Z. Apply the fixed quarter-turn after Phase88 updates
 * its pooled cone meshes so the visible warning exactly matches hit testing.
 *
 * TRACKING/re-aim is magenta and animated, LOCKED is red and stationary,
 * IMMINENT is amber, and FIRED is white. Phase93's deliberate coordinate or
 * angle retarget therefore reads as a visible targeting action instead of a
 * broken teleport while the actual gameplay footprint remains exact.
 */
export function installCartRoguePhase88RaidHazardVisualAlignment(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase88AlignmentDemo;
  const previousUpdateVisuals = prototype.updateVisuals;
  prototype.updateVisuals = function phase88RaidHazardVisualAlignment(this: Phase88AlignmentDemo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    enforceHighContrastWarningMaterials(this.scene);
    for (let index = 0; index < 4; index += 1) {
      const cone = this.scene.getObjectByName(`phase88-hazard-cone-${index}`);
      if (!cone?.visible) continue;
      cone.rotation.y -= Math.PI / 2;
    }

    const presentation = presentationFor(this);
    const safeDelta = clamp(delta, 0, 0.05);
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    for (let index = 0; index < presentation.slots.length; index += 1) {
      updateSlotPresentation(this, presentation, index, safeDelta, now);
    }
    presentation.root.userData.palette = "TRACKING_MAGENTA_LOCK_RED_IMMINENT_AMBER_FIRE_WHITE";
    presentation.root.userData.fixedRetargetFxSlots = 4;
  };
}

installCartRoguePhase88RaidHazardVisualAlignment();

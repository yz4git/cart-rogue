import * as THREE from "three";
import { CartArenaSession } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { getCartBatteryPerformanceSnapshot } from "./CartRoguePhase79PerformanceBattery";
import { getCartTurboAttackState } from "./CartRoguePhase54TurboAttack";
import { getCartTurboStrikeState } from "./CartRoguePhase55TurboStrike";
import { getCartPerfectStrikeState } from "./CartRoguePhase61PerfectStrike";
import {
  CART_RAID_HAZARD_MAX_ACTIVE,
  getCartRaidHazardState,
  type CartRaidHazardPhase,
  type CartRaidHazardPublicState,
} from "./CartRoguePhase88RaidHazards";
import { getCartTitanBossState } from "./CartRoguePhase83Boss2";
import { getCartPlayerDamageFeedbackState } from "./CartRoguePhase91DamageFeedback2";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";

export const CART_PHASE104_AOE_FX_SLOTS = CART_RAID_HAZARD_MAX_ACTIVE;
export const CART_PHASE104_SEGMENTS_PER_AOE = 4;
export const CART_PHASE104_REDUCED_FX_FRAME_MS = 20.5;
export const CART_PHASE104_FIRE_PULSE_SECONDS = 0.34;
export const CART_PHASE104_GHOST_SECONDS = 0.14;
export const CART_PHASE104_LOCK_PULSE_SECONDS = 0.2;
export const CART_PHASE104_PRESENTATION_ID = "phase104-impact-aoe-overhaul";

const PATCHED_KEY = "__cartRoguePhase104ImpactAoeOverhaulPatched__";
const COLOR_TRACKING = 0xff38d1;
const COLOR_LOCKED = 0xff173f;
const COLOR_IMMINENT = 0xffc928;
const COLOR_FIRE = 0xffffff;
const COLOR_TURBO = 0x51e5ff;
const COLOR_TURBO_CORE = 0xe8fcff;
const COLOR_PERFECT = 0x7fffd7;
const COLOR_PERFECT_GOLD = 0xffe36d;
const COLOR_DAMAGE = 0xff3154;
const COLOR_BOSS = 0xff5a9d;

interface Phase104Demo {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  session: CartArenaSession;
  enemyGroups: Map<string, THREE.Group>;
  cameraShake: number;
  cameraRoll: number;
  impactFlash: number;
  impactOverlayMaterial: THREE.MeshBasicMaterial;
  renderer: THREE.WebGLRenderer;
  buildWorld(): void;
  updateVisuals(delta: number): void;
  emitImpactSparks(position: THREE.Vector3, count: number): void;
}

interface AoeFxSlot {
  root: THREE.Group;
  segments: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[];
  countdown: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  core: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  locatorBeam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  impactBeam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  shockwave: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  ghostRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  trail: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  trailPositions: Float32Array;
  hazardId: number | null;
  previousPhase: CartRaidHazardPhase | null;
  previousX: number;
  previousZ: number;
  initialized: boolean;
  lockPulse: number;
  firePulse: number;
  ghostLife: number;
  lastExtent: number;
}

interface GlobalFxState {
  root: THREE.Group;
  aoeRoot: THREE.Group;
  playerRoot: THREE.Group;
  impactRoot: THREE.Group;
  bossBurstRoot: THREE.Group;
  aoeSlots: AoeFxSlot[];
  turboRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  turboJetLeft: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  turboJetRight: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  turboCoreLeft: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  turboCoreRight: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  playerShockwave: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  hitRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  hitCore: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  bossRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  overlay: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  lastTurboSerial: number;
  lastStrikeSerial: number;
  lastPerfectStrikeSerial: number;
  lastRaidPerfectSerial: number;
  lastRaidHitSerial: number;
  lastBossStageSerial: number;
  turboReleasePulse: number;
  strikePulse: number;
  perfectPulse: number;
  damagePulse: number;
  bossPulse: number;
  aoeScreenPulse: number;
  elapsed: number;
}

const stateByDemo = new WeakMap<object, GlobalFxState>();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function saturate(value: number): number {
  return clamp(value, 0, 1);
}

export function cartPhase104AoeUrgency(secondsToFire: number, telegraphSeconds: number): number {
  const total = Math.max(0.001, telegraphSeconds);
  return saturate(1 - Math.max(0, secondsToFire) / total);
}

export function cartPhase104AoeExtent(hazard: Pick<CartRaidHazardPublicState, "kind" | "width" | "length" | "radius" | "outerRadius">): number {
  if (hazard.kind === "CIRCLE") return clamp(hazard.radius, 3, 15);
  if (hazard.kind === "DONUT") return clamp(hazard.outerRadius, 4, 17);
  if (hazard.kind === "CONE") return clamp(hazard.radius * 0.62, 4, 14);
  if (hazard.kind === "CROSS") return clamp(Math.max(hazard.width * 0.9, hazard.length * 0.24), 4, 13);
  return clamp(Math.max(hazard.width * 0.9, hazard.length * 0.24), 3.5, 12);
}

export function cartPhase104FxQuality(frameMsEma: number): "full" | "reduced" {
  return frameMsEma > CART_PHASE104_REDUCED_FX_FRAME_MS ? "reduced" : "full";
}

export function cartPhase104AoeCameraKick(distance: number, extent: number): number {
  const near = saturate(1 - Math.max(0, distance - extent * 0.35) / Math.max(12, extent * 2.5));
  return 0.055 + near * 0.24;
}

function additiveMaterial(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function horizontalRing(inner = 0.84, outer = 1, segments = 48, thetaLength = Math.PI * 2): THREE.RingGeometry {
  const geometry = new THREE.RingGeometry(inner, outer, segments, 1, 0, thetaLength);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function horizontalDisc(segments = 40): THREE.CircleGeometry {
  const geometry = new THREE.CircleGeometry(1, segments);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function createAoeSlot(index: number): AoeFxSlot {
  const root = new THREE.Group();
  root.name = `phase104-aoe-fx-slot-${index}`;
  root.visible = false;

  const segments: AoeFxSlot["segments"] = [];
  const segmentGeometry = horizontalRing(0.84, 1, 14, Math.PI * 0.31);
  for (let segmentIndex = 0; segmentIndex < CART_PHASE104_SEGMENTS_PER_AOE; segmentIndex += 1) {
    const segment = new THREE.Mesh(segmentGeometry, additiveMaterial(COLOR_TRACKING, 0));
    segment.name = `phase104-aoe-segment-${index}-${segmentIndex}`;
    segment.rotation.y = segmentIndex * Math.PI * 0.5;
    segment.position.y = 0.082;
    segment.renderOrder = 16;
    segments.push(segment);
    root.add(segment);
  }

  const countdown = new THREE.Mesh(horizontalRing(0.91, 1, 48), additiveMaterial(COLOR_LOCKED, 0));
  countdown.name = `phase104-aoe-countdown-${index}`;
  countdown.position.y = 0.088;
  countdown.renderOrder = 17;

  const core = new THREE.Mesh(horizontalDisc(36), additiveMaterial(COLOR_TRACKING, 0));
  core.name = `phase104-aoe-core-${index}`;
  core.position.y = 0.075;
  core.renderOrder = 15;

  const locatorBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.52, 1, 12, 1, true),
    additiveMaterial(COLOR_TRACKING, 0),
  );
  locatorBeam.name = `phase104-aoe-locator-beam-${index}`;
  locatorBeam.renderOrder = 13;

  const impactBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.86, 1, 14, 1, true),
    additiveMaterial(COLOR_FIRE, 0),
  );
  impactBeam.name = `phase104-aoe-impact-beam-${index}`;
  impactBeam.renderOrder = 18;

  const shockwave = new THREE.Mesh(horizontalRing(0.83, 1, 48), additiveMaterial(COLOR_FIRE, 0));
  shockwave.name = `phase104-aoe-shockwave-${index}`;
  shockwave.position.y = 0.115;
  shockwave.renderOrder = 19;

  const ghostRing = new THREE.Mesh(horizontalRing(0.88, 1, 36), additiveMaterial(COLOR_TRACKING, 0));
  ghostRing.name = `phase104-aoe-tracking-ghost-${index}`;
  ghostRing.position.y = 0.07;
  ghostRing.renderOrder = 13;

  const trailPositions = new Float32Array(6);
  const trailGeometry = new THREE.BufferGeometry();
  const trailAttribute = new THREE.BufferAttribute(trailPositions, 3);
  trailAttribute.setUsage(THREE.DynamicDrawUsage);
  trailGeometry.setAttribute("position", trailAttribute);
  const trail = new THREE.Line(
    trailGeometry,
    new THREE.LineBasicMaterial({
      color: COLOR_TRACKING,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    }),
  );
  trail.name = `phase104-aoe-tracking-trail-${index}`;
  trail.position.y = 0.1;
  trail.renderOrder = 15;

  root.add(countdown, core, locatorBeam, impactBeam, shockwave, ghostRing, trail);
  return {
    root,
    segments,
    countdown,
    core,
    locatorBeam,
    impactBeam,
    shockwave,
    ghostRing,
    trail,
    trailPositions,
    hazardId: null,
    previousPhase: null,
    previousX: 0,
    previousZ: 0,
    initialized: false,
    lockPulse: 0,
    firePulse: 0,
    ghostLife: 0,
    lastExtent: 5,
  };
}

function createOverlay(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(COLOR_FIRE) },
      uOpacity: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        vec2 p = abs(vUv - 0.5) * 2.0;
        float edge = smoothstep(0.36, 1.0, max(p.x, p.y));
        float corners = smoothstep(0.48, 1.22, length(p));
        float alpha = clamp(max(edge * 0.78, corners * 0.46), 0.0, 1.0) * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  overlay.name = "phase104-screen-edge-flash";
  overlay.frustumCulled = false;
  overlay.renderOrder = 10000;
  return overlay;
}

function createGlobalState(demo: Phase104Demo): GlobalFxState {
  const existing = stateByDemo.get(demo as unknown as object);
  if (existing) return existing;

  const root = new THREE.Group();
  root.name = "phase104-impact-aoe-root";
  root.userData.presentationId = CART_PHASE104_PRESENTATION_ID;
  root.userData.fixedAoeFxSlots = CART_PHASE104_AOE_FX_SLOTS;
  root.userData.gameplayHitboxesChanged = false;

  const aoeRoot = new THREE.Group();
  aoeRoot.name = "phase104-aoe-root";
  const aoeSlots = Array.from({ length: CART_PHASE104_AOE_FX_SLOTS }, (_, index) => createAoeSlot(index));
  for (const slot of aoeSlots) aoeRoot.add(slot.root);

  const playerRoot = new THREE.Group();
  playerRoot.name = "phase104-player-fx-root";
  const turboRing = new THREE.Mesh(horizontalRing(0.82, 1, 40), additiveMaterial(COLOR_TURBO, 0));
  turboRing.name = "phase104-turbo-ground-ring";
  turboRing.position.y = 0.1;
  turboRing.renderOrder = 9;

  const jetGeometry = new THREE.ConeGeometry(0.42, 3.4, 8, 1, true);
  jetGeometry.rotateX(Math.PI / 2);
  const coreGeometry = new THREE.ConeGeometry(0.21, 2.7, 8, 1, true);
  coreGeometry.rotateX(Math.PI / 2);
  const turboJetLeft = new THREE.Mesh(jetGeometry, additiveMaterial(COLOR_TURBO, 0));
  const turboJetRight = new THREE.Mesh(jetGeometry, additiveMaterial(COLOR_TURBO, 0));
  const turboCoreLeft = new THREE.Mesh(coreGeometry, additiveMaterial(COLOR_TURBO_CORE, 0));
  const turboCoreRight = new THREE.Mesh(coreGeometry, additiveMaterial(COLOR_TURBO_CORE, 0));
  turboJetLeft.name = "phase104-turbo-jet-left";
  turboJetRight.name = "phase104-turbo-jet-right";
  turboCoreLeft.name = "phase104-turbo-core-left";
  turboCoreRight.name = "phase104-turbo-core-right";
  turboJetLeft.position.set(-0.72, 0.72, -2.35);
  turboJetRight.position.set(0.72, 0.72, -2.35);
  turboCoreLeft.position.set(-0.72, 0.72, -2.48);
  turboCoreRight.position.set(0.72, 0.72, -2.48);

  const playerShockwave = new THREE.Mesh(horizontalRing(0.82, 1, 48), additiveMaterial(COLOR_PERFECT, 0));
  playerShockwave.name = "phase104-player-shockwave";
  playerShockwave.position.y = 0.12;
  playerShockwave.renderOrder = 11;
  playerRoot.add(turboRing, turboJetLeft, turboJetRight, turboCoreLeft, turboCoreRight, playerShockwave);

  const impactRoot = new THREE.Group();
  impactRoot.name = "phase104-impact-root";
  impactRoot.visible = false;
  const hitRing = new THREE.Mesh(horizontalRing(0.78, 1, 40), additiveMaterial(COLOR_PERFECT_GOLD, 0));
  hitRing.name = "phase104-hit-ring";
  hitRing.position.y = 0.18;
  hitRing.renderOrder = 12;
  const hitCore = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.8, 0),
    additiveMaterial(COLOR_FIRE, 0),
  );
  hitCore.name = "phase104-hit-core";
  hitCore.position.y = 1.1;
  hitCore.renderOrder = 13;
  impactRoot.add(hitRing, hitCore);

  const bossBurstRoot = new THREE.Group();
  bossBurstRoot.name = "phase104-boss-burst-root";
  bossBurstRoot.visible = false;
  const bossRing = new THREE.Mesh(horizontalRing(0.8, 1, 56), additiveMaterial(COLOR_BOSS, 0));
  bossRing.name = "phase104-boss-phase-ring";
  bossRing.position.y = 0.16;
  bossRing.renderOrder = 10;
  bossBurstRoot.add(bossRing);

  const overlay = createOverlay();

  root.add(aoeRoot, playerRoot, impactRoot, bossBurstRoot, overlay);
  demo.scene.add(root);

  const attack = getCartTurboAttackState(demo.session);
  const strike = getCartTurboStrikeState(demo.session);
  const perfect = getCartPerfectStrikeState(demo.session);
  const raid = getCartRaidHazardState(demo.session);
  const damage = getCartPlayerDamageFeedbackState(demo.session);
  const boss = getCartTitanBossState(demo.session);
  const created: GlobalFxState = {
    root,
    aoeRoot,
    playerRoot,
    impactRoot,
    bossBurstRoot,
    aoeSlots,
    turboRing,
    turboJetLeft,
    turboJetRight,
    turboCoreLeft,
    turboCoreRight,
    playerShockwave,
    hitRing,
    hitCore,
    bossRing,
    overlay,
    lastTurboSerial: attack.serial,
    lastStrikeSerial: strike.hitSerial,
    lastPerfectStrikeSerial: perfect.perfectSerial,
    lastRaidPerfectSerial: raid.perfectDodgeSerial,
    lastRaidHitSerial: damage.hitSerial,
    lastBossStageSerial: boss.stageSerial,
    turboReleasePulse: 0,
    strikePulse: 0,
    perfectPulse: 0,
    damagePulse: 0,
    bossPulse: 0,
    aoeScreenPulse: 0,
    elapsed: 0,
  };
  stateByDemo.set(demo as unknown as object, created);
  return created;
}

function setAoeColor(slot: AoeFxSlot, color: number): void {
  for (const segment of slot.segments) segment.material.color.setHex(color);
  slot.countdown.material.color.setHex(color);
  slot.core.material.color.setHex(color);
  slot.locatorBeam.material.color.setHex(color);
}

function updateTrail(slot: AoeFxSlot, x: number, z: number, visible: boolean): void {
  // The trail is parented to the current hazard root, so keep endpoints local.
  slot.trailPositions[0] = slot.previousX - x;
  slot.trailPositions[1] = 0;
  slot.trailPositions[2] = slot.previousZ - z;
  slot.trailPositions[3] = 0;
  slot.trailPositions[4] = 0;
  slot.trailPositions[5] = 0;
  const attribute = slot.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
  attribute.needsUpdate = true;
  slot.trail.material.opacity = visible ? 0.52 : 0;
  slot.trail.visible = visible;
}

function beginAoeFire(demo: Phase104Demo, state: GlobalFxState, slot: AoeFxSlot, hazard: CartRaidHazardPublicState, quality: "full" | "reduced"): void {
  slot.firePulse = 1;
  state.aoeScreenPulse = Math.max(state.aoeScreenPulse, 1);
  const dx = demo.session.car.position.x - hazard.x;
  const dz = demo.session.car.position.z - hazard.z;
  const distance = Math.hypot(dx, dz);
  const kick = cartPhase104AoeCameraKick(distance, slot.lastExtent);
  demo.cameraShake = Math.max(demo.cameraShake, kick);
  demo.cameraRoll = clamp(demo.cameraRoll + Math.sin(hazard.id * 1.7) * kick * 0.08, -0.08, 0.08);
  demo.impactFlash = Math.max(demo.impactFlash, distance <= slot.lastExtent * 1.3 ? 0.46 : 0.18);
  demo.emitImpactSparks(new THREE.Vector3(hazard.x, 0.7, hazard.z), quality === "full" ? 16 : 8);
}

function updateAoeSlot(
  demo: Phase104Demo,
  state: GlobalFxState,
  slot: AoeFxSlot,
  hazard: CartRaidHazardPublicState | undefined,
  delta: number,
  quality: "full" | "reduced",
): void {
  slot.lockPulse = Math.max(0, slot.lockPulse - delta / CART_PHASE104_LOCK_PULSE_SECONDS);
  slot.firePulse = Math.max(0, slot.firePulse - delta / CART_PHASE104_FIRE_PULSE_SECONDS);
  slot.ghostLife = Math.max(0, slot.ghostLife - delta / CART_PHASE104_GHOST_SECONDS);

  if (!hazard) {
    const residual = Math.max(slot.firePulse, slot.ghostLife);
    slot.root.visible = residual > 0.001;
    slot.segments.forEach((segment) => { segment.material.opacity = 0; });
    slot.countdown.material.opacity = 0;
    slot.core.material.opacity = slot.firePulse * 0.52;
    slot.locatorBeam.material.opacity = 0;
    slot.impactBeam.material.opacity = slot.firePulse * 0.66;
    slot.shockwave.material.opacity = slot.firePulse * 0.72;
    slot.shockwave.scale.setScalar(slot.lastExtent * (0.72 + (1 - slot.firePulse) * 1.8));
    slot.ghostRing.material.opacity = slot.ghostLife * 0.28;
    slot.trail.visible = false;
    if (residual <= 0.001) {
      slot.hazardId = null;
      slot.previousPhase = null;
      slot.initialized = false;
    }
    return;
  }

  const newHazard = slot.hazardId !== hazard.id;
  if (newHazard) {
    slot.hazardId = hazard.id;
    slot.previousPhase = null;
    slot.previousX = hazard.x;
    slot.previousZ = hazard.z;
    slot.initialized = false;
    slot.lockPulse = 0;
    slot.firePulse = 0;
    slot.ghostLife = 0;
  }

  const moved = slot.initialized && Math.hypot(hazard.x - slot.previousX, hazard.z - slot.previousZ) > 0.06;
  if (moved && hazard.phase === "TRACKING") {
    slot.ghostRing.position.set(slot.previousX - hazard.x, 0.07, slot.previousZ - hazard.z);
    slot.ghostLife = 1;
  }
  if (slot.previousPhase === "TRACKING" && hazard.phase === "LOCKED") slot.lockPulse = 1;
  if (hazard.phase === "FIRED" && slot.previousPhase !== "FIRED") beginAoeFire(demo, state, slot, hazard, quality);

  slot.root.visible = hazard.phase !== "DELAY" || slot.firePulse > 0;
  if (!slot.root.visible) {
    slot.previousPhase = hazard.phase;
    slot.previousX = hazard.x;
    slot.previousZ = hazard.z;
    slot.initialized = true;
    return;
  }

  slot.root.position.set(hazard.x, 0, hazard.z);
  slot.lastExtent = cartPhase104AoeExtent(hazard);
  const urgency = cartPhase104AoeUrgency(hazard.secondsToFire, hazard.telegraphSeconds);
  const imminent = hazard.phase !== "FIRED" && hazard.secondsToFire <= 0.35;
  const color = hazard.phase === "FIRED" ? COLOR_FIRE : imminent ? COLOR_IMMINENT : hazard.phase === "LOCKED" ? COLOR_LOCKED : COLOR_TRACKING;
  setAoeColor(slot, color);

  const spinDirection = hazard.id % 2 === 0 ? -1 : 1;
  const spin = state.elapsed * (hazard.phase === "TRACKING" ? 2.8 : imminent ? 4.1 : 1.4) * spinDirection + hazard.heading;
  const orbitScale = slot.lastExtent * (1 + slot.lockPulse * 0.11);
  const pulse = 1 + Math.sin(state.elapsed * (imminent ? 19 : 9) + hazard.id) * (imminent ? 0.045 : 0.018);
  slot.segments.forEach((segment, index) => {
    segment.rotation.y = spin + index * Math.PI * 0.5;
    segment.scale.setScalar(orbitScale * pulse);
    segment.material.opacity = hazard.phase === "FIRED" ? slot.firePulse * 0.92 : 0.32 + urgency * 0.42 + slot.lockPulse * 0.18;
    segment.visible = quality === "full" || index % 2 === 0;
  });

  const countdownRatio = hazard.phase === "TRACKING"
    ? 0.92 + Math.sin(state.elapsed * 8) * 0.04
    : 0.34 + (1 - urgency) * 0.62;
  slot.countdown.visible = hazard.phase !== "FIRED";
  slot.countdown.scale.setScalar(slot.lastExtent * countdownRatio);
  slot.countdown.material.opacity = hazard.phase === "TRACKING" ? 0.28 : 0.34 + urgency * 0.46;
  slot.countdown.rotation.y = -spin * 0.7;

  const coreScale = clamp(slot.lastExtent * (0.12 + urgency * 0.055), 0.65, 2.15);
  slot.core.scale.setScalar(coreScale * (1 + Math.sin(state.elapsed * 16) * 0.08 * urgency));
  slot.core.material.opacity = hazard.phase === "FIRED" ? slot.firePulse * 0.9 : 0.12 + urgency * 0.25;

  const locatorHeight = quality === "full" ? 2.4 + urgency * 5.2 : 1.8 + urgency * 2.6;
  slot.locatorBeam.visible = hazard.phase !== "FIRED";
  slot.locatorBeam.position.y = locatorHeight * 0.5;
  slot.locatorBeam.scale.set(1 + urgency * 0.6, locatorHeight, 1 + urgency * 0.6);
  slot.locatorBeam.material.opacity = quality === "full" ? 0.035 + urgency * 0.11 : 0.025 + urgency * 0.055;

  slot.impactBeam.visible = slot.firePulse > 0.001;
  const fireEase = Math.pow(slot.firePulse, 0.65);
  const impactHeight = (quality === "full" ? 14 : 9) + slot.lastExtent * 0.35;
  slot.impactBeam.position.y = impactHeight * 0.5;
  slot.impactBeam.scale.set(0.75 + (1 - fireEase) * 1.3, impactHeight, 0.75 + (1 - fireEase) * 1.3);
  slot.impactBeam.material.opacity = fireEase * (quality === "full" ? 0.82 : 0.62);

  slot.shockwave.visible = slot.firePulse > 0.001;
  slot.shockwave.scale.setScalar(slot.lastExtent * (0.72 + (1 - slot.firePulse) * 1.8));
  slot.shockwave.material.opacity = slot.firePulse * (quality === "full" ? 0.82 : 0.62);

  slot.ghostRing.visible = slot.ghostLife > 0.001 && quality === "full";
  slot.ghostRing.scale.setScalar(slot.lastExtent * (1.08 + (1 - slot.ghostLife) * 0.25));
  slot.ghostRing.material.opacity = slot.ghostLife * 0.34;

  updateTrail(slot, hazard.x, hazard.z, moved && hazard.phase === "TRACKING" && quality === "full");
  slot.previousPhase = hazard.phase;
  slot.previousX = hazard.x;
  slot.previousZ = hazard.z;
  slot.initialized = true;
}

function updateAoeFx(demo: Phase104Demo, state: GlobalFxState, delta: number, quality: "full" | "reduced"): void {
  const raid = getCartRaidHazardState(demo.session);
  const assignedIds = new Set<number>();

  // Preserve visual-slot identity while a hazard is alive so TRACKING trails and
  // FIRED pulses cannot jump when another fixed gameplay slot clears first.
  for (const slot of state.aoeSlots) {
    const hazard = slot.hazardId === null ? undefined : raid.hazards.find((candidate) => candidate.id === slot.hazardId);
    if (hazard) assignedIds.add(hazard.id);
    updateAoeSlot(demo, state, slot, hazard, delta, quality);
  }
  for (const hazard of raid.hazards) {
    if (assignedIds.has(hazard.id)) continue;
    const slot = state.aoeSlots.find((candidate) => candidate.hazardId === null && candidate.firePulse <= 0.001)
      ?? state.aoeSlots.find((candidate) => candidate.firePulse <= 0.001)
      ?? state.aoeSlots.reduce((best, candidate) => candidate.firePulse < best.firePulse ? candidate : best);
    updateAoeSlot(demo, state, slot, hazard, delta, quality);
    assignedIds.add(hazard.id);
  }

  state.aoeRoot.userData.activeHazards = raid.activeCount;
  state.aoeRoot.userData.imminentHazards = raid.imminentCount;
  state.aoeRoot.userData.fixedSlots = CART_PHASE104_AOE_FX_SLOTS;
  state.aoeRoot.userData.presentationOnly = true;
}

function updatePlayerFx(demo: Phase104Demo, state: GlobalFxState, delta: number, quality: "full" | "reduced"): void {
  const attack = getCartTurboAttackState(demo.session);
  const strike = getCartTurboStrikeState(demo.session);
  const perfect = getCartPerfectStrikeState(demo.session);
  const raid = getCartRaidHazardState(demo.session);
  const damage = getCartPlayerDamageFeedbackState(demo.session);

  state.turboReleasePulse = Math.max(0, state.turboReleasePulse - delta * 3.6);
  state.strikePulse = Math.max(0, state.strikePulse - delta * 4.2);
  state.perfectPulse = Math.max(0, state.perfectPulse - delta * 2.8);
  state.damagePulse = Math.max(0, state.damagePulse - delta * 2.7);

  if (attack.serial > state.lastTurboSerial) {
    state.lastTurboSerial = attack.serial;
    state.turboReleasePulse = 1;
    demo.cameraShake = Math.max(demo.cameraShake, 0.16 + attack.charge * 0.11);
  }

  if (strike.hitSerial > state.lastStrikeSerial) {
    state.lastStrikeSerial = strike.hitSerial;
    state.strikePulse = 1;
    const enemy = strike.lastEnemyId ? demo.session.enemies.find((candidate) => candidate.id === strike.lastEnemyId) : undefined;
    if (enemy) {
      state.impactRoot.position.set(enemy.x, 0, enemy.z);
      demo.emitImpactSparks(new THREE.Vector3(enemy.x, 1.0, enemy.z), quality === "full" ? (strike.lastDestroyed ? 18 : 12) : 7);
    } else {
      state.impactRoot.position.set(demo.session.car.position.x, 0, demo.session.car.position.z);
    }
    state.hitRing.material.color.setHex(strike.lastDestroyed ? COLOR_FIRE : COLOR_PERFECT_GOLD);
    state.hitCore.material.color.setHex(strike.lastDestroyed ? COLOR_PERFECT_GOLD : COLOR_FIRE);
    demo.cameraShake = Math.max(demo.cameraShake, strike.lastDestroyed ? 0.34 : 0.22);
  }

  if (perfect.perfectSerial > state.lastPerfectStrikeSerial) {
    state.lastPerfectStrikeSerial = perfect.perfectSerial;
    state.perfectPulse = 1;
    state.strikePulse = 1;
    demo.impactFlash = Math.max(demo.impactFlash, 0.42);
  }
  if (raid.perfectDodgeSerial > state.lastRaidPerfectSerial) {
    state.lastRaidPerfectSerial = raid.perfectDodgeSerial;
    state.perfectPulse = 1;
    demo.cameraShake = Math.max(demo.cameraShake, 0.13);
  }
  if (damage.hitSerial > state.lastRaidHitSerial) {
    state.lastRaidHitSerial = damage.hitSerial;
    state.damagePulse = 1;
  }

  const car = demo.session.car;
  state.playerRoot.position.set(car.position.x, 0, car.position.z);
  state.playerRoot.rotation.y = car.heading;
  const turboIntensity = attack.mode === "idle" ? (car.boostActive ? 0.45 : 0) : attack.intensity;
  const jetOpacity = saturate(turboIntensity * 0.68 + state.turboReleasePulse * 0.52);
  const jetScale = 0.62 + turboIntensity * 0.76 + state.turboReleasePulse * 0.48;
  for (const jet of [state.turboJetLeft, state.turboJetRight]) {
    jet.visible = jetOpacity > 0.01;
    jet.material.opacity = jetOpacity * (quality === "full" ? 0.66 : 0.48);
    jet.scale.set(1, 1, jetScale);
  }
  for (const core of [state.turboCoreLeft, state.turboCoreRight]) {
    core.visible = jetOpacity > 0.08;
    core.material.opacity = jetOpacity * 0.84;
    core.scale.set(0.72, 0.72, 0.72 + jetScale * 0.58);
  }

  state.turboRing.visible = turboIntensity > 0.06 || state.turboReleasePulse > 0.01;
  state.turboRing.scale.setScalar(2.7 + turboIntensity * 1.25 + (1 - state.turboReleasePulse) * state.turboReleasePulse * 3.4);
  state.turboRing.rotation.y += delta * (2 + turboIntensity * 5);
  state.turboRing.material.opacity = saturate(turboIntensity * 0.34 + state.turboReleasePulse * 0.62);

  const playerPulse = Math.max(state.perfectPulse, state.damagePulse * 0.82);
  state.playerShockwave.visible = playerPulse > 0.01;
  state.playerShockwave.material.color.setHex(state.damagePulse > state.perfectPulse ? COLOR_DAMAGE : COLOR_PERFECT);
  state.playerShockwave.material.opacity = playerPulse * 0.72;
  state.playerShockwave.scale.setScalar(2.5 + (1 - playerPulse) * 7.5);

  state.impactRoot.visible = state.strikePulse > 0.01;
  state.hitRing.material.opacity = state.strikePulse * 0.82;
  state.hitRing.scale.setScalar(1.5 + (1 - state.strikePulse) * 5.8);
  state.hitRing.rotation.y -= delta * 5;
  state.hitCore.material.opacity = state.strikePulse * 0.86;
  state.hitCore.scale.setScalar(0.45 + state.strikePulse * 1.15);
  state.hitCore.rotation.x += delta * 6;
  state.hitCore.rotation.y += delta * 8;
}

function updateBossFx(demo: Phase104Demo, state: GlobalFxState, delta: number): void {
  const bossState = getCartTitanBossState(demo.session);
  state.bossPulse = Math.max(0, state.bossPulse - delta * 1.65);
  if (bossState.bossActive && bossState.stageSerial > state.lastBossStageSerial) {
    const initialActivation = state.lastBossStageSerial <= 0;
    state.lastBossStageSerial = bossState.stageSerial;
    state.bossPulse = initialActivation ? 0.72 : 1;
    state.aoeScreenPulse = Math.max(state.aoeScreenPulse, initialActivation ? 0.42 : 0.68);
  }

  const boss = demo.session.enemies.find((enemy) => enemy.kind === "boss");
  if (boss && bossState.bossActive) {
    state.bossBurstRoot.visible = state.bossPulse > 0.01 || bossState.chargeTelegraph > 0.01;
    state.bossBurstRoot.position.set(boss.x, 0, boss.z);
    const charge = bossState.chargeTelegraph;
    state.bossRing.material.color.setHex(bossState.stage === "FURY" ? COLOR_IMMINENT : COLOR_BOSS);
    state.bossRing.material.opacity = Math.max(state.bossPulse * 0.72, charge * 0.38);
    state.bossRing.scale.setScalar(4.4 + (1 - state.bossPulse) * state.bossPulse * 10 + charge * 2.2);
    state.bossRing.rotation.y += delta * (1.8 + charge * 4.5);
  } else {
    state.bossBurstRoot.visible = false;
  }

  const weakCore = demo.scene.getObjectByName("phase83-titan-weak-core");
  if (weakCore instanceof THREE.Mesh && weakCore.material instanceof THREE.MeshStandardMaterial) {
    const chargeGlow = bossState.chargeTelegraph * 0.85;
    weakCore.material.emissiveIntensity = 1.15 + chargeGlow + state.bossPulse * 1.5 + (bossState.stage === "FURY" ? 0.55 : 0);
    if (bossState.vulnerable || bossState.stage === "FURY") {
      const pulse = 1 + Math.sin(state.elapsed * 10) * 0.11 + state.bossPulse * 0.22;
      weakCore.scale.setScalar(pulse);
    }
  }
}

function updateScreenOverlay(state: GlobalFxState, delta: number): void {
  state.aoeScreenPulse = Math.max(0, state.aoeScreenPulse - delta * 3.2);
  const strongest = Math.max(state.damagePulse, state.aoeScreenPulse, state.perfectPulse * 0.64, state.bossPulse * 0.46);
  const material = state.overlay.material;
  material.uniforms.uOpacity.value = strongest > 0.01 ? strongest * 0.42 : 0;
  const color = material.uniforms.uColor.value as THREE.Color;
  if (state.damagePulse >= strongest - 0.001) color.setHex(COLOR_DAMAGE);
  else if (state.aoeScreenPulse >= strongest - 0.001) color.setHex(COLOR_FIRE);
  else if (state.perfectPulse * 0.64 >= strongest - 0.001) color.setHex(COLOR_PERFECT);
  else color.setHex(COLOR_BOSS);
}

function updateVisualOverhaul(demo: Phase104Demo, state: GlobalFxState, delta: number): void {
  if (!isCartTurboHuntEnabled(demo.session)) {
    state.root.visible = false;
    return;
  }
  state.root.visible = true;
  const safeDelta = clamp(delta, 0, 0.05);
  state.elapsed += safeDelta;
  const battery = getCartBatteryPerformanceSnapshot(demo as unknown as CartRogueWebGLDemo);
  const quality = cartPhase104FxQuality(battery.frameMsEma);
  state.root.userData.fxQuality = quality;
  state.root.userData.frameMsEma = battery.frameMsEma;
  state.root.userData.noPostProcessing = true;
  state.root.userData.sharedFixedPools = true;
  demo.renderer.domElement.dataset.phase104Fx = quality;

  updateAoeFx(demo, state, safeDelta, quality);
  updatePlayerFx(demo, state, safeDelta, quality);
  updateBossFx(demo, state, safeDelta);
  updateScreenOverlay(state, safeDelta);
}

function patchWebGLDemo(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase104Demo & Record<string, unknown>;
  if (prototype[PATCHED_KEY]) return;
  prototype[PATCHED_KEY] = true;

  const originalBuildWorld = prototype.buildWorld;
  prototype.buildWorld = function phase104BuildWorld(this: Phase104Demo): void {
    originalBuildWorld.call(this);
    createGlobalState(this);
  };

  const originalUpdateVisuals = prototype.updateVisuals;
  prototype.updateVisuals = function phase104UpdateVisuals(this: Phase104Demo, delta: number): void {
    originalUpdateVisuals.call(this, delta);
    const state = stateByDemo.get(this as unknown as object) ?? createGlobalState(this);
    updateVisualOverhaul(this, state, delta);
  };
}

export function installCartRoguePhase104ImpactAoeOverhaul(): void {
  patchWebGLDemo();
}

installCartRoguePhase104ImpactAoeOverhaul();

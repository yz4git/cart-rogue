import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";

export type CartRaidHazardKind = "LINE" | "CIRCLE" | "CROSS" | "CONE" | "DONUT";
export type CartRaidHazardSource = "FIELD" | "TITAN";
export type CartRaidHazardPhase = "DELAY" | "TRACKING" | "LOCKED" | "FIRED";
export type CartRaidHazardResult = "NONE" | "CLEAR" | "PERFECT" | "HIT";

export interface CartRaidHazardSpec {
  kind: CartRaidHazardKind;
  source?: CartRaidHazardSource;
  label?: string;
  x?: number;
  z?: number;
  heading?: number;
  width?: number;
  length?: number;
  radius?: number;
  innerRadius?: number;
  outerRadius?: number;
  coneAngle?: number;
  telegraphSeconds?: number;
  followCarSeconds?: number;
  followForward?: number;
  followRight?: number;
  followHeading?: boolean;
  headingOffset?: number;
  delaySeconds?: number;
}

export interface CartRaidHazardPublicState {
  id: number;
  active: boolean;
  kind: CartRaidHazardKind;
  source: CartRaidHazardSource;
  label: string;
  phase: CartRaidHazardPhase;
  x: number;
  z: number;
  heading: number;
  width: number;
  length: number;
  radius: number;
  innerRadius: number;
  outerRadius: number;
  coneAngle: number;
  secondsToFire: number;
  telegraphSeconds: number;
  locked: boolean;
}

export interface CartRaidHazardSnapshot {
  activeCount: number;
  imminentCount: number;
  hitSerial: number;
  perfectDodgeSerial: number;
  clearSerial: number;
  dodgeFlashSeconds: number;
  lastResult: CartRaidHazardResult;
  primaryKind: CartRaidHazardKind | null;
  primaryLabel: string | null;
  primaryPhase: CartRaidHazardPhase | null;
  primarySeconds: number;
  hazards: CartRaidHazardPublicState[];
}

interface HazardSlot extends CartRaidHazardPublicState {
  delaySeconds: number;
  followCarSeconds: number;
  followForward: number;
  followRight: number;
  followHeading: boolean;
  headingOffset: number;
  insideWhileLocked: boolean;
  lastInsideAge: number;
  fireFlashSeconds: number;
}

interface InternalRaidState {
  slots: HazardSlot[];
  nextId: number;
  hitSerial: number;
  perfectDodgeSerial: number;
  clearSerial: number;
  dodgeFlashSeconds: number;
  lastResult: CartRaidHazardResult;
  broadcastClock: number;
}

interface Phase88Session {
  car: CartArenaSession["car"];
  gas: number;
  turboRechargeTimer: number;
  rewardTimer: number;
  lastReward: string | null;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface Phase88Demo {
  scene: THREE.Scene;
  session: CartArenaSession;
  buildWorld(): void;
  updateVisuals(delta: number): void;
}

interface HazardMeshSet {
  root: THREE.Group;
  line: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  circle: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  crossA: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  crossB: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  cone: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  donut: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
}

interface HazardVisualState {
  root: THREE.Group;
  slots: HazardMeshSet[];
  warningMaterial: THREE.MeshBasicMaterial;
  lockedMaterial: THREE.MeshBasicMaterial;
  imminentMaterial: THREE.MeshBasicMaterial;
  fireMaterial: THREE.MeshBasicMaterial;
}

const stateBySession = new WeakMap<object, InternalRaidState>();
const visualByDemo = new WeakMap<object, HazardVisualState>();
let latestSnapshot: CartRaidHazardSnapshot | null = null;

export const CART_RAID_HAZARD_SNAPSHOT_EVENT = "cart-raid-hazard-snapshot";
export const CART_RAID_HAZARD_MAX_ACTIVE = 4;
export const CART_RAID_HAZARD_LAYER_Y = 0.052;
export const CART_RAID_HAZARD_MIN_LOCK_SECONDS = 0.45;
export const CART_RAID_HAZARD_PERFECT_ESCAPE_WINDOW = 0.28;
export const CART_RAID_HAZARD_FIRE_FLASH_SECONDS = 0.24;

const DEFAULT_TELEGRAPH_SECONDS = 1.35;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function emptySlot(index: number): HazardSlot {
  return {
    id: -(index + 1),
    active: false,
    kind: "CIRCLE",
    source: "FIELD",
    label: "RAID HAZARD",
    phase: "LOCKED",
    x: 0,
    z: 0,
    heading: 0,
    width: 7,
    length: 28,
    radius: 10,
    innerRadius: 5,
    outerRadius: 15,
    coneAngle: Math.PI * 0.42,
    secondsToFire: 0,
    telegraphSeconds: DEFAULT_TELEGRAPH_SECONDS,
    locked: true,
    delaySeconds: 0,
    followCarSeconds: 0,
    followForward: 0,
    followRight: 0,
    followHeading: false,
    headingOffset: 0,
    insideWhileLocked: false,
    lastInsideAge: Number.POSITIVE_INFINITY,
    fireFlashSeconds: 0,
  };
}

function stateFor(session: CartArenaSession | Phase88Session): InternalRaidState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalRaidState = {
    slots: Array.from({ length: CART_RAID_HAZARD_MAX_ACTIVE }, (_, index) => emptySlot(index)),
    nextId: 1,
    hitSerial: 0,
    perfectDodgeSerial: 0,
    clearSerial: 0,
    dodgeFlashSeconds: 0,
    lastResult: "NONE",
    broadcastClock: 0,
  };
  stateBySession.set(key, created);
  return created;
}

function publicSlot(slot: HazardSlot): CartRaidHazardPublicState {
  return {
    id: slot.id,
    active: slot.active,
    kind: slot.kind,
    source: slot.source,
    label: slot.label,
    phase: slot.phase,
    x: slot.x,
    z: slot.z,
    heading: slot.heading,
    width: slot.width,
    length: slot.length,
    radius: slot.radius,
    innerRadius: slot.innerRadius,
    outerRadius: slot.outerRadius,
    coneAngle: slot.coneAngle,
    secondsToFire: slot.secondsToFire,
    telegraphSeconds: slot.telegraphSeconds,
    locked: slot.locked,
  };
}

function snapshotOf(state: InternalRaidState): CartRaidHazardSnapshot {
  const hazards = state.slots.filter((slot) => slot.active).map(publicSlot);
  const primary = hazards
    .filter((hazard) => hazard.phase !== "DELAY")
    .sort((a, b) => a.secondsToFire - b.secondsToFire)[0] ?? null;
  return {
    activeCount: hazards.length,
    imminentCount: hazards.filter((hazard) => hazard.phase !== "DELAY" && hazard.secondsToFire <= 0.55).length,
    hitSerial: state.hitSerial,
    perfectDodgeSerial: state.perfectDodgeSerial,
    clearSerial: state.clearSerial,
    dodgeFlashSeconds: state.dodgeFlashSeconds,
    lastResult: state.lastResult,
    primaryKind: primary?.kind ?? null,
    primaryLabel: primary?.label ?? null,
    primaryPhase: primary?.phase ?? null,
    primarySeconds: primary?.secondsToFire ?? 0,
    hazards,
  };
}

export function getCartRaidHazardState(session: CartArenaSession): CartRaidHazardSnapshot {
  return snapshotOf(stateFor(session));
}

export function getLatestCartRaidHazardState(): CartRaidHazardSnapshot | null {
  return latestSnapshot ? { ...latestSnapshot, hazards: latestSnapshot.hazards.map((hazard) => ({ ...hazard })) } : null;
}

function broadcast(state: InternalRaidState): void {
  const snapshot = snapshotOf(state);
  latestSnapshot = snapshot;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CartRaidHazardSnapshot>(CART_RAID_HAZARD_SNAPSHOT_EVENT, { detail: snapshot }));
  }
}

export function cartPointInRaidHazard(
  hazard: Pick<CartRaidHazardPublicState, "kind" | "x" | "z" | "heading" | "width" | "length" | "radius" | "innerRadius" | "outerRadius" | "coneAngle">,
  x: number,
  z: number,
): boolean {
  const dx = x - hazard.x;
  const dz = z - hazard.z;
  const distance = Math.hypot(dx, dz);
  if (hazard.kind === "CIRCLE") return distance <= hazard.radius;
  if (hazard.kind === "DONUT") return distance >= hazard.innerRadius && distance <= hazard.outerRadius;
  if (hazard.kind === "CONE") {
    if (distance > hazard.radius) return false;
    const angle = Math.atan2(dx, dz);
    return Math.abs(normalizeAngle(angle - hazard.heading)) <= hazard.coneAngle * 0.5;
  }
  const forward = dx * Math.sin(hazard.heading) + dz * Math.cos(hazard.heading);
  const right = dx * Math.cos(hazard.heading) - dz * Math.sin(hazard.heading);
  const lineHit = Math.abs(forward) <= hazard.length * 0.5 && Math.abs(right) <= hazard.width * 0.5;
  if (hazard.kind === "LINE") return lineHit;
  return lineHit || (Math.abs(right) <= hazard.length * 0.5 && Math.abs(forward) <= hazard.width * 0.5);
}

export function cartRaidHazardArea(hazard: Pick<CartRaidHazardSpec, "kind" | "width" | "length" | "radius" | "innerRadius" | "outerRadius" | "coneAngle">): number {
  const width = Math.max(0.1, hazard.width ?? 7);
  const length = Math.max(0.1, hazard.length ?? 28);
  const radius = Math.max(0.1, hazard.radius ?? 10);
  const inner = Math.max(0, hazard.innerRadius ?? 5);
  const outer = Math.max(inner + 0.1, hazard.outerRadius ?? 15);
  const coneAngle = clamp(hazard.coneAngle ?? Math.PI * 0.42, 0.1, Math.PI * 1.9);
  if (hazard.kind === "CIRCLE") return Math.PI * radius * radius;
  if (hazard.kind === "DONUT") return Math.PI * (outer * outer - inner * inner);
  if (hazard.kind === "CONE") return 0.5 * coneAngle * radius * radius;
  if (hazard.kind === "CROSS") return width * length * 2 - width * width;
  return width * length;
}

function followCar(session: Phase88Session, slot: HazardSlot): void {
  const heading = session.car.heading;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  slot.x = session.car.position.x + fx * slot.followForward + rx * slot.followRight;
  slot.z = session.car.position.z + fz * slot.followForward + rz * slot.followRight;
  if (slot.followHeading) slot.heading = normalizeAngle(heading + slot.headingOffset);
}

export function queueCartRaidHazard(session: CartArenaSession, spec: CartRaidHazardSpec): number | null {
  const state = stateFor(session);
  const slot = state.slots.find((candidate) => !candidate.active);
  if (!slot) return null;
  const telegraphSeconds = clamp(spec.telegraphSeconds ?? DEFAULT_TELEGRAPH_SECONDS, 0.75, 2.6);
  const followSeconds = clamp(spec.followCarSeconds ?? 0, 0, Math.max(0, telegraphSeconds - CART_RAID_HAZARD_MIN_LOCK_SECONDS));
  const heading = spec.heading ?? session.car.heading;
  const x = spec.x ?? session.car.position.x;
  const z = spec.z ?? session.car.position.z;
  slot.id = state.nextId++;
  slot.active = true;
  slot.kind = spec.kind;
  slot.source = spec.source ?? "FIELD";
  slot.label = spec.label ?? `${spec.kind} STRIKE`;
  slot.phase = (spec.delaySeconds ?? 0) > 0 ? "DELAY" : followSeconds > 0 ? "TRACKING" : "LOCKED";
  slot.x = x;
  slot.z = z;
  slot.heading = heading;
  slot.width = Math.max(1, spec.width ?? 7);
  slot.length = Math.max(4, spec.length ?? 28);
  slot.radius = Math.max(2, spec.radius ?? 10);
  slot.innerRadius = Math.max(1, spec.innerRadius ?? 5);
  slot.outerRadius = Math.max(slot.innerRadius + 1, spec.outerRadius ?? 15);
  slot.coneAngle = clamp(spec.coneAngle ?? Math.PI * 0.42, 0.25, Math.PI * 1.5);
  slot.secondsToFire = telegraphSeconds;
  slot.telegraphSeconds = telegraphSeconds;
  slot.locked = followSeconds <= 0;
  slot.delaySeconds = Math.max(0, spec.delaySeconds ?? 0);
  slot.followCarSeconds = followSeconds;
  slot.followForward = spec.followForward ?? 0;
  slot.followRight = spec.followRight ?? 0;
  slot.followHeading = spec.followHeading ?? false;
  slot.headingOffset = spec.headingOffset ?? 0;
  slot.insideWhileLocked = false;
  slot.lastInsideAge = Number.POSITIVE_INFINITY;
  slot.fireFlashSeconds = 0;
  if (followSeconds > 0 && slot.delaySeconds <= 0) followCar(session as unknown as Phase88Session, slot);
  return slot.id;
}

function clearSlot(slot: HazardSlot): void {
  slot.active = false;
  slot.phase = "LOCKED";
  slot.secondsToFire = 0;
  slot.delaySeconds = 0;
  slot.followCarSeconds = 0;
  slot.insideWhileLocked = false;
  slot.lastInsideAge = Number.POSITIVE_INFINITY;
  slot.fireFlashSeconds = 0;
}

export function cancelCartRaidHazards(session: CartArenaSession, source?: CartRaidHazardSource): void {
  const state = stateFor(session);
  for (const slot of state.slots) {
    if (!slot.active || (source && slot.source !== source)) continue;
    clearSlot(slot);
  }
}

function rewardResult(session: Phase88Session, state: InternalRaidState, slot: HazardSlot, result: CartRaidHazardResult): void {
  state.lastResult = result;
  if (result === "HIT") {
    state.hitSerial += 1;
    state.dodgeFlashSeconds = 0.34;
    session.gas = Math.max(0, session.gas - 0.075);
    session.car.forwardVelocity *= 0.58;
    session.car.lateralVelocity *= 0.62;
    session.car.collisionImpact = Math.max(session.car.collisionImpact, 1);
    session.lastReward = `${slot.label} HIT · GET OUT`;
    session.rewardTimer = Math.max(session.rewardTimer, 1.5);
  } else if (result === "PERFECT") {
    state.perfectDodgeSerial += 1;
    state.clearSerial += 1;
    state.dodgeFlashSeconds = 0.8;
    session.gas = Math.min(1, session.gas + 0.028);
    session.turboRechargeTimer += 0.4;
    session.car.collisionImpact = Math.max(session.car.collisionImpact, 0.76);
    session.lastReward = "PERFECT AOE DODGE · COUNTER";
    session.rewardTimer = Math.max(session.rewardTimer, 1.7);
  } else {
    state.clearSerial += 1;
    state.dodgeFlashSeconds = Math.max(state.dodgeFlashSeconds, 0.18);
  }
}

function fireHazard(session: Phase88Session, state: InternalRaidState, slot: HazardSlot): void {
  const inside = cartPointInRaidHazard(slot, session.car.position.x, session.car.position.z);
  const perfect = !inside
    && slot.insideWhileLocked
    && Number.isFinite(slot.lastInsideAge)
    && slot.lastInsideAge <= CART_RAID_HAZARD_PERFECT_ESCAPE_WINDOW;
  rewardResult(session, state, slot, inside ? "HIT" : perfect ? "PERFECT" : "CLEAR");
  slot.phase = "FIRED";
  slot.locked = true;
  slot.secondsToFire = 0;
  slot.fireFlashSeconds = CART_RAID_HAZARD_FIRE_FLASH_SECONDS;
}

function updateSlot(session: Phase88Session, state: InternalRaidState, slot: HazardSlot, delta: number): void {
  if (!slot.active) return;
  if (slot.phase === "FIRED") {
    slot.fireFlashSeconds = Math.max(0, slot.fireFlashSeconds - delta);
    if (slot.fireFlashSeconds <= 0) clearSlot(slot);
    return;
  }
  if (slot.delaySeconds > 0) {
    slot.delaySeconds = Math.max(0, slot.delaySeconds - delta);
    slot.phase = "DELAY";
    if (slot.delaySeconds > 0) return;
    slot.phase = slot.followCarSeconds > 0 ? "TRACKING" : "LOCKED";
    slot.locked = slot.followCarSeconds <= 0;
    if (slot.followCarSeconds > 0) followCar(session, slot);
  }

  slot.secondsToFire = Math.max(0, slot.secondsToFire - delta);
  if (slot.followCarSeconds > 0) {
    followCar(session, slot);
    slot.followCarSeconds = Math.max(0, slot.followCarSeconds - delta);
    slot.phase = slot.followCarSeconds > 0 ? "TRACKING" : "LOCKED";
    slot.locked = slot.followCarSeconds <= 0;
  } else {
    slot.phase = "LOCKED";
    slot.locked = true;
  }

  if (slot.locked && slot.secondsToFire > 0) {
    const inside = cartPointInRaidHazard(slot, session.car.position.x, session.car.position.z);
    if (inside) {
      slot.insideWhileLocked = true;
      slot.lastInsideAge = 0;
    } else if (Number.isFinite(slot.lastInsideAge)) {
      slot.lastInsideAge += delta;
    }
  }
  if (slot.secondsToFire <= 0) fireHazard(session, state, slot);
}

function hazardMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function groundPlane(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function groundCircle(): THREE.CircleGeometry {
  const geometry = new THREE.CircleGeometry(1, 48);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function groundCone(): THREE.CircleGeometry {
  const geometry = new THREE.CircleGeometry(1, 48, -Math.PI * 0.5, Math.PI * 1.5);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function groundDonut(): THREE.RingGeometry {
  const geometry = new THREE.RingGeometry(0.5, 1, 56);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function meshSet(material: THREE.MeshBasicMaterial, index: number): HazardMeshSet {
  const root = new THREE.Group();
  root.name = `phase88-raid-hazard-slot-${index}`;
  const line = new THREE.Mesh(groundPlane(), material);
  line.name = `phase88-hazard-line-${index}`;
  const circle = new THREE.Mesh(groundCircle(), material);
  circle.name = `phase88-hazard-circle-${index}`;
  const crossA = new THREE.Mesh(groundPlane(), material);
  crossA.name = `phase88-hazard-cross-a-${index}`;
  const crossB = new THREE.Mesh(groundPlane(), material);
  crossB.name = `phase88-hazard-cross-b-${index}`;
  const cone = new THREE.Mesh(groundCone(), material);
  cone.name = `phase88-hazard-cone-${index}`;
  const donut = new THREE.Mesh(groundDonut(), material);
  donut.name = `phase88-hazard-donut-${index}`;
  for (const mesh of [line, circle, crossA, crossB, cone, donut]) {
    mesh.position.y = CART_RAID_HAZARD_LAYER_Y;
    mesh.renderOrder = 12;
    mesh.visible = false;
    root.add(mesh);
  }
  return { root, line, circle, crossA, crossB, cone, donut };
}

function buildHazardVisuals(demo: Phase88Demo): HazardVisualState {
  const root = new THREE.Group();
  root.name = "phase88-raid-hazard-root";
  const warningMaterial = hazardMaterial(0xff1238, 0.38);
  const lockedMaterial = hazardMaterial(0xff2416, 0.52);
  const imminentMaterial = hazardMaterial(0xffb000, 0.68);
  const fireMaterial = hazardMaterial(0xffffff, 0.84);
  const slots = Array.from({ length: CART_RAID_HAZARD_MAX_ACTIVE }, (_, index) => meshSet(warningMaterial, index));
  slots.forEach((slot) => root.add(slot.root));
  demo.scene.add(root);
  const visual = { root, slots, warningMaterial, lockedMaterial, imminentMaterial, fireMaterial };
  visualByDemo.set(demo as unknown as object, visual);
  return visual;
}

function hideMeshes(set: HazardMeshSet): void {
  set.line.visible = false;
  set.circle.visible = false;
  set.crossA.visible = false;
  set.crossB.visible = false;
  set.cone.visible = false;
  set.donut.visible = false;
}

function applyMaterial(set: HazardMeshSet, material: THREE.MeshBasicMaterial): void {
  set.line.material = material;
  set.circle.material = material;
  set.crossA.material = material;
  set.crossB.material = material;
  set.cone.material = material;
  set.donut.material = material;
}

function updateMeshSet(set: HazardMeshSet, hazard: CartRaidHazardPublicState, visual: HazardVisualState, time: number): void {
  hideMeshes(set);
  set.root.visible = hazard.phase !== "DELAY";
  if (!set.root.visible) return;
  const material = hazard.phase === "FIRED"
    ? visual.fireMaterial
    : hazard.secondsToFire <= 0.35
      ? visual.imminentMaterial
      : hazard.phase === "LOCKED"
        ? visual.lockedMaterial
        : visual.warningMaterial;
  applyMaterial(set, material);
  const pulse = hazard.phase === "LOCKED" ? 1 + Math.sin(time * 0.018) * 0.035 : 1;

  if (hazard.kind === "LINE") {
    set.line.visible = true;
    set.line.position.set(hazard.x, CART_RAID_HAZARD_LAYER_Y, hazard.z);
    set.line.rotation.y = hazard.heading;
    set.line.scale.set(hazard.width * pulse, 1, hazard.length * pulse);
  } else if (hazard.kind === "CIRCLE") {
    set.circle.visible = true;
    set.circle.position.set(hazard.x, CART_RAID_HAZARD_LAYER_Y, hazard.z);
    set.circle.scale.set(hazard.radius * pulse, 1, hazard.radius * pulse);
  } else if (hazard.kind === "CROSS") {
    set.crossA.visible = true;
    set.crossB.visible = true;
    set.crossA.position.set(hazard.x, CART_RAID_HAZARD_LAYER_Y, hazard.z);
    set.crossB.position.copy(set.crossA.position);
    set.crossA.rotation.y = hazard.heading;
    set.crossB.rotation.y = hazard.heading + Math.PI / 2;
    set.crossA.scale.set(hazard.width * pulse, 1, hazard.length * pulse);
    set.crossB.scale.copy(set.crossA.scale);
  } else if (hazard.kind === "CONE") {
    set.cone.visible = true;
    set.cone.position.set(hazard.x, CART_RAID_HAZARD_LAYER_Y, hazard.z);
    set.cone.rotation.y = hazard.heading - Math.PI / 2;
    set.cone.scale.set(hazard.radius * pulse, 1, hazard.radius * pulse);
    const baseArc = Math.PI * 1.5;
    set.cone.scale.x *= clamp(hazard.coneAngle / baseArc, 0.22, 1);
  } else {
    set.donut.visible = true;
    set.donut.position.set(hazard.x, CART_RAID_HAZARD_LAYER_Y, hazard.z);
    const ratio = clamp(hazard.innerRadius / Math.max(0.1, hazard.outerRadius), 0.08, 0.9);
    set.donut.geometry.dispose();
    const geometry = new THREE.RingGeometry(ratio, 1, 56);
    geometry.rotateX(-Math.PI / 2);
    set.donut.geometry = geometry;
    set.donut.scale.set(hazard.outerRadius * pulse, 1, hazard.outerRadius * pulse);
  }
}

function updateHazardVisuals(demo: Phase88Demo): void {
  const visual = visualByDemo.get(demo as unknown as object) ?? buildHazardVisuals(demo);
  const snapshot = getCartRaidHazardState(demo.session);
  visual.root.visible = isCartTurboHuntEnabled(demo.session);
  if (!visual.root.visible) return;
  for (let index = 0; index < visual.slots.length; index += 1) {
    const hazard = snapshot.hazards[index];
    const set = visual.slots[index];
    if (!hazard) {
      set.root.visible = false;
      hideMeshes(set);
      continue;
    }
    updateMeshSet(set, hazard, visual, typeof performance !== "undefined" ? performance.now() : Date.now());
  }
  visual.root.userData.cartRaidHazardActiveCount = snapshot.activeCount;
  visual.root.userData.cartRaidHazardImminentCount = snapshot.imminentCount;
  visual.root.userData.cartRaidHazardPrimary = snapshot.primaryKind;
  visual.root.userData.cartRaidHazardHitSerial = snapshot.hitSerial;
  visual.root.userData.cartRaidHazardPerfectSerial = snapshot.perfectDodgeSerial;
}

export function installCartRoguePhase88RaidHazards(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase88Session;
  const previousStep = sessionPrototype.step;
  sessionPrototype.step = function phase88RaidHazardStep(
    this: Phase88Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previousStep.call(this, input, fixedDelta);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return;
    const state = stateFor(this);
    const delta = clamp(fixedDelta, 0, 0.05);
    state.dodgeFlashSeconds = Math.max(0, state.dodgeFlashSeconds - delta);
    for (const slot of state.slots) updateSlot(this, state, slot, delta);
    state.broadcastClock += delta;
    if (state.broadcastClock >= 0.1) {
      state.broadcastClock %= 0.1;
      broadcast(state);
    }
  };

  const demoPrototype = CartRogueWebGLDemo.prototype as unknown as Phase88Demo;
  const previousBuildWorld = demoPrototype.buildWorld;
  demoPrototype.buildWorld = function phase88RaidHazardBuildWorld(this: Phase88Demo): void {
    previousBuildWorld.call(this);
    buildHazardVisuals(this);
  };
  const previousUpdateVisuals = demoPrototype.updateVisuals;
  demoPrototype.updateVisuals = function phase88RaidHazardUpdateVisuals(this: Phase88Demo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    updateHazardVisuals(this);
  };
}

installCartRoguePhase88RaidHazards();

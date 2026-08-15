import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import type { CartEnemyState } from "./CartCombat";
import { getCartChainCombatState, launchCartEnemyFromVector } from "./CartRoguePhase16Flow";
import { consumeCartPerfectRamWindow, getCartTurboCombatState } from "./CartRoguePhase15Turbo";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { getCartRunModifiers } from "./CartRunProgression";

interface Phase17Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  step(input: RallyInputState, fixedDelta?: number): void;
  snapshot(): CartArenaSessionSnapshot;
  lastRamEnemyId?: string | null;
  lastRamDamage?: number;
  lastReward?: string | null;
  rewardTimer?: number;
  turboRechargeTimer?: number;
  gas?: number;
}

interface Phase17WebGL {
  session: CartArenaSession;
  enemyGroups: Map<string, THREE.Group>;
  updateVisuals(delta: number): void;
}

export interface CartCombatEvolutionSnapshot {
  chainCombo: number;
  chainLabel: string | null;
  perfectReady: boolean;
  perfectWindowSeconds: number;
  perfectCallout: boolean;
  combatCallout: string | null;
  bossArmor: number;
  bossMaxArmor: number;
  bossWeakPointExposed: boolean;
}

interface CombatEvolutionState {
  callout: string | null;
  calloutTimer: number;
  perfectCalloutTimer: number;
  handledReleaseSerial: number;
  detonatedBombers: Set<string>;
  decoratedEnemies: Set<string>;
}

const stateBySession = new WeakMap<object, CombatEvolutionState>();
const visualDecorated = new WeakSet<THREE.Group>();
const armorVisuals = new WeakMap<THREE.Group, THREE.Mesh[]>();

function stateFor(session: Phase17Session): CombatEvolutionState {
  const key = session as unknown as object;
  const current = stateBySession.get(key);
  if (current) return current;
  const created: CombatEvolutionState = {
    callout: null,
    calloutTimer: 0,
    perfectCalloutTimer: 0,
    handledReleaseSerial: 0,
    detonatedBombers: new Set<string>(),
    decoratedEnemies: new Set<string>(),
  };
  stateBySession.set(key, created);
  return created;
}

function syncHorizontalVelocity(session: Phase17Session): void {
  const car = session.car;
  const forwardX = Math.sin(car.heading);
  const forwardZ = Math.cos(car.heading);
  const rightX = Math.cos(car.heading);
  const rightZ = -Math.sin(car.heading);
  car.velocity.x = forwardX * car.forwardVelocity + rightX * car.lateralVelocity;
  car.velocity.z = forwardZ * car.forwardVelocity + rightZ * car.lateralVelocity;
  car.speed = Math.hypot(car.velocity.x, car.velocity.z);
}

function setCallout(session: Phase17Session, label: string, duration = 1.35): void {
  const state = stateFor(session);
  state.callout = label;
  state.calloutTimer = Math.max(state.calloutTimer, duration);
  if (typeof session.lastReward !== "undefined") session.lastReward = label;
  if (typeof session.rewardTimer === "number") session.rewardTimer = Math.max(session.rewardTimer, duration);
}

function applyPerfectRam(
  session: Phase17Session,
  beforeHp: Map<string, number>,
): void {
  const targetId = session.lastRamEnemyId;
  if (!targetId) return;
  const target = session.enemies.find((enemy) => enemy.id === targetId);
  const oldHp = beforeHp.get(targetId);
  if (!target || oldHp === undefined || target.hp >= oldHp) return;

  const perfect = consumeCartPerfectRamWindow(session as unknown as CartArenaSession);
  if (!perfect) return;
  const state = stateFor(session);
  if (perfect.serial <= state.handledReleaseSerial) return;
  state.handledReleaseSerial = perfect.serial;

  const modifiers = getCartRunModifiers();
  const baseDamage = Math.max(1, oldHp - target.hp);
  const bonus = Math.max(1, Math.round(baseDamage * (0.34 + perfect.charge * 0.18) * modifiers.perfectRamDamageMultiplier));
  const aliveBeforeBonus = target.alive;
  target.hp = Math.max(0, target.hp - bonus);
  target.alive = target.hp > 0;
  if (typeof session.lastRamDamage === "number") session.lastRamDamage += bonus;
  if (typeof session.turboRechargeTimer === "number") session.turboRechargeTimer += modifiers.perfectRechargeSeconds;
  session.car.boostTimeRemaining = Math.min(3.2, session.car.boostTimeRemaining + 0.18 + perfect.charge * 0.12);
  session.car.collisionImpact = Math.max(session.car.collisionImpact, 1);
  state.perfectCalloutTimer = 0.8;
  setCallout(session, target.alive ? `PERFECT RAM · +${bonus}` : `PERFECT KO · +${bonus}`, 1.45);

  if (aliveBeforeBonus && !target.alive) {
    launchCartEnemyFromVector(
      session as unknown as CartArenaSession,
      target,
      Math.sin(session.car.heading),
      Math.cos(session.car.heading),
      Math.max(16, Math.abs(session.car.forwardVelocity) + 4),
      true,
      bonus,
      0,
    );
  }
}

function detonateBomber(session: Phase17Session, bomber: CartEnemyState, playerTriggered: boolean): void {
  const state = stateFor(session);
  if (state.detonatedBombers.has(bomber.id)) return;
  state.detonatedBombers.add(bomber.id);
  const modifiers = getCartRunModifiers();
  const radius = 6.8;
  let collateral = 0;
  let destroys = 0;

  for (const target of session.enemies) {
    if (!target.alive || target.id === bomber.id || target.nodeId !== bomber.nodeId) continue;
    const dx = target.x - bomber.x;
    const dz = target.z - bomber.z;
    const distance = Math.hypot(dx, dz);
    if (distance > radius + target.radius) continue;
    const falloff = Math.max(0.35, 1 - distance / (radius + target.radius));
    let damage = 58 * falloff * modifiers.explosionDamageMultiplier;
    if (target.kind === "heavy") damage *= 0.72;
    if (target.kind === "boss") damage *= 0.48;
    const rounded = Math.max(1, Math.round(damage));
    target.hp = Math.max(0, target.hp - rounded);
    target.alive = target.hp > 0;
    collateral += 1;
    if (!target.alive) destroys += 1;
    launchCartEnemyFromVector(
      session as unknown as CartArenaSession,
      target,
      dx,
      dz,
      10 + 8 * falloff,
      !target.alive,
      rounded,
      1,
    );
  }

  if (playerTriggered) {
    if (typeof session.gas === "number") session.gas = Math.max(0, session.gas - 0.085);
    session.car.forwardVelocity *= 0.72;
    session.car.lateralVelocity *= 0.5;
    session.car.collisionImpact = Math.max(session.car.collisionImpact, 1);
    syncHorizontalVelocity(session);
  }
  setCallout(
    session,
    destroys > 0 ? `BOMBER CHAIN · ${destroys} KO` : collateral > 0 ? `BOMBER BLAST · ${collateral} HIT` : "BOMBER BLAST",
    1.45,
  );
}

function processBombers(
  session: Phase17Session,
  beforeAlive: Map<string, boolean>,
): void {
  for (const bomber of session.enemies) {
    if (bomber.archetype !== "bomber") continue;
    const wasAlive = beforeAlive.get(bomber.id) ?? false;
    if (wasAlive && !bomber.alive) {
      detonateBomber(session, bomber, false);
      continue;
    }
    if (!bomber.alive) continue;
    const dx = session.car.position.x - bomber.x;
    const dz = session.car.position.z - bomber.z;
    const distance = Math.hypot(dx, dz);
    if (distance > bomber.radius + 1.85) continue;
    bomber.hp = 0;
    bomber.alive = false;
    launchCartEnemyFromVector(
      session as unknown as CartArenaSession,
      bomber,
      -dx,
      -dz,
      13,
      true,
      bomber.maxHp,
      0,
    );
    detonateBomber(session, bomber, true);
  }
}

function tickCombatState(session: Phase17Session, delta: number): void {
  const state = stateFor(session);
  state.calloutTimer = Math.max(0, state.calloutTimer - delta);
  state.perfectCalloutTimer = Math.max(0, state.perfectCalloutTimer - delta);
  if (state.calloutTimer <= 0) state.callout = null;
}

export function getCartCombatEvolutionSnapshot(session: CartArenaSession): CartCombatEvolutionSnapshot {
  const phaseSession = session as unknown as Phase17Session;
  const state = stateFor(phaseSession);
  const chain = getCartChainCombatState(session);
  const turbo = getCartTurboCombatState(session);
  const boss = phaseSession.enemies.find((enemy) => enemy.kind === "boss");
  return {
    chainCombo: chain.combo,
    chainLabel: chain.timer > 0 ? chain.lastLabel : null,
    perfectReady: turbo.perfectReady,
    perfectWindowSeconds: turbo.perfectWindowSeconds,
    perfectCallout: state.perfectCalloutTimer > 0,
    combatCallout: state.calloutTimer > 0 ? state.callout : chain.timer > 0 ? chain.lastLabel : null,
    bossArmor: boss?.armorSegments ?? 0,
    bossMaxArmor: boss?.maxArmorSegments ?? 0,
    bossWeakPointExposed: Boolean(boss?.weakPointExposed),
  };
}

function decorateEnemy(group: THREE.Group, enemy: CartEnemyState): void {
  if (visualDecorated.has(group)) return;
  visualDecorated.add(group);
  const addBox = (size: [number, number, number], position: [number, number, number], color: number, emissive = 0) => {
    const material = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive > 0 ? 1.1 : 0, roughness: 0.65, metalness: 0.05, flatShading: true });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  if (enemy.archetype === "drifter") {
    addBox([0.22, 0.38, 1.25], [-1.1, 0.62, -0.05], 0x5fe1dc);
    addBox([0.22, 0.38, 1.25], [1.1, 0.62, -0.05], 0x5fe1dc);
  } else if (enemy.archetype === "bomber") {
    addBox([1.1, 0.78, 1.1], [0, 1.35, -0.05], 0xff6f6f, 0xff2c45);
    addBox([0.34, 0.22, 0.34], [0, 1.84, -0.05], 0xffd66b, 0xffb52f);
  } else if (enemy.archetype === "tank") {
    addBox([2.85, 0.68, 0.42], [0, 0.62, 1.28], 0x4d5669);
    addBox([0.45, 0.52, 2.05], [-1.42, 0.72, 0], 0x59657a);
    addBox([0.45, 0.52, 2.05], [1.42, 0.72, 0], 0x59657a);
  }

  if (enemy.kind === "boss") {
    const armor: THREE.Mesh[] = [];
    armor.push(addBox([1.15, 0.52, 0.5], [-1.45, 1.05, 1.35], 0xd25d63, 0x521217));
    armor.push(addBox([1.15, 0.52, 0.5], [0, 1.28, 1.55], 0xe1746f, 0x5b1519));
    armor.push(addBox([1.15, 0.52, 0.5], [1.45, 1.05, 1.35], 0xd25d63, 0x521217));
    armorVisuals.set(group, armor);
  }
}

function updateEnemyCombatVisuals(demo: Phase17WebGL): void {
  for (const enemy of demo.session.enemies) {
    const group = demo.enemyGroups.get(enemy.id);
    if (!group) continue;
    decorateEnemy(group, enemy);
    if (enemy.kind === "boss") {
      const armor = armorVisuals.get(group) ?? [];
      const remaining = enemy.armorSegments ?? 0;
      armor.forEach((mesh, index) => { mesh.visible = index < remaining; });
    }
  }
}

export function installCartRoguePhase17CombatEvolution(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase17Session;
  const originalStep = sessionPrototype.step;
  sessionPrototype.step = function stepPhase17(this: Phase17Session, input: RallyInputState, fixedDelta = 1 / 60): void {
    const beforeHp = new Map(this.enemies.map((enemy) => [enemy.id, enemy.hp] as const));
    const beforeAlive = new Map(this.enemies.map((enemy) => [enemy.id, enemy.alive] as const));
    originalStep.call(this, input, fixedDelta);
    applyPerfectRam(this, beforeHp);
    processBombers(this, beforeAlive);
    tickCombatState(this, fixedDelta);
  };

  const originalSnapshot = sessionPrototype.snapshot;
  sessionPrototype.snapshot = function snapshotPhase17(this: Phase17Session): CartArenaSessionSnapshot {
    const base = originalSnapshot.call(this);
    return Object.assign(base, getCartCombatEvolutionSnapshot(this as unknown as CartArenaSession));
  };

  const webglPrototype = CartRogueWebGLDemo.prototype as unknown as Phase17WebGL;
  const originalUpdate = webglPrototype.updateVisuals;
  webglPrototype.updateVisuals = function updateVisualsPhase17(this: Phase17WebGL, delta: number): void {
    originalUpdate.call(this, delta);
    updateEnemyCombatVisuals(this);
  };
}

installCartRoguePhase17CombatEvolution();

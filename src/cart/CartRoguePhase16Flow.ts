import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import type { CartEnemyState } from "./CartCombat";
import { cartArenaShapeForNode, projectCartPointInsideArena } from "./CartArenaShapes";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { getCartRunModifiers } from "./CartRunProgression";
import { cartWorldNodeById, type CartWorldLocation } from "./CartWorldGraph";

interface EnemyReaction {
  vx: number;
  vz: number;
  spin: number;
  remaining: number;
  duration: number;
  destroyed: boolean;
  lift: number;
  chainDepth: number;
  hitTargets: Set<string>;
}

interface Phase16Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  location: CartWorldLocation;
  step(input: RallyInputState, fixedDelta?: number): void;
  ramCombo?: number;
  ramComboTimer?: number;
  turboRechargeTimer?: number;
  gas?: number;
  lastReward?: string | null;
  rewardTimer?: number;
}

interface Phase16WebGL {
  session: CartArenaSession;
  enemyGroups: Map<string, THREE.Group>;
  updateVisuals(delta: number): void;
}

interface EnemyBeforeStep {
  hp: number;
  alive: boolean;
  touching: boolean;
}

export interface CartChainCombatState {
  combo: number;
  timer: number;
  lastLabel: string | null;
  serial: number;
  lastDamage: number;
  lastDestroyed: boolean;
}

const reactionsBySession = new WeakMap<object, Map<string, EnemyReaction>>();
const chainStateBySession = new WeakMap<object, CartChainCombatState>();

const STAGE_CLEAR_NODES = new Map<string, number>([
  ["arena-02", 1],
  ["arena-03", 2],
  ["boss-01", 3],
]);

export function cartStageClearNumber(nodeId: string): number | null {
  return STAGE_CLEAR_NODES.get(nodeId) ?? null;
}

export function isCartPerkStageClear(nodeId: string): boolean {
  const stage = cartStageClearNumber(nodeId);
  return stage === 1 || stage === 2;
}

function reactionsFor(session: Phase16Session): Map<string, EnemyReaction> {
  const key = session as unknown as object;
  const current = reactionsBySession.get(key);
  if (current) return current;
  const created = new Map<string, EnemyReaction>();
  reactionsBySession.set(key, created);
  return created;
}

function chainStateFor(session: Phase16Session): CartChainCombatState {
  const key = session as unknown as object;
  const current = chainStateBySession.get(key);
  if (current) return current;
  const created: CartChainCombatState = { combo: 0, timer: 0, lastLabel: null, serial: 0, lastDamage: 0, lastDestroyed: false };
  chainStateBySession.set(key, created);
  return created;
}

export function getCartChainCombatState(session: CartArenaSession): CartChainCombatState {
  return { ...chainStateFor(session as unknown as Phase16Session) };
}

export function isCartEnemyAirborne(session: CartArenaSession, enemyId: string): boolean {
  return reactionsFor(session as unknown as Phase16Session).has(enemyId);
}

function reactionPower(enemy: CartEnemyState, destroyed: boolean, damage: number, carSpeed: number): number {
  const speedBonus = Math.min(5, Math.max(0, carSpeed - 7) * 0.24);
  const damageBonus = Math.min(4, damage * 0.025);
  const modifiers = getCartRunModifiers();
  const base = enemy.kind === "boss"
    ? (destroyed ? 8.5 : 4.2) + speedBonus * 0.35 + damageBonus * 0.25
    : enemy.kind === "heavy"
      ? (destroyed ? 10.5 : 5.8) + speedBonus * 0.55 + damageBonus * 0.45
      : (destroyed ? 15 : 8.2) + speedBonus + damageBonus;
  return base * modifiers.launchForceMultiplier;
}

function setReaction(
  session: Phase16Session,
  enemy: CartEnemyState,
  destroyed: boolean,
  damage: number,
  impactSpeed: number,
  directionX: number,
  directionZ: number,
  chainDepth: number,
): void {
  const power = reactionPower(enemy, destroyed, damage, impactSpeed);
  const length = Math.hypot(directionX, directionZ) || 1;
  const dx = directionX / length;
  const dz = directionZ / length;
  const duration = destroyed
    ? enemy.kind === "boss" ? 0.9 : enemy.kind === "heavy" ? 0.78 : 0.68
    : enemy.kind === "boss" ? 0.22 : enemy.kind === "heavy" ? 0.32 : 0.4;
  const side = enemy.id.length % 2 === 0 ? 1 : -1;
  reactionsFor(session).set(enemy.id, {
    vx: dx * power,
    vz: dz * power,
    spin: side * (destroyed ? enemy.kind === "boss" ? 2.8 : 5.4 : 2.2),
    remaining: duration,
    duration,
    destroyed,
    lift: destroyed ? enemy.kind === "boss" ? 1.5 : enemy.kind === "heavy" ? 1.85 : 2.45 : 0.7,
    chainDepth,
    hitTargets: new Set<string>([enemy.id]),
  });
}

function beginEnemyReaction(
  session: Phase16Session,
  enemy: CartEnemyState,
  destroyed: boolean,
  damage: number,
  impactSpeed = Math.abs(session.car.forwardVelocity),
  chainDepth = 0,
): void {
  let dx = enemy.x - session.car.position.x;
  let dz = enemy.z - session.car.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.25) {
    dx = Math.sin(session.car.heading);
    dz = Math.cos(session.car.heading);
  } else {
    dx /= distance;
    dz /= distance;
    dx = dx * 0.35 + Math.sin(session.car.heading) * 0.65;
    dz = dz * 0.35 + Math.cos(session.car.heading) * 0.65;
  }
  setReaction(session, enemy, destroyed, damage, impactSpeed, dx, dz, chainDepth);
}

export function launchCartEnemyFromVector(
  session: CartArenaSession,
  enemy: CartEnemyState,
  directionX: number,
  directionZ: number,
  impactSpeed: number,
  destroyed = !enemy.alive,
  damage = 0,
  chainDepth = 0,
): void {
  setReaction(session as unknown as Phase16Session, enemy, destroyed, damage, impactSpeed, directionX, directionZ, chainDepth);
}

function constrainReaction(enemy: CartEnemyState): void {
  const shape = cartArenaShapeForNode(enemy.nodeId);
  if (shape) {
    const projection = projectCartPointInsideArena(enemy.nodeId, enemy.x, enemy.z, enemy.radius + 0.35);
    if (projection.corrected) {
      enemy.x = projection.x - projection.normalX * 0.08;
      enemy.z = projection.z - projection.normalZ * 0.08;
    }
    return;
  }
  const node = cartWorldNodeById(enemy.nodeId);
  if (!node) return;
  enemy.x = Math.max(node.rect.centerX - node.rect.halfWidth + enemy.radius, Math.min(node.rect.centerX + node.rect.halfWidth - enemy.radius, enemy.x));
  enemy.z = Math.max(node.rect.centerZ - node.rect.halfDepth + enemy.radius, Math.min(node.rect.centerZ + node.rect.halfDepth - enemy.radius, enemy.z));
}

function registerChainImpact(
  session: Phase16Session,
  source: CartEnemyState,
  target: CartEnemyState,
  reaction: EnemyReaction,
  damage: number,
  destroyed: boolean,
): void {
  const state = chainStateFor(session);
  state.combo = state.timer > 0 ? state.combo + 1 : 1;
  state.timer = 2.8;
  state.serial += 1;
  state.lastDamage = damage;
  state.lastDestroyed = destroyed;
  state.lastLabel = destroyed
    ? `CHAIN KO ×${state.combo} · ${source.id.toUpperCase()} > ${target.id.toUpperCase()}`
    : `CHAIN HIT ×${state.combo} · ${damage}`;

  const modifiers = getCartRunModifiers();
  if (typeof session.ramCombo === "number") session.ramCombo = Math.max(session.ramCombo, state.combo + 1);
  if (typeof session.ramComboTimer === "number") session.ramComboTimer = Math.max(session.ramComboTimer, 2.8);
  if (typeof session.lastReward !== "undefined") session.lastReward = state.lastLabel;
  if (typeof session.rewardTimer === "number") session.rewardTimer = Math.max(session.rewardTimer, 1.35);
  if (destroyed && typeof session.gas === "number") session.gas = Math.min(1, session.gas + modifiers.gasOnChainKill);
  if (destroyed && typeof session.turboRechargeTimer === "number") session.turboRechargeTimer += 0.35 + Math.min(0.4, reaction.chainDepth * 0.08);
  session.car.collisionImpact = Math.max(session.car.collisionImpact, destroyed ? 1 : 0.72);
}

function resolveReactionChainCollisions(session: Phase16Session, source: CartEnemyState, reaction: EnemyReaction): void {
  if (reaction.chainDepth >= 4) return;
  const speed = Math.hypot(reaction.vx, reaction.vz);
  if (speed < 4.8) return;
  const modifiers = getCartRunModifiers();

  for (const target of session.enemies) {
    if (!target.alive || target.nodeId !== source.nodeId || target.id === source.id || reaction.hitTargets.has(target.id)) continue;
    const dx = target.x - source.x;
    const dz = target.z - source.z;
    const radius = source.radius + target.radius + 0.3;
    if (dx * dx + dz * dz > radius * radius) continue;

    reaction.hitTargets.add(target.id);
    let damage = (34 + speed * 4.15) * modifiers.chainDamageMultiplier;
    if (source.kind === "heavy") damage *= 1.12;
    if (source.kind === "boss") damage *= 1.25;
    if (source.archetype === "bomber") damage *= 1.22 * modifiers.explosionDamageMultiplier;
    if (target.kind === "heavy") damage *= 0.74;
    if (target.kind === "boss") damage *= 0.56;
    const rounded = Math.max(1, Math.round(damage));
    target.hp = Math.max(0, target.hp - rounded);
    target.alive = target.hp > 0;
    const destroyed = !target.alive;

    const directionLength = Math.hypot(reaction.vx, reaction.vz) || 1;
    setReaction(
      session,
      target,
      destroyed,
      rounded,
      speed,
      reaction.vx / directionLength,
      reaction.vz / directionLength,
      reaction.chainDepth + 1,
    );
    registerChainImpact(session, source, target, reaction, rounded, destroyed);
    reaction.vx *= destroyed ? 0.78 : 0.63;
    reaction.vz *= destroyed ? 0.78 : 0.63;
    if (speed < 7.5) break;
  }
}

function advanceEnemyReactions(session: Phase16Session, delta: number): void {
  const reactions = reactionsFor(session);
  const chainState = chainStateFor(session);
  chainState.timer = Math.max(0, chainState.timer - delta);
  if (chainState.timer <= 0) chainState.combo = 0;

  for (const [enemyId, reaction] of Array.from(reactions.entries())) {
    const enemy = session.enemies.find((candidate) => candidate.id === enemyId);
    if (!enemy) {
      reactions.delete(enemyId);
      continue;
    }
    enemy.x += reaction.vx * delta;
    enemy.z += reaction.vz * delta;
    enemy.heading += reaction.spin * delta * (reaction.destroyed ? 0.55 : 0.28);
    resolveReactionChainCollisions(session, enemy, reaction);
    const drag = Math.pow(reaction.destroyed ? 0.94 : 0.88, delta * 60);
    reaction.vx *= drag;
    reaction.vz *= drag;
    reaction.spin *= Math.pow(0.96, delta * 60);
    reaction.remaining = Math.max(0, reaction.remaining - delta);
    constrainReaction(enemy);
    if (reaction.remaining <= 0) reactions.delete(enemyId);
  }
}

function applyReactionVisuals(demo: Phase16WebGL): void {
  const session = demo.session as unknown as Phase16Session;
  const reactions = reactionsFor(session);
  for (const [enemyId, reaction] of reactions) {
    const enemy = session.enemies.find((candidate) => candidate.id === enemyId);
    const group = demo.enemyGroups.get(enemyId);
    if (!enemy || !group) continue;
    const progress = 1 - reaction.remaining / Math.max(0.001, reaction.duration);
    const arc = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI);
    group.visible = true;
    group.position.x = enemy.x;
    group.position.z = enemy.z;
    group.position.y = arc * reaction.lift;
    group.rotation.y = enemy.heading;
    group.rotation.z = arc * reaction.spin * 0.16;
    group.rotation.x = reaction.destroyed ? progress * reaction.spin * 0.38 : arc * reaction.spin * 0.06;
  }
}

export function installCartRoguePhase16Flow(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase16Session;
  const originalStep = sessionPrototype.step;
  sessionPrototype.step = function stepPhase16(this: Phase16Session, input: RallyInputState, fixedDelta = 1 / 60): void {
    const impactSpeed = Math.abs(this.car.forwardVelocity);
    const carX = this.car.position.x;
    const carZ = this.car.position.z;
    const before = new Map<string, EnemyBeforeStep>();
    for (const enemy of this.enemies) {
      const dx = carX - enemy.x;
      const dz = carZ - enemy.z;
      const contactRadius = enemy.radius + 1.55;
      before.set(enemy.id, {
        hp: enemy.hp,
        alive: enemy.alive,
        touching: enemy.alive && dx * dx + dz * dz <= contactRadius * contactRadius,
      });
    }

    originalStep.call(this, input, fixedDelta);

    const reactions = reactionsFor(this);
    for (const enemy of this.enemies) {
      const previous = before.get(enemy.id);
      if (!previous) continue;
      if (enemy.hp < previous.hp) {
        beginEnemyReaction(this, enemy, previous.alive && !enemy.alive, previous.hp - enemy.hp, impactSpeed);
      } else if (previous.touching && previous.alive && impactSpeed >= 7.5 && !reactions.has(enemy.id)) {
        beginEnemyReaction(this, enemy, false, 0, impactSpeed * 0.72);
      }
    }
    advanceEnemyReactions(this, fixedDelta);
  };

  const webglPrototype = CartRogueWebGLDemo.prototype as unknown as Phase16WebGL;
  const originalUpdateVisuals = webglPrototype.updateVisuals;
  webglPrototype.updateVisuals = function updateVisualsPhase16(this: Phase16WebGL, delta: number): void {
    originalUpdateVisuals.call(this, delta);
    applyReactionVisuals(this);
  };
}

installCartRoguePhase16Flow();

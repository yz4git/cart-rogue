import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import type { CartEnemyState } from "./CartCombat";
import { cartArenaShapeForNode, projectCartPointInsideArena } from "./CartArenaShapes";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { cartWorldNodeById, type CartWorldLocation } from "./CartWorldGraph";

interface EnemyReaction {
  vx: number;
  vz: number;
  spin: number;
  remaining: number;
  duration: number;
  destroyed: boolean;
  lift: number;
}

interface Phase16Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  location: CartWorldLocation;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface Phase16WebGL {
  session: CartArenaSession;
  enemyGroups: Map<string, THREE.Group>;
  updateVisuals(delta: number): void;
}

const reactionsBySession = new WeakMap<object, Map<string, EnemyReaction>>();

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

function reactionPower(enemy: CartEnemyState, destroyed: boolean, damage: number, carSpeed: number): number {
  const speedBonus = Math.min(5, Math.max(0, carSpeed - 7) * 0.24);
  const damageBonus = Math.min(4, damage * 0.025);
  if (enemy.kind === "boss") return (destroyed ? 8.5 : 4.2) + speedBonus * 0.35 + damageBonus * 0.25;
  if (enemy.kind === "heavy") return (destroyed ? 10.5 : 5.8) + speedBonus * 0.55 + damageBonus * 0.45;
  return (destroyed ? 15 : 8.2) + speedBonus + damageBonus;
}

function beginEnemyReaction(session: Phase16Session, enemy: CartEnemyState, destroyed: boolean, damage: number): void {
  const power = reactionPower(enemy, destroyed, damage, Math.abs(session.car.forwardVelocity));
  let dx = enemy.x - session.car.position.x;
  let dz = enemy.z - session.car.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.25) {
    dx = Math.sin(session.car.heading);
    dz = Math.cos(session.car.heading);
  } else {
    dx /= distance;
    dz /= distance;
    // Bias the launch toward the player's travel direction so a clean RAM
    // reads as the target being carried through the hit rather than popping
    // sideways at random.
    dx = dx * 0.35 + Math.sin(session.car.heading) * 0.65;
    dz = dz * 0.35 + Math.cos(session.car.heading) * 0.65;
    const blended = Math.hypot(dx, dz) || 1;
    dx /= blended;
    dz /= blended;
  }

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
  });
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

function advanceEnemyReactions(session: Phase16Session, delta: number): void {
  const reactions = reactionsFor(session);
  for (const [enemyId, reaction] of reactions) {
    const enemy = session.enemies.find((candidate) => candidate.id === enemyId);
    if (!enemy) {
      reactions.delete(enemyId);
      continue;
    }
    enemy.x += reaction.vx * delta;
    enemy.z += reaction.vz * delta;
    enemy.heading += reaction.spin * delta * (reaction.destroyed ? 0.55 : 0.28);
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
    const before = new Map(this.enemies.map((enemy) => [enemy.id, { hp: enemy.hp, alive: enemy.alive }] as const));
    originalStep.call(this, input, fixedDelta);

    for (const enemy of this.enemies) {
      const previous = before.get(enemy.id);
      if (!previous || enemy.hp >= previous.hp) continue;
      beginEnemyReaction(this, enemy, previous.alive && !enemy.alive, previous.hp - enemy.hp);
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

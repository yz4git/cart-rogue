import { getCartRunModifiers } from "./CartRunProgression";

export type CartEnemyKind = "blocker" | "heavy" | "chaser" | "boss";

export interface CartEnemyState {
  id: string;
  nodeId: string;
  kind: CartEnemyKind;
  x: number;
  z: number;
  radius: number;
  maxHp: number;
  hp: number;
  alive: boolean;
  heading: number;
  moveSpeed: number;
  aiClock?: number;
  chargeCooldown?: number;
  chargeTime?: number;
}

export interface CartRamResult {
  hit: boolean;
  destroyed: boolean;
  enemyId: string | null;
  damage: number;
}

export const CART_RAM_MIN_SPEED = 8;

export function createInitialCartEnemies(): CartEnemyState[] {
  return [
    // Arena 01 stays intentionally readable so the first room teaches the
    // core loop before the roguelite build starts stacking modifiers.
    { id: "enemy-a", nodeId: "arena-01", kind: "blocker", x: -10, z: 25, radius: 1.75, maxHp: 100, hp: 100, alive: true, heading: 0.5, moveSpeed: 0 },
    { id: "enemy-b", nodeId: "arena-01", kind: "blocker", x: 10, z: 34, radius: 1.75, maxHp: 100, hp: 100, alive: true, heading: -0.8, moveSpeed: 0 },
    { id: "enemy-c", nodeId: "arena-01", kind: "chaser", x: -4, z: 43, radius: 1.72, maxHp: 100, hp: 100, alive: true, heading: 2.2, moveSpeed: 2.8 },
    { id: "enemy-e", nodeId: "arena-02", kind: "chaser", x: -16, z: 108, radius: 1.72, maxHp: 100, hp: 100, alive: true, heading: 0.4, moveSpeed: 4.0 },
    { id: "enemy-f", nodeId: "arena-02", kind: "chaser", x: 16, z: 120, radius: 1.72, maxHp: 100, hp: 100, alive: true, heading: -1.0, moveSpeed: 4.2 },
    { id: "enemy-g", nodeId: "arena-02", kind: "blocker", x: -7, z: 130, radius: 1.82, maxHp: 110, hp: 110, alive: true, heading: 2.4, moveSpeed: 0 },
    { id: "elite-a", nodeId: "arena-02", kind: "heavy", x: 9, z: 109, radius: 2.45, maxHp: 220, hp: 220, alive: true, heading: -2.5, moveSpeed: 2.0 },
    {
      id: "boss-a",
      nodeId: "boss-01",
      kind: "boss",
      x: 0,
      z: 218,
      radius: 3.45,
      maxHp: 520,
      hp: 520,
      alive: true,
      heading: Math.PI,
      moveSpeed: 2.8,
      aiClock: 0,
      chargeCooldown: 1.65,
      chargeTime: 0,
    },
  ];
}

export function aliveCartEnemies(enemies: readonly CartEnemyState[], nodeId?: string): CartEnemyState[] {
  return enemies.filter((enemy) => enemy.alive && (nodeId === undefined || enemy.nodeId === nodeId));
}

export function cartEnemyContact(
  enemy: CartEnemyState,
  x: number,
  z: number,
  carRadius = 1.45,
): boolean {
  if (!enemy.alive) return false;
  const dx = x - enemy.x;
  const dz = z - enemy.z;
  const radius = enemy.radius + carRadius;
  return dx * dx + dz * dz <= radius * radius;
}

export function cartBossPhase(enemy: Pick<CartEnemyState, "kind" | "hp" | "maxHp">): 1 | 2 | 3 {
  if (enemy.kind !== "boss") return 1;
  const ratio = enemy.hp / Math.max(1, enemy.maxHp);
  if (ratio > 0.66) return 1;
  if (ratio > 0.33) return 2;
  return 3;
}

export function updateCartEnemyMovement(
  enemies: readonly CartEnemyState[],
  nodeId: string,
  playerX: number,
  playerZ: number,
  deltaSeconds: number,
  bounds: { centerX: number; centerZ: number; halfWidth: number; halfDepth: number },
): void {
  const delta = Math.max(0, Math.min(0.05, deltaSeconds));
  const modifiers = getCartRunModifiers();
  for (const enemy of enemies) {
    if (!enemy.alive || enemy.nodeId !== nodeId || enemy.moveSpeed <= 0) continue;
    const dx = playerX - enemy.x;
    const dz = playerZ - enemy.z;
    const distance = Math.hypot(dx, dz);
    const activationDistance = enemy.kind === "boss" ? 38 : enemy.kind === "heavy" ? 18 : 25;
    if (distance < 0.001 || distance > activationDistance) continue;

    if (enemy.kind === "boss") {
      updateBossMovement(enemy, playerX, playerZ, distance, delta, bounds, modifiers.enemySpeedMultiplier);
      continue;
    }

    const heavyLike = enemy.kind === "heavy";
    const closeRange = heavyLike && distance < 6.8;
    const side = stableEnemySide(enemy.id);
    let targetHeading = Math.atan2(dx, dz);
    if (closeRange) {
      // Heavy enemies cross the player's line instead of settling into a long
      // side-by-side lock.
      targetHeading = normalizeAngle(targetHeading + side * 0.92);
    }

    const turn = normalizeAngle(targetHeading - enemy.heading);
    const baseTurn = enemy.kind === "heavy" ? 1.25 : 2.35;
    const closeTurnBoost = closeRange ? 1.35 : 1;
    const maxTurn = baseTurn * closeTurnBoost * delta;
    enemy.heading = normalizeAngle(enemy.heading + Math.max(-maxTurn, Math.min(maxTurn, turn)));

    const nearScale = closeRange ? 0.4 : distance < 5 ? 0.55 : 1;
    const speed = enemy.moveSpeed * nearScale * modifiers.enemySpeedMultiplier;
    enemy.x += Math.sin(enemy.heading) * speed * delta;
    enemy.z += Math.cos(enemy.heading) * speed * delta;
    clampEnemyToBounds(enemy, bounds);
  }
}

function updateBossMovement(
  enemy: CartEnemyState,
  playerX: number,
  playerZ: number,
  distance: number,
  delta: number,
  bounds: { centerX: number; centerZ: number; halfWidth: number; halfDepth: number },
  enemySpeedMultiplier: number,
): void {
  const phase = cartBossPhase(enemy);
  enemy.aiClock = (enemy.aiClock ?? 0) + delta;
  enemy.chargeCooldown = Math.max(0, (enemy.chargeCooldown ?? 0) - delta);
  enemy.chargeTime = Math.max(0, enemy.chargeTime ?? 0);
  const dx = playerX - enemy.x;
  const dz = playerZ - enemy.z;
  const directHeading = Math.atan2(dx, dz);
  const side = stableEnemySide(enemy.id);

  if ((enemy.chargeTime ?? 0) > 0) {
    enemy.chargeTime = Math.max(0, (enemy.chargeTime ?? 0) - delta);
    const turn = normalizeAngle(directHeading - enemy.heading);
    const chargeTurnRate = phase === 3 ? 1.15 : phase === 2 ? 0.9 : 0.68;
    const maxTurn = chargeTurnRate * delta;
    enemy.heading = normalizeAngle(enemy.heading + Math.max(-maxTurn, Math.min(maxTurn, turn)));
    const chargeMultiplier = phase === 3 ? 3.25 : phase === 2 ? 2.75 : 2.25;
    const chargeSpeed = enemy.moveSpeed * chargeMultiplier * enemySpeedMultiplier;
    enemy.x += Math.sin(enemy.heading) * chargeSpeed * delta;
    enemy.z += Math.cos(enemy.heading) * chargeSpeed * delta;
    clampEnemyToBounds(enemy, bounds);
    return;
  }

  const orbitAmount = phase === 1 ? 0.45 : phase === 2 ? 0.72 : 0.92;
  const pulse = Math.sin((enemy.aiClock ?? 0) * (phase === 3 ? 1.7 : 1.1)) * 0.18;
  const desiredHeading = normalizeAngle(directHeading + side * (orbitAmount + pulse));
  const turn = normalizeAngle(desiredHeading - enemy.heading);
  const turnRate = phase === 3 ? 1.65 : phase === 2 ? 1.28 : 0.96;
  const maxTurn = turnRate * delta;
  enemy.heading = normalizeAngle(enemy.heading + Math.max(-maxTurn, Math.min(maxTurn, turn)));

  const nearScale = distance < 8 ? 0.55 : 1;
  const pressure = phase === 3 ? 1.45 : phase === 2 ? 1.2 : 1;
  const cruiseSpeed = enemy.moveSpeed * pressure * nearScale * enemySpeedMultiplier;
  enemy.x += Math.sin(enemy.heading) * cruiseSpeed * delta;
  enemy.z += Math.cos(enemy.heading) * cruiseSpeed * delta;
  clampEnemyToBounds(enemy, bounds);

  const chargeRange = phase === 1 ? 24 : phase === 2 ? 29 : 34;
  if ((enemy.chargeCooldown ?? 0) <= 0 && distance > 7 && distance < chargeRange) {
    enemy.heading = directHeading;
    enemy.chargeTime = phase === 3 ? 0.72 : phase === 2 ? 0.62 : 0.52;
    enemy.chargeCooldown = phase === 3 ? 1.45 : phase === 2 ? 1.9 : 2.35;
  }
}

export function breakHeavyParallelContact(enemy: CartEnemyState, playerHeading: number): void {
  if (enemy.kind !== "heavy" && enemy.kind !== "boss") return;
  const headingDifference = Math.abs(normalizeAngle(enemy.heading - playerHeading));
  if (headingDifference > 0.72) return;
  enemy.heading = normalizeAngle(enemy.heading + stableEnemySide(enemy.id) * (enemy.kind === "boss" ? 0.82 : 0.98));
}

export function applyTurboRam(
  enemy: CartEnemyState,
  turboActive: boolean,
  forwardSpeed: number,
): CartRamResult {
  if (!enemy.alive) return { hit: false, destroyed: false, enemyId: null, damage: 0 };
  if (!turboActive || Math.abs(forwardSpeed) < CART_RAM_MIN_SPEED) {
    return { hit: true, destroyed: false, enemyId: enemy.id, damage: 0 };
  }
  const absoluteSpeed = Math.abs(forwardSpeed);
  const speedBonus = Math.max(0, Math.min(45, (absoluteSpeed - CART_RAM_MIN_SPEED) * 2.5));
  const baseDamage = enemy.kind === "boss" ? 88 : enemy.kind === "heavy" ? 105 : 115;
  const modifiers = getCartRunModifiers();
  let damage = baseDamage + speedBonus;
  damage *= modifiers.ramDamageMultiplier;
  if (enemy.kind === "heavy") damage *= modifiers.heavyDamageMultiplier;
  if (enemy.kind === "boss") damage *= modifiers.bossDamageMultiplier;
  if (absoluteSpeed >= modifiers.redlineSpeed) damage *= modifiers.redlineDamageMultiplier;
  if (enemy.hp / Math.max(1, enemy.maxHp) <= modifiers.executionThreshold) {
    damage *= modifiers.executionDamageMultiplier;
  }
  const roundedDamage = Math.max(1, Math.round(damage));
  enemy.hp = Math.max(0, enemy.hp - roundedDamage);
  enemy.alive = enemy.hp > 0;
  return { hit: true, destroyed: !enemy.alive, enemyId: enemy.id, damage: roundedDamage };
}

function clampEnemyToBounds(
  enemy: CartEnemyState,
  bounds: { centerX: number; centerZ: number; halfWidth: number; halfDepth: number },
): void {
  const margin = enemy.radius + 0.8;
  enemy.x = Math.max(bounds.centerX - bounds.halfWidth + margin, Math.min(bounds.centerX + bounds.halfWidth - margin, enemy.x));
  enemy.z = Math.max(bounds.centerZ - bounds.halfDepth + margin, Math.min(bounds.centerZ + bounds.halfDepth - margin, enemy.z));
}

function stableEnemySide(id: string): -1 | 1 {
  let checksum = 0;
  for (let index = 0; index < id.length; index += 1) checksum += id.charCodeAt(index);
  return checksum % 2 === 0 ? 1 : -1;
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

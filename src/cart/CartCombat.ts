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
    { id: "enemy-a", nodeId: "arena-01", kind: "blocker", x: -11, z: 25, radius: 1.75, maxHp: 100, hp: 100, alive: true, heading: 0.5, moveSpeed: 0 },
    { id: "enemy-b", nodeId: "arena-01", kind: "blocker", x: 10, z: 32, radius: 1.75, maxHp: 100, hp: 100, alive: true, heading: -0.8, moveSpeed: 0 },
    { id: "enemy-c", nodeId: "arena-01", kind: "chaser", x: -4, z: 42, radius: 1.72, maxHp: 100, hp: 100, alive: true, heading: 2.2, moveSpeed: 3.3 },
    { id: "enemy-d", nodeId: "arena-01", kind: "heavy", x: 13, z: 45, radius: 2.15, maxHp: 160, hp: 160, alive: true, heading: -2.1, moveSpeed: 1.4 },
    { id: "enemy-e", nodeId: "arena-02", kind: "chaser", x: -16, z: 108, radius: 1.72, maxHp: 100, hp: 100, alive: true, heading: 0.4, moveSpeed: 4.0 },
    { id: "enemy-f", nodeId: "arena-02", kind: "chaser", x: 16, z: 120, radius: 1.72, maxHp: 100, hp: 100, alive: true, heading: -1.0, moveSpeed: 4.2 },
    { id: "enemy-g", nodeId: "arena-02", kind: "blocker", x: -7, z: 130, radius: 1.82, maxHp: 110, hp: 110, alive: true, heading: 2.4, moveSpeed: 0 },
    { id: "elite-a", nodeId: "arena-02", kind: "heavy", x: 9, z: 109, radius: 2.45, maxHp: 220, hp: 220, alive: true, heading: -2.5, moveSpeed: 2.0 },
    { id: "boss-a", nodeId: "boss-01", kind: "boss", x: 0, z: 218, radius: 3.45, maxHp: 520, hp: 520, alive: true, heading: Math.PI, moveSpeed: 2.8 },
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

export function updateCartEnemyMovement(
  enemies: readonly CartEnemyState[],
  nodeId: string,
  playerX: number,
  playerZ: number,
  deltaSeconds: number,
  bounds: { centerX: number; centerZ: number; halfWidth: number; halfDepth: number },
): void {
  const delta = Math.max(0, Math.min(0.05, deltaSeconds));
  for (const enemy of enemies) {
    if (!enemy.alive || enemy.nodeId !== nodeId || enemy.moveSpeed <= 0) continue;
    const dx = playerX - enemy.x;
    const dz = playerZ - enemy.z;
    const distance = Math.hypot(dx, dz);
    const activationDistance = enemy.kind === "boss" ? 38 : enemy.kind === "heavy" ? 18 : 25;
    if (distance < 0.001 || distance > activationDistance) continue;
    const targetHeading = Math.atan2(dx, dz);
    const turn = normalizeAngle(targetHeading - enemy.heading);
    const hpPressure = enemy.kind === "boss" ? 1 + (1 - enemy.hp / Math.max(1, enemy.maxHp)) * 0.75 : 1;
    const baseTurn = enemy.kind === "boss" ? 0.95 : enemy.kind === "heavy" ? 1.25 : 2.35;
    const maxTurn = baseTurn * hpPressure * delta;
    enemy.heading += Math.max(-maxTurn, Math.min(maxTurn, turn));
    const speed = enemy.moveSpeed * hpPressure * (distance < (enemy.kind === "boss" ? 7 : 5) ? 0.55 : 1);
    enemy.x += Math.sin(enemy.heading) * speed * delta;
    enemy.z += Math.cos(enemy.heading) * speed * delta;
    const margin = enemy.radius + 0.8;
    enemy.x = Math.max(bounds.centerX - bounds.halfWidth + margin, Math.min(bounds.centerX + bounds.halfWidth - margin, enemy.x));
    enemy.z = Math.max(bounds.centerZ - bounds.halfDepth + margin, Math.min(bounds.centerZ + bounds.halfDepth - margin, enemy.z));
  }
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
  const speedBonus = Math.max(0, Math.min(45, (Math.abs(forwardSpeed) - CART_RAM_MIN_SPEED) * 2.5));
  const baseDamage = enemy.kind === "boss" ? 88 : enemy.kind === "heavy" ? 105 : 115;
  const damage = Math.round(baseDamage + speedBonus);
  enemy.hp = Math.max(0, enemy.hp - damage);
  enemy.alive = enemy.hp > 0;
  return { hit: true, destroyed: !enemy.alive, enemyId: enemy.id, damage };
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

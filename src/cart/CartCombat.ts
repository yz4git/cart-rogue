export type CartEnemyKind = "blocker" | "heavy";

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
}

export interface CartRamResult {
  hit: boolean;
  destroyed: boolean;
  enemyId: string | null;
}

export const CART_RAM_MIN_SPEED = 8;

export function createInitialCartEnemies(): CartEnemyState[] {
  return [
    { id: "enemy-a", nodeId: "arena-01", kind: "blocker", x: -11, z: 25, radius: 1.75, maxHp: 100, hp: 100, alive: true },
    { id: "enemy-b", nodeId: "arena-01", kind: "blocker", x: 10, z: 32, radius: 1.75, maxHp: 100, hp: 100, alive: true },
    { id: "enemy-c", nodeId: "arena-01", kind: "blocker", x: -4, z: 42, radius: 1.75, maxHp: 100, hp: 100, alive: true },
    { id: "enemy-d", nodeId: "arena-01", kind: "heavy", x: 13, z: 45, radius: 2.15, maxHp: 100, hp: 100, alive: true },
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

export function applyTurboRam(
  enemy: CartEnemyState,
  turboActive: boolean,
  forwardSpeed: number,
): CartRamResult {
  if (!enemy.alive) return { hit: false, destroyed: false, enemyId: null };
  if (!turboActive || Math.abs(forwardSpeed) < CART_RAM_MIN_SPEED) {
    return { hit: true, destroyed: false, enemyId: enemy.id };
  }
  enemy.hp = 0;
  enemy.alive = false;
  return { hit: true, destroyed: true, enemyId: enemy.id };
}

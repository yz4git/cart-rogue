export type CartObstacleKind = "rock";

export interface CartObstacleState {
  id: string;
  nodeId: string;
  kind: CartObstacleKind;
  x: number;
  z: number;
  radius: number;
  scale: number;
  variant: 0 | 1 | 2;
  destroyed: boolean;
}

export interface CartObstacleHitResult {
  hit: boolean;
  destroyed: boolean;
}

export const CART_ROCK_SMASH_MIN_SPEED = 8;

export function createInitialCartObstacles(): CartObstacleState[] {
  return [
    { id: "rock-a", nodeId: "arena-01", kind: "rock", x: -22, z: 15, radius: 1.85, scale: 2.2, variant: 0, destroyed: false },
    { id: "rock-b", nodeId: "arena-01", kind: "rock", x: 22, z: 18, radius: 2.25, scale: 2.8, variant: 1, destroyed: false },
    { id: "rock-c", nodeId: "arena-01", kind: "rock", x: -21, z: 43, radius: 1.55, scale: 1.8, variant: 2, destroyed: false },
    { id: "rock-d", nodeId: "arena-01", kind: "rock", x: 21, z: 41, radius: 1.75, scale: 2.1, variant: 0, destroyed: false },
    { id: "rock-e", nodeId: "arena-02", kind: "rock", x: -25, z: 105, radius: 2.25, scale: 2.8, variant: 1, destroyed: false },
    { id: "rock-f", nodeId: "arena-02", kind: "rock", x: 24, z: 126, radius: 2.0, scale: 2.4, variant: 2, destroyed: false },
    { id: "rock-g", nodeId: "boss-01", kind: "rock", x: -28, z: 210, radius: 2.55, scale: 3.2, variant: 0, destroyed: false },
    { id: "rock-h", nodeId: "boss-01", kind: "rock", x: 27, z: 218, radius: 2.2, scale: 2.7, variant: 1, destroyed: false },
  ];
}

export function cartObstacleContact(
  obstacle: CartObstacleState,
  nodeId: string,
  x: number,
  z: number,
  carRadius = 1.45,
): boolean {
  if (obstacle.destroyed || obstacle.nodeId !== nodeId) return false;
  const dx = x - obstacle.x;
  const dz = z - obstacle.z;
  const radius = obstacle.radius + carRadius;
  return dx * dx + dz * dz <= radius * radius;
}

export function cartObstacleSweepContact(
  obstacle: CartObstacleState,
  nodeId: string,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  carRadius = 1.45,
): boolean {
  if (obstacle.destroyed || obstacle.nodeId !== nodeId) return false;
  const vx = toX - fromX;
  const vz = toZ - fromZ;
  const lengthSquared = vx * vx + vz * vz;
  let t = 0;
  if (lengthSquared > 1e-8) {
    t = ((obstacle.x - fromX) * vx + (obstacle.z - fromZ) * vz) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
  }
  const closestX = fromX + vx * t;
  const closestZ = fromZ + vz * t;
  return cartObstacleContact(obstacle, nodeId, closestX, closestZ, carRadius);
}

export function applyTurboRockSmash(
  obstacle: CartObstacleState,
  turboActive: boolean,
  forwardSpeed: number,
): CartObstacleHitResult {
  if (obstacle.destroyed) return { hit: false, destroyed: false };
  if (!turboActive || Math.abs(forwardSpeed) < CART_ROCK_SMASH_MIN_SPEED) {
    return { hit: true, destroyed: false };
  }
  obstacle.destroyed = true;
  return { hit: true, destroyed: true };
}

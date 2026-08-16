import type { CartWorldNode } from "./CartWorldGraph";

export type CartTraversalAxis = { axis: "x" | "z"; sign: 1 | -1 };

export interface CartHorizontalMotion {
  heading: number;
  forwardVelocity: number;
  lateralVelocity: number;
  velocity: { x: number; z: number };
  speed: number;
}

export function cartTraversalClamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function cartTraversalNormalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function cartTraversalRotateToward(current: number, target: number, maxStep: number): number {
  const delta = cartTraversalNormalizeAngle(target - current);
  return cartTraversalNormalizeAngle(current + cartTraversalClamp(delta, -maxStep, maxStep));
}

export function cartTraversalAxisToNext(from: CartWorldNode, to: CartWorldNode): CartTraversalAxis {
  const dx = to.rect.centerX - from.rect.centerX;
  const dz = to.rect.centerZ - from.rect.centerZ;
  if (Math.abs(dz) >= Math.abs(dx)) return { axis: "z", sign: dz >= 0 ? 1 : -1 };
  return { axis: "x", sign: dx >= 0 ? 1 : -1 };
}

export function cartTraversalSyncHorizontalVelocity(car: CartHorizontalMotion): void {
  const forwardX = Math.sin(car.heading);
  const forwardZ = Math.cos(car.heading);
  const rightX = Math.cos(car.heading);
  const rightZ = -Math.sin(car.heading);
  car.velocity.x = forwardX * car.forwardVelocity + rightX * car.lateralVelocity;
  car.velocity.z = forwardZ * car.forwardVelocity + rightZ * car.lateralVelocity;
  car.speed = Math.hypot(car.velocity.x, car.velocity.z);
}

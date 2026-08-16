import type { RallyInputState } from "../rally/RallyTypes";
import type { CartHorizontalMotion } from "./CartTraversalMath";
import { cartTraversalAxisToNext } from "./CartTraversalMath";
import type { CartWorldNode } from "./CartWorldGraph";

export type CartTraversalIntentDirection = "axis" | "center";

export interface CartTraversalIntentOptions {
  direction: CartTraversalIntentDirection;
  brakeLimit: number;
  velocityThreshold: number;
  throttleThreshold: number;
  forwardThreshold: number;
}

function directionVector(
  from: CartWorldNode,
  to: CartWorldNode,
  mode: CartTraversalIntentDirection,
): { x: number; z: number } {
  if (mode === "axis") {
    const axis = cartTraversalAxisToNext(from, to);
    return {
      x: axis.axis === "x" ? axis.sign : 0,
      z: axis.axis === "z" ? axis.sign : 0,
    };
  }

  const dx = to.rect.centerX - from.rect.centerX;
  const dz = to.rect.centerZ - from.rect.centerZ;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

export function cartTraversalHasExitIntent(
  car: CartHorizontalMotion,
  from: CartWorldNode,
  to: CartWorldNode,
  input: RallyInputState,
  options: CartTraversalIntentOptions,
): boolean {
  if (input.brake >= options.brakeLimit) return false;
  const direction = directionVector(from, to, options.direction);
  const velocityDot = car.velocity.x * direction.x + car.velocity.z * direction.z;
  const forwardX = Math.sin(car.heading);
  const forwardZ = Math.cos(car.heading);
  const forwardDot = forwardX * direction.x + forwardZ * direction.z;
  return velocityDot > options.velocityThreshold
    || (input.throttle > options.throttleThreshold && forwardDot > options.forwardThreshold);
}

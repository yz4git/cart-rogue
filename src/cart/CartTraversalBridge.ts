import { CartArenaSession } from "./CartArenaSession";
import {
  cartTraversalAxisToNext,
  cartTraversalClamp,
  cartTraversalRotateToward,
  cartTraversalSyncHorizontalVelocity,
} from "./CartTraversalMath";
import type { CartWorldLocation, CartWorldNode } from "./CartWorldGraph";

export interface CartTraversalBridgeSession {
  car: CartArenaSession["car"];
  location: CartWorldLocation;
}

export interface CartTraversalBridgeOptions {
  entryInset: number;
  turnMax: number;
  minForwardSpeed: number;
  speedRetention: number;
  lateralRetention: number;
}

/**
 * Move a cart across one authored graph seam without changing the rule that
 * decides whether that seam is open. Callers own gate/encounter/intent checks;
 * this helper only owns safe placement and motion preservation.
 */
export function cartTraversalBridgeIntoNode(
  session: CartTraversalBridgeSession,
  from: CartWorldNode,
  to: CartWorldNode,
  options: CartTraversalBridgeOptions,
): void {
  const direction = cartTraversalAxisToNext(from, to);
  const minX = to.rect.centerX - to.rect.halfWidth + options.entryInset;
  const maxX = to.rect.centerX + to.rect.halfWidth - options.entryInset;
  const minZ = to.rect.centerZ - to.rect.halfDepth + options.entryInset;
  const maxZ = to.rect.centerZ + to.rect.halfDepth - options.entryInset;

  let targetX = cartTraversalClamp(session.car.position.x, minX, maxX);
  let targetZ = cartTraversalClamp(session.car.position.z, minZ, maxZ);
  if (direction.axis === "z") targetZ = direction.sign > 0 ? minZ : maxZ;
  else targetX = direction.sign > 0 ? minX : maxX;

  session.car.position.x = targetX;
  session.car.position.z = targetZ;
  session.location = {
    node: to,
    localX: targetX - to.rect.centerX,
    localZ: targetZ - to.rect.centerZ,
  };

  const desiredHeading = Math.atan2(to.rect.centerX - targetX, to.rect.centerZ - targetZ);
  session.car.heading = cartTraversalRotateToward(session.car.heading, desiredHeading, options.turnMax);
  session.car.forwardVelocity = Math.max(
    options.minForwardSpeed,
    Math.abs(session.car.forwardVelocity) * options.speedRetention,
  );
  session.car.lateralVelocity *= options.lateralRetention;
  cartTraversalSyncHorizontalVelocity(session.car);
}

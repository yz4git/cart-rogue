import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { aliveCartEnemies, type CartEnemyState } from "./CartCombat";
import { cartTraversalHasExitIntent } from "./CartTraversalIntent";
import {
  cartTraversalClamp,
  cartTraversalSyncHorizontalVelocity,
} from "./CartTraversalMath";
import { cartWorldNodeById, type CartWorldLocation } from "./CartWorldGraph";

export interface CartArena03GateSession {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  location: CartWorldLocation;
}

export const CART_ARENA03_GATE_Z = 302.75;
export const CART_ARENA03_GATE_TRIGGER_Z = 300.72;
export const CART_ARENA03_GATE_HALF_OPENING = 9.4;
export const CART_ARENA03_JUNCTION_ENTRY_Z = 304.65;

export function cartArena03GateLocked(enemies: readonly CartEnemyState[]): boolean {
  return aliveCartEnemies(enemies as CartEnemyState[], "arena-03").length > 0;
}

export function cartTryOpenArena03Exit(session: CartArena03GateSession, input: RallyInputState): boolean {
  if (session.location.node.id !== "arena-03") return false;
  if (cartArena03GateLocked(session.enemies)) return false;
  if (Math.abs(session.car.position.x) > CART_ARENA03_GATE_HALF_OPENING) return false;
  if (session.car.position.z < CART_ARENA03_GATE_TRIGGER_Z) return false;

  const target = cartWorldNodeById("junction-04");
  if (!target || !session.location.node.next.includes(target.id)) return false;
  if (!cartTraversalHasExitIntent(session.car, session.location.node, target, input, {
    direction: "axis",
    brakeLimit: 0.58,
    velocityThreshold: 0.08,
    throttleThreshold: 0.04,
    forwardThreshold: -0.22,
  })) return false;

  const minX = target.rect.centerX - target.rect.halfWidth + 1.45;
  const maxX = target.rect.centerX + target.rect.halfWidth - 1.45;
  const targetX = cartTraversalClamp(session.car.position.x, minX, maxX);
  const targetZ = Math.max(CART_ARENA03_JUNCTION_ENTRY_Z, target.rect.centerZ - target.rect.halfDepth + 0.45);

  session.car.position.x = targetX;
  session.car.position.z = targetZ;
  session.location = {
    node: target,
    localX: targetX - target.rect.centerX,
    localZ: targetZ - target.rect.centerZ,
  };
  session.car.forwardVelocity = Math.max(4.2, Math.abs(session.car.forwardVelocity) * 0.96);
  session.car.lateralVelocity *= 0.32;
  cartTraversalSyncHorizontalVelocity(session.car);
  return true;
}

import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { aliveCartEnemies, type CartEnemyState } from "./CartCombat";
import { cartTraversalBridgeIntoNode } from "./CartTraversalBridge";
import { cartTraversalHasExitIntent } from "./CartTraversalIntent";
import { cartTraversalAxisToNext } from "./CartTraversalMath";
import {
  cartWorldNodeById,
  type CartWorldLocation,
  type CartWorldNode,
} from "./CartWorldGraph";

interface Phase48Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  location: CartWorldLocation;
  step(input: RallyInputState, fixedDelta?: number): void;
}

export const CART_PHASE48_EXIT_TRIGGER_DEPTH = 4.25;
export const CART_PHASE48_LATERAL_FUNNEL = 4.2;
export const CART_PHASE48_ENTRY_INSET = 1.45;

function isRouteNode(node: CartWorldNode): boolean {
  return node.id.startsWith("route-");
}

function singleTransitTarget(node: CartWorldNode): CartWorldNode | null {
  if (!isRouteNode(node) || node.next.length !== 1) return null;
  const target = cartWorldNodeById(node.next[0]);
  return target?.kind === "corridor" ? target : null;
}

function distanceOutsideRange(value: number, min: number, max: number): number {
  if (value < min) return min - value;
  if (value > max) return value - max;
  return 0;
}

function nearRouteExit(from: CartWorldNode, to: CartWorldNode, x: number, z: number): boolean {
  const direction = cartTraversalAxisToNext(from, to);
  if (direction.axis === "z") {
    const face = from.rect.centerZ + direction.sign * from.rect.halfDepth;
    const longitudinal = direction.sign > 0 ? face - z : z - face;
    const minX = to.rect.centerX - to.rect.halfWidth;
    const maxX = to.rect.centerX + to.rect.halfWidth;
    const lateralGap = distanceOutsideRange(x, minX, maxX);
    return longitudinal >= -0.45
      && longitudinal <= CART_PHASE48_EXIT_TRIGGER_DEPTH
      && lateralGap <= CART_PHASE48_LATERAL_FUNNEL;
  }

  const face = from.rect.centerX + direction.sign * from.rect.halfWidth;
  const longitudinal = direction.sign > 0 ? face - x : x - face;
  const minZ = to.rect.centerZ - to.rect.halfDepth;
  const maxZ = to.rect.centerZ + to.rect.halfDepth;
  const lateralGap = distanceOutsideRange(z, minZ, maxZ);
  return longitudinal >= -0.45
    && longitudinal <= CART_PHASE48_EXIT_TRIGGER_DEPTH
    && lateralGap <= CART_PHASE48_LATERAL_FUNNEL;
}

export function cartPhase48TryCompleteClearedRouteExit(
  session: Phase48Session,
  from: CartWorldNode,
  input: RallyInputState,
): boolean {
  if (!isRouteNode(from) || session.location.node.id !== from.id) return false;
  if (aliveCartEnemies(session.enemies, from.id).length > 0) return false;
  const target = singleTransitTarget(from);
  if (!target || !from.next.includes(target.id)) return false;
  if (!nearRouteExit(from, target, session.car.position.x, session.car.position.z)) return false;
  if (!cartTraversalHasExitIntent(session.car, from, target, input, {
    direction: "center",
    brakeLimit: 0.55,
    velocityThreshold: 0.08,
    throttleThreshold: 0.04,
    forwardThreshold: -0.08,
  })) return false;
  cartTraversalBridgeIntoNode(session, from, target, {
    entryInset: CART_PHASE48_ENTRY_INSET,
    turnMax: 0.38,
    minForwardSpeed: 4.2,
    speedRetention: 0.95,
    lateralRetention: 0.28,
  });
  return true;
}

export function installCartRoguePhase48RouteExitCompletion(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase48Session;
  const originalStep = prototype.step;
  prototype.step = function phase48RouteExitCompletionStep(
    this: Phase48Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const previous = this.location.node;

    // Curved-route wall projection runs inside older phases. Complete a valid
    // cleared route exit *before* those wall guards can project the cart back
    // into the room. This removes the invisible seam on the late-run merge.
    if (cartPhase48TryCompleteClearedRouteExit(this, previous, input)) return;

    originalStep.call(this, input, fixedDelta);
    cartPhase48TryCompleteClearedRouteExit(this, previous, input);
  };
}

installCartRoguePhase48RouteExitCompletion();

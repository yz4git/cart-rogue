import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { cartTraversalBridgeIntoNode } from "./CartTraversalBridge";
import { cartTraversalHasExitIntent } from "./CartTraversalIntent";
import { cartTraversalAxisToNext } from "./CartTraversalMath";
import {
  cartWorldNodeById,
  type CartWorldLocation,
  type CartWorldNode,
} from "./CartWorldGraph";

interface Phase47Session {
  car: CartArenaSession["car"];
  location: CartWorldLocation;
  step(input: RallyInputState, fixedDelta?: number): void;
}

export const CART_PHASE47_EXIT_TRIGGER_DEPTH = 3.25;
export const CART_PHASE47_ENTRY_INSET = 2.2;
export const CART_PHASE47_FORK_COMMIT = 1.35;

function nextNodes(node: CartWorldNode): CartWorldNode[] {
  return node.next
    .map((id) => cartWorldNodeById(id))
    .filter((candidate): candidate is CartWorldNode => Boolean(candidate));
}

export function cartPhase47SelectTransitTarget(nodeId: string, x: number, heading: number): string | null {
  const node = cartWorldNodeById(nodeId);
  if (!node || node.kind !== "corridor") return null;
  const candidates = nextNodes(node);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;

  const lateral = x - node.rect.centerX;
  let side = 0;
  if (Math.abs(lateral) >= CART_PHASE47_FORK_COMMIT) side = Math.sign(lateral);
  else {
    const headingX = Math.sin(heading);
    if (Math.abs(headingX) >= 0.18) side = Math.sign(headingX);
  }
  if (side === 0) return null;

  let best: CartWorldNode | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const candidateSide = Math.sign(candidate.rect.centerX - node.rect.centerX);
    if (candidateSide !== 0 && candidateSide !== side) continue;
    const score = Math.abs(candidate.rect.centerX - x);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best?.id ?? null;
}

function nearOutgoingFace(from: CartWorldNode, to: CartWorldNode, x: number, z: number): boolean {
  const direction = cartTraversalAxisToNext(from, to);
  if (direction.axis === "z") {
    const face = from.rect.centerZ + direction.sign * from.rect.halfDepth;
    const longitudinal = direction.sign > 0 ? face - z : z - face;
    const lateral = Math.abs(x - from.rect.centerX) <= from.rect.halfWidth + 0.35;
    return lateral && longitudinal >= -0.3 && longitudinal <= CART_PHASE47_EXIT_TRIGGER_DEPTH;
  }
  const face = from.rect.centerX + direction.sign * from.rect.halfWidth;
  const longitudinal = direction.sign > 0 ? face - x : x - face;
  const lateral = Math.abs(z - from.rect.centerZ) <= from.rect.halfDepth + 0.35;
  return lateral && longitudinal >= -0.3 && longitudinal <= CART_PHASE47_EXIT_TRIGGER_DEPTH;
}

export function cartPhase47TryCompleteTransitExit(
  session: Phase47Session,
  from: CartWorldNode,
  input: RallyInputState,
): boolean {
  if (from.kind !== "corridor" || session.location.node.id !== from.id) return false;
  const targetId = cartPhase47SelectTransitTarget(from.id, session.car.position.x, session.car.heading);
  if (!targetId) return false;
  const target = cartWorldNodeById(targetId);
  if (!target || !from.next.includes(target.id)) return false;
  if (!nearOutgoingFace(from, target, session.car.position.x, session.car.position.z)) return false;
  if (!cartTraversalHasExitIntent(session.car, from, target, input, {
    direction: "axis",
    brakeLimit: 0.45,
    velocityThreshold: 0.08,
    throttleThreshold: 0.04,
    forwardThreshold: -0.12,
  })) return false;
  cartTraversalBridgeIntoNode(session, from, target, {
    entryInset: CART_PHASE47_ENTRY_INSET,
    turnMax: 0.3,
    minForwardSpeed: 3.8,
    speedRetention: 0.94,
    lateralRetention: 0.35,
  });
  return true;
}

export function installCartRoguePhase47TransitCompletion(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase47Session;
  const originalStep = prototype.step;
  prototype.step = function phase47TransitCompletionStep(
    this: Phase47Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const previous = this.location.node;
    originalStep.call(this, input, fixedDelta);
    cartPhase47TryCompleteTransitExit(this, previous, input);
  };
}

installCartRoguePhase47TransitCompletion();

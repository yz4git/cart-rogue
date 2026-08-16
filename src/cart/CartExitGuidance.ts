import type { CartArenaSessionSnapshot } from "./CartArenaSession";
import {
  cartWorldNodeById,
  type CartWorldNode,
} from "./CartWorldGraph";

export interface CartExitGuidePoint {
  x: number;
  z: number;
}

export const CART_EXIT_GUIDE_MS = 4200;

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function nextNodes(node: CartWorldNode): CartWorldNode[] {
  return node.next
    .map((id) => cartWorldNodeById(id))
    .filter((candidate): candidate is CartWorldNode => Boolean(candidate));
}

export function cartExitGuidePointForNode(node: CartWorldNode, x: number): CartExitGuidePoint | null {
  const candidates = nextNodes(node);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return { x: candidates[0].rect.centerX, z: candidates[0].rect.centerZ };
  }

  // Before a fork is committed, point down the middle of the route instead of
  // arbitrarily choosing a branch. Once the cart has moved laterally into a
  // branch, follow the nearest authored branch center.
  const lateralCommit = Math.abs(x - node.rect.centerX) > Math.max(2.2, node.rect.halfWidth * 0.14);
  if (!lateralCommit) {
    const sum = candidates.reduce((acc, candidate) => {
      acc.x += candidate.rect.centerX;
      acc.z += candidate.rect.centerZ;
      return acc;
    }, { x: 0, z: 0 });
    return { x: sum.x / candidates.length, z: sum.z / candidates.length };
  }

  let nearest = candidates[0];
  let nearestDistance = Math.abs(nearest.rect.centerX - x);
  for (const candidate of candidates.slice(1)) {
    const distance = Math.abs(candidate.rect.centerX - x);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return { x: nearest.rect.centerX, z: nearest.rect.centerZ };
}

export function cartExitGuideAngle(
  snapshot: Pick<CartArenaSessionSnapshot, "nodeId" | "x" | "z" | "heading">,
): number | null {
  const node = cartWorldNodeById(snapshot.nodeId);
  if (!node) return null;
  const target = cartExitGuidePointForNode(node, snapshot.x);
  if (!target) return null;
  const dx = target.x - snapshot.x;
  const dz = target.z - snapshot.z;
  if (Math.hypot(dx, dz) < 0.25) return 0;
  return normalizeAngle(Math.atan2(dx, dz) - snapshot.heading);
}

import { CART_WORLD_GRAPH, type CartWorldNode } from "./CartWorldGraph";

export type CartArenaShapeKind = "circle" | "ellipse" | "capsule";
export type CartArenaMajorAxis = "x" | "z";

export interface CartArenaShapeSpec {
  kind: CartArenaShapeKind;
  radiusX: number;
  radiusZ: number;
  majorAxis?: CartArenaMajorAxis;
}

export interface CartArenaBoundaryProjection {
  x: number;
  z: number;
  normalX: number;
  normalZ: number;
  corrected: boolean;
}

/**
 * Phase 14 arena silhouettes. Corridors intentionally remain authored rectangles;
 * combat rooms switch to smooth silhouettes to remove corner traps and make each
 * stop in a run visually distinct.
 */
export const CART_ARENA_SHAPES: Readonly<Record<string, CartArenaShapeSpec>> = {
  "arena-01": { kind: "circle", radiusX: 26, radiusZ: 26 },
  "arena-02": { kind: "ellipse", radiusX: 29, radiusZ: 25 },
  "route-03-left": { kind: "capsule", radiusX: 19, radiusZ: 22, majorAxis: "z" },
  "route-03-right": { kind: "circle", radiusX: 21, radiusZ: 21 },
  "arena-03": { kind: "capsule", radiusX: 31, radiusZ: 23, majorAxis: "x" },
  "route-04-left": { kind: "ellipse", radiusX: 19.5, radiusZ: 22 },
  "route-04-right": { kind: "capsule", radiusX: 18.5, radiusZ: 22, majorAxis: "z" },
  "boss-01": { kind: "ellipse", radiusX: 33, radiusZ: 27 },
};

export function cartArenaShapeForNode(nodeId: string): CartArenaShapeSpec | null {
  return CART_ARENA_SHAPES[nodeId] ?? null;
}

export function cartArenaContains(
  nodeId: string,
  x: number,
  z: number,
  margin = 0,
): boolean {
  const node = CART_WORLD_GRAPH.nodes.find((candidate) => candidate.id === nodeId);
  const shape = cartArenaShapeForNode(nodeId);
  if (!node || !shape) return false;
  return containsLocal(shape, x - node.rect.centerX, z - node.rect.centerZ, Math.max(0, margin));
}

export function projectCartPointInsideArena(
  nodeId: string,
  x: number,
  z: number,
  margin = 0,
): CartArenaBoundaryProjection {
  const node = CART_WORLD_GRAPH.nodes.find((candidate) => candidate.id === nodeId);
  const shape = cartArenaShapeForNode(nodeId);
  if (!node || !shape) return { x, z, normalX: 0, normalZ: 0, corrected: false };
  const local = projectLocal(shape, x - node.rect.centerX, z - node.rect.centerZ, Math.max(0, margin));
  return {
    x: node.rect.centerX + local.x,
    z: node.rect.centerZ + local.z,
    normalX: local.normalX,
    normalZ: local.normalZ,
    corrected: local.corrected,
  };
}

export function cartArenaBoundaryPoints(nodeId: string, segments = 56, inset = 0): Array<{ x: number; z: number }> {
  const node = CART_WORLD_GRAPH.nodes.find((candidate) => candidate.id === nodeId);
  const shape = cartArenaShapeForNode(nodeId);
  if (!node || !shape) return [];
  const count = Math.max(16, Math.floor(segments));
  const result: Array<{ x: number; z: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * Math.PI * 2;
    const local = boundaryLocal(shape, angle, Math.max(0, inset));
    result.push({ x: node.rect.centerX + local.x, z: node.rect.centerZ + local.z });
  }
  return result;
}

export function cartArenaAdjacentCorridors(node: CartWorldNode): CartWorldNode[] {
  return CART_WORLD_GRAPH.nodes.filter((candidate) => {
    if (candidate.kind !== "corridor") return false;
    return node.next.includes(candidate.id) || candidate.next.includes(node.id);
  });
}

export function cartArenaPointInPortal(node: CartWorldNode, x: number, z: number, padding = 1.8): boolean {
  return cartArenaAdjacentCorridors(node).some((corridor) =>
    Math.abs(x - corridor.rect.centerX) <= corridor.rect.halfWidth + padding
    && Math.abs(z - corridor.rect.centerZ) <= corridor.rect.halfDepth + padding,
  );
}

export function cartNodesAreAdjacent(aId: string, bId: string): boolean {
  if (aId === bId) return true;
  const a = CART_WORLD_GRAPH.nodes.find((node) => node.id === aId);
  const b = CART_WORLD_GRAPH.nodes.find((node) => node.id === bId);
  if (!a || !b) return false;
  return a.next.includes(bId) || b.next.includes(aId);
}

function containsLocal(shape: CartArenaShapeSpec, x: number, z: number, margin: number): boolean {
  if (shape.kind === "circle") {
    const radius = Math.max(0.1, Math.min(shape.radiusX, shape.radiusZ) - margin);
    return x * x + z * z <= radius * radius;
  }
  if (shape.kind === "ellipse") {
    const rx = Math.max(0.1, shape.radiusX - margin);
    const rz = Math.max(0.1, shape.radiusZ - margin);
    return x * x / (rx * rx) + z * z / (rz * rz) <= 1;
  }
  const capsule = capsuleValues(shape, margin);
  const nearest = nearestCapsuleAxisPoint(capsule, x, z);
  const dx = x - nearest.x;
  const dz = z - nearest.z;
  return dx * dx + dz * dz <= capsule.radius * capsule.radius;
}

function projectLocal(
  shape: CartArenaShapeSpec,
  x: number,
  z: number,
  margin: number,
): { x: number; z: number; normalX: number; normalZ: number; corrected: boolean } {
  if (shape.kind === "circle") {
    const radius = Math.max(0.1, Math.min(shape.radiusX, shape.radiusZ) - margin);
    const distance = Math.hypot(x, z);
    if (distance <= radius) {
      const inv = distance > 1e-6 ? 1 / distance : 0;
      return { x, z, normalX: x * inv, normalZ: z * inv, corrected: false };
    }
    const inv = distance > 1e-6 ? 1 / distance : 1;
    return { x: x * radius * inv, z: z * radius * inv, normalX: x * inv, normalZ: z * inv, corrected: true };
  }
  if (shape.kind === "ellipse") {
    const rx = Math.max(0.1, shape.radiusX - margin);
    const rz = Math.max(0.1, shape.radiusZ - margin);
    const metric = Math.sqrt(x * x / (rx * rx) + z * z / (rz * rz));
    const nxRaw = x / (rx * rx);
    const nzRaw = z / (rz * rz);
    const normalLength = Math.hypot(nxRaw, nzRaw) || 1;
    const normalX = nxRaw / normalLength;
    const normalZ = nzRaw / normalLength;
    if (metric <= 1) return { x, z, normalX, normalZ, corrected: false };
    const scale = 1 / Math.max(metric, 1e-6);
    return { x: x * scale, z: z * scale, normalX, normalZ, corrected: true };
  }
  const capsule = capsuleValues(shape, margin);
  const nearest = nearestCapsuleAxisPoint(capsule, x, z);
  const dx = x - nearest.x;
  const dz = z - nearest.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= capsule.radius) {
    const inv = distance > 1e-6 ? 1 / distance : 0;
    return { x, z, normalX: dx * inv, normalZ: dz * inv, corrected: false };
  }
  const inv = distance > 1e-6 ? 1 / distance : 1;
  return {
    x: nearest.x + dx * capsule.radius * inv,
    z: nearest.z + dz * capsule.radius * inv,
    normalX: dx * inv,
    normalZ: dz * inv,
    corrected: true,
  };
}

function boundaryLocal(shape: CartArenaShapeSpec, angle: number, inset: number): { x: number; z: number } {
  if (shape.kind === "circle") {
    const radius = Math.max(0.1, Math.min(shape.radiusX, shape.radiusZ) - inset);
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
  }
  if (shape.kind === "ellipse") {
    return {
      x: Math.cos(angle) * Math.max(0.1, shape.radiusX - inset),
      z: Math.sin(angle) * Math.max(0.1, shape.radiusZ - inset),
    };
  }
  const capsule = capsuleValues(shape, inset);
  if (capsule.axis === "x") {
    const sign = Math.cos(angle) >= 0 ? 1 : -1;
    return {
      x: sign * capsule.straight + Math.cos(angle) * capsule.radius,
      z: Math.sin(angle) * capsule.radius,
    };
  }
  const sign = Math.sin(angle) >= 0 ? 1 : -1;
  return {
    x: Math.cos(angle) * capsule.radius,
    z: sign * capsule.straight + Math.sin(angle) * capsule.radius,
  };
}

function capsuleValues(shape: CartArenaShapeSpec, margin: number): { axis: CartArenaMajorAxis; radius: number; straight: number } {
  const axis = shape.majorAxis ?? (shape.radiusX >= shape.radiusZ ? "x" : "z");
  const minor = axis === "x" ? shape.radiusZ : shape.radiusX;
  const major = axis === "x" ? shape.radiusX : shape.radiusZ;
  const radius = Math.max(0.1, minor - margin);
  const straight = Math.max(0, major - minor);
  return { axis, radius, straight };
}

function nearestCapsuleAxisPoint(
  capsule: { axis: CartArenaMajorAxis; straight: number },
  x: number,
  z: number,
): { x: number; z: number } {
  if (capsule.axis === "x") {
    return { x: Math.max(-capsule.straight, Math.min(capsule.straight, x)), z: 0 };
  }
  return { x: 0, z: Math.max(-capsule.straight, Math.min(capsule.straight, z)) };
}

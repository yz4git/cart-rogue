export type CartWorldNodeKind = "arena" | "corridor" | "boss";
export type CartEncounterKind = "combat" | "elite" | "reward" | "boss" | "none";

export interface CartWorldRect {
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfDepth: number;
}

export interface CartWorldNode {
  id: string;
  kind: CartWorldNodeKind;
  rect: CartWorldRect;
  encounter: CartEncounterKind;
  next: readonly string[];
}

export interface CartWorldGraphDefinition {
  startNodeId: string;
  nodes: readonly CartWorldNode[];
}

export interface CartWorldLocation {
  node: CartWorldNode;
  localX: number;
  localZ: number;
}

export const CART_WORLD_GRAPH: CartWorldGraphDefinition = {
  startNodeId: "arena-01",
  nodes: [
    {
      id: "arena-01",
      kind: "arena",
      rect: { centerX: 0, centerZ: 28, halfWidth: 28, halfDepth: 24 },
      encounter: "combat",
      next: ["corridor-01"],
    },
    {
      id: "corridor-01",
      kind: "corridor",
      rect: { centerX: 0, centerZ: 72, halfWidth: 6.5, halfDepth: 20 },
      encounter: "none",
      next: ["arena-02"],
    },
    {
      id: "arena-02",
      kind: "arena",
      rect: { centerX: 0, centerZ: 116, halfWidth: 30, halfDepth: 24 },
      encounter: "elite",
      next: ["corridor-02"],
    },
    {
      id: "corridor-02",
      kind: "corridor",
      rect: { centerX: 0, centerZ: 162, halfWidth: 6.5, halfDepth: 22 },
      encounter: "none",
      next: ["boss-01"],
    },
    {
      id: "boss-01",
      kind: "boss",
      rect: { centerX: 0, centerZ: 210, halfWidth: 34, halfDepth: 26 },
      encounter: "boss",
      next: [],
    },
  ],
};

export function cartWorldNodeById(
  id: string,
  graph: CartWorldGraphDefinition = CART_WORLD_GRAPH,
): CartWorldNode | null {
  return graph.nodes.find((node) => node.id === id) ?? null;
}

export function cartWorldContains(rect: CartWorldRect, x: number, z: number, margin = 0): boolean {
  const safeMargin = Math.max(0, margin);
  return Math.abs(x - rect.centerX) <= Math.max(0, rect.halfWidth - safeMargin)
    && Math.abs(z - rect.centerZ) <= Math.max(0, rect.halfDepth - safeMargin);
}

/**
 * Locate a car in the authored playable union. Overlapping arena/corridor
 * seams deliberately prefer the smaller corridor so transitions are stable.
 */
export function locateCartWorldNode(
  x: number,
  z: number,
  graph: CartWorldGraphDefinition = CART_WORLD_GRAPH,
): CartWorldLocation | null {
  const containing = graph.nodes
    .filter((node) => cartWorldContains(node.rect, x, z))
    .sort((a, b) => (a.rect.halfWidth * a.rect.halfDepth) - (b.rect.halfWidth * b.rect.halfDepth));
  const node = containing[0];
  if (!node) return null;
  return {
    node,
    localX: x - node.rect.centerX,
    localZ: z - node.rect.centerZ,
  };
}

export function validateCartWorldGraph(graph: CartWorldGraphDefinition = CART_WORLD_GRAPH): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) errors.push(`duplicate node: ${node.id}`);
    ids.add(node.id);
    if (node.rect.halfWidth <= 0 || node.rect.halfDepth <= 0) errors.push(`invalid bounds: ${node.id}`);
  }
  if (!ids.has(graph.startNodeId)) errors.push(`missing start node: ${graph.startNodeId}`);
  for (const node of graph.nodes) {
    for (const nextId of node.next) {
      if (!ids.has(nextId)) errors.push(`missing edge target: ${node.id} -> ${nextId}`);
    }
  }

  const reachable = new Set<string>();
  const queue = [graph.startNodeId];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const node = graph.nodes.find((candidate) => candidate.id === id);
    if (node) queue.push(...node.next);
  }
  for (const id of ids) {
    if (!reachable.has(id)) errors.push(`unreachable node: ${id}`);
  }
  return errors;
}

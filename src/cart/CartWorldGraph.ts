export type CartWorldNodeKind = "arena" | "corridor" | "boss";
export type CartEncounterKind = "combat" | "elite" | "reward" | "boss" | "none";
export type CartRouteType = "combat" | "elite" | "service" | "scrap" | "event" | "boss" | "transit";
export type CartRouteLane = "left" | "right" | "center";

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
  routeType?: CartRouteType;
  label?: string;
  tier?: number;
  lane?: CartRouteLane;
  danger?: 1 | 2 | 3;
  rewardHint?: string;
  waveSeed?: number;
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

export interface CartRouteChoice {
  nodeId: string;
  encounter: CartEncounterKind;
  routeType: CartRouteType;
  label: string;
  lane: CartRouteLane;
  danger: 1 | 2 | 3;
  rewardHint: string;
}

interface RouteProfile {
  routeType: CartRouteType;
  encounter: CartEncounterKind;
  label: string;
  danger: 1 | 2 | 3;
  rewardHint: string;
}

const ROUTE_03_IDS = ["route-03-left", "route-03-right"] as const;
const ROUTE_04_IDS = ["route-04-left", "route-04-right"] as const;

/**
 * Phase 9 keeps the proven opening onboarding intact, then expands the run into
 * two physical forks. Wide junction corridors let the player steer into the
 * left/right branch before both routes converge again for the next tier.
 */
export const CART_WORLD_GRAPH: CartWorldGraphDefinition = {
  startNodeId: "arena-01",
  nodes: [
    {
      id: "arena-01",
      kind: "arena",
      rect: { centerX: 0, centerZ: 28, halfWidth: 28, halfDepth: 24 },
      encounter: "combat",
      next: ["corridor-01"],
      routeType: "combat",
      label: "OPENING BRAWL",
      tier: 1,
      lane: "center",
      danger: 1,
      rewardHint: "PERK",
      waveSeed: 101,
    },
    {
      id: "corridor-01",
      kind: "corridor",
      rect: { centerX: 0, centerZ: 72, halfWidth: 6.5, halfDepth: 20 },
      encounter: "none",
      next: ["arena-02"],
      routeType: "transit",
      label: "SUPPLY LANE",
      tier: 1,
      lane: "center",
      danger: 1,
      rewardHint: "GAS / TURBO",
    },
    {
      id: "arena-02",
      kind: "arena",
      rect: { centerX: 0, centerZ: 116, halfWidth: 30, halfDepth: 24 },
      encounter: "elite",
      next: ["junction-02"],
      routeType: "elite",
      label: "ELITE BLOCKADE",
      tier: 2,
      lane: "center",
      danger: 3,
      rewardHint: "PERK + HIGH SCRAP",
      waveSeed: 202,
    },
    {
      id: "junction-02",
      kind: "corridor",
      rect: { centerX: 0, centerZ: 158, halfWidth: 18, halfDepth: 18 },
      encounter: "none",
      next: ROUTE_03_IDS,
      routeType: "transit",
      label: "FORK A",
      tier: 2,
      lane: "center",
      danger: 1,
      rewardHint: "CHOOSE LEFT / RIGHT",
    },
    {
      id: "route-03-left",
      kind: "arena",
      rect: { centerX: -18, centerZ: 198, halfWidth: 20, halfDepth: 22 },
      encounter: "combat",
      next: ["junction-03"],
      routeType: "combat",
      label: "BRAWL ZONE",
      tier: 3,
      lane: "left",
      danger: 2,
      rewardHint: "PERK + SCRAP",
      waveSeed: 301,
    },
    {
      id: "route-03-right",
      kind: "arena",
      rect: { centerX: 18, centerZ: 198, halfWidth: 20, halfDepth: 22 },
      encounter: "reward",
      next: ["junction-03"],
      routeType: "service",
      label: "FUEL DEPOT",
      tier: 3,
      lane: "right",
      danger: 1,
      rewardHint: "GAS / TURBO",
      waveSeed: 302,
    },
    {
      id: "junction-03",
      kind: "corridor",
      rect: { centerX: 0, centerZ: 238, halfWidth: 18, halfDepth: 18 },
      encounter: "none",
      next: ["arena-03"],
      routeType: "transit",
      label: "MERGE A",
      tier: 3,
      lane: "center",
      danger: 1,
      rewardHint: "MERGE",
    },
    {
      id: "arena-03",
      kind: "arena",
      rect: { centerX: 0, centerZ: 280, halfWidth: 32, halfDepth: 24 },
      encounter: "combat",
      next: ["junction-04"],
      routeType: "combat",
      label: "MID-RUN CLASH",
      tier: 4,
      lane: "center",
      danger: 2,
      rewardHint: "PERK + SCRAP",
      waveSeed: 403,
    },
    {
      id: "junction-04",
      kind: "corridor",
      rect: { centerX: 0, centerZ: 322, halfWidth: 18, halfDepth: 18 },
      encounter: "none",
      next: ROUTE_04_IDS,
      routeType: "transit",
      label: "FORK B",
      tier: 4,
      lane: "center",
      danger: 1,
      rewardHint: "CHOOSE LEFT / RIGHT",
    },
    {
      id: "route-04-left",
      kind: "arena",
      rect: { centerX: -18, centerZ: 362, halfWidth: 20, halfDepth: 22 },
      encounter: "elite",
      next: ["corridor-02"],
      routeType: "elite",
      label: "ELITE BLOCKADE",
      tier: 5,
      lane: "left",
      danger: 3,
      rewardHint: "HIGH SCRAP + PERK",
      waveSeed: 501,
    },
    {
      id: "route-04-right",
      kind: "arena",
      rect: { centerX: 18, centerZ: 362, halfWidth: 20, halfDepth: 22 },
      encounter: "reward",
      next: ["corridor-02"],
      routeType: "event",
      label: "TURBO STORM",
      tier: 5,
      lane: "right",
      danger: 2,
      rewardHint: "TURBO / SMASH",
      waveSeed: 502,
    },
    {
      id: "corridor-02",
      kind: "corridor",
      rect: { centerX: 0, centerZ: 402, halfWidth: 18, halfDepth: 18 },
      encounter: "none",
      next: ["boss-01"],
      routeType: "transit",
      label: "BOSS APPROACH",
      tier: 5,
      lane: "center",
      danger: 1,
      rewardHint: "LAST SUPPLY",
    },
    {
      id: "boss-01",
      kind: "boss",
      rect: { centerX: 0, centerZ: 448, halfWidth: 34, halfDepth: 28 },
      encounter: "boss",
      next: [],
      routeType: "boss",
      label: "RAM TITAN",
      tier: 6,
      lane: "center",
      danger: 3,
      rewardHint: "RUN CLEAR",
      waveSeed: 999,
    },
  ],
};

const STAGE_03_PAIRS: readonly (readonly [CartRouteType, CartRouteType])[] = [
  ["combat", "service"],
  ["elite", "scrap"],
  ["combat", "event"],
  ["service", "elite"],
  ["scrap", "combat"],
];

const STAGE_04_PAIRS: readonly (readonly [CartRouteType, CartRouteType])[] = [
  ["elite", "service"],
  ["combat", "scrap"],
  ["elite", "event"],
  ["event", "service"],
  ["combat", "elite"],
];

let activeRunSeed = 0x4ca9;

export function configureCartRunMap(seed: number): number {
  activeRunSeed = normalizeSeed(seed);
  let state = activeRunSeed;
  const stage03 = choosePair(STAGE_03_PAIRS, state);
  state = xorshift32(state);
  const stage04 = choosePair(STAGE_04_PAIRS, state);
  state = xorshift32(state);
  applyGeneratedPair(ROUTE_03_IDS, stage03, state, 3);
  state = xorshift32(state);
  applyGeneratedPair(ROUTE_04_IDS, stage04, state, 5);
  return activeRunSeed;
}

export function getActiveCartRunSeed(): number {
  return activeRunSeed;
}

export function cartWorldNodeById(
  id: string,
  graph: CartWorldGraphDefinition = CART_WORLD_GRAPH,
): CartWorldNode | null {
  return graph.nodes.find((node) => node.id === id) ?? null;
}

export function cartUpcomingRouteChoices(
  nodeId: string,
  graph: CartWorldGraphDefinition = CART_WORLD_GRAPH,
): CartRouteChoice[] {
  const current = cartWorldNodeById(nodeId, graph);
  if (!current) return [];
  let candidates = current.next.map((id) => cartWorldNodeById(id, graph)).filter((node): node is CartWorldNode => Boolean(node));
  if (candidates.length === 1 && candidates[0].kind === "corridor" && candidates[0].next.length > 1) {
    candidates = candidates[0].next.map((id) => cartWorldNodeById(id, graph)).filter((node): node is CartWorldNode => Boolean(node));
  }
  if (candidates.length < 2) return [];
  return candidates.map((node) => ({
    nodeId: node.id,
    encounter: node.encounter,
    routeType: node.routeType ?? routeTypeFromEncounter(node.encounter),
    label: node.label ?? node.id.toUpperCase(),
    lane: node.lane ?? "center",
    danger: node.danger ?? 1,
    rewardHint: node.rewardHint ?? "UNKNOWN",
  }));
}

export function cartWorldContains(rect: CartWorldRect, x: number, z: number, margin = 0): boolean {
  const safeMargin = Math.max(0, margin);
  return Math.abs(x - rect.centerX) <= Math.max(0, rect.halfWidth - safeMargin)
    && Math.abs(z - rect.centerZ) <= Math.max(0, rect.halfDepth - safeMargin);
}

/**
 * Locate a car in the authored playable union. Smaller regions win at seams;
 * at a left/right fork the sign of X breaks same-size branch ties so steering
 * physically chooses the branch instead of array order doing it for the player.
 */
export function locateCartWorldNode(
  x: number,
  z: number,
  graph: CartWorldGraphDefinition = CART_WORLD_GRAPH,
): CartWorldLocation | null {
  const containing = graph.nodes
    .filter((node) => cartWorldContains(node.rect, x, z))
    .sort((a, b) => {
      const areaDifference = (a.rect.halfWidth * a.rect.halfDepth) - (b.rect.halfWidth * b.rect.halfDepth);
      if (Math.abs(areaDifference) > 1e-6) return areaDifference;
      if (a.lane === b.lane) return 0;
      if (x < 0) return a.lane === "left" ? -1 : b.lane === "left" ? 1 : 0;
      if (x > 0) return a.lane === "right" ? -1 : b.lane === "right" ? 1 : 0;
      return 0;
    });
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

function applyGeneratedPair(
  ids: readonly [string, string],
  pair: readonly [CartRouteType, CartRouteType],
  seed: number,
  tier: number,
): void {
  let state = seed;
  const swap = (state & 1) === 1;
  const routeTypes: readonly [CartRouteType, CartRouteType] = swap ? [pair[1], pair[0]] : pair;
  ids.forEach((id, index) => {
    const node = cartWorldNodeById(id);
    if (!node) return;
    const profile = routeProfile(routeTypes[index]);
    state = xorshift32(state ^ Math.imul(index + tier, 0x45d9f3b));
    node.routeType = profile.routeType;
    node.encounter = profile.encounter;
    node.label = profile.label;
    node.danger = profile.danger;
    node.rewardHint = profile.rewardHint;
    node.waveSeed = state;
  });
}

function choosePair(
  pairs: readonly (readonly [CartRouteType, CartRouteType])[],
  seed: number,
): readonly [CartRouteType, CartRouteType] {
  const state = xorshift32(seed);
  return pairs[Math.abs(state) % pairs.length];
}

function routeProfile(routeType: CartRouteType): RouteProfile {
  switch (routeType) {
    case "elite":
      return { routeType, encounter: "elite", label: "ELITE BLOCKADE", danger: 3, rewardHint: "HIGH SCRAP + PERK" };
    case "service":
      return { routeType, encounter: "reward", label: "FUEL DEPOT", danger: 1, rewardHint: "GAS / TURBO" };
    case "scrap":
      return { routeType, encounter: "reward", label: "SALVAGE YARD", danger: 1, rewardHint: "SCRAP CACHE" };
    case "event":
      return { routeType, encounter: "reward", label: "TURBO STORM", danger: 2, rewardHint: "TURBO / SMASH" };
    case "combat":
      return { routeType, encounter: "combat", label: "BRAWL ZONE", danger: 2, rewardHint: "PERK + SCRAP" };
    case "boss":
      return { routeType, encounter: "boss", label: "RAM TITAN", danger: 3, rewardHint: "RUN CLEAR" };
    default:
      return { routeType, encounter: "none", label: "TRANSIT", danger: 1, rewardHint: "MOVE" };
  }
}

function routeTypeFromEncounter(encounter: CartEncounterKind): CartRouteType {
  if (encounter === "combat") return "combat";
  if (encounter === "elite") return "elite";
  if (encounter === "boss") return "boss";
  if (encounter === "reward") return "service";
  return "transit";
}

function normalizeSeed(seed: number): number {
  const value = seed | 0;
  return value === 0 ? 0x6d2b79f5 : value;
}

function xorshift32(value: number): number {
  let x = normalizeSeed(value);
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x | 0;
}

configureCartRunMap(activeRunSeed);

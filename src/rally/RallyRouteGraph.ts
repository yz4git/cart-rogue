export type RallyRouteKind = "normal" | "destructible" | "jump" | "off-road" | "high-risk";

export interface RallyRouteNodeDefinition {
  id: string;
  progress: number;
}

export interface RallyRouteEdgeDefinition {
  id: string;
  from: string;
  to: string;
  kind: RallyRouteKind;
  distance: number;
  difficulty: number;
  speedRequirement: number;
  requiresDestruction: boolean;
  risk: number;
  startProgress: number;
  endProgress: number;
  entryX: number;
  entryZ: number;
  exitX: number;
  exitZ: number;
  corridorRadius: number;
}

export interface RallyRouteGraphDefinition {
  startNodeId: string;
  finishNodeId: string;
  nodes: readonly RallyRouteNodeDefinition[];
  edges: readonly RallyRouteEdgeDefinition[];
}

function progressInside(progress: number, start: number, end: number): boolean {
  if (start <= end) return progress >= start && progress <= end;
  return progress >= start || progress <= end;
}

function distanceToSegmentSquared(
  x: number,
  z: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
): number {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const lengthSquared = dx * dx + dz * dz;
  const amount = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((x - startX) * dx + (z - startZ) * dz) / lengthSquared))
    : 0;
  const nearestX = startX + dx * amount;
  const nearestZ = startZ + dz * amount;
  return (x - nearestX) ** 2 + (z - nearestZ) ** 2;
}

export class RallyRouteGraph {
  readonly startNodeId: string;
  readonly finishNodeId: string;
  readonly nodes: readonly RallyRouteNodeDefinition[];
  readonly edges: readonly RallyRouteEdgeDefinition[];

  constructor(definition: RallyRouteGraphDefinition) {
    this.startNodeId = definition.startNodeId;
    this.finishNodeId = definition.finishNodeId;
    this.nodes = definition.nodes;
    this.edges = definition.edges;
  }

  edgesFrom(nodeId: string): readonly RallyRouteEdgeDefinition[] {
    return this.edges.filter((edge) => edge.from === nodeId);
  }

  edgeById(edgeId: string): RallyRouteEdgeDefinition | null {
    return this.edges.find((edge) => edge.id === edgeId) ?? null;
  }

  isValidTransition(previousEdgeId: string | null, nextEdgeId: string): boolean {
    const next = this.edgeById(nextEdgeId);
    if (!next) return false;
    if (!previousEdgeId) return next.from === this.startNodeId;
    const previous = this.edgeById(previousEdgeId);
    return Boolean(previous && previous.to === next.from);
  }

  selectEdge(progress: number, x: number, z: number, preferredEdgeId: string | null = null): RallyRouteEdgeDefinition | null {
    const candidates = this.edges.filter((edge) => progressInside(progress, edge.startProgress, edge.endProgress));
    if (candidates.length === 0) return null;
    const preferred = candidates.find((edge) => edge.id === preferredEdgeId);
    if (preferred) return preferred;
    let best = candidates[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const edge of candidates) {
      const distance = distanceToSegmentSquared(x, z, edge.entryX, edge.entryZ, edge.exitX, edge.exitZ);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = edge;
      }
    }
    return bestDistance <= best.corridorRadius ** 2 ? best : null;
  }
}

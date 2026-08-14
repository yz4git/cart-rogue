import type { RallyObstaclePattern, TrackObstacleDefinition } from "./tracks/TrackDefinition";

export interface RallyPatternSample {
  x: number;
  z: number;
  heading: number;
  roadWidth: number;
}

export interface RallyPatternExpansionContext {
  length: number;
  sampleAtProgress: (progress: number) => RallyPatternSample;
  resolveWorldPlacement?: (x: number, z: number) => { progress: number; lateral: number };
}

export interface RallyObstaclePatternGroup {
  id: string;
  pattern: RallyObstaclePattern;
  progress: number;
  childIds: readonly string[];
}

export interface RallyPatternExpansionResult {
  obstacles: TrackObstacleDefinition[];
  groups: RallyObstaclePatternGroup[];
  firstChildBySourceId: ReadonlyMap<string, string>;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function wrapProgress(progress: number): number {
  const wrapped = progress % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function stableSign(value: number, id: string): number {
  if (value !== 0) return Math.sign(value);
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return hash % 2 === 0 ? 1 : -1;
}

function patternChildren(definition: TrackObstacleDefinition, length: number): Array<{ lateral: number; progressOffset: number }> {
  const anchor = clamp(definition.lateral ?? 0, -0.84, 0.84);
  const sign = stableSign(anchor, definition.id);
  const spacing = (meters: number): number => meters / Math.max(1, length);
  switch (definition.pattern) {
    case "wall-gate": {
      const lanes = [-0.78, -0.26, 0.26, 0.78];
      const gapIndex = anchor > 0.28 ? 0 : anchor < -0.28 ? lanes.length - 1 : Math.abs(definition.id.length) % 2;
      return lanes
        .map((lateral, index) => ({ lateral, progressOffset: spacing(index * 0.9) }))
        .filter((_child, index) => index !== gapIndex);
    }
    case "double-gap":
      // Two offset blockers leave the center and both outside shoulders as
      // readable choices; the pattern is never a full-width invisible wall.
      return [
        { lateral: -0.58, progressOffset: 0 },
        { lateral: 0.58, progressOffset: spacing(0.9) },
      ];
    case "slalom":
      return [0, 1, 2, 3].map((index) => ({
        lateral: sign * (index % 2 === 0 ? 0.68 : 0.68) * (index % 2 === 0 ? 1 : -1),
        progressOffset: spacing(index * 9),
      }));
    case "smash-line":
      return [0, 1, 2, 3].map((index) => ({
        lateral: anchor,
        progressOffset: spacing(index * 5.5),
      }));
    case "pickup-behind-wall":
      return [
        { lateral: -0.72, progressOffset: 0 },
        { lateral: -0.04, progressOffset: 0 },
        { lateral: 0.72, progressOffset: spacing(2.2) },
      ];
    case "enemy-wall":
      return [
        { lateral: clamp(anchor - 0.54, -0.84, 0.84), progressOffset: 0 },
        { lateral: clamp(anchor + 0.54, -0.84, 0.84), progressOffset: spacing(2.8) },
      ];
    case "offset-wall":
    default:
      return [{ lateral: anchor, progressOffset: 0 }];
  }
}

function childRadius(definition: TrackObstacleDefinition): number {
  if (definition.kind === "wall" || definition.kind === "barrier" || definition.kind === "fence") {
    return Math.max(0.9, Math.min(1.28, definition.radius));
  }
  return Math.max(0.72, definition.radius * 0.78);
}

/**
 * Expand authored progress/lateral patterns into stable gameplay children.
 * The renderer never calls this: RallyTrack consumes the same result for
 * meshes, colliders, AI probes, Canvas preview and restart state.
 */
export function expandObstaclePatterns(
  definitions: readonly TrackObstacleDefinition[],
  context: RallyPatternExpansionContext,
): RallyPatternExpansionResult {
  const obstacles: TrackObstacleDefinition[] = [];
  const groups: RallyObstaclePatternGroup[] = [];
  const firstChildBySourceId = new Map<string, string>();
  for (const definition of definitions) {
    const pattern = definition.pattern;
    const legacyPlacement = definition.progress === undefined && definition.lateral === undefined
      && definition.x !== undefined && definition.z !== undefined
      ? context.resolveWorldPlacement?.(definition.x, definition.z)
      : undefined;
    const authoredProgress = definition.progress ?? legacyPlacement?.progress ?? 0;
    const authoredLateral = definition.lateral ?? legacyPlacement?.lateral ?? 0;
    const normalizedDefinition = { ...definition, progress: authoredProgress, lateral: authoredLateral };
    const children = pattern ? patternChildren(normalizedDefinition, context.length) : [{ lateral: authoredLateral, progressOffset: 0 }];
    const progress = clamp(authoredProgress, 0, 1);
    const childIds: string[] = [];
    children.forEach((child, index) => {
      // Preserve the authored id for the first child so existing shortcut
      // references and save/debug tooling remain compatible. Additional
      // children carry stable suffixes and are independently destructible.
      const childId = pattern ? index === 0 ? definition.id : `${definition.id}-${index}` : definition.id;
      const childDefinition: TrackObstacleDefinition = {
        ...definition,
        id: childId,
        progress: pattern ? wrapProgress(progress + child.progressOffset) : definition.progress,
        lateral: pattern ? child.lateral : definition.lateral,
        radius: pattern ? childRadius(definition) : definition.radius,
        patternParentId: pattern ? definition.id : definition.patternParentId,
        patternIndex: pattern ? index : definition.patternIndex,
      };
      obstacles.push(childDefinition);
      childIds.push(childId);
    });
    firstChildBySourceId.set(definition.id, childIds[0] ?? definition.id);
    if (pattern && children.length > 1) {
      const sample = context.sampleAtProgress(progress);
      groups.push({
        id: definition.id,
        pattern,
        progress,
        childIds,
      });
      // Keep the sample call in the expansion boundary so future pattern
      // variants can use road width/heading without moving placement logic
      // into a renderer. It also validates the supplied context in tests.
      void sample;
    }
  }
  return { obstacles, groups, firstChildBySourceId };
}

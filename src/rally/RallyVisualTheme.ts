import type { RallyEnvironmentVariant } from "./RallySurface";

export interface RallyVisualTheme {
  id: "forest" | "mountain" | "badlands";
  sky: number;
  fog: number;
  terrain: number;
  terrainAlt: number;
  road: number;
  roadEdge: number;
  shoulder: number;
  foliage: number;
  rock: number;
  building: number;
  warning: number;
  start: number;
  checkpoint: number;
  goal: number;
  shortcut: number;
  accent: number;
}

const THEMES: Record<RallyVisualTheme["id"], RallyVisualTheme> = {
  forest: {
    id: "forest", sky: 0x8ed4e2, fog: 0x8ed4e2, terrain: 0x31583f, terrainAlt: 0x3d6b49,
    road: 0x46596a, roadEdge: 0x8b9a9d, shoulder: 0x8e8958, foliage: 0x397054,
    rock: 0x68737a, building: 0x6e8170, warning: 0xe6a04e, start: 0x61e6c1,
    checkpoint: 0xf4c86a, goal: 0xff806d, shortcut: 0x9af4e7, accent: 0xffd65c,
  },
  mountain: {
    id: "mountain", sky: 0xc17d66, fog: 0x875c60, terrain: 0x4e4b50, terrainAlt: 0x62565a,
    road: 0x5b4c4d, roadEdge: 0xa1796d, shoulder: 0x8d6c55, foliage: 0x53634f,
    rock: 0x6e7079, building: 0x866452, warning: 0xe6544f, start: 0x8ee6db,
    checkpoint: 0xffb15c, goal: 0xff7267, shortcut: 0xffd36a, accent: 0xff704f,
  },
  badlands: {
    id: "badlands", sky: 0x9b6b88, fog: 0x5d435e, terrain: 0x704343, terrainAlt: 0x8e5542,
    road: 0x594b5d, roadEdge: 0xa56b5d, shoulder: 0xb06a47, foliage: 0x536b59,
    rock: 0x403b4b, building: 0x76505f, warning: 0xf06f4f, start: 0x77e8d5,
    checkpoint: 0xffcf70, goal: 0xff7766, shortcut: 0x7cf6ff, accent: 0xff8d4f,
  },
};

function themeIdForTrack(trackId: string): RallyVisualTheme["id"] {
  if (trackId === "track-02") return "mountain";
  if (trackId === "track-03") return "badlands";
  return "forest";
}

function tint(color: number, amount: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * amount)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * amount)));
  const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * amount)));
  return (r << 16) | (g << 8) | b;
}

export function getRallyVisualTheme(trackId: string, environment: RallyEnvironmentVariant = "dry"): RallyVisualTheme {
  const base = THEMES[themeIdForTrack(trackId)];
  if (environment === "dry") return base;
  if (environment === "sunset") {
    return { ...base, sky: tint(base.sky, 1.08), fog: tint(base.fog, 0.92), terrain: tint(base.terrain, 1.08), road: tint(base.road, 0.92) };
  }
  return {
    ...base,
    sky: tint(base.sky, 0.78),
    fog: tint(base.fog, 0.82),
    terrain: tint(base.terrain, 0.82),
    terrainAlt: tint(base.terrainAlt, 0.84),
    road: tint(base.road, 0.72),
    roadEdge: tint(base.roadEdge, 0.86),
    shoulder: tint(base.shoulder, 0.82),
  };
}

export function rallyThemeCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export function rallyThemeColors(): readonly RallyVisualTheme[] {
  return Object.values(THEMES);
}

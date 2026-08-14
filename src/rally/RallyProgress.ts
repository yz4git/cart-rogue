import type { RallyEnvironmentVariant } from "./RallySurface";

export interface RallyTrackProgress {
  trackId: string;
  environmentVariant: RallyEnvironmentVariant;
  bestLap: number | null;
  bestSplits: number[];
}

export const RALLY_PROGRESS_STORAGE_KEY = "voxel-rally.time-attack.v2";
const LEGACY_STORAGE_KEY = "voxel-rally.time-attack.v1";

export function rallyProgressStorageKey(trackId: string, environmentVariant: RallyEnvironmentVariant = "dry"): string {
  return `${trackId}:${environmentVariant}`;
}

function storage(): Storage | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return null;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadTrackProgress(trackId: string, sectorCount = 4, environmentVariant: RallyEnvironmentVariant = "dry"): RallyTrackProgress {
  const fallback = { trackId, environmentVariant, bestLap: null, bestSplits: [] };
  const target = storage();
  const saved = target?.getItem(RALLY_PROGRESS_STORAGE_KEY) ?? (environmentVariant === "dry" ? target?.getItem(LEGACY_STORAGE_KEY) : null);
  if (!saved) return fallback;
  try {
    const parsed = JSON.parse(saved) as { tracks?: Record<string, RallyTrackProgress> };
    const track = parsed.tracks?.[rallyProgressStorageKey(trackId, environmentVariant)] ?? (environmentVariant === "dry" ? parsed.tracks?.[trackId] : undefined);
    if (!track || track.trackId !== trackId) return fallback;
    return {
      trackId,
      environmentVariant,
      bestLap: typeof track.bestLap === "number" && Number.isFinite(track.bestLap) ? track.bestLap : null,
      bestSplits: Array.isArray(track.bestSplits)
        ? track.bestSplits.filter((value): value is number => typeof value === "number" && Number.isFinite(value)).slice(0, sectorCount)
        : [],
    };
  } catch {
    return fallback;
  }
}

export function saveTrackProgress(progress: RallyTrackProgress): void {
  const target = storage();
  if (!target) return;
  try {
    const saved = target.getItem(RALLY_PROGRESS_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) as { tracks?: Record<string, RallyTrackProgress> } : {};
    const tracks = parsed.tracks ?? {};
    tracks[rallyProgressStorageKey(progress.trackId, progress.environmentVariant)] = {
      trackId: progress.trackId,
      environmentVariant: progress.environmentVariant,
      bestLap: progress.bestLap,
      bestSplits: progress.bestSplits.slice(0, 4),
    };
    target.setItem(RALLY_PROGRESS_STORAGE_KEY, JSON.stringify({ tracks }));
  } catch {
    // Private browsing and quota restrictions must not block racing.
  }
}

export type RallyMedal = "BRONZE" | "SILVER" | "GOLD";

export function medalForLapTime(seconds: number, thresholds = { bronze: 45, silver: 36, gold: 30 }): RallyMedal | null {
  if (!Number.isFinite(seconds)) return null;
  if (seconds <= thresholds.gold) return "GOLD";
  if (seconds <= thresholds.silver) return "SILVER";
  if (seconds <= thresholds.bronze) return "BRONZE";
  return null;
}

import type { RallyMedal, RallyMode } from "./RallyTypes";
import type { RallyVehicleId } from "./VehicleDefinition";

export const RALLY_CHAMPIONSHIP_SAVE_VERSION = 1;
export const RALLY_CHAMPIONSHIP_STORAGE_KEY = "voxel-rally.championship.v1";
export const RALLY_CHAMPIONSHIP_RUN_VERSION = 1;
export const RALLY_CHAMPIONSHIP_RUN_STORAGE_KEY = "voxel-rally.championship-run.v1";
export const RALLY_CHAMPIONSHIP_TRACK_ORDER = ["track-01", "track-02", "track-03"] as const;
const CHAMPIONSHIP_POINTS = [10, 7, 5, 3] as const;

export interface RallyChampionshipResult {
  trackId: string;
  position: number;
  medal: RallyMedal | null;
}

export interface RallyChampionshipTrackResult {
  trackId: string;
  position: number;
  points: number;
  medal: RallyMedal | null;
}

export interface RallyChampionshipSave {
  version: typeof RALLY_CHAMPIONSHIP_SAVE_VERSION;
  points: number;
  unlockedTracks: string[];
  unlockedVehicles: RallyVehicleId[];
  results: Record<string, RallyChampionshipTrackResult>;
}

export interface RallyChampionshipRunResult {
  round: number;
  trackId: string;
  position: number;
  points: number;
  medal: RallyMedal | null;
}

export interface RallyChampionshipRunState {
  version: typeof RALLY_CHAMPIONSHIP_RUN_VERSION;
  currentRound: number;
  results: RallyChampionshipRunResult[];
  points: number;
  finished: boolean;
  finalRank: number | null;
}

export interface RallyChampionshipRoundResult {
  save: RallyChampionshipSave;
  run: RallyChampionshipRunState;
}

function storage(): Storage | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return null;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function defaultSave(): RallyChampionshipSave {
  return {
    version: RALLY_CHAMPIONSHIP_SAVE_VERSION,
    points: 0,
    unlockedTracks: [RALLY_CHAMPIONSHIP_TRACK_ORDER[0]],
    unlockedVehicles: ["compact"],
    results: {},
  };
}

function defaultRun(): RallyChampionshipRunState {
  return {
    version: RALLY_CHAMPIONSHIP_RUN_VERSION,
    currentRound: 0,
    results: [],
    points: 0,
    finished: false,
    finalRank: null,
  };
}

function isTrackId(value: unknown): value is string {
  return typeof value === "string" && RALLY_CHAMPIONSHIP_TRACK_ORDER.includes(value as typeof RALLY_CHAMPIONSHIP_TRACK_ORDER[number]);
}

function isVehicleId(value: unknown): value is RallyVehicleId {
  return value === "compact" || value === "muscle" || value === "buggy";
}

function isMedal(value: unknown): value is RallyMedal {
  return value === "BRONZE" || value === "SILVER" || value === "GOLD";
}

export function parseRallyChampionshipSave(value: unknown): RallyChampionshipSave {
  const fallback = defaultSave();
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<RallyChampionshipSave>;
  if (candidate.version !== RALLY_CHAMPIONSHIP_SAVE_VERSION) return fallback;
  const unlockedTracks = Array.isArray(candidate.unlockedTracks) ? candidate.unlockedTracks.filter(isTrackId) : [];
  const unlockedVehicles = Array.isArray(candidate.unlockedVehicles) ? candidate.unlockedVehicles.filter(isVehicleId) : [];
  const results: Record<string, RallyChampionshipTrackResult> = {};
  if (candidate.results && typeof candidate.results === "object") {
    for (const [trackId, raw] of Object.entries(candidate.results)) {
      if (!isTrackId(trackId) || !raw || typeof raw !== "object") continue;
      const result = raw as Partial<RallyChampionshipTrackResult>;
      if (typeof result.position !== "number" || !Number.isFinite(result.position)) continue;
      if (typeof result.points !== "number" || !Number.isFinite(result.points)) continue;
      results[trackId] = {
        trackId,
        position: Math.max(1, Math.floor(result.position)),
        points: Math.max(0, Math.floor(result.points)),
        medal: isMedal(result.medal) ? result.medal : null,
      };
    }
  }
  const normalizedTracks = [...new Set(unlockedTracks)];
  if (!normalizedTracks.includes(RALLY_CHAMPIONSHIP_TRACK_ORDER[0])) normalizedTracks.unshift(RALLY_CHAMPIONSHIP_TRACK_ORDER[0]);
  return {
    version: RALLY_CHAMPIONSHIP_SAVE_VERSION,
    points: typeof candidate.points === "number" && Number.isFinite(candidate.points) ? Math.max(0, Math.floor(candidate.points)) : 0,
    unlockedTracks: normalizedTracks,
    unlockedVehicles: [...new Set(["compact" as const, ...unlockedVehicles])],
    results,
  };
}

export function loadRallyChampionship(): RallyChampionshipSave {
  const saved = storage()?.getItem(RALLY_CHAMPIONSHIP_STORAGE_KEY);
  if (!saved) return defaultSave();
  try {
    return parseRallyChampionshipSave(JSON.parse(saved));
  } catch {
    return defaultSave();
  }
}

export function parseRallyChampionshipRun(value: unknown): RallyChampionshipRunState {
  const fallback = defaultRun();
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<RallyChampionshipRunState>;
  if (candidate.version !== RALLY_CHAMPIONSHIP_RUN_VERSION) return fallback;
  const results: RallyChampionshipRunResult[] = [];
  if (Array.isArray(candidate.results)) {
    for (const raw of candidate.results) {
      if (!raw || typeof raw !== "object") continue;
      const result = raw as Partial<RallyChampionshipRunResult>;
      if (!isTrackId(result.trackId) || typeof result.round !== "number" || !Number.isFinite(result.round)) continue;
      if (typeof result.position !== "number" || !Number.isFinite(result.position)) continue;
      if (typeof result.points !== "number" || !Number.isFinite(result.points)) continue;
      const round = Math.floor(result.round);
      if (round < 0 || round >= RALLY_CHAMPIONSHIP_TRACK_ORDER.length) continue;
      results.push({
        round,
        trackId: result.trackId,
        position: Math.max(1, Math.min(4, Math.floor(result.position))),
        points: Math.max(0, Math.floor(result.points)),
        medal: isMedal(result.medal) ? result.medal : null,
      });
    }
  }
  results.sort((a, b) => a.round - b.round);
  const uniqueResults = results.filter((result, index) => index === 0 || result.round !== results[index - 1].round);
  const currentRound = Math.max(0, Math.min(RALLY_CHAMPIONSHIP_TRACK_ORDER.length, Math.floor(
    typeof candidate.currentRound === "number" && Number.isFinite(candidate.currentRound)
      ? candidate.currentRound
      : uniqueResults.length,
  )));
  const finished = Boolean(candidate.finished) && currentRound >= RALLY_CHAMPIONSHIP_TRACK_ORDER.length;
  const finalRank = finished && typeof candidate.finalRank === "number" && Number.isFinite(candidate.finalRank)
    ? Math.max(1, Math.min(4, Math.floor(candidate.finalRank)))
    : null;
  return {
    version: RALLY_CHAMPIONSHIP_RUN_VERSION,
    currentRound,
    results: uniqueResults.slice(0, RALLY_CHAMPIONSHIP_TRACK_ORDER.length),
    points: uniqueResults.reduce((total, result) => total + result.points, 0),
    finished,
    finalRank,
  };
}

export function loadRallyChampionshipRun(): RallyChampionshipRunState {
  const saved = storage()?.getItem(RALLY_CHAMPIONSHIP_RUN_STORAGE_KEY);
  if (!saved) return defaultRun();
  try {
    return parseRallyChampionshipRun(JSON.parse(saved));
  } catch {
    return defaultRun();
  }
}

export function saveRallyChampionshipRun(run: RallyChampionshipRunState): void {
  const target = storage();
  if (!target) return;
  try {
    target.setItem(RALLY_CHAMPIONSHIP_RUN_STORAGE_KEY, JSON.stringify(parseRallyChampionshipRun(run)));
  } catch {
    // Private browsing and quota restrictions must not block racing.
  }
}

export function saveRallyChampionship(save: RallyChampionshipSave): void {
  const target = storage();
  if (!target) return;
  try {
    target.setItem(RALLY_CHAMPIONSHIP_STORAGE_KEY, JSON.stringify(parseRallyChampionshipSave(save)));
  } catch {
    // Private browsing and quota restrictions must not block racing.
  }
}

export function pointsForChampionshipPosition(position: number): number {
  const index = Math.max(0, Math.min(CHAMPIONSHIP_POINTS.length - 1, Math.floor(position) - 1));
  return CHAMPIONSHIP_POINTS[index] ?? 0;
}

export function recordRallyChampionshipResult(current: RallyChampionshipSave, result: RallyChampionshipResult): RallyChampionshipSave {
  const save = parseRallyChampionshipSave(current);
  if (!isTrackId(result.trackId)) return save;
  const position = Math.max(1, Math.floor(result.position));
  const points = pointsForChampionshipPosition(position);
  const previous = save.results[result.trackId];
  if (!previous || points > previous.points || (points === previous.points && position < previous.position)) {
    save.points += previous ? points - previous.points : points;
    save.results[result.trackId] = { trackId: result.trackId, position, points, medal: result.medal };
  }
  const trackIndex = RALLY_CHAMPIONSHIP_TRACK_ORDER.indexOf(result.trackId as typeof RALLY_CHAMPIONSHIP_TRACK_ORDER[number]);
  const nextTrack = RALLY_CHAMPIONSHIP_TRACK_ORDER[trackIndex + 1];
  if (!save.unlockedTracks.includes(result.trackId)) save.unlockedTracks.push(result.trackId);
  if (nextTrack && !save.unlockedTracks.includes(nextTrack)) save.unlockedTracks.push(nextTrack);
  const goldCount = Object.values(save.results).filter((entry) => entry.medal === "GOLD").length;
  if (goldCount >= 1 && !save.unlockedVehicles.includes("muscle")) save.unlockedVehicles.push("muscle");
  if (goldCount >= 2 && !save.unlockedVehicles.includes("buggy")) save.unlockedVehicles.push("buggy");
  return save;
}

export class RallyChampionship {
  private saveState: RallyChampionshipSave;
  private runState: RallyChampionshipRunState;

  constructor(initial = loadRallyChampionship(), initialRun = loadRallyChampionshipRun()) {
    this.saveState = parseRallyChampionshipSave(initial);
    this.runState = parseRallyChampionshipRun(initialRun);
  }

  get save(): RallyChampionshipSave {
    return parseRallyChampionshipSave(this.saveState);
  }

  get run(): RallyChampionshipRunState {
    return parseRallyChampionshipRun(this.runState);
  }

  startRun(): RallyChampionshipRunState {
    this.runState = defaultRun();
    saveRallyChampionshipRun(this.runState);
    return this.run;
  }

  record(result: RallyChampionshipResult): RallyChampionshipSave {
    this.saveState = recordRallyChampionshipResult(this.saveState, result);
    saveRallyChampionship(this.saveState);
    return this.save;
  }

  recordRound(result: RallyChampionshipResult): RallyChampionshipRoundResult {
    const save = this.record(result);
    const run = this.runState;
    const expectedTrack = RALLY_CHAMPIONSHIP_TRACK_ORDER[run.currentRound];
    if (run.finished || expectedTrack !== result.trackId) return { save, run: this.run };
    const position = Math.max(1, Math.min(4, Math.floor(result.position)));
    const roundResult: RallyChampionshipRunResult = {
      round: run.currentRound,
      trackId: result.trackId,
      position,
      points: pointsForChampionshipPosition(position),
      medal: result.medal,
    };
    run.results = [...run.results, roundResult];
    run.currentRound += 1;
    run.points = run.results.reduce((total, entry) => total + entry.points, 0);
    if (run.currentRound >= RALLY_CHAMPIONSHIP_TRACK_ORDER.length) {
      run.finished = true;
      run.finalRank = Math.max(1, Math.min(4, Math.round(
        run.results.reduce((total, entry) => total + entry.position, 0) / run.results.length,
      )));
    }
    saveRallyChampionshipRun(run);
    this.runState = parseRallyChampionshipRun(run);
    return { save: this.save, run: this.run };
  }

  reset(): void {
    this.saveState = defaultSave();
    this.runState = defaultRun();
    saveRallyChampionship(this.saveState);
    saveRallyChampionshipRun(this.runState);
  }

  isTrackUnlocked(trackId: string): boolean {
    return this.saveState.unlockedTracks.includes(trackId);
  }

  isVehicleUnlocked(vehicleId: RallyVehicleId): boolean {
    return this.saveState.unlockedVehicles.includes(vehicleId);
  }

  mode(): RallyMode {
    return "championship";
  }
}

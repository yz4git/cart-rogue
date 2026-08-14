import { RallyCar } from "./RallyCar";
import type { RallyGhostDeltaState, RallyPhase } from "./RallyTypes";
import type { RallyEnvironmentVariant } from "./RallySurface";
import type { RallyVehicleId } from "./VehicleDefinition";

export interface RallyGhostSample {
  time: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  progress?: number;
}

export interface RallyGhostRun {
  version: number;
  trackId: string;
  physicsVersion: string;
  environmentVariant?: RallyEnvironmentVariant;
  vehicleId?: RallyVehicleId;
  duration: number;
  samples: RallyGhostSample[];
}

export interface RallyGhostComparison {
  delta: number | null;
  state: RallyGhostDeltaState;
}

export const RALLY_GHOST_DATA_VERSION = 3;
export const RALLY_GHOST_PHYSICS_VERSION = "arcade-vehicle-v2";
const GHOST_STORAGE_KEY = "voxel-rally.ghost.v3";
const LEGACY_GHOST_STORAGE_KEY = "voxel-rally.ghost.v1";
const SAMPLE_INTERVAL = 1 / 15;
const MAX_SAMPLES = 900;

function storage(): Storage | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return null;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function rallyGhostStorageKey(trackId: string, environmentVariant: RallyEnvironmentVariant = "dry", vehicleId: RallyVehicleId = "compact"): string {
  return `${trackId}:${environmentVariant}:${vehicleId}`;
}

export function loadGhostRun(trackId: string, environmentVariant: RallyEnvironmentVariant = "dry", vehicleId: RallyVehicleId = "compact"): RallyGhostRun | null {
  const target = storage();
  const saved = target?.getItem(GHOST_STORAGE_KEY) ?? target?.getItem(LEGACY_GHOST_STORAGE_KEY);
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved) as { tracks?: Record<string, RallyGhostRun> };
    const key = rallyGhostStorageKey(trackId, environmentVariant, vehicleId);
    const run = (parsed.tracks?.[key] ?? parsed.tracks?.[trackId]) as Partial<RallyGhostRun> | undefined;
    if (!run || !Array.isArray(run.samples) || run.samples.length < 2) return null;
    if (run.version !== RALLY_GHOST_DATA_VERSION || run.physicsVersion !== RALLY_GHOST_PHYSICS_VERSION) return null;
    const validSamples = run.samples.filter((sample) => Number.isFinite(sample.time)
      && Number.isFinite(sample.x) && Number.isFinite(sample.y) && Number.isFinite(sample.z)
      && Number.isFinite(sample.heading) && Number.isFinite(sample.speed)).slice(0, MAX_SAMPLES);
    if (validSamples.length < 2) return null;
    const duration = Math.max(0, Number(run.duration) || validSamples[validSamples.length - 1].time);
    const samples = validSamples.map((sample, index) => ({
      ...sample,
      progress: Number.isFinite(sample.progress)
        ? Math.max(0, Math.min(1, sample.progress as number))
        : index / Math.max(1, validSamples.length - 1),
    }));
    return {
      version: RALLY_GHOST_DATA_VERSION,
      trackId,
      physicsVersion: RALLY_GHOST_PHYSICS_VERSION,
      environmentVariant: run.environmentVariant === "wet" || run.environmentVariant === "sunset" ? run.environmentVariant : environmentVariant,
      vehicleId: run.vehicleId === "muscle" || run.vehicleId === "buggy" ? run.vehicleId : vehicleId,
      duration,
      samples,
    };
  } catch {
    return null;
  }
}

export function saveGhostRun(trackId: string, run: RallyGhostRun): void {
  const target = storage();
  if (!target) return;
  try {
    const saved = target.getItem(GHOST_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) as { tracks?: Record<string, RallyGhostRun> } : {};
    const tracks = parsed.tracks ?? {};
    const environmentVariant = run.environmentVariant ?? "dry";
    const vehicleId = run.vehicleId ?? "compact";
    tracks[rallyGhostStorageKey(trackId, environmentVariant, vehicleId)] = {
      version: RALLY_GHOST_DATA_VERSION,
      trackId,
      physicsVersion: RALLY_GHOST_PHYSICS_VERSION,
      environmentVariant,
      vehicleId,
      duration: run.duration,
      samples: run.samples.slice(0, MAX_SAMPLES),
    };
    target.setItem(GHOST_STORAGE_KEY, JSON.stringify({ tracks }));
  } catch {
    // Storage failures should never stop the race.
  }
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function lerpAngle(a: number, b: number, amount: number): number {
  let difference = (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return a + difference * amount;
}

export class RallyGhostPlayback {
  enabled = true;
  private run: RallyGhostRun | null;
  private cursor = 0;
  private progressCursor = 0;
  private lastProgress = 0;
  private trackId: string;
  private environmentVariant: RallyEnvironmentVariant;
  private vehicleId: RallyVehicleId;

  constructor(trackId: string, environmentVariant: RallyEnvironmentVariant = "dry", vehicleId: RallyVehicleId = "compact") {
    this.trackId = trackId;
    this.environmentVariant = environmentVariant;
    this.vehicleId = vehicleId;
    this.run = loadGhostRun(trackId, environmentVariant, vehicleId);
  }

  setContext(trackId: string, environmentVariant: RallyEnvironmentVariant, vehicleId: RallyVehicleId): void {
    this.trackId = trackId;
    this.environmentVariant = environmentVariant;
    this.vehicleId = vehicleId;
    this.setRun(loadGhostRun(trackId, environmentVariant, vehicleId));
  }

  setRun(run: RallyGhostRun | null): void {
    this.run = run && run.version === RALLY_GHOST_DATA_VERSION && run.physicsVersion === RALLY_GHOST_PHYSICS_VERSION ? run : null;
    this.cursor = 0;
    this.progressCursor = 0;
    this.lastProgress = 0;
  }

  sampleAt(time: number): RallyGhostSample | null {
    if (!this.enabled || !this.run) return null;
    const samples = this.run.samples;
    const clampedTime = Math.max(0, Math.min(this.run.duration, time));
    while (this.cursor < samples.length - 2 && samples[this.cursor + 1].time < clampedTime) this.cursor += 1;
    while (this.cursor > 0 && samples[this.cursor].time > clampedTime) this.cursor -= 1;
    const first = samples[this.cursor];
    const second = samples[Math.min(samples.length - 1, this.cursor + 1)];
    const span = second.time - first.time;
    const amount = span > 0 ? (clampedTime - first.time) / span : 0;
    return {
      time: clampedTime,
      x: lerp(first.x, second.x, amount),
      y: lerp(first.y, second.y, amount),
      z: lerp(first.z, second.z, amount),
      heading: lerpAngle(first.heading, second.heading, amount),
      speed: lerp(first.speed, second.speed, amount),
      progress: lerp(first.progress ?? 0, second.progress ?? 1, amount),
    };
  }

  timeAtProgress(progress: number): number | null {
    if (!this.enabled || !this.run) return null;
    const samples = this.run.samples;
    const clampedProgress = Math.max(0, Math.min(1, progress));
    if (clampedProgress + 0.25 < this.lastProgress) this.progressCursor = 0;
    this.lastProgress = clampedProgress;
    while (this.progressCursor < samples.length - 2
      && (samples[this.progressCursor + 1].progress ?? 0) < clampedProgress) this.progressCursor += 1;
    while (this.progressCursor > 0 && (samples[this.progressCursor].progress ?? 0) > clampedProgress) this.progressCursor -= 1;
    const first = samples[this.progressCursor];
    const second = samples[Math.min(samples.length - 1, this.progressCursor + 1)];
    const firstProgress = first.progress ?? 0;
    const secondProgress = second.progress ?? 1;
    const span = secondProgress - firstProgress;
    return lerp(first.time, second.time, span > 0 ? (clampedProgress - firstProgress) / span : 0);
  }

  compareAtProgress(progress: number, currentTime: number): RallyGhostComparison {
    const ghostTime = this.timeAtProgress(progress);
    if (ghostTime === null) return { delta: null, state: "near" };
    const delta = currentTime - ghostTime;
    return {
      delta,
      state: Math.abs(delta) < 0.15 ? "near" : delta < 0 ? "ahead" : "behind",
    };
  }
}

export class RallyGhostRecorder {
  private recording = false;
  private samples: RallyGhostSample[] = [];
  private nextSampleTime = 0;

  constructor(
    private trackId: string,
    private readonly onSaved: (run: RallyGhostRun) => void,
    private environmentVariant: RallyEnvironmentVariant = "dry",
    private vehicleId: RallyVehicleId = "compact",
  ) {}

  setContext(environmentVariant: RallyEnvironmentVariant, vehicleId: RallyVehicleId): void {
    this.environmentVariant = environmentVariant;
    this.vehicleId = vehicleId;
  }

  begin(): void {
    this.recording = true;
    this.samples = [];
    this.nextSampleTime = 0;
  }

  cancel(): void {
    this.recording = false;
    this.samples = [];
  }

  update(car: RallyCar, phase: RallyPhase, lapTime: number, bestLap: number | null, progress: number): void {
    if (!this.recording) return;
    if (phase === "racing" && this.samples.length < MAX_SAMPLES && lapTime >= this.nextSampleTime) {
      this.samples.push({
        time: lapTime,
        x: car.position.x,
        y: car.position.y,
        z: car.position.z,
        heading: car.heading,
        speed: car.speed,
        progress,
      });
      this.nextSampleTime += SAMPLE_INTERVAL;
    }
    if (phase !== "finished") return;
    this.recording = false;
    if (this.samples.length < 2 || bestLap === null || lapTime > bestLap + 0.001) return;
    const run: RallyGhostRun = {
      version: RALLY_GHOST_DATA_VERSION,
      trackId: this.trackId,
      physicsVersion: RALLY_GHOST_PHYSICS_VERSION,
      environmentVariant: this.environmentVariant,
      vehicleId: this.vehicleId,
      duration: lapTime,
      samples: this.samples.slice(0, MAX_SAMPLES),
    };
    saveGhostRun(this.trackId, run);
    this.onSaved(run);
  }
}

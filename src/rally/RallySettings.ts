import type { RallySteeringDirection } from "./RallyInput";
import type { RallySteeringAssistMode } from "./RallySteeringAssist";
import type { RallyVehicleId } from "./VehicleDefinition";

export type RallyGraphicsQuality = "low" | "normal" | "high";

export interface RallySettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  cameraSensitivity: number;
  cameraShake: boolean;
  vibrationEnabled: boolean;
  ghostEnabled: boolean;
  touchSteeringSensitivity: number;
  steeringDirection: RallySteeringDirection;
  steeringAssist: RallySteeringAssistMode;
  graphicsQuality: RallyGraphicsQuality;
  debugTelemetry: boolean;
  onboardingSeen: boolean;
  selectedVehicle: RallyVehicleId;
}

export const RALLY_SETTINGS_VERSION = 4;
export const RALLY_SETTINGS_STORAGE_KEY = "voxel-rally.settings.v4";
const LEGACY_RALLY_SETTINGS_STORAGE_KEY = "voxel-rally.settings.v1";
const PREVIOUS_RALLY_SETTINGS_STORAGE_KEY = "voxel-rally.settings.v2";
const PREVIOUS_RALLY_SETTINGS_STORAGE_KEY_V3 = "voxel-rally.settings.v3";
export const DEFAULT_RALLY_SETTINGS: RallySettings = {
  soundEnabled: true,
  musicEnabled: true,
  cameraSensitivity: 1,
  cameraShake: true,
  vibrationEnabled: true,
  ghostEnabled: true,
  touchSteeringSensitivity: 1,
  // Floating relative steering follows the finger direction by default:
  // slide left to turn left, slide right to turn right.
  steeringDirection: "normal",
  steeringAssist: "strong",
  graphicsQuality: "normal",
  debugTelemetry: false,
  onboardingSeen: false,
  selectedVehicle: "compact",
};

function storage(): Storage | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return null;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function finite(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

export function parseRallySettings(value: unknown): RallySettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_RALLY_SETTINGS };
  const candidate = value as Partial<RallySettings> & { version?: unknown };
  if (candidate.version !== 1 && candidate.version !== 2 && candidate.version !== 3 && candidate.version !== RALLY_SETTINGS_VERSION) return { ...DEFAULT_RALLY_SETTINGS };
  return {
    soundEnabled: typeof candidate.soundEnabled === "boolean" ? candidate.soundEnabled : DEFAULT_RALLY_SETTINGS.soundEnabled,
    musicEnabled: typeof candidate.musicEnabled === "boolean" ? candidate.musicEnabled : DEFAULT_RALLY_SETTINGS.musicEnabled,
    cameraSensitivity: finite(candidate.cameraSensitivity, 1, 0.5, 1.6),
    cameraShake: typeof candidate.cameraShake === "boolean" ? candidate.cameraShake : DEFAULT_RALLY_SETTINGS.cameraShake,
    vibrationEnabled: typeof candidate.vibrationEnabled === "boolean" ? candidate.vibrationEnabled : DEFAULT_RALLY_SETTINGS.vibrationEnabled,
    ghostEnabled: typeof candidate.ghostEnabled === "boolean" ? candidate.ghostEnabled : DEFAULT_RALLY_SETTINGS.ghostEnabled,
    touchSteeringSensitivity: finite(candidate.touchSteeringSensitivity, 1, 0.6, 1.5),
    steeringDirection: candidate.steeringDirection === "normal" || candidate.steeringDirection === "inverted" ? candidate.steeringDirection : DEFAULT_RALLY_SETTINGS.steeringDirection,
    steeringAssist: candidate.steeringAssist === "off" || candidate.steeringAssist === "normal" || candidate.steeringAssist === "strong" ? candidate.steeringAssist : DEFAULT_RALLY_SETTINGS.steeringAssist,
    graphicsQuality: candidate.graphicsQuality === "low" || candidate.graphicsQuality === "high" ? candidate.graphicsQuality : DEFAULT_RALLY_SETTINGS.graphicsQuality,
    debugTelemetry: typeof candidate.debugTelemetry === "boolean" ? candidate.debugTelemetry : DEFAULT_RALLY_SETTINGS.debugTelemetry,
    onboardingSeen: typeof candidate.onboardingSeen === "boolean" ? candidate.onboardingSeen : DEFAULT_RALLY_SETTINGS.onboardingSeen,
    selectedVehicle: candidate.selectedVehicle === "muscle" || candidate.selectedVehicle === "buggy" ? candidate.selectedVehicle : "compact",
  };
}

export function loadRallySettings(): RallySettings {
  const target = storage();
  const saved = target?.getItem(RALLY_SETTINGS_STORAGE_KEY)
    ?? target?.getItem(PREVIOUS_RALLY_SETTINGS_STORAGE_KEY_V3)
    ?? target?.getItem(PREVIOUS_RALLY_SETTINGS_STORAGE_KEY)
    ?? target?.getItem(LEGACY_RALLY_SETTINGS_STORAGE_KEY);
  if (!saved) return { ...DEFAULT_RALLY_SETTINGS };
  try {
    return parseRallySettings(JSON.parse(saved));
  } catch {
    return { ...DEFAULT_RALLY_SETTINGS };
  }
}

export function saveRallySettings(settings: RallySettings): void {
  const target = storage();
  if (!target) return;
  try {
    target.setItem(RALLY_SETTINGS_STORAGE_KEY, JSON.stringify({ version: RALLY_SETTINGS_VERSION, ...parseRallySettings({ version: RALLY_SETTINGS_VERSION, ...settings }) }));
  } catch {
    // Storage failures must never block gameplay.
  }
}

export function resetRallySaveData(): void {
  const target = storage();
  if (!target) return;
  for (const key of [
    RALLY_SETTINGS_STORAGE_KEY,
    PREVIOUS_RALLY_SETTINGS_STORAGE_KEY_V3,
    PREVIOUS_RALLY_SETTINGS_STORAGE_KEY,
    LEGACY_RALLY_SETTINGS_STORAGE_KEY,
    "voxel-rally.time-attack.v2",
    "voxel-rally.time-attack.v1",
    "voxel-rally.ghost.v1",
    "voxel-rally.ghost.v2",
    "voxel-rally.ghost.v3",
    "voxel-rally.championship.v1",
    "voxel-rally.championship-run.v1",
  ]) {
    try {
      target.removeItem(key);
    } catch {
      // Ignore private-mode storage errors.
    }
  }
}

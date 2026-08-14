import type { RallyMode, RallyStats } from "./RallyTypes";
import type { RallyVehicleId } from "./VehicleDefinition";
import type { RallySettings } from "./RallySettings";
import type { AIDriverProfile } from "./ai/AIDriverProfile";

export interface RallyDemoHandle {
  startRace(): void;
  resetRace(): void;
  setSteering(value: number | null): void;
  beginRelativeSteering(pointerId: number, originX: number): boolean;
  updateRelativeSteering(pointerId: number, currentX: number): boolean;
  endRelativeSteering(pointerId: number): boolean;
  setThrottle(active: boolean): void;
  setBrake(active: boolean): void;
  setBoost(active: boolean): void;
  setGhostEnabled(enabled: boolean): void;
  setRaceMode(mode: RallyMode): void;
  pause(): void;
  resume(): void;
  setVehicleClass(id: RallyVehicleId): void;
  setSettings(settings: RallySettings): void;
  setDifficulty(difficulty: AIDriverProfile["id"]): void;
  getStats(): RallyStats;
  dispose(): void;
}

export type RallyPhase = "ready" | "countdown" | "racing" | "finished";
export type RallyMedal = "BRONZE" | "SILVER" | "GOLD";
export type RallySurface = "road" | "asphalt" | "dirt" | "gravel" | "grass" | "mud" | "rock";
export type RallyGhostDeltaState = "ahead" | "behind" | "near";
export type RallyMode = "time-attack" | "race" | "championship";
import type { RallyVehicleId } from "./VehicleDefinition";
import type { RallyDriftGrade } from "./RallyDrift";
import type { RallyDestructionKind, RallySmashReward } from "./RallyDestruction";
import type { RallyLandingGrade } from "./RallyLanding";

export interface RallyInputState {
  throttle: number;
  brake: number;
  steer: number;
  /** Mobile hover-racer lateral control. Classic steering remains optional. */
  strafe?: number;
  boost?: boolean;
}

export interface RallyVehicleSnapshot {
  vehicleId: RallyVehicleId;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  lateralSpeed: number;
  slipAngle: number;
  drifting: boolean;
  groundedRatio: number;
  airborne: boolean;
  collisionImpact: number;
  bodyDamage: number;
  smokeLevel: number;
  driftGrade: RallyDriftGrade;
  driftScore: number;
  driftCount: number;
  boostEnergy: number;
  boostCharges: number;
  maxBoostCharges: number;
  boostTimeRemaining: number;
  boostActive: boolean;
  boostCount: number;
  boostChainCount: number;
  pickupCount: number;
  ramCount: number;
  hoverBank: number;
  destructionCount: number;
  lastDestructionKind: RallyDestructionKind | null;
  rewardMessage: RallySmashReward;
  landingGrade: RallyLandingGrade;
  landingCount: number;
  grounded: boolean;
}

export interface RallyTelemetry {
  speed: number;
  forwardSpeed: number;
  lateralSpeed: number;
  slipAngle: number;
  steer: number;
  throttle: number;
  brake: number;
  grounded: boolean;
  surface: RallySurface;
  drifting: boolean;
  driftGrade: RallyDriftGrade;
  driftDuration: number;
  boostEnergy: number;
  boostActive: boolean;
  airTime: number;
  /** Mobile-only road-assist diagnostics; zero when no player assist is active. */
  roadAssistStrength: number;
  edgePressure: number;
  turnAheadStrength: number;
  autoThrottle: number;
  autoDrift: boolean;
  targetLane: number;
  desiredLateralDistance: number;
  crossTrackVelocity: number;
  roadFollowSteer: number;
  laneSteer: number;
  headingAssist: number;
  brakingDistance: number;
  targetCornerSpeed: number;
  strafe: number;
  lateralTarget: number;
  boostCharges: number;
  boostTimeRemaining: number;
}

export interface RallyStats {
  trackId: string;
  trackName: string;
  phase: RallyPhase;
  countdown: number;
  lapTime: number;
  bestLap: number | null;
  speedKph: number;
  checkpoint: number;
  totalCheckpoints: number;
  progress: number;
  wrongWay: boolean;
  missedCheckpoint: boolean;
  sector: number;
  lastSplit: number | null;
  medal: RallyMedal | null;
  bestDelta: number | null;
  ghostDelta: number | null;
  ghostState: RallyGhostDeltaState;
  environmentVariant: "dry" | "wet" | "sunset";
  telemetry: RallyTelemetry;
  mode: RallyMode;
  position: number;
  positionChange: number;
  racers: number;
  bestSplits: number[];
  message: string;
  grounded: boolean;
  vehicle: RallyVehicleSnapshot;
  vehicleId: RallyVehicleId;
  renderer: "webgl" | "canvas3d";
}

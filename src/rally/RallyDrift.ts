import type { RallySurface } from "./RallyTypes";

export type RallyDriftGrade = "NONE" | "DRIFT" | "GOOD DRIFT" | "GREAT DRIFT";

export interface RallyDriftInput {
  speed: number;
  slipAngle: number;
  steer: number;
  duration: number;
  surface: RallySurface;
  grounded: boolean;
  /** Distance travelled along the course during this drift window. */
  courseProgressDistance?: number;
  /** Actual forward travel during this drift window. */
  forwardDistance?: number;
  /** 0..1 estimate of how steadily the driver is controlling the slide. */
  controlStability?: number;
  /** Time spent sliding without meaningful course progress. */
  samePlaceTime?: number;
}

export interface RallyDriftEvaluation {
  eligible: boolean;
  grade: RallyDriftGrade;
  quality: number;
  scorePerSecond: number;
  energyPerSecond: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function evaluateRallyDrift(input: RallyDriftInput): RallyDriftEvaluation {
  const speed = Math.abs(input.speed);
  const slip = Math.abs(input.slipAngle);
  const eligible = input.grounded && speed >= 7.5 && Math.abs(input.steer) >= 0.1 && slip >= 0.06;
  if (!eligible) return { eligible: false, grade: "NONE", quality: 0, scorePerSecond: 0, energyPerSecond: 0 };
  const speedQuality = clamp((speed - 7.5) / 14, 0, 1);
  const slipQuality = clamp((slip - 0.06) / 0.45, 0, 1);
  const controlQuality = clamp(Math.abs(input.steer), 0, 1);
  const forwardDistance = input.forwardDistance ?? speed * input.duration;
  const courseProgressDistance = input.courseProgressDistance ?? forwardDistance;
  const forwardQuality = clamp(forwardDistance / Math.max(1, input.duration * 4), 0, 1);
  const progressQuality = clamp(courseProgressDistance / Math.max(1, input.duration * 3), 0, 1);
  const controlStability = clamp(input.controlStability ?? 1, 0, 1);
  const samePlaceTime = Math.max(0, input.samePlaceTime ?? 0);
  const surfacePenalty = input.surface === "grass" || input.surface === "mud" ? 0.72 : input.surface === "gravel" ? 0.88 : 1;
  const quality = clamp(
    (speedQuality * 0.25
      + slipQuality * 0.3
      + controlQuality * 0.15
      + forwardQuality * 0.12
      + progressQuality * 0.1
      + controlStability * 0.08) * surfacePenalty,
    0,
    1,
  );
  const grade: RallyDriftGrade = input.duration >= 0.55
      && quality >= 0.72
      && progressQuality >= 0.45
      && controlStability >= 0.5
    ? "GREAT DRIFT"
    : input.duration >= 0.28 && quality >= 0.42
      ? "GOOD DRIFT"
      : "DRIFT";
  return {
    eligible: true,
    grade,
    quality,
    scorePerSecond: (0.6 + quality * 1.8) * surfacePenalty,
    // A corner drift travels along the course and keeps the normal reward.
    // A stationary donut has very little progress and quickly reaches the
    // diminishing-return floor instead of becoming an infinite Boost farm.
    energyPerSecond: (0.012 + quality * 0.028)
      * surfacePenalty
      * (0.16 + progressQuality * 0.84)
      * (samePlaceTime > 0.65 ? clamp(1 - (samePlaceTime - 0.65) * 1.8, 0.08, 1) : 1),
  };
}

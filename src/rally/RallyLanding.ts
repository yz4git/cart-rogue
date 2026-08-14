export type RallyLandingGrade = "NONE" | "BAD LANDING" | "CLEAN LANDING" | "PERFECT LANDING";

export interface RallyLandingInput {
  impact: number;
  lateralSpeed: number;
  pitch: number;
  roll: number;
  airTime: number;
}

export function evaluateRallyLanding(input: RallyLandingInput): RallyLandingGrade {
  if (input.airTime < 0.1) return "NONE";
  const hardImpact = input.impact > 0.78;
  const unstable = Math.abs(input.lateralSpeed) > 5.2 || Math.abs(input.pitch) > 0.2 || Math.abs(input.roll) > 0.24;
  if (hardImpact || unstable) return "BAD LANDING";
  if (input.impact <= 0.34 && Math.abs(input.lateralSpeed) <= 1.25 && Math.abs(input.pitch) <= 0.09 && Math.abs(input.roll) <= 0.1) {
    return "PERFECT LANDING";
  }
  return "CLEAN LANDING";
}

export function rallyLandingBoostReward(grade: RallyLandingGrade): number {
  if (grade === "PERFECT LANDING") return 0.16;
  if (grade === "CLEAN LANDING") return 0.04;
  return 0;
}

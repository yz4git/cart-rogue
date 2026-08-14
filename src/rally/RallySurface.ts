import type { RallySurface } from "./RallyTypes";

export type RallyEnvironmentVariant = "dry" | "wet" | "sunset";

export interface RallySurfaceProfile {
  grip: number;
  driftGrip: number;
  speedRatio: number;
  rollingResistance: number;
  dustStrength: number;
}

const SURFACE_PROFILES: Record<RallySurface, RallySurfaceProfile> = {
  road: { grip: 8.5, driftGrip: 4.6, speedRatio: 1, rollingResistance: 0.25, dustStrength: 0 },
  asphalt: { grip: 8.8, driftGrip: 4.7, speedRatio: 1, rollingResistance: 0.22, dustStrength: 0 },
  dirt: { grip: 6.1, driftGrip: 3.8, speedRatio: 0.76, rollingResistance: 1.8, dustStrength: 0.65 },
  gravel: { grip: 5.8, driftGrip: 3.6, speedRatio: 0.82, rollingResistance: 1.4, dustStrength: 0.8 },
  grass: { grip: 4.8, driftGrip: 3.6, speedRatio: 0.58, rollingResistance: 3.2, dustStrength: 0.45 },
  mud: { grip: 3.5, driftGrip: 2.5, speedRatio: 0.42, rollingResistance: 4.8, dustStrength: 0.3 },
  rock: { grip: 5.2, driftGrip: 3.1, speedRatio: 0.62, rollingResistance: 2.6, dustStrength: 0.25 },
};

export function getRallySurfaceProfile(surface: RallySurface, variant: RallyEnvironmentVariant = "dry"): RallySurfaceProfile {
  const profile = SURFACE_PROFILES[surface] ?? SURFACE_PROFILES.road;
  if (variant !== "wet") return profile;
  return {
    ...profile,
    grip: profile.grip * 0.78,
    driftGrip: profile.driftGrip * 0.72,
    speedRatio: profile.speedRatio * 0.96,
    rollingResistance: profile.rollingResistance * 1.12,
  };
}

export function listRallySurfaces(): readonly RallySurface[] {
  return ["road", "asphalt", "dirt", "gravel", "grass", "mud", "rock"];
}

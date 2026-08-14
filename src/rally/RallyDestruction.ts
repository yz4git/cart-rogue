export type RallyDestructionKind = "tree" | "rock" | "barrier" | "fence" | "wall" | "safety-block";

export interface RallyDestructionProfile {
  fragmentCount: number;
  dustCount: number;
  fragmentStrength: number;
  boostReward: number;
  color: number;
}

export type RallySmashReward = "NONE" | "SMASH" | "BOOST SMASH" | "BOOST +1" | "BOOST CHAIN";

const PROFILES: Record<RallyDestructionKind, RallyDestructionProfile> = {
  tree: { fragmentCount: 14, dustCount: 10, fragmentStrength: 0.95, boostReward: 0.16, color: 0xb47a42 },
  rock: { fragmentCount: 18, dustCount: 12, fragmentStrength: 1.08, boostReward: 0.2, color: 0x9c9da2 },
  barrier: { fragmentCount: 20, dustCount: 9, fragmentStrength: 1.2, boostReward: 0.18, color: 0x8de5d2 },
  fence: { fragmentCount: 16, dustCount: 10, fragmentStrength: 1.02, boostReward: 0.15, color: 0xc48a4b },
  wall: { fragmentCount: 26, dustCount: 16, fragmentStrength: 1.28, boostReward: 0.23, color: 0xb77cff },
  "safety-block": { fragmentCount: 16, dustCount: 11, fragmentStrength: 1.08, boostReward: 0.17, color: 0x83e6db },
};

export function rallyDestructionProfile(kind: RallyDestructionKind): RallyDestructionProfile {
  return PROFILES[kind];
}

export function rallyDestructionBoostReward(kind: RallyDestructionKind, boosted: boolean): number {
  const reward = PROFILES[kind].boostReward * (boosted ? 1.45 : 1);
  return Math.min(0.3, reward);
}

export type AIPersonalityId = "aggressive" | "technical" | "safe";

export interface AIPersonality {
  id: AIPersonalityId;
  targetSpeedRatio: number;
  lineOffset: number;
  shortcutBias: number;
  mistakeMultiplier: number;
  brakingMarginRatio: number;
  overtakeRatio: number;
  destructibleSpeedRatio: number;
  boostBias: number;
  /** How strongly this driver moves off its normal line for a pickup chain. */
  pickupBias?: number;
  boostCooldown: number;
}

export const RALLY_AI_PERSONALITIES: Readonly<Record<AIPersonalityId, AIPersonality>> = {
  aggressive: {
    id: "aggressive",
    targetSpeedRatio: 1.04,
    lineOffset: 0.42,
    shortcutBias: 1.28,
    mistakeMultiplier: 1.15,
    brakingMarginRatio: 0.9,
    overtakeRatio: 1.24,
    destructibleSpeedRatio: 0.92,
    boostBias: 1.1,
    pickupBias: 1.15,
    boostCooldown: 0.7,
  },
  technical: {
    id: "technical",
    targetSpeedRatio: 1,
    lineOffset: 0,
    shortcutBias: 1,
    mistakeMultiplier: 1,
    brakingMarginRatio: 1,
    overtakeRatio: 1,
    destructibleSpeedRatio: 0.78,
    boostBias: 0.86,
    pickupBias: 1.35,
    boostCooldown: 0.95,
  },
  safe: {
    id: "safe",
    targetSpeedRatio: 0.91,
    lineOffset: -0.35,
    shortcutBias: 0.45,
    mistakeMultiplier: 0.55,
    brakingMarginRatio: 1.2,
    overtakeRatio: 0.65,
    destructibleSpeedRatio: 0.58,
    boostBias: 0.55,
    pickupBias: 0.72,
    boostCooldown: 1.2,
  },
};

export interface AIDriverProfile {
  id: "easy" | "normal" | "hard";
  lookAhead: number;
  targetSpeed: number;
  steerGain: number;
  lateralGain: number;
  brakingMargin: number;
  obstacleLookAhead: number;
  reactionTime: number;
  racingLineAccuracy: number;
  mistakeProbability: number;
  shortcutUsage: number;
  overtakeOffset: number;
  jumpThrottle: number;
  boostUsage: number;
}

export const RALLY_AI_PROFILES: Readonly<Record<AIDriverProfile["id"], AIDriverProfile>> = {
  easy: {
    id: "easy",
    lookAhead: 8,
    targetSpeed: 31,
    steerGain: 1.7,
    lateralGain: 0.07,
    brakingMargin: 3.5,
    obstacleLookAhead: 10,
    reactionTime: 0.28,
    racingLineAccuracy: 0.7,
    mistakeProbability: 0.08,
    shortcutUsage: 0.1,
    overtakeOffset: 0.7,
    jumpThrottle: 0.7,
    boostUsage: 0.3,
  },
  normal: {
    id: "normal",
    lookAhead: 11,
    targetSpeed: 36,
    steerGain: 2.05,
    lateralGain: 0.09,
    brakingMargin: 2.5,
    obstacleLookAhead: 13,
    reactionTime: 0.18,
    racingLineAccuracy: 0.88,
    mistakeProbability: 0.035,
    shortcutUsage: 0.45,
    overtakeOffset: 1.1,
    jumpThrottle: 0.86,
    boostUsage: 0.68,
  },
  hard: {
    id: "hard",
    lookAhead: 14,
    targetSpeed: 40,
    steerGain: 2.35,
    lateralGain: 0.11,
    brakingMargin: 1.8,
    obstacleLookAhead: 16,
    reactionTime: 0.11,
    racingLineAccuracy: 0.97,
    mistakeProbability: 0.015,
    shortcutUsage: 0.78,
    overtakeOffset: 1.45,
    jumpThrottle: 0.98,
    boostUsage: 0.94,
  },
};

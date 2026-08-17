export type CartHandling2Mode = "normal" | "drift" | "turbo-pivot" | "turbo-dash";

export interface CartHandling2Profile {
  mode: CartHandling2Mode;
  yawScale: number;
  maxYawRate: number;
  maxLateralRatio: number;
}

export interface CartHandling2Input {
  speed: number;
  steer: number;
  brake: number;
  turboHeld: boolean;
  boostActive: boolean;
  drifting: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * clamp(amount, 0, 1);
}

export function cartHandling2Mode(input: CartHandling2Input): CartHandling2Mode {
  if (input.turboHeld) return "turbo-pivot";
  if (input.boostActive) return "turbo-dash";
  if (input.drifting || (input.brake > 0.08 && Math.abs(input.steer) > 0.12)) return "drift";
  return "normal";
}

/**
 * Final handling envelope applied after the legacy phase stack.
 *
 * The older phases still own acceleration, contacts, Turbo charging and arena
 * progression. This profile only gives the resulting steering one explicit
 * authority: agile at low speed, stable at high speed, and deliberately slower
 * while drifting or charging Turbo.
 */
export function cartHandling2Profile(input: CartHandling2Input): CartHandling2Profile {
  const mode = cartHandling2Mode(input);
  const speedRatio = clamp(Math.abs(input.speed) / 16.8, 0, 1);

  switch (mode) {
    case "turbo-pivot":
      return { mode, yawScale: 0.92, maxYawRate: 2.08, maxLateralRatio: 0 };
    case "turbo-dash":
      return { mode, yawScale: 0.84, maxYawRate: 2.0, maxLateralRatio: 0.18 };
    case "drift":
      return { mode, yawScale: 0.88, maxYawRate: 2.18, maxLateralRatio: 0.42 };
    default:
      return {
        mode,
        yawScale: lerp(1.08, 0.84, speedRatio),
        maxYawRate: lerp(3.15, 2.3, speedRatio),
        maxLateralRatio: lerp(0.34, 0.2, speedRatio),
      };
  }
}

export function cartHandling2NormalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

export function cartHandling2ShapeHeadingDelta(
  headingDelta: number,
  delta: number,
  profile: CartHandling2Profile,
): number {
  const scaled = cartHandling2NormalizeAngle(headingDelta) * profile.yawScale;
  const cap = Math.max(0, delta) * profile.maxYawRate;
  return clamp(scaled, -cap, cap);
}

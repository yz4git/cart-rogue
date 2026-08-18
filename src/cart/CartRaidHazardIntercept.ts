import type { RallyCar } from "../rally/RallyCar";

export const CART_RAID_INTERCEPT_MIN_LEAD = 10;
export const CART_RAID_INTERCEPT_MAX_LEAD = 32;
export const CART_RAID_INTERCEPT_SPEED_SCALE = 0.96;
export const CART_RAID_INTERCEPT_BASE_EXTRA = 3.8;
export const CART_RAID_INTERCEPT_DONUT_EXTRA = 9.5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Predict where the player will be when a tracking telegraph actually fires.
 * The hazard still locks before impact; this only moves the lock point forward
 * so holding the current line is no longer the default safe answer.
 */
export function cartRaidInterceptLead(
  car: Pick<RallyCar, "forwardVelocity" | "speed" | "boostActive">,
  telegraphSeconds: number,
  followSeconds: number,
  extraMeters = CART_RAID_INTERCEPT_BASE_EXTRA,
): number {
  const lockWindow = Math.max(0.45, telegraphSeconds - followSeconds);
  const speed = Math.max(Math.abs(car.forwardVelocity), Math.abs(car.speed));
  const boostExtra = car.boostActive ? 2.2 : 0;
  return clamp(
    speed * lockWindow * CART_RAID_INTERCEPT_SPEED_SCALE + extraMeters + boostExtra,
    CART_RAID_INTERCEPT_MIN_LEAD,
    CART_RAID_INTERCEPT_MAX_LEAD,
  );
}

export function cartRaidDonutInterceptLead(
  car: Pick<RallyCar, "forwardVelocity" | "speed" | "boostActive">,
  telegraphSeconds: number,
  followSeconds: number,
): number {
  return cartRaidInterceptLead(car, telegraphSeconds, followSeconds, CART_RAID_INTERCEPT_DONUT_EXTRA);
}

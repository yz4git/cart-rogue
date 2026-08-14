export interface RallyDamageEffects {
  maxSpeedRatio: number;
  steeringRatio: number;
  smokeLevel: number;
}

export const RALLY_DAMAGE_LIMIT = 1;

export function collisionDamage(
  impactSpeed: number,
  vehicleWeight: number,
  destructible: boolean,
): number {
  const threshold = destructible ? 7 : 5;
  const excessSpeed = Math.max(0, Math.abs(impactSpeed) - threshold);
  const obstacleFactor = destructible ? 1.1 : 0.8;
  return Math.min(0.34, excessSpeed / 30 * obstacleFactor / Math.max(0.5, vehicleWeight));
}

export function damageEffects(bodyDamage: number): RallyDamageEffects {
  const damage = Math.max(0, Math.min(RALLY_DAMAGE_LIMIT, bodyDamage));
  return {
    maxSpeedRatio: 1 - damage * 0.14,
    steeringRatio: 1 - damage * 0.2,
    smokeLevel: Math.max(0, (damage - 0.35) / 0.65),
  };
}

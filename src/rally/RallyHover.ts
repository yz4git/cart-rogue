/** Renderer-independent helpers for the anti-gravity racer control model. */

export function clampHoverInput(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function hoverSafeHalfWidth(roadHalfWidth: number, vehicleHalfWidth: number, margin = 0.42): number {
  return Math.max(0.5, (Number.isFinite(roadHalfWidth) ? roadHalfWidth : 1)
    - Math.max(0, Number.isFinite(vehicleHalfWidth) ? vehicleHalfWidth : 0.9)
    - margin);
}

export function approachHoverTarget(current: number, input: number, deltaSeconds: number, response = 7.5): number {
  const target = clampHoverInput(input);
  const delta = Math.max(0, Math.min(0.05, Number.isFinite(deltaSeconds) ? deltaSeconds : 0));
  const blend = 1 - Math.exp(-Math.max(0, response) * delta);
  return current + (target - current) * blend;
}

export interface HoverLateralStep {
  position: number;
  velocity: number;
  boundaryPressure: number;
}

export function stepHoverLateral(
  position: number,
  velocity: number,
  targetPosition: number,
  safeHalfWidth: number,
  deltaSeconds: number,
  lateralAcceleration = 32,
  lateralDrag = 8.5,
): HoverLateralStep {
  const delta = Math.max(0, Math.min(0.05, Number.isFinite(deltaSeconds) ? deltaSeconds : 0));
  const safe = Math.max(0.5, Number.isFinite(safeHalfWidth) ? safeHalfWidth : 1);
  const target = Math.max(-safe, Math.min(safe, Number.isFinite(targetPosition) ? targetPosition : 0));
  const error = target - position;
  const acceleration = Math.max(-lateralAcceleration, Math.min(lateralAcceleration, error * lateralAcceleration * 1.6));
  let nextVelocity = velocity + acceleration * delta;
  nextVelocity *= Math.exp(-Math.max(0, lateralDrag) * delta);
  let nextPosition = position + nextVelocity * delta;
  const ratio = Math.abs(nextPosition) / safe;
  const pressure = Math.max(0, Math.min(1, (ratio - 0.78) / 0.22));
  if (Math.abs(nextPosition) > safe) {
    const side = Math.sign(nextPosition) || 1;
    nextPosition = safe * side;
    if (nextVelocity * side > 0) nextVelocity *= Math.max(0, 1 - pressure * 0.9);
  }
  return { position: nextPosition, velocity: nextVelocity, boundaryPressure: pressure };
}

export function approachRoadHeading(current: number, target: number, deltaSeconds: number, rate = 4.8): number {
  const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
  const delta = Math.max(0, Math.min(0.05, Number.isFinite(deltaSeconds) ? deltaSeconds : 0));
  return wrap(current + wrap(target - current) * (1 - Math.exp(-Math.max(0, rate) * delta)));
}

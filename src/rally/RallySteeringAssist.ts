import type { RallyTrackQuery } from "./RallyTrack";
import { RALLY_CONFIG } from "./RallyConfig";

export type RallySteeringAssistMode = "off" | "normal" | "strong";

export interface RallySteeringAssistInput {
  playerSteer: number;
  lateralDistance: number;
  roadHalfWidth: number;
  heading: number;
  trackHeading: number;
  speed: number;
  forwardVelocity: number;
  predictedLateralDistance?: number;
  predictedTrackHeading?: number;
  shortcutIntent?: boolean;
  intentionalOffRoad?: boolean;
  drifting?: boolean;
  boostActive?: boolean;
  boostSmashIntent?: boolean;
  mode?: RallySteeringAssistMode;
}

export interface RallySteeringAssistOutput {
  assistSteer: number;
  finalSteer: number;
  assistStrength: number;
  /** 1 in the center; only outward input near the edge is compressed. */
  playerSteerScale: number;
}

const CENTER_FREE_RATIO = 0.55;
const EDGE_FULL_RATIO = 0.98;
const NORMAL_MAX_STRENGTH = 0.88;
const STRONG_MAX_STRENGTH = 0.98;
const NORMAL_OUTWARD_SUPPRESSION = 0.78;
const STRONG_OUTWARD_SUPPRESSION = 0.92;
const MIN_SPEED = 2.5;

function clamp(value: number, minimum = -1, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Additive, renderer-independent lane protection for the player car.
 *
 * The center of the road stays free so the driver can choose an inside,
 * middle, or outside line. The correction only grows near the boundary and
 * is reduced when the player is deliberately taking a shortcut or drifting.
 */
export function evaluateRallySteeringAssist(input: RallySteeringAssistInput): RallySteeringAssistOutput {
  const playerSteer = clamp(input.playerSteer);
  const mode = input.mode ?? "normal";
  if (mode === "off") return { assistSteer: 0, finalSteer: playerSteer, assistStrength: 0, playerSteerScale: 1 };

  const roadHalfWidth = Math.max(0.1, finite(input.roadHalfWidth, 1));
  const lateralDistance = finite(input.predictedLateralDistance, finite(input.lateralDistance, 0));
  const lateralRatio = Math.abs(lateralDistance) / roadHalfWidth;
  if (Math.abs(finite(input.speed, input.forwardVelocity)) < MIN_SPEED && lateralRatio < 1) {
    return { assistSteer: 0, finalSteer: playerSteer, assistStrength: 0, playerSteerScale: 1 };
  }

  const edgePressure = smoothstep(CENTER_FREE_RATIO, EDGE_FULL_RATIO, lateralRatio);
  if (edgePressure <= 0) return { assistSteer: 0, finalSteer: playerSteer, assistStrength: 0, playerSteerScale: 1 };

  const side = lateralDistance === 0 ? 0 : Math.sign(lateralDistance);
  const correctionDirection = side === 0 ? 0 : -side;
  const headingError = wrapAngle(
    finite(input.predictedTrackHeading, finite(input.trackHeading, 0)) - finite(input.heading, 0),
  );
  // Positive outwardHeading means the car is pointing farther toward the
  // current road edge; negative means the player's own steering is already
  // bringing it back in.
  const outwardHeading = side === 0 ? 0 : -side * headingError;
  const headingPressure = clamp(outwardHeading / 0.32, -1, 1);
  const directionalPressure = clamp(edgePressure + headingPressure * 0.42, 0, 1);
  const maximumStrength = mode === "strong" ? STRONG_MAX_STRENGTH : NORMAL_MAX_STRENGTH;
  let assistStrength = maximumStrength * directionalPressure;
  let intentFactor = 1;

  if (input.drifting) intentFactor *= 0.68;
  if (input.shortcutIntent) intentFactor *= 0.28;
  if (input.intentionalOffRoad) intentFactor *= 0.58;
  if (input.boostSmashIntent) intentFactor *= 0.24;
  assistStrength *= intentFactor;
  // A stopped car should not receive a surprising steering snap, but a moving
  // car may still be gently protected before it leaves the road.
  if (Math.abs(finite(input.forwardVelocity, 0)) < MIN_SPEED) assistStrength *= 0.35;

  const assistSteer = clamp(correctionDirection * assistStrength);
  const outwardPlayerSteer = side === 0 ? 0 : Math.max(0, playerSteer * side);
  const maximumSuppression = mode === "strong" ? STRONG_OUTWARD_SUPPRESSION : NORMAL_OUTWARD_SUPPRESSION;
  // Do not let a full outward thumb displacement overpower the recovery at the
  // boundary. The center remains untouched, and intentional shortcut/drift
  // input keeps most of its authority.
  const playerSuppression = outwardPlayerSteer > 0
    ? clamp((edgePressure - 0.08) / 0.92, 0, 1) * maximumSuppression * Math.max(0.35, intentFactor)
    : 0;
  const playerSteerScale = 1 - playerSuppression;
  const effectivePlayerSteer = playerSteer * playerSteerScale;
  return {
    assistSteer,
    finalSteer: clamp(effectivePlayerSteer + assistSteer),
    assistStrength: Math.abs(assistSteer),
    playerSteerScale,
  };
}

/** Build the future sample used by RallyRace without putting renderer state in the rule. */
export function predictedTrackQuery(
  trackQuery: RallyTrackQuery,
  queryAt: (x: number, z: number, hintSegment?: number) => RallyTrackQuery,
  positionX: number,
  positionZ: number,
  velocityX: number,
  velocityZ: number,
  boostActive: boolean,
  speed = Math.hypot(velocityX, velocityZ),
): RallyTrackQuery {
  const speedRatio = clamp(Math.abs(finite(speed, 0)) / RALLY_CONFIG.vehicle.maxSpeed, 0, 1);
  const lookAheadTime = boostActive ? 0.55 + speedRatio * 0.2 : 0.25 + speedRatio * 0.3;
  return queryAt(
    positionX + finite(velocityX, 0) * lookAheadTime,
    positionZ + finite(velocityZ, 0) * lookAheadTime,
    trackQuery.segmentIndex,
  );
}

export const RALLY_STEERING_ASSIST_CONSTANTS = {
  centerFreeRatio: CENTER_FREE_RATIO,
  edgeFullRatio: EDGE_FULL_RATIO,
  normalMaxStrength: NORMAL_MAX_STRENGTH,
  strongMaxStrength: STRONG_MAX_STRENGTH,
  normalOutwardSuppression: NORMAL_OUTWARD_SUPPRESSION,
  strongOutwardSuppression: STRONG_OUTWARD_SUPPRESSION,
  minSpeed: MIN_SPEED,
  normalLookAheadSeconds: 0.25,
  normalLookAheadMaxSeconds: 0.55,
  boostLookAheadSeconds: 0.55,
  boostLookAheadMaxSeconds: 0.75,
};

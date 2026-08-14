import type { RallyUpcomingTurn } from "./RallyTrack";
import { evaluateRallySteeringAssist, type RallySteeringAssistMode, type RallySteeringAssistOutput } from "./RallySteeringAssist";

export interface RallyRoadAssistInput {
  playerSteer: number;
  throttle: number;
  lateralDistance: number;
  predictedLateralDistance?: number;
  roadHalfWidth: number;
  vehicleHalfWidth: number;
  heading: number;
  trackHeading: number;
  predictedTrackHeading?: number;
  speed: number;
  forwardVelocity: number;
  lateralVelocity: number;
  /** World-space velocity projected onto the road's right normal. */
  crossTrackVelocity?: number;
  upcomingTurn: RallyUpcomingTurn;
  /** Mobile lane target: -1 left, 0 center, +1 right. */
  targetLane?: number;
  /** Current desired lateral position in road coordinates, if already planned. */
  desiredLateralDistance?: number;
  targetHeading?: number;
  shortcutIntent?: boolean;
  intentionalOffRoad?: boolean;
  drifting?: boolean;
  grounded?: boolean;
  boostActive?: boolean;
  boostSmashIntent?: boolean;
  roadRecovery?: boolean;
  mobileArcade?: boolean;
  mode?: RallySteeringAssistMode;
  maxSpeed?: number;
}

export interface RallyRoadAssistResult extends RallySteeringAssistOutput {
  /** 0 at the free center line, 1 at the safe envelope edge. */
  edgePressure: number;
  /** Remaining lateral velocity multiplier per 1/60 simulation step. */
  lateralVelocityScale: number;
  /** Auto throttle multiplier. A straight remains at 1. */
  autoThrottleScale: number;
  /** Small virtual brake used only when entering a corner too fast. */
  virtualBrake: number;
  recoveryStrength: number;
  upcomingTurnStrength: number;
  upcomingTurnDirection: number;
  recommendedSpeed: number;
  targetLane: number;
  desiredLateralDistance: number;
  crossTrackVelocity: number;
  roadFollowSteer: number;
  laneSteer: number;
  headingAssist: number;
  brakingDistance: number;
  targetCornerSpeed: number;
  /** Road-follow heading target used by the hover-racer simulation. */
  targetHeading: number;
}

const CENTER_FREE_RATIO = 0.52;
const EDGE_FULL_RATIO = 1;
const ROAD_ASSIST_MARGIN = 0.25;
const NORMAL_LATERAL_DAMPING = 0.9;
const STRONG_LATERAL_DAMPING = 1.55;
const DRIFT_LATERAL_FACTOR = 0.68;
const SHORTCUT_LATERAL_FACTOR = 0.38;
const BOOST_LATERAL_FACTOR = 0.78;
const NORMAL_ROAD_FOLLOW = 0.28;
const STRONG_ROAD_FOLLOW = 0.58;
const NORMAL_LANE_CONTROL = 0.38;
const STRONG_LANE_CONTROL = 0.62;
const STRONG_PLAYER_INTENT = 0.16;
const NORMAL_PLAYER_INTENT = 0.68;
const ROAD_FOLLOW_HEADING_GAIN = 0.86;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0));
}

function clampSigned(value: number): number {
  return clamp(value, -1, 1);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Project world velocity onto the road's right normal. Positive is road-right. */
export function worldCrossTrackVelocity(
  velocityX: number,
  velocityZ: number,
  tangentX: number,
  tangentZ: number,
): number {
  const normalX = finite(tangentZ, 0);
  const normalZ = -finite(tangentX, 0);
  return finite(velocityX, 0) * normalX + finite(velocityZ, 0) * normalZ;
}

export function safeLaneHalfWidth(roadHalfWidth: number, vehicleHalfWidth: number): number {
  return Math.max(0.5, finite(roadHalfWidth, 1) - Math.max(0, finite(vehicleHalfWidth, 0.9)) - ROAD_ASSIST_MARGIN);
}

export function roadEdgePressure(
  lateralDistance: number,
  roadHalfWidth: number,
  vehicleHalfWidth: number,
  predictedLateralDistance = lateralDistance,
): number {
  const safeHalfWidth = safeLaneHalfWidth(roadHalfWidth, vehicleHalfWidth);
  const currentRatio = Math.abs(finite(lateralDistance, 0)) / safeHalfWidth;
  const predictedRatio = Math.abs(finite(predictedLateralDistance, lateralDistance)) / safeHalfWidth;
  return smoothstep(CENTER_FREE_RATIO, EDGE_FULL_RATIO, Math.max(currentRatio, predictedRatio));
}

export function neutralRallyRoadAssist(playerSteer: number, turn: RallyUpcomingTurn): RallyRoadAssistResult {
  return {
    assistSteer: 0,
    finalSteer: playerSteer,
    assistStrength: 0,
    playerSteerScale: 1,
    edgePressure: 0,
    lateralVelocityScale: 1,
    autoThrottleScale: 1,
    virtualBrake: 0,
    recoveryStrength: 0,
    upcomingTurnStrength: turn.strength,
    upcomingTurnDirection: turn.direction,
    recommendedSpeed: turn.recommendedSpeed,
    targetLane: 0,
    desiredLateralDistance: 0,
    crossTrackVelocity: 0,
    roadFollowSteer: 0,
    laneSteer: 0,
    headingAssist: 0,
    brakingDistance: turn.brakingDistance ?? 0,
    targetCornerSpeed: turn.recommendedSpeed,
    targetHeading: finite(turn.targetHeading, turn.direction === 0 ? 0 : turn.targetHeading ?? 0),
  };
}

/**
 * Shared player-only mobile driving assistance. It never moves the car or
 * writes renderer state; it produces bounded inputs for the fixed simulation.
 */
export function evaluateRallyRoadAssist(input: RallyRoadAssistInput): RallyRoadAssistResult {
  const mode = input.mode ?? "normal";
  const turn = input.upcomingTurn;
  if (mode === "off") return neutralRallyRoadAssist(finite(input.playerSteer, 0), turn);

  const predictedLateral = finite(input.predictedLateralDistance, input.lateralDistance);
  const safeHalfWidth = safeLaneHalfWidth(input.roadHalfWidth, input.vehicleHalfWidth);
  const mobileRoadFollow = input.mobileArcade === true;
  const targetLane = mobileRoadFollow ? clampSigned(finite(input.targetLane, 0)) : 0;
  const desiredLateralDistance = finite(input.desiredLateralDistance, targetLane * safeHalfWidth);
  const edgePressure = roadEdgePressure(
    input.lateralDistance,
    input.roadHalfWidth,
    input.vehicleHalfWidth,
    predictedLateral,
  );
  const side = Math.sign(predictedLateral || input.lateralDistance);
  const crossTrackVelocity = finite(
    input.crossTrackVelocity,
    finite(input.lateralVelocity, 0),
  );
  const outwardLateral = side !== 0 && side * crossTrackVelocity > 0.08;
  const shortcutFactor = input.shortcutIntent ? SHORTCUT_LATERAL_FACTOR : 1;
  const driftFactor = input.drifting ? DRIFT_LATERAL_FACTOR : 1;
  const boostFactor = input.boostActive ? BOOST_LATERAL_FACTOR : 1;
  const recoveryStrength = edgePressure * (outwardLateral ? 1 : 0.48);
  const dampingRate = mode === "strong" ? STRONG_LATERAL_DAMPING : NORMAL_LATERAL_DAMPING;
  const damping = dampingRate * recoveryStrength * shortcutFactor * driftFactor * boostFactor;
  // This is intentionally a per-fixed-step scale so applying it in RallyCar
  // stays deterministic at 30/60/120Hz render cadences.
  const lateralVelocityScale = outwardLateral ? Math.exp(-damping / 60) : 1;

  const steeringInput: RallySteeringAssistOutput = evaluateRallySteeringAssist({
    playerSteer: finite(input.playerSteer, 0),
    lateralDistance: input.lateralDistance,
    predictedLateralDistance: predictedLateral,
    roadHalfWidth: safeHalfWidth,
    heading: input.heading,
    trackHeading: input.trackHeading,
    predictedTrackHeading: input.predictedTrackHeading,
    speed: input.speed,
    forwardVelocity: input.forwardVelocity,
    shortcutIntent: input.shortcutIntent,
    intentionalOffRoad: input.intentionalOffRoad,
    drifting: input.drifting,
    boostActive: input.boostActive,
    boostSmashIntent: input.boostSmashIntent,
    mode,
  });

  const maxSpeed = Math.max(1, finite(input.maxSpeed, 28));
  const turnStrength = clamp(turn.strength);
  const speed = Math.abs(finite(input.speed, input.forwardVelocity));
  const recommendedSpeed = Math.max(maxSpeed * 0.56, Math.min(maxSpeed, finite(turn.recommendedSpeed, maxSpeed)));
  const speedExcess = clamp((speed - recommendedSpeed) / Math.max(4, maxSpeed - recommendedSpeed));
  const cornerPressure = smoothstep(0.14, 0.72, turnStrength);
  const boostActive = input.boostActive === true;
  const mobileThrottle = mobileRoadFollow && finite(input.throttle, 0) > 0.5;
  const intentFactorForFollow = input.shortcutIntent || input.boostSmashIntent ? 0.32 : 1;
  const modeFollow = mobileRoadFollow
    ? (mode === "strong" ? STRONG_ROAD_FOLLOW : NORMAL_ROAD_FOLLOW) * intentFactorForFollow
    : 0;
  const modeLane = mobileRoadFollow
    ? (mode === "strong" ? STRONG_LANE_CONTROL : NORMAL_LANE_CONTROL) * intentFactorForFollow
    : 0;
  const playerIntent = mobileRoadFollow
    ? (mode === "strong" ? STRONG_PLAYER_INTENT : NORMAL_PLAYER_INTENT)
    : 1;
  const targetHeading = finite(input.targetHeading, finite(turn.targetHeading, input.trackHeading));
  const headingError = wrapAngle(targetHeading - finite(input.heading, 0));
  const speedFactor = clamp(speed / maxSpeed);
  const roadFollowSteer = clampSigned(headingError * (ROAD_FOLLOW_HEADING_GAIN + speedFactor * 0.45) * modeFollow);
  const headingAssist = clampSigned(headingError * 0.16 * modeFollow);
  const laneError = desiredLateralDistance - finite(input.lateralDistance, 0);
  const laneSteer = clampSigned((laneError / Math.max(0.75, safeHalfWidth)) * modeLane);
  const followAssist = clampSigned(roadFollowSteer + headingAssist + laneSteer);
  const assistSteer = clampSigned(steeringInput.assistSteer + followAssist);

  const brakingDistance = Math.max(0, finite(turn.brakingDistance, 0));
  const cornerDistance = Math.max(1, finite(turn.distanceAhead, 8));
  const distancePressure = clamp((brakingDistance - cornerDistance * 0.55) / Math.max(4, cornerDistance));
  const planningPressure = Math.max(speedExcess * cornerPressure, distancePressure * cornerPressure);
  const assistThrottleFactor = mode === "strong" ? 0.7 : 0.48;
  const recoveryThrottleFactor = input.roadRecovery ? 0.98 : 1;
  const autoThrottleScale = mobileThrottle
    ? Math.max(boostActive ? 0.9 : mode === "strong" ? 0.54 : 0.64, 1 - planningPressure * assistThrottleFactor) * recoveryThrottleFactor
    : 1;
  const virtualBrake = mobileThrottle && !boostActive && !input.roadRecovery
    ? Math.min(mode === "strong" ? 0.36 : 0.24, planningPressure * (mode === "strong" ? 0.36 : 0.24))
    : 0;

  return {
    ...steeringInput,
    assistSteer,
    finalSteer: clampSigned(finite(input.playerSteer, 0) * playerIntent + assistSteer),
    assistStrength: Math.max(Math.abs(steeringInput.assistSteer), Math.abs(followAssist)),
    playerSteerScale: mobileRoadFollow ? playerIntent : steeringInput.playerSteerScale,
    edgePressure,
    lateralVelocityScale,
    autoThrottleScale,
    virtualBrake,
    recoveryStrength,
    upcomingTurnStrength: turnStrength,
    upcomingTurnDirection: turn.direction,
    recommendedSpeed,
    targetLane,
    desiredLateralDistance,
    crossTrackVelocity,
    roadFollowSteer,
    laneSteer,
    headingAssist,
    brakingDistance,
    targetCornerSpeed: recommendedSpeed,
    targetHeading,
  };
}

export const RALLY_ROAD_ASSIST_CONSTANTS = {
  centerFreeRatio: CENTER_FREE_RATIO,
  edgeFullRatio: EDGE_FULL_RATIO,
  roadAssistMargin: ROAD_ASSIST_MARGIN,
  normalLateralDamping: NORMAL_LATERAL_DAMPING,
  strongLateralDamping: STRONG_LATERAL_DAMPING,
  autoDriftCornerThreshold: 0.18,
  smartThrottleCornerThreshold: 0.14,
  normalRoadFollow: NORMAL_ROAD_FOLLOW,
  strongRoadFollow: STRONG_ROAD_FOLLOW,
  normalLaneControl: NORMAL_LANE_CONTROL,
  strongLaneControl: STRONG_LANE_CONTROL,
  roadFollowHeadingGain: ROAD_FOLLOW_HEADING_GAIN,
};

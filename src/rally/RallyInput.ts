import { RALLY_CONFIG } from "./RallyConfig";
import type { RallyInputState, RallyPhase } from "./RallyTypes";

export type RallySteeringDirection = "normal" | "inverted";

export interface RallyInputCallbacks {
  onCameraMove: (deltaX: number, deltaY: number) => void;
}

export interface RallyInputFrameContext {
  phase?: RallyPhase;
  speed?: number;
  grounded?: boolean;
  upcomingTurnStrength?: number;
  upcomingTurnDirection?: number;
  roadEdgePressure?: number;
  roadRecovery?: boolean;
  targetLane?: number;
  /** Optional post-assist steer for diagnostics; raw touch remains authoritative. */
  effectiveSteer?: number;
}

export interface RallyRelativeSteeringState {
  active: boolean;
  pointerId: number | null;
  originX: number;
  currentX: number;
  displacementX: number;
  steer: number;
  strafe: number;
}

export interface RallyRelativeSteeringConfig {
  deadZonePx: number;
  fullDistancePx: number;
}

const CONTROL_CODES = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyE",
  "Space",
]);

const STEERING_DEAD_ZONE = 0.08;
const STEERING_RESPONSE = 12;
const STRAFE_RESPONSE = 19;
const STRAFE_NEUTRAL_RESPONSE = 28;
const DEFAULT_INPUT_DELTA = 1 / 60;
const RELATIVE_STEERING_DEAD_ZONE_PX = 8;
const RELATIVE_STEERING_FULL_DISTANCE_PX = 96;
const RELATIVE_STEERING_CURVE = 1.25;
const RELATIVE_STRAFE_CURVE = 1.08;
const RELATIVE_TOUCH_STEERING_DIRECTION = -1;
// Mobile hover strafe intentionally uses the opposite thumb mapping from the
// legacy wheel-steering gesture.  Keep this at the touch boundary so the
// keyboard, AI and physics coordinate conventions remain unchanged.
const RELATIVE_STRAFE_DIRECTION = -1;
const AUTO_DRIFT_STEER_THRESHOLD = 0.75;
const AUTO_DRIFT_EXIT_STEER = 0.24;
const AUTO_DRIFT_HOLD_SECONDS = 0.14;
const AUTO_DRIFT_BRAKE = 0.38;
const AUTO_DRIFT_THROTTLE = 0.9;
const AUTO_DRIFT_CORNER_THRESHOLD = 0.18;
const AUTO_DRIFT_LANE_THRESHOLD = 0.55;

function clamp(value: number, minimum = -1, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function applyDeadZone(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= STEERING_DEAD_ZONE) return 0;
  const remapped = (magnitude - STEERING_DEAD_ZONE) / (1 - STEERING_DEAD_ZONE);
  return Math.sign(value) * clamp(remapped);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Convert a finger displacement into a floating steering value. The touch
 * origin is deliberately not tied to the screen center, so every left-side
 * touch starts at neutral and only the movement from that point matters.
 */
export function relativeSteeringValue(
  displacementX: number,
  deadZonePx = RELATIVE_STEERING_DEAD_ZONE_PX,
  fullDistancePx = RELATIVE_STEERING_FULL_DISTANCE_PX,
  curveExponent = RELATIVE_STEERING_CURVE,
): number {
  const displacement = finiteOr(displacementX, 0);
  const deadZone = Math.max(0, finiteOr(deadZonePx, RELATIVE_STEERING_DEAD_ZONE_PX));
  const fullDistance = Math.max(deadZone + 1, finiteOr(fullDistancePx, RELATIVE_STEERING_FULL_DISTANCE_PX));
  const magnitude = Math.abs(displacement);
  if (magnitude <= deadZone) return 0;
  const normalized = Math.max(0, Math.min(1, (magnitude - deadZone) / (fullDistance - deadZone)));
  const curve = Math.max(1, finiteOr(curveExponent, RELATIVE_STEERING_CURVE));
  return Math.sign(displacement) * Math.pow(normalized, curve);
}

/**
 * Mobile touch steering deliberately uses the game's current thumb mapping.
 * Keep this inversion at the touch boundary so keyboard, AI, drift and car
 * physics continue to use their existing steering convention.
 */
export function relativeTouchSteeringValue(
  displacementX: number,
  deadZonePx = RELATIVE_STEERING_DEAD_ZONE_PX,
  fullDistancePx = RELATIVE_STEERING_FULL_DISTANCE_PX,
  curveExponent = RELATIVE_STEERING_CURVE,
): number {
  return RELATIVE_TOUCH_STEERING_DIRECTION * relativeSteeringValue(displacementX, deadZonePx, fullDistancePx, curveExponent);
}

/**
 * Hover-racer input reverses only the mobile relative strafe gesture.  This is
 * the user-facing thumb mapping; it must not leak into keyboard, AI or world
 * axis calculations.
 */
export function relativeStrafeValue(
  displacementX: number,
  deadZonePx = RELATIVE_STEERING_DEAD_ZONE_PX,
  fullDistancePx = RELATIVE_STEERING_FULL_DISTANCE_PX,
  curveExponent = RELATIVE_STRAFE_CURVE,
): number {
  const value = relativeSteeringValue(displacementX, deadZonePx, fullDistancePx, curveExponent);
  return value === 0 ? 0 : RELATIVE_STRAFE_DIRECTION * value;
}

/** Use CSS pixels and a bounded viewport ratio so landscape phones get a
 * comfortable thumb travel without making desktop debug input too sensitive. */
export function relativeSteeringConfigForViewport(width: number): RallyRelativeSteeringConfig {
  const viewportWidth = Math.max(1, finiteOr(width, 390));
  return {
    deadZonePx: Math.max(6, Math.min(12, viewportWidth * 0.012)),
    fullDistancePx: Math.max(78, Math.min(128, viewportWidth * 0.14)),
  };
}

export function automaticThrottleForPhase(phase: RallyPhase | undefined): number {
  return phase === "racing" ? 1 : 0;
}

function approach(current: number, target: number, amount: number): number {
  const blend = Math.max(0, Math.min(1, amount));
  return current + (target - current) * blend;
}

export function invertSteering(value: number): number {
  if (value === 0) return 0;
  return Math.max(-1, Math.min(1, -value));
}

export class RallyInput {
  private readonly keys = new Set<string>();
  private windowTarget: Window | null = null;
  private surface: HTMLElement | null = null;
  private cameraPointerId: number | null = null;
  private cameraPointerX = 0;
  private cameraPointerY = 0;
  private manualSteer: number | null = null;
  private manualSteerIsRelative = false;
  private steerPointerId: number | null = null;
  private steerOriginX = 0;
  private steerCurrentX = 0;
  private smoothedSteer = 0;
  private smoothedStrafe = 0;
  private manualStrafe: number | null = null;
  private manualThrottle = false;
  private manualBrake = false;
  private manualBoost = false;
  private mobileArcade = true;
  private mobileStrafe = false;
  private keyboardControlActive = false;
  private driftAssist = true;
  private autoDriftHeldSeconds = 0;
  private autoDriftState = false;
  private steeringDirection: RallySteeringDirection = "normal";
  private steeringSensitivity = 1;

  constructor(private readonly callbacks: RallyInputCallbacks) {}

  attach(windowTarget: Window, surface: HTMLElement): void {
    this.windowTarget = windowTarget;
    this.surface = surface;
    windowTarget.addEventListener("keydown", this.handleKeyDown);
    windowTarget.addEventListener("keyup", this.handleKeyUp);
    windowTarget.addEventListener("blur", this.clear);
    surface.addEventListener("pointerdown", this.handlePointerDown, { passive: false });
    surface.addEventListener("pointermove", this.handlePointerMove, { passive: false });
    surface.addEventListener("pointerup", this.handlePointerUp, { passive: false });
    surface.addEventListener("pointercancel", this.handlePointerUp, { passive: false });
  }

  detach(): void {
    this.windowTarget?.removeEventListener("keydown", this.handleKeyDown);
    this.windowTarget?.removeEventListener("keyup", this.handleKeyUp);
    this.windowTarget?.removeEventListener("blur", this.clear);
    this.surface?.removeEventListener("pointerdown", this.handlePointerDown);
    this.surface?.removeEventListener("pointermove", this.handlePointerMove);
    this.surface?.removeEventListener("pointerup", this.handlePointerUp);
    this.surface?.removeEventListener("pointercancel", this.handlePointerUp);
    this.clear();
    this.windowTarget = null;
    this.surface = null;
  }

  snapshot(deltaSeconds = DEFAULT_INPUT_DELTA, context: RallyInputFrameContext = {}): RallyInputState {
    const keyboardSteer = (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0)
      - (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const keyboardThrottle = this.keys.has("KeyW") || this.keys.has("ArrowUp");
    const keyboardBrake = this.keys.has("KeyS") || this.keys.has("ArrowDown");
    const keyboardBoost = this.keys.has("Space") || this.keys.has("KeyE");
    const keyboardControlActive = keyboardSteer !== 0 || keyboardThrottle || keyboardBrake;
    this.keyboardControlActive = keyboardControlActive;
    const rawSteer = this.manualSteer ?? keyboardSteer;
    // Touch relative steering is already mapped at its source boundary. The
    // legacy direction preference remains for keyboard/absolute debug input,
    // but must not reverse touch, AI or the vehicle's counter-steer convention.
    const directedSteer = !this.manualSteerIsRelative && this.steeringDirection === "inverted"
      ? invertSteering(rawSteer)
      : rawSteer;
    const targetSteer = this.manualSteerIsRelative
      ? clamp(directedSteer * this.steeringSensitivity)
      : applyDeadZone(clamp(directedSteer * this.steeringSensitivity));
    const strafeMode = this.mobileStrafe && !keyboardControlActive;
    const targetStrafe = strafeMode ? clamp((this.manualStrafe ?? 0) * this.steeringSensitivity) : 0;
    // The input is sampled by the renderer, so a fixed per-call increment
    // would make steering feel different at 30, 60 and 120 Hz. Use the
    // elapsed sample time instead; the exponential form is frame-rate
    // independent and still gives a gentle center return when released.
    const delta = Math.max(0, Math.min(0.25, Number.isFinite(deltaSeconds) ? deltaSeconds : DEFAULT_INPUT_DELTA));
    const steerResponseRate = Math.abs(targetSteer - this.smoothedSteer) > 0.5
      ? STEERING_RESPONSE * 1.45
      : STEERING_RESPONSE;
    const strafeResponseRate = Math.abs(targetStrafe) < 0.02
      ? STRAFE_NEUTRAL_RESPONSE
      : Math.abs(targetStrafe - this.smoothedStrafe) > 0.42 ? STRAFE_RESPONSE * 1.2 : STRAFE_RESPONSE;
    const steerResponse = 1 - Math.exp(-steerResponseRate * delta);
    const strafeResponse = 1 - Math.exp(-strafeResponseRate * delta);
    this.smoothedSteer = approach(this.smoothedSteer, targetSteer, steerResponse);
    this.smoothedStrafe = approach(this.smoothedStrafe, targetStrafe, strafeResponse);
    if (strafeMode) {
      this.autoDriftHeldSeconds = 0;
      this.autoDriftState = false;
    } else {
      this.updateAutoDrift(delta, Math.abs(targetSteer), context);
    }
    const autoThrottle = this.mobileArcade && !keyboardControlActive
      ? automaticThrottleForPhase(context.phase)
      : 0;
    const state: RallyInputState = {
      steer: strafeMode ? 0 : this.smoothedSteer,
      throttle: this.autoDriftState
        ? AUTO_DRIFT_THROTTLE
        : autoThrottle > 0 ? autoThrottle : (this.manualThrottle || keyboardThrottle ? 1 : 0),
      brake: this.manualBrake || keyboardBrake ? 1 : (this.autoDriftState ? AUTO_DRIFT_BRAKE : 0),
      boost: this.manualBoost || keyboardBoost,
    };
    if (strafeMode) state.strafe = this.smoothedStrafe;
    return state;
  }

  setSteering(value: number | null): void {
    this.manualSteerIsRelative = false;
    this.manualSteer = value === null ? null : clamp(value);
  }

  beginRelativeSteering(pointerId: number, originX: number): boolean {
    if (this.steerPointerId !== null) return false;
    this.steerPointerId = pointerId;
    this.steerOriginX = finiteOr(originX, 0);
    this.steerCurrentX = this.steerOriginX;
    this.manualSteerIsRelative = true;
    this.manualSteer = 0;
    this.manualStrafe = 0;
    this.autoDriftHeldSeconds = 0;
    this.autoDriftState = false;
    return true;
  }

  updateRelativeSteering(pointerId: number, currentX: number): boolean {
    if (this.steerPointerId !== pointerId) return false;
    this.steerCurrentX = finiteOr(currentX, this.steerOriginX);
    const config = relativeSteeringConfigForViewport(this.surface?.clientWidth ?? 390);
    this.manualSteer = relativeTouchSteeringValue(this.steerCurrentX - this.steerOriginX, config.deadZonePx, config.fullDistancePx);
    this.manualStrafe = relativeStrafeValue(this.steerCurrentX - this.steerOriginX, config.deadZonePx, config.fullDistancePx);
    return true;
  }

  endRelativeSteering(pointerId: number): boolean {
    if (this.steerPointerId !== pointerId) return false;
    this.steerPointerId = null;
    this.manualSteer = null;
    this.manualStrafe = null;
    this.manualSteerIsRelative = false;
    this.autoDriftHeldSeconds = 0;
    this.autoDriftState = false;
    return true;
  }

  relativeSteeringState(): RallyRelativeSteeringState {
    return {
      active: this.steerPointerId !== null,
      pointerId: this.steerPointerId,
      originX: this.steerOriginX,
      currentX: this.steerCurrentX,
      displacementX: this.steerCurrentX - this.steerOriginX,
      steer: this.manualSteerIsRelative && this.manualSteer !== null ? this.manualSteer : 0,
      strafe: this.manualSteerIsRelative && this.manualStrafe !== null ? this.manualStrafe : 0,
    };
  }

  setMobileArcadeEnabled(enabled: boolean): void {
    this.mobileArcade = enabled;
  }

  setMobileStrafeEnabled(enabled: boolean): void {
    this.mobileStrafe = enabled;
    if (enabled) {
      this.autoDriftHeldSeconds = 0;
      this.autoDriftState = false;
    }
  }

  isMobileStrafeEnabled(): boolean {
    return this.mobileStrafe;
  }

  isMobileArcadeEnabled(): boolean {
    return this.mobileArcade;
  }

  isMobileArcadeActive(): boolean {
    return this.mobileArcade && !this.keyboardControlActive;
  }

  setDriftAssist(enabled: boolean): void {
    this.driftAssist = enabled;
    if (!enabled) {
      this.autoDriftHeldSeconds = 0;
      this.autoDriftState = false;
    }
  }

  get autoDriftActive(): boolean {
    return this.autoDriftState;
  }

  setThrottle(active: boolean): void {
    this.manualThrottle = active;
  }

  setBrake(active: boolean): void {
    this.manualBrake = active;
  }

  setBoost(active: boolean): void {
    this.manualBoost = active;
  }

  setSteeringDirection(direction: RallySteeringDirection): void {
    this.steeringDirection = direction;
  }

  setSteeringSensitivity(sensitivity: number): void {
    this.steeringSensitivity = Math.max(0.6, Math.min(1.5, sensitivity));
  }

  clear = (): void => {
    this.keys.clear();
    this.manualSteer = null;
    this.manualSteerIsRelative = false;
    this.steerPointerId = null;
    this.steerOriginX = 0;
    this.steerCurrentX = 0;
    this.smoothedSteer = 0;
    this.smoothedStrafe = 0;
    this.manualStrafe = null;
    this.manualThrottle = false;
    this.manualBrake = false;
    this.manualBoost = false;
    this.keyboardControlActive = false;
    this.autoDriftHeldSeconds = 0;
    this.autoDriftState = false;
    this.endCameraPointer();
  };

  private updateAutoDrift(delta: number, steerMagnitude: number, context: RallyInputFrameContext): void {
    const speed = Math.abs(finiteOr(context.speed ?? 0, 0));
    const grounded = context.grounded !== false;
    const upcomingTurnStrength = Math.max(0, Math.min(1, finiteOr(context.upcomingTurnStrength ?? 0, 0)));
    const upcomingTurnDirection = Math.sign(finiteOr(context.upcomingTurnDirection ?? 0, 0));
    const steerDirection = Math.sign(this.manualSteer ?? 0);
    // A large lane selection is not, by itself, a drift request. The lane
    // target must be near an edge as well as being held into a real corner;
    // this keeps recovery gestures and straight-line lane changes stable.
    const laneIntent = Math.abs(finiteOr(context.targetLane ?? steerMagnitude, steerMagnitude));
    const laneIntentIsStrong = laneIntent >= AUTO_DRIFT_LANE_THRESHOLD;
    const turnMatchesSteer = upcomingTurnDirection !== 0 && steerDirection === upcomingTurnDirection;
    const roadRecovery = context.roadRecovery === true
      || (finiteOr(context.roadEdgePressure ?? 0, 0) > 0.86 && !turnMatchesSteer);
    const eligible = this.mobileArcade
      && !this.mobileStrafe
      && this.driftAssist
      && this.manualSteerIsRelative
      && this.steerPointerId !== null
      && context.phase === "racing"
      && grounded
      && speed >= RALLY_CONFIG.vehicle.driftMinSpeed
      && steerMagnitude >= AUTO_DRIFT_STEER_THRESHOLD
      && laneIntentIsStrong
      && upcomingTurnStrength >= AUTO_DRIFT_CORNER_THRESHOLD
      && turnMatchesSteer
      && !roadRecovery;
    if (eligible) {
      this.autoDriftHeldSeconds = Math.min(AUTO_DRIFT_HOLD_SECONDS, this.autoDriftHeldSeconds + delta);
      if (this.autoDriftHeldSeconds >= AUTO_DRIFT_HOLD_SECONDS) this.autoDriftState = true;
    } else {
      this.autoDriftHeldSeconds = Math.max(0, this.autoDriftHeldSeconds - delta * 4);
      if (!grounded
        || speed < RALLY_CONFIG.vehicle.driftMinSpeed * 0.72
        || steerMagnitude <= AUTO_DRIFT_EXIT_STEER
        || this.steerPointerId === null
        || upcomingTurnStrength < AUTO_DRIFT_CORNER_THRESHOLD
        || !turnMatchesSteer
        || roadRecovery) {
        this.autoDriftState = false;
      }
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (CONTROL_CODES.has(event.code)) event.preventDefault();
    this.keys.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    const surface = this.surface;
    if (!surface) return;
    // The first pointer on the render surface owns the camera. Additional
    // fingers are left alone so they cannot steal the active camera drag.
    if (this.cameraPointerId !== null) return;
    this.cameraPointerId = event.pointerId;
    this.cameraPointerX = event.clientX;
    this.cameraPointerY = event.clientY;
    surface.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.cameraPointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - this.cameraPointerX;
    const deltaY = event.clientY - this.cameraPointerY;
    this.cameraPointerX = event.clientX;
    this.cameraPointerY = event.clientY;
    this.callbacks.onCameraMove(deltaX, deltaY);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.cameraPointerId !== event.pointerId) return;
    if (this.surface?.hasPointerCapture(event.pointerId)) this.surface.releasePointerCapture(event.pointerId);
    this.endCameraPointer();
  };

  private endCameraPointer(): void {
    this.cameraPointerId = null;
  }
}

export const RALLY_INPUT_CONSTANTS = {
  steeringDeadZone: STEERING_DEAD_ZONE,
  steeringResponse: STEERING_RESPONSE,
  defaultDelta: DEFAULT_INPUT_DELTA,
  relativeSteeringDeadZonePx: RELATIVE_STEERING_DEAD_ZONE_PX,
  relativeSteeringFullDistancePx: RELATIVE_STEERING_FULL_DISTANCE_PX,
  relativeStrafeValue,
  relativeSteeringCurve: RELATIVE_STEERING_CURVE,
  relativeStrafeCurve: RELATIVE_STRAFE_CURVE,
  strafeResponse: STRAFE_RESPONSE,
  strafeNeutralResponse: STRAFE_NEUTRAL_RESPONSE,
  relativeTouchSteeringDirection: RELATIVE_TOUCH_STEERING_DIRECTION,
  relativeStrafeDirection: RELATIVE_STRAFE_DIRECTION,
  relativeSteeringViewportRatio: 0.14,
  autoDriftSteerThreshold: AUTO_DRIFT_STEER_THRESHOLD,
  autoDriftHoldSeconds: AUTO_DRIFT_HOLD_SECONDS,
  autoDriftBrake: AUTO_DRIFT_BRAKE,
  autoDriftThrottle: AUTO_DRIFT_THROTTLE,
  autoDriftCornerThreshold: AUTO_DRIFT_CORNER_THRESHOLD,
  autoDriftLaneThreshold: AUTO_DRIFT_LANE_THRESHOLD,
};

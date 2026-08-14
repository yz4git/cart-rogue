import * as THREE from "three";
import { RALLY_CONFIG } from "./RallyConfig";
import type { RallyInputState, RallySurface, RallyTelemetry, RallyVehicleSnapshot } from "./RallyTypes";
import { RallyTrack } from "./RallyTrack";
import { collisionDamage, damageEffects, RALLY_DAMAGE_LIMIT } from "./RallyDamage";
import { getRallySurfaceProfile } from "./RallySurface";
import { RALLY_VEHICLES, type RallyVehicleDefinition } from "./VehicleDefinition";
import { evaluateRallyDrift, type RallyDriftGrade } from "./RallyDrift";
import { rallyDestructionBoostReward, type RallyDestructionKind, type RallySmashReward } from "./RallyDestruction";
import { evaluateRallyLanding, rallyLandingBoostReward, type RallyLandingGrade } from "./RallyLanding";
import { worldCrossTrackVelocity, type RallyRoadAssistResult } from "./RallyRoadAssist";
import { approachRoadHeading, hoverSafeHalfWidth } from "./RallyHover";

const MAX_SPEED = RALLY_CONFIG.vehicle.maxSpeed;
const REVERSE_SPEED = RALLY_CONFIG.vehicle.reverseSpeed;
const CAR_HEIGHT = RALLY_CONFIG.vehicle.height;
const HALF_BODY_WIDTH = RALLY_CONFIG.vehicle.bodyWidth / 2;
const HALF_BODY_LENGTH = RALLY_CONFIG.vehicle.bodyLength / 2;
const VISUAL_WHEEL_RADIUS = RALLY_VEHICLES.compact.visual.wheelRadius;
const BOOST_DRAIN_PER_SECOND = 0.42;
const BOOST_ACCELERATION_MULTIPLIER = 2.05;
const BOOST_TOP_SPEED_RATIO = 1.4;
const BOOST_SPEED_KICK = RALLY_CONFIG.vehicle.boostSpeedKick;
const BOOST_MAX_ACCUMULATED_TIME = RALLY_CONFIG.vehicle.boostMaxAccumulatedTime;
const BOOST_CHAIN_WINDOW = RALLY_CONFIG.vehicle.boostChainWindow;

export interface RallySuspensionState {
  averageGround: number;
  frontGround: number;
  rearGround: number;
  groundedRatio: number;
  contacts: readonly [boolean, boolean, boolean, boolean];
}

function approach(current: number, target: number, amount: number): number {
  if (current < target) return Math.min(target, current + amount);
  return Math.max(target, current - amount);
}

export class RallyCar {
  readonly group = new THREE.Group();
  definition: RallyVehicleDefinition;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  heading = 0;
  speed = 0;
  forwardVelocity = 0;
  lateralVelocity = 0;
  verticalVelocity = 0;
  slipAngle = 0;
  drifting = false;
  driftGrade: RallyDriftGrade = "NONE";
  driftScore = 0;
  driftCount = 0;
  boostEnergy = 0;
  /** Charge-based boost state used by the mobile hover-racer mode. */
  boostCharges = 0;
  maxBoostCharges = RALLY_CONFIG.vehicle.maxBoostCharges;
  boostTimeRemaining = 0;
  boostActive = false;
  boostCount = 0;
  boostChainCount = 0;
  pickupCount = 0;
  ramCount = 0;
  hoverBank = 0;
  destructionCount = 0;
  respawnCount = 0;
  lastDestructionKind: RallyDestructionKind | null = null;
  rewardMessage: RallySmashReward = "NONE";
  landingGrade: RallyLandingGrade = "NONE";
  landingCount = 0;
  groundedRatio = 1;
  landingImpact = 0;
  collisionImpact = 0;
  shortcutBreakImpact = 0;
  bodyDamage = 0;
  smokeLevel = 0;
  damageEnabled = true;
  grounded = true;
  airTime = 0;
  surface: RallySurface = "road";

  private readonly wheels: THREE.Mesh[] = [];
  private readonly hoverPads: THREE.Mesh[] = [];
  private readonly frontWheelPivots: THREE.Group[] = [];
  private readonly wheelSuspensionPivots: Array<{ pivot: THREE.Group; front: boolean }> = [];
  private readonly visualRoot = new THREE.Group();
  private visualPitch = 0;
  private visualRoll = 0;
  private visualCompression = 0;
  private visualRecoil = 0;
  private driftDuration = 0;
  private driftForwardDistance = 0;
  private driftCourseProgressDistance = 0;
  private driftSamePlaceTime = 0;
  private driftControlStability = 1;
  private lastDriftSteer = 0;
  private lastTrackProgress = 0;
  private driftEventTimer = 0;
  private rewardTimer = 0;
  private landingTimer = 0;
  private nearestSegmentHint = 0;
  private lastSteer = 0;
  private lastThrottle = 0;
  private lastBrake = 0;
  private stuckTime = 0;
  private hoverMode = false;
  private boostChargeMode = false;
  private boostInputHeld = false;
  private boostChainTimer = 0;
  private lateralTarget = 0;
  private readonly lastSafeTransform = { x: 0, y: 0, z: 0, heading: 0 };
  private bodyMaterial: THREE.MeshLambertMaterial | null = null;
  private accentMaterial: THREE.MeshLambertMaterial | null = null;
  private glassMaterial: THREE.MeshLambertMaterial | null = null;
  private hoverPadMaterial: THREE.MeshLambertMaterial | null = null;

  constructor(
    private readonly track: RallyTrack,
    definition = RALLY_VEHICLES.compact,
    readonly pickupOwnerId = "player",
  ) {
    this.definition = definition;
    this.buildVisual();
    this.reset();
  }

  setHoverMode(enabled: boolean): void {
    if (this.hoverMode === enabled) return;
    this.hoverMode = enabled;
    this.hoverPads.forEach((pad) => { pad.visible = enabled; });
    if (enabled) {
      this.drifting = false;
      this.boostChargeMode = true;
      this.maxBoostCharges = RALLY_CONFIG.vehicle.maxBoostCharges;
      if (this.boostCharges <= 0) this.boostCharges = RALLY_CONFIG.vehicle.initialBoostCharges;
      this.boostEnergy = this.boostCharges / this.maxBoostCharges;
    }
  }

  setBoostChargeMode(enabled: boolean): void {
    if (this.boostChargeMode === enabled) return;
    this.boostChargeMode = enabled;
    if (enabled) {
      this.maxBoostCharges = RALLY_CONFIG.vehicle.maxBoostCharges;
      if (this.boostCharges <= 0) this.boostCharges = RALLY_CONFIG.vehicle.initialBoostCharges;
      this.boostEnergy = this.boostCharges / this.maxBoostCharges;
    }
  }

  get isHoverMode(): boolean {
    return this.hoverMode;
  }

  addBoostCharge(amount = 1): number {
    if (!this.boostChargeMode) return this.boostCharges;
    this.boostCharges = Math.max(0, Math.min(this.maxBoostCharges, this.boostCharges + Math.max(0, Math.floor(amount))));
    this.boostEnergy = this.boostCharges / this.maxBoostCharges;
    return this.boostCharges;
  }

  consumeBoostCharge(): boolean {
    if (!this.boostChargeMode || this.boostCharges <= 0) return false;
    this.boostCharges -= 1;
    this.boostEnergy = this.boostCharges / this.maxBoostCharges;
    return true;
  }

  reset(): void {
    const start = this.track.sampleCheckpoint(this.track.checkpoints.length);
    // The race query uses the physical segment chord as its canonical tangent.
    // At distance zero a Catmull-Rom sample's centered derivative can point
    // toward the closing segment instead, which is especially visible on a
    // wide hover track with a long opening straight. Start from the same
    // tangent the simulation will use on its first fixed step.
    const startQuery = this.track.queryAt(start.x, start.z);
    this.position.set(start.x, start.y + CAR_HEIGHT + (this.hoverMode ? RALLY_CONFIG.vehicle.hoverHeight : 0), start.z);
    this.heading = startQuery.heading;
    this.speed = 0;
    this.forwardVelocity = 0;
    this.lateralVelocity = 0;
    this.verticalVelocity = 0;
    this.slipAngle = 0;
    this.drifting = false;
    this.driftGrade = "NONE";
    this.driftScore = 0;
    this.driftCount = 0;
    this.boostCharges = this.boostChargeMode ? RALLY_CONFIG.vehicle.initialBoostCharges : 0;
    this.boostEnergy = this.boostChargeMode ? this.boostCharges / this.maxBoostCharges : 0;
    this.boostTimeRemaining = 0;
    this.boostActive = false;
    this.boostCount = 0;
    this.boostChainCount = 0;
    this.pickupCount = 0;
    this.ramCount = 0;
    this.hoverBank = 0;
    this.destructionCount = 0;
    this.respawnCount = 0;
    this.lastDestructionKind = null;
    this.rewardMessage = "NONE";
    this.landingGrade = "NONE";
    this.landingCount = 0;
    this.groundedRatio = 1;
    this.landingImpact = 0;
    this.collisionImpact = 0;
    this.shortcutBreakImpact = 0;
    this.bodyDamage = 0;
    this.smokeLevel = 0;
    this.airTime = 0;
    this.surface = "road";
    this.lastSteer = 0;
    this.lastThrottle = 0;
    this.lastBrake = 0;
    this.stuckTime = 0;
    this.boostInputHeld = false;
    this.boostChainTimer = 0;
    this.lateralTarget = 0;
    this.visualPitch = 0;
    this.visualRoll = 0;
    this.visualCompression = 0;
    this.visualRecoil = 0;
    this.driftDuration = 0;
    this.driftForwardDistance = 0;
    this.driftCourseProgressDistance = 0;
    this.driftSamePlaceTime = 0;
    this.driftControlStability = 1;
    this.lastDriftSteer = 0;
    this.driftEventTimer = 0;
    this.rewardTimer = 0;
    this.landingTimer = 0;
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    // Keep the first local search window away from the closing segment. Both
    // segments share the start vertex, and a wrapped hint window otherwise
    // picks the closing tangent on the first countdown frame.
    this.nearestSegmentHint = Math.min(this.track.segments - 1, 6);
    this.lastTrackProgress = 0;
    this.lastSafeTransform.x = this.position.x;
    this.lastSafeTransform.y = this.position.y;
    this.lastSafeTransform.z = this.position.z;
    this.lastSafeTransform.heading = this.heading;
    this.visualRoot.position.set(0, -(CAR_HEIGHT + (this.hoverMode ? RALLY_CONFIG.vehicle.hoverHeight : 0)), 0);
    this.visualRoot.rotation.set(0, 0, 0);
    this.visualRoot.scale.set(1, 1, 1);
    this.syncVisual(0, 0);
  }

  update(input: RallyInputState, deltaSeconds: number, active: boolean, roadAssist?: RallyRoadAssistResult): void {
    const delta = Math.min(0.05, Math.max(0, deltaSeconds));
    const previousForwardVelocity = this.forwardVelocity;
    const hoverMode = this.hoverMode || input.strafe !== undefined;
    const throttle = active ? Math.max(0, Math.min(1, input.throttle)) : 0;
    const brake = active ? Math.max(0, Math.min(1, input.brake)) : 0;
    const steer = active ? Math.max(-1, Math.min(1, input.steer)) : 0;
    const strafe = active ? Math.max(-1, Math.min(1, input.strafe ?? 0)) : 0;
    const wasBoostActive = this.boostActive;
    if (this.boostChargeMode || hoverMode) {
      const boostPressed = active && input.boost === true && throttle > 0.02;
      if (boostPressed && !this.boostInputHeld && this.consumeBoostCharge()) {
        const isChainActivation = this.boostActive || this.boostChainTimer > 0;
        this.boostActive = true;
        this.boostTimeRemaining = Math.min(
          BOOST_MAX_ACCUMULATED_TIME,
          (isChainActivation ? this.boostTimeRemaining : 0) + RALLY_CONFIG.vehicle.boostDuration,
        );
        this.boostCount += 1;
        this.boostChainCount = isChainActivation ? Math.min(9, this.boostChainCount + 1) : 1;
        this.boostChainTimer = BOOST_CHAIN_WINDOW;
        const boostCap = this.definition.maxSpeed * BOOST_TOP_SPEED_RATIO;
        this.forwardVelocity = Math.min(boostCap, Math.max(0, this.forwardVelocity) + BOOST_SPEED_KICK);
      }
      this.boostInputHeld = boostPressed;
      if (this.boostActive) {
        this.boostTimeRemaining = Math.max(0, this.boostTimeRemaining - delta);
        if (this.boostTimeRemaining <= 0) this.boostActive = false;
      }
      this.boostEnergy = this.boostCharges / Math.max(1, this.maxBoostCharges);
    } else {
      this.boostActive = active && input.boost === true && throttle > 0.02 && this.boostEnergy > 0.02;
      if (this.boostActive && !wasBoostActive) this.boostCount += 1;
      if (this.boostActive) {
        this.boostEnergy = Math.max(0, this.boostEnergy - BOOST_DRAIN_PER_SECOND * delta);
        if (this.boostEnergy <= 0) this.boostActive = false;
      }
    }
    this.lastThrottle = throttle;
    this.lastBrake = brake;
    this.lastSteer = steer;
    this.boostChainTimer = Math.max(0, this.boostChainTimer - delta);
    if (this.boostChainTimer <= 0) this.boostChainCount = 0;

    const currentQuery = this.track.queryAt(this.position.x, this.position.z, this.nearestSegmentHint);
    this.nearestSegmentHint = currentQuery.segmentIndex;
    if (active && roadAssist && this.grounded && !hoverMode && roadAssist.lateralVelocityScale < 0.9999) {
      this.dampenCrossTrackVelocity(currentQuery, roadAssist.lateralVelocityScale, delta);
    }
    const wasDrifting = this.drifting;
    const driftRequested = !hoverMode && active
      && brake > 0.18
      && Math.abs(this.forwardVelocity) >= RALLY_CONFIG.vehicle.driftMinSpeed
      && Math.abs(steer) > 0.1
      && this.grounded;
    if (driftRequested) {
      this.drifting = true;
      if (!wasDrifting) {
        this.driftForwardDistance = 0;
        this.driftCourseProgressDistance = 0;
        this.driftSamePlaceTime = 0;
        this.driftControlStability = 1;
        this.lastDriftSteer = steer;
      }
    } else if (brake < 0.05 || Math.abs(steer) < 0.05 || Math.abs(this.forwardVelocity) < 3) {
      this.drifting = false;
    }
    if (throttle > 0.02) {
      this.forwardVelocity += throttle
        * RALLY_CONFIG.vehicle.acceleration
        * this.definition.accelerationRatio
        * (this.boostActive ? BOOST_ACCELERATION_MULTIPLIER : 1)
        * delta;
    }
    if (brake > 0) {
      if (this.forwardVelocity > 0.15) {
        this.forwardVelocity = approach(
          this.forwardVelocity,
          0,
          RALLY_CONFIG.vehicle.brakeAcceleration
            * brake
            * (this.drifting ? RALLY_CONFIG.vehicle.driftBrakeRatio : 1)
            * delta,
        );
      } else if (throttle < 0.02) {
        this.forwardVelocity -= RALLY_CONFIG.vehicle.reverseAcceleration * brake * delta;
      }
    }
    const resistance = (throttle > 0.02
      ? RALLY_CONFIG.vehicle.poweredRollingResistance
      : RALLY_CONFIG.vehicle.coastingRollingResistance) * Math.sign(this.forwardVelocity);
    const aerodynamicDrag = this.forwardVelocity * Math.abs(this.forwardVelocity) * RALLY_CONFIG.vehicle.aerodynamicDrag;
    this.forwardVelocity -= (resistance + aerodynamicDrag) * delta;
    if (Math.abs(this.forwardVelocity) < 0.04 && throttle < 0.02 && brake < 0.02) this.forwardVelocity = 0;
    const effects = damageEffects(this.bodyDamage);
    this.forwardVelocity = Math.max(
      -REVERSE_SPEED,
      Math.min(this.definition.maxSpeed * effects.maxSpeedRatio * (this.boostActive ? BOOST_TOP_SPEED_RATIO : 1), this.forwardVelocity),
    );

    const speedFactor = Math.min(1, Math.abs(this.forwardVelocity) / 12);
    let forwardX = Math.sin(this.heading);
    let forwardZ = Math.cos(this.heading);
    let rightX = Math.cos(this.heading);
    let rightZ = -Math.sin(this.heading);
    if (hoverMode) {
      // Hover racers follow the physical road tangent automatically. The
      // touch value is a continuous velocity command, never a wheel angle or
      // a lane target. Neutral therefore holds the current lateral position.
      const targetHeading = roadAssist && (Math.abs(roadAssist.roadFollowSteer) + Math.abs(roadAssist.headingAssist) > 0.001)
        ? roadAssist.targetHeading
        : currentQuery.heading;
      this.heading = approachRoadHeading(
        this.heading,
        targetHeading,
        delta,
        RALLY_CONFIG.vehicle.hoverRoadFollowRate + (this.boostActive ? 0.45 : 0),
      );
      const tangentX = currentQuery.tangentX;
      const tangentZ = currentQuery.tangentZ;
      const normalX = tangentZ;
      const normalZ = -tangentX;
      // `velocity` is the world-space result of the previous fixed step. Do
      // not reconstruct it from the car's visual heading: during a banked
      // road-follow turn those bases intentionally differ.
      // `lateralVelocity` is already expressed in the road frame from the
      // previous hover step. Re-projecting the previous world velocity onto a
      // newly turned tangent would mistake ordinary road-follow rotation for
      // a real sideways slide and throw the racer off the course at every
      // sharp bend. The public assist query still uses world-space velocity;
      // this internal state transition keeps that velocity physically stable
      // while the road frame turns beneath it.
      const safeHalfWidth = hoverSafeHalfWidth(currentQuery.roadHalfWidth, this.definition.visual.bodyWidth / 2, RALLY_CONFIG.vehicle.hoverBoundaryMargin);
      this.lateralTarget = strafe;
      const edgeRatio = Math.min(1, Math.abs(currentQuery.lateralDistance) / Math.max(0.5, safeHalfWidth));
      const edgePressure = Math.max(0, Math.min(1, (edgeRatio - 0.62) / 0.38));
      const maxStrafeSpeed = RALLY_CONFIG.vehicle.hoverMaxStrafeSpeed * Math.max(0.82, this.definition.handling);
      const currentSide = Math.sign(currentQuery.lateralDistance);
      let desiredCrossTrack = strafe * maxStrafeSpeed;
      const outwardTarget = currentSide !== 0 && currentSide * desiredCrossTrack > 0;
      if (outwardTarget) desiredCrossTrack *= 1 - edgePressure * 0.86;
      // A hover racer should not be able to keep accelerating through the
      // soft boundary while the thumb is still held outward. Once the safe
      // envelope is under pressure, convert that outward command into a
      // bounded return velocity. This is still velocity control (no lane
      // teleport or center snap), and the player can immediately choose a new
      // line after re-entering the road.
      const outwardInput = currentSide !== 0 && currentSide * strafe > 0;
      if (outwardInput && edgePressure > 0.55) {
        desiredCrossTrack = -currentSide * maxStrafeSpeed * (0.28 + edgePressure * 0.5);
      }
      const lateralResponse = Math.abs(strafe) > 0.02
        ? RALLY_CONFIG.vehicle.hoverLateralAcceleration * Math.max(0.82, this.definition.handling)
        : RALLY_CONFIG.vehicle.hoverLateralDeceleration;
      let crossTrack = approach(
        this.lateralVelocity,
        desiredCrossTrack,
        lateralResponse * delta,
      );
      const outwardMotion = currentSide !== 0 && currentSide * crossTrack > 0;
      if (outwardMotion && roadAssist && roadAssist.lateralVelocityScale < 0.9999) {
        crossTrack *= Math.pow(roadAssist.lateralVelocityScale, Math.max(0, delta * 60));
      }
      if (outwardMotion && edgePressure > 0.55) {
        crossTrack = approach(crossTrack, -currentSide * maxStrafeSpeed * 0.42, edgePressure * 7.5 * delta);
      }
      this.forwardVelocity = Math.max(0, this.forwardVelocity);
      this.lateralVelocity = crossTrack;
      this.hoverBank = approach(this.hoverBank, -crossTrack / Math.max(1, maxStrafeSpeed) * 0.22, 8 * delta);
      // Movement is written in road coordinates so a diagonal vehicle body
      // cannot turn a strafe into an unintended steering input.
      forwardX = tangentX;
      forwardZ = tangentZ;
      rightX = normalX;
      rightZ = normalZ;
    } else {
      const steeringRate = RALLY_CONFIG.vehicle.steeringRateLowSpeed
        + (RALLY_CONFIG.vehicle.steeringRateHighSpeed - RALLY_CONFIG.vehicle.steeringRateLowSpeed) * speedFactor;
      this.heading += steeringRate * this.definition.handling * effects.steeringRatio * steer * Math.sign(this.forwardVelocity || 1) * delta;
      const counterSteering = this.lateralVelocity !== 0 && steer * this.lateralVelocity < 0;
      const targetLateralVelocity = steer
        * this.forwardVelocity
        * (RALLY_CONFIG.vehicle.steeringSlipForce + (this.drifting ? RALLY_CONFIG.vehicle.driftSlipForce : 0))
        * (0.55 + speedFactor * 0.45)
        * (counterSteering ? 0.35 : 1);
      const currentSurface = getRallySurfaceProfile(currentQuery.surface, this.track.environmentVariant);
      const grip = this.drifting
        ? currentSurface.driftGrip
        : currentSurface.grip * (currentQuery.surface === "road" || currentQuery.surface === "asphalt" ? this.definition.handling : 1);
      const airGrip = this.grounded ? 1 : this.definition.jumpControl * 0.72;
      this.lateralVelocity = approach(
        this.lateralVelocity,
        targetLateralVelocity,
        (counterSteering ? RALLY_CONFIG.vehicle.driftRecoveryGrip : grip) * airGrip * delta,
      );
      if (active && roadAssist && roadAssist.lateralVelocityScale < 0.9999 && this.grounded) {
        // Apply the stability pass after steering slip is generated as well as
        // before it. Otherwise a large outward steering target could recreate
        // the same road-relative velocity in the same fixed step.
        this.dampenCrossTrackVelocity(currentQuery, roadAssist.lateralVelocityScale, delta);
      }
      forwardX = Math.sin(this.heading);
      forwardZ = Math.cos(this.heading);
      rightX = Math.cos(this.heading);
      rightZ = -Math.sin(this.heading);
    }
    this.position.x += (forwardX * this.forwardVelocity + rightX * this.lateralVelocity) * delta;
    this.position.z += (forwardZ * this.forwardVelocity + rightZ * this.lateralVelocity) * delta;

    const query = this.track.queryAt(this.position.x, this.position.z, this.nearestSegmentHint);
    this.nearestSegmentHint = query.segmentIndex;
    this.surface = query.surface;
    if (hoverMode) {
      // Keep the machine inside the usable road envelope with a bounded,
      // velocity-like correction. This is a soft boundary: it never snaps the
      // vehicle to the center and the player can still select either side.
      const safeHalfWidth = hoverSafeHalfWidth(query.roadHalfWidth, this.definition.visual.bodyWidth / 2, RALLY_CONFIG.vehicle.hoverBoundaryMargin);
      const excess = Math.abs(query.lateralDistance) - safeHalfWidth;
      if (excess > 0) {
        const side = Math.sign(query.lateralDistance) || 1;
        const correction = Math.min(excess, Math.max(0.06, RALLY_CONFIG.vehicle.hoverBoundaryRecoveryGain * delta));
        this.position.x -= query.tangentZ * side * correction;
        this.position.z += query.tangentX * side * correction;
        if (side * this.lateralVelocity > 0) this.lateralVelocity = Math.min(0, this.lateralVelocity - side * correction / Math.max(delta, 0.001));
      }
    }
    const courseProgressDelta = this.forwardProgressDelta(this.lastTrackProgress, query.progress);
    this.lastTrackProgress = query.progress;
    if (this.drifting) {
      this.driftForwardDistance += Math.max(0, this.forwardVelocity) * delta;
      const progressDistance = courseProgressDelta * this.track.length;
      this.driftCourseProgressDistance += progressDistance;
      this.driftSamePlaceTime = progressDistance < 0.05
        ? this.driftSamePlaceTime + delta
        : Math.max(0, this.driftSamePlaceTime - delta * 2);
      this.driftControlStability = approach(
        this.driftControlStability,
        1 - Math.min(1, Math.abs(steer - this.lastDriftSteer) / 0.65),
        Math.min(1, delta * 8),
      );
      this.lastDriftSteer = steer;
    }
    let suspension = this.sampleSuspension(query.segmentIndex);
    const targetGroundY = suspension.averageGround + CAR_HEIGHT + (hoverMode ? RALLY_CONFIG.vehicle.hoverHeight : 0);
    const heightError = targetGroundY - this.position.y;
    const wasGrounded = this.grounded;
    // A crest can unload both front wheels while the rear pair is still
    // touching the surface. Treat that half-contact state as a real takeoff
    // when the body is already above the falling terrain; waiting for a zero
    // contact ratio incorrectly glues the machine to a steep jump face.
    if (this.grounded && suspension.groundedRatio <= 0.5 && heightError < -RALLY_CONFIG.vehicle.takeoffGap) {
      this.grounded = false;
      this.verticalVelocity = Math.min(this.verticalVelocity, 0);
    }
    if (!this.grounded) {
      this.airTime += delta;
      this.verticalVelocity -= RALLY_CONFIG.vehicle.gravity / this.definition.jumpControl * delta;
      this.position.y += this.verticalVelocity * delta;
      if (this.position.y <= targetGroundY + RALLY_CONFIG.vehicle.landingTolerance && this.verticalVelocity <= 0) {
        this.position.y = targetGroundY;
        this.landingImpact = Math.min(1, Math.abs(this.verticalVelocity) / 14);
        this.verticalVelocity = 0;
        this.grounded = true;
        suspension = this.sampleSuspension(query.segmentIndex);
        const landingPitch = Math.atan2(suspension.frontGround - suspension.rearGround, RALLY_CONFIG.vehicle.bodyLength);
        this.landingGrade = evaluateRallyLanding({
          impact: this.landingImpact,
          lateralSpeed: this.lateralVelocity,
          pitch: landingPitch,
          roll: this.visualRoll,
          airTime: this.airTime,
        });
        if (this.landingGrade !== "NONE") {
          this.landingCount += 1;
          if (!this.boostChargeMode) {
            this.boostEnergy = Math.min(1, this.boostEnergy + rallyLandingBoostReward(this.landingGrade));
          }
          this.landingTimer = 1.15;
        }
        // airTime describes the current airborne interval. Clear it as soon
        // as the wheels reconnect so telemetry and the landing result do not
        // report a stale flight duration until the next render step.
        this.airTime = 0;
      }
    } else {
      this.airTime = 0;
      this.verticalVelocity = approach(
        this.verticalVelocity,
        heightError * RALLY_CONFIG.vehicle.suspensionSpring,
        RALLY_CONFIG.vehicle.suspensionDamping * delta,
      );
      this.position.y += this.verticalVelocity * delta;
      if (Math.abs(heightError) < 0.08) {
        this.position.y = targetGroundY;
        this.verticalVelocity = 0;
      }
    }
    this.groundedRatio = this.grounded ? suspension.groundedRatio : 0;
    this.landingImpact = Math.max(0, this.landingImpact - delta * 3.5);
    if (!wasGrounded && this.grounded) this.landingImpact = Math.max(this.landingImpact, 0.35);

    const surfaceProfile = getRallySurfaceProfile(query.surface, this.track.environmentVariant);
    const vehicleSurfaceRatio = query.surface === "road" || query.surface === "asphalt"
      ? 1
      : this.definition.offRoadSpeedRatio / RALLY_VEHICLES.compact.offRoadSpeedRatio;
    const surfaceSpeedRatio = Math.min(1, surfaceProfile.speedRatio * vehicleSurfaceRatio);
    // Hover racers skim over the surface.  Dirt, gravel and mud still feed
    // visual/audio effects, but the old rally speed penalties would erase the
    // high-speed strafe gameplay.
    if (!hoverMode && surfaceSpeedRatio < 1) {
      this.forwardVelocity = approach(
        this.forwardVelocity,
        this.forwardVelocity * surfaceSpeedRatio,
        surfaceProfile.rollingResistance * delta,
      );
    }

    const collision = this.track.staticCollision(this.position.x, this.position.z, 1.05);
    if (collision) {
      this.position.x += collision.normalX * collision.penetration;
      this.position.z += collision.normalZ * collision.penetration;
      const obstacle = collision.source === "obstacle"
        ? this.track.obstacles.find((candidate) => candidate.id === collision.id)
        : undefined;
      const isSafetyBlock = obstacle?.kind === "safety-block";
      const canBreakShortcut = collision.source === "obstacle"
        && collision.destructible
        && (isSafetyBlock
          || (hoverMode && obstacle?.kind === "wall")
          || Math.abs(this.forwardVelocity) >= RALLY_CONFIG.vehicle.shortcutBreakSpeed / this.definition.collisionBreakPower);
      if (canBreakShortcut && this.track.destroyObstacle(collision.id)) {
        this.destructionCount += 1;
        this.lastDestructionKind = obstacle?.kind ?? "barrier";
        const boostedSmash = this.boostActive;
        if (!this.boostChargeMode) {
          this.boostEnergy = Math.min(1, this.boostEnergy + rallyDestructionBoostReward(this.lastDestructionKind, boostedSmash));
        }
        this.rewardMessage = boostedSmash ? "BOOST SMASH" : "SMASH";
        this.rewardTimer = 1.2;
        // Safety blocks are the forgiving roadside recovery layer: they still
        // cost speed and create an impact, but do not stack race damage while
        // the player or an AI is being returned toward the road.
        if (this.damageEnabled && !isSafetyBlock) this.applyDamage(collisionDamage(this.forwardVelocity, this.definition.weight, true));
        // A normal safety-block mistake is a soft 22% speed penalty. BOOST
        // turns the same roadside miss into a no-slowdown smash, while both
        // paths keep the separation impulse and only a small heading assist.
        this.forwardVelocity *= (boostedSmash || (hoverMode && obstacle?.kind === "wall" && boostedSmash))
          ? 1
          : RALLY_CONFIG.vehicle.shortcutBreakSpeedRatio;
        if (isSafetyBlock || (hoverMode && obstacle?.kind === "wall")) {
          const roadQuery = this.track.queryAt(this.position.x, this.position.z, this.nearestSegmentHint);
          const headingDelta = Math.atan2(Math.sin(roadQuery.heading - this.heading), Math.cos(roadQuery.heading - this.heading));
          this.heading += headingDelta * (boostedSmash ? 0.08 : 0.32);
          this.dampenCrossTrackVelocity(roadQuery, boostedSmash ? 0.92 : 0.68, 1 / 60);
        }
        this.collisionImpact = Math.min(1, Math.abs(this.speed) / this.definition.maxSpeed + 0.18);
        this.shortcutBreakImpact = 1;
      } else {
        if (this.damageEnabled) this.applyDamage(collisionDamage(this.forwardVelocity, this.definition.weight, collision.destructible));
        if (hoverMode) {
          // Hover obstacles should create a readable dodge impulse, not pin a
          // racer against a circle collider until recovery fires. Keep a
          // meaningful forward speed and push in the collision normal's road
          // lateral direction; a later strafe input can immediately override.
          const roadQuery = this.track.queryAt(this.position.x, this.position.z, this.nearestSegmentHint);
          const roadRightX = roadQuery.tangentZ;
          const roadRightZ = -roadQuery.tangentX;
          const normalLateral = collision.normalX * roadRightX + collision.normalZ * roadRightZ;
          this.forwardVelocity *= this.boostActive ? 0.99 : 0.78;
          this.forwardVelocity = Math.max(this.forwardVelocity, throttle > 0.02 ? (this.boostActive ? 12 : 7) : 0);
          this.lateralVelocity += normalLateral * (this.boostActive ? 4 : 7);
          this.lateralVelocity = Math.max(-RALLY_CONFIG.vehicle.hoverMaxStrafeSpeed, Math.min(RALLY_CONFIG.vehicle.hoverMaxStrafeSpeed, this.lateralVelocity));
          const headingDelta = Math.atan2(Math.sin(roadQuery.heading - this.heading), Math.cos(roadQuery.heading - this.heading));
          this.heading += headingDelta * (this.boostActive ? 0.06 : 0.14);
        } else {
          this.forwardVelocity *= RALLY_CONFIG.vehicle.collisionSpeedRatio;
          this.lateralVelocity *= -0.25;
          this.heading += (collision.normalX * forwardZ - collision.normalZ * forwardX) * 0.12;
        }
        this.collisionImpact = Math.min(1, Math.abs(this.speed) / this.definition.maxSpeed + 0.25);
      }
    }
    this.collisionImpact = Math.max(0, this.collisionImpact - delta * 4);
    this.shortcutBreakImpact = Math.max(0, this.shortcutBreakImpact - delta * 5);
    this.rewardTimer = Math.max(0, this.rewardTimer - delta);
    if (this.rewardTimer <= 0) this.rewardMessage = "NONE";
    this.landingTimer = Math.max(0, this.landingTimer - delta);
    if (this.landingTimer <= 0) this.landingGrade = "NONE";

    if (hoverMode) {
      const pickup = this.track.pickupCollision(this.position.x, this.position.z, RALLY_CONFIG.vehicle.boostChargePickupRadius, this.pickupOwnerId);
      if (pickup && this.track.collectPickup(pickup.id, this.pickupOwnerId)) {
        this.addBoostCharge(1);
        this.pickupCount += 1;
        this.rewardMessage = "BOOST +1";
        this.rewardTimer = 0.9;
      }
    }

    const acceleration = delta > 0 ? (this.forwardVelocity - previousForwardVelocity) / delta : 0;
    const accelerationPitch = Math.max(-0.1, Math.min(0.1, -acceleration * 0.006));
    const brakeNoseDive = brake * speedFactor * 0.055;
    const targetPitch = Math.atan2(suspension.frontGround - suspension.rearGround, RALLY_CONFIG.vehicle.bodyLength)
      + accelerationPitch
      + brakeNoseDive;
    const targetRoll = hoverMode
      ? this.hoverBank
      : -steer * (0.04 + speedFactor * 0.1)
      - (this.drifting ? this.slipAngle * 0.22 : 0)
      - this.lateralVelocity * 0.018;
    const targetCompression = Math.min(0.16, this.landingImpact * 0.24 + Math.max(0, -acceleration) * 0.002);
    const targetRecoil = Math.min(0.1, this.collisionImpact * 0.1 + this.shortcutBreakImpact * 0.04);
    this.visualPitch = approach(this.visualPitch, targetPitch, 8 * delta);
    this.visualRoll = approach(this.visualRoll, targetRoll, 8 * delta);
    this.visualCompression = approach(this.visualCompression, targetCompression, 9 * delta);
    this.visualRecoil = approach(this.visualRecoil, targetRecoil, 12 * delta);
    this.speed = this.forwardVelocity;
    this.slipAngle = Math.atan2(this.lateralVelocity, Math.max(0.1, Math.abs(this.forwardVelocity)));
    const driftEvaluation = evaluateRallyDrift({
      speed: this.forwardVelocity,
      slipAngle: this.slipAngle,
      steer,
      duration: this.driftDuration + delta,
      surface: this.surface,
      grounded: this.grounded,
      courseProgressDistance: this.driftCourseProgressDistance,
      forwardDistance: this.driftForwardDistance,
      controlStability: this.driftControlStability,
      samePlaceTime: this.driftSamePlaceTime,
    });
    if (!hoverMode && this.drifting && driftEvaluation.eligible) {
      this.driftDuration += delta;
      this.driftGrade = driftEvaluation.grade;
      this.driftScore += driftEvaluation.scorePerSecond * delta;
      if (!this.boostChargeMode) {
        this.boostEnergy = Math.min(1, this.boostEnergy + driftEvaluation.energyPerSecond * delta);
      }
    } else {
      if (wasDrifting && this.driftDuration >= 0.18) {
        this.driftCount += 1;
        this.driftEventTimer = 1.2;
      }
      this.driftDuration = 0;
      this.driftForwardDistance = 0;
      this.driftCourseProgressDistance = 0;
      this.driftSamePlaceTime = 0;
      this.driftControlStability = 1;
      this.driftGrade = this.driftEventTimer > 0 ? this.driftGrade : "NONE";
    }
    this.driftEventTimer = Math.max(0, this.driftEventTimer - delta);
    if (this.driftEventTimer <= 0 && !this.drifting) this.driftGrade = "NONE";
    this.velocity.set(
      forwardX * this.forwardVelocity + rightX * this.lateralVelocity,
      this.verticalVelocity,
      forwardZ * this.forwardVelocity + rightZ * this.lateralVelocity,
    );
    this.syncVisual(steer, delta, suspension);

    if (!this.isFiniteAndInRecoverableBounds()) {
      this.respawn();
      return;
    }
    if (active && throttle > 0.65 && Math.abs(this.forwardVelocity) < 0.45 && this.grounded) {
      this.stuckTime += delta;
    } else {
      this.stuckTime = 0;
    }
    if (this.stuckTime >= RALLY_CONFIG.vehicle.recoveryStuckSeconds) {
      this.respawn();
      return;
    }
    if (this.grounded && suspension.groundedRatio >= 0.75 && query.onRoad && !this.track.staticCollision(this.position.x, this.position.z, 1.05)) {
      this.lastSafeTransform.x = this.position.x;
      this.lastSafeTransform.y = this.position.y;
      this.lastSafeTransform.z = this.position.z;
      this.lastSafeTransform.heading = this.heading;
    }
  }

  snapshot(): RallyVehicleSnapshot {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      heading: this.heading,
      speed: this.speed,
      vehicleId: this.definition.id,
      lateralSpeed: this.lateralVelocity,
      slipAngle: this.slipAngle,
      drifting: this.drifting,
      groundedRatio: this.groundedRatio,
      airborne: !this.grounded,
      collisionImpact: this.collisionImpact,
      bodyDamage: this.bodyDamage,
      smokeLevel: this.smokeLevel,
      driftGrade: this.driftGrade,
      driftScore: this.driftScore,
      driftCount: this.driftCount,
      boostEnergy: this.boostEnergy,
      boostCharges: this.boostCharges,
      maxBoostCharges: this.maxBoostCharges,
      boostTimeRemaining: this.boostTimeRemaining,
      boostActive: this.boostActive,
      boostCount: this.boostCount,
      boostChainCount: this.boostChainCount,
      pickupCount: this.pickupCount,
      ramCount: this.ramCount,
      hoverBank: this.hoverBank,
      destructionCount: this.destructionCount,
      lastDestructionKind: this.lastDestructionKind,
      rewardMessage: this.rewardMessage,
      landingGrade: this.landingGrade,
      landingCount: this.landingCount,
      grounded: this.grounded,
    };
  }

  telemetry(): RallyTelemetry {
    return {
      speed: this.speed,
      forwardSpeed: this.forwardVelocity,
      lateralSpeed: this.lateralVelocity,
      slipAngle: this.slipAngle,
      steer: this.lastSteer,
      throttle: this.lastThrottle,
      brake: this.lastBrake,
      grounded: this.grounded,
      surface: this.surface,
      drifting: this.drifting,
      driftGrade: this.driftGrade,
      driftDuration: this.driftDuration,
      boostEnergy: this.boostEnergy,
      boostActive: this.boostActive,
      airTime: this.airTime,
      roadAssistStrength: 0,
      edgePressure: 0,
      turnAheadStrength: 0,
      autoThrottle: this.lastThrottle,
      autoDrift: this.drifting,
      targetLane: 0,
      desiredLateralDistance: 0,
      crossTrackVelocity: 0,
      roadFollowSteer: 0,
      laneSteer: 0,
      headingAssist: 0,
      brakingDistance: 0,
      targetCornerSpeed: 0,
      strafe: this.hoverMode ? this.lateralTarget : 0,
      lateralTarget: this.lateralTarget,
      boostCharges: this.boostCharges,
      boostTimeRemaining: this.boostTimeRemaining,
    };
  }

  get environmentVariant(): "dry" | "wet" | "sunset" {
    return this.track.environmentVariant;
  }

  suspensionState(): RallySuspensionState {
    return this.sampleSuspension(this.nearestSegmentHint);
  }

  setDefinition(definition: RallyVehicleDefinition): void {
    this.disposeVisual();
    this.definition = definition;
    this.buildVisual();
    this.reset();
  }

  setDamageEnabled(enabled: boolean): void {
    this.damageEnabled = enabled;
    if (!enabled) this.repair();
  }

  private dampenCrossTrackVelocity(
    query: { lateralDistance: number; tangentX: number; tangentZ: number },
    perStepScale: number,
    deltaSeconds: number,
  ): void {
    const side = Math.sign(query.lateralDistance);
    if (side === 0) return;
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);
    const worldX = forwardX * this.forwardVelocity + rightX * this.lateralVelocity;
    const worldZ = forwardZ * this.forwardVelocity + rightZ * this.lateralVelocity;
    const crossTrack = worldCrossTrackVelocity(worldX, worldZ, query.tangentX, query.tangentZ);
    if (side * crossTrack <= 0) return;
    const scale = Math.pow(Math.max(0.65, Math.min(1, perStepScale)), Math.max(0, deltaSeconds * 60));
    const alongTrack = worldX * query.tangentX + worldZ * query.tangentZ;
    const adjustedCrossTrack = crossTrack * scale;
    const adjustedWorldX = query.tangentX * alongTrack + query.tangentZ * adjustedCrossTrack;
    const adjustedWorldZ = query.tangentZ * alongTrack - query.tangentX * adjustedCrossTrack;
    this.forwardVelocity = adjustedWorldX * forwardX + adjustedWorldZ * forwardZ;
    this.lateralVelocity = adjustedWorldX * rightX + adjustedWorldZ * rightZ;
  }

  applyDamage(amount: number): void {
    if (!this.damageEnabled || !Number.isFinite(amount) || amount <= 0) return;
    this.bodyDamage = Math.min(RALLY_DAMAGE_LIMIT, this.bodyDamage + amount);
    this.smokeLevel = damageEffects(this.bodyDamage).smokeLevel;
  }

  /** Apply a small separation impulse from another race vehicle. */
  applyTrafficSeparation(offsetX: number, offsetZ: number, preserveMomentum = false): void {
    this.position.x += offsetX;
    this.position.z += offsetZ;
    this.forwardVelocity *= preserveMomentum ? 0.995 : 0.86;
    this.lateralVelocity *= preserveMomentum ? 0.92 : 0.82;
    if (preserveMomentum) this.ramCount += 1;
    this.speed = this.forwardVelocity;
    this.collisionImpact = Math.max(this.collisionImpact, 0.32);
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);
    this.velocity.set(
      forwardX * this.forwardVelocity + rightX * this.lateralVelocity,
      this.verticalVelocity,
      forwardZ * this.forwardVelocity + rightZ * this.lateralVelocity,
    );
    this.syncVisual(this.lastSteer, 0);
  }

  repair(): void {
    this.bodyDamage = 0;
    this.smokeLevel = 0;
  }

  dispose(): void {
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
      else mesh.material.dispose();
    });
  }

  /** Distance from the physical ground plane to the lowest visible wheel. */
  visualWheelBottomGap(): number {
    this.group.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3();
    for (const wheel of this.wheels) bounds.expandByObject(wheel);
    return bounds.min.y - (this.position.y - CAR_HEIGHT - (this.hoverMode ? RALLY_CONFIG.vehicle.hoverHeight : 0));
  }

  visualMotionState(): { pitch: number; roll: number; compression: number; recoil: number } {
    return {
      pitch: this.visualPitch,
      roll: this.visualRoll,
      compression: this.visualCompression,
      recoil: this.visualRecoil,
    };
  }

  respawn(): void {
    this.respawnCount += 1;
    this.position.set(this.lastSafeTransform.x, this.lastSafeTransform.y, this.lastSafeTransform.z);
    this.heading = this.lastSafeTransform.heading;
    this.speed = 0;
    this.forwardVelocity = 0;
    this.lateralVelocity = 0;
    this.verticalVelocity = 0;
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.groundedRatio = 1;
    this.collisionImpact = 0;
    this.shortcutBreakImpact = 0;
    this.rewardMessage = "NONE";
    this.rewardTimer = 0;
    this.landingGrade = "NONE";
    this.landingTimer = 0;
    this.driftDuration = 0;
    this.driftForwardDistance = 0;
    this.driftCourseProgressDistance = 0;
    this.driftSamePlaceTime = 0;
    this.driftControlStability = 1;
    this.driftEventTimer = 0;
    this.driftGrade = "NONE";
    if (!this.boostChargeMode) this.boostEnergy = 0;
    else this.boostEnergy = this.boostCharges / Math.max(1, this.maxBoostCharges);
    this.boostTimeRemaining = 0;
    this.boostActive = false;
    this.boostInputHeld = false;
    this.boostChainTimer = 0;
    this.boostChainCount = 0;
    this.smokeLevel = damageEffects(this.bodyDamage).smokeLevel;
    this.airTime = 0;
    this.surface = "road";
    this.lastSteer = 0;
    this.lastThrottle = 0;
    this.lastBrake = 0;
    this.stuckTime = 0;
    this.syncVisual(0, 0);
  }

  private isFiniteAndInRecoverableBounds(): boolean {
    return Number.isFinite(this.position.x)
      && Number.isFinite(this.position.y)
      && Number.isFinite(this.position.z)
      && this.position.x >= RALLY_CONFIG.vehicle.recoveryMinX
      && this.position.x <= RALLY_CONFIG.vehicle.recoveryMaxX
      && this.position.z >= RALLY_CONFIG.vehicle.recoveryMinZ
      && this.position.z <= RALLY_CONFIG.vehicle.recoveryMaxZ
      && this.position.y >= RALLY_CONFIG.vehicle.recoveryMinY
      && this.position.y <= RALLY_CONFIG.vehicle.recoveryMaxY;
  }

  private forwardProgressDelta(previous: number, current: number): number {
    const delta = current - previous;
    if (delta >= 0) return Math.min(delta, 0.25);
    if (delta < -0.5) return current + 1 - previous;
    return 0;
  }

  private buildVisual(): void {
    const profile = this.definition.visual;
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: this.definition.bodyColor, flatShading: true });
    const accentMaterial = new THREE.MeshLambertMaterial({ color: this.definition.accentColor, flatShading: true });
    const glassMaterial = new THREE.MeshLambertMaterial({ color: this.definition.glassColor, emissive: 0x1e5360, emissiveIntensity: 0.35, flatShading: true });
    const tireMaterial = new THREE.MeshLambertMaterial({ color: 0x202933, flatShading: true });
    const hoverPadMaterial = new THREE.MeshLambertMaterial({ color: this.definition.accentColor, emissive: this.definition.accentColor, emissiveIntensity: 0.72, flatShading: true });
    const headlightMaterial = new THREE.MeshLambertMaterial({ color: 0xfff3c4, emissive: 0xffd66e, emissiveIntensity: 0.8, flatShading: true });
    const tailLightMaterial = new THREE.MeshLambertMaterial({ color: 0xff4c4c, emissive: 0xd51f2d, emissiveIntensity: 0.45, flatShading: true });
    this.bodyMaterial = bodyMaterial;
    this.accentMaterial = accentMaterial;
    this.glassMaterial = glassMaterial;
    this.hoverPadMaterial = hoverPadMaterial;
    this.visualRoot.position.y = -CAR_HEIGHT;
    if (!this.visualRoot.parent) this.group.add(this.visualRoot);

    const addBox = (
      name: string,
      width: number,
      height: number,
      length: number,
      x: number,
      y: number,
      z: number,
      material: THREE.Material,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), material);
      mesh.name = name;
      mesh.position.set(x, y, z);
      this.visualRoot.add(mesh);
      return mesh;
    };

    const bodyY = profile.wheelRadius + profile.chassisHeight * 0.58;
    addBox("chassis", profile.bodyWidth, profile.chassisHeight, profile.bodyLength, 0, bodyY, 0, bodyMaterial);
    addBox(
      "hood",
      profile.hoodWidth,
      profile.hoodHeight,
      profile.hoodLength,
      0,
      profile.wheelRadius + profile.chassisHeight + profile.hoodHeight * 0.46,
      profile.hoodZ,
      accentMaterial,
    );
    addBox("cabin", profile.cabinWidth, profile.cabinHeight, profile.cabinLength, 0, profile.cabinY, profile.cabinZ, glassMaterial);
    addBox(
      "windshield",
      profile.cabinWidth * 0.84,
      profile.cabinHeight * 0.65,
      0.06,
      0,
      profile.cabinY + 0.02,
      profile.cabinZ + profile.cabinLength / 2 + 0.04,
      glassMaterial,
    );
    addBox("front-bumper", profile.bumperWidth, 0.2, 0.22, 0, profile.wheelRadius + 0.2, profile.bodyLength / 2 + 0.08, accentMaterial);
    addBox("rear-bumper", profile.bumperWidth * 0.94, 0.2, 0.22, 0, profile.wheelRadius + 0.2, -profile.bodyLength / 2 - 0.08, accentMaterial);

    const lightY = profile.wheelRadius + profile.chassisHeight * 0.72;
    const lightX = profile.bodyWidth * 0.29;
    const frontLightZ = profile.bodyLength / 2 + 0.13;
    const rearLightZ = -profile.bodyLength / 2 - 0.13;
    addBox("headlight-left", 0.23, 0.15, 0.08, -lightX, lightY, frontLightZ, headlightMaterial);
    addBox("headlight-right", 0.23, 0.15, 0.08, lightX, lightY, frontLightZ, headlightMaterial);
    addBox("tail-light-left", 0.22, 0.15, 0.08, -lightX, lightY, rearLightZ, tailLightMaterial);
    addBox("tail-light-right", 0.22, 0.15, 0.08, lightX, lightY, rearLightZ, tailLightMaterial);

    const wheelGeometry = new THREE.CylinderGeometry(profile.wheelRadius, profile.wheelRadius, profile.wheelWidth, 10);
    for (const side of [-1, 1]) {
      for (const z of [profile.rearWheelZ, profile.frontWheelZ]) {
        const pivot = new THREE.Group();
        pivot.name = z > 0 ? `front-wheel-pivot-${side < 0 ? "left" : "right"}` : `rear-wheel-pivot-${side < 0 ? "left" : "right"}`;
        pivot.position.set(side * profile.wheelTrack / 2, profile.wheelRadius, z);
        const wheel = new THREE.Mesh(wheelGeometry, tireMaterial);
        wheel.name = z > 0 ? "front-wheel" : "rear-wheel";
        wheel.rotation.z = Math.PI / 2;
        pivot.add(wheel);
        this.visualRoot.add(pivot);
        this.wheels.push(wheel);
        this.wheelSuspensionPivots.push({ pivot, front: z > 0 });
        if (z > 0) this.frontWheelPivots.push(pivot);
      }
    }

    for (const side of [-1, 1]) {
      for (const z of [profile.frontWheelZ, profile.rearWheelZ]) {
        addBox("fender", 0.28, profile.fenderHeight, 0.78, side * profile.wheelTrack / 2, profile.wheelRadius * 1.75, z, accentMaterial);
      }
    }

    // The wheel silhouette remains useful in the classic/debug view, while
    // these four low-poly pads make the mobile vehicle read as a hover racer.
    // They share the physics root and never alter the road-follow transform.
    for (const side of [-1, 1]) {
      for (const z of [profile.frontWheelZ * 0.82, profile.rearWheelZ * 0.82]) {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.68), hoverPadMaterial);
        pad.name = z > 0 ? `hover-pad-front-${side < 0 ? "left" : "right"}` : `hover-pad-rear-${side < 0 ? "left" : "right"}`;
        pad.position.set(side * profile.bodyWidth * 0.38, 0.08, z);
        pad.visible = this.hoverMode;
        this.visualRoot.add(pad);
        this.hoverPads.push(pad);
      }
    }
    addBox("spoiler", profile.spoilerWidth, 0.15, 0.24, 0, profile.spoilerY, -profile.bodyLength / 2 - 0.18, accentMaterial);
    addBox("spoiler-left", 0.12, profile.spoilerY - profile.wheelRadius, 0.12, -profile.spoilerWidth * 0.34, profile.spoilerY / 2 + profile.wheelRadius * 0.5, -profile.bodyLength / 2 - 0.18, accentMaterial);
    addBox("spoiler-right", 0.12, profile.spoilerY - profile.wheelRadius, 0.12, profile.spoilerWidth * 0.34, profile.spoilerY / 2 + profile.wheelRadius * 0.5, -profile.bodyLength / 2 - 0.18, accentMaterial);

    if (profile.style === "muscle") {
      addBox("hood-scoop", profile.hoodWidth * 0.28, 0.14, profile.hoodLength * 0.36, 0, profile.wheelRadius + profile.chassisHeight + profile.hoodHeight + 0.04, profile.hoodZ - 0.08, accentMaterial);
    }
    if (profile.frame) {
      const frameY = profile.cabinY + profile.cabinHeight * 0.18;
      const frameZ = profile.cabinZ;
      addBox("roll-frame-left", 0.11, profile.cabinHeight + 0.62, 0.11, -profile.cabinWidth * 0.48, frameY, frameZ, accentMaterial);
      addBox("roll-frame-right", 0.11, profile.cabinHeight + 0.62, 0.11, profile.cabinWidth * 0.48, frameY, frameZ, accentMaterial);
      addBox("roll-frame-top", profile.cabinWidth, 0.11, 0.11, 0, frameY + profile.cabinHeight * 0.5 + 0.25, frameZ, accentMaterial);
    }
  }

  private disposeVisual(): void {
    for (const child of [...this.visualRoot.children]) {
      child.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else mesh.material.dispose();
      });
      this.visualRoot.remove(child);
    }
    this.wheels.length = 0;
    this.hoverPads.length = 0;
    this.frontWheelPivots.length = 0;
    this.wheelSuspensionPivots.length = 0;
    this.bodyMaterial = null;
    this.accentMaterial = null;
    this.glassMaterial = null;
    this.hoverPadMaterial = null;
  }

  private syncVisual(steer: number, delta: number, suspension?: RallySuspensionState): void {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
    this.group.rotation.x = this.visualPitch;
    this.group.rotation.z = this.visualRoll;
    this.visualRoot.position.set(
      0,
      -CAR_HEIGHT - (this.hoverMode ? RALLY_CONFIG.vehicle.hoverHeight : 0) - this.visualCompression,
      -this.visualRecoil * 0.22,
    );
    this.visualRoot.rotation.x = this.drifting ? this.slipAngle * 0.08 : 0;
    this.visualRoot.rotation.z = this.hoverMode
      ? this.hoverBank * 0.5
      : this.drifting ? -this.slipAngle * 0.05 : 0;
    this.visualRoot.scale.set(1, 1 - this.visualCompression * 0.22, 1);
    this.frontWheelPivots.forEach((pivot) => { pivot.rotation.y = steer * 0.35; });
    const frontTravel = suspension ? (1 - suspension.groundedRatio) * 0.08 + (suspension.contacts[0] && suspension.contacts[1] ? 0 : 0.08) : 0;
    const rearTravel = suspension ? (1 - suspension.groundedRatio) * 0.08 + (suspension.contacts[2] && suspension.contacts[3] ? 0 : 0.08) : 0;
    this.wheelSuspensionPivots.forEach(({ pivot, front }) => {
      pivot.position.y = this.definition.visual.wheelRadius - (front ? frontTravel : rearTravel);
    });
    const wheelSpin = this.forwardVelocity * delta * 2.8;
    this.wheels.forEach((wheel) => { wheel.rotation.x += wheelSpin; });
    this.hoverPads.forEach((pad) => {
      const chainGlow = Math.min(0.45, Math.max(0, this.boostChainCount - 1) * 0.06);
      const thrustScale = this.boostActive ? 1.22 + chainGlow : 1;
      pad.scale.set(1, thrustScale, thrustScale);
      pad.rotation.y = this.hoverBank * 0.16;
    });
    if (this.hoverPadMaterial) {
      this.hoverPadMaterial.emissiveIntensity = this.boostActive
        ? 1.55 + Math.min(0.7, Math.max(0, this.boostChainCount - 1) * 0.12)
        : 0.72;
    }
    this.bodyMaterial?.color.setHex(this.definition.bodyColor).multiplyScalar(1 - this.bodyDamage * 0.32);
    this.accentMaterial?.color.setHex(this.definition.accentColor).multiplyScalar(1 - this.bodyDamage * 0.2);
  }

  private sampleSuspension(hintSegment: number): RallySuspensionState {
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);
    const frontLeft = this.track.queryAt(
      this.position.x + forwardX * HALF_BODY_LENGTH + rightX * HALF_BODY_WIDTH,
      this.position.z + forwardZ * HALF_BODY_LENGTH + rightZ * HALF_BODY_WIDTH,
      hintSegment,
    );
    const frontRight = this.track.queryAt(
      this.position.x + forwardX * HALF_BODY_LENGTH - rightX * HALF_BODY_WIDTH,
      this.position.z + forwardZ * HALF_BODY_LENGTH - rightZ * HALF_BODY_WIDTH,
      hintSegment,
    );
    const rearLeft = this.track.queryAt(
      this.position.x - forwardX * HALF_BODY_LENGTH + rightX * HALF_BODY_WIDTH,
      this.position.z - forwardZ * HALF_BODY_LENGTH + rightZ * HALF_BODY_WIDTH,
      hintSegment,
    );
    const rearRight = this.track.queryAt(
      this.position.x - forwardX * HALF_BODY_LENGTH - rightX * HALF_BODY_WIDTH,
      this.position.z - forwardZ * HALF_BODY_LENGTH - rightZ * HALF_BODY_WIDTH,
      hintSegment,
    );
    const frontGround = (frontLeft.groundHeight + frontRight.groundHeight) / 2;
    const rearGround = (rearLeft.groundHeight + rearRight.groundHeight) / 2;
    const averageGround = (frontLeft.groundHeight + frontRight.groundHeight + rearLeft.groundHeight + rearRight.groundHeight) / 4;
    const expectedWheelGround = this.position.y - CAR_HEIGHT - (this.hoverMode ? RALLY_CONFIG.vehicle.hoverHeight : 0);
    const isContact = (groundHeight: number): boolean => {
      const gap = expectedWheelGround - groundHeight;
      return gap <= RALLY_CONFIG.vehicle.wheelContactTolerance
        && gap >= -RALLY_CONFIG.vehicle.wheelMaxSuspensionGap;
    };
    const contacts = [
      isContact(frontLeft.groundHeight),
      isContact(frontRight.groundHeight),
      isContact(rearLeft.groundHeight),
      isContact(rearRight.groundHeight),
    ] as const;
    const groundedCount = Number(contacts[0]) + Number(contacts[1]) + Number(contacts[2]) + Number(contacts[3]);
    return {
      averageGround,
      frontGround,
      rearGround,
      groundedRatio: groundedCount / 4,
      contacts,
    };
  }
}

export const RALLY_CAR_CONSTANTS = {
  maxSpeed: MAX_SPEED,
  carHeight: CAR_HEIGHT,
  bodyWidth: RALLY_CONFIG.vehicle.bodyWidth,
  bodyLength: RALLY_CONFIG.vehicle.bodyLength,
  visualWheelRadius: VISUAL_WHEEL_RADIUS,
  boostDrainPerSecond: BOOST_DRAIN_PER_SECOND,
  boostAccelerationMultiplier: BOOST_ACCELERATION_MULTIPLIER,
  boostTopSpeedRatio: BOOST_TOP_SPEED_RATIO,
  boostSpeedKick: BOOST_SPEED_KICK,
  boostMaxAccumulatedTime: BOOST_MAX_ACCUMULATED_TIME,
  boostChainWindow: BOOST_CHAIN_WINDOW,
};

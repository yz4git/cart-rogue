import { RALLY_CONFIG } from "../RallyConfig";
import { RallyCar } from "../RallyCar";
import { RallyTrack } from "../RallyTrack";
import type { RallyInputState } from "../RallyTypes";
import { RALLY_AI_PROFILES, type AIDriverProfile } from "./AIDriverProfile";
import { sampleRacingTarget } from "./RacingLine";
import { RALLY_AI_PERSONALITIES, type AIPersonality, type AIPersonalityId } from "./AIPersonality";

function clamp(value: number, minimum = -1, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function angleDifference(target: number, current: number): number {
  return ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
}

export class RallyAIDriver {
  private profile: AIDriverProfile;
  private personality: AIPersonality;
  private segmentHint = 0;
  private lastInput: RallyInputState = { throttle: 0, brake: 0, steer: 0 };
  private readonly traffic: RallyCar[] = [];
  private elapsed = 0;
  private stuckTime = 0;
  private boostCooldown = 0;
  private lastProgress = 0;
  private raceState: { readonly nextCheckpoint: number } | null = null;

  constructor(
    readonly car: RallyCar,
    readonly track: RallyTrack,
    profile: AIDriverProfile = RALLY_AI_PROFILES.normal,
    personality: AIPersonality = RALLY_AI_PERSONALITIES.technical,
  ) {
    this.profile = profile;
    this.personality = personality;
  }

  get difficulty(): AIDriverProfile["id"] {
    return this.profile.id;
  }

  get personalityId(): AIPersonalityId {
    return this.personality.id;
  }

  setProfile(profile: AIDriverProfile): void {
    this.profile = profile;
    this.lastInput = { throttle: 0, brake: 0, steer: 0 };
    this.boostCooldown = 0;
  }

  setPersonality(personality: AIPersonality): void {
    this.personality = personality;
    this.lastInput = { throttle: 0, brake: 0, steer: 0 };
    this.boostCooldown = 0;
  }

  /** Bind the driver to the shared race state so a missed gate can be recovered. */
  bindRaceState(state: { readonly nextCheckpoint: number } | null): void {
    this.raceState = state;
  }

  update(deltaSeconds: number): RallyInputState {
    const delta = Math.max(0, Math.min(0.1, deltaSeconds));
    this.elapsed += delta;
    this.boostCooldown = Math.max(0, this.boostCooldown - delta);
    const query = this.track.queryAt(this.car.position.x, this.car.position.z, this.segmentHint);
    this.segmentHint = query.segmentIndex;
    let target = sampleRacingTarget(this.track, query.distance, this.profile.lookAhead);
    let checkpointApproach = false;
    const checkpointIndex = this.raceState?.nextCheckpoint;
    if (checkpointIndex !== undefined) {
      const gate = this.track.sampleCheckpoint(checkpointIndex);
      const distanceFromGate = (query.distance - gate.distance + this.track.length) % this.track.length;
      const distanceToGate = (gate.distance - query.distance + this.track.length) % this.track.length;
      // If the car has passed the required gate without crossing it, take a
      // full forward approach on the shared road instead of attempting a
      // reverse/U-turn. This keeps checkpoint order strict while allowing AI
      // recovery after a wide corner or a traffic bump.
      const missedGate = distanceFromGate > 2 && distanceFromGate < this.track.length * 0.5;
      if (distanceToGate < 48 || missedGate) {
        checkpointApproach = true;
        // Aim at a short pre-gate approach point until the car is close
        // enough to cross the gate. Targeting the gate center too early makes
        // a high-speed car turn across the gate instead of entering it.
        const targetDistance = missedGate || distanceToGate > 4 ? gate.distance - 8 : gate.distance;
        const gateTarget = this.track.sampleAtDistance(targetDistance);
        target = {
          x: gateTarget.x,
          z: gateTarget.z,
          heading: gateTarget.heading,
          progress: gateTarget.distance / this.track.length,
          curvature: 0,
        };
      }
    }
    const forwardX = Math.sin(this.car.heading);
    const forwardZ = Math.cos(this.car.heading);
    const rightX = Math.cos(this.car.heading);
    const rightZ = -Math.sin(this.car.heading);
    let targetX = target.x;
    let targetZ = target.z;
    let targetHeading = target.heading;
    const targetRightX = Math.cos(target.heading);
    const targetRightZ = -Math.sin(target.heading);
    targetX += targetRightX * this.personality.lineOffset;
    targetZ += targetRightZ * this.personality.lineOffset;
    const shortcut = this.track.routeGraph?.edges.find((edge) => {
      if (edge.kind === "normal" || this.profile.shortcutUsage * this.personality.shortcutBias <= 0) return false;
      if (edge.requiresDestruction && this.car.forwardVelocity < edge.speedRequirement * 0.7) return false;
      const dx = edge.entryX - this.car.position.x;
      const dz = edge.entryZ - this.car.position.z;
      return Math.hypot(dx, dz) < 18 && query.progress >= edge.startProgress && query.progress <= edge.endProgress;
    });
    if (shortcut && this.profile.shortcutUsage * this.personality.shortcutBias > 0.25) {
      targetX = shortcut.exitX;
      targetZ = shortcut.exitZ;
      targetHeading = Math.atan2(shortcut.exitX - shortcut.entryX, shortcut.exitZ - shortcut.entryZ);
    }
    const pickup = this.car.isHoverMode && !shortcut
      ? this.track.pickupAhead(query.progress, Math.max(72, Math.min(132, 72 + Math.abs(this.car.speed) * 2.3)), this.car.pickupOwnerId)
      : null;
    if (pickup && (this.personality.pickupBias ?? 0) > 0.35) {
      // Pickup collection is a lateral race decision. Keep the shared road
      // tangent as the forward target and only move the hover target across
      // the road; this never turns pickup seeking into a renderer-only path.
      targetX = pickup.x;
      targetZ = pickup.z;
      targetHeading = this.track.sampleAtDistance(this.track.length * pickup.progress).heading;
    }
    const roadHalfWidth = query.roadHalfWidth;
    const outsideRoad = Math.abs(query.lateralDistance) > roadHalfWidth * 0.82;
    const severeOffRoad = Math.abs(query.lateralDistance) > roadHalfWidth * 1.12;
    // A fast line is only useful while it remains a line the car can drive.
    // When the AI has drifted beyond the usable road corridor, steer toward
    // the shared nearest-road sample before trying to resume the racing line.
    // Shortcut targets are allowed to remain off-road so personality and route
    // selection still have a visible effect.
    // During a checkpoint/finish approach, keep aiming at the shared gate
    // target even when the car is wide. Replacing that target with the local
    // nearest-road point can make a classic AI orbit an off-road self-crossing
    // and miss the gate indefinitely.
    if (outsideRoad && !shortcut && !checkpointApproach) {
      targetX = query.x;
      targetZ = query.z;
      targetHeading = query.heading;
    }
    let targetLateral = (targetX - this.car.position.x) * rightX + (targetZ - this.car.position.z) * rightZ;
    if (this.car.isHoverMode) {
      const roadRightX = query.tangentZ;
      const roadRightZ = -query.tangentX;
      targetLateral = (targetX - this.car.position.x) * roadRightX + (targetZ - this.car.position.z) * roadRightZ;
    }
    const directTargetHeading = Math.atan2(targetX - this.car.position.x, targetZ - this.car.position.z);
    const headingError = angleDifference(checkpointApproach ? directTargetHeading : targetHeading, this.car.heading);
    let steer = clamp(
      headingError * this.profile.steerGain * this.profile.racingLineAccuracy
        + targetLateral * this.profile.lateralGain,
    );

    let targetSpeed = this.profile.targetSpeed
      * this.personality.targetSpeedRatio
      * (1 - Math.min(0.7, target.curvature * 2.2));
    // The racing target can be ahead of a tight corner. Use the current
    // heading error as an additional anticipation signal so the shared car
    // physics brakes before the vehicle runs wide.
    targetSpeed *= Math.max(0.5, 1 - Math.abs(headingError) * 0.45);
    if (outsideRoad && !shortcut) targetSpeed *= severeOffRoad ? 0.48 : 0.72;
    // Hover gates are wide progress markers, not hairpins. The classic
    // driver may crawl into a checkpoint to line up a narrow wheel gate, but
    // slowing a hover racer to 8.5 m/s creates an artificial stop before the
    // next gate and destroys the high-speed rhythm.
    if (checkpointApproach && !this.car.isHoverMode) targetSpeed = Math.min(targetSpeed, 8.5);
    // Hover racers skim above the surface. Surface identity still drives
    // visuals/audio, but classic rally slowdown would erase pickup and
    // strafe decisions.
    if (!this.car.isHoverMode) {
      if (query.surface === "grass") targetSpeed *= 0.72;
      else if (query.surface === "gravel") targetSpeed *= 0.86;
    }

    const obstacle = this.track.staticColliderAhead(
      this.car.position.x,
      this.car.position.z,
      this.car.heading,
      this.profile.obstacleLookAhead,
      RALLY_CONFIG.vehicle.bodyWidth,
    );
    const isSafetyBlock = obstacle?.source === "obstacle"
      && this.track.obstacles.some((candidate) => candidate.id === obstacle.id && candidate.kind === "safety-block");
    // The new hover-racer uses roadside blocks as readable lateral hazards.
    // Keep the legacy wheel-steering AI's safety rows out of its target
    // planning: those rows are deliberately outside the classic road line
    // and should remain a forgiving collision fallback, not a new waypoint
    // that can pull a classic driver off the track.
    if (obstacle && (this.car.isHoverMode || !isSafetyBlock)) {
      targetSpeed *= isSafetyBlock ? 0.92 : obstacle.destructible ? this.personality.destructibleSpeedRatio : 0.35;
      if (obstacle.destructible && !isSafetyBlock) {
        // A destructible shortcut must be approached with enough momentum to
        // break it. Slowing below the shared break threshold leaves an AI
        // car circling the wall forever instead of choosing a valid route.
        const breakSpeed = RALLY_CONFIG.vehicle.shortcutBreakSpeed / this.car.definition.collisionBreakPower;
        targetSpeed = Math.max(targetSpeed, breakSpeed + 0.8);
      }
      const obstacleSide = (obstacle.x - this.car.position.x) * rightX + (obstacle.z - this.car.position.z) * rightZ;
      // Safety rows are a forgiving roadside boundary, not a racing target.
      // Avoid them decisively while keeping the shared RallyCar collision as
      // the final fallback if a line still clips a block.
      const avoidanceStrength = isSafetyBlock ? 1.15 : 0.9;
      if (this.car.isHoverMode) {
        targetLateral += obstacleSide >= 0 ? -query.roadHalfWidth * 0.42 : query.roadHalfWidth * 0.42;
      } else {
        steer += obstacleSide >= 0 ? -avoidanceStrength : avoidanceStrength;
      }
    }

    for (const other of this.traffic) {
      const dx = other.position.x - this.car.position.x;
      const dz = other.position.z - this.car.position.z;
      const forwardDistance = dx * forwardX + dz * forwardZ;
      const lateralDistance = dx * rightX + dz * rightZ;
      if (forwardDistance <= 0 || forwardDistance > 10 || Math.abs(lateralDistance) > 3.5) continue;
      // Move to the open side of a nearby car. This creates a visible
      // overtake offset without changing either car's physical speed.
      if (this.car.isHoverMode) {
        targetLateral += lateralDistance >= 0
          ? -this.profile.overtakeOffset * this.personality.overtakeRatio
          : this.profile.overtakeOffset * this.personality.overtakeRatio;
      } else {
        steer += lateralDistance >= 0
          ? -this.profile.overtakeOffset * this.personality.overtakeRatio
          : this.profile.overtakeOffset * this.personality.overtakeRatio;
      }
      targetSpeed *= 0.94;
    }

    const progressDelta = Math.abs(query.progress - this.lastProgress);
    this.stuckTime = Math.abs(this.car.speed) < 1.5 && progressDelta < 0.01 ? this.stuckTime + delta : 0;
    this.lastProgress = query.progress;
    if (this.stuckTime > 1.2) {
      if (this.car.isHoverMode) targetLateral = 0;
      else steer = clamp(angleDifference(query.heading, this.car.heading) * 2.5);
      targetSpeed = this.profile.targetSpeed * this.personality.targetSpeedRatio * 0.8;
    }
    const needsRecovery = Math.abs(query.lateralDistance) > query.roadHalfWidth * 2
      || Math.abs(this.car.position.y - (query.groundHeight + RALLY_CONFIG.vehicle.height)) > 2;
    if (this.stuckTime > 2.4 && needsRecovery) {
      // Use the shared last-safe recovery instead of giving the AI a special
      // movement rule. Race progress/checkpoints remain intact after recovery.
      this.car.respawn();
      this.stuckTime = 0;
      this.lastProgress = query.progress;
    }

    const mistakeWave = Math.max(0, Math.sin(this.elapsed * 1.4) * 0.5 + 0.5)
      * this.profile.mistakeProbability
      * this.personality.mistakeMultiplier;
    steer *= 1 - mistakeWave;
    if (!this.car.grounded) {
      targetSpeed = Math.max(targetSpeed, this.profile.targetSpeed * 0.75);
    }

    const speed = Math.abs(this.car.forwardVelocity);
    const brakingMargin = this.profile.brakingMargin * this.personality.brakingMarginRatio;
    const desiredBrake = speed > targetSpeed + brakingMargin ? clamp((speed - targetSpeed) / 8, 0, 1) : 0;
    const desiredThrottle = !this.car.grounded
      ? this.profile.jumpThrottle
      : desiredBrake > 0.1 ? 0.12 : clamp((targetSpeed - speed + 4) / 8, 0.2, 1);
    const distanceToProgress = (targetProgress: number): number => {
      const deltaProgress = (targetProgress - query.progress + 1) % 1;
      return deltaProgress * this.track.length;
    };
    const jumpAhead = this.track.gameplayBeats.some((beat) => beat.kind === "jump" && distanceToProgress(beat.progress) < 28);
    const straightWindow = !checkpointApproach
      && query.onRoad
      && !outsideRoad
      && !obstacle
      && Math.abs(headingError) < 0.16
      && Math.abs(target.curvature) < 0.14
      && desiredBrake < 0.08
      && speed > 9;
    const destructionWindow = Boolean(obstacle?.destructible || shortcut?.requiresDestruction)
      && !checkpointApproach
      && desiredBrake < 0.12
      && speed > 8;
    const boostWindow = straightWindow || destructionWindow || (jumpAhead && speed < 18 && desiredBrake < 0.08);
    const boostSkill = this.profile.boostUsage * this.personality.boostBias;
    const availableBoost = this.car.isHoverMode ? this.car.boostCharges > 0 : this.car.boostEnergy > 0.18;
    const wantsBoost = this.car.boostActive || (
      availableBoost
      && this.boostCooldown <= 0
      && boostSkill > 0.18
      && boostWindow
      && !severeOffRoad
    );
    if (wantsBoost && !this.car.boostActive) this.boostCooldown = this.personality.boostCooldown;
    const response = clamp(delta / this.profile.reactionTime, 0.08, 1);
    const desiredStrafe = this.car.isHoverMode
      ? clamp(targetLateral / Math.max(1, query.roadHalfWidth - RALLY_CONFIG.vehicle.bodyWidth * 0.6))
      : undefined;
    this.lastInput = {
      throttle: this.approach(this.lastInput.throttle, desiredThrottle, response),
      brake: this.approach(this.lastInput.brake, desiredBrake, response),
      steer: this.car.isHoverMode ? 0 : this.approach(this.lastInput.steer, clamp(steer), response),
      ...(desiredStrafe === undefined ? {} : { strafe: this.approach(this.lastInput.strafe ?? 0, desiredStrafe, response) }),
      boost: wantsBoost,
    };
    return this.lastInput;
  }

  input(): RallyInputState {
    return this.lastInput;
  }

  setTraffic(cars: readonly RallyCar[]): void {
    this.traffic.length = 0;
    this.traffic.push(...cars.filter((car) => car !== this.car));
  }

  private approach(current: number, target: number, amount: number): number {
    return current + (target - current) * amount;
  }
}

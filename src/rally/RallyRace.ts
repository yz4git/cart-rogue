import { RALLY_CONFIG } from "./RallyConfig";
import { RallyCar } from "./RallyCar";
import { RallyGhostPlayback, type RallyGhostComparison, type RallyGhostRun } from "./RallyGhost";
import { loadTrackProgress, medalForLapTime, saveTrackProgress, type RallyMedal } from "./RallyProgress";
import { RallyTrack } from "./RallyTrack";
import { RallyFixedStepClock } from "./RallySimulation";
import { predictedTrackQuery, RALLY_STEERING_ASSIST_CONSTANTS, type RallySteeringAssistMode } from "./RallySteeringAssist";
import { evaluateRallyRoadAssist, neutralRallyRoadAssist, roadEdgePressure, safeLaneHalfWidth, worldCrossTrackVelocity, type RallyRoadAssistResult } from "./RallyRoadAssist";
import type { RallyInputFrameContext } from "./RallyInput";
import type { RallyGhostDeltaState, RallyInputState, RallyPhase, RallyStats, RallyTelemetry } from "./RallyTypes";

export type RallyInputProvider = RallyInputState | ((fixedDelta: number) => RallyInputState);

const COUNTDOWN_SECONDS = RALLY_CONFIG.race.countdownSeconds;

export class RallyRace {
  phase: RallyPhase = "ready";
  countdown = 0;
  lapTime = 0;
  bestLap: number | null = null;
  nextCheckpoint = 0;
  message = "STARTを押して出走";
  progress = 0;
  wrongWay = false;
  missedCheckpoint = false;
  sector = 0;
  lastSplit: number | null = null;
  medal: RallyMedal | null = null;
  bestDelta: number | null = null;
  bestSplits: number[] = [];
  currentRouteId: string | null = null;
  routeHistory: string[] = [];
  private readonly ghostPlayback: RallyGhostPlayback;
  private currentSplits: number[] = [];
  private splitStartTime = 0;
  private previousX = 0;
  private previousZ = 0;
  private progressSegmentHint = 0;
  private readonly simulationClock = new RallyFixedStepClock();
  private steeringAssistMode: RallySteeringAssistMode = "off";
  private mobileArcadeInput = false;
  private mobileStrafeInput = false;
  private appliedAssistSteer = 0;
  private outwardSteerHoldSeconds = 0;
  private targetLane = 0;
  private roadAssistState: RallyRoadAssistResult = neutralRallyRoadAssist(0, {
    strength: 0,
    direction: 0,
    headingDelta: 0,
    distanceAhead: 0,
    recommendedSpeed: RALLY_CONFIG.vehicle.maxSpeed,
  });
  private autoDriftActive = false;
  /** Set after the final checkpoint so a fast hover lap can arm the finish
   * line even when one fixed step skips across the narrow gate. */
  private finishGateArmed = false;

  constructor(
    readonly track: RallyTrack,
    readonly car: RallyCar,
    private readonly persistProgress = true,
    damageEnabled = false,
    steeringAssistMode: RallySteeringAssistMode = "off",
  ) {
    this.car.setDamageEnabled(damageEnabled);
    this.steeringAssistMode = steeringAssistMode;
    const progress = loadTrackProgress(this.track.id, 4, this.track.environmentVariant);
    this.ghostPlayback = new RallyGhostPlayback(this.track.id, this.track.environmentVariant, this.car.definition.id);
    this.bestLap = progress.bestLap;
    this.bestSplits = progress.bestSplits;
  }

  start(): void {
    if (this.phase === "countdown" || this.phase === "racing") return;
    this.car.reset();
    this.track.resetObstacles();
    this.phase = "countdown";
    this.countdown = COUNTDOWN_SECONDS;
    this.lapTime = 0;
    this.nextCheckpoint = 0;
    this.progress = 0;
    this.wrongWay = false;
    this.missedCheckpoint = false;
    this.sector = 0;
    this.lastSplit = null;
    this.medal = null;
    this.bestDelta = null;
    this.currentRouteId = null;
    this.routeHistory = [];
    this.currentSplits = [];
    this.splitStartTime = 0;
    this.previousX = this.car.position.x;
    this.previousZ = this.car.position.z;
    this.progressSegmentHint = 0;
    this.appliedAssistSteer = 0;
    this.outwardSteerHoldSeconds = 0;
    this.targetLane = 0;
    this.roadAssistState = neutralRallyRoadAssist(0, {
      strength: 0,
      direction: 0,
      headingDelta: 0,
      distanceAhead: 0,
      recommendedSpeed: RALLY_CONFIG.vehicle.maxSpeed,
    });
    this.autoDriftActive = false;
    this.finishGateArmed = false;
    this.simulationClock.reset();
    this.message = "READY";
  }

  reset(): void {
    this.car.reset();
    this.track.resetObstacles();
    this.phase = "ready";
    this.countdown = 0;
    this.lapTime = 0;
    this.nextCheckpoint = 0;
    this.progress = 0;
    this.wrongWay = false;
    this.missedCheckpoint = false;
    this.sector = 0;
    this.lastSplit = null;
    this.medal = null;
    this.bestDelta = null;
    this.currentRouteId = null;
    this.routeHistory = [];
    this.currentSplits = [];
    this.splitStartTime = 0;
    this.previousX = this.car.position.x;
    this.previousZ = this.car.position.z;
    this.progressSegmentHint = 0;
    this.appliedAssistSteer = 0;
    this.outwardSteerHoldSeconds = 0;
    this.targetLane = 0;
    this.roadAssistState = neutralRallyRoadAssist(0, {
      strength: 0,
      direction: 0,
      headingDelta: 0,
      distanceAhead: 0,
      recommendedSpeed: RALLY_CONFIG.vehicle.maxSpeed,
    });
    this.autoDriftActive = false;
    this.finishGateArmed = false;
    this.simulationClock.reset();
    this.message = "STARTを押して出走";
  }

  update(input: RallyInputProvider, deltaSeconds: number): void {
    this.simulationClock.advance(deltaSeconds, (delta) => {
      this.simulateStep(typeof input === "function" ? input(delta) : input, delta);
    });
  }

  /** Run one already-fixed step when several race participants share a clock. */
  updateFixed(input: RallyInputState, fixedDelta: number): void {
    this.simulateStep(input, fixedDelta);
  }

  get simulationInterpolation(): number {
    return this.simulationClock.interpolation;
  }

  telemetry(): RallyTelemetry {
    return {
      ...this.car.telemetry(),
      roadAssistStrength: this.roadAssistState.assistStrength,
      edgePressure: this.roadAssistState.edgePressure,
      turnAheadStrength: this.roadAssistState.upcomingTurnStrength,
      autoThrottle: this.roadAssistState.autoThrottleScale,
      autoDrift: this.autoDriftActive,
      targetLane: this.roadAssistState.targetLane,
      desiredLateralDistance: this.roadAssistState.desiredLateralDistance,
      crossTrackVelocity: this.roadAssistState.crossTrackVelocity,
      roadFollowSteer: this.roadAssistState.roadFollowSteer,
      laneSteer: this.roadAssistState.laneSteer,
      headingAssist: this.roadAssistState.headingAssist,
      brakingDistance: this.roadAssistState.brakingDistance,
      targetCornerSpeed: this.roadAssistState.targetCornerSpeed,
    };
  }

  setGhostEnabled(enabled: boolean): void {
    this.ghostPlayback.enabled = enabled;
  }

  setGhostRun(run: RallyGhostRun | null): void {
    this.ghostPlayback.setRun(run);
  }

  setGhostContext(): void {
    this.ghostPlayback.setContext(this.track.id, this.track.environmentVariant, this.car.definition.id);
  }

  setSteeringAssistMode(mode: RallySteeringAssistMode): void {
    this.steeringAssistMode = mode;
    if (mode === "off") {
      this.appliedAssistSteer = 0;
      this.roadAssistState = neutralRallyRoadAssist(0, {
        strength: 0,
        direction: 0,
        headingDelta: 0,
        distanceAhead: 0,
        recommendedSpeed: RALLY_CONFIG.vehicle.maxSpeed,
      });
    }
  }

  setMobileArcadeInput(enabled: boolean): void {
    this.mobileArcadeInput = enabled;
  }

  /** Enable the anti-gravity player control path without changing AI/classic input. */
  setMobileStrafeInput(enabled: boolean): void {
    this.mobileStrafeInput = enabled;
    this.car.setHoverMode(enabled);
    this.car.setBoostChargeMode(enabled);
  }

  mobileDrivingContext(): RallyInputFrameContext {
    const current = this.track.queryAt(this.car.position.x, this.car.position.z, this.progressSegmentHint);
    const predicted = predictedTrackQuery(
      current,
      (x, z, hint) => this.track.queryAt(x, z, hint),
      this.car.position.x,
      this.car.position.z,
      this.car.velocity.x,
      this.car.velocity.z,
      this.car.boostActive,
      Math.abs(this.car.speed),
    );
    const turn = this.track.upcomingTurnAt(current, Math.abs(this.car.speed), this.car.boostActive);
    const edgePressure = roadEdgePressure(
      current.lateralDistance,
      current.roadHalfWidth,
      RALLY_CONFIG.vehicle.bodyWidth / 2,
      predicted.lateralDistance,
    );
    const crossTrackVelocity = worldCrossTrackVelocity(
      this.car.velocity.x,
      this.car.velocity.z,
      current.tangentX,
      current.tangentZ,
    );
    const side = Math.sign(predicted.lateralDistance || current.lateralDistance);
    const outwardLateral = side !== 0 && side * crossTrackVelocity > 0.08;
    const roadRecovery = edgePressure > 0.62 && (outwardLateral || (!predicted.onRoad && Math.abs(this.car.speed) > 3));
    return {
      phase: this.phase,
      speed: this.car.speed,
      grounded: this.car.grounded,
      upcomingTurnStrength: turn.strength,
      upcomingTurnDirection: turn.direction,
      roadEdgePressure: edgePressure,
      roadRecovery,
      targetLane: this.targetLane,
    };
  }

  /** Shared camera hint: keep the next physical road bend readable without
   * putting gameplay rules into either renderer. */
  roadHeadingForCamera(): { heading: number; strength: number; centerX: number; centerZ: number; aheadX: number; aheadZ: number } {
    const current = this.track.queryAt(this.car.position.x, this.car.position.z, this.progressSegmentHint);
    const turn = this.track.upcomingTurnAt(current, Math.abs(this.car.speed), this.car.boostActive);
    const ahead = this.track.sampleAtDistance(current.distance + Math.max(12, Math.abs(this.car.speed) * (this.car.boostActive ? 0.82 : 0.62)));
    return {
      heading: turn.targetHeading ?? current.heading,
      strength: turn.strength,
      centerX: current.x,
      centerZ: current.z,
      aheadX: ahead.x,
      aheadZ: ahead.z,
    };
  }

  ghostComparison(): RallyGhostComparison {
    return this.ghostPlayback.compareAtProgress(this.progress, this.lapTime);
  }

  private simulateStep(input: RallyInputState, delta: number): void {
    if (this.phase === "countdown") {
      this.countdown = Math.max(0, this.countdown - delta);
      this.car.update(input, delta, false);
      this.rememberVehiclePosition();
      if (this.countdown <= 0) {
        this.phase = "racing";
        this.lapTime = 0;
        this.message = "GO!";
      } else if (this.countdown < 1) {
        this.message = "GO!";
      } else {
        this.message = String(Math.ceil(this.countdown));
      }
      return;
    }

    const active = this.phase === "racing";
    const previousX = this.previousX;
    const previousZ = this.previousZ;
    const prepared = active ? this.applySteeringAssist(input, delta) : { input, roadAssist: undefined };
    this.car.update(prepared.input, delta, active, prepared.roadAssist);
    if (!active) return;

    this.lapTime += delta;
    const query = this.track.queryAt(this.car.position.x, this.car.position.z, this.progressSegmentHint);
    this.progress = query.progress;
    this.progressSegmentHint = query.segmentIndex;
    const route = this.track.routeGraph?.selectEdge(
      query.progress,
      this.car.position.x,
      this.car.position.z,
      this.currentRouteId,
    );
    if (route && route.id !== this.currentRouteId) {
      this.currentRouteId = route.id;
      if (!this.routeHistory.includes(route.id)) this.routeHistory.push(route.id);
    }
    const signedVelocity = this.car.velocity.x * query.tangentX + this.car.velocity.z * query.tangentZ;
    this.wrongWay = Math.abs(this.car.speed) > RALLY_CONFIG.race.wrongWaySpeed && signedVelocity < -1;
    if (this.nextCheckpoint === this.track.checkpoints.length && this.progress > 0.72) {
      this.finishGateArmed = true;
    }
    const next = this.track.sampleCheckpoint(this.nextCheckpoint);
    const crossing = this.crossedGate(previousX, previousZ, this.car.position.x, this.car.position.z, next);
    const finishProgressWrap = this.nextCheckpoint === this.track.checkpoints.length
      && this.finishGateArmed
      && this.progress < 0.35
      // At hover-racer speeds a fixed gate radius is less reliable than the
      // canonical progress wrap.  Checkpoint order has already been verified;
      // accepting the physical loop crossing here prevents a fast racer from
      // missing the finish line between fixed samples.
      && signedVelocity > -1;
    if (crossing.crossed || finishProgressWrap) {
      if (!crossing.forward && !finishProgressWrap) {
        this.missedCheckpoint = true;
        this.message = "MISS CHECKPOINT";
      } else if (this.nextCheckpoint < this.track.checkpoints.length) {
        this.nextCheckpoint += 1;
        this.missedCheckpoint = false;
        this.sector = this.nextCheckpoint;
        this.lastSplit = this.lapTime - this.splitStartTime;
        this.currentSplits.push(this.lastSplit);
        this.splitStartTime = this.lapTime;
        this.message = `CHECKPOINT ${this.nextCheckpoint}/${this.track.checkpoints.length}`;
      } else if (this.lapTime > RALLY_CONFIG.race.minimumLapSeconds) {
        this.lastSplit = this.lapTime - this.splitStartTime;
        this.currentSplits.push(this.lastSplit);
        this.phase = "finished";
        const previousBest = this.bestLap;
        this.bestDelta = previousBest === null ? null : this.lapTime - previousBest;
        this.bestLap = previousBest === null ? this.lapTime : Math.min(previousBest, this.lapTime);
        this.bestSplits = this.bestSplits.map((best, index) => Math.min(best, this.currentSplits[index] ?? best));
        for (let index = this.bestSplits.length; index < this.currentSplits.length; index += 1) {
          this.bestSplits.push(this.currentSplits[index]);
        }
        this.medal = medalForLapTime(this.lapTime, this.track.definition.medalTimes);
        if (this.persistProgress) {
          saveTrackProgress({ trackId: this.track.id, environmentVariant: this.track.environmentVariant, bestLap: this.bestLap, bestSplits: this.bestSplits });
        }
        this.message = "GOAL! 1周クリア";
      }
    }
    if (this.wrongWay && this.phase === "racing") {
      this.message = "WRONG WAY";
    }
    this.rememberVehiclePosition();
  }

  private applySteeringAssist(input: RallyInputState, delta: number): { input: RallyInputState; roadAssist: RallyRoadAssistResult } {
    const current = this.track.queryAt(this.car.position.x, this.car.position.z, this.progressSegmentHint);
    const predictedSpeed = Math.abs(this.car.speed);
    const predicted = predictedTrackQuery(
      current,
      (x, z, hint) => this.track.queryAt(x, z, hint),
      this.car.position.x,
      this.car.position.z,
      this.car.velocity.x,
      this.car.velocity.z,
      this.car.boostActive,
      predictedSpeed,
    );
    const upcomingTurn = this.track.upcomingTurnAt(current, predictedSpeed, this.car.boostActive || input.boost === true);
    const hoverMode = this.mobileStrafeInput && input.strafe !== undefined;
    // Hover/AI participants still need their continuous lateral target when
    // player Road Assist is set to OFF. OFF disables the helper forces; it must
    // not turn a strafe input into a no-op.
    const laneInputEnabled = hoverMode || (this.mobileArcadeInput && this.steeringAssistMode !== "off");
    const requestedLane = laneInputEnabled
      ? Math.max(-1, Math.min(1, hoverMode ? (input.strafe ?? 0) : input.steer))
      : 0;
    const laneRate = this.steeringAssistMode === "strong" ? 3.8 : 4.8;
    const laneDelta = Math.max(-laneRate * delta, Math.min(laneRate * delta, requestedLane - this.targetLane));
    this.targetLane = Math.max(-1, Math.min(1, this.targetLane + laneDelta));
    const shortcutIntent = this.isShortcutIntent(hoverMode ? (input.strafe ?? 0) : input.steer, current.progress);
    const predictedSide = Math.sign(predicted.lateralDistance);
    const outwardInputValue = hoverMode ? (input.strafe ?? 0) : input.steer;
    const outwardInput = predictedSide !== 0 && predictedSide * outwardInputValue > 0.42 && Math.abs(outwardInputValue) >= 0.72;
    this.outwardSteerHoldSeconds = outwardInput
      ? Math.min(1, this.outwardSteerHoldSeconds + delta)
      : Math.max(0, this.outwardSteerHoldSeconds - delta * 2.5);
    // A normal mistake must keep receiving protection after the car crosses
    // the edge. Only a confirmed shortcut/alternate-route intent may soften
    // the rescue; raw outward steering alone is never treated as permission
    // to leave the course.
    const alternateRoute = this.currentRouteId
      ? this.track.routeGraph?.edgeById(this.currentRouteId)
      : null;
    const intentionalOffRoad = !predicted.onRoad
      && this.outwardSteerHoldSeconds >= 0.18
      && (shortcutIntent || Boolean(alternateRoute && alternateRoute.kind !== "normal"));
    const colliderAhead = this.track.staticColliderAhead(
      this.car.position.x,
      this.car.position.z,
      this.car.heading,
      this.car.boostActive ? 6 : 3,
      1.8,
    );
    const boostSmashIntent = this.car.boostActive
      && colliderAhead?.source === "obstacle"
      && this.track.obstacles.some((obstacle) => obstacle.id === colliderAhead.id && obstacle.kind === "safety-block");
    const edgePressure = roadEdgePressure(
      current.lateralDistance,
      current.roadHalfWidth,
      RALLY_CONFIG.vehicle.bodyWidth / 2,
      predicted.lateralDistance,
    );
    const lateralSide = Math.sign(predicted.lateralDistance || current.lateralDistance);
    const crossTrackVelocity = worldCrossTrackVelocity(
      this.car.velocity.x,
      this.car.velocity.z,
      current.tangentX,
      current.tangentZ,
    );
    const outwardLateral = lateralSide !== 0 && lateralSide * crossTrackVelocity > 0.08;
    const roadRecovery = edgePressure > 0.62 && (outwardLateral || (!predicted.onRoad && outwardInput));
    const output = evaluateRallyRoadAssist({
      playerSteer: hoverMode ? 0 : input.steer,
      throttle: input.throttle,
      lateralDistance: current.lateralDistance,
      roadHalfWidth: current.roadHalfWidth,
      vehicleHalfWidth: RALLY_CONFIG.vehicle.bodyWidth / 2,
      heading: this.car.heading,
      trackHeading: current.heading,
      predictedTrackHeading: predicted.heading,
      speed: Math.abs(this.car.speed),
      forwardVelocity: this.car.forwardVelocity,
      lateralVelocity: this.car.lateralVelocity,
      crossTrackVelocity,
      upcomingTurn,
      targetLane: this.targetLane,
      desiredLateralDistance: this.targetLane * safeLaneHalfWidth(current.roadHalfWidth, RALLY_CONFIG.vehicle.bodyWidth / 2),
      targetHeading: upcomingTurn.targetHeading ?? predicted.heading,
      predictedLateralDistance: predicted.lateralDistance,
      shortcutIntent,
      intentionalOffRoad,
      drifting: this.car.drifting,
      boostActive: this.car.boostActive,
      boostSmashIntent,
      roadRecovery,
      mobileArcade: this.mobileArcadeInput,
      maxSpeed: this.car.definition.maxSpeed,
      mode: this.steeringAssistMode,
    });
    const resolvedOutput = hoverMode && this.steeringAssistMode === "off"
      ? {
        ...output,
        targetLane: requestedLane,
        desiredLateralDistance: requestedLane * safeLaneHalfWidth(current.roadHalfWidth, RALLY_CONFIG.vehicle.bodyWidth / 2),
      }
      : output;
    this.roadAssistState = resolvedOutput;
    this.autoDriftActive = !hoverMode && this.mobileArcadeInput
      && input.brake >= 0.3
      && Math.abs(input.steer) >= 0.25
      && upcomingTurn.strength >= 0.18
      && !roadRecovery;
    const assistRate = this.steeringAssistMode === "strong"
      ? RALLY_STEERING_ASSIST_CONSTANTS.strongMaxStrength * 16
      : RALLY_STEERING_ASSIST_CONSTANTS.normalMaxStrength * 16;
    const maximumChange = assistRate * Math.max(0, delta);
    this.appliedAssistSteer += Math.max(-maximumChange, Math.min(maximumChange, output.assistSteer - this.appliedAssistSteer));
    const preparedInput = hoverMode
      ? {
        ...input,
        steer: 0,
        strafe: requestedLane,
        throttle: Math.max(0, Math.min(1, input.throttle * resolvedOutput.autoThrottleScale)),
        brake: 0,
      }
      : resolvedOutput.assistSteer === 0
      && resolvedOutput.playerSteerScale === 1
      && resolvedOutput.autoThrottleScale === 1
      && resolvedOutput.virtualBrake === 0
      ? input
      : {
        ...input,
        steer: Math.max(-1, Math.min(1, input.steer * resolvedOutput.playerSteerScale + this.appliedAssistSteer)),
        throttle: Math.max(0, Math.min(1, input.throttle * resolvedOutput.autoThrottleScale)),
        brake: Math.max(input.brake, resolvedOutput.virtualBrake),
      };
    return { input: preparedInput, roadAssist: resolvedOutput };
  }

  private isShortcutIntent(playerSteer: number, progress: number): boolean {
    if (Math.abs(playerSteer) < 0.18) return false;
    for (const shortcut of this.track.shortcutZones) {
      const entry = this.track.queryAt(shortcut.entryX, shortcut.entryZ);
      const progressDelta = Math.abs(entry.progress - progress);
      const nearEntry = Math.min(progressDelta, 1 - progressDelta) < 0.075;
      if (!nearEntry) continue;
      const rightX = Math.cos(this.car.heading);
      const rightZ = -Math.sin(this.car.heading);
      const toEntryX = shortcut.entryX - this.car.position.x;
      const toEntryZ = shortcut.entryZ - this.car.position.z;
      const desiredSide = Math.sign(toEntryX * rightX + toEntryZ * rightZ);
      if (desiredSide === 0 || Math.sign(playerSteer) === desiredSide) return true;
    }
    return false;
  }

  private crossedGate(
    previousX: number,
    previousZ: number,
    currentX: number,
    currentZ: number,
    gate: ReturnType<RallyTrack["sampleCheckpoint"]>,
  ): { crossed: boolean; forward: boolean } {
    const previousSide = (previousX - gate.x) * gate.tangentX + (previousZ - gate.z) * gate.tangentZ;
    const currentSide = (currentX - gate.x) * gate.tangentX + (currentZ - gate.z) * gate.tangentZ;
    const crossed = (previousSide < 0 && currentSide >= 0) || (previousSide > 0 && currentSide <= 0);
    if (!crossed) return { crossed: false, forward: false };
    const sideX = -gate.tangentZ;
    const sideZ = gate.tangentX;
    const lateral = (currentX - gate.x) * sideX + (currentZ - gate.z) * sideZ;
    if (Math.abs(lateral) > gate.roadWidth * RALLY_CONFIG.race.gateLateralTolerance) {
      return { crossed: false, forward: false };
    }
    return { crossed: true, forward: previousSide < currentSide };
  }

  private withinGate(x: number, z: number, gate: ReturnType<RallyTrack["sampleCheckpoint"]>): boolean {
    const sideX = -gate.tangentZ;
    const sideZ = gate.tangentX;
    const lateral = (x - gate.x) * sideX + (z - gate.z) * sideZ;
    return Math.abs(lateral) <= gate.roadWidth * RALLY_CONFIG.race.gateLateralTolerance;
  }

  private rememberVehiclePosition(): void {
    this.previousX = this.car.position.x;
    this.previousZ = this.car.position.z;
  }

  stats(renderer: "webgl" | "canvas3d"): RallyStats {
    const ghost = this.phase === "racing" ? this.ghostComparison() : { delta: null, state: "near" as RallyGhostDeltaState };
    return {
      trackId: this.track.id,
      trackName: this.track.name,
      phase: this.phase,
      countdown: this.countdown,
      lapTime: this.lapTime,
      bestLap: this.bestLap,
      speedKph: Math.round(Math.abs(this.car.speed) * 3.6),
      checkpoint: this.nextCheckpoint,
      totalCheckpoints: this.track.checkpoints.length,
      progress: this.progress,
      wrongWay: this.wrongWay,
      missedCheckpoint: this.missedCheckpoint,
      sector: this.sector,
      lastSplit: this.lastSplit,
      medal: this.medal,
      bestDelta: this.bestDelta,
      ghostDelta: ghost.delta,
      ghostState: ghost.state,
      environmentVariant: this.track.environmentVariant,
      telemetry: this.telemetry(),
      mode: "time-attack",
      position: 1,
      positionChange: 0,
      racers: 1,
      bestSplits: this.bestSplits,
      message: this.message,
      grounded: this.car.grounded,
      vehicle: this.car.snapshot(),
      vehicleId: this.car.definition.id,
      renderer,
    };
  }
}

export const RALLY_RACE_CONSTANTS = {
  countdownSeconds: COUNTDOWN_SECONDS,
  simulationStep: 1 / 60,
};

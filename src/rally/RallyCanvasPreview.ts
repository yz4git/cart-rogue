import * as THREE from "three";
import { RallyCar } from "./RallyCar";
import { RallyAudio } from "./RallyAudio";
import { RallyGhostPlayback, RallyGhostRecorder } from "./RallyGhost";
import { RallyChaseCamera } from "./RallyChaseCamera";
import type { RallyDemoHandle } from "./RallyDemo";
import { RallyInput } from "./RallyInput";
import { RallyRace } from "./RallyRace";
import { RallyRaceMode } from "./RallyRaceMode";
import { rallyModeShowsAI } from "./RallyRaceMode";
import { createRallySessionRuntime } from "./RallyRuntime";
import { RallyTrack } from "./RallyTrack";
import type { RallySettings } from "./RallySettings";
import type { RallyMode, RallyStats } from "./RallyTypes";
import type { RallyEnvironmentVariant } from "./RallySurface";
import { getRallyVehicleDefinition } from "./VehicleDefinition";
import type { RallyVehicleId } from "./VehicleDefinition";
import type { AIDriverProfile } from "./ai/AIDriverProfile";
import { rallyThemeCss } from "./RallyVisualTheme";

export class RallyCanvasPreview implements RallyDemoHandle {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly track: RallyTrack;
  private readonly car: RallyCar;
  private readonly race: RallyRace;
  private readonly raceMode: RallyRaceMode;
  private readonly chaseCamera = new RallyChaseCamera();
  private readonly audio = new RallyAudio();
  private readonly ghostPlayback: RallyGhostPlayback;
  private readonly ghostRecorder: RallyGhostRecorder;
  private readonly input: RallyInput;
  private readonly clock = new THREE.Clock();
  private readonly onStats: (stats: RallyStats) => void;
  private frameId = 0;
  private statsTimer = 0;
  private paused = false;
  private mode: RallyMode = "time-attack";
  private graphicsPixelRatio = 1.5;
  private drawDistanceSegments = 54;

  constructor(
    private readonly mount: HTMLElement,
    onStats: (stats: RallyStats) => void,
    trackId = "track-01",
    environmentVariant?: RallyEnvironmentVariant,
  ) {
    this.onStats = onStats;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "rally-canvas rally-canvas-fallback";
    this.canvas.setAttribute("aria-label", "Voxel Rally Canvas 3D fallback");
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.context = context;
    this.mount.appendChild(this.canvas);
    const session = createRallySessionRuntime(trackId, "compact", environmentVariant);
    this.track = session.track;
    this.car = session.car;
    this.race = session.race;
    this.raceMode = session.raceMode;
    this.ghostPlayback = new RallyGhostPlayback(trackId, this.track.environmentVariant, this.car.definition.id);
    this.ghostRecorder = new RallyGhostRecorder(trackId, (run) => {
      this.ghostPlayback.setRun(run);
      this.race.setGhostRun(run);
    }, this.track.environmentVariant, this.car.definition.id);
    this.raceMode.setMode(this.mode);
    this.input = new RallyInput({
      onCameraMove: (deltaX, deltaY) => { this.chaseCamera.drag(deltaX, deltaY); },
    });
    this.input.setMobileStrafeEnabled(true);
    this.input.attach(window, this.canvas);
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("orientationchange", this.resize);
    this.animate();
  }

  startRace(): void { this.audio.activate(); this.ghostRecorder.begin(); if (this.mode !== "time-attack") this.raceMode.start(); else this.race.start(); }
  resetRace(): void { this.audio.activate(); this.ghostRecorder.cancel(); if (this.mode !== "time-attack") this.raceMode.reset(); else this.race.reset(); }
  setGhostEnabled(enabled: boolean): void { this.ghostPlayback.enabled = enabled; this.race.setGhostEnabled(enabled); }
  setRaceMode(mode: RallyMode): void { this.mode = mode; this.raceMode.setMode(mode); if (this.race.phase !== "racing" && this.race.phase !== "countdown") this.race.reset(); }
  setDifficulty(difficulty: AIDriverProfile["id"]): void { this.raceMode.setDifficulty(difficulty); }
  setVehicleClass(id: RallyVehicleId): void { this.car.setDefinition(getRallyVehicleDefinition(id)); this.race.setGhostContext(); this.ghostPlayback.setContext(this.track.id, this.track.environmentVariant, id); this.ghostRecorder.setContext(this.track.environmentVariant, id); if (this.mode !== "time-attack") this.raceMode.reset(); else this.race.reset(); }
  setSettings(settings: RallySettings): void {
    this.input.setSteeringDirection(settings.steeringDirection);
    this.input.setSteeringSensitivity(settings.touchSteeringSensitivity);
    this.race.setSteeringAssistMode(settings.steeringAssist);
    this.chaseCamera.setSensitivity(settings.cameraSensitivity);
    this.chaseCamera.setShakeEnabled(settings.cameraShake);
    this.audio.setSoundEnabled(settings.soundEnabled);
    this.audio.setMusicEnabled(settings.musicEnabled);
    this.graphicsPixelRatio = settings.graphicsQuality === "low" ? 0.9 : settings.graphicsQuality === "high" ? 2 : 1.5;
    this.drawDistanceSegments = settings.graphicsQuality === "low" ? 34 : settings.graphicsQuality === "high" ? 70 : 54;
    this.track.setGraphicsQuality(settings.graphicsQuality);
    this.resize();
  }
  setSteering(value: number | null): void { this.input.setSteering(value); }
  beginRelativeSteering(pointerId: number, originX: number): boolean { return this.input.beginRelativeSteering(pointerId, originX); }
  updateRelativeSteering(pointerId: number, currentX: number): boolean { return this.input.updateRelativeSteering(pointerId, currentX); }
  endRelativeSteering(pointerId: number): boolean { return this.input.endRelativeSteering(pointerId); }
  setThrottle(active: boolean): void { this.input.setThrottle(active); }
  setBrake(active: boolean): void { this.input.setBrake(active); }
  setBoost(active: boolean): void { this.input.setBoost(active); }
  pause(): void { this.paused = true; this.input.clear(); }
  resume(): void { this.paused = false; this.clock.getDelta(); }
  getStats(): RallyStats { return this.mode !== "time-attack" ? this.raceMode.stats("canvas3d") : this.race.stats("canvas3d"); }

  dispose(): void {
    window.cancelAnimationFrame(this.frameId);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("orientationchange", this.resize);
    this.input.detach();
    this.car.dispose();
    this.raceMode.dispose();
    this.track.dispose();
    this.audio.dispose();
    this.canvas.remove();
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, this.graphicsPixelRatio);
    this.canvas.width = Math.floor(width * ratio);
    this.canvas.height = Math.floor(height * ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  private animate = (): void => {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (!this.paused) {
      const input = this.input.snapshot(delta, this.race.mobileDrivingContext());
      this.race.setMobileArcadeInput(this.input.isMobileArcadeActive());
      this.race.setMobileStrafeInput(this.input.isMobileStrafeEnabled() && this.input.isMobileArcadeActive());
      if (this.mode !== "time-attack") this.raceMode.update(input, delta);
      else this.race.update(input, delta);
      this.chaseCamera.update(this.car, delta, this.race.roadHeadingForCamera());
      this.audio.update(this.car, this.race.phase, delta, this.race.nextCheckpoint);
      this.ghostRecorder.update(this.car, this.race.phase, this.race.lapTime, this.race.bestLap, this.race.progress);
      this.draw();
      this.statsTimer += delta;
      if (this.statsTimer >= 0.2) {
        this.onStats(this.mode !== "time-attack" ? this.raceMode.stats("canvas3d") : this.race.stats("canvas3d"));
        this.statsTimer = 0;
      }
    }
    this.frameId = window.requestAnimationFrame(this.animate);
  };

  private draw(): void {
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    const context = this.context;
    const visualTheme = this.track.visualTheme;
    const sky = context.createLinearGradient(0, 0, 0, height * 0.64);
    const skyTop = rallyThemeCss(visualTheme.sky);
    const skyBottom = rallyThemeCss(visualTheme.terrainAlt);
    sky.addColorStop(0, skyTop);
    sky.addColorStop(1, skyBottom);
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);
    context.fillStyle = rallyThemeCss(visualTheme.terrain);
    context.fillRect(0, height * 0.48, width, height * 0.52);
    const speedFactor = Math.max(0, Math.min(1, Math.abs(this.car.speed) / 56));
    if (speedFactor > 0.42) {
      context.save();
      context.strokeStyle = rallyThemeCss(visualTheme.accent);
      context.globalAlpha = Math.min(0.72, (speedFactor - 0.36) * (this.car.boostActive ? 0.5 : 0.22));
      context.lineWidth = 2;
      const lineCount = this.car.boostActive ? 16 : 8;
      for (let index = 0; index < lineCount; index += 1) {
        const side = index % 2 === 0 ? -1 : 1;
        const band = Math.floor(index / 2);
        const y = height * (0.32 + (band % 3) * 0.12);
        const outer = width * (0.08 + (band % 2) * 0.03);
        const startX = side < 0 ? outer : width - outer;
        const endX = side < 0 ? startX + width * (0.02 + speedFactor * 0.04) : startX - width * (0.02 + speedFactor * 0.04);
        context.beginPath();
        context.moveTo(startX, y);
        context.lineTo(endX, y + (band % 2 === 0 ? 2 : -2));
        context.stroke();
      }
      context.restore();
    }
    if (this.car.boostActive) {
      context.save();
      context.globalAlpha = 0.24 + Math.min(0.18, this.car.boostChainCount * 0.03);
      context.strokeStyle = rallyThemeCss(visualTheme.accent);
      context.lineWidth = 3;
      for (let index = 0; index < 3 + Math.min(3, this.car.boostChainCount); index += 1) {
        const offset = 18 + index * 13;
        context.beginPath();
        context.moveTo(width / 2 - offset, height * 0.8 + index * 2);
        context.lineTo(width / 2 - offset - 18 - this.car.boostChainCount * 3, height * 0.8 + index * 2);
        context.stroke();
        context.beginPath();
        context.moveTo(width / 2 + offset, height * 0.8 + index * 2);
        context.lineTo(width / 2 + offset + 18 + this.car.boostChainCount * 3, height * 0.8 + index * 2);
        context.stroke();
      }
      context.restore();
    }

    const cameraDirectionX = this.chaseCamera.target.x - this.chaseCamera.position.x;
    const cameraDirectionZ = this.chaseCamera.target.z - this.chaseCamera.position.z;
    const cameraDirectionLength = Math.hypot(cameraDirectionX, cameraDirectionZ) || 1;
    const forwardX = cameraDirectionX / cameraDirectionLength;
    const forwardZ = cameraDirectionZ / cameraDirectionLength;
    const sideX = forwardZ;
    const sideZ = -forwardX;
    const horizon = height * 0.48;
    const project = (x: number, y: number, z: number): { x: number; y: number; depth: number } => {
      const dx = x - this.car.position.x;
      const dz = z - this.car.position.z;
      const depth = dx * forwardX + dz * forwardZ + 14;
      const lateral = dx * sideX + dz * sideZ;
      const scale = 430 / Math.max(6, depth);
      return {
        x: width / 2 + lateral * scale,
        y: horizon + 190 - (y - this.car.position.y) * scale - 1900 / Math.max(12, depth),
        depth,
      };
    };

    const currentQuery = this.track.queryAt(this.car.position.x, this.car.position.z);
    const visualDepth = this.drawDistanceSegments * 3.2;
    const roadColor = rallyThemeCss(visualTheme.road);
    for (let segment = this.drawDistanceSegments; segment >= -8; segment -= 1) {
      const distance = currentQuery.distance + segment * 2.4;
      const sample = this.track.sampleAtDistance(distance);
      const next = this.track.sampleAtDistance(distance + 2.4);
      const sampleQuery = this.track.queryAt(sample.x, sample.z);
      const point = (routeSample: typeof sample, distanceFromCenter: number, side: number) => project(
        routeSample.x - routeSample.tangentZ * distanceFromCenter * side,
        routeSample.y,
        routeSample.z + routeSample.tangentX * distanceFromCenter * side,
      );
      const drawBand = (innerWidth: number, outerWidth: number, color: string): void => {
        const leftOuter = point(sample, outerWidth, 1);
        const rightOuter = point(sample, outerWidth, -1);
        const nextLeftOuter = point(next, outerWidth, 1);
        const nextRightOuter = point(next, outerWidth, -1);
        context.fillStyle = color;
        context.beginPath();
        context.moveTo(leftOuter.x, leftOuter.y);
        context.lineTo(rightOuter.x, rightOuter.y);
        context.lineTo(nextRightOuter.x, nextRightOuter.y);
        context.lineTo(nextLeftOuter.x, nextLeftOuter.y);
        context.closePath();
        context.fill();
        if (innerWidth > 0) {
          const leftInner = point(sample, innerWidth, 1);
          const rightInner = point(sample, innerWidth, -1);
          const nextLeftInner = point(next, innerWidth, 1);
          const nextRightInner = point(next, innerWidth, -1);
          context.fillStyle = rallyThemeCss(visualTheme.terrain);
          context.beginPath();
          context.moveTo(leftInner.x, leftInner.y);
          context.lineTo(rightInner.x, rightInner.y);
          context.lineTo(nextRightInner.x, nextRightInner.y);
          context.lineTo(nextLeftInner.x, nextLeftInner.y);
          context.closePath();
          context.fill();
        }
      };
      drawBand(sampleQuery.shoulderHalfWidth, sampleQuery.gravelHalfWidth, rallyThemeCss(visualTheme.shoulder));
      drawBand(sampleQuery.roadHalfWidth, sampleQuery.shoulderHalfWidth, rallyThemeCss(visualTheme.roadEdge));
      const roadSurfaceColor = sampleQuery.surface === "road" || sampleQuery.surface === "asphalt"
        ? roadColor
        : sampleQuery.surface === "mud" ? rallyThemeCss(visualTheme.rock) : rallyThemeCss(visualTheme.shoulder);
      drawBand(0, sampleQuery.roadHalfWidth, segment % 2 === 0 ? roadSurfaceColor : rallyThemeCss(visualTheme.road));
      if (segment % 4 === 0) {
        context.fillStyle = rallyThemeCss(visualTheme.accent);
        const lane = project(sample.x, sample.y + 0.04, sample.z);
        context.fillRect(lane.x - 2, lane.y - 2, 4, 4);
      }
    }

    for (const marker of this.track.guidance) {
      const projected = project(marker.x, marker.y + (marker.kind === "corner" ? 1.7 : 0.12), marker.z);
      if (projected.depth < 2 || projected.depth > visualDepth) continue;
      const markerScale = 430 / Math.max(6, projected.depth);
      context.save();
      context.translate(projected.x, projected.y);
      context.rotate(-marker.heading);
      context.strokeStyle = rallyThemeCss(marker.kind === "corner" ? visualTheme.warning : marker.kind === "jump" ? visualTheme.accent : visualTheme.shortcut);
      context.fillStyle = context.strokeStyle;
      context.lineWidth = Math.max(1.5, markerScale * 0.08);
      if (marker.kind === "corner") {
        context.beginPath();
        context.moveTo(-markerScale * 0.75, -markerScale * 0.25);
        context.lineTo(0, 0);
        context.lineTo(-markerScale * 0.75, markerScale * 0.25);
        context.stroke();
      } else if (marker.kind === "jump") {
        context.fillRect(-markerScale * 0.9, -markerScale * 0.08, markerScale * 1.8, markerScale * 0.16);
        context.fillRect(-markerScale * 0.54, -markerScale * 0.38, markerScale * 0.12, markerScale * 0.76);
        context.fillRect(markerScale * 0.42, -markerScale * 0.38, markerScale * 0.12, markerScale * 0.76);
      } else {
        context.fillRect(-markerScale * 0.9, -markerScale * 0.08, markerScale * 1.8, markerScale * 0.16);
        context.font = "700 9px system-ui, sans-serif";
        context.fillText("SHORTCUT", -markerScale * 0.7, -markerScale * 0.24);
      }
      context.restore();
    }

    for (const item of this.track.scenery) {
      if (!item.visible) continue;
      const projected = project(item.x, item.y, item.z);
      if (projected.depth < 2 || projected.depth > visualDepth) continue;
      const scale = 430 / Math.max(6, projected.depth);
      const objectWidth = 3.6 * item.scaleX * scale;
      const objectHeight = item.height * scale;
      context.save();
      context.translate(projected.x, projected.y);
      context.rotate(-item.rotationY);
      context.fillStyle = rallyThemeCss(item.kind === "building"
        ? visualTheme.building
        : item.kind === "rock" ? visualTheme.rock : visualTheme.foliage);
      if (item.kind === "tree") {
        context.beginPath();
        context.moveTo(0, -objectHeight / 2);
        context.lineTo(objectWidth / 2, objectHeight / 2);
        context.lineTo(-objectWidth / 2, objectHeight / 2);
        context.closePath();
        context.fill();
      } else if (item.kind === "rock") {
        context.beginPath();
        context.ellipse(0, objectHeight * 0.18, objectWidth * 0.5, objectHeight * 0.32, 0, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(-objectWidth / 2, -objectHeight / 2, objectWidth, objectHeight);
        context.fillStyle = "rgba(218, 230, 205, .55)";
        const windowSize = Math.max(2, objectWidth * 0.12);
        context.fillRect(-objectWidth * 0.25, -objectHeight * 0.2, windowSize, windowSize);
        context.fillRect(objectWidth * 0.12, -objectHeight * 0.2, windowSize, windowSize);
      }
      context.restore();
    }

    for (const post of this.track.gatePosts) {
      const projected = project(post.x, this.track.groundHeight(post.x, post.z) + 1.9, post.z);
      if (projected.depth < 2 || projected.depth > visualDepth) continue;
      context.fillStyle = rallyThemeCss(post.id.includes("goal") ? visualTheme.goal : post.id.includes("checkpoint") ? visualTheme.checkpoint : visualTheme.start);
      const postScale = 430 / Math.max(6, projected.depth);
      context.fillRect(projected.x - Math.max(2, postScale * 0.33), projected.y - postScale * 1.9, Math.max(4, postScale * 0.66), postScale * 3.8);
    }
    for (const [gateIndex, progress] of [0, ...this.track.checkpoints, 1].entries()) {
      const gate = this.track.sampleAtDistance(this.track.length * progress);
      const projected = project(gate.x, gate.y + 4.25, gate.z);
      if (projected.depth < 2 || projected.depth > visualDepth) continue;
      context.fillStyle = rallyThemeCss(gateIndex === 0 ? visualTheme.start : gateIndex === this.track.checkpoints.length + 1 ? visualTheme.goal : visualTheme.checkpoint);
      context.font = "700 10px system-ui, sans-serif";
      context.fillText(gateIndex === 0 ? "START" : gateIndex === this.track.checkpoints.length + 1 ? "GOAL" : `CHECKPOINT ${gateIndex}`, projected.x - 34, projected.y);
    }

    for (const pickup of this.track.pickups) {
      if (!pickup.active) continue;
      const projected = project(pickup.x, pickup.y, pickup.z);
      if (projected.depth < 2 || projected.depth > visualDepth) continue;
      const pickupScale = Math.max(3, Math.min(14, 430 / Math.max(6, projected.depth) * 0.46));
      context.save();
      context.translate(projected.x, projected.y);
      context.rotate((performance.now() * 0.002 + pickup.progress * 8) % (Math.PI * 2));
      context.fillStyle = rallyThemeCss(visualTheme.accent);
      context.beginPath();
      context.moveTo(0, -pickupScale);
      context.lineTo(pickupScale, 0);
      context.lineTo(0, pickupScale);
      context.lineTo(-pickupScale, 0);
      context.closePath();
      context.fill();
      context.restore();
    }

    for (const obstacle of this.track.obstacles) {
      if (!obstacle.active) continue;
      const projected = project(obstacle.x, this.track.groundHeight(obstacle.x, obstacle.z) + obstacle.radius, obstacle.z);
      if (projected.depth < 2 || projected.depth > 180) continue;
      const safetyBlock = obstacle.kind === "safety-block";
      context.fillStyle = rallyThemeCss(safetyBlock ? visualTheme.shortcut : obstacle.destructible ? visualTheme.warning : visualTheme.rock);
      context.fillRect(projected.x - (safetyBlock ? 8 : 6), projected.y - (safetyBlock ? 14 : 12), safetyBlock ? 16 : 12, safetyBlock ? 14 : 12);
      if (safetyBlock) {
        context.strokeStyle = rallyThemeCss(visualTheme.accent);
        context.lineWidth = 1.5;
        context.strokeRect(projected.x - 8, projected.y - 14, 16, 14);
      }
    }
    for (const shortcut of this.track.shortcutZones) {
      const projected = project(shortcut.entryX, this.track.groundHeight(shortcut.entryX, shortcut.entryZ) + 0.4, shortcut.entryZ);
      if (projected.depth >= 2 && projected.depth <= 180) {
        context.fillStyle = rallyThemeCss(visualTheme.shortcut);
        context.fillRect(projected.x - 9, projected.y - 3, 18, 6);
      }
    }

    const carX = width / 2;
    const carY = height * 0.75;
    if (rallyModeShowsAI(this.mode)) {
      this.raceMode.aiCars.forEach((aiCar, index) => {
        const projected = project(aiCar.position.x, aiCar.position.y, aiCar.position.z);
        if (projected.depth < 2 || projected.depth > 180) return;
        context.save();
        context.globalAlpha = 0.95;
        context.translate(projected.x, projected.y);
        context.rotate(-aiCar.heading + Math.PI / 2);
        context.fillStyle = ["#f2aa4c", "#8ab8ff", "#d98cff"][index] ?? "#f2aa4c";
        context.fillRect(-9, -16, 18, 32);
        context.restore();
      });
    }
    const ghost = this.ghostPlayback.sampleAt(this.race.lapTime);
    if (ghost) {
      const projectedGhost = project(ghost.x, ghost.y, ghost.z);
      context.save();
      context.globalAlpha = 0.3;
      context.translate(projectedGhost.x, projectedGhost.y);
      context.rotate(-ghost.heading + Math.PI / 2);
      context.fillStyle = "#9af4e7";
      context.fillRect(-12, -22, 24, 44);
      context.restore();
    }
    if (this.car.drifting || !this.car.grounded) {
      context.fillStyle = this.track.environmentVariant === "wet" ? "rgba(182, 211, 224, .48)" : "rgba(215, 191, 126, .48)";
      for (let index = 0; index < 4; index += 1) {
        const radius = 4 + index * 3;
        context.beginPath();
        context.arc(carX + (index % 2 === 0 ? -16 : 16), carY + 22 + index * 2, radius, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.save();
    context.translate(carX, carY);
    context.rotate(-this.car.heading + Math.PI / 2);
    context.fillStyle = "#f05b49";
    context.fillRect(-18, -31, 36, 62);
    context.fillStyle = "#7ed9e4";
    context.fillRect(-13, -17, 26, 22);
    context.fillStyle = "#ffd05b";
    context.fillRect(-16, 20, 32, 7);
    context.restore();

    context.fillStyle = "rgba(3, 13, 22, .58)";
    context.fillRect(12, 12, 170, 28);
    context.fillStyle = "#eafcff";
    context.font = "700 12px system-ui, sans-serif";
    context.fillText("CANVAS 3D PREVIEW", 23, 30);
    context.fillText(`PROGRESS ${Math.round(this.race.progress * 100)}%`, 23, 48);
    context.fillText(this.track.environmentVariant.toUpperCase(), 23, 66);
    if (this.car.drifting) context.fillText("DRIFT", 23, 82);
  }
}

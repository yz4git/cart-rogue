import * as THREE from "three";
import { RallyCar } from "./RallyCar";
import { RallyAudio } from "./RallyAudio";
import { RallyChaseCamera } from "./RallyChaseCamera";
import type { RallyDemoHandle } from "./RallyDemo";
import { RallyEffects } from "./RallyEffects";
import { RallyGhostPlayback, RallyGhostRecorder } from "./RallyGhost";
import { RallyGhostVisual } from "./RallyGhostVisual";
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
import { getRallyVisualTheme } from "./RallyVisualTheme";
import { attachRallySpeedLines, RallySpeedLines } from "./RallySpeedLines";

export class RallyWebGLDemo implements RallyDemoHandle {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 260);
  private readonly chaseCamera = new RallyChaseCamera();
  private readonly audio = new RallyAudio();
  private readonly effects = new RallyEffects();
  private readonly speedLines = new RallySpeedLines();
  private readonly ghostPlayback: RallyGhostPlayback;
  private readonly ghostVisual = new RallyGhostVisual();
  private readonly ghostRecorder: RallyGhostRecorder;
  private track: RallyTrack;
  private car: RallyCar;
  private race: RallyRace;
  private raceMode: RallyRaceMode;
  private readonly input: RallyInput;
  private readonly clock = new THREE.Clock();
  private readonly onStats: (stats: RallyStats) => void;
  private frameId = 0;
  private statsTimer = 0;
  private paused = false;
  private mode: RallyMode = "time-attack";

  constructor(
    private readonly mount: HTMLElement,
    onStats: (stats: RallyStats) => void,
    trackId = "track-01",
    environmentVariant?: RallyEnvironmentVariant,
  ) {
    this.onStats = onStats;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.domElement.className = "rally-canvas";
    this.renderer.domElement.setAttribute("aria-label", "Voxel Rally 3D race view");
    this.renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost, { passive: false });
    this.renderer.domElement.addEventListener("webglcontextrestored", this.handleContextRestored);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.mount.appendChild(this.renderer.domElement);

    const visualTheme = getRallyVisualTheme(trackId, environmentVariant ?? "dry");
    const skyColor = visualTheme.sky;
    this.scene.background = new THREE.Color(skyColor);
    this.scene.fog = new THREE.Fog(visualTheme.fog, 70, environmentVariant === "wet" ? 170 : 190);
    this.scene.add(new THREE.HemisphereLight(0xd8fbff, 0x33402a, 2.0));
    const sun = new THREE.DirectionalLight(0xfff1c4, 2.6);
    sun.position.set(-40, 80, 30);
    this.scene.add(sun);
    this.scene.add(this.camera);
    attachRallySpeedLines(this.camera, this.speedLines);

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
    this.scene.add(this.track.group);
    this.scene.add(this.effects.group);
    this.scene.add(this.ghostVisual.group);
    this.scene.add(this.car.group);
    this.raceMode.setMode(this.mode);
    this.raceMode.aiCars.forEach((aiCar) => { aiCar.group.visible = rallyModeShowsAI(this.mode); this.scene.add(aiCar.group); });
    this.input = new RallyInput({ onCameraMove: this.handleCameraMove });
    this.input.setMobileStrafeEnabled(true);
    this.input.attach(window, this.renderer.domElement);

    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("orientationchange", this.resize);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.animate();
  }

  startRace(): void {
    this.audio.activate();
    this.ghostRecorder.begin();
    if (this.mode !== "time-attack") this.raceMode.start();
    else this.race.start();
  }

  resetRace(): void {
    this.audio.activate();
    this.ghostRecorder.cancel();
    if (this.mode !== "time-attack") this.raceMode.reset();
    else this.race.reset();
  }

  setGhostEnabled(enabled: boolean): void {
    this.ghostPlayback.enabled = enabled;
    this.race.setGhostEnabled(enabled);
  }

  setRaceMode(mode: RallyMode): void {
    this.mode = mode;
    this.raceMode.setMode(mode);
    this.raceMode.aiCars.forEach((aiCar) => { aiCar.group.visible = rallyModeShowsAI(mode); });
    if (this.race.phase !== "racing" && this.race.phase !== "countdown") this.race.reset();
  }

  setDifficulty(difficulty: AIDriverProfile["id"]): void {
    this.raceMode.setDifficulty(difficulty);
  }

  setVehicleClass(id: RallyVehicleId): void {
    this.car.setDefinition(getRallyVehicleDefinition(id));
    this.race.setGhostContext();
    this.ghostPlayback.setContext(this.track.id, this.track.environmentVariant, id);
    this.ghostRecorder.setContext(this.track.environmentVariant, id);
    if (this.mode !== "time-attack") this.raceMode.reset();
    else this.race.reset();
  }

  setSettings(settings: RallySettings): void {
    this.input.setSteeringDirection(settings.steeringDirection);
    this.input.setSteeringSensitivity(settings.touchSteeringSensitivity);
    this.race.setSteeringAssistMode(settings.steeringAssist);
    this.chaseCamera.setSensitivity(settings.cameraSensitivity);
    this.chaseCamera.setShakeEnabled(settings.cameraShake);
    this.audio.setSoundEnabled(settings.soundEnabled);
    this.audio.setMusicEnabled(settings.musicEnabled);
    this.effects.setQuality(settings.graphicsQuality);
    this.speedLines.setQuality(settings.graphicsQuality);
    this.track.setGraphicsQuality(settings.graphicsQuality);
    const pixelRatio = settings.graphicsQuality === "low" ? 0.9 : settings.graphicsQuality === "high" ? 2 : 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatio));
    this.resize();
  }

  setSteering(value: number | null): void {
    this.input.setSteering(value);
  }

  beginRelativeSteering(pointerId: number, originX: number): boolean {
    return this.input.beginRelativeSteering(pointerId, originX);
  }

  updateRelativeSteering(pointerId: number, currentX: number): boolean {
    return this.input.updateRelativeSteering(pointerId, currentX);
  }

  endRelativeSteering(pointerId: number): boolean {
    return this.input.endRelativeSteering(pointerId);
  }

  setThrottle(active: boolean): void {
    this.input.setThrottle(active);
  }

  setBrake(active: boolean): void {
    this.input.setBrake(active);
  }

  setBoost(active: boolean): void {
    this.input.setBoost(active);
  }

  pause(): void {
    this.paused = true;
    this.input.clear();
  }

  resume(): void {
    this.paused = false;
    this.clock.getDelta();
  }

  getStats(): RallyStats {
    return this.mode !== "time-attack" ? this.raceMode.stats("webgl") : this.race.stats("webgl");
  }

  dispose(): void {
    window.cancelAnimationFrame(this.frameId);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("orientationchange", this.resize);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.input.detach();
    this.car.dispose();
    this.raceMode.dispose();
    this.track.dispose();
    this.effects.dispose();
    this.speedLines.dispose();
    this.ghostVisual.dispose();
    this.audio.dispose();
    this.renderer.domElement.removeEventListener("webglcontextlost", this.handleContextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly handleCameraMove = (deltaX: number, deltaY: number): void => {
    if (this.paused) return;
    this.chaseCamera.drag(deltaX, deltaY);
  };

  private readonly resize = (): void => {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
  };

  private readonly handleContextRestored = (): void => {
    this.resize();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === "visible") {
      this.clock.getDelta();
      this.resize();
    } else {
      this.input.clear();
    }
  };

  private animate = (): void => {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (!this.paused) {
      const input = this.input.snapshot(delta, this.race.mobileDrivingContext());
      this.race.setMobileArcadeInput(this.input.isMobileArcadeActive());
      this.race.setMobileStrafeInput(this.input.isMobileStrafeEnabled() && this.input.isMobileArcadeActive());
      if (this.mode !== "time-attack") this.raceMode.update(input, delta);
      else this.race.update(input, delta);
      this.ghostRecorder.update(this.car, this.race.phase, this.race.lapTime, this.race.bestLap, this.race.progress);
      this.ghostVisual.update(this.ghostPlayback.sampleAt(this.race.lapTime));
      this.effects.update(this.car, this.race.nextCheckpoint, delta);
      this.audio.update(this.car, this.race.phase, delta, this.race.nextCheckpoint);
      this.updateCamera(delta);
      this.speedLines.update(this.car.speed, this.car.boostActive, this.car.boostChainCount);
      this.renderer.render(this.scene, this.camera);
      this.statsTimer += delta;
      if (this.statsTimer >= 0.2) {
        const info = this.renderer.info;
        this.onStats(this.mode !== "time-attack" ? this.raceMode.stats("webgl") : this.race.stats("webgl"));
        this.statsTimer = 0;
        void info;
      }
    }
    this.frameId = window.requestAnimationFrame(this.animate);
  };

  private updateCamera(delta: number): void {
    this.chaseCamera.update(this.car, delta, this.race.roadHeadingForCamera());
    this.camera.position.copy(this.chaseCamera.position);
    this.camera.fov = this.chaseCamera.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.chaseCamera.target);
  }
}

import * as THREE from "three";
import { RallyCar } from "./RallyCar";
import { RallyAudio } from "./RallyAudio";
import { RallyCanvasPreview } from "./RallyCanvasPreview";
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

export type RallyRuntimeFailureHandler = (message: string, error: unknown) => void;

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
  private runtimeFailureReported = false;
  private disposed = false;
  private webglResourcesDisposed = false;
  private fallback: RallyDemoHandle | null = null;
  private currentSettings: RallySettings | null = null;
  private currentVehicle: RallyVehicleId = "compact";
  private currentDifficulty: AIDriverProfile["id"] = "normal";
  private ghostEnabled = true;

  constructor(
    private readonly mount: HTMLElement,
    onStats: (stats: RallyStats) => void,
    trackId = "track-01",
    environmentVariant?: RallyEnvironmentVariant,
    private readonly onRuntimeFailure?: RallyRuntimeFailureHandler,
  ) {
    this.onStats = onStats;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
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
    if (this.fallback) { this.fallback.startRace(); return; }
    if (this.runtimeFailureReported) return;
    this.audio.activate();
    this.ghostRecorder.begin();
    if (this.mode !== "time-attack") this.raceMode.start();
    else this.race.start();
  }

  resetRace(): void {
    if (this.fallback) { this.fallback.resetRace(); return; }
    if (this.runtimeFailureReported) return;
    this.audio.activate();
    this.ghostRecorder.cancel();
    if (this.mode !== "time-attack") this.raceMode.reset();
    else this.race.reset();
  }

  setGhostEnabled(enabled: boolean): void {
    this.ghostEnabled = enabled;
    if (this.fallback) { this.fallback.setGhostEnabled(enabled); return; }
    this.ghostPlayback.enabled = enabled;
    this.race.setGhostEnabled(enabled);
  }

  setRaceMode(mode: RallyMode): void {
    this.mode = mode;
    if (this.fallback) { this.fallback.setRaceMode(mode); return; }
    this.raceMode.setMode(mode);
    this.raceMode.aiCars.forEach((aiCar) => { aiCar.group.visible = rallyModeShowsAI(mode); });
    if (this.race.phase !== "racing" && this.race.phase !== "countdown") this.race.reset();
  }

  setDifficulty(difficulty: AIDriverProfile["id"]): void {
    this.currentDifficulty = difficulty;
    if (this.fallback) { this.fallback.setDifficulty(difficulty); return; }
    this.raceMode.setDifficulty(difficulty);
  }

  setVehicleClass(id: RallyVehicleId): void {
    this.currentVehicle = id;
    if (this.fallback) { this.fallback.setVehicleClass(id); return; }
    this.car.setDefinition(getRallyVehicleDefinition(id));
    this.race.setGhostContext();
    this.ghostPlayback.setContext(this.track.id, this.track.environmentVariant, id);
    this.ghostRecorder.setContext(this.track.environmentVariant, id);
    if (this.mode !== "time-attack") this.raceMode.reset();
    else this.race.reset();
  }

  setSettings(settings: RallySettings): void {
    this.currentSettings = { ...settings };
    if (this.fallback) { this.fallback.setSettings(settings); return; }
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
    if (this.fallback) { this.fallback.setSteering(value); return; }
    this.input.setSteering(value);
  }

  beginRelativeSteering(pointerId: number, originX: number): boolean {
    if (this.fallback) return this.fallback.beginRelativeSteering(pointerId, originX);
    return !this.runtimeFailureReported && this.input.beginRelativeSteering(pointerId, originX);
  }

  updateRelativeSteering(pointerId: number, currentX: number): boolean {
    if (this.fallback) return this.fallback.updateRelativeSteering(pointerId, currentX);
    return !this.runtimeFailureReported && this.input.updateRelativeSteering(pointerId, currentX);
  }

  endRelativeSteering(pointerId: number): boolean {
    if (this.fallback) return this.fallback.endRelativeSteering(pointerId);
    return this.input.endRelativeSteering(pointerId);
  }

  setThrottle(active: boolean): void {
    if (this.fallback) { this.fallback.setThrottle(active); return; }
    this.input.setThrottle(active);
  }

  setBrake(active: boolean): void {
    if (this.fallback) { this.fallback.setBrake(active); return; }
    this.input.setBrake(active);
  }

  setBoost(active: boolean): void {
    if (this.fallback) { this.fallback.setBoost(active); return; }
    this.input.setBoost(active);
  }

  pause(): void {
    if (this.fallback) { this.fallback.pause(); return; }
    this.paused = true;
    this.input.clear();
  }

  resume(): void {
    if (this.fallback) { this.fallback.resume(); return; }
    if (this.runtimeFailureReported) return;
    this.paused = false;
    this.clock.getDelta();
  }

  getStats(): RallyStats {
    if (this.fallback) return this.fallback.getStats();
    return this.mode !== "time-attack" ? this.raceMode.stats("webgl") : this.race.stats("webgl");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.runtimeFailureReported = true;
    this.paused = true;
    this.fallback?.dispose();
    this.fallback = null;
    this.disposeWebGLResources();
  }

  private disposeWebGLResources(): void {
    if (this.webglResourcesDisposed) return;
    this.webglResourcesDisposed = true;
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

  private handleRuntimeFailure(message: string, error: unknown): void {
    if (this.runtimeFailureReported || this.disposed) return;
    this.runtimeFailureReported = true;
    this.paused = true;
    window.cancelAnimationFrame(this.frameId);
    this.input.clear();
    console.error("[Cart Rogue] WebGL runtime failure", error);
    this.onRuntimeFailure?.(message, error);

    const trackId = this.track.id;
    const environmentVariant = this.track.environmentVariant;
    this.disposeWebGLResources();
    this.mount.replaceChildren();
    try {
      const fallback = new RallyCanvasPreview(this.mount, this.onStats, trackId, environmentVariant);
      fallback.setRaceMode(this.mode);
      fallback.setDifficulty(this.currentDifficulty);
      fallback.setVehicleClass(this.currentVehicle);
      fallback.setGhostEnabled(this.ghostEnabled);
      if (this.currentSettings) fallback.setSettings(this.currentSettings);
      this.fallback = fallback;
      this.onStats(fallback.getStats());
      console.warn("[Cart Rogue] recovered with Canvas 3D fallback");
    } catch (fallbackError) {
      console.error("[Cart Rogue] Canvas 3D recovery failed", fallbackError);
      this.onRuntimeFailure?.("WebGLとCanvas 3Dの両方を開始できませんでした。Safariを再読み込みしてください。", fallbackError);
    }
  }

  private readonly handleCameraMove = (deltaX: number, deltaY: number): void => {
    if (this.paused || this.runtimeFailureReported) return;
    this.chaseCamera.drag(deltaX, deltaY);
  };

  private readonly resize = (): void => {
    if (this.runtimeFailureReported || this.disposed) return;
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.handleRuntimeFailure("WebGLコンテキストが失われました。Canvas 3Dへ切り替えて続行します。", event);
  };

  private readonly handleContextRestored = (): void => {
    if (this.runtimeFailureReported) return;
    this.clock.getDelta();
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
    if (this.runtimeFailureReported || this.disposed) return;
    try {
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
      if (!this.runtimeFailureReported && !this.disposed) {
        this.frameId = window.requestAnimationFrame(this.animate);
      }
    } catch (error) {
      this.handleRuntimeFailure("ゲーム描画中にエラーが発生しました。Canvas 3Dへ切り替えて続行します。", error);
    }
  };

  private updateCamera(delta: number): void {
    this.chaseCamera.update(this.car, delta, this.race.roadHeadingForCamera());
    this.camera.position.copy(this.chaseCamera.position);
    this.camera.fov = this.chaseCamera.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.chaseCamera.target);
  }
}

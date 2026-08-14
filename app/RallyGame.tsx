"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { RallyDemoHandle } from "../src/rally/RallyDemo";
import { RallyCanvasPreview } from "../src/rally/RallyCanvasPreview";
import { RallyWebGLDemo } from "../src/rally/RallyWebGLDemo";
import { createRallyRenderer } from "../src/rally/RallyRenderer";
import { RallyChampionship, loadRallyChampionship, loadRallyChampionshipRun, RALLY_CHAMPIONSHIP_TRACK_ORDER } from "../src/rally/RallyChampionship";
import { listRallyTrackDefinitions } from "../src/rally/RallyTrackCatalog";
import { DEFAULT_RALLY_SETTINGS, loadRallySettings, resetRallySaveData, saveRallySettings, type RallySettings } from "../src/rally/RallySettings";
import type { RallyMode, RallyStats } from "../src/rally/RallyTypes";
import type { RallyVehicleId } from "../src/rally/VehicleDefinition";
import type { AIDriverProfile } from "../src/rally/ai/AIDriverProfile";
import type { RallyEnvironmentVariant } from "../src/rally/RallySurface";
import { RALLY_BUILD_ID } from "../src/rally/RallyBuildInfo";

const INITIAL_STATS: RallyStats = {
  trackId: "track-01",
  trackName: "Forest Circuit",
  phase: "ready",
  countdown: 0,
  lapTime: 0,
  bestLap: null,
  speedKph: 0,
  checkpoint: 0,
  totalCheckpoints: 3,
  progress: 0,
  wrongWay: false,
  missedCheckpoint: false,
  sector: 0,
  lastSplit: null,
  medal: null,
  bestDelta: null,
  ghostDelta: null,
  ghostState: "near",
  environmentVariant: "dry",
  telemetry: { speed: 0, forwardSpeed: 0, lateralSpeed: 0, slipAngle: 0, steer: 0, throttle: 0, brake: 0, grounded: true, surface: "road", drifting: false, driftGrade: "NONE", driftDuration: 0, boostEnergy: 0, boostActive: false, airTime: 0, roadAssistStrength: 0, edgePressure: 0, turnAheadStrength: 0, autoThrottle: 1, autoDrift: false, targetLane: 0, desiredLateralDistance: 0, crossTrackVelocity: 0, roadFollowSteer: 0, laneSteer: 0, headingAssist: 0, brakingDistance: 0, targetCornerSpeed: 0, strafe: 0, lateralTarget: 0, boostCharges: 2, boostTimeRemaining: 0 },
  mode: "time-attack",
  position: 1,
  positionChange: 0,
  racers: 1,
  bestSplits: [],
  message: "STARTを押して出走",
  grounded: true,
  vehicle: { vehicleId: "compact", x: 0, y: 0, z: 0, heading: 0, speed: 0, lateralSpeed: 0, slipAngle: 0, drifting: false, groundedRatio: 1, airborne: false, collisionImpact: 0, bodyDamage: 0, smokeLevel: 0, driftGrade: "NONE", driftScore: 0, driftCount: 0, boostEnergy: 0, boostCharges: 2, maxBoostCharges: 4, boostTimeRemaining: 0, boostActive: false, boostCount: 0, boostChainCount: 0, pickupCount: 0, ramCount: 0, hoverBank: 0, destructionCount: 0, lastDestructionKind: null, rewardMessage: "NONE", landingGrade: "NONE", landingCount: 0, grounded: true },
  vehicleId: "compact",
  renderer: "webgl",
};

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}

function formatGhostDelta(delta: number | null): string {
  if (delta === null) return "—";
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
}

function rallyMessageEventClass(message: string): string {
  if (message === "GO!") return "event-go";
  if (message.startsWith("CHECKPOINT")) return "event-checkpoint";
  if (message.startsWith("GOAL!")) return "event-finish";
  if (/^[123]$/.test(message)) return "event-countdown";
  return "";
}

function championshipTrackForRound(round: number): string {
  return RALLY_CHAMPIONSHIP_TRACK_ORDER[round] ?? RALLY_CHAMPIONSHIP_TRACK_ORDER[0];
}

const TRACK_CARD_COPY: Record<string, { title: string; description: string; accent: string }> = {
  "track-01": { title: "FOREST CIRCUIT", description: "Wide lines · Pickup chain · Smash", accent: "forest" },
  "track-02": { title: "MOUNTAIN PASS", description: "Rock gates · Climb · Descent", accent: "mountain" },
  "track-03": { title: "VOXEL BADLANDS", description: "Routes · Boost chain · Destruction", accent: "badlands" },
};

const VEHICLE_CARD_COPY: Record<RallyVehicleId, { title: string; description: string; accent: string }> = {
  compact: { title: "RALLY COMPACT", description: "Handling · Balanced", accent: "compact" },
  muscle: { title: "RALLY MUSCLE", description: "Speed · Smash power", accent: "muscle" },
  buggy: { title: "RALLY BUGGY", description: "Off-road · Jump control", accent: "buggy" },
};

const ENVIRONMENT_CARD_COPY: Record<"dry" | "wet" | "sunset", { title: string; description: string }> = {
  dry: { title: "DRY", description: "Clear grip" },
  wet: { title: "WET", description: "Loose surface" },
  sunset: { title: "SUNSET", description: "Warm light" },
};

export default function Home() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const steerZoneRef = useRef<HTMLDivElement>(null);
  const steerGuideRef = useRef<HTMLDivElement>(null);
  const steerGuideLineRef = useRef<HTMLSpanElement>(null);
  const steerGuideOriginRef = useRef<HTMLSpanElement>(null);
  const steerGuideCurrentRef = useRef<HTMLSpanElement>(null);
  const steerPointerRef = useRef<number | null>(null);
  const boostPointersRef = useRef(new Set<number>());
  const steerOriginClientRef = useRef({ x: 0, y: 0 });
  const demoRef = useRef<RallyDemoHandle | null>(null);
  const championshipRef = useRef<RallyChampionship | null>(null);
  const finishRecordedRef = useRef(false);
  const [stats, setStats] = useState(INITIAL_STATS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<RallySettings>(() => loadRallySettings());
  const [championshipRun, setChampionshipRun] = useState(() => loadRallyChampionshipRun());
  const [raceMode, setRaceMode] = useState<RallyMode>(() => {
    const run = loadRallyChampionshipRun();
    return run.results.length > 0 && !run.finished ? "championship" : "time-attack";
  });
  const [difficulty, setDifficulty] = useState<AIDriverProfile["id"]>("normal");
  const [vehicleClass, setVehicleClass] = useState<RallyVehicleId>(() => loadRallySettings().selectedVehicle);
  const [trackId, setTrackId] = useState(() => {
    const run = loadRallyChampionshipRun();
    return run.results.length > 0 && !run.finished ? championshipTrackForRound(run.currentRound) : "track-01";
  });
  const [environmentVariant, setEnvironmentVariant] = useState<RallyEnvironmentVariant>("dry");
  const [progression, setProgression] = useState(() => loadRallyChampionship());
  const [previewError, setPreviewError] = useState<string | null>(null);

  if (championshipRef.current === null) championshipRef.current = new RallyChampionship(progression);

  const updateSettings = (patch: Partial<RallySettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveRallySettings(next);
      return next;
    });
  };

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const swUrl = new URL("./sw.js", window.location.href);
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshed = false;
    const onControllerChange = () => {
      if (!hadController || refreshed) return;
      refreshed = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    void navigator.serviceWorker.register(swUrl.pathname, { updateViaCache: "none" }).then((registration) => {
      void registration.update();
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    }).catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  useEffect(() => {
    const mount = viewportRef.current;
    if (!mount) return undefined;
    let demo: RallyDemoHandle;
    try {
      const search = new URLSearchParams(window.location.search);
      const forceCanvas = search.get("test") === "2d"
        || search.get("renderer") === "canvas3d"
        || search.get("preview3d") === "1";
      const webglAvailable = Boolean(document.createElement("canvas").getContext("webgl"));
      demo = createRallyRenderer(
        forceCanvas,
        webglAvailable,
        () => new RallyWebGLDemo(mount, setStats, trackId, environmentVariant),
        () => new RallyCanvasPreview(mount, setStats, trackId, environmentVariant),
        (error) => {
          console.error("[Voxel Rally] WebGL renderer initialization failed; falling back to Canvas 3D", error);
          mount.replaceChildren();
        },
      );
      demoRef.current = demo;
      setStats(demo.getStats());
    } catch (error) {
      console.error("[Voxel Rally] renderer initialization failed", error);
      mount.replaceChildren();
      setPreviewError("3D表示を開始できませんでした。SafariのCanvas対応を確認してください。");
    }
    return () => {
      demoRef.current?.dispose();
      demoRef.current = null;
    };
  }, [trackId, environmentVariant]);

  useEffect(() => {
    if (settingsOpen) demoRef.current?.pause();
    else demoRef.current?.resume();
  }, [settingsOpen]);

  useEffect(() => {
    demoRef.current?.setGhostEnabled(settings.ghostEnabled);
    demoRef.current?.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    demoRef.current?.setRaceMode(raceMode);
  }, [raceMode]);

  useEffect(() => {
    demoRef.current?.setDifficulty(difficulty);
  }, [difficulty]);

  useEffect(() => {
    demoRef.current?.setVehicleClass(vehicleClass);
  }, [vehicleClass]);

  useEffect(() => {
    if (stats.phase === "ready") finishRecordedRef.current = false;
    if (raceMode !== "championship" || stats.phase !== "finished" || finishRecordedRef.current) return;
    const result = championshipRef.current?.recordRound({ trackId: stats.trackId, position: stats.position, medal: stats.medal ?? null });
    if (result) {
      setProgression(result.save);
      setChampionshipRun(result.run);
    }
    finishRecordedRef.current = true;
  }, [raceMode, stats.phase, stats.trackId, stats.position, stats.medal]);

  const updateSteeringGuide = (clientX: number, clientY: number): void => {
    const zone = steerZoneRef.current;
    const guide = steerGuideRef.current;
    const line = steerGuideLineRef.current;
    const origin = steerGuideOriginRef.current;
    const current = steerGuideCurrentRef.current;
    if (!zone || !guide || !line || !origin || !current) return;
    const rect = zone.getBoundingClientRect();
    const startX = steerOriginClientRef.current.x - rect.left;
    const startY = steerOriginClientRef.current.y - rect.top;
    const endX = clientX - rect.left;
    const endY = clientY - rect.top;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const length = Math.hypot(deltaX, deltaY);
    origin.style.left = `${startX}px`;
    origin.style.top = `${startY}px`;
    current.style.left = `${endX}px`;
    current.style.top = `${endY}px`;
    line.style.left = `${startX}px`;
    line.style.top = `${startY}px`;
    line.style.width = `${length}px`;
    line.style.transform = `rotate(${Math.atan2(deltaY, deltaX)}rad)`;
    guide.classList.add("active");
  };

  const hideSteeringGuide = (): void => {
    steerGuideRef.current?.classList.remove("active");
  };

  const updateSteer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (steerPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    demoRef.current?.updateRelativeSteering(event.pointerId, event.clientX);
    updateSteeringGuide(event.clientX, event.clientY);
  };

  const releaseSteer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (steerPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    steerPointerRef.current = null;
    demoRef.current?.endRelativeSteering(event.pointerId);
    hideSteeringGuide();
    if (steerZoneRef.current?.hasPointerCapture(event.pointerId)) {
      steerZoneRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const startSteer = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (steerPointerRef.current !== null) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!demoRef.current?.beginRelativeSteering(event.pointerId, event.clientX)) return;
    steerPointerRef.current = event.pointerId;
    steerOriginClientRef.current = { x: event.clientX, y: event.clientY };
    steerZoneRef.current?.setPointerCapture(event.pointerId);
    updateSteeringGuide(event.clientX, event.clientY);
  };

  const pressBoost = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (stats.vehicle.boostCharges <= 0) return;
    const pointers = boostPointersRef.current;
    if (pointers.size === 0) {
      demoRef.current?.setBoost(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
    }
    pointers.add(event.pointerId);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const releaseBoost = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const pointers = boostPointersRef.current;
    pointers.delete(event.pointerId);
    if (pointers.size === 0) {
      demoRef.current?.setBoost(false);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const beginChampionship = () => {
    const run = championshipRef.current?.startRun();
    if (!run) return;
    finishRecordedRef.current = false;
    setChampionshipRun(run);
    setTrackId(championshipTrackForRound(run.currentRound));
  };

  const selectRaceMode = (mode: RallyMode) => {
    if (mode === "championship") {
      const run = championshipRef.current?.run;
      if (!run || run.finished || run.results.length === 0) beginChampionship();
      else {
        setChampionshipRun(run);
        setTrackId(championshipTrackForRound(run.currentRound));
      }
    }
    setRaceMode(mode);
  };

  const startRace = () => {
    if (raceMode === "championship" && (championshipRun.finished || championshipRun.currentRound >= RALLY_CHAMPIONSHIP_TRACK_ORDER.length)) {
      beginChampionship();
      return;
    }
    if (raceMode === "championship" && championshipRun.results.length === 0) beginChampionship();
    demoRef.current?.startRace();
  };

  const resetRace = () => demoRef.current?.resetRace();

  const advanceChampionship = () => {
    if (championshipRun.finished) {
      beginChampionship();
      return;
    }
    finishRecordedRef.current = false;
    setTrackId(championshipTrackForRound(championshipRun.currentRound));
  };
  const chooseVehicle = (id: RallyVehicleId) => {
    if (!progression.unlockedVehicles.includes(id)) return;
    setVehicleClass(id);
    updateSettings({ selectedVehicle: id });
  };

  return (
    <main className="rally-shell">
      <section className="rally-stage" aria-label="Voxel Rally game">
        <div ref={viewportRef} className="rally-viewport" />
        <p className="rally-brand">VOXEL RALLY <span>ANTI-GRAVITY ARCADE RACING</span></p>

        <div className="rally-hud" aria-live="polite">
          <div className="hud-card hud-speed">
            <span>SPEED</span>
            <strong>{stats.speedKph}<small> KM/H</small></strong>
          </div>
          <div className={`hud-card hud-boost${stats.vehicle.boostActive ? " active" : ""}`}>
            <span>{stats.vehicle.boostActive ? "BOOST ACTIVE" : "BOOST"}</span>
            <strong>×{stats.vehicle.boostCharges}<small>{stats.vehicle.boostActive ? ` ${stats.vehicle.boostTimeRemaining.toFixed(1)}S` : ` / ${stats.vehicle.maxBoostCharges}`}</small></strong>
          </div>
          {stats.vehicle.boostChainCount > 1 && <div className="hud-card hud-chain">
            <span>BOOST CHAIN</span>
            <strong>×{stats.vehicle.boostChainCount}</strong>
          </div>}
          {stats.vehicle.pickupCount > 0 && <div className="hud-card hud-pickups">
            <span>PICKUPS</span>
            <strong>{stats.vehicle.pickupCount}</strong>
          </div>}
          {stats.vehicle.destructionCount > 0 && <div className="hud-card hud-smash">
            <span>SMASH</span>
            <strong>{stats.vehicle.destructionCount}</strong>
          </div>}
          {stats.vehicle.ramCount > 0 && <div className="hud-card hud-ram">
            <span>RAM</span>
            <strong>{stats.vehicle.ramCount}</strong>
          </div>}
          {stats.vehicle.rewardMessage !== "NONE" && <div className="rally-reward" key={`${stats.vehicle.destructionCount}-${stats.vehicle.rewardMessage}`}>
            {stats.vehicle.rewardMessage}
          </div>}
          {stats.vehicle.landingGrade !== "NONE" && <div className="rally-reward rally-landing" key={`${stats.vehicle.landingCount}-${stats.vehicle.landingGrade}`}>
            {stats.vehicle.landingGrade}
          </div>}
          <div className="hud-card hud-lap">
            <span>LAP TIME</span>
            <strong>{formatTime(stats.lapTime)}</strong>
          </div>
          <div className="hud-card hud-checkpoint">
            <span>CHECKPOINT</span>
            <strong>{stats.checkpoint}<small> / {stats.totalCheckpoints}</small></strong>
          </div>
          {stats.lastSplit !== null && <div className="hud-card hud-split">
            <span>LAST SPLIT</span>
            <strong>{formatTime(stats.lastSplit)}</strong>
          </div>}
          <div className="hud-card hud-progress">
            <span>PROGRESS</span>
            <strong>{Math.round(stats.progress * 100)}<small>%</small></strong>
          </div>
          <div className={`hud-card hud-ghost ghost-${stats.ghostState}`}>
            <span>BEST DELTA</span>
            <strong>{formatGhostDelta(stats.ghostDelta)}<small> SEC</small></strong>
          </div>
          {stats.mode !== "time-attack" && <div className={`hud-card hud-position${stats.progress >= 0.75 && stats.phase === "racing" ? " final-sprint" : ""}`}><span>POSITION</span><strong>{stats.position}<small> / {stats.racers}</small></strong></div>}
        </div>
        {stats.mode !== "time-attack" && stats.positionChange !== 0 && <div className={`position-change ${stats.positionChange > 0 ? "gain" : "loss"}`} key={`${stats.position}-${stats.positionChange}`}>
          {stats.positionChange > 0 ? `+${stats.positionChange} POSITION` : `${Math.abs(stats.positionChange)} POSITION LOST`}
        </div>}
        {stats.mode !== "time-attack" && stats.phase === "racing" && stats.progress >= 0.75 && <div className="final-sprint-label">FINAL SPRINT</div>}
        {settings.debugTelemetry && <div className="debug-panel" aria-label="Vehicle telemetry">
          <span>DEBUG · {stats.telemetry.surface.toUpperCase()}</span>
          <small>FWD {stats.telemetry.forwardSpeed.toFixed(1)} · LAT {stats.telemetry.lateralSpeed.toFixed(1)} · SLIP {stats.telemetry.slipAngle.toFixed(2)}</small>
          <small>STEER {stats.telemetry.steer.toFixed(2)} · ASSIST {stats.telemetry.roadAssistStrength.toFixed(2)} · EDGE {stats.telemetry.edgePressure.toFixed(2)}</small>
          <small>TURN {stats.telemetry.turnAheadStrength.toFixed(2)} · THROTTLE {stats.telemetry.autoThrottle.toFixed(2)} · AUTO DRIFT {stats.telemetry.autoDrift ? "ON" : "OFF"}</small>
          <small>LANE {stats.telemetry.targetLane.toFixed(2)} · DESIRED {stats.telemetry.desiredLateralDistance.toFixed(2)} · CROSS {stats.telemetry.crossTrackVelocity.toFixed(2)}</small>
          <small>FOLLOW {stats.telemetry.roadFollowSteer.toFixed(2)} · LANE STEER {stats.telemetry.laneSteer.toFixed(2)} · BRAKE DIST {stats.telemetry.brakingDistance.toFixed(1)}</small>
          <small>AIR {stats.telemetry.airTime.toFixed(2)} · DAMAGE {stats.vehicle.bodyDamage.toFixed(2)}</small>
          <small>BUILD {RALLY_BUILD_ID}</small>
        </div>}

        <div className={`rally-message phase-${stats.phase} ${rallyMessageEventClass(stats.message)}`}>
          <span>{stats.message}</span>
          {stats.phase === "countdown" && <strong>{stats.message}</strong>}
        </div>
        {stats.wrongWay && <div className="wrong-way-warning">WRONG WAY</div>}

        {previewError && <div className="rally-error">{previewError}</div>}

        <div
          ref={steerZoneRef}
          className="steer-zone"
          onPointerDown={startSteer}
          onPointerMove={updateSteer}
          onPointerUp={releaseSteer}
          onPointerCancel={releaseSteer}
          aria-label="Steering control"
          role="slider"
          aria-valuemin={-1}
          aria-valuemax={1}
          aria-valuenow={0}
        >
          <div className="steer-control" aria-hidden="true">SLIDE TO STRAFE</div>
          <div ref={steerGuideRef} className="steer-guide" aria-hidden="true">
            <span ref={steerGuideLineRef} className="steer-guide-line" />
            <span ref={steerGuideOriginRef} className="steer-guide-origin" />
            <span ref={steerGuideCurrentRef} className="steer-guide-current" />
          </div>
        </div>

        <div className="pedal-controls">
          <span className="auto-drive-badge">AUTO ROAD FOLLOW</span>
          <button
            className={`pedal-button boost-button${stats.vehicle.boostActive ? " active" : ""}${stats.vehicle.boostCharges <= 0 ? " empty" : ""}`}
            onPointerDown={pressBoost}
            onPointerUp={releaseBoost}
            onPointerCancel={releaseBoost}
            aria-label={`Boost ${stats.vehicle.boostCharges} charges`}
            aria-disabled={stats.vehicle.boostCharges <= 0}
          >
            <strong>BOOST</strong>
            <small>×{stats.vehicle.boostCharges}</small>
          </button>
        </div>

        {(stats.phase === "ready" || stats.phase === "finished") && (
          <div className="race-panel">
            <span className="race-kicker">VOXEL RALLY · {stats.trackName.toUpperCase()}</span>
            <strong>{stats.phase === "finished" ? "GOAL!" : "READY?"}</strong>
            <p>{stats.phase === "finished" ? `LAP ${formatTime(stats.lapTime)}` : "起伏のある1周コースを走り抜けろ"}</p>
            {stats.phase === "ready" && <>
              <div className="mode-select"><button className={raceMode === "time-attack" ? "selected" : ""} onClick={() => selectRaceMode("time-attack")}>TIME ATTACK</button><button className={raceMode === "race" ? "selected" : ""} onClick={() => selectRaceMode("race")}>RACE</button><button className={raceMode === "championship" ? "selected" : ""} onClick={() => selectRaceMode("championship")}>CHAMPIONSHIP</button></div>
              <div className="selection-group" aria-label="Select rally track">
                <span className="selection-label">TRACK</span>
                <div className="selection-cards track-cards">
                {listRallyTrackDefinitions().map((definition) => {
                  const unlocked = progression.unlockedTracks.includes(definition.id);
                  const card = TRACK_CARD_COPY[definition.id];
                  return <button key={definition.id} disabled={!unlocked || raceMode === "championship"} className={`selection-card track-card ${card?.accent ?? "forest"}${trackId === definition.id ? " selected" : ""}`} onClick={() => setTrackId(definition.id)}><b>{definition.id.replace("track-", "T")} · {card?.title ?? definition.name}</b><small>{card?.description ?? "Arcade rally circuit"}</small>{!unlocked && <em>LOCKED</em>}</button>;
                })}
                </div>
              </div>
              <div className="selection-group" aria-label="Select rally vehicle">
                <span className="selection-label">CAR</span>
                <div className="selection-cards vehicle-cards">
                {(["compact", "muscle", "buggy"] as RallyVehicleId[]).map((id) => (
                  <button key={id} disabled={!progression.unlockedVehicles.includes(id)} className={`selection-card vehicle-card ${VEHICLE_CARD_COPY[id].accent}${vehicleClass === id ? " selected" : ""}`} onClick={() => chooseVehicle(id)}><b>{VEHICLE_CARD_COPY[id].title}</b><small>{VEHICLE_CARD_COPY[id].description}</small>{!progression.unlockedVehicles.includes(id) && <em>LOCKED</em>}</button>
                ))}
                </div>
              </div>
              {raceMode !== "time-attack" && <div className="vehicle-select" aria-label="Select AI difficulty"><span>AI</span>{(["easy", "normal", "hard"] as const).map((level) => <button key={level} className={difficulty === level ? "selected" : ""} onClick={() => setDifficulty(level)}>{level.toUpperCase()}</button>)}</div>}
              <div className="selection-group" aria-label="Select environment">
                <span className="selection-label">ENV</span>
                <div className="selection-cards environment-cards">
                  {(["dry", "wet", "sunset"] as const).map((variant) => <button key={variant} className={`selection-card environment-card ${variant}${environmentVariant === variant ? " selected" : ""}`} onClick={() => setEnvironmentVariant(variant)}><b>{ENVIRONMENT_CARD_COPY[variant].title}</b><small>{ENVIRONMENT_CARD_COPY[variant].description}</small></button>)}
                </div>
              </div>
              {raceMode === "championship" && <small>ROUND {Math.min(championshipRun.currentRound + 1, RALLY_CHAMPIONSHIP_TRACK_ORDER.length)} / {RALLY_CHAMPIONSHIP_TRACK_ORDER.length} · RUN POINTS {championshipRun.points}</small>}
            </>}
            {stats.phase === "finished" && <div className="result-summary" aria-label="Race result">
              <div><span>POSITION</span><b>{stats.mode === "time-attack" ? "TIME ATTACK" : `${stats.position} / ${stats.racers}`}</b></div>
              <div><span>TIME</span><b>{formatTime(stats.lapTime)}</b></div>
              <div><span>BEST</span><b>{formatTime(stats.bestLap ?? stats.lapTime)}</b></div>
              <div><span>LANDING</span><b>{stats.vehicle.landingCount}</b></div>
              <div><span>SMASH</span><b>{stats.vehicle.destructionCount}</b></div>
              <div><span>BOOST</span><b>{stats.vehicle.boostCount}</b></div>
              <div><span>BOOST CHAIN</span><b>×{stats.vehicle.boostChainCount}</b></div>
              <div><span>PICKUPS</span><b>{stats.vehicle.pickupCount}</b></div>
              <div><span>RAM</span><b>{stats.vehicle.ramCount}</b></div>
            </div>}
            {stats.phase === "finished" && raceMode === "championship" && <div className="championship-results" aria-label="Championship results">
              {championshipRun.results.map((result) => <span key={`${result.round}-${result.trackId}`}>R{result.round + 1} {result.trackId.replace("track-", "T")} · {result.position}TH · {result.points}P</span>)}
              {championshipRun.finished && <strong className="race-medal">FINAL RANK {championshipRun.finalRank ?? "—"} · {championshipRun.points} POINTS</strong>}
            </div>}
            {stats.phase === "finished" && raceMode !== "championship" && stats.medal && <strong className="race-medal">{stats.medal}</strong>}
            <button className="start-button" onClick={stats.phase === "finished" ? (raceMode === "championship" ? advanceChampionship : resetRace) : startRace}>
              {stats.phase === "finished" ? (raceMode === "championship" ? (championshipRun.finished ? "RESTART CHAMPIONSHIP" : "NEXT RACE") : "RESTART") : "START"}
            </button>
            {stats.bestLap !== null && <small>BEST {formatTime(stats.bestLap)}</small>}
          </div>
        )}
        {!settings.onboardingSeen && stats.phase === "ready" && <div className="tutorial-card">
          <strong>QUICK START</strong>
          <span><b>STRAFE</b> touch anywhere on the left and slide · <b>BOOST</b> use your right thumb</span>
          <button onClick={() => updateSettings({ onboardingSeen: true })}>GOT IT</button>
        </div>}

        <button className="settings-button" onClick={() => setSettingsOpen(true)} aria-label="Open controls and settings">☰</button>
        <span className="renderer-badge">{stats.renderer === "webgl" ? "WEBGL" : "CANVAS 3D"}</span>
      </section>

      {settingsOpen && (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Voxel Rally controls">
          <div className="settings-panel">
            <div className="settings-head">
              <div><span>HOW TO PLAY</span><h1>Voxel Rally</h1></div>
              <button onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button>
            </div>
            <div className="settings-content">
              <p>前進と道路追従は自動です。左側の好きな場所へ親指を置き、置いた地点から左右へスライドしてコース内を横移動します。</p>
              <p>右親指の<b>BOOST</b>を1回押すとチャージを1つ使って加速します。コース上の発光Pickupを取るとチャージが増えます。</p>
              <p>コース上の黄色いゲートを3つ通過してから、緑のSTART/GOALゲートへ戻ると1周クリアです。</p>
              <p className="settings-note">キーボードでは W / ↑ がアクセル、S / ↓ がブレーキ、A・D / ←・→ がステアリング。3D画面右側のドラッグでカメラを回せます。</p>
              <div className="settings-grid">
                <label className="settings-toggle"><input type="checkbox" checked={settings.soundEnabled} onChange={(event) => updateSettings({ soundEnabled: event.target.checked })} /> SOUND</label>
                <label className="settings-toggle"><input type="checkbox" checked={settings.musicEnabled} onChange={(event) => updateSettings({ musicEnabled: event.target.checked })} /> MUSIC</label>
                <label className="settings-toggle"><input type="checkbox" checked={settings.ghostEnabled} onChange={(event) => updateSettings({ ghostEnabled: event.target.checked })} /> GHOST ON</label>
                <label className="settings-toggle"><input type="checkbox" checked={settings.cameraShake} onChange={(event) => updateSettings({ cameraShake: event.target.checked })} /> CAMERA SHAKE</label>
                <label className="settings-toggle"><input type="checkbox" checked={settings.debugTelemetry} onChange={(event) => updateSettings({ debugTelemetry: event.target.checked })} /> DEBUG TELEMETRY</label>
              </div>
              <label className="settings-range">CAMERA SENSITIVITY <input type="range" min="0.5" max="1.6" step="0.1" value={settings.cameraSensitivity} onChange={(event) => updateSettings({ cameraSensitivity: Number(event.target.value) })} /></label>
              <label className="settings-range">RELATIVE STRAFE <input type="range" min="0.6" max="1.5" step="0.1" value={settings.touchSteeringSensitivity} onChange={(event) => updateSettings({ touchSteeringSensitivity: Number(event.target.value) })} /></label>
              <div className="settings-choice"><span>KEYBOARD STEERING</span><button className={settings.steeringDirection === "inverted" ? "selected" : ""} onClick={() => updateSettings({ steeringDirection: "inverted" })}>INVERTED</button><button className={settings.steeringDirection === "normal" ? "selected" : ""} onClick={() => updateSettings({ steeringDirection: "normal" })}>NORMAL</button></div>
              <div className="settings-choice"><span>ROAD ASSIST <small>Strong: Road Follow + Lane Steering</small></span>{(["normal", "strong", "off"] as const).map((assist) => <button key={assist} className={settings.steeringAssist === assist ? "selected" : ""} onClick={() => updateSettings({ steeringAssist: assist })}>{assist.toUpperCase()}</button>)}</div>
              <div className="settings-choice"><span>GRAPHICS</span>{(["low", "normal", "high"] as const).map((quality) => <button key={quality} className={settings.graphicsQuality === quality ? "selected" : ""} onClick={() => updateSettings({ graphicsQuality: quality })}>{quality.toUpperCase()}</button>)}</div>
              <button className="reset-save" onClick={() => { resetRallySaveData(); championshipRef.current?.reset(); setProgression(championshipRef.current?.save ?? loadRallyChampionship()); setChampionshipRun(championshipRef.current?.run ?? loadRallyChampionshipRun()); setSettings({ ...DEFAULT_RALLY_SETTINGS }); setVehicleClass("compact"); setTrackId("track-01"); setEnvironmentVariant("dry"); setRaceMode("time-attack"); }}>RESET SAVE DATA</button>
            </div>
            <button className="settings-done" onClick={() => setSettingsOpen(false)}>BACK TO RACE</button>
          </div>
        </div>
      )}
    </main>
  );
}

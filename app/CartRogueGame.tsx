"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { loadRallySettings } from "../src/rally/RallySettings";
import type { CartArenaSessionSnapshot } from "../src/cart/CartArenaSession";
import { CartRogueCanvasPreview } from "../src/cart/CartRogueCanvasPreview";
import type { CartRogueDemoHandle } from "../src/cart/CartRogueDemo";
import { CartRogueWebGLDemo } from "../src/cart/CartRogueWebGLDemo";
import styles from "./CartRogueGame.module.css";
import phaseStyles from "./CartRoguePhase3.module.css";
import phase4Styles from "./CartRoguePhase4.module.css";

const INITIAL: CartArenaSessionSnapshot = {
  nodeId: "arena-01",
  nodeKind: "arena",
  encounter: "combat",
  x: 0,
  z: 28,
  heading: 0,
  speed: 0,
  gas: 1,
  boostCharges: 2,
  maxBoostCharges: 4,
  boostActive: false,
  turboRechargeProgress: 0,
  turboRechargeSeconds: 3,
  enemiesAlive: 3,
  enemiesTotal: 3,
  gateLocked: true,
  arena1GateLocked: true,
  arena2GateLocked: true,
  ramCombo: 0,
  lastRamEnemyId: null,
  lastRamDamage: 0,
  lastReward: null,
  wallSliding: false,
  bossHp: 520,
  bossMaxHp: 520,
  runComplete: false,
  enemies: [],
  resources: [],
  obstacles: [],
};

function objective(snapshot: CartArenaSessionSnapshot): string {
  if (snapshot.runComplete) return "RUN CLEAR · BOSS DESTROYED";
  if (snapshot.nodeId === "arena-01" && snapshot.gateLocked) return `TURBO RAM LIGHT TARGETS · ${snapshot.enemiesAlive} LEFT`;
  if (snapshot.nodeId === "arena-01") return "GATE OPEN · ENTER CORRIDOR";
  if (snapshot.nodeId === "corridor-01") return "CORRIDOR · COLLECT CELLS · REACH ELITE";
  if (snapshot.nodeId === "arena-02" && snapshot.gateLocked) return `ELITE ARENA · ${snapshot.enemiesAlive} LEFT`;
  if (snapshot.nodeId === "arena-02") return "ELITE CLEAR · NEXT CORRIDOR OPEN";
  if (snapshot.nodeId === "corridor-02") return "BOSS CORRIDOR · STOCK TURBO";
  if (snapshot.nodeKind === "boss") return `TURBO RAM BOSS · ${Math.ceil(snapshot.bossHp)} HP`;
  return "KEEP MOVING";
}

export default function CartRogueGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<CartRogueDemoHandle | null>(null);
  const steerPointerRef = useRef<number | null>(null);
  const steerOriginRef = useRef(0);
  const boostPointersRef = useRef(new Set<number>());
  const brakePointersRef = useRef(new Set<number>());
  const [snapshot, setSnapshot] = useState(INITIAL);
  const [rendererName, setRendererName] = useState<"WEBGL" | "CANVAS">("WEBGL");
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let demo: CartRogueDemoHandle | null = null;
    let switching = false;

    const startCanvas = (message?: string) => {
      if (switching) return;
      switching = true;
      demo?.dispose();
      mount.replaceChildren();
      demo = new CartRogueCanvasPreview(mount, setSnapshot);
      demoRef.current = demo;
      setSnapshot(demo.getSnapshot());
      setRendererName("CANVAS");
      if (message) setRuntimeMessage(message);
      switching = false;
    };

    try {
      const probe = document.createElement("canvas");
      const hasWebGL = Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
      if (!hasWebGL) {
        startCanvas("WebGLを利用できないためCanvas表示で続行しています。");
      } else {
        demo = new CartRogueWebGLDemo(mount, setSnapshot, (message, error) => {
          console.error("[Cart Rogue] WebGL runtime failure", error);
          startCanvas(message);
        });
        demoRef.current = demo;
        setSnapshot(demo.getSnapshot());
        setRendererName("WEBGL");
      }
    } catch (error) {
      console.error("[Cart Rogue] renderer initialization failed", error);
      startCanvas("3D初期化に失敗したためCanvas表示へ切り替えました。");
    }

    return () => {
      demo?.dispose();
      demoRef.current = null;
    };
  }, []);

  useEffect(() => {
    const keys = new Set<string>();
    const sync = () => {
      const left = keys.has("a") || keys.has("arrowleft");
      const right = keys.has("d") || keys.has("arrowright");
      demoRef.current?.setSteering(left === right ? 0 : left ? -1 : 1);
      demoRef.current?.setBrake(keys.has("s") || keys.has("arrowdown"));
      demoRef.current?.setBoost(keys.has(" ") || keys.has("shift"));
    };
    const down = (event: KeyboardEvent) => {
      keys.add(event.key.toLowerCase());
      if (["ArrowLeft", "ArrowRight", "ArrowDown", " "].includes(event.key)) event.preventDefault();
      sync();
    };
    const up = (event: KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
      sync();
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const startSteer = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (steerPointerRef.current !== null) return;
    steerPointerRef.current = event.pointerId;
    steerOriginRef.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
    demoRef.current?.setSteering(0);
  };

  const moveSteer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (steerPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    demoRef.current?.setSteering(Math.max(-1, Math.min(1, (event.clientX - steerOriginRef.current) / 56)));
  };

  const releaseSteer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (steerPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    steerPointerRef.current = null;
    demoRef.current?.setSteering(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const pressBoost = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const pointers = boostPointersRef.current;
    if (pointers.size === 0) {
      demoRef.current?.setBoost(true);
      const settings = loadRallySettings();
      if (settings.vibrationEnabled && "vibrate" in navigator) navigator.vibrate?.(10);
    }
    pointers.add(event.pointerId);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const releaseBoost = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    boostPointersRef.current.delete(event.pointerId);
    if (boostPointersRef.current.size === 0) demoRef.current?.setBoost(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const pressBrake = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    brakePointersRef.current.add(event.pointerId);
    demoRef.current?.setBrake(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const releaseBrake = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    brakePointersRef.current.delete(event.pointerId);
    if (brakePointersRef.current.size === 0) demoRef.current?.setBrake(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const gasPercent = Math.round(snapshot.gas * 100);
  const enemyDefeated = Math.max(0, snapshot.enemiesTotal - snapshot.enemiesAlive);
  const rechargePercent = Math.round(snapshot.turboRechargeProgress * 100);
  const bossPercent = snapshot.bossMaxHp > 0 ? Math.round(snapshot.bossHp / snapshot.bossMaxHp * 100) : 0;

  return (
    <main className={styles.shell} onContextMenu={(event) => event.preventDefault()}>
      <section className={styles.stage} aria-label="Cart Rogue game">
        <div ref={mountRef} className={styles.viewport} />

        <div className={styles.topHud}>
          <div className={styles.runCard}><small>RUN 01</small><strong>{snapshot.nodeId.toUpperCase()}</strong></div>
          <div className={styles.objective}>{objective(snapshot)}</div>
          <div className={`${styles.enemyCard}${snapshot.nodeKind === "boss" ? ` ${phase4Styles.bossCard}` : ""}`}>
            <small>{snapshot.nodeKind === "boss" ? "BOSS" : "ENEMIES"}</small>
            {snapshot.nodeKind === "boss"
              ? <strong>{bossPercent}<span>%</span></strong>
              : <strong>{enemyDefeated}<span> / {snapshot.enemiesTotal}</span></strong>}
          </div>
        </div>

        {snapshot.nodeKind === "boss" && !snapshot.runComplete && (
          <div className={phase4Styles.bossMeter}>
            <div className={phase4Styles.bossMeterHead}><span>RAM TITAN</span><strong>{Math.ceil(snapshot.bossHp)} / {snapshot.bossMaxHp}</strong></div>
            <div className={phase4Styles.bossMeterTrack}><i style={{ width: `${bossPercent}%` }} /></div>
          </div>
        )}
        {snapshot.runComplete && <div className={phase4Styles.runClear}>RUN CLEAR!</div>}
        {snapshot.ramCombo > 1 && <div className={styles.combo}>RAM COMBO! <strong>×{snapshot.ramCombo}</strong></div>}
        {snapshot.nodeKind !== "boss" && snapshot.enemiesTotal > 0 && !snapshot.gateLocked && <div className={styles.gateOpen}>GATE OPEN!</div>}
        {snapshot.boostActive && <div className={styles.ramBanner}>TURBO RAM</div>}
        {snapshot.wallSliding && <div className={phaseStyles.wallRide}>WALL RIDE</div>}
        {snapshot.lastReward && <div className={phaseStyles.rewardBanner}>{snapshot.lastReward}</div>}

        <div className={styles.bottomHud}>
          <div className={styles.meterCard}>
            <div className={styles.meterHead}><span>GAS</span><strong>{gasPercent}%</strong></div>
            <div className={styles.meterTrack}><i style={{ width: `${gasPercent}%` }} /></div>
          </div>
          <div className={styles.itemStrip}>
            <span>RAM</span><span>ROCKS</span><span>CELLS</span>
          </div>
          <div className={`${styles.meterCard} ${styles.turboCard}`}>
            <div className={styles.meterHead}><span>TURBO</span><strong>×{snapshot.boostCharges}</strong></div>
            <div className={styles.chargeRow}>{Array.from({ length: snapshot.maxBoostCharges }, (_, index) => <i key={index} className={index < snapshot.boostCharges ? styles.chargeOn : ""} />)}</div>
            <div className={phaseStyles.rechargeHead}><span>RECHARGE</span><strong>{snapshot.boostCharges >= snapshot.maxBoostCharges ? "READY" : `${snapshot.turboRechargeSeconds.toFixed(1)}s`}</strong></div>
            <div className={phaseStyles.rechargeTrack}><i style={{ width: `${rechargePercent}%` }} /></div>
          </div>
        </div>

        <div
          className={styles.steerZone}
          role="slider"
          aria-label="Steering"
          aria-valuemin={-1}
          aria-valuemax={1}
          aria-valuenow={0}
          onPointerDown={startSteer}
          onPointerMove={moveSteer}
          onPointerUp={releaseSteer}
          onPointerCancel={releaseSteer}
          onLostPointerCapture={releaseSteer}
        >
          <span>TIGHT STEER · REVERSED</span>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.brakeButton}
            onPointerDown={pressBrake}
            onPointerUp={releaseBrake}
            onPointerCancel={releaseBrake}
            onLostPointerCapture={releaseBrake}
          >BRAKE</button>
          <button
            className={`${styles.boostButton}${snapshot.boostActive ? ` ${styles.active}` : ""}`}
            aria-disabled={snapshot.boostCharges <= 0}
            onPointerDown={pressBoost}
            onPointerUp={releaseBoost}
            onPointerCancel={releaseBoost}
            onLostPointerCapture={releaseBoost}
          >
            <strong>TURBO</strong><small>{snapshot.boostCharges > 0 ? "RAM / SMASH" : "CHARGING"}</small>
          </button>
        </div>

        <span className={styles.rendererBadge}>{rendererName}</span>
        {runtimeMessage && <div className={styles.runtimeMessage}>{runtimeMessage}</div>}
      </section>
    </main>
  );
}

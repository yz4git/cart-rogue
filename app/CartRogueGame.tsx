"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { loadRallySettings } from "../src/rally/RallySettings";
import type { CartArenaSessionSnapshot } from "../src/cart/CartArenaSession";
import { CartRogueCanvasPreview } from "../src/cart/CartRogueCanvasPreview";
import type { CartRogueDemoHandle } from "../src/cart/CartRogueDemo";
import { CartRogueWebGLDemo } from "../src/cart/CartRogueWebGLDemo";
import styles from "./CartRogueGame.module.css";

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
  boostActive: false,
  enemiesAlive: 4,
  enemiesTotal: 4,
  gateLocked: true,
  ramCombo: 0,
  lastRamEnemyId: null,
  enemies: [],
};

function objective(snapshot: CartArenaSessionSnapshot): string {
  if (snapshot.nodeId === "arena-01" && snapshot.gateLocked) return `TURBO RAMで敵を撃破 · 残り ${snapshot.enemiesAlive}`;
  if (snapshot.nodeId === "arena-01") return "GATE OPEN · 北の通路へ進め";
  if (snapshot.nodeId === "corridor-01") return "CORRIDOR · 次の広場へ";
  if (snapshot.nodeId === "arena-02") return "ARENA 02 · ELITE AREA";
  if (snapshot.nodeKind === "boss") return "BOSS ARENA";
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
    demoRef.current?.setSteering(Math.max(-1, Math.min(1, (event.clientX - steerOriginRef.current) / 72)));
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
  const enemyDefeated = snapshot.enemiesTotal - snapshot.enemiesAlive;

  return (
    <main className={styles.shell} onContextMenu={(event) => event.preventDefault()}>
      <section className={styles.stage} aria-label="Cart Rogue game">
        <div ref={mountRef} className={styles.viewport} />

        <div className={styles.topHud}>
          <div className={styles.runCard}><small>RUN 01</small><strong>{snapshot.nodeId.toUpperCase()}</strong></div>
          <div className={styles.objective}>{objective(snapshot)}</div>
          <div className={styles.enemyCard}><small>ENEMIES</small><strong>{enemyDefeated}<span> / {snapshot.enemiesTotal}</span></strong></div>
        </div>

        {snapshot.ramCombo > 1 && <div className={styles.combo}>RAM COMBO! <strong>×{snapshot.ramCombo}</strong></div>}
        {!snapshot.gateLocked && snapshot.nodeId === "arena-01" && <div className={styles.gateOpen}>GATE OPEN!</div>}
        {snapshot.boostActive && <div className={styles.ramBanner}>TURBO RAM</div>}

        <div className={styles.bottomHud}>
          <div className={styles.meterCard}>
            <div className={styles.meterHead}><span>GAS</span><strong>{gasPercent}%</strong></div>
            <div className={styles.meterTrack}><i style={{ width: `${gasPercent}%` }} /></div>
          </div>
          <div className={styles.itemStrip}>
            <span>RAM</span><span>BOOST</span><span>?</span>
          </div>
          <div className={`${styles.meterCard} ${styles.turboCard}`}>
            <div className={styles.meterHead}><span>TURBO</span><strong>×{snapshot.boostCharges}</strong></div>
            <div className={styles.chargeRow}>{[0, 1, 2, 3].map((index) => <i key={index} className={index < snapshot.boostCharges ? styles.chargeOn : ""} />)}</div>
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
          <span>SLIDE TO STEER</span>
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
            <strong>TURBO</strong><small>RAM</small>
          </button>
        </div>

        <span className={styles.rendererBadge}>{rendererName}</span>
        {runtimeMessage && <div className={styles.runtimeMessage}>{runtimeMessage}</div>}
      </section>
    </main>
  );
}

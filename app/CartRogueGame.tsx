"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { loadRallySettings } from "../src/rally/RallySettings";
import type { CartArenaSessionSnapshot } from "../src/cart/CartArenaSession";
import { CartRogueCanvasPreview } from "../src/cart/CartRogueCanvasPreview";
import type { CartRogueDemoHandle } from "../src/cart/CartRogueDemo";
import { CartRogueWebGLDemo } from "../src/cart/CartRogueWebGLDemo";
import {
  applyCartRunUpgrade,
  cartRunUpgradeRank,
  cartScrapReward,
  getAppliedCartRunUpgrades,
  getCartRunModifiers,
  resetCartRunProgression,
  rollCartRunUpgradeChoices,
  type CartRunUpgradeDefinition,
  type CartRunUpgradeState,
} from "../src/cart/CartRunProgression";
import { cartWorldNodeById } from "../src/cart/CartWorldGraph";
import CartRunRouteMap from "./CartRunRouteMap";
import styles from "./CartRogueGame.module.css";
import phaseStyles from "./CartRoguePhase3.module.css";
import phase4Styles from "./CartRoguePhase4.module.css";
import phase8Styles from "./CartRoguePhase8.module.css";

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

interface PerkOffer {
  nodeId: string;
  offerIndex: number;
  rerollIndex: number;
  choices: CartRunUpgradeDefinition[];
}

interface RunResult {
  timeSeconds: number;
  scrap: number;
  bestTimeSeconds: number;
  bestScrap: number;
}

function objective(snapshot: CartArenaSessionSnapshot): string {
  if (snapshot.runComplete) return "RUN CLEAR · BOSS DESTROYED";
  if (snapshot.nodeId === "arena-01" && snapshot.gateLocked) return `TURBO RAM LIGHT TARGETS · ${snapshot.enemiesAlive} LEFT`;
  if (snapshot.nodeId === "arena-01") return "UPGRADE READY · THEN ENTER CORRIDOR";
  if (snapshot.nodeId === "corridor-01") return "CORRIDOR · COLLECT CELLS · REACH ELITE";
  if (snapshot.nodeId === "arena-02" && snapshot.gateLocked) return `ELITE ARENA · ${snapshot.enemiesAlive} LEFT`;
  if (snapshot.nodeId === "arena-02") return "ELITE CLEAR · PICK A ROUTE";
  if (snapshot.nodeId === "corridor-02") return "BOSS APPROACH · STOCK TURBO";
  if (snapshot.nodeKind === "boss") return `TURBO RAM BOSS · ${Math.ceil(snapshot.bossHp)} HP`;

  const node = cartWorldNodeById(snapshot.nodeId);
  if (node?.next.length === 2) return "ROUTE FORK · STEER LEFT OR RIGHT";
  if (node?.routeType === "service") return "FUEL DEPOT · REFILL GAS AND TURBO";
  if (node?.routeType === "scrap") return "SALVAGE YARD · TURBO SMASH FOR SCRAP";
  if (node?.routeType === "event") return "TURBO STORM · CHAIN CELLS AND SMASHES";
  if ((node?.routeType === "combat" || node?.routeType === "elite") && snapshot.gateLocked) {
    return `${node.routeType === "elite" ? "ELITE" : "BRAWL"} · ${snapshot.enemiesAlive} LEFT`;
  }
  if ((node?.routeType === "combat" || node?.routeType === "elite") && !snapshot.gateLocked) return "ROOM CLEAR · BUILD UPGRADE READY";
  return node?.label ?? "KEEP MOVING";
}

function scrapForEnemy(kind: string): number {
  if (kind === "boss") return 30;
  if (kind === "heavy") return 12;
  if (kind === "chaser") return 5;
  return 4;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

function bossPhase(snapshot: CartArenaSessionSnapshot): 1 | 2 | 3 {
  if (snapshot.bossMaxHp <= 0) return 1;
  const ratio = snapshot.bossHp / snapshot.bossMaxHp;
  if (ratio > 0.66) return 1;
  if (ratio > 0.33) return 2;
  return 3;
}

function updateRunRecords(timeSeconds: number, scrap: number): RunResult {
  let bestTimeSeconds = timeSeconds;
  let bestScrap = scrap;
  try {
    const storedTime = Number(localStorage.getItem("cart-rogue-best-time"));
    const storedScrap = Number(localStorage.getItem("cart-rogue-best-scrap"));
    if (Number.isFinite(storedTime) && storedTime > 0) bestTimeSeconds = Math.min(storedTime, timeSeconds);
    if (Number.isFinite(storedScrap) && storedScrap >= 0) bestScrap = Math.max(storedScrap, scrap);
    localStorage.setItem("cart-rogue-best-time", String(bestTimeSeconds));
    localStorage.setItem("cart-rogue-best-scrap", String(bestScrap));
  } catch {
    // Private browsing/storage denial should never block the result screen.
  }
  return { timeSeconds, scrap, bestTimeSeconds, bestScrap };
}

export default function CartRogueGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<CartRogueDemoHandle | null>(null);
  const steerPointerRef = useRef<number | null>(null);
  const steerOriginRef = useRef(0);
  const boostPointersRef = useRef(new Set<number>());
  const brakePointersRef = useRef(new Set<number>());
  const previousSnapshotRef = useRef<CartArenaSessionSnapshot>(INITIAL);
  const offeredRoomsRef = useRef(new Set<string>());
  const offerCounterRef = useRef(0);
  const runSeedRef = useRef(1);
  const scrapRef = useRef(0);
  const runStartRef = useRef(0);
  const resultShownRef = useRef(false);
  const [snapshot, setSnapshot] = useState(INITIAL);
  const [rendererName, setRendererName] = useState<"WEBGL" | "CANVAS">("WEBGL");
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null);
  const [runSerial, setRunSerial] = useState(0);
  const [scrap, setScrap] = useState(0);
  const [upgrades, setUpgrades] = useState<CartRunUpgradeState[]>([]);
  const [perkOffer, setPerkOffer] = useState<PerkOffer | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let demo: CartRogueDemoHandle | null = null;
    let switching = false;

    runSeedRef.current = ((Date.now() & 0x7fffffff) ^ ((runSerial + 1) * 0x45d9f3b)) | 0;
    resetCartRunProgression(runSeedRef.current);
    previousSnapshotRef.current = INITIAL;
    offeredRoomsRef.current.clear();
    offerCounterRef.current = 0;
    scrapRef.current = 0;
    resultShownRef.current = false;
    runStartRef.current = performance.now();

    const handleSnapshot = (next: CartArenaSessionSnapshot) => {
      const previous = previousSnapshotRef.current;
      let earned = 0;
      for (const enemy of next.enemies) {
        const before = previous.enemies.find((candidate) => candidate.id === enemy.id);
        if (before?.alive && !enemy.alive) earned += scrapForEnemy(enemy.kind);
      }
      for (const obstacle of next.obstacles) {
        const before = previous.obstacles.find((candidate) => candidate.id === obstacle.id);
        if (before && !before.destroyed && obstacle.destroyed) earned += 2;
      }
      if (earned > 0) {
        scrapRef.current += cartScrapReward(earned);
        setScrap(scrapRef.current);
      }

      const clearedArena = next.nodeKind === "arena"
        && next.enemiesTotal > 0
        && next.enemiesAlive === 0
        && !offeredRoomsRef.current.has(next.nodeId);
      if (clearedArena) {
        offeredRoomsRef.current.add(next.nodeId);
        const offerIndex = offerCounterRef.current;
        offerCounterRef.current += 1;
        demoRef.current?.pause();
        setPerkOffer({
          nodeId: next.nodeId,
          offerIndex,
          rerollIndex: 0,
          choices: rollCartRunUpgradeChoices(runSeedRef.current, offerIndex, 0),
        });
      }

      if (next.runComplete && !previous.runComplete && !resultShownRef.current) {
        resultShownRef.current = true;
        demoRef.current?.pause();
        const timeSeconds = Math.max(0, (performance.now() - runStartRef.current) / 1000);
        setResult(updateRunRecords(timeSeconds, scrapRef.current));
      }

      previousSnapshotRef.current = next;
      setSnapshot(next);
    };

    const startCanvas = (message?: string) => {
      if (switching) return;
      switching = true;
      demo?.dispose();
      mount.replaceChildren();
      demo = new CartRogueCanvasPreview(mount, handleSnapshot);
      demoRef.current = demo;
      queueMicrotask(() => {
        setRendererName("CANVAS");
        if (message) setRuntimeMessage(message);
      });
      switching = false;
    };

    try {
      const probe = document.createElement("canvas");
      const hasWebGL = Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
      if (!hasWebGL) {
        startCanvas("WebGLを利用できないためCanvas表示で続行しています。");
      } else {
        demo = new CartRogueWebGLDemo(mount, handleSnapshot, (message, error) => {
          console.error("[Cart Rogue] WebGL runtime failure", error);
          startCanvas(message);
        });
        demoRef.current = demo;
      }
    } catch (error) {
      console.error("[Cart Rogue] renderer initialization failed", error);
      startCanvas("3D初期化に失敗したためCanvas表示へ切り替えました。");
    }

    return () => {
      demo?.dispose();
      demoRef.current = null;
    };
  }, [runSerial]);

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
    const steeringSensitivity = getCartRunModifiers().steeringSensitivity;
    demoRef.current?.setSteering(Math.max(-1, Math.min(1, ((event.clientX - steerOriginRef.current) / 44) * steeringSensitivity)));
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
      if (settings.vibrationEnabled && "vibrate" in navigator) navigator.vibrate?.(12);
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

  const choosePerk = (upgrade: CartRunUpgradeDefinition) => {
    applyCartRunUpgrade(upgrade.id);
    setUpgrades(getAppliedCartRunUpgrades());
    setPerkOffer(null);
    demoRef.current?.resume();
  };

  const rerollPerks = () => {
    if (!perkOffer) return;
    const cost = 8 + perkOffer.rerollIndex * 4;
    if (scrapRef.current < cost) return;
    scrapRef.current -= cost;
    setScrap(scrapRef.current);
    const rerollIndex = perkOffer.rerollIndex + 1;
    setPerkOffer({
      ...perkOffer,
      rerollIndex,
      choices: rollCartRunUpgradeChoices(runSeedRef.current, perkOffer.offerIndex, rerollIndex),
    });
  };

  const startNewRun = () => {
    setSnapshot(INITIAL);
    setRendererName("WEBGL");
    setRuntimeMessage(null);
    setScrap(0);
    setUpgrades([]);
    setPerkOffer(null);
    setResult(null);
    setRunSerial((value) => value + 1);
  };

  const gasPercent = Math.round(snapshot.gas * 100);
  const enemyDefeated = Math.max(0, snapshot.enemiesTotal - snapshot.enemiesAlive);
  const rechargePercent = Math.round(snapshot.turboRechargeProgress * 100);
  const bossPercent = snapshot.bossMaxHp > 0 ? Math.round(snapshot.bossHp / snapshot.bossMaxHp * 100) : 0;
  const totalPerkRanks = upgrades.reduce((total, upgrade) => total + upgrade.rank, 0);
  const currentBossPhase = bossPhase(snapshot);
  const rerollCost = perkOffer ? 8 + perkOffer.rerollIndex * 4 : 0;

  return (
    <main className={styles.shell} onContextMenu={(event) => event.preventDefault()}>
      <section className={styles.stage} aria-label="Cart Rogue game">
        <div ref={mountRef} className={styles.viewport} />

        <div className={styles.topHud}>
          <div className={styles.runCard}><small>RUN {String(runSerial + 1).padStart(2, "0")} · SCRAP {scrap}</small><strong>{snapshot.nodeId.toUpperCase()}</strong></div>
          <div className={styles.objective}>{objective(snapshot)}</div>
          <div className={`${styles.enemyCard}${snapshot.nodeKind === "boss" ? ` ${phase4Styles.bossCard}` : ""}`}>
            <small>{snapshot.nodeKind === "boss" ? "BOSS" : "ENEMIES"}</small>
            {snapshot.nodeKind === "boss"
              ? <strong>{bossPercent}<span>%</span></strong>
              : <strong>{enemyDefeated}<span> / {snapshot.enemiesTotal}</span></strong>}
          </div>
        </div>

        {!perkOffer && !result && <CartRunRouteMap nodeId={snapshot.nodeId} gateLocked={snapshot.gateLocked} />}

        {upgrades.length > 0 && (
          <div className={phase8Styles.upgradeStrip}>
            {upgrades.slice(0, 6).map((upgrade) => <span key={upgrade.id} className={phase8Styles.upgradeChip}>{upgrade.shortName} {upgrade.rank > 1 ? `×${upgrade.rank}` : ""}</span>)}
          </div>
        )}

        {snapshot.nodeKind === "boss" && !snapshot.runComplete && (
          <>
            <div className={phase4Styles.bossMeter}>
              <div className={phase4Styles.bossMeterHead}><span>RAM TITAN</span><strong>{Math.ceil(snapshot.bossHp)} / {snapshot.bossMaxHp}</strong></div>
              <div className={phase4Styles.bossMeterTrack}><i style={{ width: `${bossPercent}%` }} /></div>
            </div>
            <div className={phase8Styles.bossPhase}>TITAN PHASE {currentBossPhase} · {currentBossPhase === 1 ? "HUNT" : currentBossPhase === 2 ? "CHARGE" : "ENRAGED"}</div>
          </>
        )}
        {snapshot.runComplete && !result && <div className={phase4Styles.runClear}>RUN CLEAR!</div>}
        {snapshot.ramCombo > 1 && <div className={styles.combo}>FLOW COMBO! <strong>×{snapshot.ramCombo}</strong></div>}
        {snapshot.nodeKind !== "boss" && snapshot.enemiesTotal > 0 && !snapshot.gateLocked && !perkOffer && <div className={styles.gateOpen}>GATE OPEN!</div>}
        {snapshot.boostActive && <div className={styles.ramBanner}>TURBO RAM</div>}
        {snapshot.wallSliding && <div className={phaseStyles.wallRide}>WALL RIDE</div>}
        {snapshot.lastReward && !perkOffer && <div className={phaseStyles.rewardBanner}>{snapshot.lastReward}</div>}

        <div className={styles.bottomHud}>
          <div className={styles.meterCard}>
            <div className={styles.meterHead}><span>GAS</span><strong>{gasPercent}%</strong></div>
            <div className={styles.meterTrack}><i style={{ width: `${gasPercent}%` }} /></div>
          </div>
          <div className={styles.itemStrip}>
            <span>RAM</span><span>P{totalPerkRanks}</span><span>SCR{scrap}</span>
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
          <span>ARCADE TURN · BUILD ×{getCartRunModifiers().steeringSensitivity.toFixed(2)}</span>
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

        {perkOffer && (
          <div className={phase8Styles.perkOverlay} role="dialog" aria-modal="true" aria-label="Choose an upgrade">
            <div className={phase8Styles.perkPanel}>
              <div className={phase8Styles.perkHead}>
                <div><small>{perkOffer.nodeId.toUpperCase()} CLEAR</small><h2>CHOOSE YOUR BUILD</h2></div>
                <div className={phase8Styles.perkWallet}>SCRAP {scrap}</div>
              </div>
              <div className={phase8Styles.perkGrid}>
                {perkOffer.choices.map((upgrade) => {
                  const nextRank = Math.min(upgrade.maxRank, cartRunUpgradeRank(upgrade.id) + 1);
                  return (
                    <button key={upgrade.id} className={phase8Styles.perkButton} onClick={() => choosePerk(upgrade)}>
                      <span className={`${phase8Styles.perkTopline}${upgrade.rarity === "RARE" ? ` ${phase8Styles.perkRare}` : upgrade.rarity === "EPIC" ? ` ${phase8Styles.perkEpic}` : ""}`}>
                        <span>{upgrade.rarity}</span><span>RANK {nextRank}/{upgrade.maxRank}</span>
                      </span>
                      <strong>{upgrade.name}</strong>
                      <p>{upgrade.description}</p>
                    </button>
                  );
                })}
              </div>
              <div className={phase8Styles.perkFooter}>
                <span>Perks stack for this run only. Build for RAM, control, demolition, mobility hunting, or boss damage.</span>
                <button className={phase8Styles.rerollButton} disabled={scrap < rerollCost} onClick={rerollPerks}>REROLL · {rerollCost} SCRAP</button>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className={phase8Styles.resultOverlay} role="dialog" aria-modal="true" aria-label="Run result">
            <div className={phase8Styles.resultPanel}>
              <div className={phase8Styles.resultHead}><div><small>RAM TITAN DESTROYED</small><h2>RUN CLEAR</h2></div></div>
              <div className={phase8Styles.resultStats}>
                <div className={phase8Styles.resultStat}><small>TIME</small><strong>{formatTime(result.timeSeconds)}</strong></div>
                <div className={phase8Styles.resultStat}><small>SCRAP</small><strong>{result.scrap}</strong></div>
                <div className={phase8Styles.resultStat}><small>PERKS</small><strong>{totalPerkRanks}</strong></div>
              </div>
              <div className={phase8Styles.resultPerks}>
                BEST {formatTime(result.bestTimeSeconds)} · BEST SCRAP {result.bestScrap}<br />
                {upgrades.length > 0 ? upgrades.map((upgrade) => `${upgrade.shortName}×${upgrade.rank}`).join(" · ") : "NO PERKS"}
              </div>
              <button className={phase8Styles.newRunButton} onClick={startNewRun}>NEW RUN</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

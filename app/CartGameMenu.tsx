"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CART_HARD_MODE_SNAPSHOT_EVENT,
  type CartHardModeSnapshot,
  type CartRunDifficulty,
} from "../src/cart/CartRunDifficulty";
import {
  CART_ROGUE_CAMERA_DISTANCE_MAX,
  CART_ROGUE_CAMERA_DISTANCE_MIN,
  CART_ROGUE_CAMERA_DISTANCE_STEP,
  DEFAULT_CART_ROGUE_CONFIG,
  loadCartRogueConfig,
  saveCartRogueConfig,
} from "../src/cart/CartRogueConfig";
import { loadRallySettings, saveRallySettings } from "../src/rally/RallySettings";
import styles from "./CartGameMenu.module.css";
import configStyles from "./CartGameMenuConfig.module.css";

const MENU_PAUSE_EVENT = "cart-rogue-menu-pause";
const MENU_RESUME_EVENT = "cart-rogue-menu-resume";

type PausePage = "menu" | "config";

interface CartGameMenuProps {
  started: boolean;
  onStart: (difficulty: CartRunDifficulty) => void;
  onReturnTitle: () => void;
}

function hasBlockingGameOverlay(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"], [class*="runClear"]'));
}

export default function CartGameMenu({ started, onStart, onReturnTitle }: CartGameMenuProps) {
  const [paused, setPaused] = useState(false);
  const [pausePage, setPausePage] = useState<PausePage>("menu");
  const [difficulty, setDifficulty] = useState<CartRunDifficulty>("normal");
  const [hardSnapshot, setHardSnapshot] = useState<CartHardModeSnapshot | null>(null);
  const [cameraDistance, setCameraDistance] = useState(DEFAULT_CART_ROGUE_CONFIG.cameraDistance);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const gameOver = Boolean(hardSnapshot?.gameOver);

  const pauseGame = useCallback(() => {
    if (!started || paused || gameOver || hasBlockingGameOverlay()) return;
    window.dispatchEvent(new Event(MENU_PAUSE_EVENT));
    setPausePage("menu");
    setPaused(true);
  }, [gameOver, paused, started]);

  const resumeGame = useCallback(() => {
    if (!started || !paused || gameOver) return;
    window.dispatchEvent(new Event(MENU_RESUME_EVENT));
    setPausePage("menu");
    setPaused(false);
  }, [gameOver, paused, started]);

  const startGame = (nextDifficulty = difficulty) => {
    setPaused(false);
    setPausePage("menu");
    setHardSnapshot(null);
    onStart(nextDifficulty);
  };

  const returnTitle = () => {
    setPaused(false);
    setPausePage("menu");
    setHardSnapshot(null);
    onReturnTitle();
  };

  const openConfig = () => {
    const config = loadCartRogueConfig();
    const rallySettings = loadRallySettings();
    setCameraDistance(config.cameraDistance);
    setVibrationEnabled(rallySettings.vibrationEnabled);
    setPausePage("config");
  };

  const updateCameraDistance = (value: number) => {
    const next = saveCartRogueConfig({ cameraDistance: value });
    setCameraDistance(next.cameraDistance);
  };

  const toggleVibration = () => {
    const nextEnabled = !vibrationEnabled;
    const current = loadRallySettings();
    setVibrationEnabled(nextEnabled);
    saveRallySettings({ ...current, vibrationEnabled: nextEnabled });
  };

  const resetConfig = () => {
    const next = saveCartRogueConfig(DEFAULT_CART_ROGUE_CONFIG);
    const current = loadRallySettings();
    setCameraDistance(next.cameraDistance);
    setVibrationEnabled(true);
    saveRallySettings({ ...current, vibrationEnabled: true });
  };

  useEffect(() => {
    const onHardSnapshot = (event: Event) => {
      const detail = (event as CustomEvent<CartHardModeSnapshot>).detail;
      if (detail) setHardSnapshot(detail);
    };
    window.addEventListener(CART_HARD_MODE_SNAPSHOT_EVENT, onHardSnapshot);
    return () => window.removeEventListener(CART_HARD_MODE_SNAPSHOT_EVENT, onHardSnapshot);
  }, []);

  useEffect(() => {
    if (!started) return undefined;
    const timer = window.setTimeout(() => {
      // CartRogueGame's keyboard sync calls all three control setters. The
      // harmless key-up makes both WebGL and Canvas fallback bind menu events
      // before the player can hit PAUSE or GAS life can end the run.
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "CartMenuBind" }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [started]);

  useEffect(() => {
    if (!started) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || gameOver) return;
      event.preventDefault();
      if (!paused) pauseGame();
      else if (pausePage === "config") setPausePage("menu");
      else resumeGame();
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [gameOver, pauseGame, pausePage, paused, resumeGame, started]);

  useEffect(() => {
    if (!started) return undefined;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" || gameOver || hasBlockingGameOverlay()) return;
      window.dispatchEvent(new Event(MENU_PAUSE_EVENT));
      setPausePage("menu");
      setPaused(true);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [gameOver, started]);

  if (!started) {
    const hard = difficulty === "hard";
    return (
      <div className={styles.titleScreen} role="dialog" aria-modal="true" aria-label="Cart Rogue title screen">
        <div className={styles.titleGlow} aria-hidden="true" />
        <div className={styles.titlePanel}>
          <div className={styles.eyebrow}>HIGH SPEED RAID ACTION</div>
          <h1><span>CART</span> ROGUE</h1>
          <div className={styles.mode}>TURBO HUNT</div>
          <p>HUNT THE RAID. BREAK THE LINE. KEEP MOVING.</p>
          <div className={styles.difficultySelect} aria-label="Select difficulty">
            <button
              className={`${styles.difficultyButton} ${!hard ? styles.difficultyButtonActive : ""}`}
              onClick={() => setDifficulty("normal")}
              aria-pressed={!hard}
            >
              <strong>NORMAL</strong>
              <small>STANDARD HUNT</small>
            </button>
            <button
              className={`${styles.difficultyButton} ${styles.difficultyButtonHard} ${hard ? styles.difficultyButtonHardActive : ""}`}
              onClick={() => setDifficulty("hard")}
              aria-pressed={hard}
            >
              <strong>HARD</strong>
              <small>EXPERT RAID</small>
            </button>
          </div>
          <div className={styles.hardWarning}>
            GAS = LIFE · RECOVERY CELLS RESTORE GAS · ZERO GAS = GAME OVER{hard ? " · HARD RAID HITS DEAL HEAVY LIFE DAMAGE" : ""}
          </div>
          <button className={`${styles.startButton} ${hard ? styles.startButtonHard : ""}`} onClick={() => startGame()}>
            <strong>{hard ? "START HARD RUN" : "START RUN"}</strong>
            <small>{hard ? "SURVIVE THE RAID" : "TAP TO IGNITE"}</small>
          </button>
          <div className={styles.titleControls}>
            <span>DRAG LEFT · STEER</span>
            <span>HOLD TURBO · CHARGE / RELEASE · DASH</span>
            <span>BRAKE · CUT BACK</span>
          </div>
        </div>
        <div className={styles.titleFooter}>ONE MAP · TURBO RAM · ADAPTIVE RAID</div>
      </div>
    );
  }

  if (gameOver && hardSnapshot) {
    const failedDifficulty = hardSnapshot.difficulty;
    const hard = failedDifficulty === "hard";
    return (
      <div className={styles.gameOverOverlay} role="dialog" aria-modal="true" aria-label="Game over">
        <div className={styles.gameOverPanel}>
          <div className={styles.gameOverEyebrow}>{hard ? "HARD MODE" : "TURBO HUNT"} · RUN FAILED</div>
          <h2>GAME OVER</h2>
          <strong className={styles.gameOverReason}>GAS EMPTY · LIFE LOST</strong>
          <div className={styles.gameOverStats}>
            <span>GAS / LIFE {hardSnapshot.gasLifePercent}%</span>
            <span>RAID HITS {hardSnapshot.raidHits}</span>
            <span>PERFECT DODGES {hardSnapshot.perfectDodges}</span>
          </div>
          <button className={styles.retryButton} onClick={() => startGame(failedDifficulty)}>
            <strong>{hard ? "RETRY HARD" : "RETRY RUN"}</strong>
            <small>RUN IT BACK</small>
          </button>
          <button className={styles.titleButton} onClick={returnTitle}>BACK TO TITLE</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {!paused && (
        <button className={styles.pauseButton} onClick={pauseGame} aria-label="Pause game">
          <i /><i />
        </button>
      )}
      {paused && pausePage === "menu" && (
        <div className={styles.pauseOverlay} role="dialog" aria-modal="true" aria-label="Game paused">
          <div className={styles.pausePanel}>
            <div className={styles.pauseEyebrow}>RUN SUSPENDED</div>
            <h2>PAUSED</h2>
            <p>Steering, brake and Turbo input are released while paused.</p>
            <div className={configStyles.menuActions}>
              <button className={styles.resumeButton} onClick={resumeGame}>
                <strong>RESUME</strong>
                <small>BACK TO THE HUNT</small>
              </button>
              <button className={configStyles.secondaryButton} onClick={openConfig}>
                <strong>CONFIG</strong>
                <small>CAMERA / VIBRATION</small>
              </button>
              <button className={configStyles.dangerButton} onClick={returnTitle}>
                <strong>BACK TO TITLE</strong>
                <small>END CURRENT RUN</small>
              </button>
            </div>
            <div className={styles.pauseHint}>ESC · PAUSE / RESUME</div>
          </div>
        </div>
      )}
      {paused && pausePage === "config" && (
        <div className={styles.pauseOverlay} role="dialog" aria-modal="true" aria-label="Configuration">
          <div className={`${styles.pausePanel} ${configStyles.configPanel}`}>
            <div className={styles.pauseEyebrow}>RUN CONFIGURATION</div>
            <h2>CONFIG</h2>
            <p className={configStyles.configIntro}>Changes apply immediately and are saved on this device.</p>
            <div className={configStyles.configRows}>
              <div className={configStyles.configRow}>
                <label className={configStyles.configLabel} htmlFor="cart-camera-distance">
                  <span>CAMERA DISTANCE</span>
                  <span className={configStyles.configValue}>{Math.round(cameraDistance * 100)}%</span>
                </label>
                <input
                  id="cart-camera-distance"
                  className={configStyles.range}
                  type="range"
                  min={CART_ROGUE_CAMERA_DISTANCE_MIN}
                  max={CART_ROGUE_CAMERA_DISTANCE_MAX}
                  step={CART_ROGUE_CAMERA_DISTANCE_STEP}
                  value={cameraDistance}
                  onChange={(event) => updateCameraDistance(Number(event.currentTarget.value))}
                  aria-label="Camera distance"
                />
                <div className={configStyles.rangeScale}><span>CURRENT</span><span>FAR +60%</span></div>
              </div>
              <div className={`${configStyles.configRow} ${configStyles.toggleRow}`}>
                <div className={configStyles.configLabel}><span>VIBRATION</span></div>
                <button
                  className={`${configStyles.toggleButton} ${vibrationEnabled ? configStyles.toggleOn : ""}`}
                  onClick={toggleVibration}
                  aria-pressed={vibrationEnabled}
                >
                  {vibrationEnabled ? "ON" : "OFF"}
                </button>
              </div>
            </div>
            <div className={configStyles.configFooter}>
              <button className={configStyles.resetButton} onClick={resetConfig}>RESET</button>
              <button className={configStyles.backButton} onClick={() => setPausePage("menu")}>BACK</button>
            </div>
            <div className={styles.pauseHint}>ESC · BACK</div>
          </div>
        </div>
      )}
    </>
  );
}

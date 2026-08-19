"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CART_HARD_MODE_SNAPSHOT_EVENT,
  type CartHardModeSnapshot,
  type CartRunDifficulty,
} from "../src/cart/CartRunDifficulty";
import styles from "./CartGameMenu.module.css";

const MENU_PAUSE_EVENT = "cart-rogue-menu-pause";
const MENU_RESUME_EVENT = "cart-rogue-menu-resume";

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
  const [difficulty, setDifficulty] = useState<CartRunDifficulty>("normal");
  const [hardSnapshot, setHardSnapshot] = useState<CartHardModeSnapshot | null>(null);
  const gameOver = Boolean(hardSnapshot?.hardMode && hardSnapshot.gameOver);

  const pauseGame = useCallback(() => {
    if (!started || paused || gameOver || hasBlockingGameOverlay()) return;
    window.dispatchEvent(new Event(MENU_PAUSE_EVENT));
    setPaused(true);
  }, [gameOver, paused, started]);

  const resumeGame = useCallback(() => {
    if (!started || !paused || gameOver) return;
    window.dispatchEvent(new Event(MENU_RESUME_EVENT));
    setPaused(false);
  }, [gameOver, paused, started]);

  const startGame = (nextDifficulty = difficulty) => {
    setPaused(false);
    setHardSnapshot(null);
    onStart(nextDifficulty);
  };

  const returnTitle = () => {
    setPaused(false);
    setHardSnapshot(null);
    onReturnTitle();
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
      // before the player can hit PAUSE or HARD MODE can end the run.
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "CartMenuBind" }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [started]);

  useEffect(() => {
    if (!started) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || gameOver) return;
      event.preventDefault();
      if (paused) resumeGame();
      else pauseGame();
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [gameOver, pauseGame, paused, resumeGame, started]);

  useEffect(() => {
    if (!started) return undefined;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" || gameOver || hasBlockingGameOverlay()) return;
      window.dispatchEvent(new Event(MENU_PAUSE_EVENT));
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
          {hard && (
            <div className={styles.hardWarning}>EXPERT ONLY · 3 MAJOR HITS OR ZERO GAS = GAME OVER · EXTRA RAID PRESSURE</div>
          )}
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
    const reason = hardSnapshot.gameOverReason === "GAS" ? "OUT OF GAS" : "HULL DESTROYED";
    return (
      <div className={styles.gameOverOverlay} role="dialog" aria-modal="true" aria-label="Game over">
        <div className={styles.gameOverPanel}>
          <div className={styles.gameOverEyebrow}>HARD MODE · RUN FAILED</div>
          <h2>GAME OVER</h2>
          <strong className={styles.gameOverReason}>{reason}</strong>
          <div className={styles.gameOverStats}>
            <span>RAID HITS {hardSnapshot.raidHits}</span>
            <span>PERFECT DODGES {hardSnapshot.perfectDodges}</span>
          </div>
          <button className={styles.retryButton} onClick={() => startGame("hard")}>
            <strong>RETRY HARD</strong>
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
      {paused && (
        <div className={styles.pauseOverlay} role="dialog" aria-modal="true" aria-label="Game paused">
          <div className={styles.pausePanel}>
            <div className={styles.pauseEyebrow}>RUN SUSPENDED</div>
            <h2>PAUSED</h2>
            <p>Steering, brake and Turbo input are released while paused.</p>
            <button className={styles.resumeButton} onClick={resumeGame}>
              <strong>RESUME</strong>
              <small>BACK TO THE HUNT</small>
            </button>
            <div className={styles.pauseHint}>ESC · PAUSE / RESUME</div>
          </div>
        </div>
      )}
    </>
  );
}

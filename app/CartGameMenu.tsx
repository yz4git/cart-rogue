"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./CartGameMenu.module.css";

const MENU_PAUSE_EVENT = "cart-rogue-menu-pause";
const MENU_RESUME_EVENT = "cart-rogue-menu-resume";

interface CartGameMenuProps {
  started: boolean;
  onStart: () => void;
}

function hasBlockingGameOverlay(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"], [class*="runClear"]'));
}

export default function CartGameMenu({ started, onStart }: CartGameMenuProps) {
  const [paused, setPaused] = useState(false);

  const pauseGame = useCallback(() => {
    if (!started || paused || hasBlockingGameOverlay()) return;
    window.dispatchEvent(new Event(MENU_PAUSE_EVENT));
    setPaused(true);
  }, [paused, started]);

  const resumeGame = useCallback(() => {
    if (!started || !paused) return;
    window.dispatchEvent(new Event(MENU_RESUME_EVENT));
    setPaused(false);
  }, [paused, started]);

  const startGame = () => {
    setPaused(false);
    onStart();
  };

  useEffect(() => {
    if (!started) return undefined;
    const timer = window.setTimeout(() => {
      // CartRogueGame's keyboard sync calls all three control setters. The
      // harmless key-up makes both WebGL and Canvas fallback bind menu events
      // before the player can hit PAUSE.
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "CartMenuBind" }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [started]);

  useEffect(() => {
    if (!started) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (paused) resumeGame();
      else pauseGame();
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pauseGame, paused, resumeGame, started]);

  useEffect(() => {
    if (!started) return undefined;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" || hasBlockingGameOverlay()) return;
      window.dispatchEvent(new Event(MENU_PAUSE_EVENT));
      setPaused(true);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [started]);

  if (!started) {
    return (
      <div className={styles.titleScreen} role="dialog" aria-modal="true" aria-label="Cart Rogue title screen">
        <div className={styles.titleGlow} aria-hidden="true" />
        <div className={styles.titlePanel}>
          <div className={styles.eyebrow}>HIGH SPEED RAID ACTION</div>
          <h1><span>CART</span> ROGUE</h1>
          <div className={styles.mode}>TURBO HUNT</div>
          <p>HUNT THE RAID. BREAK THE LINE. KEEP MOVING.</p>
          <button className={styles.startButton} onClick={startGame}>
            <strong>START RUN</strong>
            <small>TAP TO IGNITE</small>
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

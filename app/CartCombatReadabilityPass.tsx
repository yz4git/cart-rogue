"use client";

import { useEffect, useState } from "react";
import {
  CART_RAID_HAZARD_SNAPSHOT_EVENT,
  getLatestCartRaidHazardState,
  type CartRaidHazardSnapshot,
} from "../src/cart/CartRoguePhase88RaidHazards";
import {
  CART_ESCAPE_RHYTHM_EVENT,
  getLatestCartEscapeRhythmState,
  type CartEscapeRhythmSnapshot,
} from "../src/cart/CartRoguePhase94EscapeRhythmDirector2";
import legacyStyles from "./CartRogueGame.module.css";
import phaseStyles from "./CartRoguePhase3.module.css";
import styles from "./CartCombatReadabilityPass.module.css";

export default function CartCombatReadabilityPass() {
  const [raid, setRaid] = useState<CartRaidHazardSnapshot | null>(() => getLatestCartRaidHazardState());
  const [escape, setEscape] = useState<CartEscapeRhythmSnapshot | null>(() => getLatestCartEscapeRhythmState());

  useEffect(() => {
    const raidHandler = (event: Event) => {
      const detail = (event as CustomEvent<CartRaidHazardSnapshot>).detail;
      if (detail) setRaid(detail);
    };
    const escapeHandler = (event: Event) => {
      const detail = (event as CustomEvent<CartEscapeRhythmSnapshot>).detail;
      if (detail) setEscape(detail);
    };
    window.addEventListener(CART_RAID_HAZARD_SNAPSHOT_EVENT, raidHandler);
    window.addEventListener(CART_ESCAPE_RHYTHM_EVENT, escapeHandler);
    return () => {
      window.removeEventListener(CART_RAID_HAZARD_SNAPSHOT_EVENT, raidHandler);
      window.removeEventListener(CART_ESCAPE_RHYTHM_EVENT, escapeHandler);
    };
  }, []);

  const raidActive = (raid?.activeCount ?? 0) > 0;
  const imminent = (raid?.imminentCount ?? 0) > 0;
  const escapeActive = Boolean(escape?.active);
  const dangerActive = raidActive || escapeActive;

  return (
    <>
      {dangerActive && (
        <style>{`
          .${legacyStyles.combo}, .${legacyStyles.ramBanner} {
            opacity: ${imminent ? ".08" : ".24"} !important;
            filter: none !important;
            font-size: clamp(12px, 2vw, 18px) !important;
            transform: translateX(-50%) scale(${imminent ? ".48" : ".62"}) !important;
          }
          .${phaseStyles.wallRide} {
            opacity: ${imminent ? ".06" : ".18"} !important;
            filter: none !important;
            font-size: clamp(10px, 1.8vw, 16px) !important;
            text-shadow: none !important;
            transform: translateX(-50%) scale(${imminent ? ".48" : ".58"}) !important;
          }
          .${phaseStyles.rewardBanner} {
            opacity: ${imminent ? ".1" : ".28"} !important;
            font-size: 8px !important;
            padding: 3px 7px !important;
            box-shadow: none !important;
            max-width: 42vw !important;
            overflow: hidden !important;
            white-space: nowrap !important;
            text-overflow: ellipsis !important;
          }
        `}</style>
      )}
      {escapeActive && escape && (
        <div className={styles.escapeBadge} aria-label="Escape rhythm status" aria-live="polite">
          <strong>ESCAPE</strong>
          <span>{escape.kind === "PURSUIT" ? "PURSUIT · BREAK AWAY" : "BREAKOUT · LEAVE THE RING"}</span>
          <small>{Math.max(0, escape.secondsRemaining).toFixed(1)}s</small>
        </div>
      )}
    </>
  );
}

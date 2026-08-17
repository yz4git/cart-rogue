"use client";

import { useEffect, useState } from "react";
import {
  CART_TURBO_HUNT_SNAPSHOT_EVENT,
  getLatestCartTurboHuntSnapshot,
  type CartTurboHuntSnapshot,
} from "../src/cart/CartRoguePhase67TurboHunt";
import legacyStyles from "./CartRogueGame.module.css";
import routeStyles from "./CartRunRouteMap.module.css";
import styles from "./CartTurboHuntHudOverlay.module.css";

const PHASE_LABEL: Record<CartTurboHuntSnapshot["huntPhase"], string> = {
  "drop-in": "DROP IN",
  hunt: "HUNT",
  "heat-up": "HEAT UP",
  "elite-invasion": "ELITE INVASION",
  overdrive: "OVERDRIVE",
  "boss-arrival": "BOSS ARRIVAL",
  clear: "HUNT CLEAR",
};

export default function CartTurboHuntHudOverlay() {
  const [snapshot, setSnapshot] = useState<CartTurboHuntSnapshot | null>(() => getLatestCartTurboHuntSnapshot());

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<CartTurboHuntSnapshot>).detail;
      if (detail?.gameMode === "turbo-hunt") setSnapshot(detail);
    };
    window.addEventListener(CART_TURBO_HUNT_SNAPSHOT_EVENT, handler);
    return () => window.removeEventListener(CART_TURBO_HUNT_SNAPSHOT_EVENT, handler);
  }, []);

  if (!snapshot) return null;
  const objectivePercent = Math.round(Math.min(1, snapshot.huntObjectiveProgress / Math.max(1, snapshot.huntObjectiveTarget)) * 100);
  const heatPercent = Math.round(snapshot.huntHeat);
  const phaseLabel = PHASE_LABEL[snapshot.huntPhase];
  const target = snapshot.huntTargetEnemyId ? `${Math.round(snapshot.huntTargetDistance)}m` : "SCAN";

  return (
    <>
      <style>{`
        .${legacyStyles.topHud}, .${legacyStyles.gateOpen}, .${routeStyles.panel} { display: none !important; }
      `}</style>
      <div className={styles.hud} aria-label="Turbo Hunt status">
        <div className={styles.card}>
          <span className={styles.kicker}>CART ROGUE</span>
          <strong className={styles.title}>TURBO HUNT</strong>
          <span className={styles.region}>{snapshot.huntRegion} · {phaseLabel}</span>
        </div>

        <div className={styles.orderCard}>
          <div className={styles.orderHead}>
            <span className={styles.orderType}>HUNT ORDER · {snapshot.huntObjectiveKind}</span>
            <strong>{Math.floor(snapshot.huntObjectiveProgress)} / {snapshot.huntObjectiveTarget}</strong>
          </div>
          <div className={styles.orderLabel}>{snapshot.huntObjectiveLabel}</div>
          <div>
            <div className={styles.progressTrack}><i style={{ width: `${objectivePercent}%` }} /></div>
            <div className={styles.orderFoot}>
              <span>ORDERS {snapshot.huntOrdersCompleted}</span>
              <span>TARGET {target}</span>
            </div>
          </div>
        </div>

        <div className={styles.heatCard}>
          <div className={styles.heatHead}>
            <span className={styles.mini}>HEAT · LV {snapshot.huntHeatLevel}</span>
            <strong>{heatPercent}</strong>
          </div>
          <div className={styles.heatTrack}><i style={{ width: `${heatPercent}%` }} /></div>
          <div className={styles.stats}>
            <span>KO {snapshot.huntKills}</span>
            <span className={snapshot.huntBossSpawned ? styles.boss : undefined}>{snapshot.huntBossSpawned ? "TITAN ACTIVE" : phaseLabel}</span>
          </div>
        </div>
      </div>
    </>
  );
}

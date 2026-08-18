"use client";

import { useEffect, useRef, useState } from "react";
import {
  CART_TURBO_HUNT_SNAPSHOT_EVENT,
  getLatestCartTurboHuntSnapshot,
  type CartTurboHuntSnapshot,
} from "../src/cart/CartRoguePhase67TurboHunt";
import {
  CART_RAID_HAZARD_SNAPSHOT_EVENT,
  getLatestCartRaidHazardState,
  type CartRaidHazardSnapshot,
} from "../src/cart/CartRoguePhase88RaidHazards";
import {
  CART_PLAYER_DAMAGE_FEEDBACK_EVENT,
  getLatestCartPlayerDamageFeedbackState,
  type CartPlayerDamageFeedbackSnapshot,
} from "../src/cart/CartRoguePhase91DamageFeedback2";
import legacyStyles from "./CartRogueGame.module.css";
import routeStyles from "./CartRunRouteMap.module.css";
import styles from "./CartTurboHuntHudOverlay.module.css";

interface FieldEventHudSnapshot {
  eventSerial: number;
  eventKind: "CONVOY" | "SMASH_ZONE" | "TURBO_RUSH" | "CHAOS_WAVE" | "ELITE_HUNT";
  eventLabel: string;
  eventActive: boolean;
  eventProgress: number;
  eventTarget: number;
  eventSecondsRemaining: number;
  eventChain: number;
  overdriveSeconds: number;
}

interface TitanHudSnapshot {
  bossActive: boolean;
  stage: "ARMORED" | "BREAKOUT" | "FURY" | "DOWN";
  armorSegments: number;
  maxArmorSegments: number;
  vulnerable: boolean;
}

interface ThreatHudSnapshot {
  threatActive: boolean;
  threatKind: "STRIKER" | "TITAN" | null;
  threatDistance: number;
  lastDodgeGrade: "NONE" | "DODGE" | "PERFECT";
  dodgeFlashSeconds: number;
  counterSeconds: number;
}

interface PursuitHudSnapshot {
  active: boolean;
  kind: "PURSUIT" | "DANGER_ZONE" | "BREAKOUT";
  label: string;
  secondsRemaining: number;
}

interface PredatorHudSnapshot {
  active: boolean;
  mode: "HUNT" | "SURVIVE" | "COUNTER";
  secondsRemaining: number;
  counterSeconds: number;
  perfectDodges: number;
}

const PHASE_LABEL: Record<CartTurboHuntSnapshot["huntPhase"], string> = {
  "drop-in": "DROP IN",
  hunt: "HUNT",
  "heat-up": "HEAT UP",
  "elite-invasion": "ELITE INVASION",
  overdrive: "OVERDRIVE",
  "boss-arrival": "BOSS ARRIVAL",
  clear: "HUNT CLEAR",
};

function eventName(kind: FieldEventHudSnapshot["eventKind"]): string {
  return kind.replaceAll("_", " ");
}

export default function CartTurboHuntHudOverlay() {
  const [snapshot, setSnapshot] = useState<CartTurboHuntSnapshot | null>(() => getLatestCartTurboHuntSnapshot());
  const [fieldEvent, setFieldEvent] = useState<FieldEventHudSnapshot | null>(null);
  const [titan, setTitan] = useState<TitanHudSnapshot | null>(null);
  const [threat, setThreat] = useState<ThreatHudSnapshot | null>(null);
  const [pursuit, setPursuit] = useState<PursuitHudSnapshot | null>(null);
  const [predator, setPredator] = useState<PredatorHudSnapshot | null>(null);
  const [raidHazard, setRaidHazard] = useState<CartRaidHazardSnapshot | null>(() => getLatestCartRaidHazardState());
  const [damageFeedback, setDamageFeedback] = useState<CartPlayerDamageFeedbackSnapshot | null>(() => getLatestCartPlayerDamageFeedbackState());
  const damageSerialRef = useRef(getLatestCartPlayerDamageFeedbackState()?.hitSerial ?? 0);

  useEffect(() => {
    const huntHandler = (event: Event) => {
      const detail = (event as CustomEvent<CartTurboHuntSnapshot>).detail;
      if (detail?.gameMode === "turbo-hunt") setSnapshot(detail);
    };
    const eventHandler = (event: Event) => {
      const detail = (event as CustomEvent<FieldEventHudSnapshot>).detail;
      if (detail?.eventKind) setFieldEvent(detail);
    };
    const titanHandler = (event: Event) => {
      const detail = (event as CustomEvent<TitanHudSnapshot>).detail;
      if (detail?.stage) setTitan(detail);
    };
    const threatHandler = (event: Event) => {
      const detail = (event as CustomEvent<ThreatHudSnapshot>).detail;
      if (detail) setThreat(detail);
    };
    const pursuitHandler = (event: Event) => {
      const detail = (event as CustomEvent<PursuitHudSnapshot>).detail;
      if (detail?.kind) setPursuit(detail);
    };
    const predatorHandler = (event: Event) => {
      const detail = (event as CustomEvent<PredatorHudSnapshot>).detail;
      if (detail?.mode) setPredator(detail);
    };
    const raidHandler = (event: Event) => {
      const detail = (event as CustomEvent<CartRaidHazardSnapshot>).detail;
      if (detail) setRaidHazard(detail);
    };
    const damageHandler = (event: Event) => {
      const detail = (event as CustomEvent<CartPlayerDamageFeedbackSnapshot>).detail;
      if (!detail) return;
      if (detail.hitSerial > damageSerialRef.current) {
        damageSerialRef.current = detail.hitSerial;
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate([35, 20, 55]);
        }
      }
      setDamageFeedback(detail);
    };
    window.addEventListener(CART_TURBO_HUNT_SNAPSHOT_EVENT, huntHandler);
    window.addEventListener("cart-turbo-hunt-event-snapshot", eventHandler);
    window.addEventListener("cart-titan-boss-snapshot", titanHandler);
    window.addEventListener("cart-threat-dodge-snapshot", threatHandler);
    window.addEventListener("cart-pursuit-event-snapshot", pursuitHandler);
    window.addEventListener("cart-titan-predator-snapshot", predatorHandler);
    window.addEventListener(CART_RAID_HAZARD_SNAPSHOT_EVENT, raidHandler);
    window.addEventListener(CART_PLAYER_DAMAGE_FEEDBACK_EVENT, damageHandler);
    return () => {
      window.removeEventListener(CART_TURBO_HUNT_SNAPSHOT_EVENT, huntHandler);
      window.removeEventListener("cart-turbo-hunt-event-snapshot", eventHandler);
      window.removeEventListener("cart-titan-boss-snapshot", titanHandler);
      window.removeEventListener("cart-threat-dodge-snapshot", threatHandler);
      window.removeEventListener("cart-pursuit-event-snapshot", pursuitHandler);
      window.removeEventListener("cart-titan-predator-snapshot", predatorHandler);
      window.removeEventListener(CART_RAID_HAZARD_SNAPSHOT_EVENT, raidHandler);
      window.removeEventListener(CART_PLAYER_DAMAGE_FEEDBACK_EVENT, damageHandler);
    };
  }, []);

  if (!snapshot) return null;
  const objectivePercent = Math.round(Math.min(1, snapshot.huntObjectiveProgress / Math.max(1, snapshot.huntObjectiveTarget)) * 100);
  const heatPercent = Math.round(snapshot.huntHeat);
  const phaseLabel = PHASE_LABEL[snapshot.huntPhase];
  const target = snapshot.huntTargetEnemyId ? `${Math.round(snapshot.huntTargetDistance)}m` : "SCAN";
  const eventActive = Boolean(fieldEvent?.eventActive);
  const chain = fieldEvent?.eventChain ?? 0;
  const overdrive = fieldEvent?.overdriveSeconds ?? 0;
  const titanLabel = titan?.bossActive
    ? `TITAN ${titan.stage}${titan.armorSegments > 0 ? ` · ARMOR ${titan.armorSegments}` : titan.vulnerable ? " · CORE OPEN" : ""}`
    : snapshot.huntBossSpawned ? "TITAN ACTIVE" : phaseLabel;

  let dangerText: string | null = null;
  let dangerMode: "danger" | "counter" | "raid" | "hit" = "danger";
  if (damageFeedback?.active && damageFeedback.flashSeconds > 0) {
    dangerText = `DIRECT HIT · GAS -${damageFeedback.gasLossPercent}% · SPEED -${damageFeedback.speedLossPercent}%`;
    dangerMode = "hit";
  } else if (predator?.active && predator.mode === "COUNTER") {
    dangerText = `COUNTER WINDOW · ${predator.counterSeconds.toFixed(1)}s · HIT THE CORE`;
    dangerMode = "counter";
  } else if ((raidHazard?.dodgeFlashSeconds ?? 0) > 0 && raidHazard?.lastResult === "PERFECT") {
    dangerText = "PERFECT AOE DODGE · COUNTER NOW";
    dangerMode = "counter";
  } else if ((raidHazard?.activeCount ?? 0) > 0 && raidHazard?.primaryLabel) {
    const phase = raidHazard.primaryPhase;
    const prefix = phase === "FIRED"
      ? "AOE IMPACT"
      : raidHazard.primarySeconds <= 0.35
        ? "AOE FIRING"
        : phase === "LOCKED"
          ? "AOE LOCKED"
          : "AOE TRACKING";
    dangerText = `${prefix} · ${raidHazard.primaryLabel} · ${Math.max(0, raidHazard.primarySeconds).toFixed(1)}s`;
    dangerMode = "raid";
  } else if (predator?.active && predator.mode === "SURVIVE") {
    dangerText = `SURVIVE TITAN · ${predator.secondsRemaining.toFixed(1)}s${predator.perfectDodges > 0 ? ` · PERFECT ×${predator.perfectDodges}` : ""}`;
  } else if (pursuit?.active) {
    dangerText = `${pursuit.label} · ${pursuit.secondsRemaining.toFixed(1)}s`;
  } else if ((threat?.dodgeFlashSeconds ?? 0) > 0 && threat?.lastDodgeGrade === "PERFECT") {
    dangerText = `PERFECT DODGE · COUNTER ${Math.max(0, threat.counterSeconds).toFixed(1)}s`;
    dangerMode = "counter";
  } else if (threat?.threatActive) {
    dangerText = `DANGER · ${threat.threatKind ?? "CHARGE"} CHARGE · ${Math.round(threat.threatDistance)}m`;
  }

  return (
    <>
      <style>{`
        .${legacyStyles.topHud}, .${legacyStyles.gateOpen}, .${routeStyles.panel} { display: none !important; }
      `}</style>
      {damageFeedback?.active && damageFeedback.flashSeconds > 0 && (
        <div className={styles.damageOverlay} aria-live="assertive" aria-label="Damage taken">
          <div className={styles.damageBurst}>
            <strong>DIRECT HIT</strong>
            <span>{damageFeedback.label}</span>
            <small>GAS -{damageFeedback.gasLossPercent}% · SPEED -{damageFeedback.speedLossPercent}%</small>
          </div>
        </div>
      )}
      <div className={styles.hud} aria-label="Turbo Hunt status">
        <div className={styles.card}>
          <span className={styles.kicker}>CART ROGUE</span>
          <strong className={styles.title}>TURBO HUNT</strong>
          <span className={styles.region}>
            {snapshot.huntRegion} · {phaseLabel}{overdrive > 0 ? ` · OVERDRIVE ${overdrive.toFixed(1)}s` : ""}
          </span>
        </div>

        <div className={styles.orderCard}>
          <div className={styles.orderHead}>
            <span className={styles.orderType}>HUNT ORDER · {snapshot.huntObjectiveKind}</span>
            <strong>{Math.floor(snapshot.huntObjectiveProgress)} / {snapshot.huntObjectiveTarget}</strong>
          </div>
          <div className={styles.orderLabel}>{snapshot.huntObjectiveLabel}</div>
          {fieldEvent && (
            <div className={`${styles.eventLine} ${eventActive ? styles.eventActive : ""}`}>
              <span>{eventActive ? `FIELD EVENT · ${eventName(fieldEvent.eventKind)}` : "FIELD EVENT · SHIFTING"}</span>
              <strong>{eventActive ? `${Math.floor(fieldEvent.eventProgress)} / ${fieldEvent.eventTarget}` : "..."}</strong>
            </div>
          )}
          {dangerText && (
            <div className={`${styles.threatLine} ${dangerMode === "counter" ? styles.counterHot : dangerMode === "raid" ? styles.raidHot : dangerMode === "hit" ? styles.damageHit : styles.threatHot}`}>
              {dangerText}
            </div>
          )}
          <div>
            <div className={styles.progressTrack}><i style={{ width: `${objectivePercent}%` }} /></div>
            <div className={styles.orderFoot}>
              <span>ORDERS {snapshot.huntOrdersCompleted}</span>
              <span className={chain >= 12 ? styles.flowHot : undefined}>FLOW ×{chain}</span>
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
            <span className={snapshot.huntBossSpawned ? styles.boss : undefined}>{titanLabel}</span>
          </div>
        </div>
      </div>
    </>
  );
}

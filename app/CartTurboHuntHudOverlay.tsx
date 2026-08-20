"use client";

import { useEffect, useRef, useState } from "react";
import {
  CART_HARD_MODE_SNAPSHOT_EVENT,
  type CartHardModeSnapshot,
} from "../src/cart/CartRunDifficulty";
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
import { getLatestCartHardModeState } from "../src/cart/CartRoguePhase98HardMode";
import legacyStyles from "./CartRogueGame.module.css";
import phaseStyles from "./CartRoguePhase3.module.css";
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
  const [hardMode, setHardMode] = useState<CartHardModeSnapshot | null>(() => getLatestCartHardModeState());
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
    const hardHandler = (event: Event) => {
      const detail = (event as CustomEvent<CartHardModeSnapshot>).detail;
      if (detail) setHardMode(detail);
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
    window.addEventListener(CART_HARD_MODE_SNAPSHOT_EVENT, hardHandler);
    window.addEventListener(CART_PLAYER_DAMAGE_FEEDBACK_EVENT, damageHandler);
    return () => {
      window.removeEventListener(CART_TURBO_HUNT_SNAPSHOT_EVENT, huntHandler);
      window.removeEventListener("cart-turbo-hunt-event-snapshot", eventHandler);
      window.removeEventListener("cart-titan-boss-snapshot", titanHandler);
      window.removeEventListener("cart-threat-dodge-snapshot", threatHandler);
      window.removeEventListener("cart-pursuit-event-snapshot", pursuitHandler);
      window.removeEventListener("cart-titan-predator-snapshot", predatorHandler);
      window.removeEventListener(CART_RAID_HAZARD_SNAPSHOT_EVENT, raidHandler);
      window.removeEventListener(CART_HARD_MODE_SNAPSHOT_EVENT, hardHandler);
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
  const lifeLabel = hardMode
    ? `${hardMode.hardMode ? "HARD · " : ""}LIFE/GAS ${hardMode.gasLifePercent}% · `
    : "";

  let dangerText: string | null = null;
  let dangerMode: "danger" | "counter" | "raid" | "hit" | "escape" = "danger";
  if (damageFeedback?.active && damageFeedback.flashSeconds > 0) {
    dangerText = `DIRECT HIT · LIFE/GAS -${damageFeedback.gasLossPercent}% · SPEED -${damageFeedback.speedLossPercent}%`;
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
    if (pursuit.kind === "BREAKOUT" || /ESCAPE|BREAK AWAY|CLEAR/i.test(pursuit.label)) dangerMode = "escape";
  } else if ((threat?.dodgeFlashSeconds ?? 0) > 0 && threat?.lastDodgeGrade === "PERFECT") {
    dangerText = `PERFECT DODGE · COUNTER ${Math.max(0, threat.counterSeconds).toFixed(1)}s`;
    dangerMode = "counter";
  } else if (threat?.threatActive) {
    dangerText = `DANGER · ${threat.threatKind ?? "CHARGE"} CHARGE · ${Math.round(threat.threatDistance)}m`;
  }

  return (
    <>
      <style>{`
        .${legacyStyles.topHud}, .${legacyStyles.gateOpen}, .${routeStyles.panel}, .${legacyStyles.rendererBadge}, .${phaseStyles.rewardBanner} { display: none !important; }
        .${legacyStyles.bottomHud} {
          left: max(8px, env(safe-area-inset-left)) !important;
          right: max(8px, env(safe-area-inset-right)) !important;
          bottom: max(6px, env(safe-area-inset-bottom)) !important;
          grid-template-columns: minmax(138px, .82fr) auto minmax(138px, .82fr) !important;
          gap: 8px !important;
        }
        .${legacyStyles.meterCard} { padding: 6px 8px 7px !important; max-width: 205px !important; border-radius: 10px !important; }
        .${legacyStyles.turboCard} { width: min(190px, 100%) !important; }
        .${legacyStyles.meterHead} strong { font-size: 14px !important; }
        .${legacyStyles.meterHead} span { font-size: 7px !important; letter-spacing: .1em !important; }
        .${legacyStyles.meterTrack} { height: 8px !important; margin-top: 4px !important; }
        .${legacyStyles.chargeRow} { gap: 3px !important; margin-top: 4px !important; }
        .${legacyStyles.chargeRow} i { height: 8px !important; }
        .${legacyStyles.itemStrip} { gap: 5px !important; padding-bottom: 1px !important; }
        .${legacyStyles.itemStrip} span { width: 34px !important; height: 34px !important; border-radius: 8px !important; font-size: 7px !important; }
        .${legacyStyles.steerZone} span { display: none !important; }
        .${legacyStyles.actions} { right: max(10px, env(safe-area-inset-right)) !important; bottom: max(52px, calc(env(safe-area-inset-bottom) + 45px)) !important; gap: 8px !important; }
        .${legacyStyles.brakeButton} { width: 50px !important; height: 50px !important; border-radius: 14px !important; font-size: 8px !important; }
        .${legacyStyles.boostButton} { width: 76px !important; height: 76px !important; border-radius: 20px !important; }
        .${legacyStyles.boostButton} strong { font-size: 14px !important; }
        .${legacyStyles.boostButton} small { margin-top: 3px !important; font-size: 7px !important; }
        @media(max-height:360px) {
          .${legacyStyles.bottomHud} { bottom: max(4px, env(safe-area-inset-bottom)) !important; gap: 6px !important; }
          .${legacyStyles.meterCard} { padding: 5px 7px 6px !important; max-width: 184px !important; }
          .${legacyStyles.itemStrip} span { width: 31px !important; height: 31px !important; }
          .${legacyStyles.actions} { bottom: max(46px, calc(env(safe-area-inset-bottom) + 40px)) !important; }
          .${legacyStyles.brakeButton} { width: 46px !important; height: 46px !important; }
          .${legacyStyles.boostButton} { width: 70px !important; height: 70px !important; }
        }
      `}</style>
      {damageFeedback?.active && damageFeedback.flashSeconds > 0 && (
        <div className={styles.damageOverlay} aria-live="assertive" aria-label="Damage taken">
          <div className={styles.damageBurst}>
            <strong>DIRECT HIT</strong>
            <span>{damageFeedback.label}</span>
            <small>LIFE/GAS -{damageFeedback.gasLossPercent}% · SPEED -{damageFeedback.speedLossPercent}%</small>
          </div>
        </div>
      )}
      <div className={styles.hud} aria-label="Turbo Hunt status" data-phase107-hierarchy="true">
        <div className={styles.card}>
          <span className={styles.kicker}>CART ROGUE</span>
          <strong className={styles.title}>TURBO HUNT</strong>
          <span className={styles.region}>
            {lifeLabel}{snapshot.huntRegion} · {phaseLabel}{overdrive > 0 ? ` · OVERDRIVE ${overdrive.toFixed(1)}s` : ""}
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
            <div className={`${styles.threatLine} ${dangerMode === "counter" ? styles.counterHot : dangerMode === "raid" ? styles.raidHot : dangerMode === "hit" ? styles.damageHit : dangerMode === "escape" ? styles.escapeHot : styles.threatHot}`}>
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

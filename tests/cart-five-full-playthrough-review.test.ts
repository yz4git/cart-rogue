import assert from "node:assert/strict";
import test from "node:test";
import "../src/cart/CartRogueRuntime";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { configureCartRunMap } from "../src/cart/CartWorldGraph";
import {
  enableCartTurboHunt,
  getCartTurboHuntSnapshot,
} from "../src/cart/CartRoguePhase67TurboHunt";
import { getCartRaidHazardState } from "../src/cart/CartRoguePhase88RaidHazards";
import { getCartPlayerDamageFeedbackState } from "../src/cart/CartRoguePhase91DamageFeedback2";

const DT = 1 / 60;
const MAX_SECONDS = 270;
const SEEDS = [0x4ca9, 0x52f1, 0x6d2b79f5, 0x13579b, 0x2468ac] as const;

type Input = {
  throttle: number;
  brake: number;
  steer: number;
  boost: boolean;
};

interface RunReview {
  run: number;
  seed: number;
  cleared: boolean;
  elapsedSeconds: number;
  bossSpawnSeconds: number | null;
  bossClearSeconds: number | null;
  huntKills: number;
  ordersCompleted: number;
  heat: number;
  maxHeat: number;
  minGas: number;
  raidHits: number;
  perfectDodges: number;
  dodgeDecisions: number;
  hazardActiveRatio: number;
  maxHazards: number;
  maxEnemiesAlive: number;
  ramCount: number;
  avgSpeed: number;
  peakSpeed: number;
  distanceTravelled: number;
  finalBossHp: number;
  finalPhase: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function chooseTarget(session: CartArenaSession): { x: number; z: number } | null {
  const snap = session.snapshot();
  const hunt = getCartTurboHuntSnapshot(session);
  if (!hunt) return null;
  const boss = snap.enemies.find((enemy) => enemy.kind === "boss" && enemy.alive);
  if (boss) return { x: boss.x, z: boss.z };
  if (hunt.huntTargetEnemyId) {
    const target = snap.enemies.find((enemy) => enemy.id === hunt.huntTargetEnemyId && enemy.alive);
    if (target) return { x: target.x, z: target.z };
  }
  const living = snap.enemies.filter((enemy) => enemy.alive && enemy.kind !== "boss");
  living.sort((a, b) => Math.hypot(a.x - snap.x, a.z - snap.z) - Math.hypot(b.x - snap.x, b.z - snap.z));
  const target = living[0];
  return target ? { x: target.x, z: target.z } : null;
}

function runOne(seed: number, run: number): RunReview {
  configureCartRunMap(seed);
  const session = new CartArenaSession();
  enableCartTurboHunt(session);

  let time = 0;
  let bossSpawnSeconds: number | null = null;
  let bossClearSeconds: number | null = null;
  let minGas = 1;
  let maxHeat = 0;
  let maxHazards = 0;
  let maxEnemiesAlive = 0;
  let hazardActiveSeconds = 0;
  let dodgeDecisions = 0;
  let lastDodgeHazardId: number | null = null;
  let dodgeSide: -1 | 1 = run % 2 === 0 ? 1 : -1;
  let boostClock = (run - 1) * 0.07;
  let speedIntegral = 0;
  let speedSamples = 0;
  let peakSpeed = 0;
  let distanceTravelled = 0;
  let previousX = session.car.position.x;
  let previousZ = session.car.position.z;

  for (let frame = 0; frame < MAX_SECONDS * 60; frame += 1) {
    const beforeRaid = getCartRaidHazardState(session);
    const locked = beforeRaid.hazards
      .filter((hazard) => hazard.phase === "LOCKED" && hazard.secondsToFire > 0)
      .sort((a, b) => a.secondsToFire - b.secondsToFire)[0];

    let input: Input;
    if (locked && locked.secondsToFire <= 1.02) {
      if (lastDodgeHazardId !== locked.id) {
        lastDodgeHazardId = locked.id;
        dodgeDecisions += 1;
        if (/CUTBACK|SWEEP|CROSS|DONUT/.test(locked.label)) dodgeSide = dodgeSide === 1 ? -1 : 1;
      }
      input = {
        throttle: locked.secondsToFire < 0.52 ? 0.72 : 1,
        brake: locked.secondsToFire < 0.82 ? 0.72 : 0.38,
        steer: dodgeSide,
        boost: false,
      };
    } else {
      if (!locked) lastDodgeHazardId = null;
      const target = chooseTarget(session);
      const snap = session.snapshot();
      let steer = 0;
      if (target) {
        const desired = Math.atan2(target.x - snap.x, target.z - snap.z);
        const error = normalizeAngle(desired - snap.heading);
        steer = clamp(-error * 1.55, -1, 1);
      } else {
        const desired = Math.atan2(560 - snap.x, 220 - snap.z);
        steer = clamp(-normalizeAngle(desired - snap.heading) * 1.25, -0.9, 0.9);
      }

      boostClock += DT;
      if (boostClock >= 0.72) boostClock -= 0.72;
      const charges = snap.boostCharges;
      const targetDistance = target ? Math.hypot(target.x - snap.x, target.z - snap.z) : 999;
      const wantAttack = charges > 0 && targetDistance < 30;
      const holdBoost = wantAttack && boostClock < 0.34;
      input = {
        throttle: 1,
        brake: Math.abs(steer) > 0.8 && Math.abs(snap.speed) > 15 ? 0.16 : 0,
        steer,
        boost: holdBoost,
      };
    }

    session.step(input, DT);
    time += DT;

    const snap = session.snapshot();
    const hunt = getCartTurboHuntSnapshot(session);
    const raid = getCartRaidHazardState(session);
    if (!hunt) throw new Error("Turbo Hunt state disappeared during full playthrough");

    if (raid.activeCount > 0) hazardActiveSeconds += DT;
    maxHazards = Math.max(maxHazards, raid.activeCount);
    maxEnemiesAlive = Math.max(maxEnemiesAlive, snap.enemiesAlive);
    minGas = Math.min(minGas, snap.gas);
    maxHeat = Math.max(maxHeat, hunt.huntHeat);
    const speed = Math.abs(snap.speed);
    speedIntegral += speed;
    speedSamples += 1;
    peakSpeed = Math.max(peakSpeed, speed);
    distanceTravelled += Math.hypot(snap.x - previousX, snap.z - previousZ);
    previousX = snap.x;
    previousZ = snap.z;

    if (hunt.huntBossSpawned && bossSpawnSeconds === null) bossSpawnSeconds = time;
    if (snap.runComplete) {
      bossClearSeconds = time;
      break;
    }
  }

  const snap = session.snapshot();
  const hunt = getCartTurboHuntSnapshot(session);
  const raid = getCartRaidHazardState(session);
  const damage = getCartPlayerDamageFeedbackState(session);
  if (!hunt) throw new Error("Turbo Hunt state missing at review end");

  return {
    run,
    seed,
    cleared: snap.runComplete,
    elapsedSeconds: Number(time.toFixed(2)),
    bossSpawnSeconds: bossSpawnSeconds === null ? null : Number(bossSpawnSeconds.toFixed(2)),
    bossClearSeconds: bossClearSeconds === null ? null : Number(bossClearSeconds.toFixed(2)),
    huntKills: hunt.huntKills,
    ordersCompleted: hunt.huntOrdersCompleted,
    heat: Number(hunt.huntHeat.toFixed(1)),
    maxHeat: Number(maxHeat.toFixed(1)),
    minGas: Number((minGas * 100).toFixed(1)),
    raidHits: Math.max(raid.hitSerial, damage.hitSerial),
    perfectDodges: raid.perfectDodgeSerial,
    dodgeDecisions,
    hazardActiveRatio: Number((hazardActiveSeconds / Math.max(time, DT)).toFixed(3)),
    maxHazards,
    maxEnemiesAlive,
    ramCount: session.car.ramCount,
    avgSpeed: Number((speedIntegral / Math.max(1, speedSamples)).toFixed(2)),
    peakSpeed: Number(peakSpeed.toFixed(2)),
    distanceTravelled: Number(distanceTravelled.toFixed(1)),
    finalBossHp: snap.bossHp,
    finalPhase: hunt.huntPhase,
  };
}

test("five full Turbo Hunt playthroughs produce a balance review sample", () => {
  const reviews = SEEDS.map((seed, index) => runOne(seed, index + 1));
  console.log(`FIVE_FULL_PLAYTHROUGH_REVIEW=${JSON.stringify(reviews)}`);

  assert.equal(reviews.length, 5);
  assert.ok(reviews.every((entry) => entry.bossSpawnSeconds !== null), JSON.stringify(reviews));
  assert.ok(reviews.every((entry) => entry.elapsedSeconds >= 100), JSON.stringify(reviews));
  assert.ok(reviews.every((entry) => entry.hazardActiveRatio >= 0.2), JSON.stringify(reviews));
});

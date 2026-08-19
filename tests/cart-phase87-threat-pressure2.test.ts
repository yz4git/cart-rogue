import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { CART_ROGUE_RUNTIME_PHASE_ORDER } from "../src/cart/CartRogueRuntime";
import { enableCartTurboHunt, getCartTurboHuntSnapshot } from "../src/cart/CartRoguePhase67TurboHunt";
import { getCartTitanBossState } from "../src/cart/CartRoguePhase83Boss2";
import { getCartTitanPredatorState } from "../src/cart/CartRoguePhase86BossPredator";
import {
  CART_THREAT_PRESSURE_ACTIVE_SECONDS,
  CART_THREAT_PRESSURE_BOSS_COOLDOWN,
  CART_THREAT_PRESSURE_BOSS_SPEED,
  CART_THREAT_PRESSURE_FURY_COOLDOWN,
  CART_THREAT_PRESSURE_FURY_SPEED,
  CART_THREAT_PRESSURE_GAP_SECONDS,
  CART_THREAT_PRESSURE_INITIAL_DELAY,
  CART_THREAT_PRESSURE_STRIKER_COOLDOWN,
  CART_THREAT_PRESSURE_STRIKER_SPEED,
  cartThreatPressureActiveRatio,
  getCartThreatPressureState,
} from "../src/cart/CartRoguePhase87ThreatPressure2";

const source = readFileSync(new URL("../src/cart/CartRoguePhase87ThreatPressure2.ts", import.meta.url), "utf8");
const idleInput = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

test("Threat Pressure 2.0 targets near-half-time danger with a very short opening delay", () => {
  const ratio = cartThreatPressureActiveRatio();
  assert.ok(CART_THREAT_PRESSURE_INITIAL_DELAY <= 2.5);
  assert.ok(CART_THREAT_PRESSURE_ACTIVE_SECONDS >= 4);
  assert.ok(CART_THREAT_PRESSURE_GAP_SECONDS <= 4.5);
  assert.ok(ratio >= 0.47 && ratio <= 0.5);
  assert.ok(CART_THREAT_PRESSURE_STRIKER_SPEED >= 6.4);
  assert.ok(CART_THREAT_PRESSURE_STRIKER_COOLDOWN <= 0.85);
  assert.ok(CART_THREAT_PRESSURE_BOSS_SPEED >= 4.6);
  assert.ok(CART_THREAT_PRESSURE_BOSS_COOLDOWN <= 1);
  assert.ok(CART_THREAT_PRESSURE_FURY_SPEED >= 5.3);
  assert.ok(CART_THREAT_PRESSURE_FURY_COOLDOWN <= 0.6);
});

test("Phase87 reuses the bounded enemy pool and keeps the repaired rendering safety rules", () => {
  assert.match(source, /DODGE WAVE · DOUBLE CHARGE INBOUND/);
  assert.match(source, /CHASE PRESSURE · BREAK AWAY/);
  assert.match(source, /phase87-threat-pressure-root/);
  assert.doesNotMatch(source, /new CartEnemy|enemies\.push|new THREE\.InstancedMesh|setColorAt|instanceColor|TextureLoader/);
});

test("a live Turbo Hunt enters a dodge wave quickly and makes strikers materially more aggressive", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  const enemyCount = session.enemies.length;

  for (let index = 0; index < 52; index += 1) session.step(idleInput, 0.05);
  const pressure = getCartThreatPressureState(session);
  assert.equal(pressure.active, true);
  assert.equal(pressure.kind, "DODGE_WAVE");
  assert.ok(pressure.participantCount >= 1);
  assert.equal(session.enemies.length, enemyCount);

  const aliveStrikers = session.enemies.filter((enemy) => enemy.alive && enemy.archetype === "striker");
  assert.ok(aliveStrikers.length >= 1);
  assert.ok(aliveStrikers.every((enemy) => enemy.moveSpeed >= CART_THREAT_PRESSURE_STRIKER_SPEED));
  assert.ok(aliveStrikers.some((enemy) => (enemy.chargeTime ?? 0) > 0 || (enemy.chargeCooldown ?? 99) <= CART_THREAT_PRESSURE_STRIKER_COOLDOWN + 0.05));
});

test("pressure cadence fills the long gaps around Pursuit events instead of leaving dead air", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  const enemyCount = session.enemies.length;
  for (let index = 0; index < 315; index += 1) session.step(idleInput, 0.05);
  const pressure = getCartThreatPressureState(session);
  assert.ok(pressure.serial >= 2);
  assert.equal(pressure.kind, "CHASE_PRESSURE");
  assert.equal(session.enemies.length, enemyCount);
});

test("Boss pressure is fast outside counter windows and Phase87 never destroys the overheat opening", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  const isolatedPressureGasLife = session as unknown as { gas: number };
  for (let index = 0; index < 3040; index += 1) {
    // This regression owns boss-pressure/counter timing, not survival. Keep
    // GAS life replenished as if recovery cells were collected so the passive
    // test driver does not trigger the real GAS=0 defeat before inspection.
    isolatedPressureGasLife.gas = 1;
    session.step(idleInput, 0.05);
  }
  assert.equal(getCartTurboHuntSnapshot(session)?.huntBossSpawned, true);
  const boss = session.enemies.find((enemy) => enemy.kind === "boss");
  if (!boss) throw new Error("boss missing");

  boss.hp = 250;
  isolatedPressureGasLife.gas = 1;
  session.step(idleInput, 1 / 60);
  assert.equal(getCartTitanBossState(session).stage, "FURY");
  assert.ok(boss.moveSpeed >= CART_THREAT_PRESSURE_FURY_SPEED);
  assert.ok((boss.chargeCooldown ?? 99) <= CART_THREAT_PRESSURE_FURY_COOLDOWN + 0.05 || (boss.chargeTime ?? 0) > 0);

  for (let index = 0; index < 210 && getCartTitanPredatorState(session).mode !== "COUNTER"; index += 1) {
    isolatedPressureGasLife.gas = 1;
    session.step(idleInput, 0.05);
  }
  assert.equal(getCartTitanPredatorState(session).mode, "COUNTER");
  isolatedPressureGasLife.gas = 1;
  session.step(idleInput, 0.05);
  assert.ok(boss.moveSpeed <= 2.1);
  assert.ok((boss.chargeCooldown ?? 0) >= 3.6);
});

test("Phase87 remains before raid, damage, forced dodge and escape wrappers", () => {
  const phase86 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase86BossPredator");
  const phase87 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase87ThreatPressure2");
  const phase88 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase88RaidHazards");
  const phase89 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase89HazardCombatDirector");
  const phase90 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase90TitanRaidBoss4");
  const phase91 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase91DamageFeedback2");
  const phase93 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase93ForcedDodgeTrajectory2");
  const phase94 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase94EscapeRhythmDirector2");
  assert.ok(phase87 > phase86);
  assert.ok(phase88 > phase87);
  assert.ok(phase89 > phase88);
  assert.ok(phase90 > phase89);
  assert.ok(phase91 > phase90);
  assert.ok(phase93 > phase91);
  assert.ok(phase94 > phase93);
  assert.equal(CART_ROGUE_RUNTIME_PHASE_ORDER.at(-1), "CartRoguePhase94EscapeRhythmDirector2");
});

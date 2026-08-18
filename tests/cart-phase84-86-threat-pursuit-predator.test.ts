import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { CART_ROGUE_RUNTIME_PHASE_ORDER } from "../src/cart/CartRogueRuntime";
import { enableCartTurboHunt, getCartTurboHuntSnapshot } from "../src/cart/CartRoguePhase67TurboHunt";
import {
  CART_DODGE_CLEARANCE,
  CART_PERFECT_DODGE_CLEARANCE,
  cartDodgeGradeForClearance,
  cartRelativeMotionClearance,
} from "../src/cart/CartRoguePhase84ThreatDodge";
import {
  CART_PURSUIT_EVENT_ACTIVE_RATIO_LIMIT,
  cartPursuitActiveRatio,
  cartPursuitDuration,
  cartPursuitKindForSerial,
  getCartPursuitEventState,
} from "../src/cart/CartRoguePhase85PursuitEvents";
import {
  CART_TITAN_PREDATOR_CHARGE_COOLDOWN,
  CART_TITAN_PREDATOR_COUNTER_SECONDS,
  CART_TITAN_PREDATOR_SPEED,
  CART_TITAN_PREDATOR_SURVIVE_SECONDS,
  getCartTitanPredatorState,
} from "../src/cart/CartRoguePhase86BossPredator";
import { getCartTitanBossState } from "../src/cart/CartRoguePhase83Boss2";

const phase84Source = readFileSync(new URL("../src/cart/CartRoguePhase84ThreatDodge.ts", import.meta.url), "utf8");
const phase85Source = readFileSync(new URL("../src/cart/CartRoguePhase85PursuitEvents.ts", import.meta.url), "utf8");
const phase86Source = readFileSync(new URL("../src/cart/CartRoguePhase86BossPredator.ts", import.meta.url), "utf8");
const idleInput = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

test("Threat & Dodge grades only a clean near miss as a Perfect Dodge", () => {
  assert.equal(cartDodgeGradeForClearance(-0.01), "NONE");
  assert.equal(cartDodgeGradeForClearance(CART_PERFECT_DODGE_CLEARANCE * 0.7), "PERFECT");
  assert.equal(cartDodgeGradeForClearance((CART_PERFECT_DODGE_CLEARANCE + CART_DODGE_CLEARANCE) * 0.5), "DODGE");
  assert.equal(cartDodgeGradeForClearance(CART_DODGE_CLEARANCE + 0.2), "NONE");

  const collision = cartRelativeMotionClearance(0, 0, 0, 0, -5, 0, 5, 0, 3);
  const nearMiss = cartRelativeMotionClearance(0, 0, 0, 0, -5, 3.7, 5, 3.7, 3);
  assert.ok(collision <= 0);
  assert.equal(cartDodgeGradeForClearance(collision), "NONE");
  assert.equal(cartDodgeGradeForClearance(nearMiss), "PERFECT");
});

test("Phase84 presents threats with bounded low-cost meshes and no unsafe color pipeline", () => {
  assert.match(phase84Source, /phase84-threat-dodge-root/);
  assert.match(phase84Source, /phase84-threat-line/);
  assert.match(phase84Source, /PERFECT DODGE/);
  assert.doesNotMatch(phase84Source, /setColorAt|instanceColor|TextureLoader|new THREE\.InstancedMesh/);
});

test("Pursuit events rotate and spend less than thirty percent of their cycle in escape mode", () => {
  assert.equal(cartPursuitKindForSerial(0), "PURSUIT");
  assert.equal(cartPursuitKindForSerial(1), "DANGER_ZONE");
  assert.equal(cartPursuitKindForSerial(2), "BREAKOUT");
  for (const kind of ["PURSUIT", "DANGER_ZONE", "BREAKOUT"] as const) {
    assert.ok(cartPursuitDuration(kind) >= 5);
    assert.ok(cartPursuitActiveRatio(kind) < CART_PURSUIT_EVENT_ACTIVE_RATIO_LIMIT);
  }
  assert.doesNotMatch(phase85Source, /new CartEnemy|enemies\.push|setColorAt|instanceColor|TextureLoader/);
  assert.match(phase85Source, /session\.enemies\s*\.filter/);
  assert.match(phase85Source, /phase85-danger-zone/);
});

test("a live Pursuit event reuses the bounded enemy pool and resolves without a hard fail", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  const enemyCount = session.enemies.length;
  for (let index = 0; index < 175; index += 1) session.step(idleInput, 0.05);
  let event = getCartPursuitEventState(session);
  assert.equal(event.active, true);
  assert.equal(event.kind, "PURSUIT");
  assert.equal(session.enemies.length, enemyCount);
  for (let index = 0; index < 135; index += 1) session.step(idleInput, 0.05);
  event = getCartPursuitEventState(session);
  assert.equal(event.active, false);
  assert.ok(event.successSerial >= 1);
  assert.equal(session.enemies.length, enemyCount);
});

test("Boss Predator constants keep the survive burst bounded and guarantee a counter window", () => {
  assert.equal(CART_TITAN_PREDATOR_SURVIVE_SECONDS, 7.5);
  assert.equal(CART_TITAN_PREDATOR_COUNTER_SECONDS, 3.2);
  assert.ok(CART_TITAN_PREDATOR_SPEED <= 4.5);
  assert.ok(CART_TITAN_PREDATOR_CHARGE_COOLDOWN >= 0.35);
  assert.doesNotMatch(phase86Source, /setColorAt|instanceColor|TextureLoader|new CartEnemy|enemies\.push/);
  assert.match(phase86Source, /TITAN OVERHEAT · COUNTER WINDOW/);
  assert.match(phase86Source, /boss\.chargeTime = 0/);
  assert.match(phase86Source, /boss\.moveSpeed = 2\.05/);
});

test("live FURY enters Predator survive then hands control back through an overheat counter", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  for (let index = 0; index < 3040; index += 1) session.step(idleInput, 0.05);
  const hunt = getCartTurboHuntSnapshot(session);
  const boss = session.enemies.find((enemy) => enemy.kind === "boss");
  assert.equal(hunt?.huntBossSpawned, true);
  if (!boss) throw new Error("boss missing");

  boss.hp = 250;
  session.step(idleInput, 1 / 60);
  assert.equal(getCartTitanBossState(session).stage, "FURY");
  for (let index = 0; index < 40; index += 1) session.step(idleInput, 0.05);
  let predator = getCartTitanPredatorState(session);
  assert.equal(predator.mode, "SURVIVE");
  assert.equal(predator.active, true);
  assert.ok(boss.moveSpeed >= CART_TITAN_PREDATOR_SPEED);
  assert.ok((boss.chargeCooldown ?? 1) <= CART_TITAN_PREDATOR_CHARGE_COOLDOWN + 0.05);

  for (let index = 0; index < 170 && getCartTitanPredatorState(session).mode === "SURVIVE"; index += 1) {
    session.step(idleInput, 0.05);
  }
  predator = getCartTitanPredatorState(session);
  assert.equal(predator.mode, "COUNTER");
  assert.ok(predator.counterSeconds > 2.8);
  assert.ok(boss.moveSpeed <= 2.1);
  assert.equal(boss.chargeTime, 0);
  assert.equal(boss.weakPointExposed, true);
});

test("Phases 84-91 stay after Boss 2.0 and preserve the repaired environment ordering", () => {
  const phase80 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase80EnvironmentRichness");
  const phase83 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase83Boss2");
  const phase84 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase84ThreatDodge");
  const phase85 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase85PursuitEvents");
  const phase86 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase86BossPredator");
  const phase87 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase87ThreatPressure2");
  const phase88 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase88RaidHazards");
  const phase89 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase89HazardCombatDirector");
  const phase90 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase90TitanRaidBoss4");
  const phase91 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase91DamageFeedback2");
  assert.ok(phase83 > phase80);
  assert.ok(phase84 > phase83);
  assert.ok(phase85 > phase84);
  assert.ok(phase86 > phase85);
  assert.ok(phase87 > phase86);
  assert.ok(phase88 > phase87);
  assert.ok(phase89 > phase88);
  assert.ok(phase90 > phase89);
  assert.ok(phase91 > phase90);
  assert.equal(CART_ROGUE_RUNTIME_PHASE_ORDER.at(-1), "CartRoguePhase91DamageFeedback2");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CART_ROGUE_RUNTIME_PHASE_ORDER } from "../src/cart/CartRogueRuntime";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import {
  CART_TURBO_HUNT_EVENT_CHAIN_CAP,
  CART_TURBO_HUNT_EVENT_CHAIN_THRESHOLDS,
  CART_TURBO_HUNT_OVERDRIVE_HANDLING_MULTIPLIER,
  CART_TURBO_HUNT_OVERDRIVE_MAX_SPEED,
  cartTurboHuntEventKindForRegion,
  getCartTurboHuntEventState,
} from "../src/cart/CartRoguePhase81EventDirector2";
import {
  CART_IMPACT_SPEED_LINE_COUNT,
  cartImpactSpeedFov,
  cartImpactSpeedIntensity,
} from "../src/cart/CartRoguePhase82ImpactSpeed3";
import {
  CART_TITAN_MAX_ARMOR,
  CART_TITAN_MAX_HP,
  cartTitanStageFor,
  getCartTitanBossState,
} from "../src/cart/CartRoguePhase83Boss2";
import { enableCartTurboHunt, getCartTurboHuntSnapshot } from "../src/cart/CartRoguePhase67TurboHunt";
import { CART_TURBO_HUNT_FIELD } from "../src/cart/CartTurboHuntTrack";

const phase81Source = readFileSync(new URL("../src/cart/CartRoguePhase81EventDirector2.ts", import.meta.url), "utf8");
const phase82Source = readFileSync(new URL("../src/cart/CartRoguePhase82ImpactSpeed3.ts", import.meta.url), "utf8");
const phase83Source = readFileSync(new URL("../src/cart/CartRoguePhase83Boss2.ts", import.meta.url), "utf8");

const idleInput = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

test("field events rotate by region and reuse the bounded Turbo Hunt world", () => {
  assert.equal(cartTurboHuntEventKindForRegion("DROP YARD", 0), "SMASH_ZONE");
  assert.equal(cartTurboHuntEventKindForRegion("SMASH GARDEN", 0), "SMASH_ZONE");
  assert.equal(cartTurboHuntEventKindForRegion("SPRINT LANE", 0), "CONVOY");
  assert.equal(cartTurboHuntEventKindForRegion("CROSSFIRE GARDEN", 0), "CHAOS_WAVE");
  assert.equal(cartTurboHuntEventKindForRegion("CROWN GROUNDS", 0), "ELITE_HUNT");
  assert.doesNotMatch(phase81Source, /new CartEnemy|enemies\.push|obstacles\.push|resources\.push/);
  assert.match(phase81Source, /session\.enemies\s*\.filter/);
  assert.match(phase81Source, /session\.obstacles/);
  assert.match(phase81Source, /session\.resources/);
});

test("a live event starts quickly and lays an actionable route inside the giant field", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  for (let index = 0; index < 30; index += 1) session.step(idleInput, 1 / 60);
  const event = getCartTurboHuntEventState(session);
  assert.equal(event.eventActive, true);
  assert.equal(event.eventRegion, "DROP YARD");
  assert.equal(event.eventKind, "SMASH_ZONE");
  assert.ok(event.eventTarget >= 4);
  const activeRocks = session.obstacles.filter((rock) => !rock.destroyed);
  assert.ok(activeRocks.length >= event.eventTarget);
  for (const rock of activeRocks) {
    assert.ok(rock.x >= CART_TURBO_HUNT_FIELD.centerX - CART_TURBO_HUNT_FIELD.halfWidth);
    assert.ok(rock.x <= CART_TURBO_HUNT_FIELD.centerX + CART_TURBO_HUNT_FIELD.halfWidth);
    assert.ok(rock.z >= CART_TURBO_HUNT_FIELD.centerZ - CART_TURBO_HUNT_FIELD.halfDepth);
    assert.ok(rock.z <= CART_TURBO_HUNT_FIELD.centerZ + CART_TURBO_HUNT_FIELD.halfDepth);
  }
});

test("x4/x8/x12 chain thresholds culminate in bounded reversible overdrive", () => {
  assert.deepEqual([...CART_TURBO_HUNT_EVENT_CHAIN_THRESHOLDS], [4, 8, 12]);
  assert.equal(CART_TURBO_HUNT_EVENT_CHAIN_CAP, 16);
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  for (let index = 0; index < 30; index += 1) session.step(idleInput, 1 / 60);
  const baseHandling = session.car.definition.handling;
  const baseMaxSpeed = session.car.definition.maxSpeed;
  session.car.ramCount += 12;
  session.step(idleInput, 1 / 60);
  let event = getCartTurboHuntEventState(session);
  assert.equal(event.eventChain, 12);
  assert.ok(event.overdriveSeconds > 5.8);
  assert.equal(session.car.definition.maxSpeed, CART_TURBO_HUNT_OVERDRIVE_MAX_SPEED);
  assert.ok(Math.abs(session.car.definition.handling - baseHandling * CART_TURBO_HUNT_OVERDRIVE_HANDLING_MULTIPLIER) < 1e-9);

  for (let index = 0; index < 180; index += 1) session.step(idleInput, 1 / 60);
  assert.ok(Math.abs(session.car.definition.handling - baseHandling * CART_TURBO_HUNT_OVERDRIVE_HANDLING_MULTIPLIER) < 1e-9, "handling boost accumulated frame-over-frame");

  for (let index = 0; index < 190; index += 1) session.step(idleInput, 1 / 60);
  event = getCartTurboHuntEventState(session);
  assert.equal(event.overdriveSeconds, 0);
  assert.ok(Math.abs(session.car.definition.handling - baseHandling) < 1e-9);
  assert.ok(Math.abs(session.car.definition.maxSpeed - baseMaxSpeed) < 1e-9);
});

test("Impact & Speed 3.0 expands presentation without unbounded FOV or particle counts", () => {
  assert.equal(CART_IMPACT_SPEED_LINE_COUNT, 12);
  assert.ok(cartImpactSpeedIntensity(0.4, false, 0, 0) < 0.1);
  assert.ok(cartImpactSpeedIntensity(1.1, true, 12, 4) > 0.9);
  assert.ok(cartImpactSpeedFov(0.4, false, 0, 0) >= 56);
  assert.ok(cartImpactSpeedFov(1.4, true, 16, 6) <= 65.5);
  assert.doesNotMatch(phase82Source, /setColorAt|instanceColor|TextureLoader/);
  assert.match(phase82Source, /phase82-impact-speed-root/);
  assert.match(phase82Source, /DynamicDrawUsage/);
});

test("RAM TITAN Boss 2.0 has readable three-stage thresholds", () => {
  assert.equal(CART_TITAN_MAX_HP, 820);
  assert.equal(CART_TITAN_MAX_ARMOR, 4);
  assert.equal(cartTitanStageFor(820, 820), "ARMORED");
  assert.equal(cartTitanStageFor(500, 820), "BREAKOUT");
  assert.equal(cartTitanStageFor(250, 820), "FURY");
  assert.equal(cartTitanStageFor(0, 820), "DOWN");
  assert.doesNotMatch(phase83Source, /setColorAt|instanceColor|TextureLoader/);
  assert.match(phase83Source, /deploySupportWave/);
  assert.match(phase83Source, /dropTurboFuel/);
});

test("live hunt reaches Boss 2.0 fallback and transitions through BREAKOUT and FURY", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  for (let index = 0; index < 3040; index += 1) session.step(idleInput, 0.05);
  const hunt = getCartTurboHuntSnapshot(session);
  const boss = session.enemies.find((enemy) => enemy.kind === "boss");
  assert.equal(hunt?.huntBossSpawned, true);
  assert.ok(boss?.alive);
  assert.equal(boss?.maxHp, CART_TITAN_MAX_HP);
  assert.equal(boss?.armorSegments, CART_TITAN_MAX_ARMOR);
  assert.equal(getCartTitanBossState(session).stage, "ARMORED");

  if (!boss) throw new Error("boss missing");
  boss.hp = 500;
  session.step(idleInput, 1 / 60);
  let titan = getCartTitanBossState(session);
  assert.equal(titan.stage, "BREAKOUT");
  assert.ok(titan.armorSegments >= 2);

  boss.hp = 250;
  session.step(idleInput, 1 / 60);
  titan = getCartTitanBossState(session);
  assert.equal(titan.stage, "FURY");
  assert.equal(titan.armorSegments, 0);
  assert.equal(boss.weakPointExposed, true);

  boss.hp = 0;
  boss.alive = false;
  session.step(idleInput, 1 / 60);
  assert.equal(getCartTitanBossState(session).stage, "DOWN");
});

test("Phases 81-83 stay after the repaired environment and before later hunt evolution", () => {
  const phase80 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase80EnvironmentRichness");
  const phase81 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase81EventDirector2");
  const phase82 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase82ImpactSpeed3");
  const phase83 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase83Boss2");
  const phase84 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase84ThreatDodge");
  assert.ok(phase81 > phase80);
  assert.ok(phase82 > phase81);
  assert.ok(phase83 > phase82);
  assert.ok(phase84 > phase83);
});

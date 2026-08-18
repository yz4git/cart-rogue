import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { CART_ROGUE_RUNTIME_PHASE_ORDER } from "../src/cart/CartRogueRuntime";
import { enableCartTurboHunt } from "../src/cart/CartRoguePhase67TurboHunt";
import { getCartRaidHazardState } from "../src/cart/CartRoguePhase88RaidHazards";
import {
  CART_FORCED_DODGE_LOCK_MAX_SECONDS,
  CART_FORCED_DODGE_LOCK_MIN_SECONDS,
  CART_FORCED_DODGE_LABEL_PREFIX,
  cartForcedDodgePredictedPoint,
  getCartForcedDodgeTrajectoryState,
} from "../src/cart/CartRoguePhase93ForcedDodgeTrajectory2";
import {
  CART_ESCAPE_COOLDOWN,
  CART_ESCAPE_DURATION,
  CART_ESCAPE_INITIAL_DELAY,
  CART_ESCAPE_OPENING_GRACE,
  CART_ESCAPE_PURSUER_SPEED,
  getCartEscapeRhythmState,
} from "../src/cart/CartRoguePhase94EscapeRhythmDirector2";

const phase93Source = readFileSync(new URL("../src/cart/CartRoguePhase93ForcedDodgeTrajectory2.ts", import.meta.url), "utf8");
const phase94Source = readFileSync(new URL("../src/cart/CartRoguePhase94EscapeRhythmDirector2.ts", import.meta.url), "utf8");
const readabilitySource = readFileSync(new URL("../app/CartCombatReadabilityPass.tsx", import.meta.url), "utf8");
const readabilityCss = readFileSync(new URL("../app/CartCombatReadabilityPass.module.css", import.meta.url), "utf8");
const design = readFileSync(new URL("../docs/FORCED_DODGE_ESCAPE_93_95.md", import.meta.url), "utf8");

const driveStraight = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const idleInput = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

test("Phase93 predicts the no-new-evasion trajectory ahead of a moving car", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  session.car.forwardVelocity = 16;
  session.car.speed = 16;
  const startX = session.car.position.x;
  const startZ = session.car.position.z;
  const point = cartForcedDodgePredictedPoint(session, driveStraight, 0.9);
  assert.ok(point.travel > 14);
  assert.ok(Math.hypot(point.x - startX, point.z - startZ) > 10);
  assert.ok(CART_FORCED_DODGE_LOCK_MIN_SECONDS >= 0.7);
  assert.ok(CART_FORCED_DODGE_LOCK_MAX_SECONDS <= 1.1);
});

test("a live FIELD telegraph is replaced once at LOCK with a forced intercept", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  for (let index = 0; index < 70; index += 1) session.step(driveStraight, 0.05);
  const forced = getCartForcedDodgeTrajectoryState(session);
  const raid = getCartRaidHazardState(session);
  assert.ok(forced.correctedSerial >= 1, JSON.stringify({ forced, raid }));
  assert.ok(forced.lockSeconds >= CART_FORCED_DODGE_LOCK_MIN_SECONDS);
  assert.ok(raid.hazards.some((hazard) => hazard.source === "FIELD" && hazard.label.startsWith(CART_FORCED_DODGE_LABEL_PREFIX)) || raid.hitSerial >= 1);
});

test("passive straight driving is punishable within the opening raid cycle", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  for (let index = 0; index < 135; index += 1) session.step(driveStraight, 0.05);
  const raid = getCartRaidHazardState(session);
  assert.ok(raid.hitSerial >= 1, `straight driving should be hit, got ${JSON.stringify(raid)}`);
});

test("Phase94 begins an unmistakable escape sequence inside the first ten seconds", () => {
  assert.ok(CART_ESCAPE_INITIAL_DELAY <= 6.5);
  assert.ok(CART_ESCAPE_COOLDOWN <= 16);
  assert.ok(CART_ESCAPE_DURATION >= 6);
  assert.ok(CART_ESCAPE_OPENING_GRACE >= 1.5);
  assert.ok(CART_ESCAPE_PURSUER_SPEED >= 8);

  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  const enemyCount = session.enemies.length;
  for (let index = 0; index < 130; index += 1) session.step(idleInput, 0.05);
  const escape = getCartEscapeRhythmState(session);
  assert.equal(escape.active, true, JSON.stringify(escape));
  assert.equal(escape.serial, 1);
  assert.equal(escape.kind, "PURSUIT");
  assert.ok(escape.participantCount >= 2);
  assert.equal(session.enemies.length, enemyCount);
});

test("Phase94 returns after recovery without allocating new enemies", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  const enemyCount = session.enemies.length;
  for (let index = 0; index < 610; index += 1) session.step(idleInput, 0.05);
  const escape = getCartEscapeRhythmState(session);
  assert.ok(escape.serial >= 2, JSON.stringify(escape));
  assert.equal(session.enemies.length, enemyCount);
});

test("Phases 93-95 preserve fixed pools and put danger readability ahead of reward clutter", () => {
  assert.doesNotMatch(phase93Source, /new CartEnemy|enemies\.push|new THREE\.InstancedMesh|setColorAt|instanceColor|TextureLoader/);
  assert.doesNotMatch(phase94Source, /new CartEnemy|enemies\.push|new THREE\.InstancedMesh|setColorAt|instanceColor|TextureLoader/);
  assert.match(phase94Source, /phase94-escape-rhythm-root/);
  assert.match(readabilitySource, /combo/);
  assert.match(readabilitySource, /ramBanner/);
  assert.match(readabilitySource, /rewardBanner/);
  assert.match(readabilitySource, /Escape rhythm status/);
  assert.match(readabilityCss, /escapeBadge/);
  assert.match(design, /passive straight driving must be punishable/);
  assert.match(design, /ordinary first 10 seconds visibly contains an ESCAPE sequence/);
});

test("forced dodge and escape wrappers follow damage feedback in runtime order", () => {
  const phase91 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase91DamageFeedback2");
  const phase93 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase93ForcedDodgeTrajectory2");
  const phase94 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase94EscapeRhythmDirector2");
  assert.ok(phase93 > phase91);
  assert.ok(phase94 > phase93);
  assert.equal(CART_ROGUE_RUNTIME_PHASE_ORDER.at(-1), "CartRoguePhase94EscapeRhythmDirector2");
});

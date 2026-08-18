import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { CART_ROGUE_RUNTIME_PHASE_ORDER } from "../src/cart/CartRogueRuntime";
import { enableCartTurboHunt } from "../src/cart/CartRoguePhase67TurboHunt";
import {
  getCartRaidHazardState,
  queueCartRaidHazard,
  type CartRaidHazardKind,
} from "../src/cart/CartRoguePhase88RaidHazards";
import {
  CART_FORCED_DODGE_CIRCLE_RADIUS,
  CART_FORCED_DODGE_CONE_RADIUS,
  CART_FORCED_DODGE_CROSS_WIDTH,
  CART_FORCED_DODGE_FINAL_LOCK_SECONDS,
  CART_FORCED_DODGE_LINE_WIDTH,
  CART_FORCED_DODGE_LOCK_MAX_SECONDS,
  CART_FORCED_DODGE_LOCK_MIN_SECONDS,
  CART_FORCED_DODGE_LABEL_PREFIX,
  CART_FORCED_DODGE_REACTION_BRAKE_THRESHOLD,
  CART_FORCED_DODGE_REACTION_STEER_THRESHOLD,
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
const evadeRight = { throttle: 1, brake: 1, steer: 1, boost: false } as const;
const evadeLeft = { throttle: 1, brake: 1, steer: -1, boost: false } as const;
const idleInput = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

function queueShape(session: CartArenaSession, kind: CartRaidHazardKind): void {
  const spec = kind === "LINE"
    ? { kind, source: "FIELD" as const, label: "TEST LINE", width: 8.6, length: 32, telegraphSeconds: 1.25 }
    : kind === "CIRCLE"
      ? { kind, source: "FIELD" as const, label: "TEST CIRCLE", radius: 11.4, telegraphSeconds: 1.25 }
      : kind === "CROSS"
        ? { kind, source: "FIELD" as const, label: "TEST CROSS", width: 6.8, length: 36, telegraphSeconds: 1.25 }
        : kind === "CONE"
          ? { kind, source: "FIELD" as const, label: "TEST CONE", radius: 25, coneAngle: Math.PI * 0.5, telegraphSeconds: 1.25 }
          : { kind, source: "FIELD" as const, label: "TEST DONUT", innerRadius: 5.5, outerRadius: 15.4, telegraphSeconds: 1.25 };
  assert.notEqual(queueCartRaidHazard(session, spec), null);
}

function runExplicitEvasion(kind: CartRaidHazardKind, steer: -1 | 1): ReturnType<typeof getCartRaidHazardState> {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  session.car.forwardVelocity = 14;
  session.car.speed = 14;
  queueShape(session, kind);
  session.step(driveStraight, 0.05);
  const forced = getCartForcedDodgeTrajectoryState(session);
  assert.ok(forced.correctedSerial >= 1, `${kind} did not become a forced lock`);

  let raid = getCartRaidHazardState(session);
  assert.ok(
    raid.hazards.some((hazard) => hazard.source === "FIELD" && hazard.label.startsWith(CART_FORCED_DODGE_LABEL_PREFIX)),
    `${kind} did not expose the forced first beat`,
  );

  const evasion = steer > 0 ? evadeRight : evadeLeft;
  const startingResults = raid.hitSerial + raid.clearSerial;
  for (let index = 0; index < 32; index += 1) {
    session.step(evasion, 0.05);
    raid = getCartRaidHazardState(session);
    // Phase97 intentionally continues after this result. Stop at the first
    // resolved hazard so this historical test still answers its original
    // question: is the forced first beat itself fairly escapable?
    if (raid.hitSerial + raid.clearSerial > startingResults) break;
  }
  return raid;
}

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
  assert.ok(CART_FORCED_DODGE_LOCK_MIN_SECONDS >= 0.9);
  assert.ok(CART_FORCED_DODGE_LOCK_MAX_SECONDS <= 1.1);
  assert.ok(CART_FORCED_DODGE_FINAL_LOCK_SECONDS >= 0.75);
  assert.ok(CART_FORCED_DODGE_FINAL_LOCK_SECONDS < CART_FORCED_DODGE_LOCK_MIN_SECONDS);
});

test("forced hazard dimensions punish a centered straight line without consuming the whole escape corridor", () => {
  assert.ok(CART_FORCED_DODGE_LINE_WIDTH <= 9);
  assert.ok(CART_FORCED_DODGE_CROSS_WIDTH <= 6.5);
  assert.ok(CART_FORCED_DODGE_CIRCLE_RADIUS <= 7.5);
  assert.ok(CART_FORCED_DODGE_CONE_RADIUS <= 20);
  assert.ok(CART_FORCED_DODGE_REACTION_STEER_THRESHOLD <= 0.45);
  assert.ok(CART_FORCED_DODGE_REACTION_BRAKE_THRESHOLD <= 0.35);
});

test("a live FIELD telegraph is replaced once at LOCK with a forced intercept", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  for (let index = 0; index < 70; index += 1) session.step(driveStraight, 0.05);
  const forced = getCartForcedDodgeTrajectoryState(session);
  const raid = getCartRaidHazardState(session);
  assert.ok(forced.correctedSerial >= 1, JSON.stringify({ forced, raid }));
  assert.ok(forced.lockSeconds >= CART_FORCED_DODGE_LOCK_MIN_SECONDS);
  assert.ok(
    raid.hazards.some((hazard) => hazard.source === "FIELD" && hazard.label.startsWith(CART_FORCED_DODGE_LABEL_PREFIX))
      || raid.hitSerial + raid.clearSerial >= 1,
    JSON.stringify({ forced, raid }),
  );
});

test("same-frame early dodge input cannot drag the forced target toward the dodge", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  session.car.forwardVelocity = 14;
  session.car.speed = 14;
  queueShape(session, "LINE");

  // This mirrors the WebGL/UI race: the player sees ordinary LOCK and already
  // has steer+brake held by the frame Phase93 replaces it with forced LOCK.
  session.step(evadeRight, 0.05);
  const forced = getCartForcedDodgeTrajectoryState(session);
  assert.ok(forced.correctedSerial >= 1, JSON.stringify(forced));

  const straight = cartForcedDodgePredictedPoint(session, driveStraight, forced.lockSeconds);
  const evading = cartForcedDodgePredictedPoint(session, evadeRight, forced.lockSeconds);
  const forcedToStraight = Math.hypot(forced.predictedX - straight.x, forced.predictedZ - straight.z);
  const forcedToEvading = Math.hypot(forced.predictedX - evading.x, forced.predictedZ - evading.z);
  assert.ok(forcedToStraight < forcedToEvading, JSON.stringify({ forced, straight, evading, forcedToStraight, forcedToEvading }));

  let raid = getCartRaidHazardState(session);
  for (let index = 0; index < 32 && raid.hazards.some((hazard) => hazard.source === "FIELD"); index += 1) {
    session.step(evadeRight, 0.05);
    raid = getCartRaidHazardState(session);
  }
  assert.equal(raid.hitSerial, 0, JSON.stringify(raid));
});

test("passive straight driving is punishable within the opening raid cycle", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  for (let index = 0; index < 135; index += 1) session.step(driveStraight, 0.05);
  const raid = getCartRaidHazardState(session);
  assert.ok(raid.hitSerial >= 1, `straight driving should be hit, got ${JSON.stringify(raid)}`);
});

test("explicit steer plus brake can escape the first beat of every forced FIELD raid shape from either side", () => {
  for (const kind of ["LINE", "CIRCLE", "CROSS", "CONE", "DONUT"] as const) {
    for (const steer of [-1, 1] as const) {
      const raid = runExplicitEvasion(kind, steer);
      assert.equal(raid.hitSerial, 0, `${kind} steer ${steer} first beat should be escapable: ${JSON.stringify(raid)}`);
      assert.ok(raid.clearSerial + raid.perfectDodgeSerial >= 1, `${kind} steer ${steer} first beat should resolve as a dodge`);
    }
  }
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
  assert.match(phase93Source, /applyReactionAssist/);
  assert.match(phase93Source, /softTrackPassiveLine/);
  assert.match(phase93Source, /passivePredictionInput/);
  assert.match(phase94Source, /phase94-escape-rhythm-root/);
  assert.match(readabilitySource, /combo/);
  assert.match(readabilitySource, /ramBanner/);
  assert.match(readabilitySource, /wallRide/);
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

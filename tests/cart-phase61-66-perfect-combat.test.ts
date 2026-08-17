import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "../src/cart/CartRogueRuntime";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import {
  cartPerfectStrikeBonusDamage,
  getCartPerfectStrikeState,
} from "../src/cart/CartRoguePhase61PerfectStrike";
import {
  cartPerfectShockwaveDamage,
  cartPerfectShockwaveRadius,
  getCartPerfectShockwaveState,
} from "../src/cart/CartRoguePhase62PerfectShockwave";
import {
  cartTurboAimAssistCorrection,
  getCartTurboAimAssistState,
} from "../src/cart/CartRoguePhase63TurboAimAssist";
import {
  cartTurboHitStunSeconds,
  getCartTurboHitStunState,
} from "../src/cart/CartRoguePhase64TurboHitStun";
import {
  cartTurboChainRewardThresholds,
  CART_TURBO_CHAIN_REWARD_THRESHOLDS,
} from "../src/cart/CartRoguePhase66TurboChainReward";

const HOLD = { throttle: 0, brake: 0, steer: 0, boost: true } as const;
const RELEASE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;
const visualSource = readFileSync(new URL("../src/cart/CartRoguePhase65PerfectCombatVisual.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");

function preparePerfectStrike(session: CartArenaSession) {
  for (const enemy of session.enemies) {
    enemy.alive = false;
    enemy.moveSpeed = 0;
  }
  for (const obstacle of session.obstacles) obstacle.destroyed = true;

  session.car.position.set(0, session.car.position.y, 28);
  session.car.heading = 0.18;
  session.car.forwardVelocity = 0;
  session.car.lateralVelocity = 0;
  session.car.velocity.x = 0;
  session.car.velocity.z = 0;

  const primary = session.enemies[0];
  primary.nodeId = "arena-01";
  primary.kind = "heavy";
  primary.archetype = undefined;
  primary.radius = 1.9;
  primary.maxHp = 360;
  primary.hp = 360;
  primary.alive = true;
  primary.x = 0;
  primary.z = 34.2;
  primary.heading = Math.PI;
  primary.moveSpeed = 0;

  const secondary = session.enemies[1];
  secondary.nodeId = "arena-01";
  secondary.kind = "chaser";
  secondary.archetype = "standard";
  secondary.radius = 1.65;
  secondary.maxHp = 140;
  secondary.hp = 140;
  secondary.alive = true;
  secondary.x = 4.05;
  secondary.z = 34.15;
  secondary.heading = Math.PI;
  secondary.moveSpeed = 0;
  return { primary, secondary };
}

test("Phase 61 perfect strike bonus rewards precision without flattening heavy/boss balance", () => {
  const normal = cartPerfectStrikeBonusDamage(120, 1, "chaser");
  const heavy = cartPerfectStrikeBonusDamage(120, 1, "heavy");
  const boss = cartPerfectStrikeBonusDamage(120, 1, "boss");
  assert.ok(normal > heavy);
  assert.ok(heavy > boss);
  assert.ok(cartPerfectStrikeBonusDamage(120, 1, "chaser") > cartPerfectStrikeBonusDamage(120, 0.88, "chaser"));
});

test("Phase 62 shockwave is bounded and keeps boss splash deliberately softer", () => {
  assert.ok(cartPerfectShockwaveRadius(1) > cartPerfectShockwaveRadius(0));
  const center = cartPerfectShockwaveDamage(1, 0, "chaser");
  const edge = cartPerfectShockwaveDamage(1, 1, "chaser");
  const boss = cartPerfectShockwaveDamage(1, 0, "boss");
  assert.ok(center > edge);
  assert.ok(edge > 0);
  assert.ok(boss < center);
});

test("Phase 63 mobile aim assist is narrow, charge-gated and yields to deliberate steering", () => {
  const assisted = cartTurboAimAssistCorrection(0, 0.24, 1, 0.1);
  assert.ok(assisted > 0 && assisted <= 0.13);
  assert.equal(cartTurboAimAssistCorrection(0, 0.24, 0.4, 0.1), 0);
  assert.equal(cartTurboAimAssistCorrection(0, 0.24, 1, 0.9), 0);
  assert.equal(cartTurboAimAssistCorrection(0, 0.8, 1, 0), 0);
});

test("Phase 64 hit stun is short for normal enemies and strongly reduced for bosses", () => {
  const normal = cartTurboHitStunSeconds({ kind: "chaser", archetype: "standard" }, false);
  const shock = cartTurboHitStunSeconds({ kind: "chaser", archetype: "standard" }, true);
  const boss = cartTurboHitStunSeconds({ kind: "boss", archetype: "standard" }, true);
  assert.ok(shock > normal);
  assert.ok(normal < 0.3);
  assert.ok(boss < normal);
});

test("Phases 61-64 turn a precise charged release into assist, perfect bonus, splash and hit stun", () => {
  const session = new CartArenaSession();
  try {
    const { primary, secondary } = preparePerfectStrike(session);
    const primaryHp = primary.hp;
    const secondaryHp = secondary.hp;
    // Keep the authored targets fixed while the player charges. Restore real
    // movement speeds only for the release frame so the same integration test
    // still proves that Phase 64 actively zeros them during hit stun.
    for (let frame = 0; frame < 52; frame += 1) session.step(HOLD);
    primary.moveSpeed = 2.2;
    secondary.moveSpeed = 4.2;
    session.step(RELEASE);

    const aim = getCartTurboAimAssistState(session);
    const perfect = getCartPerfectStrikeState(session);
    const shock = getCartPerfectShockwaveState(session);
    const stun = getCartTurboHitStunState(session);
    assert.ok(aim.aimSerial >= 1, `expected release aim assist: ${JSON.stringify(aim)}`);
    assert.ok(Math.abs(aim.lastCorrection) > 0);
    assert.ok(perfect.perfectSerial >= 1, `expected perfect strike: ${JSON.stringify(perfect)}`);
    assert.equal(perfect.lastEnemyId, primary.id);
    assert.ok(perfect.lastBonusDamage > 0);
    assert.ok(primary.hp < primaryHp);
    assert.ok(shock.shockSerial >= 1, `expected perfect shockwave: ${JSON.stringify(shock)}`);
    assert.ok(shock.lastHitEnemyIds.includes(secondary.id));
    assert.ok(secondary.hp < secondaryHp);
    assert.ok(stun.activeCount >= 1, `expected post-hit stun: ${JSON.stringify(stun)}`);
    assert.equal(secondary.moveSpeed, 0);
  } finally {
    session.dispose();
  }
});

test("Phase 66 refills Turbo only when a Flow chain crosses authored milestones", () => {
  assert.deepEqual(CART_TURBO_CHAIN_REWARD_THRESHOLDS, [4, 7]);
  assert.deepEqual(cartTurboChainRewardThresholds(0, 3), []);
  assert.deepEqual(cartTurboChainRewardThresholds(3, 4), [4]);
  assert.deepEqual(cartTurboChainRewardThresholds(4, 7), [7]);
  assert.deepEqual(cartTurboChainRewardThresholds(3, 8), [4, 7]);
  assert.deepEqual(cartTurboChainRewardThresholds(7, 7), []);
});

test("Phase 65 feedback remains procedural and Phase 61-66 runtime order is explicit", () => {
  assert.match(visualSource, /phase65-perfect-combat-feedback/);
  assert.match(visualSource, /RingGeometry/);
  assert.match(visualSource, /BoxGeometry/);
  assert.doesNotMatch(visualSource, /TextureLoader|CanvasTexture|\.map\s*=/);

  const phases = [
    "CartRoguePhase61PerfectStrike",
    "CartRoguePhase62PerfectShockwave",
    "CartRoguePhase63TurboAimAssist",
    "CartRoguePhase64TurboHitStun",
    "CartRoguePhase65PerfectCombatVisual",
    "CartRoguePhase66TurboChainReward",
  ];
  let previousIndex = runtimeSource.indexOf("CartRoguePhase60TurboCombatSafety");
  for (const phase of phases) {
    const index = runtimeSource.indexOf(phase);
    assert.ok(index > previousIndex, `${phase} must follow the previous phase`);
    previousIndex = index;
  }
});

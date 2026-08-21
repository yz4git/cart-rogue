import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cartTurboSmashCanReach } from "../src/cart/CartRoguePhase56TurboSmash";
import {
  CART_PHASE109_DAMAGE_CUTIN_COOLDOWN_MS,
  CART_PHASE109_DAMAGE_CUTIN_LINES,
  CART_PHASE109_TURBO_DRIFT_MIN_ROLL_SPEED,
  cartPhase109DeceleratingTurboVelocity,
} from "../src/cart/CartRoguePhase109HandlingSmashDamage";

const phase109Source = readFileSync(new URL("../src/cart/CartRoguePhase109HandlingSmashDamage.ts", import.meta.url), "utf8");
const menuRuntimeSource = readFileSync(new URL("../src/cart/CartGameMenuRuntime.ts", import.meta.url), "utf8");
const operatorMixSource = readFileSync(new URL("../src/cart/CartRoguePhase102OperatorMix.ts", import.meta.url), "utf8");

test("Turbo hold preserves a moving deceleration curve instead of collapsing into a stationary drift", () => {
  let velocity = 16;
  for (let frame = 0; frame < 60; frame += 1) {
    velocity = cartPhase109DeceleratingTurboVelocity(velocity, velocity * 0.75, 1 / 60);
  }
  assert.ok(velocity < 16, `expected deceleration, got ${velocity}`);
  assert.ok(velocity > 8.5, `one second of hold should still be moving, got ${velocity}`);

  for (let frame = 0; frame < 240; frame += 1) {
    velocity = cartPhase109DeceleratingTurboVelocity(velocity, 0, 1 / 60);
  }
  assert.ok(velocity >= CART_PHASE109_TURBO_DRIFT_MIN_ROLL_SPEED - 0.001);

  const reverse = cartPhase109DeceleratingTurboVelocity(-10, -2, 1 / 60);
  assert.ok(reverse < 0, "reverse-direction drift must preserve its sign");
  assert.ok(Math.abs(reverse) < 10 && Math.abs(reverse) > 9.8);
});

test("Turbo Smash accepts close contact / overlap instead of dropping the destructible target", () => {
  const closeRock = { x: 0.1, z: 1.0, radius: 1.8, destroyed: false } as const;
  assert.equal(cartTurboSmashCanReach(0, 0, 0, 0.5, closeRock), true);

  const distantBehindRock = { x: 0, z: -8, radius: 1.8, destroyed: false } as const;
  assert.equal(cartTurboSmashCanReach(0, 0, 0, 0.5, distantBehindRock), false);
});

test("damage has a dedicated cut-in definition with deterministic dialogue rotation", () => {
  assert.ok(CART_PHASE109_DAMAGE_CUTIN_COOLDOWN_MS >= 2000);
  assert.ok(CART_PHASE109_DAMAGE_CUTIN_LINES.length >= 3);
  assert.match(phase109Source, /priority: 82/);
  assert.match(phase109Source, /damage\.hitSerial > state\.seenDamageHitSerial/);
  assert.match(phase109Source, /enqueueDamageCutin\(state\)/);
  assert.match(operatorMixSource, /detail\.id in CART_CUTIN_SPEAKER_CYCLES/);
});

test("Phase109 is composed after Phase108 so the final runtime owns the drift correction", () => {
  const phase108 = menuRuntimeSource.indexOf('import "./CartRoguePhase108CoreLoopRebuild";');
  const phase109 = menuRuntimeSource.indexOf('import "./CartRoguePhase109HandlingSmashDamage";');
  assert.ok(phase108 >= 0);
  assert.ok(phase109 > phase108);
  assert.match(phase109Source, /input\.boost/);
  assert.match(phase109Source, /cartTraversalSyncHorizontalVelocity/);
});

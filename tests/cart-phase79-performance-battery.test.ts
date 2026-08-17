import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CART_BATTERY_DPR_CAP,
  cartBatteryDprBounds,
  cartBatteryNextDpr,
} from "../src/cart/CartRoguePhase79PerformanceBattery";
import { CART_ROGUE_RUNTIME_PHASE_ORDER } from "../src/cart/CartRogueRuntime";

const performanceSource = readFileSync(new URL("../src/cart/CartRoguePhase79PerformanceBattery.ts", import.meta.url), "utf8");
const environmentSource = readFileSync(new URL("../src/cart/CartRoguePhase80EnvironmentRichness.ts", import.meta.url), "utf8");
const combatSource = readFileSync(new URL("../src/cart/CartCombat.ts", import.meta.url), "utf8");
const webglSource = readFileSync(new URL("../src/cart/CartRogueWebGLDemo.ts", import.meta.url), "utf8");

test("battery DPR keeps a narrow Retina-quality range", () => {
  assert.equal(CART_BATTERY_DPR_CAP, 1.35);
  assert.deepEqual(cartBatteryDprBounds(1), { min: 1, max: 1 });
  const retina = cartBatteryDprBounds(3);
  assert.equal(retina.max, 1.35);
  assert.ok(retina.min >= 1.2);
  assert.ok(retina.max - retina.min <= 0.15);
});

test("adaptive DPR only drops under sustained load and stays bounded", () => {
  const { min, max } = cartBatteryDprBounds(3);
  assert.equal(cartBatteryNextDpr(max, min, max, 16.7, 3, 0), max);
  const loaded = cartBatteryNextDpr(max, min, max, 19.2, 1.6, 0);
  assert.ok(loaded < max);
  assert.ok(loaded >= min);
  const severe = cartBatteryNextDpr(max, min, max, 24, 0.8, 0);
  assert.ok(severe < loaded);
  assert.ok(severe >= min);
  const recovered = cartBatteryNextDpr(loaded, min, max, 14, 0, 5.2);
  assert.ok(recovered > loaded);
  assert.ok(recovered <= max);
});

test("performance phase freezes expensive shadow-map updates but retains authored contact shadows", () => {
  assert.match(performanceSource, /shadowMap\.autoUpdate = false/);
  assert.match(performanceSource, /shadowMap\.needsUpdate = true/);
  assert.match(performanceSource, /disableDynamicShadowCasting/);
  assert.match(webglSource, /addContactShadow\(group/);
  assert.match(webglSource, /addContactShadow\(parent/);
});

test("pause suspends RAF instead of waking every display refresh", () => {
  assert.match(performanceSource, /cancelAnimationFrame\(this\.frameId\)/);
  assert.match(performanceSource, /requestAnimationFrame\(this\.animate\)/);
  assert.match(performanceSource, /rafSuspended/);
});

test("gameplay quality protections remain intact", () => {
  assert.doesNotMatch(performanceSource, /CartArenaSession\.prototype\.step/);
  assert.doesNotMatch(performanceSource, /enemies\.splice/);
  assert.doesNotMatch(performanceSource, /DUST_COUNT\s*=/);
  assert.match(combatSource, /activationDistance/);
  assert.match(combatSource, /distance > activationDistance/);
});

test("environment richness does not override battery frame authority", () => {
  assert.doesNotMatch(environmentSource, /\.updateVisuals\s*=/);
  assert.doesNotMatch(environmentSource, /requestAnimationFrame|setPixelRatio|shadowMap\.autoUpdate/);
  const phase78 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase78TurboHuntPresentationGuard");
  const phase79 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase79PerformanceBattery");
  const phase80 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase80EnvironmentRichness");
  assert.ok(phase79 > phase78);
  assert.ok(phase80 > phase79);
});

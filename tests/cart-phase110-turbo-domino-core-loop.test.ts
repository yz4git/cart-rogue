import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CART_PHASE110_HUNTED_HEAT,
  CART_PHASE110_TITAN_HEAT,
  cartPhase110HeatGain,
  cartPhase110HeatLevel,
  cartPhase110PressureMultiplier,
  cartPhase110ShouldTriggerTitan,
} from "../src/cart/CartRoguePhase110TurboDominoCoreLoop";

const bridgeSource = readFileSync(new URL("../src/cart/CartRoguePhase108CoreLoopBridge.ts", import.meta.url), "utf8");
const phase110Source = readFileSync(new URL("../src/cart/CartRoguePhase110TurboDominoCoreLoop.ts", import.meta.url), "utf8");
const menuRuntimeSource = readFileSync(new URL("../src/cart/CartGameMenuRuntime.ts", import.meta.url), "utf8");

test("Domino heat rewards continuous RAM/SMASH chains and exposes five pressure bands", () => {
  const single = cartPhase110HeatGain(1, 1, 0, 1);
  const chained = cartPhase110HeatGain(1, 1, 1, 4);
  assert.ok(single > 0);
  assert.ok(chained > single * 1.5);
  assert.equal(cartPhase110HeatLevel(0), 1);
  assert.equal(cartPhase110HeatLevel(22), 2);
  assert.equal(cartPhase110HeatLevel(44), 3);
  assert.equal(cartPhase110HeatLevel(CART_PHASE110_HUNTED_HEAT), 4);
  assert.equal(cartPhase110HeatLevel(88), 5);
});

test("HUNTED pressure is stronger but remains bounded for iPhone-friendly tactical readability", () => {
  const normal = cartPhase110PressureMultiplier(3, false);
  const hunted = cartPhase110PressureMultiplier(3, true);
  const max = cartPhase110PressureMultiplier(5, true);
  assert.ok(hunted > normal);
  assert.ok(max <= 1.28);
});

test("Titan requires HEAT MAX plus a hunted beat, with a long-run domino fallback", () => {
  assert.equal(cartPhase110ShouldTriggerTitan(CART_PHASE110_TITAN_HEAT, 0.5, 12), false);
  assert.equal(cartPhase110ShouldTriggerTitan(CART_PHASE110_TITAN_HEAT, 3.0, 12), true);
  assert.equal(cartPhase110ShouldTriggerTitan(40, 0, 22), true);
});

test("Phase110 supersedes Phase108 session progression while retaining its presentation import", () => {
  assert.match(bridgeSource, /prePhase108Step/);
  assert.match(bridgeSource, /prePhase108Snapshot/);
  assert.match(phase110Source, /restoreCartPrePhase108CoreLoopSessionMethods\(\)/);
  assert.match(phase110Source, /installCartRoguePhase109HandlingSmashDamage\(\)/);
  assert.match(phase110Source, /setCartTurboHuntExternalProgressionEnabled\(true\)/);
  assert.match(menuRuntimeSource, /CartRoguePhase108CoreLoopBridge/);
  assert.match(menuRuntimeSource, /CartRoguePhase108CoreLoopRebuild/);
});

test("Phase110 is composed after Phase109 and drives TARGET -> CHAIN -> HUNTED -> COUNTERATTACK -> TITAN", () => {
  const phase109 = menuRuntimeSource.indexOf('import "./CartRoguePhase109HandlingSmashDamage";');
  const phase110 = menuRuntimeSource.indexOf('import "./CartRoguePhase110TurboDominoCoreLoop";');
  assert.ok(phase109 >= 0);
  assert.ok(phase110 > phase109);
  assert.match(phase110Source, /"TARGET"/);
  assert.match(phase110Source, /"CHAIN"/);
  assert.match(phase110Source, /"HUNTED"/);
  assert.match(phase110Source, /"COUNTERATTACK"/);
  assert.match(phase110Source, /"TITAN"/);
  assert.doesNotMatch(phase110Source, /Math\.random/);
});

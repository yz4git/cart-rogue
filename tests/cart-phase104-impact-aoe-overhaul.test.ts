import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CART_PHASE104_AOE_FX_SLOTS,
  CART_PHASE104_REDUCED_FX_FRAME_MS,
  CART_PHASE104_SEGMENTS_PER_AOE,
  cartPhase104AoeCameraKick,
  cartPhase104AoeExtent,
  cartPhase104AoeUrgency,
  cartPhase104FxQuality,
} from "../src/cart/CartRoguePhase104ImpactAoeOverhaul";

const source = readFileSync(new URL("../src/cart/CartRoguePhase104ImpactAoeOverhaul.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/cart/CartGameMenuRuntime.ts", import.meta.url), "utf8");

test("Phase104 keeps AOE presentation in the same fixed four-slot budget", () => {
  assert.equal(CART_PHASE104_AOE_FX_SLOTS, 4);
  assert.equal(CART_PHASE104_SEGMENTS_PER_AOE, 4);
  assert.match(source, /fixedAoeFxSlots/);
  assert.match(source, /sharedFixedPools/);
  assert.doesNotMatch(source, /new THREE\.PointLight/);
  assert.doesNotMatch(source, /EffectComposer|UnrealBloomPass|postprocessing/i);
});

test("Phase104 AOE countdown becomes more urgent without changing gameplay timing", () => {
  assert.equal(cartPhase104AoeUrgency(1.35, 1.35), 0);
  assert.ok(Math.abs(cartPhase104AoeUrgency(0.675, 1.35) - 0.5) < 0.0001);
  assert.equal(cartPhase104AoeUrgency(0, 1.35), 1);
  assert.equal(cartPhase104AoeUrgency(-1, 1.35), 1);
  assert.doesNotMatch(source, /CartArenaSession\.prototype/);
  assert.doesNotMatch(source, /queueCartRaidHazard\s*\(/);
  assert.doesNotMatch(source, /cartPointInRaidHazard\s*\(/);
});

test("Phase104 derives readable effect extents from the real hazard footprint", () => {
  const base = {
    width: 7,
    length: 28,
    radius: 10,
    outerRadius: 15,
  };
  assert.equal(cartPhase104AoeExtent({ ...base, kind: "CIRCLE" }), 10);
  assert.equal(cartPhase104AoeExtent({ ...base, kind: "DONUT" }), 15);
  assert.equal(cartPhase104AoeExtent({ ...base, kind: "CONE" }), 6.2);
  assert.ok(cartPhase104AoeExtent({ ...base, kind: "LINE" }) >= 6.7);
  assert.ok(cartPhase104AoeExtent({ ...base, kind: "CROSS" }) >= 6.7);
});

test("Phase104 drops secondary FX under sustained frame pressure but keeps core telegraphs", () => {
  assert.equal(cartPhase104FxQuality(CART_PHASE104_REDUCED_FX_FRAME_MS), "full");
  assert.equal(cartPhase104FxQuality(CART_PHASE104_REDUCED_FX_FRAME_MS + 0.01), "reduced");
  assert.match(source, /quality === "full" \|\| index % 2 === 0/);
  assert.match(source, /locatorBeam/);
  assert.match(source, /countdown/);
  assert.match(source, /impactBeam/);
});

test("Phase104 AOE camera kick is bounded and distance-aware", () => {
  const near = cartPhase104AoeCameraKick(2, 10);
  const far = cartPhase104AoeCameraKick(80, 10);
  assert.ok(near > far);
  assert.ok(near <= 0.2950001);
  assert.ok(far >= 0.055);
});

test("Phase104 is wired after Phase103 and includes the requested FX families", () => {
  const phase103Index = runtimeSource.indexOf("CartRoguePhase103ConfigBalance");
  const phase104Index = runtimeSource.indexOf("CartRoguePhase104ImpactAoeOverhaul");
  assert.ok(phase103Index >= 0);
  assert.ok(phase104Index > phase103Index);
  for (const marker of [
    "phase104-aoe-countdown",
    "phase104-aoe-impact-beam",
    "phase104-aoe-shockwave",
    "phase104-aoe-tracking-ghost",
    "phase104-turbo-jet-left",
    "phase104-player-shockwave",
    "phase104-hit-ring",
    "phase104-boss-phase-ring",
    "phase104-screen-edge-flash",
  ]) {
    assert.match(source, new RegExp(marker));
  }
});

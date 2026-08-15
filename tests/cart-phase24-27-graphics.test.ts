import assert from "node:assert/strict";
import test from "node:test";
import { cartGraphicTrailSpacing } from "../src/cart/CartRoguePhase24GroundMotion";
import { cartPivotGraphicStrength } from "../src/cart/CartRoguePhase25TurboVisuals";
import { cartGraphicPaletteForStage, cartGraphicStageForNode } from "../src/cart/CartRoguePhase26StageIdentity";
import { cartEnemyDamageVisualStage } from "../src/cart/CartRoguePhase27EnemyDamageVisuals";

test("Phase 24 tire marks become denser during fast or aggressive driving", () => {
  const calm = cartGraphicTrailSpacing(6, 0.1, false);
  const fast = cartGraphicTrailSpacing(22, 0.2, false);
  const drift = cartGraphicTrailSpacing(12, 0.9, true);
  assert.ok(fast < calm);
  assert.ok(drift < calm);
  assert.ok(drift >= 0.58);
});

test("Phase 25 Turbo pivot graphics only appear while held and intensify with charge", () => {
  assert.equal(cartPivotGraphicStrength(false, 1, 1), 0);
  const tap = cartPivotGraphicStrength(true, 0.1, 0.5);
  const charged = cartPivotGraphicStrength(true, 1, 0.9);
  assert.ok(tap > 0);
  assert.ok(charged > tap);
  assert.ok(charged <= 1);
});

test("Phase 26 gives major run sections distinct graphic identities", () => {
  assert.equal(cartGraphicStageForNode("arena-01"), "meadow");
  assert.equal(cartGraphicStageForNode("arena-02"), "orchard");
  assert.equal(cartGraphicStageForNode("arena-03"), "grove");
  assert.equal(cartGraphicStageForNode("route-04-left"), "canyon");
  assert.equal(cartGraphicStageForNode("boss-01"), "boss");
  assert.notEqual(cartGraphicPaletteForStage("meadow").fog, cartGraphicPaletteForStage("boss").fog);
});

test("Phase 27 enemy damage visuals escalate at authored HP thresholds", () => {
  assert.equal(cartEnemyDamageVisualStage(100, 100), 0);
  assert.equal(cartEnemyDamageVisualStage(70, 100), 1);
  assert.equal(cartEnemyDamageVisualStage(40, 100), 2);
  assert.equal(cartEnemyDamageVisualStage(20, 100), 3);
  assert.equal(cartEnemyDamageVisualStage(0, 100), 3);
});

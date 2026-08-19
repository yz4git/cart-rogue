import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CART_AOE_FIRE_COLOR,
  CART_AOE_IMMINENT_COLOR,
  CART_AOE_LOCK_SETTLE_SECONDS,
  CART_AOE_LOCKED_COLOR,
  CART_AOE_RETARGET_ANGLE_EPSILON,
  CART_AOE_RETARGET_HOLD_SECONDS,
  CART_AOE_RETARGET_POSITION_EPSILON,
  CART_AOE_RETARGET_RING_SECONDS,
  CART_AOE_TRACKING_COLOR,
  cartAoeRetargetMoved,
} from "../src/cart/CartRoguePhase88RaidHazardVisualAlignment";

const source = readFileSync(new URL("../src/cart/CartRoguePhase88RaidHazardVisualAlignment.ts", import.meta.url), "utf8");

test("AOE tracking, lock, imminent and fire states use visibly distinct colors", () => {
  const colors = new Set([
    CART_AOE_TRACKING_COLOR,
    CART_AOE_LOCKED_COLOR,
    CART_AOE_IMMINENT_COLOR,
    CART_AOE_FIRE_COLOR,
  ]);
  assert.equal(colors.size, 4);
  assert.equal(CART_AOE_TRACKING_COLOR, 0xff38d1);
  assert.equal(CART_AOE_LOCKED_COLOR, 0xff1200);
});

test("retarget presentation reacts to meaningful coordinate or angle changes but ignores tiny jitter", () => {
  const origin = { x: 10, z: -4, heading: 0.3 };
  assert.equal(cartAoeRetargetMoved(origin, { x: 10.01, z: -4.01, heading: 0.302 }), false);
  assert.equal(
    cartAoeRetargetMoved(origin, { x: 10 + CART_AOE_RETARGET_POSITION_EPSILON + 0.02, z: -4, heading: 0.3 }),
    true,
  );
  assert.equal(
    cartAoeRetargetMoved(origin, { x: 10, z: -4, heading: 0.3 + CART_AOE_RETARGET_ANGLE_EPSILON + 0.01 }),
    true,
  );
});

test("retarget and lock animations are brief enough to stay readable without hiding the real hitbox", () => {
  assert.ok(CART_AOE_RETARGET_HOLD_SECONDS >= 0.08 && CART_AOE_RETARGET_HOLD_SECONDS <= 0.18);
  assert.ok(CART_AOE_LOCK_SETTLE_SECONDS >= 0.1 && CART_AOE_LOCK_SETTLE_SECONDS <= 0.22);
  assert.ok(CART_AOE_RETARGET_RING_SECONDS >= 0.12 && CART_AOE_RETARGET_RING_SECONDS <= 0.24);
  assert.match(source, /phase88-aoe-retarget-ring-/);
  assert.match(source, /RingGeometry\(0\.76, 1, 32, 1, 0, Math\.PI \* 1\.5\)/);
  assert.match(source, /mesh\.material = presentation\.retargetMaterial/);
  assert.match(source, /The mesh stays on the real/);
});

test("AOE retarget FX stay bounded to the existing four hazard slots", () => {
  assert.match(source, /Array\.from\(\{ length: 4 \}/);
  assert.match(source, /fixedRetargetFxSlots = 4/);
  assert.doesNotMatch(source, /new THREE\.InstancedMesh|TextureLoader|requestAnimationFrame/);
});

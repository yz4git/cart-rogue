import assert from "node:assert/strict";
import test from "node:test";
import "../src/cart/CartRogueRuntime";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import {
  cartHandling2Profile,
  cartHandling2ShapeHeadingDelta,
} from "../src/cart/CartHandlingProfile";
import "../src/cart/CartRoguePhase53Handling2";
import { cartWorldNodeById, type CartWorldLocation } from "../src/cart/CartWorldGraph";

const PIVOT = { throttle: 1, brake: 0, steer: 0.82, boost: true } as const;

function angleDistance(from: number, to: number): number {
  return Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)));
}

function forceLocation(session: CartArenaSession, nodeId: string, x: number, z: number, heading = 0): void {
  const node = cartWorldNodeById(nodeId);
  assert.ok(node);
  session.car.position.set(x, session.car.position.y, z);
  session.car.heading = heading;
  session.car.forwardVelocity = 0;
  session.car.lateralVelocity = 0;
  session.car.velocity.x = 0;
  session.car.velocity.z = 0;
  session.car.speed = 0;
  (session as unknown as { location: CartWorldLocation }).location = {
    node,
    localX: x - node.rect.centerX,
    localZ: z - node.rect.centerZ,
  };
}

function disableUnrelatedInteractions(session: CartArenaSession): void {
  for (const obstacle of session.obstacles) obstacle.destroyed = true;
  for (const enemy of session.enemies) {
    enemy.moveSpeed = 0;
    enemy.x += 30;
    enemy.z += 20;
  }
}

test("Phase 53 handling profile is agile at low speed and calmer at high speed", () => {
  const low = cartHandling2Profile({ speed: 2, steer: 1, brake: 0, turboHeld: false, boostActive: false, drifting: false });
  const high = cartHandling2Profile({ speed: 16.8, steer: 1, brake: 0, turboHeld: false, boostActive: false, drifting: false });
  assert.equal(low.mode, "normal");
  assert.equal(high.mode, "normal");
  assert.ok(low.yawScale > high.yawScale);
  assert.ok(low.maxYawRate > high.maxYawRate);
  assert.ok(low.maxLateralRatio > high.maxLateralRatio);
});

test("Phase 53 gives drift and Turbo modes explicit slower yaw envelopes", () => {
  const drift = cartHandling2Profile({ speed: 12, steer: 0.8, brake: 0.5, turboHeld: false, boostActive: false, drifting: true });
  const pivot = cartHandling2Profile({ speed: 0, steer: 0.8, brake: 0, turboHeld: true, boostActive: false, drifting: true });
  const dash = cartHandling2Profile({ speed: 18, steer: 0.8, brake: 0, turboHeld: false, boostActive: true, drifting: false });
  assert.equal(drift.mode, "drift");
  assert.equal(pivot.mode, "turbo-pivot");
  assert.equal(dash.mode, "turbo-dash");
  assert.ok(drift.maxYawRate <= 2.18);
  assert.ok(pivot.maxYawRate < drift.maxYawRate);
  assert.ok(dash.maxYawRate <= 2.0);
  assert.equal(pivot.maxLateralRatio, 0);
  assert.ok(Math.abs(cartHandling2ShapeHeadingDelta(0.2, 1 / 60, pivot)) <= pivot.maxYawRate / 60 + 1e-9);
});

test("Phase 53 keeps stationary Turbo charging stationary while slowing its maximum pivot", () => {
  const session = new CartArenaSession();
  try {
    disableUnrelatedInteractions(session);
    forceLocation(session, "arena-01", 0, 28, 0);
    const stocks = session.car.boostCharges;
    const startHeading = session.car.heading;
    const startX = session.car.position.x;
    const startZ = session.car.position.z;

    for (let frame = 0; frame < 30; frame += 1) session.step(PIVOT);

    const turn = angleDistance(startHeading, session.car.heading);
    const travel = Math.hypot(session.car.position.x - startX, session.car.position.z - startZ);
    assert.ok(turn > 0.72, `Turbo pivot should remain decisive, got ${turn.toFixed(3)} rad`);
    assert.ok(turn <= 1.06, `Phase 53 should cap half-second Turbo pivot near 1.04 rad, got ${turn.toFixed(3)}`);
    assert.ok(travel < 0.08, `Turbo charge pivot must not translate, travelled ${travel.toFixed(3)}`);
    assert.equal(session.car.boostCharges, stocks, "holding Turbo still must not spend a stock");
  } finally {
    session.dispose();
  }
});

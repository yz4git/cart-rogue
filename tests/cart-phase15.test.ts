import assert from "node:assert/strict";
import test from "node:test";
import "../src/cart/CartRoguePhase15Turbo";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { CART_TURBO_DRIFT_FULL_CHARGE_SECONDS, cartTurboDriftCharge } from "../src/cart/CartRoguePhase15Turbo";

const HOLD = { throttle: 0.84, brake: 0, steer: 0.82, boost: true } as const;
const RELEASE = { throttle: 0.84, brake: 0, steer: 0.82, boost: false } as const;

function angleDistance(from: number, to: number): number {
  return Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)));
}

function prepareRoom(session: CartArenaSession): void {
  for (const enemy of session.enemies) {
    if (enemy.nodeId !== "arena-01") continue;
    enemy.alive = true;
    enemy.moveSpeed = 0;
    enemy.x = enemy.id === "enemy-a" ? -18 : enemy.id === "enemy-b" ? 18 : 17;
    enemy.z = enemy.id === "enemy-c" ? 42 : 18;
  }
  for (const obstacle of session.obstacles) obstacle.destroyed = true;
  session.car.position.set(0, session.car.position.y, 28);
  session.car.heading = 0;
  session.car.forwardVelocity = 15;
  session.car.lateralVelocity = 0;
}

test("Phase 15 Turbo drift charge clamps at the authored full-charge time", () => {
  assert.equal(cartTurboDriftCharge(0), 0);
  assert.ok(cartTurboDriftCharge(CART_TURBO_DRIFT_FULL_CHARGE_SECONDS * 0.5) > 0.49);
  assert.equal(cartTurboDriftCharge(CART_TURBO_DRIFT_FULL_CHARGE_SECONDS), 1);
  assert.equal(cartTurboDriftCharge(99), 1);
});

test("holding Turbo does not spend stock and creates a slower, tight drift", () => {
  const session = new CartArenaSession();
  try {
    prepareRoom(session);
    const initialCharges = session.car.boostCharges;
    const initialHeading = session.car.heading;
    const initialSpeed = Math.abs(session.car.forwardVelocity);
    for (let frame = 0; frame < 30; frame += 1) session.step(HOLD);

    assert.equal(session.car.boostCharges, initialCharges, "holding must not consume a Turbo stock");
    assert.equal(session.car.boostActive, false, "Turbo must stay inactive until release");
    assert.ok(Math.abs(session.car.forwardVelocity) < initialSpeed, "hold state should shed speed for drift setup");
    assert.ok(Math.abs(session.car.forwardVelocity) > 3.8, "drift setup should not park the car");
    assert.ok(angleDistance(initialHeading, session.car.heading) > 0.65, "steering while held should rotate the car aggressively");
    assert.ok(Math.abs(session.car.lateralVelocity) > 0.35, "hold steering should create visible lateral slip");
  } finally {
    session.dispose();
  }
});

test("releasing Turbo fires exactly once and consumes one stock", () => {
  const session = new CartArenaSession();
  try {
    prepareRoom(session);
    const initialCharges = session.car.boostCharges;
    for (let frame = 0; frame < 18; frame += 1) session.step(HOLD);
    const speedBeforeRelease = Math.abs(session.car.forwardVelocity);

    session.step(RELEASE);
    assert.equal(session.car.boostCharges, initialCharges - 1);
    assert.equal(session.car.boostActive, true);
    assert.ok(Math.abs(session.car.forwardVelocity) > speedBeforeRelease, "release should produce an immediate dash impulse");

    const chargesAfterRelease = session.car.boostCharges;
    session.step(RELEASE);
    session.step(RELEASE);
    assert.equal(session.car.boostCharges, chargesAfterRelease, "remaining released must not repeatedly fire Turbo");
  } finally {
    session.dispose();
  }
});

test("a longer drift hold produces a stronger release dash than a tap", () => {
  const run = (holdFrames: number) => {
    const session = new CartArenaSession();
    try {
      prepareRoom(session);
      for (let frame = 0; frame < holdFrames; frame += 1) session.step({ ...HOLD, steer: 0 });
      const before = Math.abs(session.car.forwardVelocity);
      session.step({ ...RELEASE, steer: 0 });
      return Math.abs(session.car.forwardVelocity) - before;
    } finally {
      session.dispose();
    }
  };

  const tapImpulse = run(1);
  const chargedImpulse = run(48);
  assert.ok(chargedImpulse > tapImpulse + 1.1, `expected charged release (${chargedImpulse.toFixed(2)}) to beat tap (${tapImpulse.toFixed(2)})`);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  CartArenaSession,
  cartArcadeTurnAssistRate,
  cartHandlingMultiplier,
  cartTurboRechargeMultiplier,
  quickenCartSteering,
} from "../src/cart/CartArenaSession";

const TURN = { throttle: 0.45, brake: 0, steer: 1, boost: false } as const;

function angleDistance(from: number, to: number): number {
  return Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)));
}

test("Phase 7 moderate steering reaches strong lock earlier", () => {
  assert.ok(quickenCartSteering(0.4) >= 0.59);
  assert.ok(quickenCartSteering(-0.4) <= -0.59);
  assert.equal(quickenCartSteering(1), 1);
  assert.equal(quickenCartSteering(-1), -1);
});

test("Phase 7 arena handling is substantially tighter while corridors stay calmer", () => {
  assert.ok(cartHandlingMultiplier("arena") >= 1.5);
  assert.ok(cartHandlingMultiplier("boss") >= 1.4);
  assert.ok(cartHandlingMultiplier("corridor") >= 1.1);
  assert.ok(cartHandlingMultiplier("arena") > cartHandlingMultiplier("corridor"));
});

test("Arcade turn assist favors combat U-turns, Turbo steering and brake pivots", () => {
  const normal = cartArcadeTurnAssistRate("arena", 11, false, 0, 0.8);
  const turbo = cartArcadeTurnAssistRate("arena", 11, true, 0, 0.8);
  const brakePivot = cartArcadeTurnAssistRate("arena", 11, false, 1, 0.8);
  const corridor = cartArcadeTurnAssistRate("corridor", 11, false, 0, 0.8);
  assert.ok(normal > corridor);
  assert.ok(turbo > normal);
  assert.ok(brakePivot > turbo);
});

test("FLOW combo accelerates renewable Turbo recharge without exceeding its cap", () => {
  assert.equal(cartTurboRechargeMultiplier(0), 1);
  assert.equal(cartTurboRechargeMultiplier(1), 1);
  assert.ok(cartTurboRechargeMultiplier(3) > 1.25);
  assert.ok(cartTurboRechargeMultiplier(9) <= 1.62);
});

test("a combat-speed full turn changes heading aggressively inside one second", () => {
  const session = new CartArenaSession();
  try {
    for (const enemy of session.enemies) enemy.alive = false;
    for (const obstacle of session.obstacles) obstacle.destroyed = true;
    session.car.position.set(0, session.car.position.y, 28);
    session.car.heading = 0;
    session.car.forwardVelocity = 11;
    const initialHeading = session.car.heading;
    for (let frame = 0; frame < 45; frame += 1) session.step(TURN);
    const turned = angleDistance(initialHeading, session.car.heading);
    assert.ok(turned > 1.65, `expected a tight combat turn, got ${turned.toFixed(3)} rad`);
    assert.equal(session.snapshot().nodeId, "arena-01");
  } finally {
    session.dispose();
  }
});

test("Brake acts as an intentional pivot aid at combat speed", () => {
  const run = (brake: number) => {
    const session = new CartArenaSession();
    try {
      for (const enemy of session.enemies) enemy.alive = false;
      for (const obstacle of session.obstacles) obstacle.destroyed = true;
      session.car.position.set(0, session.car.position.y, 28);
      session.car.heading = 0;
      session.car.forwardVelocity = 10;
      for (let frame = 0; frame < 24; frame += 1) {
        session.step({ throttle: brake > 0 ? 0 : 0.35, brake, steer: 0.72, boost: false });
      }
      return angleDistance(0, session.car.heading);
    } finally {
      session.dispose();
    }
  };
  assert.ok(run(0.7) > run(0), "brake+steer should pivot more sharply than normal steering over the same interval");
});

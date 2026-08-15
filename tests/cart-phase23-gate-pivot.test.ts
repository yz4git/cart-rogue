import assert from "node:assert/strict";
import test from "node:test";
import "../src/cart/CartRoguePhase14Arenas";
import "../src/cart/CartRoguePhase15Turbo";
import "../src/cart/CartRoguePhase23GateAndPivot";
import { CartArenaSession } from "../src/cart/CartArenaSession";

const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;
const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const PIVOT = { throttle: 1, brake: 0, steer: 0.82, boost: true } as const;

function angleDistance(from: number, to: number): number {
  return Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)));
}

test("an open curved-arena gate bridges the safety-margin seam into the next corridor", () => {
  const session = new CartArenaSession();
  try {
    for (const enemy of session.enemies.filter((candidate) => candidate.nodeId === "arena-01")) enemy.alive = false;
    session.car.position.x = 0;
    session.car.position.z = 72;
    session.car.forwardVelocity = 0;
    session.step(IDLE);
    assert.equal(session.snapshot().nodeId, "corridor-01");

    session.car.position.x = 0;
    session.car.position.z = 116;
    session.car.forwardVelocity = 0;
    session.step(IDLE);
    assert.equal(session.snapshot().nodeId, "arena-02");

    for (const enemy of session.enemies.filter((candidate) => candidate.nodeId === "arena-02")) enemy.alive = false;
    assert.equal(session.snapshot().gateLocked, false);

    session.car.position.x = 0;
    session.car.position.z = 139.2;
    session.car.heading = 0;
    session.car.forwardVelocity = 7;
    session.step(DRIVE);

    assert.equal(session.snapshot().nodeId, "junction-02", "GATE OPEN must allow progression into the fork corridor");
    assert.ok(session.car.position.z >= 140.4);
  } finally {
    session.dispose();
  }
});

test("holding Turbo stops translation and pivots the car in place without spending a stock", () => {
  const session = new CartArenaSession();
  try {
    for (const enemy of session.enemies.filter((candidate) => candidate.nodeId === "arena-01")) {
      enemy.x += 20;
      enemy.z += 12;
      enemy.moveSpeed = 0;
    }
    for (const obstacle of session.obstacles) obstacle.destroyed = true;

    session.car.position.x = 0;
    session.car.position.z = 28;
    session.car.heading = 0;
    session.car.forwardVelocity = 15;
    session.car.lateralVelocity = 0;
    const startX = session.car.position.x;
    const startZ = session.car.position.z;
    const startHeading = session.car.heading;
    const initialCharges = session.car.boostCharges;

    for (let frame = 0; frame < 30; frame += 1) session.step(PIVOT);

    const travel = Math.hypot(session.car.position.x - startX, session.car.position.z - startZ);
    const turn = angleDistance(startHeading, session.car.heading);
    assert.ok(travel < 0.05, `Turbo hold should pivot in place, travelled ${travel.toFixed(3)}`);
    assert.ok(Math.abs(session.car.forwardVelocity) < 0.01);
    assert.ok(Math.abs(session.car.lateralVelocity) < 0.01);
    assert.ok(turn > 0.65, `stationary pivot should turn decisively, got ${turn.toFixed(3)} rad`);
    assert.equal(session.car.boostCharges, initialCharges, "holding must not spend a Turbo stock");
    assert.equal(session.car.boostActive, false, "holding is a pivot/charge state, not an attack dash");

    session.step({ ...PIVOT, boost: false });
    assert.equal(session.car.boostCharges, initialCharges - 1, "release should fire exactly one Turbo stock");
    assert.equal(session.car.boostActive, true);
    assert.ok(session.car.forwardVelocity > 1.5, "release should launch forward from the stationary pivot");
  } finally {
    session.dispose();
  }
});

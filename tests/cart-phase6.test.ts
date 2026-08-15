import assert from "node:assert/strict";
import test from "node:test";
import { CartArenaSession, cartHandlingMultiplier, quickenCartSteering } from "../src/cart/CartArenaSession";
import { createInitialCartEnemies } from "../src/cart/CartCombat";
import { RALLY_VEHICLES } from "../src/rally/VehicleDefinition";

const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

test("Phase 6 steering reaches useful lock sooner for moderate touch input", () => {
  assert.ok(quickenCartSteering(0.4) >= 0.53);
  assert.ok(quickenCartSteering(-0.4) <= -0.53);
  assert.equal(quickenCartSteering(1), 1);
  assert.equal(quickenCartSteering(-1), -1);
});

test("battle arenas use tighter handling than corridors without changing Rally defaults", () => {
  assert.ok(cartHandlingMultiplier("arena") >= 1.3);
  assert.ok(cartHandlingMultiplier("boss") >= 1.25);
  assert.ok(cartHandlingMultiplier("corridor") > 1);
  assert.ok(cartHandlingMultiplier("arena") > cartHandlingMultiplier("corridor"));
  assert.equal(RALLY_VEHICLES.compact.handling, 1.05);
});

test("CartArenaSession applies the tight arena profile and a calmer corridor profile", () => {
  const session = new CartArenaSession();
  try {
    const arenaHandling = session.car.definition.handling;
    assert.ok(arenaHandling >= RALLY_VEHICLES.compact.handling * 1.3);

    for (const enemy of session.enemies.filter((candidate) => candidate.nodeId === "arena-01")) enemy.alive = false;
    session.car.position.set(0, session.car.position.y, 72);
    session.car.forwardVelocity = 0;
    session.step(IDLE);
    assert.equal(session.snapshot().nodeId, "corridor-01");
    assert.ok(session.car.definition.handling < arenaHandling);
    assert.ok(session.car.definition.handling > RALLY_VEHICLES.compact.handling);
  } finally {
    session.dispose();
  }
});

test("the opening arena is a three-light-target onboarding encounter", () => {
  const enemies = createInitialCartEnemies();
  const opening = enemies.filter((enemy) => enemy.nodeId === "arena-01");
  assert.equal(opening.length, 3);
  assert.equal(opening.filter((enemy) => enemy.kind === "blocker").length, 2);
  assert.equal(opening.filter((enemy) => enemy.kind === "chaser").length, 1);
  assert.equal(opening.some((enemy) => enemy.kind === "heavy"), false);
  assert.ok(opening.find((enemy) => enemy.kind === "chaser")!.moveSpeed < 3);
});

test("heavy enemy pressure is deferred to the elite arena", () => {
  const enemies = createInitialCartEnemies();
  assert.equal(enemies.some((enemy) => enemy.nodeId === "arena-01" && enemy.kind === "heavy"), false);
  assert.equal(enemies.some((enemy) => enemy.nodeId === "arena-02" && enemy.kind === "heavy"), true);
});

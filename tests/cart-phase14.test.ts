import test from "node:test";
import assert from "node:assert/strict";
import "../src/cart/CartRoguePhase14Arenas";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import {
  CART_ARENA_SHAPES,
  cartArenaBoundaryPoints,
  cartArenaContains,
  cartArenaShapeForNode,
  projectCartPointInsideArena,
} from "../src/cart/CartArenaShapes";

const idle = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

test("Phase 14 uses circle, ellipse and capsule combat rooms", () => {
  const kinds = new Set(Object.values(CART_ARENA_SHAPES).map((shape) => shape.kind));
  assert.deepEqual(kinds, new Set(["circle", "ellipse", "capsule"]));
  assert.equal(cartArenaShapeForNode("arena-01")?.kind, "circle");
  assert.equal(cartArenaShapeForNode("arena-02")?.kind, "ellipse");
  assert.equal(cartArenaShapeForNode("arena-03")?.kind, "capsule");
  assert.equal(cartArenaShapeForNode("corridor-01"), null);
});

test("circle and ellipse corners are no longer playable rectangle corners", () => {
  assert.equal(cartArenaContains("arena-01", 0, 28), true);
  assert.equal(cartArenaContains("arena-01", 24, 50), false);
  assert.equal(cartArenaContains("arena-02", 28, 139), false);
  assert.equal(cartArenaContains("arena-02", 0, 140), true);
});

test("arena projection returns a stable inward point and smooth normal", () => {
  const projected = projectCartPointInsideArena("arena-01", 34, 34, 1.62);
  assert.equal(projected.corrected, true);
  assert.equal(cartArenaContains("arena-01", projected.x, projected.z, 1.6), true);
  assert.ok(Math.abs(Math.hypot(projected.normalX, projected.normalZ) - 1) < 1e-6);

  const ellipse = projectCartPointInsideArena("arena-02", 31, 132, 1.4);
  assert.equal(ellipse.corrected, true);
  assert.equal(cartArenaContains("arena-02", ellipse.x, ellipse.z, 1.39), true);
});

test("capsule boundary sampling is closed and stays on the authored long oval", () => {
  const points = cartArenaBoundaryPoints("arena-03", 64);
  assert.equal(points.length, 64);
  assert.ok(points.some((point) => Math.abs(point.x) > 29));
  assert.ok(points.every((point) => cartArenaContains("arena-03", point.x * 0.998, 280 + (point.z - 280) * 0.998, 0)));
});

test("high-speed side impact cannot leave the circular opening arena", () => {
  const session = new CartArenaSession();
  session.car.position.x = 25.7;
  session.car.position.z = 28;
  session.car.heading = Math.PI / 2;
  session.car.forwardVelocity = 44;
  session.car.velocity.x = 44;
  session.car.velocity.z = 0;
  session.step({ throttle: 1, brake: 0, steer: 0, boost: true }, 1 / 60);
  const snapshot = session.snapshot();
  assert.equal(snapshot.nodeId, "arena-01");
  assert.equal(cartArenaContains("arena-01", snapshot.x, snapshot.z, 1.45), true);
  assert.ok(snapshot.speed > 2.5, "wall response should slide rather than stop the car");
  session.dispose();
});

test("enemy overlap is separated even while contact cooldowns would otherwise hold", () => {
  const session = new CartArenaSession();
  const enemy = session.enemies.find((candidate) => candidate.id === "enemy-a");
  assert.ok(enemy);
  session.car.position.x = enemy.x;
  session.car.position.z = enemy.z;
  session.car.heading = 0.35;
  session.car.forwardVelocity = 10;
  session.step(idle, 1 / 60);
  const distance = Math.hypot(session.car.position.x - enemy.x, session.car.position.z - enemy.z);
  assert.ok(distance > enemy.radius + 1.35, `expected separation, got ${distance}`);
  session.step(idle, 1 / 60);
  const nextDistance = Math.hypot(session.car.position.x - enemy.x, session.car.position.z - enemy.z);
  assert.ok(nextDistance > enemy.radius + 1.35);
  session.dispose();
});

test("moving enemies are projected back inside curved arena walls", () => {
  const session = new CartArenaSession();
  const enemy = session.enemies.find((candidate) => candidate.id === "enemy-c");
  assert.ok(enemy);
  enemy.x = 25.8;
  enemy.z = 49.5;
  enemy.moveSpeed = 8;
  session.step(idle, 1 / 60);
  assert.equal(cartArenaContains("arena-01", enemy.x, enemy.z, enemy.radius + 0.45), true);
  session.dispose();
});

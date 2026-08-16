import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "../src/cart/CartRoguePhase14Arenas";
import "../src/cart/CartRoguePhase15Turbo";
import "../src/cart/CartRoguePhase23GateAndPivot";
import "../src/cart/CartRoguePhase33HandlingCombat";
import "../src/cart/CartRoguePhase36TraversalVisibility";
import {
  CART_PHASE44_CAMERA,
  cartPhase44PivotVisualStrength,
  cartPhase44TurboPivotScale,
} from "../src/cart/CartRoguePhase44RequestedFixes";
import { CartArenaSession } from "../src/cart/CartArenaSession";

const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const PIVOT = { throttle: 1, brake: 0, steer: 0.82, boost: true } as const;
const source = readFileSync(new URL("../src/cart/CartRoguePhase44RequestedFixes.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app/CartRogueGamePhase13.tsx", import.meta.url), "utf8");

function angleDistance(from: number, to: number): number {
  return Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)));
}

function clearNode(session: CartArenaSession, nodeId: string): void {
  for (const enemy of session.enemies.filter((candidate) => candidate.nodeId === nodeId)) enemy.alive = false;
}

test("Phase 44 slows the stationary Turbo pivot slightly without removing decisive steering", () => {
  assert.equal(cartPhase44TurboPivotScale(), 0.84);
  const session = new CartArenaSession();
  try {
    for (const obstacle of session.obstacles) obstacle.destroyed = true;
    for (const enemy of session.enemies) {
      enemy.moveSpeed = 0;
      if (enemy.nodeId === "arena-01") {
        enemy.x += 20;
        enemy.z += 12;
      }
    }
    session.car.position.set(0, 0, 28);
    session.car.heading = 0;
    const startHeading = session.car.heading;
    const startX = session.car.position.x;
    const startZ = session.car.position.z;

    for (let frame = 0; frame < 30; frame += 1) session.step(PIVOT);

    const turn = angleDistance(startHeading, session.car.heading);
    const travel = Math.hypot(session.car.position.x - startX, session.car.position.z - startZ);
    assert.ok(turn > 0.55, `pivot should still turn clearly, got ${turn.toFixed(3)} rad`);
    assert.ok(turn < 0.92, `pivot should be slightly calmer than before, got ${turn.toFixed(3)} rad`);
    assert.ok(travel < 0.05, `pivot must remain stationary, travelled ${travel.toFixed(3)}`);
  } finally {
    session.dispose();
  }
});

test("Phase 44 releases the cleared Stage 1 rear gate instead of leaving the cart wedged", () => {
  const session = new CartArenaSession();
  try {
    clearNode(session, "arena-01");
    for (const obstacle of session.obstacles) obstacle.destroyed = true;
    for (const enemy of session.enemies) enemy.moveSpeed = 0;

    session.car.position.set(0, 0, 5.15);
    session.car.heading = Math.PI;
    session.car.forwardVelocity = 6;
    session.car.lateralVelocity = 0;
    session.step(DRIVE);

    const snapshot = session.snapshot();
    assert.equal(snapshot.nodeId, "arena-01");
    assert.ok(session.car.position.z >= 7.0, `rear gate contact should release inward, z=${session.car.position.z}`);
    assert.ok(Math.cos(session.car.heading) > 0.7, `rear release should face back into the arena, heading=${session.car.heading}`);
    assert.ok(session.car.speed > 1, "rear release should leave usable motion instead of a zero-speed wedge");
  } finally {
    session.dispose();
  }
});

test("Phase 44 stationary drift presentation remains active at zero travel", () => {
  assert.equal(cartPhase44PivotVisualStrength(false, 1, 1), 0);
  assert.ok(cartPhase44PivotVisualStrength(true, 0.5, 0.8) > 0.7);
  assert.match(source, /phase44-stationary-turbo-skids/);
  assert.match(source, /rollTarget/);
  assert.match(source, /stampStationarySkids/);
});

test("Phase 44 removes the bright ground-like undertray slab", () => {
  assert.match(source, /phase44-dark-compact-undertray/);
  assert.match(source, /0x46545a/);
  assert.match(source, /object\.scale\.z \*= 0\.82/);
});

test("Phase 44 moves the chase camera slightly farther back and higher", () => {
  assert.ok(CART_PHASE44_CAMERA.normalDistance > 10.6);
  assert.ok(CART_PHASE44_CAMERA.normalHeight > 6.2);
  assert.ok(CART_PHASE44_CAMERA.turboDistance > 12.0);
  assert.ok(CART_PHASE44_CAMERA.turboHeight > 7.0);
});

test("Phase 44 is loaded last so requested handling and presentation fixes win", () => {
  const phase43 = appSource.indexOf("CartRoguePhase43ArchitectureVertexColors");
  const phase44 = appSource.indexOf("CartRoguePhase44RequestedFixes");
  assert.ok(phase43 >= 0);
  assert.ok(phase44 > phase43);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "../src/cart/CartRoguePhase14Arenas";
import "../src/cart/CartRoguePhase15Turbo";
import "../src/cart/CartRoguePhase16Flow";
import "../src/cart/CartRoguePhase23GateAndPivot";
import "../src/cart/CartRoguePhase33HandlingCombat";
import "../src/cart/CartRoguePhase36TraversalVisibility";
import "../src/cart/CartRoguePhase44RequestedFixes";
import "../src/cart/CartRoguePhase45StabilityGuidance";
import {
  CART_PHASE47_ENTRY_INSET,
  CART_PHASE47_EXIT_TRIGGER_DEPTH,
  cartPhase47SelectTransitTarget,
} from "../src/cart/CartRoguePhase47TransitCompletion";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { cartWorldNodeById, type CartWorldLocation } from "../src/cart/CartWorldGraph";

const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;
const appSource = readFileSync(new URL("../app/CartRogueGamePhase13.tsx", import.meta.url), "utf8");

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

function disableInteractions(session: CartArenaSession): void {
  for (const obstacle of session.obstacles) obstacle.destroyed = true;
  for (const enemy of session.enemies) enemy.moveSpeed = 0;
}

function assertForwardTransit(fromId: string, toId: string, x = 0): void {
  const session = new CartArenaSession();
  try {
    disableInteractions(session);
    const from = cartWorldNodeById(fromId);
    const to = cartWorldNodeById(toId);
    assert.ok(from);
    assert.ok(to);
    const z = from.rect.centerZ + from.rect.halfDepth - 1.05;
    forceLocation(session, from.id, x, z, 0);

    session.step(DRIVE);

    const snapshot = session.snapshot();
    assert.equal(snapshot.nodeId, to.id, `${from.id} should complete its forward transit into ${to.id}`);
    assert.ok(snapshot.z >= to.rect.centerZ - to.rect.halfDepth + CART_PHASE47_ENTRY_INSET - 0.05);
    assert.ok(snapshot.speed > 3, `transit should preserve usable forward motion, speed=${snapshot.speed}`);
  } finally {
    session.dispose();
  }
}

test("Phase 47 completes Stage 1 transit corridor into Stage 2", () => {
  assertForwardTransit("corridor-01", "arena-02");
});

test("Phase 47 completes the merge transit room into the following combat stage", () => {
  assertForwardTransit("junction-03", "arena-03");
});

test("Phase 47 completes the boss approach transit room into the boss stage", () => {
  assertForwardTransit("corridor-02", "boss-01");
});

test("Phase 47 respects fork commitment instead of choosing a branch at the center", () => {
  assert.equal(cartPhase47SelectTransitTarget("junction-02", 0, 0), null);
  assert.equal(cartPhase47SelectTransitTarget("junction-02", 8, 0), "route-03-right");
  assert.equal(cartPhase47SelectTransitTarget("junction-02", -8, 0), "route-03-left");

  const session = new CartArenaSession();
  try {
    disableInteractions(session);
    const junction = cartWorldNodeById("junction-02");
    assert.ok(junction);
    forceLocation(session, junction.id, 8, junction.rect.centerZ + junction.rect.halfDepth - 1.05, 0);
    session.step(DRIVE);
    assert.equal(session.snapshot().nodeId, "route-03-right");
  } finally {
    session.dispose();
  }
});

test("Phase 47 does not teleport from the rear or middle of a transit room", () => {
  const session = new CartArenaSession();
  try {
    disableInteractions(session);
    const corridor = cartWorldNodeById("corridor-01");
    assert.ok(corridor);
    forceLocation(session, corridor.id, 0, corridor.rect.centerZ, 0);
    session.step(IDLE);
    assert.equal(session.snapshot().nodeId, corridor.id);
    assert.ok(CART_PHASE47_EXIT_TRIGGER_DEPTH < corridor.rect.halfDepth);
  } finally {
    session.dispose();
  }
});

test("Phase 47 loads after the stability and ground layers so traversal completion wins last", () => {
  const phase45 = appSource.indexOf("CartRoguePhase45StabilityGuidance");
  const phase46 = appSource.indexOf("CartRoguePhase46GroundPatternRecovery");
  const phase47 = appSource.indexOf("CartRoguePhase47TransitCompletion");
  assert.ok(phase45 >= 0);
  assert.ok(phase46 > phase45);
  assert.ok(phase47 > phase46);
});

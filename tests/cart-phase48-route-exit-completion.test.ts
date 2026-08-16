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
import "../src/cart/CartRoguePhase47TransitCompletion";
import {
  CART_PHASE48_ENTRY_INSET,
  CART_PHASE48_EXIT_TRIGGER_DEPTH,
  CART_PHASE48_LATERAL_FUNNEL,
} from "../src/cart/CartRoguePhase48RouteExitCompletion";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { cartWorldNodeById, type CartWorldLocation } from "../src/cart/CartWorldGraph";

const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;
const appSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");

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

function prepareClearedRoute(session: CartArenaSession, routeId: string): void {
  for (const obstacle of session.obstacles) obstacle.destroyed = true;
  for (const enemy of session.enemies) {
    enemy.moveSpeed = 0;
    if (enemy.nodeId !== routeId) continue;
    enemy.alive = false;
    enemy.hp = 0;
  }
}

function assertClearedRouteExit(routeId: string, nextId: string, x: number): void {
  const session = new CartArenaSession();
  try {
    prepareClearedRoute(session, routeId);
    const route = cartWorldNodeById(routeId);
    const next = cartWorldNodeById(nextId);
    assert.ok(route);
    assert.ok(next);
    const z = route.rect.centerZ + route.rect.halfDepth - 1.15;
    forceLocation(session, route.id, x, z, 0);

    session.step(DRIVE);

    const snapshot = session.snapshot();
    assert.equal(snapshot.nodeId, next.id, `${route.id} should merge into ${next.id} after it is clear`);
    assert.ok(snapshot.z >= next.rect.centerZ - next.rect.halfDepth + CART_PHASE48_ENTRY_INSET - 0.05);
    assert.ok(snapshot.speed > 3.2, `route exit should preserve usable motion, speed=${snapshot.speed}`);
  } finally {
    session.dispose();
  }
}

test("Phase 48 completes both Stage 3 route exits even from the outside edge of the merge", () => {
  assertClearedRouteExit("route-03-left", "junction-03", -20.1);
  assertClearedRouteExit("route-03-right", "junction-03", 20.1);
});

test("Phase 48 completes both Stage 5 route exits into the boss approach", () => {
  assertClearedRouteExit("route-04-left", "corridor-02", -20.1);
  assertClearedRouteExit("route-04-right", "corridor-02", 20.1);
});

test("Phase 48 never opens a combat route while an enemy is still alive", () => {
  const session = new CartArenaSession();
  try {
    for (const obstacle of session.obstacles) obstacle.destroyed = true;
    for (const enemy of session.enemies) enemy.moveSpeed = 0;
    const route = cartWorldNodeById("route-03-left");
    assert.ok(route);
    const local = session.enemies.filter((enemy) => enemy.nodeId === route.id);
    assert.ok(local.length > 0);
    for (const enemy of local) {
      enemy.alive = false;
      enemy.hp = 0;
    }
    local[0].alive = true;
    local[0].hp = Math.max(1, local[0].maxHp);

    forceLocation(session, route.id, -20.1, route.rect.centerZ + route.rect.halfDepth - 1.15, 0);
    session.step(DRIVE);
    assert.equal(session.snapshot().nodeId, route.id);
  } finally {
    session.dispose();
  }
});

test("Phase 48 does not teleport a cleared route from its middle without exit intent", () => {
  const session = new CartArenaSession();
  try {
    prepareClearedRoute(session, "route-03-left");
    const route = cartWorldNodeById("route-03-left");
    assert.ok(route);
    forceLocation(session, route.id, route.rect.centerX, route.rect.centerZ, 0);
    session.step(IDLE);
    assert.equal(session.snapshot().nodeId, route.id);
    assert.ok(CART_PHASE48_EXIT_TRIGGER_DEPTH < route.rect.halfDepth);
    assert.ok(CART_PHASE48_LATERAL_FUNNEL < 5);
  } finally {
    session.dispose();
  }
});

test("Phase 48 loads after Phase 47 so route completion is the final traversal guard", () => {
  const phase47 = appSource.indexOf("CartRoguePhase47TransitCompletion");
  const phase48 = appSource.indexOf("CartRoguePhase48RouteExitCompletion");
  assert.ok(phase47 >= 0);
  assert.ok(phase48 > phase47);
});

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
import "../src/cart/CartRoguePhase48RouteExitCompletion";
import "../src/cart/CartRoguePhase49HandlingContact";
import "../src/cart/CartRoguePhase50Arena03CenterClearance";
import {
  CART_PHASE51_ARENA03_GATE_Z,
  CART_PHASE51_ARENA03_TRIGGER_Z,
  cartPhase51Arena03GateLocked,
  cartPhase51TryOpenArena03Exit,
} from "../src/cart/CartRoguePhase51Arena03Gate";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { cartWorldNodeById, type CartWorldLocation } from "../src/cart/CartWorldGraph";

const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const phase51Source = readFileSync(new URL("../src/cart/CartRoguePhase51Arena03Gate.ts", import.meta.url), "utf8");
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

function clearArena03(session: CartArenaSession): void {
  for (const enemy of session.enemies) {
    if (enemy.nodeId !== "arena-03") continue;
    enemy.alive = false;
    enemy.hp = 0;
  }
}

test("Phase 51 keeps the Arena 03 gate visibly closed while its encounter is alive", () => {
  const session = new CartArenaSession();
  try {
    assert.equal(cartPhase51Arena03GateLocked(session.enemies), true);
    assert.ok(CART_PHASE51_ARENA03_GATE_Z > CART_PHASE51_ARENA03_TRIGGER_Z);
    assert.match(phase51Source, /phase51-arena03-gate-bar/);
    assert.match(phase51Source, /updateGate\("arena-03"/);
  } finally {
    session.dispose();
  }
});

test("Phase 51 opens the Arena 03 gate state immediately after all local enemies are defeated", () => {
  const session = new CartArenaSession();
  try {
    clearArena03(session);
    assert.equal(cartPhase51Arena03GateLocked(session.enemies), false);
  } finally {
    session.dispose();
  }
});

test("Phase 51 does not let the cart pass the Arena 03 exit while an enemy remains alive", () => {
  const session = new CartArenaSession();
  try {
    forceLocation(session, "arena-03", 0, CART_PHASE51_ARENA03_TRIGGER_Z + 0.2, 0);
    const crossed = cartPhase51TryOpenArena03Exit(session as never, DRIVE);
    assert.equal(crossed, false);
    assert.equal(session.snapshot().nodeId, "arena-03");
  } finally {
    session.dispose();
  }
});

test("Phase 51 bridges a cleared Arena 03 through the visible gate into junction-04", () => {
  const session = new CartArenaSession();
  try {
    clearArena03(session);
    for (const obstacle of session.obstacles.filter((candidate) => candidate.nodeId === "arena-03")) obstacle.destroyed = true;
    forceLocation(session, "arena-03", 0, CART_PHASE51_ARENA03_TRIGGER_Z + 0.08, 0);

    let guard = 0;
    while (session.snapshot().nodeId === "arena-03" && guard < 30) {
      session.step(DRIVE);
      guard += 1;
    }

    const snapshot = session.snapshot();
    assert.equal(snapshot.nodeId, "junction-04", `Arena 03 exit should enter junction-04 within 30 frames, z=${snapshot.z}`);
    assert.ok(snapshot.z >= 304, `cart should be physically inside junction-04, z=${snapshot.z}`);
    assert.ok(snapshot.speed > 2.5, `cart should retain useful exit momentum, speed=${snapshot.speed}`);
  } finally {
    session.dispose();
  }
});

test("Phase 51 is loaded after the Arena 03 center fix so the final gate traversal wins", () => {
  const phase50 = appSource.indexOf("CartRoguePhase50Arena03CenterClearance");
  const phase51 = appSource.indexOf("CartRoguePhase51Arena03Gate");
  assert.ok(phase50 >= 0);
  assert.ok(phase51 > phase50);
});

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
import {
  CART_PHASE49_DRIFT_MAX_YAW_RATE,
  CART_PHASE49_DRIFT_TURN_SCALE,
  CART_PHASE49_PICKUP_GRAZE_RADIUS,
  CART_PHASE49_PLAYER_VISUAL_SCALE,
  cartPhase49PickupGrazeContact,
} from "../src/cart/CartRoguePhase49HandlingContact";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { cartWorldNodeById, type CartWorldLocation } from "../src/cart/CartWorldGraph";

const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const PIVOT = { throttle: 1, brake: 0, steer: 0.82, boost: true } as const;
const source = readFileSync(new URL("../src/cart/CartRoguePhase49HandlingContact.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app/CartRogueGamePhase13.tsx", import.meta.url), "utf8");

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
  for (const enemy of session.enemies) enemy.moveSpeed = 0;
}

test("Phase 49 keeps the floor after a corridor traversable through and beyond its center", () => {
  const session = new CartArenaSession();
  try {
    disableUnrelatedInteractions(session);
    const local = session.enemies.filter((candidate) => candidate.nodeId === "arena-02");
    assert.ok(local.length > 0);
    for (const enemy of local) {
      enemy.alive = false;
      enemy.hp = 0;
    }
    // Keep one harmless enemy far to the side so this test does not enter the
    // stage-clear grace state; we are testing ordinary open-floor traversal.
    local[0].alive = true;
    local[0].hp = local[0].maxHp;
    local[0].x = 25;
    local[0].z = 132;
    forceLocation(session, "arena-02", 0, 97, 0);

    for (let frame = 0; frame < 78; frame += 1) session.step(DRIVE);
    const before = session.snapshot();
    for (let frame = 0; frame < 34; frame += 1) session.step(DRIVE);
    const after = session.snapshot();

    assert.equal(after.nodeId, "arena-02");
    assert.ok(before.z > 113, `the car should reach the center region, z=${before.z}`);
    assert.ok(after.z > 121, `the car should continue beyond the center, z=${after.z}`);
    assert.ok(after.z > before.z + 4, `center traversal must keep making progress, before=${before.z}, after=${after.z}`);
    assert.ok(after.speed > 2.5, `the player should retain usable motion, speed=${after.speed}`);
    assert.match(source, /recoverInteriorGhostStall/);
    assert.match(source, /hasNearbyVisibleCollision/);
  } finally {
    session.dispose();
  }
});

test("Phase 49 lowers the maximum Turbo-drift turning speed without adding translation", () => {
  assert.equal(CART_PHASE49_DRIFT_TURN_SCALE, 0.78);
  assert.ok(CART_PHASE49_DRIFT_MAX_YAW_RATE < 3);
  const session = new CartArenaSession();
  try {
    disableUnrelatedInteractions(session);
    for (const enemy of session.enemies.filter((candidate) => candidate.nodeId === "arena-01")) {
      enemy.x += 24;
      enemy.z += 18;
    }
    forceLocation(session, "arena-01", 0, 28, 0);
    const startHeading = session.car.heading;
    const startX = session.car.position.x;
    const startZ = session.car.position.z;

    for (let frame = 0; frame < 30; frame += 1) session.step(PIVOT);

    const turn = angleDistance(startHeading, session.car.heading);
    const travel = Math.hypot(session.car.position.x - startX, session.car.position.z - startZ);
    assert.ok(turn > 0.9, `drift turn should remain responsive, got ${turn.toFixed(3)} rad`);
    assert.ok(turn < 1.35, `drift turn should be slower than Phase44, got ${turn.toFixed(3)} rad`);
    assert.ok(travel < 0.08, `Turbo pivot should remain almost stationary, travelled ${travel.toFixed(3)}`);
    assert.match(source, /input\.throttle > 0\.12 && input\.brake < 0\.24 && !input\.boost/);
  } finally {
    session.dispose();
  }
});

test("Phase 49 gives enemies a visible knockback even on normal non-Turbo contact", () => {
  const session = new CartArenaSession();
  try {
    disableUnrelatedInteractions(session);
    const enemy = session.enemies.find((candidate) => candidate.id === "enemy-a");
    assert.ok(enemy);
    for (const other of session.enemies) {
      if (other.id === enemy.id) continue;
      other.alive = false;
      other.hp = 0;
    }
    forceLocation(session, "arena-01", 0, 28, 0);
    enemy.x = 0;
    enemy.z = 30.5;
    enemy.alive = true;
    enemy.hp = enemy.maxHp;
    const beforeZ = enemy.z;
    session.car.forwardVelocity = 2.6;
    session.car.velocity.z = 2.6;
    session.car.speed = 2.6;

    session.step(DRIVE);

    assert.ok(enemy.z > beforeZ + 0.12, `normal contact should knock the enemy away, dz=${enemy.z - beforeZ}`);
  } finally {
    session.dispose();
  }
});

test("Phase 49 lets the cart collect a pickup with only an edge graze", () => {
  assert.ok(CART_PHASE49_PICKUP_GRAZE_RADIUS >= 2);
  const pickup = { radius: 1.65, x: 0, z: 0, collected: false };
  assert.equal(cartPhase49PickupGrazeContact(pickup, 3.55, 0), true);
  assert.equal(cartPhase49PickupGrazeContact(pickup, 3.9, 0), false);
});

test("Phase 49 makes the player car one size smaller without changing the world scale", () => {
  assert.equal(CART_PHASE49_PLAYER_VISUAL_SCALE, 0.88);
  assert.match(source, /playerVisual\.scale\.setScalar\(CART_PHASE49_PLAYER_VISUAL_SCALE\)/);
  assert.match(source, /CART_PHASE49_CONTACT_CAR_RADIUS = 1\.28/);
});

test("Phase 49 loads after the route completion fixes", () => {
  const phase47 = appSource.indexOf("CartRoguePhase47TransitCompletion");
  const phase48 = appSource.indexOf("CartRoguePhase48RouteExitCompletion");
  const phase49 = appSource.indexOf("CartRoguePhase49HandlingContact");
  assert.ok(phase47 >= 0);
  assert.ok(phase48 > phase47);
  assert.ok(phase49 > phase48);
});

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
import {
  CART_PHASE50_ARENA03_CENTER_CLEAR_RADIUS,
  CART_PHASE50_ARENA03_LEGACY_COLLIDER_HALF_DEPTH,
  CART_PHASE50_ARENA03_LEGACY_COLLIDER_HALF_WIDTH,
} from "../src/cart/CartRoguePhase50Arena03CenterClearance";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { cartWorldNodeById, type CartWorldLocation } from "../src/cart/CartWorldGraph";

const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
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

test("Phase 50 removes initial Arena 03 enemies from the central driving lane", () => {
  const session = new CartArenaSession();
  try {
    const node = cartWorldNodeById("arena-03");
    assert.ok(node);
    session.snapshot();
    const local = session.enemies.filter((enemy) => enemy.alive && enemy.nodeId === node.id);
    assert.ok(local.length >= 4);
    for (const enemy of local) {
      const distance = Math.hypot(enemy.x - node.rect.centerX, enemy.z - node.rect.centerZ);
      assert.ok(
        distance >= CART_PHASE50_ARENA03_CENTER_CLEAR_RADIUS,
        `${enemy.id} must not begin as a hidden center-lane blocker, distance=${distance}`,
      );
    }
  } finally {
    session.dispose();
  }
});

test("Phase 50 disables only legacy Rally colliders that intrude into the Arena 03 center band", () => {
  const session = new CartArenaSession();
  try {
    const node = cartWorldNodeById("arena-03");
    assert.ok(node);
    const fake = {
      id: "phase50-test-hidden-center-wall",
      source: "gate-post" as const,
      x: node.rect.centerX + CART_PHASE50_ARENA03_LEGACY_COLLIDER_HALF_WIDTH * 0.4,
      z: node.rect.centerZ + CART_PHASE50_ARENA03_LEGACY_COLLIDER_HALF_DEPTH * 0.4,
      shape: "box" as const,
      radius: 1,
      halfWidth: 1,
      halfDepth: 1,
      rotationY: 0,
      solid: true,
      destructible: false,
      active: true,
    };
    session.track.staticColliders.push(fake);
    session.snapshot();
    assert.equal(fake.active, false);
  } finally {
    session.dispose();
  }
});

test("Phase 50 keeps Arena 03 centerline continuously traversable", () => {
  const session = new CartArenaSession();
  try {
    session.snapshot();
    for (const obstacle of session.obstacles.filter((candidate) => candidate.nodeId === "arena-03")) obstacle.destroyed = true;
    for (const enemy of session.enemies.filter((candidate) => candidate.nodeId === "arena-03")) enemy.moveSpeed = 0;
    forceLocation(session, "arena-03", 0, 263, 0);

    let guard = 0;
    while (session.snapshot().z < 286 && guard < 180) {
      session.step(DRIVE);
      guard += 1;
    }
    const snapshot = session.snapshot();
    assert.equal(snapshot.nodeId, "arena-03");
    assert.ok(snapshot.z >= 286, `Arena 03 center should be passable, z=${snapshot.z}, frames=${guard}`);
    assert.ok(snapshot.speed > 2.5, `cart should retain useful speed through the center, speed=${snapshot.speed}`);
  } finally {
    session.dispose();
  }
});

test("Phase 50 makes a mobile Arena 03 enemy yield instead of acting like a hard wall", () => {
  const session = new CartArenaSession();
  try {
    session.snapshot();
    const enemy = session.enemies.find((candidate) => candidate.nodeId === "arena-03" && candidate.kind === "chaser");
    assert.ok(enemy);
    for (const other of session.enemies.filter((candidate) => candidate.nodeId === "arena-03" && candidate.id !== enemy.id)) {
      other.alive = false;
      other.hp = 0;
    }
    for (const obstacle of session.obstacles.filter((candidate) => candidate.nodeId === "arena-03")) obstacle.destroyed = true;
    forceLocation(session, "arena-03", 0, 276, 0);
    enemy.x = 0;
    enemy.z = 278.4;
    enemy.moveSpeed = 0;
    const enemyBefore = enemy.z;
    session.car.forwardVelocity = 3.4;
    session.car.velocity.z = 3.4;
    session.car.speed = 3.4;

    session.step(DRIVE);

    assert.ok(enemy.z > enemyBefore + 0.2, `mobile enemy should yield forward, dz=${enemy.z - enemyBefore}`);
    assert.ok(session.car.position.z >= 276, `player should not be shoved backward by the contact, z=${session.car.position.z}`);
  } finally {
    session.dispose();
  }
});

test("Phase 50 is loaded after Phase 49", () => {
  const phase49 = appSource.indexOf("CartRoguePhase49HandlingContact");
  const phase50 = appSource.indexOf("CartRoguePhase50Arena03CenterClearance");
  assert.ok(phase49 >= 0);
  assert.ok(phase50 > phase49);
});

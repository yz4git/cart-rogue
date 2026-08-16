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
import {
  CART_PHASE45_BOSS_CLEAR_GRACE_MS,
  CART_PHASE45_EXIT_GUIDE_MS,
  CART_PHASE45_STAGE_CLEAR_GRACE_MS,
  cartPhase45ExitGuideAngle,
} from "../src/cart/CartRoguePhase45StabilityGuidance";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { cartWorldNodeById, type CartWorldLocation } from "../src/cart/CartWorldGraph";

const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;
const source = readFileSync(new URL("../src/cart/CartRoguePhase45StabilityGuidance.ts", import.meta.url), "utf8");
const guideSource = readFileSync(new URL("../src/cart/CartExitGuideVisual.ts", import.meta.url), "utf8");
const guidanceSource = readFileSync(new URL("../src/cart/CartExitGuidance.ts", import.meta.url), "utf8");
const phase46Source = readFileSync(new URL("../src/cart/CartRoguePhase46GroundPatternRecovery.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");

function forceLocation(session: CartArenaSession, nodeId: string): void {
  const node = cartWorldNodeById(nodeId);
  assert.ok(node);
  (session as unknown as { location: CartWorldLocation }).location = {
    node,
    localX: session.car.position.x - node.rect.centerX,
    localZ: session.car.position.z - node.rect.centerZ,
  };
}

test("Phase 45 gameplay no longer owns obsolete ground or Three.js rendering", () => {
  assert.doesNotMatch(source, /from "three"/);
  assert.doesNotMatch(source, /stabilizeGroundLayers|phase35-road-mosaic|phase38-reliable-road-mosaic|phase34-floor-detail/);
  assert.match(phase46Source, /phase34-floor-detail/);
  assert.match(phase46Source, /phase46-safe-ground-pattern/);
  assert.match(guideSource, /from "three"/);
  assert.match(guideSource, /phase45-exit-guide/);
});

test("Phase 45 clear grace outlasts every authored destruction reaction", () => {
  assert.ok(CART_PHASE45_STAGE_CLEAR_GRACE_MS > 780);
  assert.ok(CART_PHASE45_STAGE_CLEAR_GRACE_MS < 1200);
  assert.ok(CART_PHASE45_BOSS_CLEAR_GRACE_MS > 900);
  assert.ok(CART_PHASE45_BOSS_CLEAR_GRACE_MS < 1400);
  assert.ok(CART_PHASE45_EXIT_GUIDE_MS >= 3500 && CART_PHASE45_EXIT_GUIDE_MS <= 5000);
  assert.match(source, /enemiesAlive: Math\.max\(1, snapshot\.enemiesAlive\)/);
  assert.match(source, /lastReward: null/);
  assert.match(source, /runComplete: false/);
});

test("Phase 45 keeps a small transit-room corner from trapping the cart", () => {
  const session = new CartArenaSession();
  try {
    for (const obstacle of session.obstacles) obstacle.destroyed = true;
    for (const enemy of session.enemies) enemy.moveSpeed = 0;
    const node = cartWorldNodeById("junction-02");
    assert.ok(node);

    const maxX = node.rect.centerX + node.rect.halfWidth - 1.55;
    const minZ = node.rect.centerZ - node.rect.halfDepth + 1.55;
    session.car.position.set(maxX - 0.08, session.car.position.y, minZ + 0.08);
    session.car.heading = Math.PI;
    session.car.forwardVelocity = 5;
    session.car.lateralVelocity = 0;
    forceLocation(session, node.id);

    session.step(DRIVE);

    assert.ok(session.car.position.x <= maxX - 0.75, `corner release should move inward on X, x=${session.car.position.x}`);
    assert.ok(session.car.position.z >= minZ + 0.75, `corner release should move inward on Z, z=${session.car.position.z}`);
    assert.ok(session.car.speed > 2.5, `corner release should preserve usable motion, speed=${session.car.speed}`);
  } finally {
    session.dispose();
  }
});

test("Phase 45 defers Stage 1 clear presentation until the final enemy reaction has finished", () => {
  const session = new CartArenaSession();
  try {
    for (const obstacle of session.obstacles) obstacle.destroyed = true;
    for (const enemy of session.enemies) enemy.moveSpeed = 0;
    const node = cartWorldNodeById("arena-02");
    assert.ok(node);
    session.car.position.set(node.rect.centerX, session.car.position.y, node.rect.centerZ);
    session.car.heading = 0;
    session.car.forwardVelocity = 13;
    session.car.lateralVelocity = 0;
    forceLocation(session, node.id);

    const local = session.enemies.filter((enemy) => enemy.nodeId === node.id);
    assert.ok(local.length > 0);
    for (const enemy of local) {
      enemy.alive = false;
      enemy.hp = 0;
    }
    const target = local[0];
    target.alive = true;
    target.hp = 1;
    target.x = session.car.position.x;
    target.z = session.car.position.z + 1.8;

    session.car.boostActive = true;
    session.car.boostTimeRemaining = 1;
    session.step(DRIVE);
    assert.equal(target.alive, false, "the final target should be destroyed on the trigger frame");

    const during = session.snapshot();
    assert.equal(during.enemiesAlive, 1, "clear UI must stay pending during the destruction grace");
    assert.equal(during.gateLocked, true);
    assert.equal(during.lastReward, null);

    for (let frame = 0; frame < 58; frame += 1) session.step(IDLE);
    const after = session.snapshot();
    assert.equal(after.enemiesAlive, 0, "clear should become visible after the destruction reaction has completed");
    assert.equal(after.gateLocked, false);
  } finally {
    session.dispose();
  }
});

test("exit guidance points forward through a fork until the player commits to a side", () => {
  const straight = cartPhase45ExitGuideAngle({ nodeId: "arena-02", x: 0, z: 116, heading: 0 });
  assert.ok(straight !== null && Math.abs(straight) < 0.01);

  const forkCenter = cartPhase45ExitGuideAngle({ nodeId: "junction-02", x: 0, z: 158, heading: 0 });
  assert.ok(forkCenter !== null && Math.abs(forkCenter) < 0.01, `fork center should indicate forward progress, got ${forkCenter}`);

  const committedRight = cartPhase45ExitGuideAngle({ nodeId: "junction-02", x: 10, z: 163, heading: 0 });
  assert.ok(committedRight !== null && committedRight > 0, `right-side commitment should point right, got ${committedRight}`);
  assert.equal(cartPhase45ExitGuideAngle({ nodeId: "boss-01", x: 0, z: 448, heading: 0 }), null);
  assert.match(guidanceSource, /cartExitGuidePointForNode/);
  assert.match(guideSource, /phase45-exit-guide/);
  assert.match(guideSource, /remainingSeconds = CART_EXIT_GUIDE_MS \/ 1000/);
});

test("exit-guide visual is installed after Phase 45 gameplay and before final ground rendering", () => {
  const phase44 = appSource.indexOf("CartRoguePhase44RequestedFixes");
  const phase45 = appSource.indexOf("CartRoguePhase45StabilityGuidance");
  const guide = appSource.indexOf("CartExitGuideVisual");
  const phase46 = appSource.indexOf("CartRoguePhase46GroundPatternRecovery");
  assert.ok(phase44 >= 0);
  assert.ok(phase45 > phase44);
  assert.ok(guide > phase45);
  assert.ok(phase46 > guide);
});

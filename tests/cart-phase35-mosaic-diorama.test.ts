import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "../src/cart/CartRoguePhase14Arenas";
import "../src/cart/CartRoguePhase15Turbo";
import "../src/cart/CartRoguePhase23GateAndPivot";
import "../src/cart/CartRoguePhase33HandlingCombat";
import {
  cartMosaicApronWidth,
  cartMosaicGrassPalette,
  cartMosaicRoadPalette,
  cartMosaicRoadTileSize,
} from "../src/cart/CartRoguePhase35MosaicDiorama";
import {
  cartPhase36MosaicContrast,
  cartPhase36MosaicRoadLift,
  cartPhase36NormalSpeedCap,
  cartPhase36PointInStrictGateLane,
} from "../src/cart/CartRoguePhase36TraversalVisibility";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { cartWorldNodeById } from "../src/cart/CartWorldGraph";

const phaseSource = readFileSync(new URL("../src/cart/CartRoguePhase35MosaicDiorama.ts", import.meta.url), "utf8");
const phase36Source = readFileSync(new URL("../src/cart/CartRoguePhase36TraversalVisibility.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app/CartRogueGamePhase13.tsx", import.meta.url), "utf8");
const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;
const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;

function clearNode(session: CartArenaSession, nodeId: string): void {
  for (const enemy of session.enemies.filter((candidate) => candidate.nodeId === nodeId)) enemy.alive = false;
}

test("Phase 35 uses a coarse lightweight mosaic rather than subdividing gameplay terrain", () => {
  assert.ok(cartMosaicRoadTileSize() >= 2.4, "road tiles should stay coarse enough for mobile");
  assert.ok(cartMosaicApronWidth() >= 7, "visual apron should create a readable roadside band");
  assert.match(phaseSource, /InstancedMesh/);
  assert.match(phaseSource, /PlaneGeometry/);
  assert.doesNotMatch(phaseSource, /collider|physicsBody|RigidBody/i);
});

test("Phase 35 separates warm road colors from green roadside colors", () => {
  const road = cartMosaicRoadPalette("meadow");
  const grass = cartMosaicGrassPalette("meadow");
  assert.ok(road.length >= 4);
  assert.ok(grass.length >= 4);
  assert.notDeepEqual(road, grass);
  assert.notEqual(road[0], grass[0]);
});

test("Phase 35 keeps distinct stage palettes for the mosaic floor", () => {
  assert.notDeepEqual(cartMosaicRoadPalette("meadow"), cartMosaicRoadPalette("boss"));
  assert.notDeepEqual(cartMosaicGrassPalette("orchard"), cartMosaicGrassPalette("grove"));
});

test("Phase 35 includes flat roadside water, banks, flower beds and sparse hero trees", () => {
  assert.match(phaseSource, /phase35-water-mosaic/);
  assert.match(phaseSource, /phase35-stone-banks/);
  assert.match(phaseSource, /phase35-flower-beds/);
  assert.match(phaseSource, /phase35-hero-tree-canopies/);
});

test("Phase 36 lifts the mosaic above the legacy arena floor and strengthens tile contrast", () => {
  assert.ok(cartPhase36MosaicRoadLift() >= 0.05, "mosaic needs a clear depth separation from the legacy floor");
  const contrast = Array.from({ length: 14 }, (_, index) => cartPhase36MosaicContrast(index));
  assert.ok(Math.min(...contrast) <= 0.8, "some tiles should be visibly darker");
  assert.ok(Math.max(...contrast) >= 1.08, "some tiles should be visibly lighter");
  assert.match(phase36Source, /phase35-road-mosaic/);
  assert.match(phase36Source, /instanceColor/);
  assert.match(phase36Source, /phase34-floor-detail/);
});

test("Phase 36 lowers final non-Turbo speed again", () => {
  assert.equal(cartPhase36NormalSpeedCap("arena"), 16.8);
  assert.equal(cartPhase36NormalSpeedCap("corridor"), 19.6);
  assert.equal(cartPhase36NormalSpeedCap("boss"), 16.0);

  const session = new CartArenaSession();
  try {
    for (const obstacle of session.obstacles) obstacle.destroyed = true;
    for (const enemy of session.enemies) enemy.moveSpeed = 0;
    session.car.position.set(0, 0, 28);
    session.car.forwardVelocity = 28;
    session.car.lateralVelocity = 0;
    session.step(IDLE);
    assert.ok(session.car.speed <= 16.81, `final normal speed should cap near 16.8, got ${session.car.speed}`);
  } finally {
    session.dispose();
  }
});

test("Phase 36 lets Stage 2 clear progress through the correct gate even at an oblique heading", () => {
  const session = new CartArenaSession();
  try {
    for (const obstacle of session.obstacles) obstacle.destroyed = true;
    for (const enemy of session.enemies) enemy.moveSpeed = 0;

    clearNode(session, "arena-01");
    session.car.position.set(0, 0, 51.2);
    session.car.heading = 0;
    session.car.forwardVelocity = 5;
    session.step(DRIVE);
    assert.equal(session.snapshot().nodeId, "corridor-01");

    session.car.position.set(0, 0, 93);
    session.car.forwardVelocity = 0;
    session.step(IDLE);
    assert.equal(session.snapshot().nodeId, "arena-02");

    clearNode(session, "arena-02");
    session.car.position.set(0, 0, 139.1);
    session.car.heading = 1.82;
    session.car.forwardVelocity = 0.5;
    session.car.lateralVelocity = 0;
    session.step(DRIVE);

    assert.equal(session.snapshot().nodeId, "junction-02", "Stage 2 clear should not hang at the open exit");
    assert.ok(session.car.position.z >= 141, `car should be placed safely inside the fork corridor, z=${session.car.position.z}`);
  } finally {
    session.dispose();
  }
});

test("Phase 36 rejects the old wide Stage 1 gate shortcut through the visible side wall", () => {
  const arena = cartWorldNodeById("arena-01");
  const corridor = cartWorldNodeById("corridor-01");
  assert.ok(arena && corridor);
  assert.equal(cartPhase36PointInStrictGateLane(arena, corridor, 9.2, 51), false);
  assert.equal(cartPhase36PointInStrictGateLane(arena, corridor, 0, 51), true);

  const session = new CartArenaSession();
  try {
    for (const obstacle of session.obstacles) obstacle.destroyed = true;
    for (const enemy of session.enemies) enemy.moveSpeed = 0;
    clearNode(session, "arena-01");
    session.car.position.set(9.2, 0, 50.9);
    session.car.heading = 0;
    session.car.forwardVelocity = 6;
    session.car.lateralVelocity = 0;
    session.step(DRIVE);

    assert.equal(session.snapshot().nodeId, "arena-01", "gate-side wall must not be treated as an exit portal");
    assert.ok(session.car.position.z < 52, `wall rejection should keep the car in Stage 1, z=${session.car.position.z}`);
  } finally {
    session.dispose();
  }
});

test("Phase 36 is loaded after the mosaic layer", () => {
  const phase34 = appSource.indexOf("CartRoguePhase34FloorDetail");
  const phase35 = appSource.indexOf("CartRoguePhase35MosaicDiorama");
  const phase36 = appSource.indexOf("CartRoguePhase36TraversalVisibility");
  assert.ok(phase34 >= 0);
  assert.ok(phase35 > phase34);
  assert.ok(phase36 > phase35);
});

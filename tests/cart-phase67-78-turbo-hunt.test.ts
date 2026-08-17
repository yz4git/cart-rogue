import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import {
  cartTurboHuntActiveTargetCount,
  cartTurboHuntPhaseFor,
  cartTurboHuntRegion,
  cartTurboHuntShouldSpawnBoss,
  createCartTurboHuntEnemyPool,
  createCartTurboHuntObstacles,
  createCartTurboHuntResources,
  enableCartTurboHunt,
  getCartTurboHuntSnapshot,
} from "../src/cart/CartRoguePhase67TurboHunt";
import { CART_TURBO_HUNT_FIELD, CART_TURBO_HUNT_TRACK } from "../src/cart/CartTurboHuntTrack";
import { CART_ROGUE_RUNTIME_PHASE_ORDER } from "../src/cart/CartRogueRuntime";

const design = readFileSync(new URL("../docs/TURBO_HUNT_DESIGN.md", import.meta.url), "utf8");

test("Turbo Hunt uses one giant continuous support field instead of room progression", () => {
  assert.equal(CART_TURBO_HUNT_FIELD.id, "hunt-field");
  assert.ok(CART_TURBO_HUNT_FIELD.halfWidth >= 90);
  assert.ok(CART_TURBO_HUNT_FIELD.halfDepth >= 90);
  assert.ok(CART_TURBO_HUNT_TRACK.roadWidth >= CART_TURBO_HUNT_FIELD.halfWidth * 2);
  assert.equal(CART_TURBO_HUNT_TRACK.surfaceZones?.[0]?.surface, "road");
});

test("Turbo Hunt enemy population is a bounded reusable pool with one inactive boss slot", () => {
  const enemies = createCartTurboHuntEnemyPool();
  const ids = new Set(enemies.map((enemy) => enemy.id));
  assert.equal(ids.size, enemies.length);
  assert.ok(enemies.length >= 18 && enemies.length <= 24);
  assert.equal(enemies.filter((enemy) => enemy.kind === "boss").length, 1);
  assert.ok(enemies.every((enemy) => enemy.nodeId === "hunt-field"));
  assert.ok(enemies.every((enemy) => !enemy.alive));
  assert.ok(enemies.filter((enemy) => enemy.kind === "heavy").length >= 3);
  assert.ok(enemies.some((enemy) => enemy.archetype === "bomber"));
});

test("director pressure rises without changing maps", () => {
  assert.equal(cartTurboHuntPhaseFor(2, 0, 0, false, false), "drop-in");
  assert.equal(cartTurboHuntPhaseFor(12, 5, 0, false, false), "hunt");
  assert.equal(cartTurboHuntPhaseFor(36, 20, 0, false, false), "heat-up");
  assert.equal(cartTurboHuntPhaseFor(65, 68, 3, false, false), "elite-invasion");
  assert.equal(cartTurboHuntPhaseFor(90, 85, 4, false, false), "overdrive");
  assert.equal(cartTurboHuntPhaseFor(120, 80, 5, true, true), "boss-arrival");
  assert.equal(cartTurboHuntPhaseFor(121, 80, 5, true, false), "clear");

  assert.equal(cartTurboHuntActiveTargetCount("drop-in"), 6);
  assert.equal(cartTurboHuntActiveTargetCount("hunt"), 8);
  assert.equal(cartTurboHuntActiveTargetCount("overdrive"), 13);
  assert.equal(cartTurboHuntActiveTargetCount("boss-arrival"), 9);
});

test("boss arrival is earned by sustained hunt play and still has a time fallback", () => {
  assert.equal(cartTurboHuntShouldSpawnBoss(104, 30, 6, 100), false);
  assert.equal(cartTurboHuntShouldSpawnBoss(110, 19, 6, 90), false);
  assert.equal(cartTurboHuntShouldSpawnBoss(110, 24, 3, 90), false);
  assert.equal(cartTurboHuntShouldSpawnBoss(110, 24, 5, 51), false);
  assert.equal(cartTurboHuntShouldSpawnBoss(110, 24, 5, 70), true);
  assert.equal(cartTurboHuntShouldSpawnBoss(151, 0, 0, 0), true);
});

test("the giant field exposes five readable regions without traversal locks", () => {
  const { centerX: x, centerZ: z } = CART_TURBO_HUNT_FIELD;
  assert.equal(cartTurboHuntRegion(x, z - 60), "DROP YARD");
  assert.equal(cartTurboHuntRegion(x - 60, z), "SMASH GARDEN");
  assert.equal(cartTurboHuntRegion(x + 60, z), "SPRINT LANE");
  assert.equal(cartTurboHuntRegion(x, z + 60), "CROWN GROUNDS");
  assert.equal(cartTurboHuntRegion(x, z), "CROSSFIRE GARDEN");
});

test("rocks and pickups are fixed-size field pools rather than corridor rewards", () => {
  const rocks = createCartTurboHuntObstacles();
  const pickups = createCartTurboHuntResources();
  assert.equal(rocks.length, 12);
  assert.equal(pickups.length, 6);
  assert.ok(rocks.every((rock) => rock.nodeId === "hunt-field"));
  assert.ok(pickups.every((pickup) => pickup.nodeId === "hunt-field"));
  assert.ok(pickups.some((pickup) => pickup.kind === "turbo"));
  assert.ok(pickups.some((pickup) => pickup.kind === "gas"));
});

test("a live Turbo Hunt session stays gate-free and keeps stationary Turbo pivot steering", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  const startHeading = session.car.heading;
  for (let index = 0; index < 36; index += 1) {
    session.step({ throttle: 1, brake: 0, steer: 1, boost: true }, 1 / 60);
  }
  const hunt = getCartTurboHuntSnapshot(session);
  const snapshot = session.snapshot();
  assert.equal(hunt?.gameMode, "turbo-hunt");
  assert.equal(snapshot.nodeId, "hunt-field");
  assert.equal(snapshot.gateLocked, false);
  assert.ok(snapshot.enemiesAlive >= 6);
  assert.ok(Math.abs(session.car.heading - startHeading) > 0.15);
  assert.ok(Math.abs(session.car.forwardVelocity) < 0.1);
  assert.equal(snapshot.runComplete, false);
});

test("Turbo Hunt is installed after the proven combat stack and its presentation guard is last", () => {
  const huntIndex = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase67TurboHunt");
  const phase66Index = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase66TurboChainReward");
  const guardIndex = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase78TurboHuntPresentationGuard");
  assert.ok(huntIndex > phase66Index);
  assert.ok(guardIndex > huntIndex);
  assert.equal(CART_ROGUE_RUNTIME_PHASE_ORDER.at(-1), "CartRoguePhase78TurboHuntPresentationGuard");
});

test("design records continuous-field acceptance criteria before implementation", () => {
  assert.match(design, /DROP IN → HUNT → HEAT UP → ELITE INVASION → OVERDRIVE → BOSS ARRIVAL/);
  assert.match(design, /No enemy-clear gate is required to continue moving/);
  assert.match(design, /Perfect Strike and Shockwave work across the hunt field/);
  assert.match(design, /WebGL and Canvas both support Turbo Hunt/);
});

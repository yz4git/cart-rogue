import assert from "node:assert/strict";
import test from "node:test";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { createGeneratedWave, createInitialCartEnemies } from "../src/cart/CartCombat";
import { createInitialCartObstacles } from "../src/cart/CartObstacles";
import { createInitialCartResources } from "../src/cart/CartResources";
import {
  CART_RUN_UPGRADES,
  applyCartRunUpgrade,
  cartScrapReward,
  getCartRunModifiers,
  resetCartRunProgression,
} from "../src/cart/CartRunProgression";
import {
  CART_WORLD_GRAPH,
  cartUpcomingRouteChoices,
  cartWorldNodeById,
  configureCartRunMap,
  getActiveCartRunSeed,
  locateCartWorldNode,
  validateCartWorldGraph,
} from "../src/cart/CartWorldGraph";

const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

test("Phase 9 world graph is a validated two-fork run that converges before the boss", () => {
  configureCartRunMap(0x1234567);
  assert.deepEqual(validateCartWorldGraph(), []);
  assert.ok(CART_WORLD_GRAPH.nodes.length >= 13);
  assert.deepEqual(cartWorldNodeById("junction-02")?.next, ["route-03-left", "route-03-right"]);
  assert.deepEqual(cartWorldNodeById("route-03-left")?.next, ["junction-03"]);
  assert.deepEqual(cartWorldNodeById("route-03-right")?.next, ["junction-03"]);
  assert.deepEqual(cartWorldNodeById("junction-04")?.next, ["route-04-left", "route-04-right"]);
  assert.deepEqual(cartWorldNodeById("route-04-left")?.next, ["corridor-02"]);
  assert.deepEqual(cartWorldNodeById("route-04-right")?.next, ["corridor-02"]);
  assert.deepEqual(cartWorldNodeById("corridor-02")?.next, ["boss-01"]);
});

test("run map generation is deterministic for a seed and exposes readable left/right choices", () => {
  configureCartRunMap(77123);
  const first = cartUpcomingRouteChoices("arena-02");
  configureCartRunMap(77123);
  const second = cartUpcomingRouteChoices("arena-02");
  assert.deepEqual(second, first);
  assert.equal(getActiveCartRunSeed(), 77123);
  assert.equal(first.length, 2);
  assert.deepEqual(first.map((choice) => choice.lane).sort(), ["left", "right"]);
  assert.ok(first.every((choice) => choice.label.length > 0 && choice.rewardHint.length > 0));
  assert.ok(first.every((choice) => choice.danger >= 1 && choice.danger <= 3));
});

test("different seeds produce route-plan variety instead of one disguised fixed map", () => {
  const plans = new Set<string>();
  for (let seed = 1; seed <= 24; seed += 1) {
    configureCartRunMap(seed);
    const a = cartUpcomingRouteChoices("arena-02").map((choice) => `${choice.lane}:${choice.routeType}`).join("|");
    const b = cartUpcomingRouteChoices("arena-03").map((choice) => `${choice.lane}:${choice.routeType}`).join("|");
    plans.add(`${a}::${b}`);
  }
  assert.ok(plans.size >= 4, `expected several generated plans, got ${plans.size}`);
});

test("physical fork location follows left/right steering space and both branches rejoin", () => {
  configureCartRunMap(991);
  assert.equal(locateCartWorldNode(-9, 184)?.node.id, "route-03-left");
  assert.equal(locateCartWorldNode(9, 184)?.node.id, "route-03-right");
  assert.equal(locateCartWorldNode(-9, 348)?.node.id, "route-04-left");
  assert.equal(locateCartWorldNode(9, 348)?.node.id, "route-04-right");
  assert.equal(locateCartWorldNode(0, 238)?.node.id, "junction-03");
  assert.equal(locateCartWorldNode(0, 402)?.node.id, "corridor-02");
});

test("service, salvage, and event route types author materially different pickups and smash fields", () => {
  let sawService = false;
  let sawScrap = false;
  let sawEvent = false;
  for (let seed = 1; seed <= 80 && !(sawService && sawScrap && sawEvent); seed += 1) {
    configureCartRunMap(seed);
    const resources = createInitialCartResources();
    const obstacles = createInitialCartObstacles();
    for (const node of CART_WORLD_GRAPH.nodes.filter((candidate) => candidate.id.startsWith("route-"))) {
      if (node.routeType === "service") {
        sawService = true;
        assert.ok(resources.filter((pickup) => pickup.nodeId === node.id).length >= 5);
      }
      if (node.routeType === "scrap") {
        sawScrap = true;
        assert.ok(resources.filter((pickup) => pickup.nodeId === node.id && pickup.kind === "turbo").length >= 2);
        assert.ok(obstacles.filter((obstacle) => obstacle.nodeId === node.id).length >= 8);
      }
      if (node.routeType === "event") {
        sawEvent = true;
        assert.ok(resources.filter((pickup) => pickup.nodeId === node.id && pickup.kind === "turbo").length >= 3);
        assert.ok(obstacles.filter((obstacle) => obstacle.nodeId === node.id).length >= 6);
      }
    }
  }
  assert.equal(sawService && sawScrap && sawEvent, true);
});

test("mid-run generated wave introduces Striker and Orbiter behavior without changing legacy enemy kind snapshots", () => {
  configureCartRunMap(403);
  const node = cartWorldNodeById("arena-03")!;
  const wave = createGeneratedWave(node);
  assert.equal(wave.length, 5);
  assert.equal(wave.some((enemy) => enemy.archetype === "striker"), true);
  assert.equal(wave.some((enemy) => enemy.archetype === "orbiter"), true);
  assert.equal(wave.filter((enemy) => enemy.archetype === "striker" || enemy.archetype === "orbiter").every((enemy) => enemy.kind === "chaser"), true);
});

test("generated elite route guarantees a Heavy while utility routes spawn no combat wave", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    configureCartRunMap(seed);
    const enemies = createInitialCartEnemies();
    for (const node of CART_WORLD_GRAPH.nodes.filter((candidate) => candidate.id.startsWith("route-"))) {
      const local = enemies.filter((enemy) => enemy.nodeId === node.id);
      if (node.routeType === "elite") {
        assert.ok(local.length >= 5);
        assert.equal(local.some((enemy) => enemy.kind === "heavy"), true);
      }
      if (node.routeType === "service" || node.routeType === "scrap" || node.routeType === "event") {
        assert.equal(local.length, 0);
      }
    }
  }
});

test("Phase 9 expands the perk pool and new perks change actual combat/economy modifiers", () => {
  resetCartRunProgression(55);
  assert.ok(CART_RUN_UPGRADES.length >= 14);
  const baseline = getCartRunModifiers();
  applyCartRunUpgrade("hunter-array");
  applyCartRunUpgrade("kill-switch");
  applyCartRunUpgrade("launch-control");
  applyCartRunUpgrade("overcharge-coil");
  applyCartRunUpgrade("signal-scrambler");
  applyCartRunUpgrade("salvage-bond");
  const upgraded = getCartRunModifiers();
  assert.ok(upgraded.mobileDamageMultiplier > baseline.mobileDamageMultiplier);
  assert.ok(upgraded.executionThreshold > baseline.executionThreshold);
  assert.ok(upgraded.redlineSpeed < baseline.redlineSpeed);
  assert.ok(upgraded.redlineDamageMultiplier > baseline.redlineDamageMultiplier);
  assert.ok(upgraded.enemySpeedMultiplier < baseline.enemySpeedMultiplier);
  assert.ok(cartScrapReward(5) >= 7);
});

test("a session can resolve directly into either generated branch node with its authored encounter", () => {
  resetCartRunProgression(991);
  const session = new CartArenaSession();
  try {
    session.car.position.set(-9, session.car.position.y, 184);
    session.car.forwardVelocity = 0;
    session.step(IDLE);
    const left = session.snapshot();
    assert.equal(left.nodeId, "route-03-left");
    assert.equal(left.encounter, cartWorldNodeById("route-03-left")?.encounter);

    session.car.position.set(9, session.car.position.y, 184);
    session.car.forwardVelocity = 0;
    session.step(IDLE);
    const right = session.snapshot();
    assert.equal(right.nodeId, "route-03-right");
    assert.equal(right.encounter, cartWorldNodeById("route-03-right")?.encounter);
  } finally {
    session.dispose();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { RallyTrack } from "../src/rally/RallyTrack";
import { CART_ARENA_TRACK } from "../src/cart/CartArenaTrack";
import { CART_TURBO_RECHARGE_SECONDS, CartArenaSession, cartSteeringInput } from "../src/cart/CartArenaSession";
import { applyTurboRam, createInitialCartEnemies } from "../src/cart/CartCombat";
import { cartResourceContact, createInitialCartResources } from "../src/cart/CartResources";
import {
  CART_WORLD_GRAPH,
  cartWorldNodeById,
  locateCartWorldNode,
  validateCartWorldGraph,
} from "../src/cart/CartWorldGraph";

const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

test("Cart world graph keeps the proven opening then expands into two converging route forks", () => {
  assert.deepEqual(validateCartWorldGraph(), []);
  assert.equal(CART_WORLD_GRAPH.startNodeId, "arena-01");
  assert.deepEqual(cartWorldNodeById("arena-01")?.next, ["corridor-01"]);
  assert.deepEqual(cartWorldNodeById("corridor-01")?.next, ["arena-02"]);
  assert.deepEqual(cartWorldNodeById("arena-02")?.next, ["junction-02"]);
  assert.deepEqual(cartWorldNodeById("junction-02")?.next, ["route-03-left", "route-03-right"]);
  assert.deepEqual(cartWorldNodeById("route-03-left")?.next, ["junction-03"]);
  assert.deepEqual(cartWorldNodeById("route-03-right")?.next, ["junction-03"]);
  assert.deepEqual(cartWorldNodeById("junction-04")?.next, ["route-04-left", "route-04-right"]);
  assert.deepEqual(cartWorldNodeById("route-04-left")?.next, ["corridor-02"]);
  assert.deepEqual(cartWorldNodeById("route-04-right")?.next, ["corridor-02"]);
  assert.deepEqual(cartWorldNodeById("corridor-02")?.next, ["boss-01"]);
  assert.deepEqual(cartWorldNodeById("boss-01")?.next, []);
});

test("authored playable bounds distinguish plazas, narrow passages, forks and boss arena", () => {
  assert.equal(locateCartWorldNode(22, 28)?.node.id, "arena-01");
  assert.equal(locateCartWorldNode(5.5, 72)?.node.id, "corridor-01");
  assert.equal(locateCartWorldNode(-24, 116)?.node.id, "arena-02");
  assert.equal(locateCartWorldNode(-9, 184)?.node.id, "route-03-left");
  assert.equal(locateCartWorldNode(9, 184)?.node.id, "route-03-right");
  assert.equal(locateCartWorldNode(30, 448)?.node.id, "boss-01");
  assert.equal(locateCartWorldNode(18, 72), null, "opening corridor should remain narrow");
});

test("legacy RallyTrack adapter exposes wide arenas and the narrow opening corridor across the longer run", () => {
  const track = new RallyTrack(CART_ARENA_TRACK);
  try {
    assert.ok(track.queryAt(0, 28).roadHalfWidth > 20);
    assert.ok(track.queryAt(0, 72).roadHalfWidth < 10);
    assert.ok(track.queryAt(0, 116).roadHalfWidth > 20);
    assert.ok(track.queryAt(0, 210).roadHalfWidth > 20);
    assert.ok(track.queryAt(0, 448).roadHalfWidth > 20);
  } finally {
    track.dispose();
  }
});

test("Cart steering deliberately reverses the inherited steering direction", () => {
  assert.equal(cartSteeringInput(-1), 1);
  assert.equal(cartSteeringInput(1), -1);
  assert.equal(cartSteeringInput(0.4), -0.4);
  assert.equal(cartSteeringInput(3), -1);
});

test("CartArenaSession starts in the first combat arena with renewable turbo stocks", () => {
  const session = new CartArenaSession();
  try {
    const state = session.snapshot();
    assert.equal(state.nodeId, "arena-01");
    assert.equal(state.encounter, "combat");
    assert.equal(state.gas, 1);
    assert.equal(state.enemiesAlive, 3);
    assert.equal(state.enemiesTotal, 3);
    assert.equal(state.gateLocked, true);
    assert.equal(state.boostCharges, 2);
    assert.equal(state.maxBoostCharges, 4);
    session.step({ ...DRIVE, boost: true });
    assert.equal(session.snapshot().boostCharges, 1);
    assert.equal(session.snapshot().boostActive, true);
  } finally {
    session.dispose();
  }
});

test("Turbo stocks regenerate on a fixed cooldown until the four-stock cap", () => {
  const session = new CartArenaSession();
  try {
    session.step({ ...DRIVE, boost: true });
    session.step(DRIVE);
    assert.equal(session.snapshot().boostCharges, 1);
    for (let i = 0; i < Math.ceil(CART_TURBO_RECHARGE_SECONDS * 60) + 2; i += 1) session.step(IDLE);
    assert.equal(session.snapshot().boostCharges, 2);
    for (let i = 0; i < Math.ceil(CART_TURBO_RECHARGE_SECONDS * 60 * 3) + 4; i += 1) session.step(IDLE);
    assert.equal(session.snapshot().boostCharges, 4);
    assert.equal(session.snapshot().turboRechargeSeconds, 0);
  } finally {
    session.dispose();
  }
});

test("Turbo RAM damages enemies, destroys light enemies, and makes heavy enemies take repeated hits", () => {
  const normalEnemy = createInitialCartEnemies()[0];
  const normal = applyTurboRam(normalEnemy, false, 20);
  assert.equal(normal.hit, true);
  assert.equal(normal.destroyed, false);
  assert.equal(normal.damage, 0);

  const lightEnemy = createInitialCartEnemies()[0];
  const light = applyTurboRam(lightEnemy, true, 20);
  assert.equal(light.destroyed, true);
  assert.equal(lightEnemy.alive, false);

  const heavyEnemy = createInitialCartEnemies().find((enemy) => enemy.kind === "heavy")!;
  const heavyFirst = applyTurboRam(heavyEnemy, true, 12);
  assert.equal(heavyFirst.hit, true);
  assert.equal(heavyFirst.destroyed, false);
  assert.ok(heavyEnemy.hp > 0 && heavyEnemy.hp < heavyEnemy.maxHp);
  const heavySecond = applyTurboRam(heavyEnemy, true, 20);
  assert.equal(heavySecond.destroyed, true);
});

test("the first arena gate remains locked until every local enemy is defeated", () => {
  const session = new CartArenaSession();
  try {
    assert.equal(session.snapshot().arena1GateLocked, true);
    for (const enemy of session.enemies.filter((candidate) => candidate.nodeId === "arena-01")) enemy.alive = false;
    assert.equal(session.snapshot().arena1GateLocked, false);
  } finally {
    session.dispose();
  }
});

test("an actual boosted car can ram an arena enemy through the shared vehicle runtime", () => {
  const session = new CartArenaSession();
  try {
    session.car.position.x = -11;
    session.car.position.z = 19.5;
    session.car.heading = 0;
    session.car.forwardVelocity = 19;
    session.step({ ...DRIVE, boost: true });
    for (let step = 0; step < 28 && session.enemies[0].alive; step += 1) session.step(DRIVE);
    assert.equal(session.enemies[0].alive, false);
    assert.equal(session.car.ramCount, 1);
    assert.equal(session.snapshot().lastRamEnemyId, "enemy-a");
    assert.ok(session.snapshot().lastRamDamage > 0);
  } finally {
    session.dispose();
  }
});

test("outer-wall impact becomes a wall slide instead of a stop-and-rewind collision", () => {
  const session = new CartArenaSession();
  try {
    session.car.position.set(26.6, session.car.position.y, 28);
    session.car.heading = Math.PI / 2;
    session.car.forwardVelocity = 18;
    for (let step = 0; step < 12; step += 1) session.step(DRIVE);
    const state = session.snapshot();
    const arena = cartWorldNodeById("arena-01")!;
    assert.ok(state.x < arena.rect.centerX + arena.rect.halfWidth, `wall slide should remain inside the authored arena, got ${state.x}`);
    assert.ok(Math.abs(session.car.forwardVelocity) > 4, "wall slide should preserve useful forward momentum");
    assert.equal(state.wallSliding, true);
    assert.ok(Math.abs(Math.cos(state.heading)) > 0.35, "heading should rotate toward the wall tangent");
  } finally {
    session.dispose();
  }
});

test("clearing the first encounter rewards resources and allows corridor transition", () => {
  const session = new CartArenaSession();
  try {
    session.car.position.x = 0;
    session.car.position.z = 51.4;
    session.car.heading = 0;
    session.car.forwardVelocity = 18;
    for (let step = 0; step < 12; step += 1) session.step(DRIVE);
    assert.equal(session.snapshot().nodeId, "arena-01", "locked gate should block corridor transition");

    for (const enemy of session.enemies.filter((candidate) => candidate.nodeId === "arena-01")) enemy.alive = false;
    session.step(IDLE);
    assert.match(session.snapshot().lastReward ?? "", /ARENA CLEAR/);
    session.car.position.z = 51.4;
    session.car.heading = 0;
    session.car.forwardVelocity = 18;
    for (let step = 0; step < 12 && session.snapshot().nodeId !== "corridor-01"; step += 1) session.step(DRIVE);
    assert.equal(session.snapshot().nodeId, "corridor-01");
  } finally {
    session.dispose();
  }
});

test("Arena 02 remains the authored four-enemy elite encounter before the first route fork", () => {
  const session = new CartArenaSession();
  try {
    for (const enemy of session.enemies.filter((candidate) => candidate.nodeId === "arena-01")) enemy.alive = false;
    session.car.position.x = 0;
    session.car.position.z = 116;
    session.car.forwardVelocity = 0;
    session.step(IDLE);
    let state = session.snapshot();
    assert.equal(state.nodeId, "arena-02");
    assert.equal(state.encounter, "elite");
    assert.equal(state.enemiesTotal, 4);
    assert.equal(state.arena2GateLocked, true);

    for (const enemy of session.enemies.filter((candidate) => candidate.nodeId === "arena-02")) enemy.alive = false;
    session.step(IDLE);
    state = session.snapshot();
    assert.equal(state.arena2GateLocked, false);
    assert.match(state.lastReward ?? "", /ELITE CLEAR/);
  } finally {
    session.dispose();
  }
});

test("base corridors still author GAS and Turbo cells while generated utility routes may add more", () => {
  const resources = createInitialCartResources();
  const base = resources.filter((pickup) => ["gas-01", "turbo-01", "gas-02", "turbo-02"].includes(pickup.id));
  assert.equal(base.length, 4);
  assert.deepEqual(base.map((pickup) => pickup.nodeId), ["corridor-01", "corridor-01", "corridor-02", "corridor-02"]);
  const gas = resources.find((pickup) => pickup.id === "gas-01")!;
  assert.equal(cartResourceContact(gas, "corridor-01", gas.x, gas.z), true);
  assert.equal(cartResourceContact(gas, "arena-01", gas.x, gas.z), false);
  gas.collected = true;
  assert.equal(cartResourceContact(gas, "corridor-01", gas.x, gas.z), false);
});

test("corridor Turbo cells restore one stock from the current rewarded state and disappear after collection", () => {
  const session = new CartArenaSession();
  try {
    for (const enemy of session.enemies.filter((candidate) => candidate.nodeId === "arena-01")) enemy.alive = false;
    session.step({ ...DRIVE, boost: true });
    session.step(IDLE);
    const before = session.snapshot().boostCharges;
    assert.ok(before < session.snapshot().maxBoostCharges);
    const turbo = session.resources.find((pickup) => pickup.id === "turbo-01")!;
    session.car.position.set(turbo.x, session.car.position.y, turbo.z);
    session.car.forwardVelocity = 0;
    session.step(IDLE);
    const state = session.snapshot();
    assert.equal(state.nodeId, "corridor-01");
    assert.equal(state.boostCharges, before + 1);
    assert.equal(state.resources.find((pickup) => pickup.id === "turbo-01")?.collected, true);
    assert.match(state.lastReward ?? "", /TURBO CELL/);
  } finally {
    session.dispose();
  }
});

test("Boss is a multi-hit Turbo RAM target and reaches zero HP deterministically", () => {
  const boss = createInitialCartEnemies().find((enemy) => enemy.kind === "boss")!;
  assert.equal(boss.maxHp, 520);
  let hits = 0;
  while (boss.alive && hits < 8) {
    const result = applyTurboRam(boss, true, 20);
    hits += 1;
    assert.ok(result.damage > 0);
  }
  assert.equal(boss.alive, false);
  assert.ok(hits >= 4, `boss should require repeated RAM attacks, got ${hits}`);
  assert.ok(hits <= 6, `boss should remain reasonably quick to defeat, got ${hits}`);
});

test("Boss state remains exposed globally and run completion follows boss destruction", () => {
  const session = new CartArenaSession();
  try {
    let state = session.snapshot();
    assert.equal(state.bossHp, 520);
    assert.equal(state.bossMaxHp, 520);
    assert.equal(state.runComplete, false);

    const boss = session.enemies.find((enemy) => enemy.kind === "boss")!;
    boss.alive = false;
    boss.hp = 0;
    state = session.snapshot();
    assert.equal(state.runComplete, true);
    assert.equal(state.bossHp, 0);
    assert.equal(locateCartWorldNode(0, 448)?.node.id, "boss-01");
  } finally {
    session.dispose();
  }
});

test("arena driving keeps inherited fixed-step behavior stable across render cadences", () => {
  const run = (fps: number) => {
    const session = new CartArenaSession();
    try {
      for (let frame = 0; frame < fps * 2; frame += 1) session.advance(1 / fps, DRIVE);
      const state = session.snapshot();
      return { x: state.x, z: state.z, speed: state.speed, gas: state.gas, nodeId: state.nodeId, charges: state.boostCharges };
    } finally {
      session.dispose();
    }
  };
  const at30 = run(30);
  const at60 = run(60);
  const at120 = run(120);
  assert.ok(Math.abs(at30.x - at60.x) < 1e-6);
  assert.ok(Math.abs(at30.z - at60.z) < 1e-6);
  assert.ok(Math.abs(at30.speed - at60.speed) < 1e-6);
  assert.ok(Math.abs(at30.gas - at60.gas) < 1e-9);
  assert.ok(Math.abs(at120.x - at60.x) < 1e-6);
  assert.ok(Math.abs(at120.z - at60.z) < 1e-6);
  assert.ok(Math.abs(at120.speed - at60.speed) < 1e-6);
  assert.ok(Math.abs(at120.gas - at60.gas) < 1e-9);
  assert.equal(at30.nodeId, at60.nodeId);
  assert.equal(at120.nodeId, at60.nodeId);
  assert.equal(at30.charges, at60.charges);
  assert.equal(at120.charges, at60.charges);
});

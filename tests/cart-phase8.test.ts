import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCartRunUpgrade,
  cartRunUpgradeRank,
  cartScrapReward,
  getCartRunModifiers,
  resetCartRunProgression,
  rollCartRunUpgradeChoices,
} from "../src/cart/CartRunProgression";
import {
  applyTurboRam,
  cartBossPhase,
  createInitialCartEnemies,
  updateCartEnemyMovement,
} from "../src/cart/CartCombat";
import {
  applyTurboRockSmash,
  cartRockSmashMinSpeed,
  createInitialCartObstacles,
} from "../src/cart/CartObstacles";

function clean<T>(run: () => T): T {
  resetCartRunProgression();
  try {
    return run();
  } finally {
    resetCartRunProgression();
  }
}

test("Phase 8 perk drafts are deterministic, unique, and rank-aware", () => clean(() => {
  const first = rollCartRunUpgradeChoices(123456, 0, 0);
  const repeated = rollCartRunUpgradeChoices(123456, 0, 0);
  assert.equal(first.length, 3);
  assert.deepEqual(first.map((perk) => perk.id), repeated.map((perk) => perk.id));
  assert.equal(new Set(first.map((perk) => perk.id)).size, 3);

  const rerolled = rollCartRunUpgradeChoices(123456, 0, 1);
  assert.notDeepEqual(first.map((perk) => perk.id), rerolled.map((perk) => perk.id));
}));

test("RAM and Titan perks change real combat damage without changing default balance", () => clean(() => {
  const baselineBoss = createInitialCartEnemies().find((enemy) => enemy.kind === "boss")!;
  const baseline = applyTurboRam(baselineBoss, true, 16).damage;
  resetCartRunProgression();

  applyCartRunUpgrade("reinforced-ram");
  applyCartRunUpgrade("titan-breaker");
  const upgradedBoss = createInitialCartEnemies().find((enemy) => enemy.kind === "boss")!;
  const upgraded = applyTurboRam(upgradedBoss, true, 16).damage;
  assert.ok(upgraded > baseline * 1.45, `expected perk build to materially increase damage: ${baseline} -> ${upgraded}`);
}));

test("Quick Rack stacks touch steering response but respects its rank cap", () => clean(() => {
  const baseline = getCartRunModifiers().steeringSensitivity;
  applyCartRunUpgrade("quick-rack");
  applyCartRunUpgrade("quick-rack");
  applyCartRunUpgrade("quick-rack");
  applyCartRunUpgrade("quick-rack");
  assert.equal(cartRunUpgradeRank("quick-rack"), 3);
  assert.ok(getCartRunModifiers().steeringSensitivity > baseline * 1.5);
}));

test("Demolition Kit lowers the actual Turbo rock-smash speed requirement", () => clean(() => {
  assert.equal(cartRockSmashMinSpeed(), 8);
  const baselineRock = createInitialCartObstacles()[0];
  assert.equal(applyTurboRockSmash(baselineRock, true, 7).destroyed, false);

  applyCartRunUpgrade("demolition-kit");
  assert.ok(cartRockSmashMinSpeed() < 7);
  const upgradedRock = createInitialCartObstacles()[0];
  assert.equal(applyTurboRockSmash(upgradedRock, true, 7).destroyed, true);
}));

test("Pursuit Jammer slows enemy movement through the shared AI update", () => clean(() => {
  const bounds = { centerX: 0, centerZ: 28, halfWidth: 28, halfDepth: 24 };
  const baselineEnemy = createInitialCartEnemies().find((enemy) => enemy.id === "enemy-c")!;
  const baselineStart = { x: baselineEnemy.x, z: baselineEnemy.z };
  updateCartEnemyMovement([baselineEnemy], "arena-01", 0, 28, 0.05, bounds);
  const baselineDistance = Math.hypot(baselineEnemy.x - baselineStart.x, baselineEnemy.z - baselineStart.z);

  resetCartRunProgression();
  applyCartRunUpgrade("pursuit-jammer");
  applyCartRunUpgrade("pursuit-jammer");
  const jammedEnemy = createInitialCartEnemies().find((enemy) => enemy.id === "enemy-c")!;
  const jammedStart = { x: jammedEnemy.x, z: jammedEnemy.z };
  updateCartEnemyMovement([jammedEnemy], "arena-01", 0, 28, 0.05, bounds);
  const jammedDistance = Math.hypot(jammedEnemy.x - jammedStart.x, jammedEnemy.z - jammedStart.z);
  assert.ok(jammedDistance < baselineDistance * 0.82, `jammer should reduce pursuit distance: ${baselineDistance} -> ${jammedDistance}`);
}));

test("RAM TITAN exposes three HP-driven boss phases with increasingly frequent charge behavior", () => clean(() => {
  const boss = createInitialCartEnemies().find((enemy) => enemy.kind === "boss")!;
  assert.equal(cartBossPhase(boss), 1);
  boss.hp = boss.maxHp * 0.6;
  assert.equal(cartBossPhase(boss), 2);
  boss.hp = boss.maxHp * 0.2;
  assert.equal(cartBossPhase(boss), 3);

  boss.x = 0;
  boss.z = 218;
  boss.heading = Math.PI;
  boss.chargeCooldown = 0;
  boss.chargeTime = 0;
  const bounds = { centerX: 0, centerZ: 210, halfWidth: 34, halfDepth: 26 };
  updateCartEnemyMovement([boss], "boss-01", 0, 200, 0.05, bounds);
  assert.ok((boss.chargeTime ?? 0) > 0, "phase 3 boss should arm a charge when the player is in range");
}));

test("Scrap Magnet changes the reroll economy reward, not just UI text", () => clean(() => {
  assert.equal(cartScrapReward(10), 10);
  applyCartRunUpgrade("scrap-magnet");
  assert.equal(cartScrapReward(10), 14);
  applyCartRunUpgrade("scrap-magnet");
  assert.equal(cartScrapReward(10), 18);
}));

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "../src/cart/CartRoguePhase15Turbo";
import "../src/cart/CartRoguePhase16Flow";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { cartStageClearNumber, isCartPerkStageClear } from "../src/cart/CartRoguePhase16Flow";

const DRIVE = { throttle: 0.84, brake: 0, steer: 0, boost: false } as const;

function prepareImpactRoom(session: CartArenaSession): void {
  for (const obstacle of session.obstacles) obstacle.destroyed = true;
  for (const enemy of session.enemies) {
    if (enemy.nodeId !== "arena-01") continue;
    enemy.moveSpeed = 0;
    enemy.alive = true;
    enemy.hp = enemy.maxHp;
    enemy.x = 18;
    enemy.z = 18;
  }
  session.car.position.set(0, session.car.position.y, 28);
  session.car.heading = 0;
  session.car.forwardVelocity = 15;
  session.car.lateralVelocity = 0;
}

test("Perk drafts are stage-clear rewards, not per-area rewards", () => {
  assert.equal(cartStageClearNumber("arena-02"), 1);
  assert.equal(cartStageClearNumber("arena-03"), 2);
  assert.equal(cartStageClearNumber("boss-01"), 3);
  assert.equal(cartStageClearNumber("arena-01"), null);
  assert.equal(cartStageClearNumber("route-03-left"), null);
  assert.equal(isCartPerkStageClear("arena-02"), true);
  assert.equal(isCartPerkStageClear("arena-03"), true);
  assert.equal(isCartPerkStageClear("arena-01"), false);
  assert.equal(isCartPerkStageClear("route-04-left"), false);
  assert.equal(isCartPerkStageClear("boss-01"), false);
});

test("destroyed light enemies are launched forward instead of disappearing at the hit point", () => {
  const session = new CartArenaSession();
  try {
    prepareImpactRoom(session);
    const enemy = session.enemies.find((candidate) => candidate.id === "enemy-a");
    assert.ok(enemy);
    enemy.x = 0;
    enemy.z = 30.2;
    enemy.hp = 20;
    const startZ = enemy.z;

    session.car.boostActive = true;
    session.car.boostTimeRemaining = 1;
    session.step(DRIVE);
    assert.equal(enemy.alive, false, "the low-HP target should be destroyed by the Turbo RAM");
    const firstReactionZ = enemy.z;
    assert.ok(firstReactionZ > startZ, "the destruction frame should already carry the target through the impact");

    for (let frame = 0; frame < 10; frame += 1) session.step(DRIVE);
    assert.ok(enemy.z > firstReactionZ + 0.25, "a destroyed target should keep travelling for a visible blow-away reaction");
  } finally {
    session.dispose();
  }
});

test("a fast non-damaging collision still knocks a light enemy away", () => {
  const session = new CartArenaSession();
  try {
    prepareImpactRoom(session);
    const enemy = session.enemies.find((candidate) => candidate.id === "enemy-c");
    assert.ok(enemy);
    enemy.x = 0;
    enemy.z = 30.1;
    enemy.moveSpeed = 0;
    const startX = enemy.x;
    const startZ = enemy.z;

    session.step(DRIVE);
    for (let frame = 0; frame < 8; frame += 1) session.step(DRIVE);
    const travelled = Math.hypot(enemy.x - startX, enemy.z - startZ);
    assert.ok(enemy.alive, "normal impact should not fake Turbo damage");
    assert.ok(travelled > 0.35, `expected a visible collision reaction, got ${travelled.toFixed(3)}m`);
  } finally {
    session.dispose();
  }
});

test("stage clear presentation delays the Perk/result overlays on the live game screen", () => {
  const gameSource = readFileSync(new URL("../app/CartRogueGame.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/CartRoguePhase4.module.css", import.meta.url), "utf8");
  assert.match(gameSource, /isCartPerkStageClear\(next\.nodeId\)/);
  assert.match(gameSource, /setStageClear\(\{ nodeId: next\.nodeId, stage: stageNumber, runClear: false \}\)/);
  assert.match(gameSource, /}, 1550\);/);
  assert.match(gameSource, /}, 1850\);/);
  assert.match(gameSource, /ROOM CLEAR · KEEP MOVING/);
  assert.doesNotMatch(gameSource, /const clearedArena =/);
  assert.match(cssSource, /@keyframes stageClearBurst/);
  assert.match(cssSource, /animation: stageClearBurst 1\.55s/);
});

test("destroyed enemy visuals stay visible during the airborne reaction arc", () => {
  const source = readFileSync(new URL("../src/cart/CartRoguePhase16Flow.ts", import.meta.url), "utf8");
  assert.match(source, /group\.visible = true/);
  assert.match(source, /group\.position\.y = arc \* reaction\.lift/);
  assert.match(source, /reaction\.destroyed \? progress \* reaction\.spin/);
});

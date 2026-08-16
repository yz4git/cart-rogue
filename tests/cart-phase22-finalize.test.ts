import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import "../src/cart/CartRoguePhase15Turbo";
import "../src/cart/CartRoguePhase22RamSweep";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { cartEnemyContact, type CartEnemyState } from "../src/cart/CartCombat";
import { cartEnemySweepContact } from "../src/cart/CartRoguePhase22RamSweep";

const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("Turbo RAM sweep catches an enemy crossed between fixed-step endpoints", () => {
  const enemy: CartEnemyState = {
    id: "sweep-target",
    nodeId: "arena-01",
    kind: "blocker",
    x: 0,
    z: 0,
    radius: 1.75,
    maxHp: 100,
    hp: 100,
    alive: true,
    heading: 0,
    moveSpeed: 0,
  };
  assert.equal(cartEnemyContact(enemy, 0, -4.2), false);
  assert.equal(cartEnemyContact(enemy, 0, 4.2), false);
  assert.equal(cartEnemySweepContact(enemy, "arena-01", 0, -4.2, 0, 4.2), true);
});

test("fresh Turbo re-entry deals damage even while an old contact cooldown remains", () => {
  const session = new CartArenaSession();
  try {
    const target = session.enemies.find((enemy) => enemy.id === "enemy-a")!;
    for (const enemy of session.enemies) {
      if (enemy.nodeId === "arena-01" && enemy.id !== target.id) enemy.alive = false;
    }
    for (const obstacle of session.obstacles) obstacle.destroyed = true;

    target.alive = true;
    target.hp = target.maxHp;
    target.moveSpeed = 0;
    target.x = 0;
    target.z = 30;
    session.car.position.set(0, session.car.position.y, 26.65);
    session.car.heading = 0;
    session.car.forwardVelocity = 20;
    session.car.lateralVelocity = 0;
    session.car.boostActive = true;
    session.car.boostTimeRemaining = 1;
    (session as unknown as { enemyHitCooldowns: Map<string, number> }).enemyHitCooldowns.set(target.id, 0.3);

    const beforeHp = target.hp;
    session.step(DRIVE);
    assert.ok(target.hp < beforeHp, `fresh Turbo re-entry should damage ${target.id}`);
    assert.equal(session.snapshot().lastRamEnemyId, target.id);
    assert.ok(session.snapshot().lastRamDamage > 0);
  } finally {
    session.dispose();
  }
});

test("Cart-specific comfort camera overrides the close Phase 20 baseline before impact shake", () => {
  const wrapper = read("src/cart/CartRogueRuntime.ts");
  const source = read("src/cart/CartRoguePhase22CameraComfort.ts");
  const phase20 = wrapper.indexOf("CartRoguePhase20ReferenceMatch");
  const comfort = wrapper.indexOf("CartRoguePhase22CameraComfort");
  const impact = wrapper.indexOf("CartRoguePhase21ImpactPolish");
  assert.ok(phase20 >= 0 && comfort > phase20 && impact > comfort);
  assert.match(source, /normalDistance:\s*10\.6/);
  assert.match(source, /turboDistance:\s*12\.0/);
  assert.match(source, /normalHeight:\s*6\.2/);
});

test("RAM sweep is installed between Turbo release handling and Flow reactions", () => {
  const wrapper = read("src/cart/CartRogueRuntime.ts");
  const turbo = wrapper.indexOf("CartRoguePhase15Turbo");
  const sweep = wrapper.indexOf("CartRoguePhase22RamSweep");
  const flow = wrapper.indexOf("CartRoguePhase16Flow");
  assert.ok(turbo >= 0 && sweep > turbo && flow > sweep);
});

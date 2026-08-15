import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import "../src/cart/CartRoguePhase15Turbo";
import "../src/cart/CartRoguePhase22GameplayPolish";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { cartEnemyContact, type CartEnemyState } from "../src/cart/CartCombat";
import {
  CART_NORMAL_SPEED_RATIO,
  cartEnemySweepContact,
  cartNormalSpeedCap,
} from "../src/cart/CartRoguePhase22GameplayPolish";

const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;
const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

function clearArenaNoise(session: CartArenaSession, keepEnemyId?: string): void {
  for (const enemy of session.enemies) {
    if (enemy.nodeId === "arena-01" && enemy.id !== keepEnemyId) enemy.alive = false;
  }
  for (const obstacle of session.obstacles) obstacle.destroyed = true;
}

test("Phase 22 slightly lowers normal top speed without lowering active Turbo speed", () => {
  const session = new CartArenaSession();
  try {
    clearArenaNoise(session);
    const baseCap = session.car.definition.maxSpeed;
    const normalCap = cartNormalSpeedCap(baseCap);
    assert.equal(CART_NORMAL_SPEED_RATIO, 0.93);

    session.car.forwardVelocity = baseCap - 0.1;
    session.car.boostActive = false;
    session.step(IDLE);
    assert.ok(session.car.forwardVelocity <= normalCap + 1e-6, `normal speed should cap at ${normalCap.toFixed(2)}`);

    session.car.forwardVelocity = normalCap + 4;
    session.car.boostActive = true;
    session.car.boostTimeRemaining = 1;
    session.step(IDLE);
    assert.ok(session.car.forwardVelocity > normalCap + 1.5, "active Turbo must retain the higher dash speed range");
  } finally {
    session.dispose();
  }
});

test("enemy sweep contact catches a dash path even when both endpoints miss", () => {
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

test("fresh Turbo re-entry damages an enemy even while an old contact cooldown remains", () => {
  const session = new CartArenaSession();
  try {
    const target = session.enemies.find((enemy) => enemy.id === "enemy-a")!;
    clearArenaNoise(session, target.id);
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
    assert.ok(target.hp < beforeHp, "fresh Turbo contact should bypass a stale cooldown and deal RAM damage");
    assert.equal(session.snapshot().lastRamEnemyId, target.id);
    assert.ok(session.snapshot().lastRamDamage > 0);
  } finally {
    session.dispose();
  }
});

test("Phase 22 camera pass sits after the close Phase 20 camera and before impact punch", () => {
  const wrapper = read("app/CartRogueGamePhase13.tsx");
  const camera = read("src/cart/CartRoguePhase22CameraComfort.ts");
  const phase20 = wrapper.indexOf("CartRoguePhase20ReferenceMatch");
  const phase22 = wrapper.indexOf("CartRoguePhase22CameraComfort");
  const impact = wrapper.indexOf("CartRoguePhase21ImpactPolish");
  assert.ok(phase20 >= 0 && phase22 > phase20 && impact > phase22);
  assert.match(camera, /normalDistance:\s*10\.45/);
  assert.match(camera, /turboDistance:\s*11\.9/);
  assert.match(camera, /normalHeight:\s*6\.15/);
});

test("route fork HUD is limited to the current unlocked junction", () => {
  const source = read("app/CartRunRouteMap.tsx");
  assert.match(source, /!gateLocked\s*&&\s*current\.next\.length\s*>\s*1/);
  assert.doesNotMatch(source, /CLEAR ROOM TO UNLOCK/);
});

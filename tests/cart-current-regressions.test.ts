import assert from "node:assert/strict";
import test from "node:test";
import { CartArenaSession } from "../src/cart/CartArenaSession";

const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

test("Cart Rogue uses the slightly slower normal speed caps", () => {
  const session = new CartArenaSession();
  try {
    assert.equal(session.car.definition.maxSpeed, 20);

    for (const enemy of session.enemies.filter((candidate) => candidate.nodeId === "arena-01")) enemy.alive = false;
    session.car.position.x = 0;
    session.car.position.z = 72;
    session.car.forwardVelocity = 0;
    session.step(IDLE);
    assert.equal(session.snapshot().nodeId, "corridor-01");
    assert.equal(session.car.definition.maxSpeed, 24);

    session.car.position.x = 0;
    session.car.position.z = 448;
    session.car.forwardVelocity = 0;
    session.step(IDLE);
    assert.equal(session.snapshot().nodeId, "boss-01");
    assert.equal(session.car.definition.maxSpeed, 19);
  } finally {
    session.dispose();
  }
});

test("a freshly activated Turbo dash damages an enemy even before reaching the old RAM speed threshold", () => {
  const session = new CartArenaSession();
  try {
    const enemy = session.enemies.find((candidate) => candidate.id === "enemy-a")!;
    session.car.position.x = enemy.x;
    session.car.position.z = enemy.z - 0.2;
    session.car.heading = 0;
    session.car.forwardVelocity = 0;

    session.step({ ...DRIVE, boost: true });

    assert.equal(session.snapshot().boostActive, true);
    assert.ok(enemy.hp < enemy.maxHp, `fresh Turbo contact should damage enemy-a, got ${enemy.hp}/${enemy.maxHp}`);
    assert.equal(session.snapshot().lastRamEnemyId, "enemy-a");
    assert.ok(session.snapshot().lastRamDamage > 0);
  } finally {
    session.dispose();
  }
});

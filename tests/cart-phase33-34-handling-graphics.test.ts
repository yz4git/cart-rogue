import assert from "node:assert/strict";
import test from "node:test";
import "../src/cart/CartRoguePhase14Arenas";
import "../src/cart/CartRoguePhase15Turbo";
import "../src/cart/CartRoguePhase22RamSweep";
import "../src/cart/CartRoguePhase23GateAndPivot";
import {
  cartExpandedRamRadius,
  cartNormalSpeedCap,
  cartSandwichEscapeVector,
  cartTurboPivotTurnScale,
} from "../src/cart/CartRoguePhase33HandlingCombat";
import { cartFloorDetailDensity } from "../src/cart/CartRoguePhase34FloorDetail";
import { CartArenaSession } from "../src/cart/CartArenaSession";

const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;
const PIVOT = { throttle: 1, brake: 0, steer: 0.82, boost: true } as const;

function isolateOpeningEnemies(session: CartArenaSession): void {
  for (const obstacle of session.obstacles) obstacle.destroyed = true;
  for (const enemy of session.enemies) {
    enemy.moveSpeed = 0;
    if (enemy.nodeId !== "arena-01") continue;
    enemy.x = 20;
    enemy.z = 45;
  }
}

test("Phase 33 slightly lowers normal top speeds without touching Turbo caps", () => {
  assert.equal(cartNormalSpeedCap("arena"), 18.6);
  assert.equal(cartNormalSpeedCap("corridor"), 22.2);
  assert.equal(cartNormalSpeedCap("boss"), 17.8);

  const session = new CartArenaSession();
  try {
    isolateOpeningEnemies(session);
    session.car.position.set(0, 0, 28);
    session.car.forwardVelocity = 30;
    session.car.lateralVelocity = 0;
    session.step(IDLE);
    assert.ok(session.car.speed <= 18.61, `normal arena speed should cap near 18.6, got ${session.car.speed}`);
  } finally {
    session.dispose();
  }
});

test("Phase 33 reduces stationary Turbo pivot turn rate modestly", () => {
  assert.equal(cartTurboPivotTurnScale(), 0.84);
  const session = new CartArenaSession();
  try {
    isolateOpeningEnemies(session);
    session.car.position.set(0, 0, 28);
    session.car.heading = 0;
    const startHeading = session.car.heading;
    for (let frame = 0; frame < 30; frame += 1) session.step(PIVOT);
    const turn = Math.abs(Math.atan2(Math.sin(session.car.heading - startHeading), Math.cos(session.car.heading - startHeading)));
    assert.ok(turn > 0.48, `pivot should remain responsive, got ${turn}`);
    assert.ok(turn < 0.82, `pivot should be slower than the previous tuning, got ${turn}`);
  } finally {
    session.dispose();
  }
});

test("Phase 33 sandwich escape chooses the open direction across two enemies", () => {
  const escape = cartSandwichEscapeVector(
    [{ x: -2.3, z: 0 }, { x: 2.3, z: 0 }],
    0,
    0,
    0,
  );
  assert.ok(escape);
  assert.ok(Math.abs(escape.x) < 0.05);
  assert.ok(escape.z > 0.95);
});

test("Phase 33 actively releases the player when two enemies pinch the car", () => {
  const session = new CartArenaSession();
  try {
    isolateOpeningEnemies(session);
    const [left, right] = session.enemies.filter((enemy) => enemy.nodeId === "arena-01").slice(0, 2);
    assert.ok(left && right);
    left.x = -2.3;
    left.z = 28;
    right.x = 2.3;
    right.z = 28;
    session.car.position.set(0, 0, 28);
    session.car.heading = 0;
    session.car.forwardVelocity = 0;
    session.car.lateralVelocity = 0;

    session.step(IDLE);

    assert.ok(session.car.position.z > 28.45, `sandwich recovery should push toward open space, z=${session.car.position.z}`);
    const coreContacts = [left, right].filter((enemy) => {
      const distance = Math.hypot(session.car.position.x - enemy.x, session.car.position.z - enemy.z);
      return distance <= enemy.radius + 1.45;
    }).length;
    assert.ok(coreContacts <= 1, `player should no longer be trapped by both enemies, contacts=${coreContacts}`);
  } finally {
    session.dispose();
  }
});

test("Phase 33 Turbo ram catches visible edge contact that the old core radius misses", () => {
  assert.ok(cartExpandedRamRadius() >= 2.0);
  const session = new CartArenaSession();
  try {
    isolateOpeningEnemies(session);
    const target = session.enemies.find((enemy) => enemy.nodeId === "arena-01");
    assert.ok(target);
    target.x = 3.45;
    target.z = 28;
    target.hp = target.maxHp;
    target.alive = true;
    session.car.position.set(0, 0, 28);
    session.car.heading = 0;
    session.car.forwardVelocity = 0;
    session.car.lateralVelocity = 0;

    for (let frame = 0; frame < 18; frame += 1) session.step(PIVOT);
    const before = target.hp;
    session.step({ ...PIVOT, boost: false });

    assert.equal(session.car.boostActive, true);
    assert.ok(target.hp < before, `expanded Turbo edge hit should damage target, hp stayed ${target.hp}`);
    assert.equal(session.snapshot().lastRamEnemyId, target.id);
  } finally {
    session.dispose();
  }
});

test("Phase 34 adds denser floor detail to combat rooms than transit corridors", () => {
  assert.equal(cartFloorDetailDensity("corridor"), 24);
  assert.equal(cartFloorDetailDensity("arena"), 42);
  assert.equal(cartFloorDetailDensity("boss"), 54);
});

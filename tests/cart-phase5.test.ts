import assert from "node:assert/strict";
import test from "node:test";
import { CartArenaSession, quickenCartSteering } from "../src/cart/CartArenaSession";
import { breakHeavyParallelContact, createInitialCartEnemies } from "../src/cart/CartCombat";
import {
  applyTurboRockSmash,
  cartObstacleSweepContact,
  createInitialCartObstacles,
} from "../src/cart/CartObstacles";
import { cartWorldNodeById } from "../src/cart/CartWorldGraph";

const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

test("Cart steering response is quicker without changing reversed direction semantics", () => {
  assert.equal(quickenCartSteering(0), 0);
  assert.ok(quickenCartSteering(0.4) > 0.4);
  assert.ok(quickenCartSteering(-0.4) < -0.4);
  assert.equal(quickenCartSteering(1), 1);
  assert.equal(quickenCartSteering(-1), -1);
});

test("rock sweep collision catches a high-speed path that crosses an obstacle", () => {
  const rock = createInitialCartObstacles()[0];
  assert.equal(cartObstacleSweepContact(rock, rock.nodeId, rock.x, rock.z - 8, rock.x, rock.z + 8), true);
  assert.equal(cartObstacleSweepContact(rock, rock.nodeId, rock.x + 12, rock.z - 8, rock.x + 12, rock.z + 8), false);
});

test("rocks require Turbo speed to break", () => {
  const normalRock = createInitialCartObstacles()[0];
  assert.equal(applyTurboRockSmash(normalRock, false, 20).destroyed, false);
  assert.equal(normalRock.destroyed, false);

  const slowTurboRock = createInitialCartObstacles()[1];
  assert.equal(applyTurboRockSmash(slowTurboRock, true, 4).destroyed, false);
  assert.equal(slowTurboRock.destroyed, false);

  const turboRock = createInitialCartObstacles()[2];
  assert.equal(applyTurboRockSmash(turboRock, true, 18).destroyed, true);
  assert.equal(turboRock.destroyed, true);
});

test("non-Turbo rock contact resolves outside the rock instead of passing through", () => {
  const session = new CartArenaSession();
  try {
    const rock = session.obstacles[0];
    session.car.position.x = rock.x;
    session.car.position.z = rock.z - rock.radius - 1.5 - 0.12;
    session.car.heading = 0;
    session.car.forwardVelocity = 17;
    session.step(DRIVE);
    const distance = Math.hypot(session.car.position.x - rock.x, session.car.position.z - rock.z);
    assert.equal(rock.destroyed, false);
    assert.ok(distance >= rock.radius + 1.5, `car should resolve outside rock, got ${distance}`);
    assert.match(session.snapshot().lastReward ?? "", /ROCK BLOCKED/);
  } finally {
    session.dispose();
  }
});

test("Turbo contact destroys a gameplay rock and preserves useful momentum", () => {
  const session = new CartArenaSession();
  try {
    const rock = session.obstacles[0];
    session.car.position.x = rock.x;
    session.car.position.z = rock.z - 5.2;
    session.car.heading = 0;
    session.car.forwardVelocity = 18;
    session.step({ ...DRIVE, boost: true });
    for (let index = 0; index < 18 && !rock.destroyed; index += 1) session.step(DRIVE);
    assert.equal(rock.destroyed, true);
    assert.ok(session.car.forwardVelocity > 5);
    assert.match(session.snapshot().lastReward ?? "", /ROCK SMASH/);
  } finally {
    session.dispose();
  }
});

test("outer wall corners release the car inward instead of trapping it on two walls", () => {
  const session = new CartArenaSession();
  try {
    const arena = cartWorldNodeById("arena-01")!;
    session.car.position.x = arena.rect.centerX + arena.rect.halfWidth - 1.12;
    session.car.position.z = arena.rect.centerZ + arena.rect.halfDepth - 1.12;
    session.car.heading = Math.PI / 4;
    session.car.forwardVelocity = 18;
    for (let index = 0; index < 6; index += 1) session.step(DRIVE);
    const maxX = arena.rect.centerX + arena.rect.halfWidth - 1.05;
    const maxZ = arena.rect.centerZ + arena.rect.halfDepth - 1.05;
    assert.ok(session.car.position.x < maxX - 0.2 || session.car.position.z < maxZ - 0.2);
    assert.ok(Math.sin(session.car.heading) < 0 || Math.cos(session.car.heading) < 0, "heading should gain an inward component");
    assert.ok(session.car.forwardVelocity > 3);
  } finally {
    session.dispose();
  }
});

test("combat arenas use a lower speed profile while corridors remain faster", () => {
  const session = new CartArenaSession();
  try {
    session.car.forwardVelocity = 39;
    session.step(DRIVE);
    assert.ok(session.car.definition.maxSpeed <= 21.5);
    assert.ok(session.car.forwardVelocity <= 21.5 + 0.01);

    session.car.position.x = 0;
    session.car.position.z = 72;
    session.car.forwardVelocity = 0;
    session.step(IDLE);
    assert.equal(session.snapshot().nodeId, "corridor-01");
    assert.equal(session.car.definition.maxSpeed, 26);
  } finally {
    session.dispose();
  }
});

test("heavy enemies break near-parallel headings after close contact", () => {
  const heavy = createInitialCartEnemies().find((enemy) => enemy.kind === "heavy")!;
  heavy.heading = 0.25;
  breakHeavyParallelContact(heavy, 0.25);
  assert.ok(Math.abs(normalizeAngle(heavy.heading - 0.25)) > 0.75);
});

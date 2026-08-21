import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "../src/cart/CartRogueRuntime";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { cartTurboStrikeCanReach, getCartTurboStrikeState } from "../src/cart/CartRoguePhase55TurboStrike";
import { cartTurboSmashCanReach, getCartTurboSmashState } from "../src/cart/CartRoguePhase56TurboSmash";
import {
  cartFlowSurgeGain,
  cartFlowSurgeSpeedCarry,
  getCartFlowSurgeState,
} from "../src/cart/CartRoguePhase57FlowSurge";
import {
  cartTurboBreakawayLateralRetention,
  cartTurboBreakawaySpeedFloor,
} from "../src/cart/CartRoguePhase58TurboBreakaway";
import {
  cartTurboCombatLateralCap,
  cartTurboCombatSafeNumber,
  cartTurboCombatSpeedCap,
} from "../src/cart/CartRoguePhase60TurboCombatSafety";

const HOLD = { throttle: 1, brake: 0, steer: 0, boost: true } as const;
const RELEASE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const visualSource = readFileSync(new URL("../src/cart/CartRoguePhase59TurboStrikeVisual.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");

function prepareCombatLane(session: CartArenaSession): { target: CartArenaSession["enemies"][number]; rock: CartArenaSession["obstacles"][number] } {
  for (const enemy of session.enemies) {
    enemy.alive = false;
    enemy.moveSpeed = 0;
  }
  for (const obstacle of session.obstacles) obstacle.destroyed = true;

  session.car.position.set(0, session.car.position.y, 28);
  session.car.heading = 0;
  session.car.forwardVelocity = 0;
  session.car.lateralVelocity = 0;
  session.car.velocity.x = 0;
  session.car.velocity.z = 0;

  const target = session.enemies[0];
  target.nodeId = "arena-01";
  target.alive = true;
  target.hp = target.maxHp;
  target.x = 0;
  target.z = 34.2;
  target.heading = Math.PI;

  const rock = session.obstacles[0];
  rock.nodeId = "arena-01";
  rock.destroyed = false;
  rock.x = 1.15;
  rock.z = 34.45;
  return { target, rock };
}

test("Phases 55-56 extend Turbo 2.0 into a bounded forward combat lane", () => {
  assert.equal(cartTurboStrikeCanReach(0, 0, 0, 1, { x: 0, z: 5.8, radius: 1.5, alive: true }), true);
  assert.equal(cartTurboStrikeCanReach(0, 0, 0, 1, { x: 0, z: -5.8, radius: 1.5, alive: true }), false);
  assert.equal(cartTurboStrikeCanReach(0, 0, 0, 1, { x: 5.5, z: 4.5, radius: 1.5, alive: true }), false);

  assert.equal(cartTurboSmashCanReach(0, 0, 0, 1, { x: 0.8, z: 5.8, radius: 1.7, destroyed: false }), true);
  assert.equal(cartTurboSmashCanReach(0, 0, 0, 1, { x: 0, z: -5.8, radius: 1.7, destroyed: false }), false);
  assert.equal(cartTurboSmashCanReach(0, 0, 0, 1, { x: 0, z: 1.8, radius: 1.7, destroyed: false }), true, "release smash now captures close contact / overlap reliably");
});

test("Phases 57-58 scale Flow carry and breakaway without unbounded steering energy", () => {
  assert.ok(cartFlowSurgeGain(5, 1) > cartFlowSurgeGain(1, 1));
  assert.ok(cartFlowSurgeGain(9, 2) <= 0.42);
  assert.ok(cartFlowSurgeSpeedCarry(1) > cartFlowSurgeSpeedCarry(0));
  assert.ok(cartFlowSurgeSpeedCarry(1) < 1);

  const lowChargeFloor = cartTurboBreakawaySpeedFloor(6, 20, 0);
  const fullChargeFloor = cartTurboBreakawaySpeedFloor(6, 20, 1);
  assert.ok(fullChargeFloor > lowChargeFloor);
  assert.ok(fullChargeFloor <= 20 * 1.38);
  assert.ok(cartTurboBreakawayLateralRetention(1) < cartTurboBreakawayLateralRetention(0));
});

test("Phases 55-60 turn one charged release into enemy strike, rock smash, Flow surge and safe continuation", () => {
  const session = new CartArenaSession();
  try {
    const { target, rock } = prepareCombatLane(session);
    for (let frame = 0; frame < 52; frame += 1) session.step(HOLD);
    session.step(RELEASE);

    const strike = getCartTurboStrikeState(session);
    const smash = getCartTurboSmashState(session);
    const flow = getCartFlowSurgeState(session);
    assert.ok(strike.hitSerial >= 1, `expected Turbo strike telemetry, got ${JSON.stringify(strike)}`);
    assert.ok(strike.lastDamage > 0);
    assert.ok(target.hp < target.maxHp || !target.alive);
    assert.ok(smash.smashSerial >= 1, `expected Turbo smash telemetry, got ${JSON.stringify(smash)}`);
    assert.equal(rock.destroyed, true);
    assert.ok(flow.chain >= 2, `enemy + rock should seed a multi-event Flow chain: ${JSON.stringify(flow)}`);
    assert.ok(flow.flow > 0.2);
    assert.ok(session.car.forwardVelocity > 0);
    assert.ok(session.car.forwardVelocity <= cartTurboCombatSpeedCap(session.car.definition.maxSpeed, flow.flow) + 1e-6);
    assert.ok(Math.abs(session.car.lateralVelocity) <= cartTurboCombatLateralCap(session.car.forwardVelocity, flow.flow) + 1e-6);
  } finally {
    session.dispose();
  }
});

test("Phase 60 safety helpers recover non-finite combat state and cap final envelopes", () => {
  assert.equal(cartTurboCombatSafeNumber(Number.NaN, 3), 3);
  assert.equal(cartTurboCombatSafeNumber(Number.POSITIVE_INFINITY, 2), 2);
  assert.equal(cartTurboCombatSafeNumber(4.5, 2), 4.5);
  assert.ok(cartTurboCombatSpeedCap(20, 1) > cartTurboCombatSpeedCap(20, 0));
  assert.ok(cartTurboCombatLateralCap(18, 1) >= cartTurboCombatLateralCap(18, 0));
});

test("Phase 59 presentation remains procedural and the Phase 55-60 stack stays ordered", () => {
  assert.match(visualSource, /phase59-turbo-strike-feedback/);
  assert.match(visualSource, /RingGeometry/);
  assert.match(visualSource, /TorusGeometry/);
  assert.match(visualSource, /cartFlowSurge/);
  assert.doesNotMatch(visualSource, /TextureLoader|CanvasTexture|\.map\s*=/);

  const phaseNames = [
    "CartRoguePhase55TurboStrike",
    "CartRoguePhase56TurboSmash",
    "CartRoguePhase57FlowSurge",
    "CartRoguePhase58TurboBreakaway",
    "CartRoguePhase59TurboStrikeVisual",
    "CartRoguePhase60TurboCombatSafety",
  ];
  let previousIndex = runtimeSource.indexOf("CartRoguePhase54TurboAttack");
  for (const phase of phaseNames) {
    const index = runtimeSource.indexOf(phase);
    assert.ok(index > previousIndex, `${phase} must follow the previous Gameplay 2.0 phase`);
    previousIndex = index;
  }
});

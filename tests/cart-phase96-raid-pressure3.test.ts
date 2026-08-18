import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "../src/cart/CartRogueRuntime";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { enableCartTurboHunt } from "../src/cart/CartRoguePhase67TurboHunt";
import { getCartRaidHazardState } from "../src/cart/CartRoguePhase88RaidHazards";
import { CART_FORCED_DODGE_LABEL_PREFIX } from "../src/cart/CartRoguePhase93ForcedDodgeTrajectory2";
import {
  CART_RAID_PRESSURE_CHAIN_LABEL,
  CART_RAID_PRESSURE_CHAIN_MAX,
  CART_RAID_PRESSURE_CUTBACK_DELAY,
  CART_RAID_PRESSURE_CUTBACK_TELEGRAPH,
  CART_RAID_PRESSURE_QUIET_LIMIT,
  CART_RAID_PRESSURE_SWEEP_DELAY,
  CART_RAID_PRESSURE_SWEEP_TELEGRAPH,
  cartRaidPressureChainPlacement,
  getCartRaidPressureReaction,
} from "../src/cart/CartRoguePhase96RaidPressure3";
import {
  CART_RAID_COUNTERREAD_DELAY_SECONDS,
  CART_RAID_COUNTERREAD_LABEL,
  CART_RAID_COUNTERREAD_SAMPLE_SECONDS,
  CART_RAID_COUNTERREAD_TELEGRAPH_SECONDS,
  cartRaidAdaptiveCounterread,
  getCartRaidCounterreadState,
  type CartRaidCounterreadSample,
} from "../src/cart/CartRoguePhase97AdaptiveCounterread";

const runtimeSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");
const straight = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const evadeRight = { throttle: 1, brake: 1, steer: 1, boost: false } as const;
const cutBackLeft = { throttle: 1, brake: 0, steer: -1, boost: false } as const;

test("Raid Pressure keeps the two-beat cadence while Phase97 delays the second lock until after the read", () => {
  assert.equal(CART_RAID_PRESSURE_CHAIN_MAX, 2);
  assert.ok(CART_RAID_PRESSURE_CUTBACK_DELAY <= 0.25);
  assert.ok(CART_RAID_PRESSURE_CUTBACK_DELAY + CART_RAID_PRESSURE_CUTBACK_TELEGRAPH <= 1.2);
  assert.ok(CART_RAID_PRESSURE_SWEEP_DELAY - CART_RAID_PRESSURE_CUTBACK_DELAY <= 0.55);
  assert.ok(CART_RAID_PRESSURE_SWEEP_DELAY + CART_RAID_PRESSURE_SWEEP_TELEGRAPH <= 1.65);
  assert.ok(CART_RAID_PRESSURE_QUIET_LIMIT <= 1.1);
  assert.equal(CART_RAID_PRESSURE_CHAIN_LABEL.startsWith(CART_FORCED_DODGE_LABEL_PREFIX), false);
  assert.ok(CART_RAID_COUNTERREAD_SAMPLE_SECONDS >= 0.3);
  assert.ok(CART_RAID_COUNTERREAD_SAMPLE_SECONDS <= 0.45);
  assert.ok(
    CART_RAID_COUNTERREAD_SAMPLE_SECONDS
      + CART_RAID_COUNTERREAD_DELAY_SECONDS
      + CART_RAID_COUNTERREAD_TELEGRAPH_SECONDS
      <= CART_RAID_PRESSURE_SWEEP_DELAY + CART_RAID_PRESSURE_SWEEP_TELEGRAPH + 0.05,
  );
});

test("historical chain placement remains deterministic for regression comparisons", () => {
  const heading = 0;
  const right = cartRaidPressureChainPlacement(560, 180, heading, 1, 0);
  const left = cartRaidPressureChainPlacement(560, 180, heading, -1, 1);
  assert.equal(right.escapeSide, -1);
  assert.equal(left.escapeSide, 1);
  assert.ok(right.cutbackX < 560, JSON.stringify(right));
  assert.ok(left.cutbackX > 560, JSON.stringify(left));
  assert.ok(right.sweepX > 560, JSON.stringify(right));
  assert.ok(left.sweepX < 560, JSON.stringify(left));
});

function sample(overrides: Partial<CartRaidCounterreadSample> = {}): CartRaidCounterreadSample {
  return {
    anchorX: 560,
    anchorZ: 180,
    anchorHeading: 0,
    initialEscapeSide: -1,
    startForwardVelocity: 16,
    x: 554,
    z: 188,
    heading: 0,
    forwardVelocity: 15,
    lateralVelocity: -2,
    rawSteer: 1,
    brake: 0,
    ...overrides,
  };
}

test("adaptive counterread distinguishes committed escape, reversal, braking and edge escape", () => {
  const escape = cartRaidAdaptiveCounterread(sample());
  assert.equal(escape.mode, "ESCAPE");
  assert.equal(escape.kind, "LINE");
  assert.equal(escape.observedSide, -1);

  const cutback = cartRaidAdaptiveCounterread(sample({ x: 562.5, rawSteer: -1, lateralVelocity: 2.8 }));
  assert.equal(cutback.mode, "CUTBACK");
  assert.equal(cutback.kind, "LINE");
  assert.equal(cutback.observedSide, 1);

  const brake = cartRaidAdaptiveCounterread(sample({ forwardVelocity: 7, brake: 1, lateralVelocity: 0 }));
  assert.equal(brake.mode, "BRAKE");
  assert.equal(brake.kind, "CIRCLE");

  const edge = cartRaidAdaptiveCounterread(sample({ x: 470, z: 220, forwardVelocity: 15, lateralVelocity: 0 }));
  assert.equal(edge.mode, "EDGE");
  assert.equal(edge.kind, "CIRCLE");
  assert.ok(edge.edgeDistance <= 12.5);

  for (const placement of [escape, cutback, brake, edge]) {
    assert.ok(placement.x >= 476 && placement.x <= 644, JSON.stringify(placement));
    assert.ok(placement.z >= 136 && placement.z <= 304, JSON.stringify(placement));
  }
});

test("a live deliberate dodge commits one first beat, then reads the actual reversal before queuing beat two", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  session.car.forwardVelocity = 15;
  session.car.speed = 15;

  let forcedFound = false;
  for (let index = 0; index < 90; index += 1) {
    session.step(straight, 0.05);
    const raid = getCartRaidHazardState(session);
    if (raid.hazards.some((hazard) =>
      hazard.source === "FIELD"
      && hazard.phase === "LOCKED"
      && hazard.label.startsWith(CART_FORCED_DODGE_LABEL_PREFIX),
    )) {
      forcedFound = true;
      break;
    }
  }
  assert.equal(forcedFound, true);

  session.step(evadeRight, 0.05);
  const immediateRaid = getCartRaidHazardState(session);
  const immediateChain = immediateRaid.hazards.filter((hazard) => hazard.label.startsWith(CART_RAID_PRESSURE_CHAIN_LABEL));
  assert.equal(immediateChain.length, 1, JSON.stringify(immediateRaid));
  assert.equal(immediateChain[0]?.kind, "CIRCLE");
  assert.equal(immediateRaid.hazards.some((hazard) => hazard.label.startsWith(CART_RAID_COUNTERREAD_LABEL)), false);
  assert.ok(getCartRaidPressureReaction(session));
  assert.equal(getCartRaidCounterreadState(session).pending, true);

  let counterreadFound = false;
  for (let index = 0; index < 12; index += 1) {
    session.step(cutBackLeft, 0.05);
    const raid = getCartRaidHazardState(session);
    if (raid.hazards.some((hazard) => hazard.label === `${CART_RAID_COUNTERREAD_LABEL} · CUTBACK`)) {
      counterreadFound = true;
      break;
    }
  }
  const resolvedRaid = getCartRaidHazardState(session);
  assert.equal(counterreadFound, true, JSON.stringify(resolvedRaid));
  assert.ok(resolvedRaid.activeCount <= 4);
  assert.equal(getCartRaidCounterreadState(session).lastMode, "CUTBACK");
  assert.ok(getCartRaidCounterreadState(session).resolvedSerial >= 1);
});

test("Phase97 installs after Phase96 without rewriting the historical phase-order contract", () => {
  const carryImport = runtimeSource.indexOf('import "./CartRaidEvasionCarry"');
  const pressureImport = runtimeSource.indexOf('import "./CartRoguePhase96RaidPressure3"');
  const counterreadImport = runtimeSource.indexOf('import "./CartRoguePhase97AdaptiveCounterread"');
  assert.ok(carryImport >= 0);
  assert.ok(pressureImport > carryImport);
  assert.ok(counterreadImport > pressureImport);
  const historicalOrder = runtimeSource.slice(runtimeSource.indexOf("CART_ROGUE_RUNTIME_PHASE_ORDER"));
  assert.doesNotMatch(historicalOrder, /CartRoguePhase96RaidPressure3/);
  assert.doesNotMatch(historicalOrder, /CartRoguePhase97AdaptiveCounterread/);
});

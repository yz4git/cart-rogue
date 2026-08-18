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
} from "../src/cart/CartRoguePhase96RaidPressure3";

const runtimeSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");
const straight = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const evadeRight = { throttle: 1, brake: 1, steer: 1, boost: false } as const;

test("Raid Pressure 3.0 turns one dodge into a fast cutback sequence", () => {
  assert.equal(CART_RAID_PRESSURE_CHAIN_MAX, 2);
  assert.ok(CART_RAID_PRESSURE_CUTBACK_DELAY <= 0.25);
  assert.ok(CART_RAID_PRESSURE_CUTBACK_DELAY + CART_RAID_PRESSURE_CUTBACK_TELEGRAPH <= 1.2);
  assert.ok(CART_RAID_PRESSURE_SWEEP_DELAY - CART_RAID_PRESSURE_CUTBACK_DELAY <= 0.55);
  assert.ok(CART_RAID_PRESSURE_SWEEP_DELAY + CART_RAID_PRESSURE_SWEEP_TELEGRAPH <= 1.65);
  assert.ok(CART_RAID_PRESSURE_QUIET_LIMIT <= 1.1);
  assert.equal(CART_RAID_PRESSURE_CHAIN_LABEL.startsWith(CART_FORCED_DODGE_LABEL_PREFIX), false);
});

test("chain placement attacks the side of the first dodge then crosses back over the future line", () => {
  const heading = 0;
  const right = cartRaidPressureChainPlacement(560, 180, heading, 1, 0);
  const left = cartRaidPressureChainPlacement(560, 180, heading, -1, 1);
  assert.equal(right.escapeSide, -1);
  assert.equal(left.escapeSide, 1);
  assert.ok(right.cutbackX < 560, JSON.stringify(right));
  assert.ok(left.cutbackX > 560, JSON.stringify(left));
  assert.ok(right.sweepX > 560, JSON.stringify(right));
  assert.ok(left.sweepX < 560, JSON.stringify(left));
  assert.ok(right.cutbackZ > 190 && right.sweepZ > right.cutbackZ);
});

test("a live deliberate dodge immediately arms two bounded follow-up hazards", () => {
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
  const raid = getCartRaidHazardState(session);
  const chain = raid.hazards.filter((hazard) => hazard.label.startsWith(CART_RAID_PRESSURE_CHAIN_LABEL));
  assert.equal(chain.length, CART_RAID_PRESSURE_CHAIN_MAX, JSON.stringify(raid));
  assert.ok(raid.activeCount <= 4);
  assert.ok(chain.some((hazard) => hazard.kind === "CIRCLE"));
  assert.ok(chain.some((hazard) => hazard.kind === "LINE"));
});

test("Phase96 installs after the existing evasion carry without rewriting the historical phase-order contract", () => {
  const carryImport = runtimeSource.indexOf('import "./CartRaidEvasionCarry"');
  const pressureImport = runtimeSource.indexOf('import "./CartRoguePhase96RaidPressure3"');
  assert.ok(carryImport >= 0);
  assert.ok(pressureImport > carryImport);
  assert.doesNotMatch(runtimeSource.slice(runtimeSource.indexOf("CART_ROGUE_RUNTIME_PHASE_ORDER")), /CartRoguePhase96RaidPressure3/);
});

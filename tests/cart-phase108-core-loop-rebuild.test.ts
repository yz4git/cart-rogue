import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CART_PHASE108_BREAK_SECONDS,
  CART_PHASE108_CONTRACT_COUNT,
  CART_PHASE108_CORE_LOOP_ID,
  CART_PHASE108_DEATH_FLIGHT_MIN_SECONDS,
  CART_PHASE108_TITAN_MAX_HP,
  cartPhase108ContractDefinition,
} from "../src/cart/CartRoguePhase108CoreLoopRebuild";
import { cartTurboStrikeKnockbackDistance } from "../src/cart/CartRoguePhase55TurboStrike";

const phase108Source = readFileSync(new URL("../src/cart/CartRoguePhase108CoreLoopRebuild.ts", import.meta.url), "utf8");
const phase67Source = readFileSync(new URL("../src/cart/CartRoguePhase67TurboHunt.ts", import.meta.url), "utf8");
const phase81Source = readFileSync(new URL("../src/cart/CartRoguePhase81EventDirector2.ts", import.meta.url), "utf8");
const menuRuntimeSource = readFileSync(new URL("../src/cart/CartGameMenuRuntime.ts", import.meta.url), "utf8");
const overlaySource = readFileSync(new URL("../app/CartTurboHuntHudOverlay.tsx", import.meta.url), "utf8");

test("Phase108 replaces parallel primary objectives with five region contracts", () => {
  assert.equal(CART_PHASE108_CORE_LOOP_ID, "phase108-turbo-hunt-core-loop-rebuild-v1");
  assert.equal(CART_PHASE108_CONTRACT_COUNT, 5);
  assert.equal(CART_PHASE108_BREAK_SECONDS, 4.6);
  assert.deepEqual(cartPhase108ContractDefinition(0), { region: "DROP YARD", kind: "HUNT", target: 5 });
  assert.deepEqual(cartPhase108ContractDefinition(1), { region: "SMASH GARDEN", kind: "SMASH", target: 4 });
  assert.deepEqual(cartPhase108ContractDefinition(2), { region: "SPRINT LANE", kind: "CONVOY", target: 4 });
  assert.deepEqual(cartPhase108ContractDefinition(3), { region: "CROSSFIRE GARDEN", kind: "CHAOS", target: 6 });
  assert.deepEqual(cartPhase108ContractDefinition(4), { region: "CROWN GROUNDS", kind: "ELITE", target: 2 });
});

test("Phase108 is installed after Phase107 and owns external Turbo Hunt progression", () => {
  const phase107 = menuRuntimeSource.indexOf("CartRoguePhase107VisualHierarchyArcade");
  const phase108 = menuRuntimeSource.indexOf("CartRoguePhase108CoreLoopRebuild");
  assert.ok(phase107 >= 0);
  assert.ok(phase108 > phase107);
  assert.match(phase108Source, /setCartTurboHuntExternalProgressionEnabled\(true\)/);
  assert.match(phase108Source, /setCartTurboHuntFieldEventAutostartEnabled\(false\)/);
  assert.match(phase67Source, /setCartTurboHuntExternalProgressionEnabled/);
  assert.match(phase67Source, /setCartTurboHuntExternalOrdersCompleted/);
  assert.match(phase81Source, /setCartTurboHuntFieldEventAutostartEnabled/);
});

test("Phase108 contracts use physical regions and keep one objective label", () => {
  for (const region of ["DROP YARD", "SMASH GARDEN", "SPRINT LANE", "CROSSFIRE GARDEN", "CROWN GROUNDS"]) {
    assert.match(phase108Source, new RegExp(region));
  }
  assert.match(phase108Source, /CHOOSE ROUTE/);
  assert.match(phase108Source, /GO TO \$\{state\.targetRegion\}/);
  assert.match(phase108Source, /CONTRACT CLEAR · TURBO \+1 · ROUTE OPEN/);
  assert.match(phase108Source, /huntObjectiveLabel: contractLabel\(state\)/);
  assert.match(phase108Source, /huntOrdersCompleted: state\.contractsCompleted/);
  assert.match(phase108Source, /CART_TURBO_HUNT_SNAPSHOT_EVENT/);
  assert.match(overlaySource, /CONTRACT · \{snapshot\.huntObjectiveKind\}/);
  assert.match(overlaySource, /CONTRACTS \{snapshot\.huntOrdersCompleted\}/);
  assert.match(overlaySource, /eventActive && fieldEvent/);
});

test("Phase108 makes RAM knockback much larger and keeps destroyed targets flying", () => {
  const live = cartTurboStrikeKnockbackDistance(1, false);
  const destroyed = cartTurboStrikeKnockbackDistance(1, true);
  assert.ok(live >= 5.5);
  assert.ok(destroyed >= 14);
  assert.ok(destroyed > live * 2);
  assert.equal(CART_PHASE108_DEATH_FLIGHT_MIN_SECONDS, 0.72);
  assert.match(phase108Source, /beginDeathFlight/);
  assert.match(phase108Source, /updateDeathFlight/);
  assert.match(phase108Source, /captureFlightPieces/);
  assert.match(phase108Source, /group\.visible = true/);
  assert.match(phase108Source, /piece\.object\.position\.copy\(piece\.basePosition\)\.addScaledVector/);
});

test("Phase108 shortens the Titan tail without making it trivial", () => {
  assert.equal(CART_PHASE108_TITAN_MAX_HP, 4200);
  assert.ok(CART_PHASE108_TITAN_MAX_HP > 3000);
  assert.match(phase108Source, /RAM TITAN · BREAK THE WEAK POINT/);
});
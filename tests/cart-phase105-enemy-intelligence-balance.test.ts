import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CART_PHASE105_HARD_DECISION_SECONDS,
  CART_PHASE105_HARD_MAX_SPEED,
  CART_PHASE105_LOW_GAS_THRESHOLD,
  CART_PHASE105_MAX_COMMITTERS,
  CART_PHASE105_NORMAL_DECISION_SECONDS,
  CART_PHASE105_NORMAL_MAX_SPEED,
  CART_PHASE105_RAID_STACK_THRESHOLD,
  cartPhase105CommitBudget,
  cartPhase105LeadDistance,
  cartPhase105PredictionSeconds,
  cartPhase105RecoverySeconds,
} from "../src/cart/CartRoguePhase105EnemyIntelligenceBalance";

const source = readFileSync(new URL("../src/cart/CartRoguePhase105EnemyIntelligenceBalance.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/cart/CartGameMenuRuntime.ts", import.meta.url), "utf8");
const phase67Source = readFileSync(new URL("../src/cart/CartRoguePhase67TurboHunt.ts", import.meta.url), "utf8");

test("Phase105 predictive aim is bounded and Hard reads farther than Normal", () => {
  const normal = cartPhase105PredictionSeconds("striker", "normal", 20);
  const hard = cartPhase105PredictionSeconds("striker", "hard", 20);
  assert.ok(hard > normal);
  assert.ok(normal <= 0.62);
  assert.ok(hard <= 0.78);
  assert.equal(cartPhase105LeadDistance(40, 1), 13);
  assert.ok(cartPhase105LeadDistance(18, normal) < 13);
});

test("Phase105 caps simultaneous committers and creates comeback breathing room", () => {
  assert.equal(CART_PHASE105_MAX_COMMITTERS, 3);
  assert.equal(cartPhase105CommitBudget("normal", 1, 0, 12), 2);
  assert.equal(cartPhase105CommitBudget("hard", 1, 0, 12), 3);
  assert.equal(cartPhase105CommitBudget("normal", CART_PHASE105_LOW_GAS_THRESHOLD, 0, 12), 1);
  assert.equal(cartPhase105CommitBudget("hard", CART_PHASE105_LOW_GAS_THRESHOLD, 0, 12), 2);
  assert.equal(cartPhase105CommitBudget("normal", 1, CART_PHASE105_RAID_STACK_THRESHOLD, 12), 1);
  assert.equal(cartPhase105CommitBudget("hard", 1, CART_PHASE105_RAID_STACK_THRESHOLD, 12), 2);
  assert.equal(cartPhase105CommitBudget("hard", 1, 0, 1), 1);
  assert.equal(cartPhase105CommitBudget("normal", 1, 0, 0), 0);
});

test("Hard intelligence reacts more often but keeps miss recovery instead of perfect tracking", () => {
  assert.ok(CART_PHASE105_HARD_DECISION_SECONDS < CART_PHASE105_NORMAL_DECISION_SECONDS);
  assert.ok(cartPhase105RecoverySeconds("striker", "normal") > cartPhase105RecoverySeconds("striker", "hard"));
  assert.ok(cartPhase105RecoverySeconds("striker", "hard") > 0.5);
  assert.ok(cartPhase105RecoverySeconds("bomber", "normal") > 0.6);
  assert.match(source, /brain\.intent === "RECOVER"/);
  assert.match(source, /rotateToward\(enemy\.heading, targetHeading, turnRate \* delta\)/);
  assert.doesNotMatch(source, /enemy\.heading = targetHeading/);
});

test("Phase105 specializes roles instead of giving every enemy the same pursuit", () => {
  for (const role of ["striker", "bomber", "drifter", "orbiter", "tank", "standard"] as const) {
    assert.match(source, new RegExp(`role === \\"${role}\\"`));
  }
  assert.match(source, /"INTERCEPT"/);
  assert.match(source, /"FLANK"/);
  assert.match(source, /"SCREEN"/);
  assert.match(source, /actualSide/);
  assert.match(source, /lateralMotion/);
});

test("Phase105 replaces permanent speed pressure with bounded tactical bursts", () => {
  assert.equal(CART_PHASE105_NORMAL_MAX_SPEED, 6.75);
  assert.equal(CART_PHASE105_HARD_MAX_SPEED, 7.15);
  assert.match(source, /pressureActive && brain\.intent === "INTERCEPT"/);
  assert.match(source, /enemy\.moveSpeed = desiredSpeed/);
  assert.match(source, /intentScale = 0\.74/);
  assert.doesNotMatch(source, /new THREE\./);
});

test("Phase105 preserves the fixed Turbo Hunt enemy pool and does not add spawn capacity", () => {
  const enemyDefinitions = phase67Source.match(/createEnemy\("hunt-/g) ?? [];
  assert.equal(enemyDefinitions.length, 19);
  assert.doesNotMatch(source, /\.push\(.*enemy/i);
  assert.doesNotMatch(source, /createEnemy\(/);
  assert.doesNotMatch(source, /createCartTurboHuntEnemyPool/);
  assert.match(source, /brains: new Map\(\)/);
});

test("Phase105 is installed after Phase104 and remains gameplay-only", () => {
  const phase104Index = runtimeSource.indexOf("CartRoguePhase104ImpactAoeOverhaul");
  const phase105Index = runtimeSource.indexOf("CartRoguePhase105EnemyIntelligenceBalance");
  assert.ok(phase104Index >= 0);
  assert.ok(phase105Index > phase104Index);
  assert.match(source, /getCartRaidHazardState/);
  assert.match(source, /getCartRunDifficulty/);
  assert.match(source, /CART_PHASE105_PRESENTATION_ID/);
  assert.doesNotMatch(source, /WebGLRenderer|ShaderMaterial|PointLight|EffectComposer/);
});

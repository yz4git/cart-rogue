import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf8");

const appSource = read("../app/CartRogueGamePhase13.tsx");
const runtimeSource = read("../src/cart/CartRogueRuntime.ts");
const phase47Source = read("../src/cart/CartRoguePhase47TransitCompletion.ts");
const phase48Source = read("../src/cart/CartRoguePhase48RouteExitCompletion.ts");
const phase50Source = read("../src/cart/CartRoguePhase50Arena03CenterClearance.ts");
const compatibilitySource = read("../src/cart/CartTrackCompatibility.ts");
const phase51Source = read("../src/cart/CartRoguePhase51Arena03Gate.ts");
const phase53Source = read("../src/cart/CartRoguePhase53Handling2.ts");
const phase54Source = read("../src/cart/CartRoguePhase54TurboAttack.ts");
const phase55Source = read("../src/cart/CartRoguePhase55TurboStrike.ts");
const phase56Source = read("../src/cart/CartRoguePhase56TurboSmash.ts");
const phase57Source = read("../src/cart/CartRoguePhase57FlowSurge.ts");
const phase58Source = read("../src/cart/CartRoguePhase58TurboBreakaway.ts");
const phase59Source = read("../src/cart/CartRoguePhase59TurboStrikeVisual.ts");
const phase60Source = read("../src/cart/CartRoguePhase60TurboCombatSafety.ts");
const phase61Source = read("../src/cart/CartRoguePhase61PerfectStrike.ts");
const phase62Source = read("../src/cart/CartRoguePhase62PerfectShockwave.ts");
const phase63Source = read("../src/cart/CartRoguePhase63TurboAimAssist.ts");
const phase64Source = read("../src/cart/CartRoguePhase64TurboHitStun.ts");
const phase65Source = read("../src/cart/CartRoguePhase65PerfectCombatVisual.ts");
const phase66Source = read("../src/cart/CartRoguePhase66TurboChainReward.ts");
const gateRulesSource = read("../src/cart/CartArena03GateRules.ts");
const gateVisualSource = read("../src/cart/CartArena03GateVisual.ts");

test("refactor keeps runtime composition out of the React presentation wrapper", () => {
  assert.match(appSource, /import "\.\.\/src\/cart\/CartRogueRuntime"/);
  assert.doesNotMatch(appSource, /CartRoguePhase\d+/);

  const phaseImports = Array.from(runtimeSource.matchAll(/import "\.\/(CartRoguePhase[^"]+)";/g), (match) => match[1]);
  assert.ok(phaseImports.length >= 52, `expected the centralized runtime to own the phase chain, got ${phaseImports.length}`);
  assert.equal(new Set(phaseImports).size, phaseImports.length, "runtime phase imports must not be duplicated");
  const gameplay2Phases = [
    "CartRoguePhase53Handling2",
    "CartRoguePhase54TurboAttack",
    "CartRoguePhase55TurboStrike",
    "CartRoguePhase56TurboSmash",
    "CartRoguePhase57FlowSurge",
    "CartRoguePhase58TurboBreakaway",
    "CartRoguePhase59TurboStrikeVisual",
    "CartRoguePhase60TurboCombatSafety",
    "CartRoguePhase61PerfectStrike",
    "CartRoguePhase62PerfectShockwave",
    "CartRoguePhase63TurboAimAssist",
    "CartRoguePhase64TurboHitStun",
    "CartRoguePhase65PerfectCombatVisual",
    "CartRoguePhase66TurboChainReward",
  ];
  let previous = phaseImports.indexOf("CartRoguePhase51Arena03Gate");
  for (const phase of gameplay2Phases) {
    const index = phaseImports.indexOf(phase);
    assert.ok(index > previous, `${phase} must stay after the previous Gameplay 2.0 phase`);
    previous = index;
  }
});

test("late traversal phases delegate shared placement and intent calculations", () => {
  for (const source of [phase47Source, phase48Source]) {
    assert.match(source, /CartTraversalBridge/);
    assert.match(source, /CartTraversalIntent/);
    assert.doesNotMatch(source, /function syncHorizontalVelocity/);
    assert.doesNotMatch(source, /function rotateToward/);
    assert.doesNotMatch(source, /function normalizeAngle/);
  }
});

test("legacy Rally physics compatibility is isolated from Arena 03 progression rules", () => {
  assert.match(phase50Source, /CartTrackCompatibility/);
  assert.match(compatibilitySource, /collider\.source !== "gate-post"/);
  assert.doesNotMatch(compatibilitySource, /arena-03|junction-04/);
});

test("Arena 03 gate bootstrap keeps gameplay rules and Three.js visuals separated", () => {
  assert.match(phase51Source, /CartArena03GateRules/);
  assert.match(phase51Source, /CartArena03GateVisual/);
  assert.doesNotMatch(phase51Source, /from "three"/);
  assert.doesNotMatch(gateRulesSource, /from "three"/);
  assert.match(gateVisualSource, /from "three"/);
  assert.match(gateVisualSource, /updateGate\("arena-03"/);
});

test("Gameplay 2.0 rules remain presentation-free outside their visual adapters", () => {
  for (const source of [
    phase53Source,
    phase54Source,
    phase55Source,
    phase56Source,
    phase57Source,
    phase58Source,
    phase60Source,
    phase61Source,
    phase62Source,
    phase63Source,
    phase64Source,
    phase66Source,
  ]) {
    assert.doesNotMatch(source, /from "three"/);
  }
  assert.match(phase53Source, /CartHandlingProfile/);
  assert.match(phase54Source, /getCartTurboCombatState/);
  assert.match(phase55Source, /applyTurboRam/);
  assert.match(phase56Source, /applyTurboRockSmash/);
  assert.match(phase57Source, /getCartTurboStrikeState/);
  assert.match(phase57Source, /getCartTurboSmashState/);
  assert.match(phase58Source, /cartTurboBreakawaySpeedFloor/);
  assert.match(phase60Source, /cartTurboCombatSpeedCap/);
  assert.match(phase61Source, /consumeCartPerfectRamWindow/);
  assert.match(phase62Source, /getCartPerfectStrikeState/);
  assert.match(phase63Source, /cartTurboAimAssistCorrection/);
  assert.match(phase64Source, /cartTurboHitStunSeconds/);
  assert.match(phase66Source, /addBoostCharge/);
  assert.match(phase59Source, /from "three"/);
  assert.match(phase59Source, /phase59-turbo-strike-feedback/);
  assert.match(phase65Source, /from "three"/);
  assert.match(phase65Source, /phase65-perfect-combat-feedback/);
});

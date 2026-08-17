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
const gateRulesSource = read("../src/cart/CartArena03GateRules.ts");
const gateVisualSource = read("../src/cart/CartArena03GateVisual.ts");

test("refactor keeps runtime composition out of the React presentation wrapper", () => {
  assert.match(appSource, /import "\.\.\/src\/cart\/CartRogueRuntime"/);
  assert.doesNotMatch(appSource, /CartRoguePhase\d+/);

  const phaseImports = Array.from(runtimeSource.matchAll(/import "\.\/(CartRoguePhase[^"]+)";/g), (match) => match[1]);
  assert.ok(phaseImports.length >= 40, `expected the centralized runtime to own the phase chain, got ${phaseImports.length}`);
  assert.equal(new Set(phaseImports).size, phaseImports.length, "runtime phase imports must not be duplicated");
  assert.equal(phaseImports.at(-1), "CartRoguePhase53Handling2");
  assert.ok(
    phaseImports.indexOf("CartRoguePhase53Handling2") > phaseImports.indexOf("CartRoguePhase51Arena03Gate"),
    "Handling 2.0 must remain the final gameplay steering authority after traversal/gate corrections",
  );
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

test("Handling 2.0 stays presentation-free and delegates shared horizontal velocity math", () => {
  assert.doesNotMatch(phase53Source, /from "three"/);
  assert.match(phase53Source, /CartHandlingProfile/);
  assert.match(phase53Source, /cartTraversalSyncHorizontalVelocity/);
});

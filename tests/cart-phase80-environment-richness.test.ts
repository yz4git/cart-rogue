import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { CART_ROGUE_RUNTIME_PHASE_ORDER } from "../src/cart/CartRogueRuntime";
import {
  buildCartEnvironmentRichness,
  CART_ENVIRONMENT_RICHNESS_COUNTS,
  CART_ENVIRONMENT_RICHNESS_DRAW_CALL_BUDGET,
} from "../src/cart/CartRoguePhase80EnvironmentRichness";

const source = readFileSync(new URL("../src/cart/CartRoguePhase80EnvironmentRichness.ts", import.meta.url), "utf8");

test("Environment Richness adds large, mid and distant visual layers without textures", () => {
  assert.equal(CART_ENVIRONMENT_RICHNESS_COUNTS.surfacePatches, 18);
  assert.ok(CART_ENVIRONMENT_RICHNESS_COUNTS.roadRhythm >= 24);
  assert.ok(CART_ENVIRONMENT_RICHNESS_COUNTS.distantHills >= 30);
  assert.ok(CART_ENVIRONMENT_RICHNESS_COUNTS.trees >= 40);
  assert.ok(CART_ENVIRONMENT_RICHNESS_COUNTS.shrubs >= 50);
  assert.ok(CART_ENVIRONMENT_RICHNESS_COUNTS.landmarkRegions >= 5);
  assert.doesNotMatch(source, /TextureLoader|CanvasTexture|DataTexture|loadAsync\(/);
});

test("Environment Richness batches scenery and stays inside its draw-call budget", () => {
  const scene = new THREE.Scene();
  const root = buildCartEnvironmentRichness(scene);
  assert.equal(root.name, "phase80-environment-richness");
  assert.equal(root.userData.environmentRichness.textureless, true);
  assert.equal(root.userData.environmentRichness.gameplayCollisionChanged, false);
  assert.equal(root.userData.environmentRichness.staticOnly, true);
  assert.ok(CART_ENVIRONMENT_RICHNESS_DRAW_CALL_BUDGET <= 10);

  const expectedNames = [
    "phase80-surface-patches",
    "phase80-road-rhythm",
    "phase80-shrub-clusters",
    "phase80-flower-beds",
    "phase80-tree-trunks",
    "phase80-tree-crowns",
    "phase80-distant-hills",
    "phase80-backdrop-bands",
    "phase80-landmark-boxes",
    "phase80-crossfire-ring",
  ];
  for (const name of expectedNames) assert.ok(root.getObjectByName(name), `missing ${name}`);

  let renderableCount = 0;
  let instancedCount = 0;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      renderableCount += 1;
      assert.equal(object.castShadow, false, `${object.name || object.type} unexpectedly casts a shadow`);
    }
    if (object instanceof THREE.InstancedMesh) instancedCount += 1;
  });
  assert.equal(renderableCount, CART_ENVIRONMENT_RICHNESS_DRAW_CALL_BUDGET);
  assert.equal(instancedCount, 9);
});

test("Environment Richness is presentation-only and does not throttle gameplay or combat", () => {
  assert.doesNotMatch(source, /\.step\s*=/);
  assert.doesNotMatch(source, /\.updateVisuals\s*=/);
  assert.doesNotMatch(source, /forwardVelocity|boostCharges|enemy\.hp|enemy\.alive|applyTurboRam/);
  assert.match(source, /previousBuildWorld\.call\(this\)/);
});

test("Phase80 runs after Performance & Battery 2.0 and remains the final presentation layer", () => {
  const batteryIndex = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase79PerformanceBattery");
  const environmentIndex = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase80EnvironmentRichness");
  assert.ok(environmentIndex > batteryIndex);
  assert.equal(CART_ROGUE_RUNTIME_PHASE_ORDER.at(-1), "CartRoguePhase80EnvironmentRichness");
});

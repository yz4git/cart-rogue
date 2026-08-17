import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { CART_ROGUE_RUNTIME_PHASE_ORDER } from "../src/cart/CartRogueRuntime";
import {
  buildCartEnvironmentRichness,
  CART_ENVIRONMENT_RICHNESS_COUNTS,
  CART_ENVIRONMENT_RICHNESS_DRAW_CALL_BUDGET,
  CART_ENVIRONMENT_ROAD_RHYTHM_Y,
  CART_ENVIRONMENT_SURFACE_Y,
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

test("Environment Richness uses fixed-material buckets instead of static instanceColor", () => {
  const scene = new THREE.Scene();
  const root = buildCartEnvironmentRichness(scene);
  assert.equal(root.userData.environmentRichness.safeColorPipeline, "fixed-material-buckets");
  assert.equal(root.userData.environmentRichness.usesInstanceColor, false);
  assert.doesNotMatch(source, /\.setColorAt\(/);
  assert.doesNotMatch(source, /vertexColors:\s*true/);

  let instanceColorMeshes = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    if (object.instanceColor) instanceColorMeshes += 1;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshStandardMaterial) {
        assert.equal(material.vertexColors, false, `${object.name} unexpectedly enables vertex colors`);
        assert.ok(material.color.r + material.color.g + material.color.b > 0.18, `${object.name} has an implausibly dark fixed material`);
      }
    }
  });
  assert.equal(instanceColorMeshes, 0);
});

test("Environment Richness ground overlays sit above every Turbo Hunt regional floor", () => {
  // Phase67's highest regional floor top is just below world Y=0. Keeping the
  // richness overlay positive prevents the old hidden/z-fighting ground bug.
  assert.ok(CART_ENVIRONMENT_SURFACE_Y > 0);
  assert.ok(CART_ENVIRONMENT_ROAD_RHYTHM_Y > CART_ENVIRONMENT_SURFACE_Y);
  const root = buildCartEnvironmentRichness(new THREE.Scene());
  assert.equal(root.userData.environmentRichness.surfaceY, CART_ENVIRONMENT_SURFACE_Y);
  assert.equal(root.userData.environmentRichness.roadRhythmY, CART_ENVIRONMENT_ROAD_RHYTHM_Y);

  const surfaceLayer = root.getObjectByName("phase80-surface-patches");
  const roadLayer = root.getObjectByName("phase80-road-rhythm");
  assert.ok(surfaceLayer);
  assert.ok(roadLayer);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const firstSurface = surfaceLayer?.children.find((child) => child instanceof THREE.InstancedMesh) as THREE.InstancedMesh | undefined;
  const firstRoad = roadLayer?.children.find((child) => child instanceof THREE.InstancedMesh) as THREE.InstancedMesh | undefined;
  assert.ok(firstSurface);
  assert.ok(firstRoad);
  firstSurface.getMatrixAt(0, matrix);
  position.setFromMatrixPosition(matrix);
  assert.ok(position.y > 0);
  firstRoad.getMatrixAt(0, matrix);
  position.setFromMatrixPosition(matrix);
  assert.ok(position.y > CART_ENVIRONMENT_SURFACE_Y);
});

test("Environment Richness stays inside a bounded static draw-call budget", () => {
  const scene = new THREE.Scene();
  const root = buildCartEnvironmentRichness(scene);
  assert.equal(root.name, "phase80-environment-richness");
  assert.equal(root.userData.environmentRichness.textureless, true);
  assert.equal(root.userData.environmentRichness.gameplayCollisionChanged, false);
  assert.equal(root.userData.environmentRichness.staticOnly, true);
  assert.ok(CART_ENVIRONMENT_RICHNESS_DRAW_CALL_BUDGET <= 24);

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
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    renderableCount += 1;
    assert.equal(object.castShadow, false, `${object.name || object.type} unexpectedly casts a shadow`);
  });
  assert.equal(renderableCount, root.userData.environmentRichness.renderableBatchCount);
  assert.ok(renderableCount <= CART_ENVIRONMENT_RICHNESS_DRAW_CALL_BUDGET, `Phase80 uses ${renderableCount} renderables`);
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
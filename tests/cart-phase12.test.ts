import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/cart/CartRogueWebGLDemo.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/CartRogueGame.module.css", import.meta.url), "utf8");

test("Phase 12 batches high-density world dressing with instancing", () => {
  assert.match(source, /GROUND_DETAIL_CAPACITY/);
  assert.match(source, /GRASS_DETAIL_CAPACITY/);
  assert.match(source, /FLOWER_DETAIL_CAPACITY/);
  assert.match(source, /buildWorldDetailPools/);
  assert.match(source, /scatterWorldDetail/);
  assert.match(source, /setColorAt/);
  assert.match(source, /StaticDrawUsage/);
});

test("Phase 12 upgrades the vehicle read from the chase camera", () => {
  assert.match(source, /playerWheels/);
  assert.match(source, /addWheelArch/);
  assert.match(source, /spareHub/);
  assert.match(source, /tailMaterial/);
  assert.match(source, /rackRailA/);
  assert.match(source, /brakeDisc/);
});

test("Phase 12 gives enemies more silhouette-specific geometry", () => {
  assert.match(source, /buildEnemyVehicle/);
  assert.match(source, /spoiler/);
  assert.match(source, /bashPlate/);
  assert.match(source, /armor/);
  assert.match(source, /exhaust/);
  assert.match(source, /horn/);
});

test("Phase 12 adds pooled wall sparks and stronger impact presentation", () => {
  assert.match(source, /SPARK_COUNT/);
  assert.match(source, /buildSparkPool/);
  assert.match(source, /emitWallSparks/);
  assert.match(source, /emitImpactSparks/);
  assert.match(source, /updateSparks/);
  assert.match(source, /cameraRoll/);
  assert.match(source, /dynamicFov/);
  assert.match(source, /AdditiveBlending/);
});

test("Phase 12 improves scenery depth without texture assets", () => {
  assert.match(source, /addRoadShoulders/);
  assert.match(source, /addBackdropPavilions/);
  assert.match(source, /decorateBossArena/);
  assert.match(source, /addTerrainTerraces/);
  assert.doesNotMatch(source, /TextureLoader|\.png|\.jpg|\.webp/);
});

test("Phase 12 keeps mobile-aware rendering and gameplay delegation", () => {
  assert.match(source, /setPixelRatio\(Math\.min\(window\.devicePixelRatio \|\| 1, 1\.45\)\)/);
  assert.match(source, /this\.session\.advance\(delta/);
  assert.match(source, /this\.session\.snapshot\(\)/);
  assert.doesNotMatch(source, /ARENA_MAX_SPEED|RAM_COMBO_WINDOW|applyTurboRam|cartSteeringInput/);
});

test("Phase 12 HUD has stronger layered panels and responsive controls", () => {
  assert.match(css, /inset 0 1px 0/);
  assert.match(css, /comboKick/);
  assert.match(css, /ramPulse/);
  assert.match(css, /safe-area-inset/);
  assert.match(css, /boostButton:before/);
});

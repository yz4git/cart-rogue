import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/cart/CartRogueWebGLDemo.ts", import.meta.url), "utf8");

test("Phase 11 builds a layered atmospheric WebGL scene without texture assets", () => {
  assert.match(source, /buildAtmosphere\(\)/);
  assert.match(source, /SphereGeometry\(330/);
  assert.match(source, /skyTop/);
  assert.match(source, /addTerrainTerraces/);
  assert.match(source, /addCorridorArches/);
  assert.match(source, /decorateBossArena/);
  assert.doesNotMatch(source, /TextureLoader|loadTexture|\.png|\.jpg|\.webp/);
});

test("Phase 11 upgrades vehicle silhouettes and contact grounding", () => {
  assert.match(source, /taperedBox/);
  assert.match(source, /addContactShadow/);
  assert.match(source, /wheelHub/);
  assert.match(source, /spoiler/);
  assert.match(source, /armor/);
  assert.match(source, /exhaust/);
});

test("Phase 11 adds pooled ambient effects suitable for mobile WebGL", () => {
  assert.match(source, /InstancedMesh/);
  assert.match(source, /DUST_COUNT/);
  assert.match(source, /PointsMaterial/);
  assert.match(source, /PETAL_COUNT/);
  assert.match(source, /DynamicDrawUsage/);
  assert.match(source, /setPixelRatio\(Math\.min\(window\.devicePixelRatio \|\| 1, 1\.45\)\)/);
});

test("Phase 11 adds speed, RAM impact, and camera presentation feedback", () => {
  assert.match(source, /LineSegments/);
  assert.match(source, /updateSpeedLines/);
  assert.match(source, /updateRamPresentation/);
  assert.match(source, /cameraShake/);
  assert.match(source, /impactOverlay/);
  assert.match(source, /AdditiveBlending/);
});

test("Phase 11 keeps gameplay simulation delegated to CartArenaSession", () => {
  assert.match(source, /this\.session\.advance\(delta/);
  assert.match(source, /this\.session\.snapshot\(\)/);
  assert.doesNotMatch(source, /ARENA_MAX_SPEED|RAM_COMBO_WINDOW|applyTurboRam|cartSteeringInput/);
});

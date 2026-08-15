import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/cart/CartRoguePhase13Visuals.ts", import.meta.url), "utf8");
const wrapper = readFileSync(new URL("../app/CartRogueGamePhase13.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("Phase 13 adds instanced micro relief and persistent skid presentation", () => {
  assert.match(source, /addGroundRelief/);
  assert.match(source, /InstancedMesh/);
  assert.match(source, /skidMarks/);
  assert.match(source, /emitSkidMarks/);
  assert.match(source, /DynamicDrawUsage/);
});

test("Phase 13 makes the player and enemy silhouettes more characterful", () => {
  assert.match(source, /addHeroCarDetails/);
  assert.match(source, /towRing/);
  assert.match(source, /mudflap/);
  assert.match(source, /roof|lampMaterial/);
  assert.match(source, /addEnemyPersonality/);
  assert.match(source, /browColor/);
  assert.match(source, /bossLight/);
});

test("Phase 13 adds a second cinematic RAM impact layer", () => {
  assert.match(source, /spawnCinematicBurst/);
  assert.match(source, /TorusGeometry/);
  assert.match(source, /PointLight/);
  assert.match(source, /AdditiveBlending/);
  assert.match(source, /bursts/);
});

test("Phase 13 brings the chase camera closer without changing gameplay", () => {
  assert.match(source, /tightenHeroCamera/);
  assert.match(source, /addScaledVector/);
  assert.match(source, /camera\.fov/);
  assert.doesNotMatch(source, /ARENA_MAX_SPEED|RAM_COMBO_WINDOW|applyTurboRam|cartSteeringInput|MAX_BOOST_CHARGES/);
});

test("Phase 13 is enabled before the client game constructs WebGL", () => {
  assert.match(wrapper, /import "\.\.\/src\/cart\/CartRoguePhase13Visuals"/);
  assert.match(wrapper, /CartRogueGame/);
  assert.match(page, /CartRogueGamePhase13/);
});

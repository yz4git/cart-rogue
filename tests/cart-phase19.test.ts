import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/cart/CartRoguePhase19TargetArt.ts", import.meta.url), "utf8");
const wrapper = readFileSync(new URL("../app/CartRogueGamePhase13.tsx", import.meta.url), "utf8");

test("Phase 19 replaces the abstract horizon with a pastel voxel garden world", () => {
  assert.match(source, /hideAbstractPhase18World/);
  assert.match(source, /addVoxelGardenWorld/);
  assert.match(source, /phase19-target-art-world/);
  assert.match(source, /blossomCubes/);
  assert.match(source, /terraces/);
  assert.match(source, /bushes/);
  assert.match(source, /flowers/);
  assert.match(source, /InstancedMesh/);
});

test("Phase 19 moves the render grade toward the bright pastel reference", () => {
  assert.match(source, /applyReferenceGrade/);
  assert.match(source, /ACESFilmicToneMapping/);
  assert.match(source, /toneMappingExposure = 1\.24/);
  assert.match(source, /0x94ceff/);
  assert.match(source, /0xf18bbb/);
  assert.match(source, /0x9ed06f/);
});

test("Phase 19 substantially increases hero and enemy reference likeness", () => {
  assert.match(source, /addReferenceHero/);
  assert.match(source, /spare/);
  assert.match(source, /addCubeCreature/);
  assert.match(source, /phase19-cube-creature/);
  assert.match(source, /addHeavyFace/);
  assert.match(source, /enemyPalette/);
});

test("Phase 19 adds large voxel hit debris and reference-style impact rays", () => {
  assert.match(source, /spawnReferenceParticles/);
  assert.match(source, /spawnReferenceHit/);
  assert.match(source, /DynamicDrawUsage/);
  assert.match(source, /AdditiveBlending/);
  assert.match(source, /TorusGeometry/);
});

test("Phase 19 uses a closer high three-quarter chase camera without gameplay changes", () => {
  assert.match(source, /applyReferenceCamera/);
  assert.match(source, /distance = snapshot\.boostActive \? 10\.7 : 9\.4/);
  assert.match(source, /height = snapshot\.boostActive \? 6\.9 : 6\.2/);
  assert.doesNotMatch(source, /applyTurboRam|cartSteeringInput|GAS_DRAIN_PER_SECOND|CART_TURBO_RECHARGE_SECONDS|enemy\.hp\s*=|enemy\.alive\s*=/);
});

test("Phase 19 loads after Phase 18 so it can deliberately restyle the final presentation", () => {
  assert.match(wrapper, /CartRoguePhase18VisualOverdrive/);
  assert.match(wrapper, /CartRoguePhase18VisualPolish/);
  assert.match(wrapper, /CartRoguePhase19TargetArt/);
  assert.ok(wrapper.indexOf("CartRoguePhase19TargetArt") > wrapper.indexOf("CartRoguePhase18VisualPolish"));
});

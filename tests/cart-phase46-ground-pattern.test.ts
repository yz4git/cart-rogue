import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  cartPhase46RoadPalette,
  cartPhase46ShadeIndex,
  cartPhase46TileGapRatio,
  cartPhase46TileY,
  cartPhase46UsesInstanceColors,
} from "../src/cart/CartRoguePhase46GroundPatternRecovery";
import { cartPhase38RoadTileY } from "../src/cart/CartRoguePhase38ReliableMosaic";

const source = readFileSync(new URL("../src/cart/CartRoguePhase46GroundPatternRecovery.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");

test("Phase 46 restores a visible fixed-color road pattern without the risky instance-color path", () => {
  assert.equal(cartPhase46UsesInstanceColors(), false);
  assert.ok(cartPhase46TileGapRatio() >= 0.1, "tile gaps should remain visible at driving distance");
  assert.ok(cartPhase46TileGapRatio() <= 0.2, "tile gaps should not fragment the road");
  assert.ok(cartPhase46TileY() > cartPhase38RoadTileY(), "replacement tiles should sit clearly above the retired road layer");

  for (const stage of ["meadow", "orchard", "grove", "canyon", "boss"] as const) {
    const palette = cartPhase46RoadPalette(stage);
    assert.equal(new Set(palette).size, 5, `${stage} should have five distinct fixed road colors`);
    assert.ok(palette.every((color) => color !== 0xffffff), `${stage} road colors must never depend on a white base material`);
  }

  assert.doesNotMatch(source, /\.setColorAt\(/);
  assert.doesNotMatch(source, /vertexColors:\s*true/);
  assert.match(source, /new THREE\.MeshBasicMaterial/);
  assert.match(source, /toneMapped:\s*false/);
  assert.match(source, /phase46-safe-ground-pattern/);
});

test("Phase 46 pattern generator produces several visibly different tile shades", () => {
  const shades = new Set<number>();
  for (let x = 0; x < 12; x += 1) {
    for (let z = 0; z < 12; z += 1) shades.add(cartPhase46ShadeIndex(x, z, 47));
  }
  assert.ok(shades.size >= 4, `expected at least four shade bands, got ${Array.from(shades).join(",")}`);
});

test("Phase 46 keeps the white-slab suspects retired while replacing their visual role", () => {
  assert.match(source, /phase38-reliable-road-mosaic/);
  assert.match(source, /phase38\.visible = false/);
  assert.match(source, /phase35-road-mosaic/);
  assert.match(source, /phase35Road\.visible = false/);
  assert.match(source, /phase34-floor-detail/);
  assert.match(source, /phase34Detail\.visible = false/);
  assert.match(source, /phase46GroundPatternRecovered/);
});

test("Phase 46 loads after Phase 45 so the restored pattern wins without undoing stability fixes", () => {
  const phase45 = appSource.indexOf("CartRoguePhase45StabilityGuidance");
  const phase46 = appSource.indexOf("CartRoguePhase46GroundPatternRecovery");
  assert.ok(phase45 >= 0);
  assert.ok(phase46 > phase45);
});

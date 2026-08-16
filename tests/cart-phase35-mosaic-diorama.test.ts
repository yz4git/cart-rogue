import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  cartMosaicApronWidth,
  cartMosaicGrassPalette,
  cartMosaicRoadPalette,
  cartMosaicRoadTileSize,
} from "../src/cart/CartRoguePhase35MosaicDiorama";

const phaseSource = readFileSync(new URL("../src/cart/CartRoguePhase35MosaicDiorama.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app/CartRogueGamePhase13.tsx", import.meta.url), "utf8");

test("Phase 35 uses a coarse lightweight mosaic rather than subdividing gameplay terrain", () => {
  assert.ok(cartMosaicRoadTileSize() >= 2.4, "road tiles should stay coarse enough for mobile");
  assert.ok(cartMosaicApronWidth() >= 7, "visual apron should create a readable roadside band");
  assert.match(phaseSource, /InstancedMesh/);
  assert.match(phaseSource, /PlaneGeometry/);
  assert.doesNotMatch(phaseSource, /collider|physicsBody|RigidBody/i);
});

test("Phase 35 separates warm road colors from green roadside colors", () => {
  const road = cartMosaicRoadPalette("meadow");
  const grass = cartMosaicGrassPalette("meadow");
  assert.ok(road.length >= 4);
  assert.ok(grass.length >= 4);
  assert.notDeepEqual(road, grass);
  assert.notEqual(road[0], grass[0]);
});

test("Phase 35 keeps distinct stage palettes for the mosaic floor", () => {
  assert.notDeepEqual(cartMosaicRoadPalette("meadow"), cartMosaicRoadPalette("boss"));
  assert.notDeepEqual(cartMosaicGrassPalette("orchard"), cartMosaicGrassPalette("grove"));
});

test("Phase 35 includes flat roadside water, banks, flower beds and sparse hero trees", () => {
  assert.match(phaseSource, /phase35-water-mosaic/);
  assert.match(phaseSource, /phase35-stone-banks/);
  assert.match(phaseSource, /phase35-flower-beds/);
  assert.match(phaseSource, /phase35-hero-tree-canopies/);
});

test("Phase 35 is loaded after Phase 34 floor detail", () => {
  const phase34 = appSource.indexOf("CartRoguePhase34FloorDetail");
  const phase35 = appSource.indexOf("CartRoguePhase35MosaicDiorama");
  assert.ok(phase34 >= 0);
  assert.ok(phase35 > phase34);
});

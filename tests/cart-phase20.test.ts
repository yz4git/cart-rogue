import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Cart Rogue Phase 20 diorama quality", () => {
  it("loads both phase20 presentation passes after phase19", () => {
    const wrapper = read("src/cart/CartRogueRuntime.ts");
    assert.ok(wrapper.includes("CartRoguePhase20DioramaQuality"));
    assert.ok(wrapper.includes("CartRoguePhase20ReferenceMatch"));
    assert.ok(wrapper.indexOf("CartRoguePhase20DioramaQuality") > wrapper.indexOf("CartRoguePhase19ArtifactCleanup"));
    assert.ok(wrapper.indexOf("CartRoguePhase20ReferenceMatch") > wrapper.indexOf("CartRoguePhase20DioramaQuality"));
  });

  it("adds diorama landmarks and ambient petals without changing gameplay systems", () => {
    const source = read("src/cart/CartRoguePhase20DioramaQuality.ts");
    assert.ok(source.includes("addCherryTree"));
    assert.ok(source.includes("addLantern"));
    assert.ok(source.includes("addBridge"));
    assert.ok(source.includes("createPetals"));
    assert.ok(source.includes("upgradeHero"));
    assert.ok(source.includes("cinematicCamera"));
    assert.ok(!source.includes("session.step"));
    assert.ok(!source.includes("turboStocks"));
    assert.ok(!source.includes("gas ="));
  });

  it("tightens the generated-reference match with bright world, torii, dense garden, and closer camera", () => {
    const source = read("src/cart/CartRoguePhase20ReferenceMatch.ts");
    assert.ok(source.includes("retintLegacyScenery"));
    assert.ok(source.includes("applyReferenceDaylight"));
    assert.ok(source.includes("addDenseCherry"));
    assert.ok(source.includes("addTorii"));
    assert.ok(source.includes("addNearGardenLayer"));
    assert.ok(source.includes("polishHero"));
    assert.ok(source.includes("closerReferenceCamera"));
    assert.ok(!source.includes("session.step"));
    assert.ok(!source.includes("turboStocks"));
  });

  it("keeps the phase20 passes texture-free and lightweight", () => {
    const sources = [
      read("src/cart/CartRoguePhase20DioramaQuality.ts"),
      read("src/cart/CartRoguePhase20ReferenceMatch.ts"),
    ].join("\n");
    assert.ok(!sources.includes("TextureLoader"));
    assert.ok(!sources.includes("WebGLRenderTarget"));
    assert.ok(!sources.includes("EffectComposer"));
    assert.ok(sources.includes("flatShading: true"));
  });
});

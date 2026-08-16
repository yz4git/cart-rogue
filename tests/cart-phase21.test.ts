import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Cart Rogue Phase 21 impact polish", () => {
  it("loads phase21 after the phase20 presentation passes", () => {
    const wrapper = read("src/cart/CartRogueRuntime.ts");
    assert.ok(wrapper.includes("CartRoguePhase21ImpactPolish"));
    assert.ok(wrapper.includes("CartRoguePhase21WorldGrade"));
    assert.ok(wrapper.indexOf("CartRoguePhase21ImpactPolish") > wrapper.indexOf("CartRoguePhase20ReferenceMatch"));
    assert.ok(wrapper.indexOf("CartRoguePhase21WorldGrade") > wrapper.indexOf("CartRoguePhase21ImpactPolish"));
  });

  it("adds dense instanced ground, hero and enemy presentation, and pooled impact FX", () => {
    const source = read("src/cart/CartRoguePhase21ImpactPolish.ts");
    assert.ok(source.includes("new THREE.InstancedMesh"));
    assert.ok(source.includes("addGroundMicroDetail"));
    assert.ok(source.includes("upgradeHero"));
    assert.ok(source.includes("upgradeEnemy"));
    assert.ok(source.includes("spawnImpact"));
    assert.ok(source.includes("addImpactCameraPunch"));
    assert.ok(source.includes("cartArenaContains"));
  });

  it("finishes the world with a pastel environment-only grade", () => {
    const source = read("src/cart/CartRoguePhase21WorldGrade.ts");
    assert.ok(source.includes("recolorDarkEnvironment"));
    assert.ok(source.includes("enrichPastelPalette"));
    assert.ok(source.includes("phase21-soft-ambient"));
    assert.ok(!source.includes("playerVisual"));
    assert.ok(!source.includes("enemyGroups"));
  });

  it("remains a presentation-only texture-free pass", () => {
    const source = read("src/cart/CartRoguePhase21ImpactPolish.ts");
    assert.ok(!source.includes("TextureLoader"));
    assert.ok(!source.includes("EffectComposer"));
    assert.ok(!source.includes("session.step"));
    assert.ok(!source.includes("turboStocks ="));
    assert.ok(!source.includes("gas ="));
    assert.ok(source.includes("flatShading: true"));
  });
});

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Cart Rogue Phase 21 impact polish", () => {
  it("loads phase21 after the phase20 presentation passes", () => {
    const wrapper = read("app/CartRogueGamePhase13.tsx");
    expect(wrapper).toContain("CartRoguePhase21ImpactPolish");
    expect(wrapper.indexOf("CartRoguePhase21ImpactPolish")).toBeGreaterThan(wrapper.indexOf("CartRoguePhase20ReferenceMatch"));
  });

  it("adds dense instanced ground, hero and enemy presentation, and pooled impact FX", () => {
    const source = read("src/cart/CartRoguePhase21ImpactPolish.ts");
    expect(source).toContain("new THREE.InstancedMesh");
    expect(source).toContain("addGroundMicroDetail");
    expect(source).toContain("upgradeHero");
    expect(source).toContain("upgradeEnemy");
    expect(source).toContain("spawnImpact");
    expect(source).toContain("addImpactCameraPunch");
    expect(source).toContain("cartArenaContains");
  });

  it("remains a presentation-only texture-free pass", () => {
    const source = read("src/cart/CartRoguePhase21ImpactPolish.ts");
    expect(source).not.toContain("TextureLoader");
    expect(source).not.toContain("EffectComposer");
    expect(source).not.toContain("session.step");
    expect(source).not.toContain("turboStocks =");
    expect(source).not.toContain("gas =");
    expect(source).toContain("flatShading: true");
  });
});

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Cart Rogue Phase 20 diorama quality", () => {
  it("loads both phase20 presentation passes after phase19", () => {
    const wrapper = read("app/CartRogueGamePhase13.tsx");
    expect(wrapper).toContain('CartRoguePhase20DioramaQuality');
    expect(wrapper).toContain('CartRoguePhase20ReferenceMatch');
    expect(wrapper.indexOf('CartRoguePhase20DioramaQuality')).toBeGreaterThan(wrapper.indexOf('CartRoguePhase19ArtifactCleanup'));
    expect(wrapper.indexOf('CartRoguePhase20ReferenceMatch')).toBeGreaterThan(wrapper.indexOf('CartRoguePhase20DioramaQuality'));
  });

  it("adds diorama landmarks and ambient petals without changing gameplay systems", () => {
    const source = read("src/cart/CartRoguePhase20DioramaQuality.ts");
    expect(source).toContain('addCherryTree');
    expect(source).toContain('addLantern');
    expect(source).toContain('addBridge');
    expect(source).toContain('createPetals');
    expect(source).toContain('upgradeHero');
    expect(source).toContain('cinematicCamera');
    expect(source).not.toContain('session.step');
    expect(source).not.toContain('turboStocks');
    expect(source).not.toContain('gas =');
  });

  it("tightens the generated-reference match with bright world, torii, dense garden, and closer camera", () => {
    const source = read("src/cart/CartRoguePhase20ReferenceMatch.ts");
    expect(source).toContain('retintLegacyScenery');
    expect(source).toContain('applyReferenceDaylight');
    expect(source).toContain('addDenseCherry');
    expect(source).toContain('addTorii');
    expect(source).toContain('addNearGardenLayer');
    expect(source).toContain('polishHero');
    expect(source).toContain('closerReferenceCamera');
    expect(source).not.toContain('session.step');
    expect(source).not.toContain('turboStocks');
  });

  it("keeps the phase20 passes texture-free and lightweight", () => {
    const sources = [
      read("src/cart/CartRoguePhase20DioramaQuality.ts"),
      read("src/cart/CartRoguePhase20ReferenceMatch.ts"),
    ].join("\n");
    expect(sources).not.toContain('TextureLoader');
    expect(sources).not.toContain('WebGLRenderTarget');
    expect(sources).not.toContain('EffectComposer');
    expect(sources).toContain('flatShading: true');
  });
});

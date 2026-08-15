import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Cart Rogue Phase 20 diorama quality", () => {
  it("loads the phase20 presentation pass after phase19", () => {
    const wrapper = read("app/CartRogueGamePhase13.tsx");
    expect(wrapper).toContain('CartRoguePhase20DioramaQuality');
    expect(wrapper.indexOf('CartRoguePhase20DioramaQuality')).toBeGreaterThan(wrapper.indexOf('CartRoguePhase19ArtifactCleanup'));
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

  it("keeps the phase20 pass texture-free and lightweight", () => {
    const source = read("src/cart/CartRoguePhase20DioramaQuality.ts");
    expect(source).not.toContain('TextureLoader');
    expect(source).not.toContain('WebGLRenderTarget');
    expect(source).not.toContain('EffectComposer');
    expect(source).toContain('flatShading: true');
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/cart/CartRoguePhase18VisualOverdrive.ts", import.meta.url), "utf8");
const polish = readFileSync(new URL("../src/cart/CartRoguePhase18VisualPolish.ts", import.meta.url), "utf8");
const wrapper = readFileSync(new URL("../app/CartRogueGamePhase13.tsx", import.meta.url), "utf8");

test("Phase 18 upgrades the world with instanced faceted horizon, arena inlays, guidance lighting and architecture", () => {
  assert.match(source, /addFacetedHorizon/);
  assert.match(source, /addArenaInlays/);
  assert.match(source, /addGuidanceLights/);
  assert.match(source, /addArenaArchitecture/);
  assert.match(source, /InstancedMesh/);
  assert.match(source, /StaticDrawUsage/);
  assert.match(source, /cartArenaBoundaryPoints/);
});

test("Phase 18 applies a deeper modern color and light grade without postprocessing dependencies", () => {
  assert.match(source, /enhanceBasePalette/);
  assert.match(source, /ACESFilmicToneMapping/);
  assert.match(source, /toneMappingExposure/);
  assert.match(source, /HemisphereLight/);
  assert.match(source, /DirectionalLight/);
  assert.match(source, /scene\.fog/);
  assert.doesNotMatch(source, /EffectComposer|UnrealBloomPass|TextureLoader|WebGLRenderTarget/);
});

test("Phase 18 substantially increases hero and enemy silhouette detail", () => {
  assert.match(source, /addHeroOverdrive/);
  assert.match(source, /phase18-hero-overdrive/);
  assert.match(source, /heroTurbines/);
  assert.match(source, /addEnemyOverdrive/);
  assert.match(source, /drifter/);
  assert.match(source, /bomber/);
  assert.match(source, /tank/);
  assert.match(source, /orbiter/);
  assert.match(source, /striker/);
  assert.match(source, /boss/);
});

test("Phase 18 adds cinematic RAM impact and speed presentation with bounded lightweight primitives", () => {
  assert.match(source, /spawnOverdriveImpact/);
  assert.match(source, /updateBursts/);
  assert.match(source, /makeSpeedStreaks/);
  assert.match(source, /LineSegments/);
  assert.match(source, /AdditiveBlending/);
  assert.match(source, /PointLight/);
  assert.match(source, /life: 0\.4/);
});

test("Phase 18 polish reins in the horizon and restores a bounded cinematic camera roll", () => {
  assert.match(polish, /polishFacetedHorizon/);
  assert.match(polish, /MeshBasicMaterial/);
  assert.match(polish, /scale\.x \*= 0\.62/);
  assert.match(polish, /restoreCinematicHorizon/);
  assert.match(polish, /camera\.lookAt/);
  assert.match(polish, /camera\.rotateZ/);
  assert.doesNotMatch(polish, /enemy\.hp\s*=|enemy\.alive\s*=|applyTurboRam/);
});

test("Phase 18 remains a presentation-only patch and is installed after combat evolution", () => {
  assert.match(wrapper, /CartRoguePhase17CombatEvolution/);
  assert.match(wrapper, /CartRoguePhase18VisualOverdrive/);
  assert.match(wrapper, /CartRoguePhase18VisualPolish/);
  assert.ok(wrapper.indexOf("CartRoguePhase18VisualOverdrive") > wrapper.indexOf("CartRoguePhase17CombatEvolution"));
  assert.ok(wrapper.indexOf("CartRoguePhase18VisualPolish") > wrapper.indexOf("CartRoguePhase18VisualOverdrive"));
  assert.doesNotMatch(source, /applyTurboRam|cartSteeringInput|RAM_COMBO_WINDOW|GAS_DRAIN_PER_SECOND|CART_TURBO_RECHARGE_SECONDS|enemy\.hp\s*=|enemy\.alive\s*=/);
});

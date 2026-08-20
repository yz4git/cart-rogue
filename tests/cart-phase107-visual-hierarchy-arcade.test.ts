import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CART_PHASE107_AOE_CAGE_SLOTS,
  CART_PHASE107_FAR_PYLON_COUNT,
  CART_PHASE107_LANDMARK_COUNT,
  CART_PHASE107_PRESENTATION_ID,
  CART_PHASE107_REDUCED_FX_FRAME_MS,
  CART_PHASE107_SPEED_STREAK_COUNT,
} from "../src/cart/CartRoguePhase107VisualHierarchyArcade";

const source = readFileSync(new URL("../src/cart/CartRoguePhase107VisualHierarchyArcade.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/cart/CartGameMenuRuntime.ts", import.meta.url), "utf8");
const overlaySource = readFileSync(new URL("../app/CartTurboHuntHudOverlay.tsx", import.meta.url), "utf8");
const overlayCss = readFileSync(new URL("../app/CartTurboHuntHudOverlay.module.css", import.meta.url), "utf8");
const mobileCss = readFileSync(new URL("../app/cart-rogue-mobile-fix.css", import.meta.url), "utf8");

test("Phase107 is a fixed-budget presentation layer installed after Phase106", () => {
  assert.equal(CART_PHASE107_PRESENTATION_ID, "phase107-visual-hierarchy-arcade-v1");
  assert.equal(CART_PHASE107_LANDMARK_COUNT, 5);
  assert.equal(CART_PHASE107_FAR_PYLON_COUNT, 8);
  assert.equal(CART_PHASE107_SPEED_STREAK_COUNT, 16);
  assert.equal(CART_PHASE107_AOE_CAGE_SLOTS, 4);
  assert.equal(CART_PHASE107_REDUCED_FX_FRAME_MS, 20.5);
  const phase106 = runtimeSource.indexOf("CartRoguePhase106EncounterDirector2");
  const phase107 = runtimeSource.indexOf("CartRoguePhase107VisualHierarchyArcade");
  assert.ok(phase106 >= 0);
  assert.ok(phase107 > phase106);
});

test("Phase107 keeps gameplay contracts untouched and avoids heavy post FX", () => {
  assert.doesNotMatch(source, /CartArenaSession\.prototype/);
  assert.doesNotMatch(source, /queueCartRaidHazard\s*\(/);
  assert.doesNotMatch(source, /cartPointInRaidHazard\s*\(/);
  assert.doesNotMatch(source, /new THREE\.PointLight/);
  assert.doesNotMatch(source, /EffectComposer|UnrealBloomPass|SSAO|three\/examples\/jsm\/postprocessing/i);
  assert.doesNotMatch(source, /\.gas\s*=|\.hp\s*=|\.maxHp\s*=|\.radius\s*=/);
});

test("Phase107 adds macro landmarks, hero/enemy silhouettes, speed streaks and vertical AOE structure", () => {
  for (const marker of [
    "phase107-mega-landmark",
    "phase107-far-depth-pylons",
    "phase107-macro-sector-markers",
    "phase107-hero-rear-wing",
    "phase107-hero-turbine-ring",
    "long-fin",
    "wide-shoulder",
    "broad-bumper",
    "boss-crown",
    "phase107-ground-speed-streaks",
    "phase107-aoe-crown",
    "phase107-aoe-pillars",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /frameMsEma > CART_PHASE107_REDUCED_FX_FRAME_MS/);
  assert.match(source, /const activeCount = reduced \? 8 : CART_PHASE107_SPEED_STREAK_COUNT/);
});

test("Phase107 compresses persistent HUD while preserving touch targets", () => {
  assert.match(overlaySource, /rendererBadge/);
  assert.match(overlaySource, /steerZone/);
  assert.match(overlaySource, /phaseStyles\.rewardBanner/);
  assert.match(overlaySource, /width: 46px !important/);
  assert.match(overlaySource, /width: 70px !important/);
  assert.match(mobileCss, /width:\s*min\(calc\(100% - 64px\),\s*580px\)\s*!important/);
  assert.match(mobileCss, /grid-template-columns:\s*82px\s+minmax\(220px,\s*1fr\)\s+88px\s*!important/);
  assert.match(overlayCss, /min-height:\s*36px/);
});

test("Phase107 removes duplicate center reward banners and uses compact typed messages instead", () => {
  assert.match(overlaySource, /import phaseStyles from "\.\/CartRoguePhase3\.module\.css"/);
  assert.match(overlaySource, /\.\$\{phaseStyles\.rewardBanner\}\s*\{ display: none !important; \}/);
  assert.match(overlaySource, /FIELD EVENT/);
  assert.match(overlaySource, /DIRECT HIT/);
  assert.match(overlaySource, /PERFECT AOE DODGE/);
  assert.match(overlaySource, /ESCAPE\|BREAK AWAY\|CLEAR/);
});

test("Phase107 gives damage, counter, RAID, escape and field events different arcade languages", () => {
  assert.match(overlaySource, /"escape"/);
  assert.match(overlaySource, /styles\.escapeHot/);
  assert.match(overlayCss, /\.damageHit/);
  assert.match(overlayCss, /\.counterHot/);
  assert.match(overlayCss, /\.raidHot/);
  assert.match(overlayCss, /\.escapeHot/);
  assert.match(overlayCss, /\.eventActive/);
  assert.match(overlayCss, /width:\s*min\(31vw,\s*292px\)/);
});

test("Phase107 keeps Face Editor cut-ins compact and away from the driving center", () => {
  assert.match(source, /cart-phase107-cutin-override/);
  assert.match(source, /width:min\(34vw,318px\)!important/);
  assert.match(source, /height:clamp\(92px,31vh,126px\)!important/);
  assert.match(source, /width:min\(32vw,278px\)!important/);
  assert.match(source, /cart-anime-cutin/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const viewportSync = readFileSync(new URL("../app/CartViewportSync.tsx", import.meta.url), "utf8");
const mobileFix = readFileSync(new URL("../app/cart-rogue-mobile-fix.css", import.meta.url), "utf8");
const legacyGameCss = readFileSync(new URL("../app/CartRogueGame.module.css", import.meta.url), "utf8");
const gameMenu = readFileSync(new URL("../app/CartGameMenu.tsx", import.meta.url), "utf8");
const menuConfigCss = readFileSync(new URL("../app/CartGameMenuConfig.module.css", import.meta.url), "utf8");

test("iPhone landscape shell follows the measured visual viewport without the iOS fixed-bottom path", () => {
  assert.match(layout, /import "\.\/cart-rogue-mobile-fix\.css"/);
  assert.match(layout, /import CartViewportSync from "\.\/CartViewportSync"/);
  assert.match(layout, /<CartViewportSync\s*\/>/);

  assert.match(viewportSync, /window\.visualViewport/);
  assert.match(viewportSync, /--cart-visual-viewport-height/);
  assert.match(viewportSync, /viewport\?\.height\s*\?\?\s*window\.innerHeight/);
  assert.match(viewportSync, /visualViewport\?\.addEventListener\("resize"/);
  assert.match(viewportSync, /orientationchange/);

  assert.match(mobileFix, /position:\s*absolute\s*!important/);
  assert.match(mobileFix, /height:\s*var\(--cart-visual-viewport-height,\s*100lvh\)\s*!important/);
  assert.match(mobileFix, /bottom:\s*auto\s*!important/);
  assert.match(mobileFix, /min-height:\s*0\s*!important/);
  assert.match(mobileFix, /max-height:\s*none\s*!important/);
  assert.doesNotMatch(mobileFix, /position:\s*fixed\s*!important/);
  assert.doesNotMatch(mobileFix, /height:\s*100dvh\s*!important/);
  assert.match(mobileFix, /section\[aria-label="Cart Rogue game"\]/);
  assert.match(legacyGameCss, /min-height:100vh/);
});

test("Turbo Hunt HUD has a compact iPhone-landscape contract", () => {
  assert.match(mobileFix, /\[aria-label="Turbo Hunt status"\]/);
  assert.match(mobileFix, /@media\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*500px\)/);
  assert.match(mobileFix, /width:\s*min\(calc\(100% - 48px\),\s*650px\)\s*!important/);
  assert.match(mobileFix, /grid-template-columns:\s*96px\s+minmax\(238px,\s*1fr\)\s+104px\s*!important/);
  assert.match(mobileFix, /div:nth-child\(2\)\s*>\s*div:nth-child\(2\)[\s\S]*display:\s*none\s*!important/);
  assert.match(mobileFix, /div:last-child\s*>\s*div:last-child[\s\S]*display:\s*none\s*!important/);
});

test("mobile fix keeps the WebGL canvas bounded by the repaired stage", () => {
  assert.match(mobileFix, /canvas\.cart-rogue-canvas/);
  assert.match(mobileFix, /max-height:\s*100%\s*!important/);
  assert.doesNotMatch(mobileFix, /min-height:\s*100vh/);
});

test("pause screen exposes config and title return while config remains compact and touch friendly", () => {
  assert.match(gameMenu, />CONFIG</);
  assert.match(gameMenu, />BACK TO TITLE</);
  assert.match(gameMenu, /type="range"/);
  assert.match(gameMenu, /CAMERA DISTANCE/);
  assert.match(gameMenu, /VIBRATION/);
  assert.match(gameMenu, /FAR \+60%/);
  assert.match(menuConfigCss, /safe-area-inset-left/);
  assert.match(menuConfigCss, /touch-action:manipulation/);
  assert.match(menuConfigCss, /@media\(max-height:460px\)/);
});

test("anime cut-ins use a slightly smaller presentation footprint on iPhone landscape", () => {
  assert.match(menuConfigCss, /#cart-anime-cutin-v1/);
  assert.match(menuConfigCss, /width:min\(39vw,390px\)!important/);
  assert.match(menuConfigCss, /height:clamp\(98px,36vh,142px\)!important/);
  assert.match(menuConfigCss, /orientation:landscape/);
  assert.match(menuConfigCss, /max-height:500px/);
  assert.match(menuConfigCss, /width:min\(37vw,360px\)!important/);
});

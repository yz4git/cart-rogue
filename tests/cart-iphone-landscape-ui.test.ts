import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const mobileFix = readFileSync(new URL("../app/cart-rogue-mobile-fix.css", import.meta.url), "utf8");
const legacyGameCss = readFileSync(new URL("../app/CartRogueGame.module.css", import.meta.url), "utf8");

test("iPhone landscape shell overrides legacy vh minimum with the dynamic visual viewport", () => {
  assert.match(layout, /import "\.\/cart-rogue-mobile-fix\.css"/);
  assert.match(mobileFix, /height:\s*100svh\s*!important/);
  assert.match(mobileFix, /@supports\s*\(height:\s*100dvh\)/);
  assert.match(mobileFix, /height:\s*100dvh\s*!important/);
  assert.match(mobileFix, /min-height:\s*0\s*!important/);
  assert.match(mobileFix, /position:\s*fixed\s*!important/);
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

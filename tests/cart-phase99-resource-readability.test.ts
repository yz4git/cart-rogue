import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createInitialCartResources } from "../src/cart/CartResources";
import {
  CART_RECOVERY_GLOW_COLOR,
  CART_RECOVERY_VISUAL_COLOR,
  CART_RESOURCE_RECOVERY_MARK,
  CART_RESOURCE_TURBO_MARK,
  CART_TURBO_VISUAL_COLOR,
} from "../src/cart/CartRoguePhase99ResourceReadability";

const webglSource = readFileSync(new URL("../src/cart/CartRoguePhase99ResourceReadability.ts", import.meta.url), "utf8");
const canvasSource = readFileSync(new URL("../src/cart/CartRogueCanvasPreview.ts", import.meta.url), "utf8");
const resourceSource = readFileSync(new URL("../src/cart/CartResources.ts", import.meta.url), "utf8");
const sessionSource = readFileSync(new URL("../src/cart/CartArenaSession.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");

test("resource mechanics remain gas recovery and Turbo only", () => {
  const resources = createInitialCartResources();
  assert.ok(resources.some((pickup) => pickup.kind === "gas"));
  assert.ok(resources.some((pickup) => pickup.kind === "turbo"));
  assert.ok(resources.every((pickup) => pickup.kind === "gas" || pickup.kind === "turbo"));
  assert.match(resourceSource, /CartResourceKind = "gas" \| "turbo"/);
  assert.match(sessionSource, /this\.gas = Math\.min\(1, this\.gas \+ 0\.12\)/);
  assert.match(sessionSource, /GAS CELL · \+12%/);
});

test("recovery and Turbo use different color, symbol and silhouette contracts", () => {
  assert.notEqual(CART_RECOVERY_VISUAL_COLOR, CART_TURBO_VISUAL_COLOR);
  assert.notEqual(CART_RECOVERY_GLOW_COLOR, CART_TURBO_VISUAL_COLOR);
  assert.equal(CART_RESOURCE_RECOVERY_MARK, "recovery-cross");
  assert.equal(CART_RESOURCE_TURBO_MARK, "turbo-bolt");
  assert.match(webglSource, /MEDICAL_PLUS/);
  assert.match(webglSource, /LIGHTNING_BOLT/);
  assert.match(webglSource, /recoveryCrossVertical/);
  assert.match(webglSource, /recoveryCrossHorizontal/);
  assert.match(webglSource, /makeTurboBoltGeometry/);
  assert.match(webglSource, /Broad side shoulders make recovery visibly wider than Turbo/);
});

test("recovery is deliberately calmer than Turbo so the plus stays readable", () => {
  assert.match(webglSource, /entry\.group\.rotation\.y = Math\.sin\(phase \* 1\.45\) \* 0\.11/);
  assert.match(webglSource, /entry\.group\.rotation\.y = phase \* 2\.15/);
  assert.match(webglSource, /entry\.halo\.rotation\.z \+= safeDelta \* 0\.55/);
  assert.match(webglSource, /entry\.halo\.rotation\.z \+= safeDelta \* 2\.8/);
});

test("Canvas fallback repeats the same medical-plus versus lightning language", () => {
  assert.match(canvasSource, /Recovery: broad red rescue badge \+ unmistakable white medical plus/);
  assert.match(canvasSource, /Turbo: narrow cyan diamond with a white lightning bolt silhouette/);
  assert.match(canvasSource, /ctx\.fillRect\(-0\.22 \* scale, -0\.62 \* scale, 0\.44 \* scale, 1\.24 \* scale\)/);
  assert.match(canvasSource, /ctx\.lineTo\(0\.42 \* scale, -0\.2 \* scale\)/);
});

test("Phase99 is presentation-only and loaded before audit wrappers", () => {
  assert.doesNotMatch(webglSource, /resources\.push|new CartResource|gas\s*[+\-]=|boostCharges\s*[+\-]=|TextureLoader/);
  const phase99 = runtimeSource.indexOf('import "./CartRoguePhase99ResourceReadability"');
  const gameplayAudit = runtimeSource.indexOf('import "./CartGameplayAuditRuntime"');
  assert.ok(phase99 >= 0);
  assert.ok(gameplayAudit > phase99);
});

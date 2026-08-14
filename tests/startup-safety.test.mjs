import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy WebGL runtime failures still recover into the inherited Canvas 3D renderer", async () => {
  const game = await readFile(new URL("../src/rally/RallyWebGLDemo.ts", import.meta.url), "utf8");
  assert.match(game, /webglcontextlost/);
  assert.match(game, /handleRuntimeFailure/);
  assert.match(game, /runtimeFailureReported/);
  assert.match(game, /window\.cancelAnimationFrame/);
  assert.match(game, /this\.input\.clear\(\)/);
  assert.match(game, /new RallyCanvasPreview/);
  assert.match(game, /recovered with Canvas 3D fallback/);
  assert.match(game, /failIfMajorPerformanceCaveat:\s*false/);
});

test("Cart Rogue WebGL reports context loss and render failures instead of leaving a black screen", async () => {
  const webgl = await readFile(new URL("../src/cart/CartRogueWebGLDemo.ts", import.meta.url), "utf8");
  assert.match(webgl, /webglcontextlost/);
  assert.match(webgl, /failIfMajorPerformanceCaveat:\s*false/);
  assert.match(webgl, /this\.onRuntimeFailure\(message, error\)/);
  assert.match(webgl, /catch \(error\) \{\s*this\.fail/);
  assert.match(webgl, /cancelAnimationFrame\(this\.frameId\)/);
});

test("Cart Rogue app has initialization/runtime Canvas fallback and safe touch ownership release", async () => {
  const page = await readFile(new URL("../app/CartRogueGame.tsx", import.meta.url), "utf8");
  assert.match(page, /new CartRogueCanvasPreview/);
  assert.match(page, /new CartRogueWebGLDemo/);
  assert.match(page, /onPointerCancel=\{releaseSteer\}/);
  assert.match(page, /onLostPointerCapture=\{releaseSteer\}/);
  assert.match(page, /onPointerCancel=\{releaseBoost\}/);
  assert.match(page, /onLostPointerCapture=\{releaseBoost\}/);
  assert.match(page, /onPointerCancel=\{releaseBrake\}/);
  assert.match(page, /onLostPointerCapture=\{releaseBrake\}/);
});

test("Cart Rogue boost vibration respects the versioned vibration preference", async () => {
  const page = await readFile(new URL("../app/CartRogueGame.tsx", import.meta.url), "utf8");
  assert.match(page, /loadRallySettings\(\)/);
  assert.match(page, /settings\.vibrationEnabled && ["']vibrate["'] in navigator/);
  assert.match(page, /navigator\.vibrate\?\.\(10\)/);
});

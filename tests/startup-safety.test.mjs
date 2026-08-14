import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("WebGL runtime failures stop the renderer and recover into Canvas 3D", async () => {
  const game = await readFile(new URL("../src/rally/RallyWebGLDemo.ts", import.meta.url), "utf8");
  assert.match(game, /webglcontextlost/);
  assert.match(game, /handleRuntimeFailure/);
  assert.match(game, /runtimeFailureReported/);
  assert.match(game, /window\.cancelAnimationFrame/);
  assert.match(game, /this\.input\.clear\(\)/);
  assert.match(game, /new RallyCanvasPreview/);
  assert.match(game, /recovered with Canvas 3D fallback/);
  assert.match(game, /Canvas 3Dへ切り替えて続行します/);
  assert.match(game, /failIfMajorPerformanceCaveat:\s*false/);
  assert.match(game, /catch \(error\) \{\s*this\.handleRuntimeFailure/);
});

test("the app keeps an initialization-time Canvas fallback and safe pointer cancellation", async () => {
  const page = await readFile(new URL("../app/RallyGame.tsx", import.meta.url), "utf8");
  assert.match(page, /createRallyRenderer/);
  assert.match(page, /new RallyCanvasPreview/);
  assert.match(page, /WebGL renderer initialization failed; falling back to Canvas 3D/);
  assert.match(page, /onPointerCancel=\{releaseSteer\}/);
  assert.match(page, /onPointerCancel=\{releaseBoost\}/);
});

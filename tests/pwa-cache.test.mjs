import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PWA service worker prefers fresh navigation HTML and retires old Voxel Rally caches", async () => {
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(worker, /const CACHE_PREFIX = ["']voxel-rally-["'];/);
  assert.match(worker, /const CACHE_VERSION = ["']v3["'];/);
  assert.doesNotMatch(worker, /voxel-rally-v1/);
  assert.match(worker, /event\.request\.mode === ["']navigate["']/);
  assert.match(worker, /fetch\(event\.request, \{ cache: ["']no-store["'] \}\)/);
  assert.match(worker, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.match(worker, /self\.skipWaiting\(\)/);
  assert.match(worker, /self\.clients\.claim\(\)/);
});

test("client registration bypasses the browser's service-worker script cache and requests an update", async () => {
  const app = await readFile(new URL("../app/RallyGame.tsx", import.meta.url), "utf8");
  assert.match(app, /updateViaCache:\s*["']none["']/);
  assert.match(app, /registration\.update\(\)/);
  assert.match(app, /controllerchange/);
});

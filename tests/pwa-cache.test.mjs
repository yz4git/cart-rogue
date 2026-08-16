import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PWA service worker prefers fresh navigation HTML and retires old Voxel Rally caches", async () => {
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(worker, /const CACHE_PREFIX = ["']voxel-rally-["'];/);
  assert.match(worker, /const CACHE_VERSION = ["']v7["'];/);
  assert.doesNotMatch(worker, /voxel-rally-v1/);
  assert.match(worker, /event\.request\.mode === ["']navigate["']/);
  assert.match(worker, /fetch\(event\.request, \{ cache: ["']no-store["'] \}\)/);
  assert.match(worker, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.match(worker, /self\.skipWaiting\(\)/);
  assert.match(worker, /self\.clients\.claim\(\)/);
});

test("Cart Rogue client registration bypasses the service-worker script cache and requests an update", async () => {
  const app = await readFile(new URL("../app/ServiceWorkerRegistration.tsx", import.meta.url), "utf8");
  assert.match(app, /updateViaCache:\s*["']none["']/);
  assert.match(app, /registration\.update\(\)/);
  assert.match(app, /controllerchange/);
});

test("Cart Rogue PWA manifest requests fullscreen landscape play with a standalone fallback", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.name, "Cart Rogue");
  assert.equal(manifest.display, "fullscreen");
  assert.deepEqual(manifest.display_override, ["fullscreen", "standalone"]);
  assert.equal(manifest.orientation, "landscape");
});

test("iPhone web-app metadata uses edge-to-edge layout and Apple standalone capability", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /viewportFit:\s*["']cover["']/);
  assert.match(layout, /appleWebApp:\s*\{/);
  assert.match(layout, /capable:\s*true/);
  assert.match(layout, /statusBarStyle:\s*["']black-translucent["']/);
});

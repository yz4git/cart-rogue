import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { collectCartRenderDiagnostics } from "../src/cart/CartRenderDiagnostics";

const phase35Source = readFileSync(new URL("../src/cart/CartRoguePhase35MosaicDiorama.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");

function addBucket(root: THREE.Group, name: string): void {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    1,
  );
  mesh.name = name;
  root.add(mesh);
}

function addAuditCamera(scene: THREE.Scene): void {
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 100);
  camera.name = "audit-chase-camera";
  camera.position.set(0, 6.7, 0);
  scene.add(camera);
}

test("render diagnostics recognize one visible final ground and hidden legacy layers", () => {
  const scene = new THREE.Scene();
  addAuditCamera(scene);
  const finalGround = new THREE.Group();
  finalGround.name = "phase46-safe-ground-pattern";
  scene.add(finalGround);
  for (let index = 0; index < 5; index += 1) addBucket(finalGround, `phase46-ground-meadow-${index}`);
  addBucket(finalGround, "phase46-wear-meadow");

  for (const name of ["phase34-floor-detail", "phase35-road-mosaic", "phase38-reliable-road-mosaic"]) {
    const legacy = new THREE.Group();
    legacy.name = name;
    legacy.visible = false;
    scene.add(legacy);
  }

  const diagnostics = collectCartRenderDiagnostics(scene);
  assert.equal(diagnostics.ok, true);
  assert.equal(diagnostics.finalGround.visible, true);
  assert.equal(diagnostics.finalGroundBucketCount, 5);
  assert.equal(diagnostics.finalWearBucketCount, 1);
  assert.equal(diagnostics.camera.exists, true);
  assert.equal(diagnostics.camera.path, "audit-chase-camera");
  assert.equal(diagnostics.camera.fov, 55);
  assert.ok((diagnostics.camera.y ?? 0) > 6.6);
  assert.deepEqual(diagnostics.issues, []);
});

test("render diagnostics reject a visible legacy road even if the final ground exists", () => {
  const scene = new THREE.Scene();
  addAuditCamera(scene);
  const finalGround = new THREE.Group();
  finalGround.name = "phase46-safe-ground-pattern";
  scene.add(finalGround);
  for (let index = 0; index < 5; index += 1) addBucket(finalGround, `phase46-ground-meadow-${index}`);
  addBucket(finalGround, "phase46-wear-meadow");

  const legacy = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  legacy.name = "phase35-road-mosaic";
  scene.add(legacy);

  const diagnostics = collectCartRenderDiagnostics(scene);
  assert.equal(diagnostics.ok, false);
  assert.ok(diagnostics.issues.some((issue) => issue.includes("phase35-road-mosaic")));
});

test("runtime has one road authority: Phase 35 is roadside-only and Phase 38 is not installed", () => {
  assert.doesNotMatch(phase35Source, /buildRoadTiles/);
  assert.doesNotMatch(phase35Source, /phase35-road-mosaic/);
  assert.doesNotMatch(runtimeSource, /import "\.\/CartRoguePhase38ReliableMosaic"/);
  assert.match(runtimeSource, /import "\.\/CartRoguePhase46GroundPatternRecovery"/);
});

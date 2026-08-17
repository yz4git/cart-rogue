import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { collectCartRenderDiagnostics } from "../src/cart/CartRenderDiagnostics";
import { buildCartEnvironmentRichness } from "../src/cart/CartRoguePhase80EnvironmentRichness";

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

function addValidGround(scene: THREE.Scene): void {
  const finalGround = new THREE.Group();
  finalGround.name = "phase46-safe-ground-pattern";
  scene.add(finalGround);
  for (let index = 0; index < 5; index += 1) addBucket(finalGround, `phase46-ground-meadow-${index}`);
  addBucket(finalGround, "phase46-wear-meadow");
}

test("render diagnostics recognize one visible final ground and hidden legacy layers", () => {
  const scene = new THREE.Scene();
  addAuditCamera(scene);
  addValidGround(scene);

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
  addValidGround(scene);

  const legacy = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  legacy.name = "phase35-road-mosaic";
  scene.add(legacy);

  const diagnostics = collectCartRenderDiagnostics(scene);
  assert.equal(diagnostics.ok, false);
  assert.ok(diagnostics.issues.some((issue) => issue.includes("phase35-road-mosaic")));
});

test("render diagnostics validate the repaired Phase80 color and layering contract", () => {
  const scene = new THREE.Scene();
  addAuditCamera(scene);
  addValidGround(scene);
  buildCartEnvironmentRichness(scene);

  const diagnostics = collectCartRenderDiagnostics(scene);
  assert.equal(diagnostics.ok, true);
  assert.equal(diagnostics.environmentRichness.visible, true);
  assert.equal(diagnostics.environmentInstanceColorMeshCount, 0);
  assert.equal(diagnostics.environmentSafeColorPipeline, "fixed-material-buckets");
  assert.ok((diagnostics.environmentSurfaceY ?? 0) > 0);
  assert.ok((diagnostics.environmentRoadRhythmY ?? 0) > (diagnostics.environmentSurfaceY ?? 0));
  assert.ok(diagnostics.environmentRenderableMeshCount >= 10);
});

test("render diagnostics reject Phase80 if static instanceColor returns", () => {
  const scene = new THREE.Scene();
  addAuditCamera(scene);
  addValidGround(scene);

  const root = new THREE.Group();
  root.name = "phase80-environment-richness";
  root.userData.environmentRichness = {
    safeColorPipeline: "fixed-material-buckets",
    surfaceY: 0.006,
    roadRhythmY: 0.014,
  };
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true }),
    1,
  );
  mesh.name = "phase80-regression-probe";
  mesh.setColorAt(0, new THREE.Color(0x88cc88));
  root.add(mesh);
  scene.add(root);

  const diagnostics = collectCartRenderDiagnostics(scene);
  assert.equal(diagnostics.ok, false);
  assert.equal(diagnostics.environmentInstanceColorMeshCount, 1);
  assert.ok(diagnostics.issues.some((issue) => issue.includes("Phase80 contains unsafe instanceColor")));
  assert.ok(diagnostics.riskyStaticInstanceColorMeshes.some((path) => path.includes("phase80-regression-probe")));
});

test("render diagnostics expose durable Turbo attack visual evidence for sparse headless sampling", () => {
  const scene = new THREE.Scene();
  addAuditCamera(scene);
  addValidGround(scene);

  const attack = new THREE.Group();
  attack.name = "phase54-turbo-attack-frame";
  attack.visible = false;
  attack.userData.cartTurboAttackMode = "idle";
  attack.userData.cartTurboAttackIntensity = 0;
  attack.userData.cartTurboAttackSerial = 4;
  attack.userData.cartTurboAttackObservedAttackSerial = 4;
  attack.userData.cartTurboAttackPeakIntensity = 0.94;
  scene.add(attack);

  const diagnostics = collectCartRenderDiagnostics(scene);
  assert.equal(diagnostics.turboAttackFrame?.exists, true);
  assert.equal(diagnostics.turboAttackFrame?.visible, false);
  assert.equal(diagnostics.turboAttackSerial, 4);
  assert.equal(diagnostics.turboAttackObservedAttackSerial, 4);
  assert.equal(diagnostics.turboAttackPeakIntensity, 0.94);
});

test("runtime has one road authority: Phase 35 is roadside-only and Phase 38 is not installed", () => {
  assert.doesNotMatch(phase35Source, /buildRoadTiles/);
  assert.doesNotMatch(phase35Source, /phase35-road-mosaic/);
  assert.doesNotMatch(runtimeSource, /import "\.\/CartRoguePhase38ReliableMosaic"/);
  assert.match(runtimeSource, /import "\.\/CartRoguePhase46GroundPatternRecovery"/);
});
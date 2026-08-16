import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { applyCartPerFaceVertexColor } from "../src/cart/CartRoguePhase39VertexColorPipeline";

const pipelineSource = readFileSync(new URL("../src/cart/CartRoguePhase39VertexColorPipeline.ts", import.meta.url), "utf8");
const repairSource = readFileSync(new URL("../src/cart/CartRoguePhase42StaticInstanceColorRepair.ts", import.meta.url), "utf8");
const architectureSource = readFileSync(new URL("../src/cart/CartRoguePhase43ArchitectureVertexColors.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");

test("Phase 39 per-face vertex colors keep every triangle flat-colored", () => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 1, 3),
    new THREE.MeshStandardMaterial({ color: 0x42bdb7, flatShading: true }),
  );
  const changed = applyCartPerFaceVertexColor(mesh, {
    variance: 0.06,
    topLift: 1.14,
    sideShade: 0.94,
    bottomShade: 0.76,
    seed: 9,
  });
  assert.equal(changed, true);
  assert.equal(mesh.geometry.index, null, "face colors require independent triangle vertices");
  const colors = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
  assert.ok(colors);
  const material = mesh.material as THREE.MeshStandardMaterial;
  assert.equal(material.vertexColors, true);
  assert.equal(material.flatShading, true);

  for (let face = 0; face + 2 < colors.count; face += 3) {
    for (let channel = 0; channel < 3; channel += 1) {
      const getter = channel === 0 ? "getX" : channel === 1 ? "getY" : "getZ";
      const a = colors[getter](face);
      const b = colors[getter](face + 1);
      const c = colors[getter](face + 2);
      assert.ok(Math.abs(a - b) < 1e-7 && Math.abs(a - c) < 1e-7, "a triangle must use one face color, not a gradient");
    }
  }
});

test("Phases 39-41 cover static world, hero and enemy meshes", () => {
  assert.match(pipelineSource, /phase39VertexColoredMeshes/);
  assert.match(pipelineSource, /phase40VertexColoredMeshes/);
  assert.match(pipelineSource, /phase41VertexColoredMeshes/);
  assert.match(pipelineSource, /buildEnemyVehicle/);
});

test("Phase 42 replaces known static instance-color scenery with fixed-color buckets", () => {
  assert.match(repairSource, /phase19-target-art-world/);
  assert.match(repairSource, /phase19-near-garden-polish/);
  assert.match(repairSource, /phase19-reference-ground-cover/);
  assert.match(repairSource, /phase35-mosaic-diorama/);
  assert.match(repairSource, /source\.visible = false/);
  assert.match(repairSource, /new THREE\.InstancedMesh/);
  assert.match(repairSource, /vertexColors = false/);
});

test("Phase 43 colors architecture while excluding emissive structures", () => {
  assert.match(architectureSource, /STONE_COLORS/);
  assert.match(architectureSource, /RED_ARCHITECTURE/);
  assert.match(architectureSource, /DARK_ARCHITECTURE/);
  assert.match(architectureSource, /emissiveIntensity > 0\.25/);
});

test("vertex-color phases load after Phase 37 while the superseded Phase 38 road is retired", () => {
  const phase37 = appSource.indexOf("CartRoguePhase37MosaicColorPass");
  const phase39 = appSource.indexOf("CartRoguePhase39VertexColorPipeline");
  const phase42 = appSource.indexOf("CartRoguePhase42StaticInstanceColorRepair");
  const phase43 = appSource.indexOf("CartRoguePhase43ArchitectureVertexColors");
  assert.ok(phase37 >= 0);
  assert.ok(phase39 > phase37);
  assert.ok(phase42 > phase39);
  assert.ok(phase43 > phase42);
  assert.doesNotMatch(appSource, /import "\.\/CartRoguePhase38ReliableMosaic"/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CART_TOY_ENEMY_ROLE_COLORS,
  CART_TOY_HERO_SHELL_PARTS,
  CART_TOY_SHAPE_PASS,
  CART_TOY_WORLD_LANDMARK_COUNT,
} from "../src/cart/CartRoguePhase101ToyShapePass";

const phase101Source = readFileSync(new URL("../src/cart/CartRoguePhase101ToyShapePass.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");

test("Phase101 gives hero and each enemy role a distinct chunky toy silhouette contract", () => {
  assert.equal(CART_TOY_HERO_SHELL_PARTS, 9);
  assert.equal(new Set(Object.values(CART_TOY_ENEMY_ROLE_COLORS)).size, 4);
  assert.match(phase101Source, /HERO_CHUNKY_TOY_MECHA/);
  assert.match(phase101Source, /TITAN_CHUNKY_TOY_MECHA/);
  assert.match(phase101Source, /ENEMY_\$\{enemy\.kind\.toUpperCase\(\)\}_TOY/);
  assert.match(phase101Source, /CHUNKY_CARTOON_BOULDER/);
  assert.match(phase101Source, /DodecahedronGeometry/);
  assert.match(phase101Source, /SphereGeometry/);
});

test("toy industrial landmarks are static, bounded and share three instanced draw calls", () => {
  assert.equal(CART_TOY_WORLD_LANDMARK_COUNT, 6);
  assert.match(phase101Source, /staticInstancedDrawCalls = 3/);
  assert.equal((phase101Source.match(/new THREE\.InstancedMesh/g) ?? []).length, 3);
  assert.match(phase101Source, /THREE\.StaticDrawUsage/);
  assert.doesNotMatch(phase101Source, /setColorAt|instanceColor/);
});

test("Phase101 is build-time presentation only and does not add per-frame shape work", () => {
  assert.match(phase101Source, /shared-geometry-fixed-entity-shells-static-landmarks/);
  assert.doesNotMatch(phase101Source, /updateVisuals|animate\(|requestAnimationFrame|session\.step|session\.advance/);
  assert.doesNotMatch(phase101Source, /TextureLoader|EffectComposer|OutlinePass|SSAOPass|UnrealBloomPass/);
});

test("Phase101 keeps gameplay geometry authoritative while adding visual shells", () => {
  assert.match(phase101Source, /group\.add\(shell\)/);
  assert.match(phase101Source, /demo\.playerVisual\.add\(shell\)/);
  assert.doesNotMatch(phase101Source, /enemy\.radius\s*=|obstacle\.radius\s*=|enemy\.x\s*=|enemy\.z\s*=|obstacle\.x\s*=|obstacle\.z\s*=/);
  assert.equal(CART_TOY_SHAPE_PASS, "toy-mecha-casual-shape-v1");
});

test("Phase101 installs after Phase100 and before gameplay/render audit wrappers", () => {
  const phase100Import = runtimeSource.indexOf('import "./CartRoguePhase100CasualAnimeWorld";');
  const phase101Import = runtimeSource.indexOf('import "./CartRoguePhase101ToyShapePass";');
  const gameplayAuditImport = runtimeSource.indexOf('import "./CartGameplayAuditRuntime";');
  const renderAuditImport = runtimeSource.indexOf('import "./CartRenderAuditRuntime";');
  assert.ok(phase100Import >= 0);
  assert.ok(phase101Import > phase100Import);
  assert.ok(gameplayAuditImport > phase101Import);
  assert.ok(renderAuditImport > phase101Import);
});

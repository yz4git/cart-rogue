import assert from "node:assert/strict";
import test from "node:test";
import "../src/cart/CartRogueRuntime";
import { CartArenaSession, type CartArenaSessionSnapshot } from "../src/cart/CartArenaSession";
import { CartGameplayAuditRecorder } from "../src/cart/CartGameplayAudit";
import type { CartRenderDiagnostics } from "../src/cart/CartRenderDiagnostics";

function enemy(id: string, alive = true) {
  return {
    id,
    nodeId: "arena-01",
    kind: "blocker" as const,
    x: 0,
    z: 0,
    radius: 1,
    hp: alive ? 10 : 0,
    maxHp: 10,
    alive,
    heading: 0,
  };
}

function snapshot(overrides: Partial<CartArenaSessionSnapshot> = {}): CartArenaSessionSnapshot {
  const enemies = overrides.enemies ?? [enemy("e1"), enemy("e2")];
  return {
    nodeId: "arena-01",
    nodeKind: "arena",
    encounter: "combat",
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    gas: 1,
    boostCharges: 4,
    maxBoostCharges: 4,
    boostActive: false,
    turboRechargeProgress: 1,
    turboRechargeSeconds: 0,
    enemiesAlive: enemies.filter((candidate) => candidate.alive).length,
    enemiesTotal: enemies.length,
    gateLocked: true,
    arena1GateLocked: true,
    arena2GateLocked: true,
    ramCombo: 0,
    lastRamEnemyId: null,
    lastRamDamage: 0,
    lastReward: null,
    wallSliding: false,
    bossHp: 0,
    bossMaxHp: 0,
    runComplete: false,
    enemies,
    resources: [{ id: "gas-1", nodeId: "arena-01", kind: "gas", x: 0, z: 0, radius: 1, collected: false }],
    obstacles: [{ id: "rock-1", nodeId: "arena-01", kind: "rock", x: 1, z: 1, radius: 1, scale: 1, variant: 0, destroyed: false }],
    ...overrides,
  };
}

function healthyRenderDiagnostics(): CartRenderDiagnostics {
  return {
    ok: true,
    issues: [],
    visibleMeshCount: 8000,
    visibleInstancedMeshCount: 150,
    visibleInstanceColorMeshes: [],
    riskyStaticInstanceColorMeshes: [],
    finalGround: { exists: true, visible: true },
    finalGroundBucketCount: 25,
    finalWearBucketCount: 5,
    legacyGround: {},
    stationaryTurboSkids: { exists: true, visible: true },
    stationaryTurboSkidActiveCount: 2,
    exitGuide: { exists: true, visible: false },
    compactUndertray: { exists: true, visible: true },
    heroPresentationPitch: 0,
    heroPresentationRoll: 0,
    camera: { exists: true, path: "camera", fov: 55.2, y: 6.72 },
  };
}

test("Phase 52 gameplay audit records motion, Turbo, wall contact, RAM, kills and transitions", () => {
  const recorder = new CartGameplayAuditRecorder();
  recorder.record(snapshot(), 0.5);
  recorder.record(snapshot({
    z: 5,
    speed: 10,
    gas: 0.9,
    boostCharges: 3,
    boostActive: true,
    wallSliding: true,
    ramCombo: 1,
    lastRamEnemyId: "e1",
    lastRamDamage: 12,
  }), 0.5, { boostRequested: true });
  recorder.record(snapshot({
    nodeId: "corridor-01",
    nodeKind: "corridor",
    encounter: "none",
    z: 10,
    speed: 12,
    gas: 0.86,
    boostCharges: 3,
    enemies: [enemy("e1", false), enemy("e2")],
    enemiesAlive: 0,
    enemiesTotal: 0,
    gateLocked: false,
  }), 0.5);

  const report = recorder.report(healthyRenderDiagnostics());
  assert.equal(report.ok, true);
  assert.equal(report.sampleCount, 3);
  assert.equal(report.durationSeconds, 0.75, "per-frame audit delta is intentionally clamped to 250ms");
  assert.equal(report.distance, 10);
  assert.equal(report.maxSpeed, 12);
  assert.ok(Math.abs(report.averageSpeed - 22 / 3) < 1e-9);
  assert.equal(report.turboRequestedSeconds, 0.25);
  assert.equal(report.turboActiveSeconds, 0.25);
  assert.equal(report.turboActivations, 1);
  assert.equal(report.wallSlideSeconds, 0.25);
  assert.equal(report.wallSlideEvents, 1);
  assert.equal(report.ramEvents, 1);
  assert.equal(report.enemyKills, 1);
  assert.equal(report.nodeTransitions, 1);
  assert.deepEqual(report.visitedNodes, ["arena-01", "corridor-01"]);
  assert.equal(report.authored?.enemies, 2);
  assert.equal(report.authored?.resources, 1);
  assert.equal(report.authored?.obstacles, 1);
  assert.equal(report.render?.finalGroundBucketCount, 25);
  assert.equal(report.render?.riskyStaticInstanceColorCount, 0);
});

test("Phase 52 audit remains read-only against the final wrapped driving runtime", () => {
  const session = new CartArenaSession();
  const recorder = new CartGameplayAuditRecorder();
  const drive = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
  try {
    for (const obstacle of session.obstacles) obstacle.destroyed = true;
    for (const enemyState of session.enemies) enemyState.alive = false;
    recorder.record(session.snapshot(), 1 / 60);
    for (let frame = 0; frame < 120; frame += 1) {
      session.step(drive);
      recorder.record(session.snapshot(), 1 / 60);
    }

    const report = recorder.report();
    assert.equal(report.ok, true);
    assert.equal(report.sampleCount, 121);
    assert.ok(report.durationSeconds > 2 && report.durationSeconds < 2.1);
    assert.ok(report.distance > 5, `audit should observe real travel, got ${report.distance}`);
    assert.ok(report.averageSpeed > 2, `audit should observe meaningful speed, got ${report.averageSpeed}`);
    assert.ok(report.maxSpeed <= 19.7, `final wrapped runtime speed should stay bounded, got ${report.maxSpeed}`);
    assert.ok(report.visitedNodes.includes("arena-01"));
  } finally {
    session.dispose();
  }
});

test("Phase 52 report surfaces unhealthy render diagnostics without mutating gameplay data", () => {
  const recorder = new CartGameplayAuditRecorder();
  recorder.record(snapshot({ speed: 7 }), 1 / 60);
  const render = healthyRenderDiagnostics();
  render.ok = false;
  render.issues = ["synthetic render failure"];
  const report = recorder.report(render);
  assert.equal(report.ok, false);
  assert.ok(report.issues.includes("render diagnostics are not healthy"));
  assert.equal(report.maxSpeed, 7);
});

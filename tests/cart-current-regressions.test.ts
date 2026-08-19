import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import {
  CART_ROGUE_CAMERA_DISTANCE_MAX,
  CART_ROGUE_CAMERA_DISTANCE_MIN,
  DEFAULT_CART_ROGUE_CONFIG,
  parseCartRogueConfig,
} from "../src/cart/CartRogueConfig";
import {
  CART_PHASE103_TITAN_HP_MULTIPLIER,
  CART_PHASE103_TITAN_MAX_HP,
  retireRebuiltLegacyGroundLayers,
  scaleCartTitanHpForPhase103,
} from "../src/cart/CartRoguePhase103ConfigBalance";

const menuRuntimeSource = readFileSync(new URL("../src/cart/CartGameMenuRuntime.ts", import.meta.url), "utf8");
const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;
const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

test("Cart Rogue uses the slightly slower normal speed caps", () => {
  const session = new CartArenaSession();
  try {
    assert.equal(session.car.definition.maxSpeed, 20);

    for (const enemy of session.enemies.filter((candidate) => candidate.nodeId === "arena-01")) enemy.alive = false;
    session.car.position.x = 0;
    session.car.position.z = 72;
    session.car.forwardVelocity = 0;
    session.step(IDLE);
    assert.equal(session.snapshot().nodeId, "corridor-01");
    assert.equal(session.car.definition.maxSpeed, 24);
  } finally {
    session.dispose();
  }
});

test("a freshly activated Turbo dash damages an enemy even before reaching the old RAM speed threshold", () => {
  const session = new CartArenaSession();
  try {
    const enemy = session.enemies.find((candidate) => candidate.id === "enemy-a")!;
    session.car.position.x = enemy.x;
    session.car.position.z = enemy.z - 0.2;
    session.car.heading = 0;
    session.car.forwardVelocity = 0;

    session.step({ ...DRIVE, boost: true });

    assert.equal(session.snapshot().boostActive, true);
    assert.ok(enemy.hp < enemy.maxHp, `fresh Turbo contact should damage enemy-a, got ${enemy.hp}/${enemy.maxHp}`);
    assert.equal(session.snapshot().lastRamEnemyId, "enemy-a");
    assert.ok(session.snapshot().lastRamDamage > 0);
  } finally {
    session.dispose();
  }
});

test("Cart Rogue camera config preserves the current view by default and allows a sixty percent farther view", () => {
  assert.equal(DEFAULT_CART_ROGUE_CONFIG.cameraDistance, 1);
  assert.equal(CART_ROGUE_CAMERA_DISTANCE_MIN, 1);
  assert.equal(CART_ROGUE_CAMERA_DISTANCE_MAX, 1.6);
  assert.equal(parseCartRogueConfig({ cameraDistance: 1.45 }).cameraDistance, 1.45);
  assert.equal(parseCartRogueConfig({ cameraDistance: 99 }).cameraDistance, 1.6);
  assert.equal(parseCartRogueConfig({ cameraDistance: -4 }).cameraDistance, 1);
  assert.match(menuRuntimeSource, /CartRoguePhase103ConfigBalance/);
});

test("Phase103 gives RAM TITAN ten times the live Boss 2.0 health while preserving current damage ratio", () => {
  assert.equal(CART_PHASE103_TITAN_HP_MULTIPLIER, 10);
  assert.equal(CART_PHASE103_TITAN_MAX_HP, 8200);
  const boss = { kind: "boss", alive: true, hp: 410, maxHp: 820 };
  assert.equal(scaleCartTitanHpForPhase103(boss), true);
  assert.equal(boss.maxHp, 8200);
  assert.equal(boss.hp, 4100);
  assert.equal(scaleCartTitanHpForPhase103(boss), false, "boss HP must not multiply again on later frames");
});

test("Phase103 retires legacy road patterns again after a second world build without hiding Phase46", () => {
  const scene = new THREE.Scene();
  const phase34 = new THREE.Group();
  const phase35 = new THREE.Group();
  const phase38 = new THREE.Group();
  const phase46 = new THREE.Group();
  phase34.name = "phase34-floor-detail";
  phase35.name = "phase35-road-mosaic";
  phase38.name = "phase38-reliable-road-mosaic";
  phase46.name = "phase46-safe-ground-pattern";
  scene.add(phase34, phase35, phase38, phase46);

  assert.equal(retireRebuiltLegacyGroundLayers(scene), 3);
  assert.equal(phase34.visible, false);
  assert.equal(phase35.visible, false);
  assert.equal(phase38.visible, false);
  assert.equal(phase38.position.y, -20);
  assert.equal(phase46.visible, true);
});

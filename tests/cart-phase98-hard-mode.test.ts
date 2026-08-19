import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "../src/cart/CartRogueRuntime";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import {
  getCartRunDifficulty,
  setCartRunDifficulty,
} from "../src/cart/CartRunDifficulty";
import { enableCartTurboHunt } from "../src/cart/CartRoguePhase67TurboHunt";
import {
  CART_RAID_HAZARD_MAX_ACTIVE,
  CART_RAID_HAZARD_MIN_LOCK_SECONDS,
} from "../src/cart/CartRoguePhase88RaidHazards";
import {
  CART_HARD_MAX_INTEGRITY,
  CART_HARD_OPENING_GRACE_SECONDS,
  CART_HARD_PRESSURE_FOLLOW_SECONDS,
  CART_HARD_PRESSURE_INTERVAL_SECONDS,
  CART_HARD_PRESSURE_MAX_EXISTING,
  CART_HARD_PRESSURE_TELEGRAPH_SECONDS,
  cartHardDefeatReason,
  cartHardIntegrityAfterHits,
  cartHardPressurePattern,
  getCartHardModeState,
} from "../src/cart/CartRoguePhase98HardMode";

const runtimeSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");
const menuSource = readFileSync(new URL("../app/CartGameMenu.tsx", import.meta.url), "utf8");
const phaseSource = readFileSync(new URL("../src/cart/CartRoguePhase98HardMode.ts", import.meta.url), "utf8");
const idle = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

test("Hard Mode is a three-major-hit defeat instead of an enemy HP inflation switch", () => {
  assert.equal(CART_HARD_MAX_INTEGRITY, 3);
  assert.equal(cartHardIntegrityAfterHits(3, 1), 2);
  assert.equal(cartHardIntegrityAfterHits(2, 1), 1);
  assert.equal(cartHardIntegrityAfterHits(1, 1), 0);
  assert.equal(cartHardDefeatReason(0, 0.8, false), "HULL");
  assert.equal(cartHardDefeatReason(2, 0, false), "GAS");
  assert.equal(cartHardDefeatReason(0, 0, true), null);
  assert.doesNotMatch(phaseSource, /enemy\.hp\s*\*=|maxHp\s*\*=/);
});

test("Hard Mode pressure is aggressive but remains telegraphed and inside the fixed four-slot raid pool", () => {
  assert.ok(CART_HARD_OPENING_GRACE_SECONDS >= 2);
  assert.ok(CART_HARD_PRESSURE_INTERVAL_SECONDS <= 2.8);
  assert.ok(CART_HARD_PRESSURE_TELEGRAPH_SECONDS >= 0.9);
  assert.ok(
    CART_HARD_PRESSURE_TELEGRAPH_SECONDS - CART_HARD_PRESSURE_FOLLOW_SECONDS
      >= CART_RAID_HAZARD_MIN_LOCK_SECONDS,
  );
  assert.ok(CART_HARD_PRESSURE_MAX_EXISTING + 1 <= CART_RAID_HAZARD_MAX_ACTIVE);

  const patterns = Array.from({ length: 4 }, (_, serial) => cartHardPressurePattern(serial));
  assert.deepEqual(patterns.map((pattern) => pattern.kind), ["LINE", "CIRCLE", "CROSS", "DONUT"]);
  assert.equal(new Set(patterns.map((pattern) => pattern.label)).size, 4);
  for (const pattern of patterns) {
    assert.equal(pattern.telegraphSeconds, CART_HARD_PRESSURE_TELEGRAPH_SECONDS);
    assert.equal(pattern.followCarSeconds, CART_HARD_PRESSURE_FOLLOW_SECONDS);
    assert.ok(pattern.followForward >= 10);
  }
});

test("difficulty is captured per run and NORMAL keeps the Hard defeat system inactive", () => {
  setCartRunDifficulty("hard");
  assert.equal(getCartRunDifficulty(), "hard");
  const hardSession = new CartArenaSession();
  enableCartTurboHunt(hardSession);
  hardSession.step(idle, 0.05);
  const hard = getCartHardModeState(hardSession);
  assert.equal(hard.hardMode, true);
  assert.equal(hard.integrity, 3);
  assert.equal(hard.gameOver, false);

  setCartRunDifficulty("normal");
  const normalSession = new CartArenaSession();
  enableCartTurboHunt(normalSession);
  normalSession.step(idle, 0.05);
  const normal = getCartHardModeState(normalSession);
  assert.equal(normal.hardMode, false);
  assert.equal(normal.integrity, 3);
  assert.equal(normal.gameOver, false);
});

test("title offers NORMAL and HARD, warns about the failure rules, and supports Hard retry", () => {
  assert.match(menuSource, />NORMAL</);
  assert.match(menuSource, />HARD</);
  assert.match(menuSource, /3 MAJOR HITS OR ZERO GAS = GAME OVER/);
  assert.match(menuSource, /START HARD RUN/);
  assert.match(menuSource, /RETRY HARD/);
  assert.match(menuSource, /BACK TO TITLE/);
});

test("Phase98 installs after adaptive counterread and before audit wrappers", () => {
  const counterreadImport = runtimeSource.indexOf('import "./CartRoguePhase97AdaptiveCounterread"');
  const hardImport = runtimeSource.indexOf('import "./CartRoguePhase98HardMode"');
  const gameplayAuditImport = runtimeSource.indexOf('import "./CartGameplayAuditRuntime"');
  assert.ok(counterreadImport >= 0);
  assert.ok(hardImport > counterreadImport);
  assert.ok(gameplayAuditImport > hardImport);
  const historicalOrder = runtimeSource.slice(runtimeSource.indexOf("CART_ROGUE_RUNTIME_PHASE_ORDER"));
  assert.doesNotMatch(historicalOrder, /CartRoguePhase98HardMode/);
});

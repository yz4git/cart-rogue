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
  CART_HARD_PLAYER_DAMAGE_GAS_LOSS_PERCENT,
  CART_PLAYER_DAMAGE_GAS_LOSS_PERCENT,
  cartGasLifeAfterDamage,
  cartRaidGasLifeDamagePercent,
} from "../src/cart/CartRoguePhase91DamageFeedback2";
import {
  CART_HARD_OPENING_GRACE_SECONDS,
  CART_HARD_PRESSURE_FOLLOW_SECONDS,
  CART_HARD_PRESSURE_INTERVAL_SECONDS,
  CART_HARD_PRESSURE_MAX_EXISTING,
  CART_HARD_PRESSURE_TELEGRAPH_SECONDS,
  cartGasLifeDefeatReason,
  cartGasLifePercent,
  cartHardPressurePattern,
  getCartHardModeState,
} from "../src/cart/CartRoguePhase98HardMode";

const runtimeSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");
const menuSource = readFileSync(new URL("../app/CartGameMenu.tsx", import.meta.url), "utf8");
const hudSource = readFileSync(new URL("../app/CartTurboHuntHudOverlay.tsx", import.meta.url), "utf8");
const phaseSource = readFileSync(new URL("../src/cart/CartRoguePhase98HardMode.ts", import.meta.url), "utf8");
const damageSource = readFileSync(new URL("../src/cart/CartRoguePhase91DamageFeedback2.ts", import.meta.url), "utf8");
const arenaSource = readFileSync(new URL("../src/cart/CartArenaSession.ts", import.meta.url), "utf8");
const idle = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

test("GAS is the single life resource in both NORMAL and HARD", () => {
  assert.equal(CART_PLAYER_DAMAGE_GAS_LOSS_PERCENT, 8);
  assert.equal(CART_HARD_PLAYER_DAMAGE_GAS_LOSS_PERCENT, 34);
  assert.equal(cartRaidGasLifeDamagePercent("normal"), 8);
  assert.equal(cartRaidGasLifeDamagePercent("hard"), 34);

  let hardGas = 1;
  hardGas = cartGasLifeAfterDamage(hardGas, cartRaidGasLifeDamagePercent("hard"));
  assert.ok(Math.abs(hardGas - 0.66) < 1e-9);
  hardGas = cartGasLifeAfterDamage(hardGas, cartRaidGasLifeDamagePercent("hard"));
  assert.ok(Math.abs(hardGas - 0.32) < 1e-9);
  hardGas = cartGasLifeAfterDamage(hardGas, cartRaidGasLifeDamagePercent("hard"));
  assert.equal(hardGas, 0);

  assert.equal(cartGasLifeDefeatReason(0, false), "GAS");
  assert.equal(cartGasLifeDefeatReason(0.01, false), null);
  assert.equal(cartGasLifeDefeatReason(0, true), null);
  assert.equal(cartGasLifePercent(0.42), 42);

  assert.doesNotMatch(phaseSource, /integrity|maxIntegrity|HULL|CART_HARD_MAX_INTEGRITY/);
  assert.doesNotMatch(menuSource, /HULL/);
  assert.doesNotMatch(hudSource, /HULL/);
  assert.match(damageSource, /gasSession\.gas = cartGasLifeAfterDamage/);
});

test("GAS recovery remains the same system that now restores life", () => {
  assert.match(arenaSource, /this\.gas = Math\.min\(1, this\.gas \+ 0\.12\)/);
  assert.match(arenaSource, /GAS CELL · \+12%/);
  assert.match(arenaSource, /const gasReward = contact\.kind === "boss"/);
  assert.match(menuSource, /GAS = LIFE/);
  assert.match(menuSource, /RECOVERY CELLS RESTORE GAS/);
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

test("difficulty is captured per run while both modes share GAS life", () => {
  setCartRunDifficulty("hard");
  assert.equal(getCartRunDifficulty(), "hard");
  const hardSession = new CartArenaSession();
  enableCartTurboHunt(hardSession);
  hardSession.step(idle, 0.05);
  const hard = getCartHardModeState(hardSession);
  assert.equal(hard.hardMode, true);
  assert.equal(hard.gasLifePercent, 100);
  assert.equal(hard.gameOver, false);

  setCartRunDifficulty("normal");
  const normalSession = new CartArenaSession();
  enableCartTurboHunt(normalSession);
  normalSession.step(idle, 0.05);
  const normal = getCartHardModeState(normalSession);
  assert.equal(normal.hardMode, false);
  assert.equal(normal.gasLifePercent, 100);
  assert.equal(normal.gameOver, false);
});

test("title and game over UI explain the unified GAS life rule", () => {
  assert.match(menuSource, />NORMAL</);
  assert.match(menuSource, />HARD</);
  assert.match(menuSource, /GAS = LIFE/);
  assert.match(menuSource, /ZERO GAS = GAME OVER/);
  assert.match(menuSource, /HARD RAID HITS DEAL HEAVY LIFE DAMAGE/);
  assert.match(menuSource, /GAS EMPTY · LIFE LOST/);
  assert.match(menuSource, /RETRY HARD/);
  assert.match(menuSource, /RETRY RUN/);
  assert.match(menuSource, /BACK TO TITLE/);
  assert.match(hudSource, /LIFE\/GAS/);
});

test("Phase98 installs after damage feedback and adaptive counterread and before audit wrappers", () => {
  const damageImport = runtimeSource.indexOf('import "./CartRoguePhase91DamageFeedback2"');
  const counterreadImport = runtimeSource.indexOf('import "./CartRoguePhase97AdaptiveCounterread"');
  const hardImport = runtimeSource.indexOf('import "./CartRoguePhase98HardMode"');
  const gameplayAuditImport = runtimeSource.indexOf('import "./CartGameplayAuditRuntime"');
  assert.ok(damageImport >= 0);
  assert.ok(counterreadImport > damageImport);
  assert.ok(hardImport > counterreadImport);
  assert.ok(gameplayAuditImport > hardImport);
  const historicalOrder = runtimeSource.slice(runtimeSource.indexOf("CART_ROGUE_RUNTIME_PHASE_ORDER"));
  assert.doesNotMatch(historicalOrder, /CartRoguePhase98HardMode/);
});

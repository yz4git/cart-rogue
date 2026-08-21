import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CART_PHASE111_MAX_TRANSIENT_VOICES,
  cartPhase111AudioMix,
  cartPhase111ChainPitch,
} from "../src/cart/CartRoguePhase111AudioOverdrive";

const phase111Source = readFileSync(new URL("../src/cart/CartRoguePhase111AudioOverdrive.ts", import.meta.url), "utf8");
const menuRuntimeSource = readFileSync(new URL("../src/cart/CartGameMenuRuntime.ts", import.meta.url), "utf8");

test("Audio Overdrive raises engine/turbo energy with speed, boost and HEAT", () => {
  const idle = cartPhase111AudioMix(0, false, 1);
  const fast = cartPhase111AudioMix(22, false, 3);
  const turbo = cartPhase111AudioMix(22, true, 5);
  assert.ok(fast.engineFrequency > idle.engineFrequency);
  assert.ok(fast.engineGain > idle.engineGain);
  assert.ok(turbo.engineFrequency > fast.engineFrequency);
  assert.ok(turbo.turboGain > fast.turboGain);
  assert.ok(turbo.pulseSeconds < fast.pulseSeconds);
});

test("Phase111.1 keeps continuous engine and Turbo below the transient headroom ceiling", () => {
  const fast = cartPhase111AudioMix(26, false, 5);
  const turbo = cartPhase111AudioMix(26, true, 5);
  assert.ok(fast.engineGain <= 0.018);
  assert.ok(turbo.engineGain <= 0.02);
  assert.ok(turbo.turboGain <= 0.01);
  assert.ok(turbo.engineFilterFrequency <= 1100);
  assert.ok(turbo.musicGain > turbo.turboGain);
});

test("Paused audio mix silences continuous channels", () => {
  const paused = cartPhase111AudioMix(24, true, 5, true);
  assert.equal(paused.engineGain, 0);
  assert.equal(paused.turboGain, 0);
  assert.equal(paused.musicGain, 0);
});

test("Chain pitch climbs while transient voice count stays bounded", () => {
  assert.ok(cartPhase111ChainPitch(6) > cartPhase111ChainPitch(2));
  assert.ok(cartPhase111ChainPitch(99) <= cartPhase111ChainPitch(10));
  assert.ok(CART_PHASE111_MAX_TRANSIENT_VOICES <= 16);
});

test("Phase111 unlocks iPhone audio from interaction and reacts to core combat states", () => {
  assert.match(phase111Source, /webkitAudioContext/);
  assert.match(phase111Source, /context\.resume\(\)/);
  assert.match(phase111Source, /getCartPlayerDamageFeedbackState/);
  assert.match(phase111Source, /getCartTurboDominoState/);
  assert.match(phase111Source, /"HUNTED"/);
  assert.match(phase111Source, /"COUNTERATTACK"/);
  assert.match(phase111Source, /"TITAN"/);
  assert.match(phase111Source, /cueRam/);
  assert.match(phase111Source, /cueSmash/);
  assert.match(phase111Source, /cueDamage/);
  assert.match(phase111Source, /createBiquadFilter/);
  assert.match(phase111Source, /engineFilter/);
});

test("Audio Overdrive covers both WebGL and Canvas fallback and composes after Phase110", () => {
  assert.match(phase111Source, /CartRogueWebGLDemo\.prototype/);
  assert.match(phase111Source, /CartRogueCanvasPreview\.prototype/);
  const phase110 = menuRuntimeSource.indexOf('import "./CartRoguePhase110TurboDominoCoreLoop";');
  const phase111 = menuRuntimeSource.indexOf('import "./CartRoguePhase111AudioOverdrive";');
  assert.ok(phase110 >= 0);
  assert.ok(phase111 > phase110);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CART_ANIME_CUTIN_MAX_PENDING,
  CART_ANIME_CUTIN_SYSTEM,
  CART_CUTIN_EVENTS,
  CART_FACE_EDITOR_BUNDLE_FORMAT,
  advanceCartCutinQueue,
  createCartCutinQueueState,
  enqueueCartCutin,
  registerCartCutinFaceEditorBundle,
  type CartFaceEditorCharacterBundle,
} from "../src/cart/CartRoguePhase102AnimeCutin";
import {
  CART_CUTIN_OPERATOR_MIX_SHARE,
  CART_CUTIN_SPEAKER_CYCLES,
  cartCutinSpeakerVariant,
  resetCartCutinSpeakerMix,
  rotateCartCutinSpeaker,
} from "../src/cart/CartRoguePhase102OperatorMix";

const phase102Source = readFileSync(new URL("../src/cart/CartRoguePhase102AnimeCutin.ts", import.meta.url), "utf8");
const operatorMixSource = readFileSync(new URL("../src/cart/CartRoguePhase102OperatorMix.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");
const gameplayAuditRuntimeSource = readFileSync(new URL("../src/cart/CartGameplayAuditRuntime.ts", import.meta.url), "utf8");

function minimalFaceEditorBundle(): CartFaceEditorCharacterBundle {
  return {
    format: "face-editor-polygon-character",
    formatVersion: 1,
    expressions: { active: "serious" },
    mesh: {
      version: 1,
      bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
      layers: [{
        id: "face",
        zIndex: 1,
        positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
        colors: [1, 0.8, 0.7, 1, 0.8, 0.7, 1, 0.8, 0.7],
        indices: [0, 1, 2],
      }],
    },
  };
}

test("Phase102 uses the Face Editor CharacterBundle polygon contract with image fallback support", () => {
  const bundle = minimalFaceEditorBundle();
  assert.equal(CART_FACE_EDITOR_BUNDLE_FORMAT, "face-editor-polygon-character");
  assert.equal(registerCartCutinFaceEditorBundle("driver", bundle), true);
  assert.equal(registerCartCutinFaceEditorBundle("operator", { ...bundle, formatVersion: 2 as 1 }), false);
  assert.match(phase102Source, /positions: number\[\]/);
  assert.match(phase102Source, /colors: number\[\]/);
  assert.match(phase102Source, /indices: number\[\]/);
  assert.match(phase102Source, /kind: "image"/);
  assert.match(phase102Source, /renderCartFaceEditorBundleToCanvas/);
});

test("cut-in priority can interrupt lower priority while TITAN remains non-interruptible", () => {
  const state = createCartCutinQueueState();
  assert.equal(enqueueCartCutin(state, CART_CUTIN_EVENTS.turbo_start, 1000), "shown");
  assert.equal(state.active?.id, "turbo_start");
  assert.equal(enqueueCartCutin(state, CART_CUTIN_EVENTS.hard_critical, 1100), "interrupted");
  assert.equal(state.active?.id, "hard_critical");

  advanceCartCutinQueue(state, 5000);
  assert.equal(enqueueCartCutin(state, CART_CUTIN_EVENTS.titan_spawn, 6000), "shown");
  assert.equal(state.active?.interruptible, false);
  const result = enqueueCartCutin(state, { ...CART_CUTIN_EVENTS.titan_spawn, id: "low_life", priority: 120 }, 6100);
  assert.equal(result, "queued");
  assert.equal(state.active?.id, "titan_spawn");
});

test("same event respects cooldown and pending queue stays bounded", () => {
  const state = createCartCutinQueueState();
  assert.equal(enqueueCartCutin(state, CART_CUTIN_EVENTS.perfect_dodge, 100), "shown");
  assert.equal(enqueueCartCutin(state, CART_CUTIN_EVENTS.perfect_dodge, 200), "cooldown");
  assert.equal(enqueueCartCutin(state, CART_CUTIN_EVENTS.turbo_start, 210), "queued");
  assert.equal(enqueueCartCutin(state, CART_CUTIN_EVENTS.recovery, 220), "queued");
  assert.equal(state.pending.length, CART_ANIME_CUTIN_MAX_PENDING);
  assert.equal(enqueueCartCutin(state, CART_CUTIN_EVENTS.run_start, 230), "dropped");
});

test("operator-heavy speaker mix rotates through player moments without randomness", () => {
  resetCartCutinSpeakerMix();
  assert.ok(CART_CUTIN_OPERATOR_MIX_SHARE > 0.7);
  assert.equal(CART_CUTIN_SPEAKER_CYCLES.perfect_dodge.length, 3);
  assert.equal(CART_CUTIN_SPEAKER_CYCLES.perfect_dodge.filter((variant) => variant.characterId === "operator").length, 2);
  assert.equal(CART_CUTIN_SPEAKER_CYCLES.turbo_start.filter((variant) => variant.characterId === "operator").length, 3);
  assert.equal(CART_CUTIN_SPEAKER_CYCLES.low_life.filter((variant) => variant.characterId === "operator").length, 2);

  assert.equal(cartCutinSpeakerVariant("perfect_dodge").characterId, "operator");
  assert.equal(rotateCartCutinSpeaker("perfect_dodge").characterId, "driver");
  assert.equal(rotateCartCutinSpeaker("perfect_dodge").characterId, "operator");
  assert.equal(rotateCartCutinSpeaker("perfect_dodge").characterId, "operator");

  resetCartCutinSpeakerMix();
  assert.equal(CART_CUTIN_EVENTS.run_start.characterId, "operator");
  assert.equal(CART_CUTIN_EVENTS.low_life.characterId, "operator");
  assert.equal(CART_CUTIN_EVENTS.perfect_dodge.characterId, "operator");
  assert.equal(CART_CUTIN_EVENTS.turbo_start.characterId, "operator");
  assert.equal(CART_CUTIN_EVENTS.recovery.characterId, "operator");
  assert.doesNotMatch(operatorMixSource, /Math\.random/);
  assert.match(gameplayAuditRuntimeSource, /CartRoguePhase102OperatorMix/);
});

test("Phase102 wires gameplay moments without pausing or adding a render-loop workload", () => {
  assert.equal(CART_ANIME_CUTIN_SYSTEM, "anime-cutin-face-editor-compatible-v1");
  assert.match(phase102Source, /huntBossSpawned/);
  assert.match(phase102Source, /perfectDodgeSerial/);
  assert.match(phase102Source, /resource\.kind === "gas"/);
  assert.match(phase102Source, /snapshot\.boostActive && !previous\.boostActive/);
  assert.match(phase102Source, /snapshot\.gas <= 0\.34/);
  assert.match(phase102Source, /snapshot\.gas <= 0\.3/);
  assert.doesNotMatch(phase102Source, /\.pause\(|session\.step\(|requestAnimationFrame|THREE\./);
  assert.doesNotMatch(operatorMixSource, /requestAnimationFrame|THREE\./);
});

test("iPhone landscape cut-in is safe-area aware and does not own touch input", () => {
  assert.match(phase102Source, /env\(safe-area-inset-top\)/);
  assert.match(phase102Source, /env\(safe-area-inset-right\)/);
  assert.match(phase102Source, /env\(safe-area-inset-left\)/);
  assert.match(phase102Source, /pointer-events:none/);
  assert.match(phase102Source, /@media\(max-height:360px\)/);
  assert.match(phase102Source, /aria-live/);
});

test("Phase102 is installed after visual Phase101 and before gameplay/render audit wrappers", () => {
  const phase101Import = runtimeSource.indexOf('import "./CartRoguePhase101ToyShapePass";');
  const phase102Import = runtimeSource.indexOf('import "./CartRoguePhase102AnimeCutin";');
  const gameplayAuditImport = runtimeSource.indexOf('import "./CartGameplayAuditRuntime";');
  const renderAuditImport = runtimeSource.indexOf('import "./CartRenderAuditRuntime";');
  assert.ok(phase101Import >= 0);
  assert.ok(phase102Import > phase101Import);
  assert.ok(gameplayAuditImport > phase102Import);
  assert.ok(renderAuditImport > phase102Import);
});

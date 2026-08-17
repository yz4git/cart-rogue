import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "../src/cart/CartRogueRuntime";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import {
  cartTurboAttackReleaseKick,
  cartTurboAttackWindowSeconds,
  getCartTurboAttackState,
} from "../src/cart/CartRoguePhase54TurboAttack";

const HOLD = { throttle: 1, brake: 0, steer: 0.5, boost: true } as const;
const RELEASE = { throttle: 1, brake: 0, steer: 0.5, boost: false } as const;
const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;
const visualSource = readFileSync(new URL("../src/cart/CartTurboAttackVisual.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");

function isolate(session: CartArenaSession): void {
  for (const obstacle of session.obstacles) obstacle.destroyed = true;
  for (const enemy of session.enemies) {
    enemy.alive = false;
    enemy.moveSpeed = 0;
  }
  session.car.position.set(0, session.car.position.y, 28);
  session.car.heading = 0;
  session.car.forwardVelocity = 0;
  session.car.lateralVelocity = 0;
}

test("Phase 54 Turbo attack timing and release kick scale monotonically with charge", () => {
  const lowWindow = cartTurboAttackWindowSeconds(0);
  const fullWindow = cartTurboAttackWindowSeconds(1);
  const lowKick = cartTurboAttackReleaseKick(0);
  const fullKick = cartTurboAttackReleaseKick(1);
  assert.equal(lowWindow, 0.26);
  assert.ok(fullWindow >= 0.43 && fullWindow <= 0.45);
  assert.ok(fullWindow > lowWindow);
  assert.equal(lowKick, 0.35);
  assert.equal(fullKick, 1.1);
  assert.ok(fullKick > lowKick);
});

test("Phase 54 turns a charged Turbo release into one bounded offensive attack window", () => {
  const session = new CartArenaSession();
  try {
    isolate(session);
    const initialStocks = session.car.boostCharges;
    for (let frame = 0; frame < 52; frame += 1) session.step(HOLD);

    const charged = getCartTurboAttackState(session);
    assert.ok(charged.mode === "charging" || charged.mode === "ready");
    assert.ok(charged.charge >= 0.95, `charge should be near full, got ${charged.charge}`);
    assert.equal(session.car.boostCharges, initialStocks, "holding still must not spend a Turbo stock");

    const serialBefore = charged.serial;
    session.step(RELEASE);
    const attack = getCartTurboAttackState(session);
    assert.equal(attack.mode, "attack");
    assert.equal(attack.serial, serialBefore + 1);
    assert.ok(attack.charge >= 0.95);
    assert.ok(attack.attackDuration >= 0.43 && attack.attackDuration <= 0.45);
    assert.ok(attack.attackSecondsRemaining > 0.4);
    assert.ok(attack.intensity >= 0.85);
    assert.equal(session.car.boostActive, true, "release attack should coincide with the real Turbo dash");
    assert.equal(session.car.boostCharges, initialStocks - 1, "release should spend exactly one stock");

    for (let frame = 0; frame < 32; frame += 1) session.step(IDLE);
    const expired = getCartTurboAttackState(session);
    assert.notEqual(expired.mode, "attack", "attack window must expire instead of lasting for the whole boost");
  } finally {
    session.dispose();
  }
});

test("Phase 54 presentation exposes a dedicated charge/ready/attack frame without textures", () => {
  assert.match(visualSource, /phase54-turbo-attack-frame/);
  assert.match(visualSource, /cartTurboAttackMode/);
  assert.match(visualSource, /CHARGE_COLOR/);
  assert.match(visualSource, /READY_COLOR/);
  assert.match(visualSource, /ATTACK_COLOR/);
  assert.doesNotMatch(visualSource, /TextureLoader|\.map\s*=|CanvasTexture/);
  assert.match(runtimeSource, /CartRoguePhase54TurboAttack/);
  assert.match(runtimeSource, /CartTurboAttackVisual/);
  assert.ok(
    runtimeSource.indexOf("CartRoguePhase54TurboAttack") > runtimeSource.indexOf("CartRoguePhase53Handling2"),
    "Turbo 2.0 must run after final Handling 2.0 shaping",
  );
});

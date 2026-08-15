import test from "node:test";
import assert from "node:assert/strict";
import { cartHeroSurfaceMotion } from "../src/cart/CartRoguePhase28HeroSurface";
import { cartSurfaceLifeStrength } from "../src/cart/CartRoguePhase29SurfaceLife";
import { cartEnemyBreakupIntensity } from "../src/cart/CartRoguePhase30EnemyBreakup";
import { cartBossAtmosphereStrength } from "../src/cart/CartRoguePhase31BossAtmosphere";
import { cartNearCameraParticleStrength } from "../src/cart/CartRoguePhase32NearCameraParticles";

test("Phase 28 hero surface motion scales with speed, steering and boost", () => {
  const idle = cartHeroSurfaceMotion(0, 0, false);
  assert.equal(idle.compression, 0.12);
  assert.equal(idle.roll, 0);
  assert.equal(idle.glow, 0.2);

  const fast = cartHeroSurfaceMotion(24, 1, true);
  assert.ok(fast.compression >= 0.87);
  assert.equal(fast.roll, 1);
  assert.equal(fast.glow, 1);
});

test("Phase 29 terrain response wakes up for maneuvers and stationary Turbo pivot", () => {
  assert.equal(cartSurfaceLifeStrength(0, 0, false, false), 0);
  assert.ok(cartSurfaceLifeStrength(12, 0.7, false, false) > 0.5);
  assert.ok(cartSurfaceLifeStrength(0, 0, false, true) >= 0.7);
  assert.equal(cartSurfaceLifeStrength(24, 1, true, true), 1);
});

test("Phase 30 breakup intensity rises as enemy HP falls", () => {
  assert.equal(cartEnemyBreakupIntensity(100, 100), 0);
  const damaged = cartEnemyBreakupIntensity(50, 100);
  assert.ok(damaged > 0.28 && damaged < 0.29);
  assert.equal(cartEnemyBreakupIntensity(0, 100), 1);
});

test("Phase 31 boss atmosphere ramps through approach corridor into boss arena", () => {
  assert.equal(cartBossAtmosphereStrength("arena-01", 24, true), 0);
  assert.equal(cartBossAtmosphereStrength("corridor-02", 0, false), 0.45);
  assert.equal(cartBossAtmosphereStrength("boss-01", 0, false), 1);
  assert.equal(cartBossAtmosphereStrength("boss-01", 24, true), 1);
});

test("Phase 32 near-camera particles remain quiet at low speed and intensify with Turbo", () => {
  assert.equal(cartNearCameraParticleStrength(4, false), 0);
  assert.ok(cartNearCameraParticleStrength(24, false) > 0.7);
  assert.equal(cartNearCameraParticleStrength(4, true), 0.4);
  assert.equal(cartNearCameraParticleStrength(24, true), 1);
});

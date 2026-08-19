import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import {
  CART_RAID_INTERCEPT_MAX_LEAD,
  CART_RAID_INTERCEPT_MIN_LEAD,
  cartRaidDonutInterceptLead,
  cartRaidInterceptLead,
} from "../src/cart/CartRaidHazardIntercept";
import { CART_ROGUE_RUNTIME_PHASE_ORDER } from "../src/cart/CartRogueRuntime";
import { enableCartTurboHunt } from "../src/cart/CartRoguePhase67TurboHunt";
import { queueCartRaidHazard } from "../src/cart/CartRoguePhase88RaidHazards";
import {
  CART_PLAYER_DAMAGE_FLASH_SECONDS,
  CART_PLAYER_DAMAGE_GAS_LOSS_PERCENT,
  CART_PLAYER_DAMAGE_SPEED_LOSS_PERCENT,
  getCartPlayerDamageFeedbackState,
} from "../src/cart/CartRoguePhase91DamageFeedback2";

const phase89Source = readFileSync(new URL("../src/cart/CartRoguePhase89HazardCombatDirector.ts", import.meta.url), "utf8");
const phase90Source = readFileSync(new URL("../src/cart/CartRoguePhase90TitanRaidBoss4.ts", import.meta.url), "utf8");
const phase91Source = readFileSync(new URL("../src/cart/CartRoguePhase91DamageFeedback2.ts", import.meta.url), "utf8");
const hudSource = readFileSync(new URL("../app/CartTurboHuntHudOverlay.tsx", import.meta.url), "utf8");
const hudCss = readFileSync(new URL("../app/CartTurboHuntHudOverlay.module.css", import.meta.url), "utf8");
const idleInput = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

function car(speed: number, boostActive = false) {
  return { forwardVelocity: speed, speed, boostActive };
}

test("forward intercept lead scales with speed and stays bounded", () => {
  const slow = cartRaidInterceptLead(car(0), 1.5, 0.58, 4.4);
  const fast = cartRaidInterceptLead(car(20), 1.5, 0.58, 4.4);
  const boosted = cartRaidInterceptLead(car(20, true), 1.5, 0.58, 4.4);
  assert.ok(slow >= CART_RAID_INTERCEPT_MIN_LEAD);
  assert.ok(fast > slow);
  assert.ok(boosted > fast);
  assert.ok(boosted <= CART_RAID_INTERCEPT_MAX_LEAD);
});

test("continuing straight intersects predicted circle and line danger instead of outrunning it", () => {
  const telegraphSeconds = 1.5;
  const followSeconds = 0.58;
  const lockWindow = telegraphSeconds - followSeconds;
  for (const speed of [0, 6, 12, 18, 24]) {
    const lead = cartRaidInterceptLead(car(speed), telegraphSeconds, followSeconds, 4.4);
    const straightArrival = speed * lockWindow;
    const longitudinalMiss = Math.abs(lead - straightArrival);
    assert.ok(longitudinalMiss < 11.4, `circle should catch straight speed ${speed}: miss=${longitudinalMiss}`);
    assert.ok(longitudinalMiss < 16, `line should catch straight speed ${speed}: miss=${longitudinalMiss}`);
  }
});

test("donut targeting puts straight-line arrival in the dangerous ring across Turbo Hunt speeds", () => {
  const telegraphSeconds = 1.62;
  const followSeconds = 0.58;
  const lockWindow = telegraphSeconds - followSeconds;
  for (const speed of [0, 6, 12, 18, 24]) {
    const lead = cartRaidDonutInterceptLead(car(speed), telegraphSeconds, followSeconds);
    const distanceFromCenterAtFire = Math.abs(lead - speed * lockWindow);
    assert.ok(distanceFromCenterAtFire >= 5.5, `donut inner-safe leak at ${speed}m/s: ${distanceFromCenterAtFire}`);
    assert.ok(distanceFromCenterAtFire <= 15.4, `donut outrun at ${speed}m/s: ${distanceFromCenterAtFire}`);
  }
});

test("field and Titan tracking attacks both use predictive lead rather than tiny current-position offsets", () => {
  assert.match(phase89Source, /cartRaidInterceptLead\(session\.car/);
  assert.match(phase89Source, /cartRaidDonutInterceptLead\(session\.car/);
  assert.match(phase90Source, /cartRaidInterceptLead\(session\.car/);
  assert.match(phase90Source, /cartRaidDonutInterceptLead\(session\.car/);
  assert.doesNotMatch(phase89Source, /followForward:\s*4\b/);
  assert.doesNotMatch(phase89Source, /followForward:\s*7\b/);
});

test("raid hits trigger a visible GAS-life damage state and structural impact without becoming instant death", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  const gasBefore = session.gas;
  queueCartRaidHazard(session, {
    kind: "CIRCLE",
    label: "DAMAGE TEST",
    radius: 8,
    telegraphSeconds: 0.8,
  });
  let feedback = getCartPlayerDamageFeedbackState(session);
  for (let index = 0; index < 28 && feedback.hitSerial === 0; index += 1) {
    session.step(idleInput, 0.05);
    feedback = getCartPlayerDamageFeedbackState(session);
  }
  assert.equal(feedback.hitSerial, 1);
  assert.equal(feedback.active, true);
  assert.ok(feedback.flashSeconds > 0 && feedback.flashSeconds <= CART_PLAYER_DAMAGE_FLASH_SECONDS);
  assert.equal(feedback.gasLossPercent, CART_PLAYER_DAMAGE_GAS_LOSS_PERCENT);
  assert.equal(feedback.speedLossPercent, CART_PLAYER_DAMAGE_SPEED_LOSS_PERCENT);
  assert.ok(session.gas < gasBefore && session.gas >= 0);
  assert.ok(session.car.bodyDamage >= 0.1 && session.car.bodyDamage < 1);
  assert.match(session.lastReward ?? "", /DIRECT HIT · LIFE\/GAS -8% · SPEED BREAK/);
});

test("damage feedback reuses existing camera flash and spark systems and adds a strong HUD hit layer", () => {
  assert.match(phase91Source, /cameraShake = Math\.max/);
  assert.match(phase91Source, /impactFlash = Math\.max/);
  assert.match(phase91Source, /emitImpactSparks/);
  assert.match(phase91Source, /0xff1238/);
  assert.doesNotMatch(phase91Source, /new THREE\.InstancedMesh|TextureLoader|setColorAt|instanceColor/);
  assert.match(hudSource, /DIRECT HIT/);
  assert.match(hudSource, /LIFE\/GAS/);
  assert.match(hudSource, /damageOverlay/);
  assert.match(hudCss, /damageScreenFlash/);
  assert.match(hudCss, /damageBurstKick/);
});

test("damage feedback remains before forced dodge and escape gameplay wrappers", () => {
  const phase90 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase90TitanRaidBoss4");
  const phase91 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase91DamageFeedback2");
  const phase93 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase93ForcedDodgeTrajectory2");
  const phase94 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase94EscapeRhythmDirector2");
  assert.ok(phase91 > phase90);
  assert.ok(phase93 > phase91);
  assert.ok(phase94 > phase93);
  assert.equal(CART_ROGUE_RUNTIME_PHASE_ORDER.at(-1), "CartRoguePhase94EscapeRhythmDirector2");
});

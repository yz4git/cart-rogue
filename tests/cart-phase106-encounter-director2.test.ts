import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "../src/cart/CartGameMenuRuntime";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import {
  cartEncounterAllowsChaseStart,
  getCartEncounterDirectorGatePolicy,
  setCartEncounterDirectorGatePolicy,
} from "../src/cart/CartEncounterDirectorGate";
import { enableCartTurboHunt } from "../src/cart/CartRoguePhase67TurboHunt";
import {
  CART_ENCOUNTER_LOW_GAS_MERCY_LOCKOUT_SECONDS,
  CART_ENCOUNTER_LOW_GAS_THRESHOLD,
  CART_ENCOUNTER_OPENING_SECONDS,
  cartEncounterBeatDuration,
  cartEncounterBeatPolicy,
  cartEncounterTimedNextBeat,
  getCartEncounterDirectorState,
} from "../src/cart/CartRoguePhase106EncounterDirector2";

const source = readFileSync(new URL("../src/cart/CartRoguePhase106EncounterDirector2.ts", import.meta.url), "utf8");
const gateSource = readFileSync(new URL("../src/cart/CartEncounterDirectorGate.ts", import.meta.url), "utf8");
const pursuitSource = readFileSync(new URL("../src/cart/CartRoguePhase85PursuitEvents.ts", import.meta.url), "utf8");
const pressureSource = readFileSync(new URL("../src/cart/CartRoguePhase87ThreatPressure2.ts", import.meta.url), "utf8");
const raidSource = readFileSync(new URL("../src/cart/CartRoguePhase89HazardCombatDirector.ts", import.meta.url), "utf8");
const escapeSource = readFileSync(new URL("../src/cart/CartRoguePhase94EscapeRhythmDirector2.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/cart/CartGameMenuRuntime.ts", import.meta.url), "utf8");
const idle = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

test("Phase106 defines a readable pressure-dodge-counter rhythm", () => {
  assert.equal(cartEncounterTimedNextBeat("OPENING"), "PRESSURE");
  assert.equal(cartEncounterTimedNextBeat("PRESSURE"), "DODGE");
  assert.equal(cartEncounterTimedNextBeat("DODGE"), "COUNTER");
  assert.equal(cartEncounterTimedNextBeat("COUNTER"), "PRESSURE");
  assert.equal(cartEncounterTimedNextBeat("CHASE"), "COUNTER");
  assert.equal(cartEncounterTimedNextBeat("RECOVERY"), "PRESSURE");
  assert.equal(CART_ENCOUNTER_OPENING_SECONDS, 3);
});

test("a live fixed-step run reaches the first DODGE beat instead of stalling in PRESSURE", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  let sawPressure = false;
  let sawDodge = false;
  for (let frame = 0; frame < 60 * 9; frame += 1) {
    session.step(idle, 1 / 60);
    const encounter = getCartEncounterDirectorState(session);
    if (encounter.beat === "PRESSURE") sawPressure = true;
    if (encounter.beat === "DODGE") {
      sawDodge = true;
      break;
    }
  }
  const final = getCartEncounterDirectorState(session);
  assert.equal(sawPressure, true);
  assert.equal(sawDodge, true, `expected DODGE within 9 fixed seconds, got ${final.beat} with ${final.secondsRemaining.toFixed(3)}s remaining`);
  assert.ok(final.transitionCount >= 2);
});

test("counter and recovery are real safety windows rather than UI-only labels", () => {
  const normalCounter = cartEncounterBeatPolicy("COUNTER", "normal");
  const hardCounter = cartEncounterBeatPolicy("COUNTER", "hard");
  const recovery = cartEncounterBeatPolicy("RECOVERY", "normal");
  assert.equal(normalCounter.allowFieldHazards, false);
  assert.equal(recovery.allowFieldHazards, false);
  assert.equal(normalCounter.commitCap, 1);
  assert.equal(recovery.commitCap, 1);
  assert.ok(normalCounter.attackCooldownFloor > hardCounter.attackCooldownFloor);
  assert.ok(recovery.attackCooldownFloor >= 1);
  assert.match(source, /cancelCartRaidHazards\(session as unknown as CartArenaSession, "FIELD"\)/);
  assert.match(source, /enemy\.chargeTime = 0/);
  assert.match(source, /enemy\.chargeCooldown = Math\.max/);
});

test("PRESSURE owns enemy waves while DODGE owns new FIELD RAID scheduling", () => {
  assert.equal(cartEncounterBeatPolicy("PRESSURE", "normal").allowFieldHazards, false);
  assert.equal(cartEncounterBeatPolicy("DODGE", "normal").allowFieldHazards, true);
  assert.match(source, /allowThreatPressure: state\.beat === "PRESSURE"/);
  assert.match(source, /allowFieldRaid: state\.beat === "DODGE"/);
  assert.match(pressureSource, /cartEncounterAllowsThreatPressure\(session\)/);
  assert.match(raidSource, /cartEncounterAllowsFieldRaid\(session\)/);
});

test("first cycle reaches DODGE before Pursuit or Escape may start", () => {
  const session = new CartArenaSession();
  assert.equal(cartEncounterAllowsChaseStart(session), true);

  setCartEncounterDirectorGatePolicy(session, {
    allowThreatPressure: true,
    allowFieldRaid: false,
  });
  assert.equal(cartEncounterAllowsChaseStart(session), false);

  setCartEncounterDirectorGatePolicy(session, {
    allowThreatPressure: false,
    allowFieldRaid: true,
  });
  assert.equal(cartEncounterAllowsChaseStart(session), false);

  setCartEncounterDirectorGatePolicy(session, {
    allowThreatPressure: true,
    allowFieldRaid: false,
  });
  assert.equal(cartEncounterAllowsChaseStart(session), true);
  assert.match(pursuitSource, /cartEncounterAllowsChaseStart\(session\)/);
  assert.match(escapeSource, /cartEncounterAllowsChaseStart\(session\)/);
  assert.match(gateSource, /dodgeSeenBySession/);
});

test("director gate defaults preserve historical standalone phase behavior", () => {
  const session = new CartArenaSession();
  assert.deepEqual(getCartEncounterDirectorGatePolicy(session), {
    allowThreatPressure: true,
    allowFieldRaid: true,
    allowChaseStart: true,
  });
  setCartEncounterDirectorGatePolicy(session, {
    allowThreatPressure: false,
    allowFieldRaid: true,
    allowChaseStart: false,
  });
  assert.equal(getCartEncounterDirectorGatePolicy(session).allowThreatPressure, false);
  assert.equal(getCartEncounterDirectorGatePolicy(session).allowFieldRaid, true);
  assert.equal(getCartEncounterDirectorGatePolicy(session).allowChaseStart, false);
  assert.match(gateSource, /DEFAULT_POLICY/);
  assert.match(gateSource, /WeakMap<object, CartEncounterDirectorGatePolicy>/);
});

test("Hard raises thinking pressure but keeps shorter nonzero counter and recovery windows", () => {
  assert.ok(cartEncounterBeatDuration("PRESSURE", "hard") < cartEncounterBeatDuration("PRESSURE", "normal"));
  assert.ok(cartEncounterBeatDuration("COUNTER", "hard") > 1.5);
  assert.ok(cartEncounterBeatDuration("RECOVERY", "hard") > 1.7);
  assert.ok(cartEncounterBeatPolicy("DODGE", "hard").intensity > cartEncounterBeatPolicy("DODGE", "normal").intensity);
  assert.ok(cartEncounterBeatPolicy("PRESSURE", "hard").commitCap > cartEncounterBeatPolicy("PRESSURE", "normal").commitCap);
});

test("low GAS can request mercy but cannot pin the run in permanent recovery", () => {
  assert.equal(CART_ENCOUNTER_LOW_GAS_THRESHOLD, 0.24);
  assert.ok(CART_ENCOUNTER_LOW_GAS_MERCY_LOCKOUT_SECONDS >= 8);
  assert.match(source, /state\.lowGasMercyLockout <= 0/);
  assert.match(source, /state\.lowGasMercyLockout = CART_ENCOUNTER_LOW_GAS_MERCY_LOCKOUT_SECONDS/);
});

test("live encounter signals can preempt the timed rhythm after scheduling permits them", () => {
  assert.match(source, /boss\.bossActive/);
  assert.match(source, /hitNow \|\| pursuitLost/);
  assert.match(source, /perfectNow \|\| pursuitWon \|\| eventCleared/);
  assert.match(source, /escape\.active \|\| pursuit\.active/);
  assert.match(source, /"PLAYER HIT"/);
  assert.match(source, /"PERFECT DODGE"/);
  assert.match(source, /"FIELD EVENT CLEAR"/);
});

test("Phase106 stays outside the historical phase chain and wraps after Phase105", () => {
  const phase105 = runtimeSource.indexOf('import "./CartRoguePhase105EnemyIntelligenceBalance"');
  const phase106 = runtimeSource.indexOf('import "./CartRoguePhase106EncounterDirector2"');
  assert.ok(phase105 >= 0);
  assert.ok(phase106 > phase105);
  assert.doesNotMatch(source, /new THREE\.|WebGLRenderer|ShaderMaterial|EffectComposer/);
  assert.match(source, /WeakMap<object, EncounterDirectorState>/);
});

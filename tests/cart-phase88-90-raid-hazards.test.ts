import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { CART_ROGUE_RUNTIME_PHASE_ORDER } from "../src/cart/CartRogueRuntime";
import { enableCartTurboHunt } from "../src/cart/CartRoguePhase67TurboHunt";
import {
  CART_RAID_HAZARD_CONE_ANGLE,
  CART_RAID_HAZARD_LAYER_Y,
  CART_RAID_HAZARD_MAX_ACTIVE,
  CART_RAID_HAZARD_MIN_LOCK_SECONDS,
  CART_RAID_HAZARD_PERFECT_ESCAPE_WINDOW,
  cancelCartRaidHazards,
  cartPointInRaidHazard,
  cartRaidHazardArea,
  getCartRaidHazardState,
  queueCartRaidHazard,
  type CartRaidHazardPublicState,
} from "../src/cart/CartRoguePhase88RaidHazards";
import {
  CART_HAZARD_DIRECTOR_INITIAL_DELAY,
  CART_HAZARD_DIRECTOR_INTERVAL,
  cartHazardDirectorKindForSerial,
  getCartHazardCombatDirectorState,
} from "../src/cart/CartRoguePhase89HazardCombatDirector";
import {
  CART_TITAN_RAID_FURY_INTERVAL,
  cartTitanRaidPatternFor,
  getCartTitanRaidBossState,
} from "../src/cart/CartRoguePhase90TitanRaidBoss4";
import { getCartTitanPredatorState } from "../src/cart/CartRoguePhase86BossPredator";

const phase88Source = readFileSync(new URL("../src/cart/CartRoguePhase88RaidHazards.ts", import.meta.url), "utf8");
const phase89Source = readFileSync(new URL("../src/cart/CartRoguePhase89HazardCombatDirector.ts", import.meta.url), "utf8");
const phase90Source = readFileSync(new URL("../src/cart/CartRoguePhase90TitanRaidBoss4.ts", import.meta.url), "utf8");
const design = readFileSync(new URL("../docs/RAID_HAZARDS_88_90.md", import.meta.url), "utf8");
const idleInput = { throttle: 0, brake: 0, steer: 0, boost: false } as const;

function hazard(kind: CartRaidHazardPublicState["kind"], patch: Partial<CartRaidHazardPublicState> = {}): CartRaidHazardPublicState {
  return {
    id: 1,
    active: true,
    kind,
    source: "FIELD",
    label: kind,
    phase: "LOCKED",
    x: 0,
    z: 0,
    heading: 0,
    width: 8,
    length: 30,
    radius: 10,
    innerRadius: 5.4,
    outerRadius: 15,
    coneAngle: CART_RAID_HAZARD_CONE_ANGLE,
    secondsToFire: 1,
    telegraphSeconds: 1.4,
    locked: true,
    ...patch,
  };
}

test("raid hazard geometry gives five readable danger shapes", () => {
  assert.equal(cartPointInRaidHazard(hazard("LINE"), 0, 10), true);
  assert.equal(cartPointInRaidHazard(hazard("LINE"), 6, 0), false);
  assert.equal(cartPointInRaidHazard(hazard("CIRCLE"), 0, 9), true);
  assert.equal(cartPointInRaidHazard(hazard("CIRCLE"), 0, 11), false);
  assert.equal(cartPointInRaidHazard(hazard("CROSS", { width: 6 }), 10, 0), true);
  assert.equal(cartPointInRaidHazard(hazard("CROSS", { width: 6 }), 10, 10), false);
  assert.equal(cartPointInRaidHazard(hazard("CONE", { radius: 20 }), 0, 12), true);
  assert.equal(cartPointInRaidHazard(hazard("CONE", { radius: 20 }), 12, 0), false);
  assert.equal(cartPointInRaidHazard(hazard("DONUT"), 0, 0), false);
  assert.equal(cartPointInRaidHazard(hazard("DONUT"), 0, 10), true);
  assert.equal(cartPointInRaidHazard(hazard("DONUT"), 0, 16), false);
});

test("hazard shapes stay bounded and leave most of the giant field safe", () => {
  const fieldArea = 184 * 184;
  const patterns = [
    { kind: "LINE" as const, width: 9, length: 38 },
    { kind: "CIRCLE" as const, radius: 13.5 },
    { kind: "CROSS" as const, width: 7, length: 40 },
    { kind: "CONE" as const, radius: 23, coneAngle: CART_RAID_HAZARD_CONE_ANGLE },
    { kind: "DONUT" as const, innerRadius: 5.4, outerRadius: 15 },
  ];
  for (const pattern of patterns) assert.ok(cartRaidHazardArea(pattern) / fieldArea < 0.08);
  assert.ok(CART_RAID_HAZARD_LAYER_Y > 0.014);
  assert.ok(CART_RAID_HAZARD_MIN_LOCK_SECONDS >= 0.45);
  assert.ok(CART_RAID_HAZARD_PERFECT_ESCAPE_WINDOW >= 0.2);
});

test("Phase88 uses a fixed four-slot pool and refuses an unbounded fifth telegraph", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  const ids = Array.from({ length: CART_RAID_HAZARD_MAX_ACTIVE }, (_, index) => queueCartRaidHazard(session, {
    kind: "CIRCLE",
    label: `TEST ${index}`,
    radius: 6,
    telegraphSeconds: 2,
    delaySeconds: 2,
  }));
  assert.ok(ids.every((id) => id !== null));
  assert.equal(queueCartRaidHazard(session, { kind: "LINE", telegraphSeconds: 2 }), null);
  assert.equal(getCartRaidHazardState(session).activeCount, CART_RAID_HAZARD_MAX_ACTIVE);
  cancelCartRaidHazards(session);
  assert.equal(getCartRaidHazardState(session).activeCount, 0);
});

test("a tracking hazard locks, receives the Phase93 reaction window, then applies a recoverable hit", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  const gasBefore = session.gas;
  queueCartRaidHazard(session, {
    kind: "CIRCLE",
    label: "TEST BLAST",
    radius: 8,
    telegraphSeconds: 1.2,
    followCarSeconds: 0.6,
  });
  for (let index = 0; index < 14; index += 1) session.step(idleInput, 0.05);
  let state = getCartRaidHazardState(session);
  assert.equal(state.primaryPhase, "LOCKED");
  assert.ok(state.primarySeconds > 0.5 && state.primarySeconds <= 1.05);
  for (let index = 0; index < 24 && state.hitSerial === 0; index += 1) {
    session.step(idleInput, 0.05);
    state = getCartRaidHazardState(session);
  }
  assert.equal(state.hitSerial, 1);
  assert.ok(session.gas < gasBefore);
  assert.ok(session.gas >= 0);
});

test("leaving a locked AOE in the final window awards raid Perfect Dodge", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  queueCartRaidHazard(session, {
    kind: "CIRCLE",
    label: "PERFECT TEST",
    radius: 7,
    telegraphSeconds: 1.2,
  });
  for (let index = 0; index < 20; index += 1) session.step(idleInput, 0.05);
  session.car.position.x += 9;
  for (let index = 0; index < 4; index += 1) session.step(idleInput, 0.05);
  const state = getCartRaidHazardState(session);
  assert.equal(state.hitSerial, 0);
  assert.equal(state.perfectDodgeSerial, 1);
  assert.equal(state.lastResult, "PERFECT");
});

test("Phase89 starts raid-style field pressure early and rotates every shape", () => {
  assert.ok(CART_HAZARD_DIRECTOR_INITIAL_DELAY <= 1.5);
  assert.ok(CART_HAZARD_DIRECTOR_INTERVAL <= 4.8);
  assert.deepEqual(Array.from({ length: 5 }, (_, index) => cartHazardDirectorKindForSerial(index)), ["LINE", "CIRCLE", "CROSS", "CONE", "DONUT"]);

  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  for (let index = 0; index < 30; index += 1) session.step(idleInput, 0.05);
  const director = getCartHazardCombatDirectorState(session);
  const raid = getCartRaidHazardState(session);
  assert.ok(director.serial >= 1);
  assert.ok(raid.activeCount >= 1);
  assert.equal(raid.hazards.some((entry) => entry.source === "FIELD"), true);
});

test("Titan Raid 4.0 rotates readable patterns and FURY is materially faster", () => {
  assert.equal(cartTitanRaidPatternFor("ARMORED", 0), "LINE_CHARGE");
  assert.equal(cartTitanRaidPatternFor("ARMORED", 1), "TITAN_SLAM");
  assert.equal(cartTitanRaidPatternFor("BREAKOUT", 0), "CROSS_CRUSH");
  assert.equal(cartTitanRaidPatternFor("FURY", 0), "HUNTING_BLAST");
  assert.equal(cartTitanRaidPatternFor("FURY", 1), "FURY_RAID");
  assert.ok(CART_TITAN_RAID_FURY_INTERVAL < CART_HAZARD_DIRECTOR_INTERVAL);
  assert.match(phase90Source, /delaySeconds: 0\.72/);
  assert.match(phase90Source, /delaySeconds: 1\.4/);
});

test("live FURY cancels all Titan raid hazards when Predator hands out the counter window", () => {
  const session = new CartArenaSession();
  enableCartTurboHunt(session);
  for (let index = 0; index < 3040; index += 1) session.step(idleInput, 0.05);
  const boss = session.enemies.find((enemy) => enemy.kind === "boss");
  if (!boss) throw new Error("boss missing");
  boss.hp = 250;
  session.step(idleInput, 1 / 60);
  assert.equal(getCartTitanRaidBossState(session).stage, "FURY");

  for (let index = 0; index < 250 && getCartTitanPredatorState(session).mode !== "COUNTER"; index += 1) {
    session.step(idleInput, 0.05);
  }
  assert.equal(getCartTitanPredatorState(session).mode, "COUNTER");
  const titanHazards = getCartRaidHazardState(session).hazards.filter((entry) => entry.source === "TITAN");
  assert.equal(titanHazards.length, 0);
});

test("raid visuals use warning colors and no unsafe ground/color pipeline", () => {
  assert.match(phase88Source, /0xff1238/);
  assert.match(phase88Source, /0xffb000/);
  assert.match(phase88Source, /0xffffff/);
  assert.match(phase88Source, /phase88-raid-hazard-root/);
  assert.doesNotMatch(phase88Source, /instanceColor|setColorAt|TextureLoader|new THREE\.InstancedMesh/);
  const updateVisualBlock = phase88Source.match(/function updateMeshSet[\s\S]*?function updateHazardVisuals/)?.[0] ?? "";
  assert.doesNotMatch(updateVisualBlock, /new THREE\.|\.dispose\(/);
  assert.doesNotMatch(phase89Source, /enemies\.push|new CartEnemy|instanceColor|setColorAt|TextureLoader/);
  assert.doesNotMatch(phase90Source, /enemies\.push|new CartEnemy|instanceColor|setColorAt|TextureLoader/);
});

test("runtime and design keep raid hazards before later dodge/escape wrappers and preserve Phase80 safety contract", () => {
  const phase80 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase80EnvironmentRichness");
  const phase87 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase87ThreatPressure2");
  const phase88 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase88RaidHazards");
  const phase89 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase89HazardCombatDirector");
  const phase90 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase90TitanRaidBoss4");
  const phase91 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase91DamageFeedback2");
  const phase93 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase93ForcedDodgeTrajectory2");
  const phase94 = CART_ROGUE_RUNTIME_PHASE_ORDER.indexOf("CartRoguePhase94EscapeRhythmDirector2");
  assert.ok(phase87 > phase80);
  assert.ok(phase88 > phase87);
  assert.ok(phase89 > phase88);
  assert.ok(phase90 > phase89);
  assert.ok(phase91 > phase90);
  assert.ok(phase93 > phase91);
  assert.ok(phase94 > phase93);
  assert.equal(CART_ROGUE_RUNTIME_PHASE_ORDER.at(-1), "CartRoguePhase94EscapeRhythmDirector2");
  assert.match(design, /dedicated visual layer above the ground/);
  assert.match(design, /Fixed pool of at most four simultaneous hazard slots/);
  assert.match(design, /COUNTER windows cancel Titan hazards/);
});

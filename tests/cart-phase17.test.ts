import assert from "node:assert/strict";
import test from "node:test";
import "../src/cart/CartRoguePhase17CombatEvolution";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import { applyTurboRam, createInitialCartEnemies } from "../src/cart/CartCombat";
import { getCartChainCombatState, launchCartEnemyFromVector } from "../src/cart/CartRoguePhase16Flow";
import { getCartTurboCombatState } from "../src/cart/CartRoguePhase15Turbo";
import { getCartCombatEvolutionSnapshot } from "../src/cart/CartRoguePhase17CombatEvolution";
import { applyCartRunUpgrade, getCartRunModifiers, resetCartRunProgression } from "../src/cart/CartRunProgression";

const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false } as const;
const HOLD = { throttle: 0.8, brake: 0, steer: 0.55, boost: true } as const;
const RELEASE = { throttle: 0.8, brake: 0, steer: 0.55, boost: false } as const;

function silenceArena(session: CartArenaSession): void {
  for (const enemy of session.enemies) {
    enemy.moveSpeed = 0;
    if (enemy.nodeId === "arena-01") {
      enemy.x = 24;
      enemy.z = 28 + session.enemies.indexOf(enemy) * 5;
    }
  }
  for (const obstacle of session.obstacles) obstacle.destroyed = true;
}

test("Phase 17 expands generated combat with Drifter, Bomber and Tank roles", () => {
  const enemies = createInitialCartEnemies();
  assert.ok(enemies.some((enemy) => enemy.archetype === "drifter"), "expected a Drifter archetype");
  assert.ok(enemies.some((enemy) => enemy.archetype === "bomber"), "expected a Bomber archetype");
  assert.ok(enemies.some((enemy) => enemy.archetype === "tank"), "expected a Tank archetype");
});

test("launched enemies damage and launch other enemies as a real chain RAM", () => {
  resetCartRunProgression(17);
  const session = new CartArenaSession();
  try {
    silenceArena(session);
    const source = session.enemies[0];
    const target = session.enemies[1];
    source.nodeId = "arena-01";
    target.nodeId = "arena-01";
    source.x = -5;
    source.z = 28;
    source.hp = 0;
    source.alive = false;
    target.x = 0.4;
    target.z = 28;
    target.hp = 100;
    target.maxHp = 100;
    target.alive = true;
    launchCartEnemyFromVector(session, source, 1, 0, 20, true, 100, 0);

    for (let frame = 0; frame < 14 && target.hp === 100; frame += 1) session.step(IDLE);

    assert.ok(target.hp < 100, `chain collision should deal damage, target remained at ${target.hp}`);
    const chain = getCartChainCombatState(session);
    assert.ok(chain.combo >= 1);
    assert.match(chain.lastLabel ?? "", /CHAIN/);
  } finally {
    session.dispose();
  }
});

test("Kinetic Relay and Wrecking Ball modify real chain-combat multipliers", () => {
  resetCartRunProgression(18);
  const base = getCartRunModifiers();
  applyCartRunUpgrade("kinetic-relay");
  applyCartRunUpgrade("wrecking-ball");
  const upgraded = getCartRunModifiers();
  assert.ok(upgraded.chainDamageMultiplier > base.chainDamageMultiplier);
  assert.ok(upgraded.launchForceMultiplier > base.launchForceMultiplier);
});

test("a fully charged release opens a Perfect RAM window and a hit consumes it", () => {
  resetCartRunProgression(19);
  const session = new CartArenaSession();
  try {
    silenceArena(session);
    session.car.position.set(0, session.car.position.y, 28);
    session.car.heading = 0;
    session.car.forwardVelocity = 13;
    for (let frame = 0; frame < 50; frame += 1) session.step(HOLD);
    session.step(RELEASE);
    const armed = getCartTurboCombatState(session);
    assert.ok(armed.perfectWindowSeconds > 0, "full charge release should arm Perfect RAM");

    const target = session.enemies.find((enemy) => enemy.kind === "heavy")!;
    target.nodeId = "arena-01";
    target.x = session.car.position.x + Math.sin(session.car.heading) * 2.4;
    target.z = session.car.position.z + Math.cos(session.car.heading) * 2.4;
    target.maxHp = 260;
    target.hp = 260;
    target.alive = true;
    target.moveSpeed = 0;
    session.car.forwardVelocity = 18;
    session.step({ ...IDLE, throttle: 0.8 });

    const state = getCartCombatEvolutionSnapshot(session);
    assert.equal(getCartTurboCombatState(session).perfectWindowSeconds, 0, "Perfect RAM should be single-use");
    assert.ok(state.perfectCallout || /PERFECT/.test((session.snapshot() as { lastReward?: string | null }).lastReward ?? ""));
  } finally {
    session.dispose();
  }
});

test("Tank frontal armor takes less RAM damage than a rear hit", () => {
  resetCartRunProgression(20);
  const tankTemplate = createInitialCartEnemies().find((enemy) => enemy.archetype === "tank")!;
  const front = { ...tankTemplate, hp: tankTemplate.maxHp, alive: true };
  const rear = { ...tankTemplate, hp: tankTemplate.maxHp, alive: true };
  const frontResult = applyTurboRam(front, true, 20, front.heading + Math.PI);
  const rearResult = applyTurboRam(rear, true, 20, rear.heading);
  assert.ok(frontResult.damage < rearResult.damage, `front=${frontResult.damage}, rear=${rearResult.damage}`);
  assert.equal(frontResult.armored, true);
});

test("RAM TITAN armor breaks in three attacks and exposes a weak point", () => {
  resetCartRunProgression(21);
  const boss = createInitialCartEnemies().find((enemy) => enemy.kind === "boss")!;
  assert.equal(boss.armorSegments, 3);
  for (let hit = 0; hit < 3; hit += 1) applyTurboRam(boss, true, 20);
  assert.equal(boss.armorSegments, 0);
  assert.equal(boss.weakPointExposed, true);
  const hpBeforeWeakPoint = boss.hp;
  const weakPointHit = applyTurboRam(boss, true, 20);
  assert.ok(weakPointHit.damage > 118, `weak point should amplify the baseline boss RAM, got ${weakPointHit.damage}`);
  assert.ok(boss.hp < hpBeforeWeakPoint);
});

test("Phase 17 adds combat-shaping perks for Perfect, explosions and armor", () => {
  resetCartRunProgression(22);
  const base = getCartRunModifiers();
  applyCartRunUpgrade("perfect-ignition");
  applyCartRunUpgrade("wide-window");
  applyCartRunUpgrade("afterburn-loop");
  applyCartRunUpgrade("blast-link");
  applyCartRunUpgrade("armor-piercer");
  applyCartRunUpgrade("chain-siphon");
  const built = getCartRunModifiers();
  assert.ok(built.perfectRamDamageMultiplier > base.perfectRamDamageMultiplier);
  assert.ok(built.perfectWindowSeconds > base.perfectWindowSeconds);
  assert.ok(built.perfectRechargeSeconds > base.perfectRechargeSeconds);
  assert.ok(built.explosionDamageMultiplier > base.explosionDamageMultiplier);
  assert.ok(built.armorPierce > base.armorPierce);
  assert.ok(built.gasOnChainKill > base.gasOnChainKill);
});

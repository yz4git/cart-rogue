import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import type { CartEnemyState } from "./CartCombat";
import { getCartTurboStrikeState } from "./CartRoguePhase55TurboStrike";
import { getCartPerfectShockwaveState } from "./CartRoguePhase62PerfectShockwave";

interface EnemyStunEntry {
  remaining: number;
  originalMoveSpeed: number;
}

export interface CartTurboHitStunState {
  activeCount: number;
  lastEnemyId: string | null;
  lastDuration: number;
  strikeSerial: number;
  shockSerial: number;
}

interface InternalHitStunState extends CartTurboHitStunState {
  stuns: Map<string, EnemyStunEntry>;
}

interface Phase64Session {
  enemies: CartArenaSession["enemies"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

const stateBySession = new WeakMap<object, InternalHitStunState>();

function internalState(session: CartArenaSession | Phase64Session): InternalHitStunState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalHitStunState = {
    activeCount: 0,
    lastEnemyId: null,
    lastDuration: 0,
    strikeSerial: getCartTurboStrikeState(session as CartArenaSession).hitSerial,
    shockSerial: getCartPerfectShockwaveState(session as CartArenaSession).shockSerial,
    stuns: new Map<string, EnemyStunEntry>(),
  };
  stateBySession.set(key, created);
  return created;
}

export function cartTurboHitStunSeconds(enemy: Pick<CartEnemyState, "kind" | "archetype">, perfectShock = false): number {
  const base = enemy.kind === "boss"
    ? 0.07
    : enemy.kind === "heavy" || enemy.archetype === "tank"
      ? 0.13
      : enemy.archetype === "striker" || enemy.archetype === "drifter"
        ? 0.2
        : 0.23;
  return base + (perfectShock ? 0.045 : 0);
}

function applyStun(state: InternalHitStunState, enemy: CartEnemyState, duration: number): void {
  if (!enemy.alive || duration <= 0) return;
  const current = state.stuns.get(enemy.id);
  if (current) {
    current.remaining = Math.max(current.remaining, duration);
  } else {
    state.stuns.set(enemy.id, { remaining: duration, originalMoveSpeed: enemy.moveSpeed });
  }
  enemy.moveSpeed = 0;
  state.lastEnemyId = enemy.id;
  state.lastDuration = duration;
}

export function getCartTurboHitStunState(session: CartArenaSession): CartTurboHitStunState {
  const state = internalState(session);
  return {
    activeCount: state.stuns.size,
    lastEnemyId: state.lastEnemyId,
    lastDuration: state.lastDuration,
    strikeSerial: state.strikeSerial,
    shockSerial: state.shockSerial,
  };
}

export function installCartRoguePhase64TurboHitStun(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase64Session;
  const previous = prototype.step;
  prototype.step = function phase64TurboHitStunStep(
    this: Phase64Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const session = this as unknown as CartArenaSession;
    const state = internalState(this);
    const delta = Math.max(0, Math.min(0.05, fixedDelta));

    for (const [enemyId, stun] of state.stuns) {
      const enemy = this.enemies.find((candidate) => candidate.id === enemyId);
      if (!enemy || !enemy.alive) continue;
      enemy.moveSpeed = 0;
      stun.remaining = Math.max(0, stun.remaining - delta);
    }

    previous.call(this, input, fixedDelta);

    for (const [enemyId, stun] of [...state.stuns]) {
      const enemy = this.enemies.find((candidate) => candidate.id === enemyId);
      if (!enemy || !enemy.alive || stun.remaining <= 0) {
        if (enemy?.alive) enemy.moveSpeed = stun.originalMoveSpeed;
        state.stuns.delete(enemyId);
      } else {
        enemy.moveSpeed = 0;
      }
    }

    const strike = getCartTurboStrikeState(session);
    if (strike.hitSerial > state.strikeSerial) {
      state.strikeSerial = strike.hitSerial;
      const enemy = this.enemies.find((candidate) => candidate.id === strike.lastEnemyId);
      if (enemy) applyStun(state, enemy, cartTurboHitStunSeconds(enemy, false));
    }

    const shock = getCartPerfectShockwaveState(session);
    if (shock.shockSerial > state.shockSerial) {
      state.shockSerial = shock.shockSerial;
      for (const enemyId of shock.lastHitEnemyIds) {
        const enemy = this.enemies.find((candidate) => candidate.id === enemyId);
        if (enemy) applyStun(state, enemy, cartTurboHitStunSeconds(enemy, true));
      }
    }

    state.activeCount = state.stuns.size;
  };
}

installCartRoguePhase64TurboHitStun();

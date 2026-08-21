import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import {
  CART_CUTIN_EVENTS,
  enqueueCartAnimeCutin,
  type CartCutinEventDefinition,
} from "./CartRoguePhase102AnimeCutin";
import { getCartPlayerDamageFeedbackState } from "./CartRoguePhase91DamageFeedback2";
import { cartTraversalSyncHorizontalVelocity } from "./CartTraversalMath";

export const CART_PHASE109_GAMEPLAY_POLISH_ID = "phase109-decelerating-drift-smash-damage-cutin-v1";
export const CART_PHASE109_TURBO_DRIFT_DECELERATION_PER_SECOND = 6.0;
export const CART_PHASE109_TURBO_DRIFT_MIN_ROLL_SPEED = 3.2;
export const CART_PHASE109_MAJOR_IMPACT_THRESHOLD = 1.05;
export const CART_PHASE109_DAMAGE_CUTIN_ID = "damage_hit";
export const CART_PHASE109_DAMAGE_CUTIN_COOLDOWN_MS = 2400;
export const CART_PHASE109_DAMAGE_CUTIN_LINES = [
  { characterId: "operator", expression: "serious", line: "被弾！ 立て直して！", side: "left" },
  { characterId: "driver", expression: "angry", line: "くっ…まだ行ける！", side: "right" },
  { characterId: "operator", expression: "surprised", line: "ダメージ確認！ 無理しないで！", side: "left" },
] as const;

interface Phase109Session {
  car: CartArenaSession["car"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface Phase109State {
  seenDamageHitSerial: number;
  damageLineIndex: number;
}

const stateBySession = new WeakMap<object, Phase109State>();
const PATCHED_KEY = "__cartRoguePhase109HandlingSmashDamagePatched__";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stateFor(session: CartArenaSession | Phase109Session): Phase109State {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created = {
    seenDamageHitSerial: getCartPlayerDamageFeedbackState(session as CartArenaSession).hitSerial,
    damageLineIndex: 0,
  };
  stateBySession.set(key, created);
  return created;
}

/**
 * Turbo hold is a moving, decelerating drift rather than a stationary pivot.
 * The lower-level simulation may shed speed naturally; this prevents a held
 * Turbo from collapsing faster than the authored drift deceleration curve.
 */
export function cartPhase109DeceleratingTurboVelocity(
  previousForwardVelocity: number,
  simulatedForwardVelocity: number,
  deltaSeconds: number,
): number {
  const previousMagnitude = Math.abs(previousForwardVelocity);
  if (previousMagnitude < 0.15) return simulatedForwardVelocity;

  const delta = clamp(deltaSeconds, 0, 0.05);
  const direction = Math.sign(previousForwardVelocity || simulatedForwardVelocity || 1);
  const rollFloor = Math.min(previousMagnitude, CART_PHASE109_TURBO_DRIFT_MIN_ROLL_SPEED);
  const authoredMinimum = Math.max(
    rollFloor,
    previousMagnitude - CART_PHASE109_TURBO_DRIFT_DECELERATION_PER_SECOND * delta,
  );
  const simulatedMagnitude = Math.abs(simulatedForwardVelocity);
  const nextMagnitude = clamp(simulatedMagnitude, authoredMinimum, previousMagnitude);
  return direction * nextMagnitude;
}

function installDamageCutinDefinition(): void {
  const events = CART_CUTIN_EVENTS as unknown as Record<string, CartCutinEventDefinition>;
  if (events[CART_PHASE109_DAMAGE_CUTIN_ID]) return;
  const first = CART_PHASE109_DAMAGE_CUTIN_LINES[0];
  events[CART_PHASE109_DAMAGE_CUTIN_ID] = {
    id: CART_PHASE109_DAMAGE_CUTIN_ID as CartCutinEventDefinition["id"],
    characterId: first.characterId,
    expression: first.expression,
    line: first.line,
    priority: 82,
    durationMs: 1200,
    cooldownMs: CART_PHASE109_DAMAGE_CUTIN_COOLDOWN_MS,
    side: first.side,
    interruptible: true,
  };
}

function enqueueDamageCutin(state: Phase109State): void {
  installDamageCutinDefinition();
  const events = CART_CUTIN_EVENTS as unknown as Record<string, CartCutinEventDefinition>;
  const variant = CART_PHASE109_DAMAGE_CUTIN_LINES[state.damageLineIndex % CART_PHASE109_DAMAGE_CUTIN_LINES.length];
  state.damageLineIndex += 1;
  Object.assign(events[CART_PHASE109_DAMAGE_CUTIN_ID], variant);
  const enqueue = enqueueCartAnimeCutin as unknown as (eventId: string, now?: number) => string;
  enqueue(CART_PHASE109_DAMAGE_CUTIN_ID);
}

export function installCartRoguePhase109HandlingSmashDamage(): void {
  installDamageCutinDefinition();
  const prototype = CartArenaSession.prototype as unknown as Phase109Session & Record<string, unknown>;
  if (prototype[PATCHED_KEY]) return;
  prototype[PATCHED_KEY] = true;
  const previousStep = prototype.step;

  prototype.step = function phase109GameplayPolishStep(
    this: Phase109Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const session = this as unknown as CartArenaSession;
    const state = stateFor(session);
    const previousForwardVelocity = this.car.forwardVelocity;
    const damageBefore = getCartPlayerDamageFeedbackState(session).hitSerial;

    previousStep.call(this, input, fixedDelta);

    const damage = getCartPlayerDamageFeedbackState(session);
    const tookDamageThisStep = damage.hitSerial > damageBefore;

    if (input.boost && !tookDamageThisStep && this.car.collisionImpact < CART_PHASE109_MAJOR_IMPACT_THRESHOLD) {
      this.car.forwardVelocity = cartPhase109DeceleratingTurboVelocity(
        previousForwardVelocity,
        this.car.forwardVelocity,
        fixedDelta,
      );
      cartTraversalSyncHorizontalVelocity(this.car);
    }

    if (damage.hitSerial > state.seenDamageHitSerial) {
      state.seenDamageHitSerial = damage.hitSerial;
      enqueueDamageCutin(state);
    }
  };
}

installCartRoguePhase109HandlingSmashDamage();

import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { getCartTurboAttackState } from "./CartRoguePhase54TurboAttack";
import { cartTraversalSyncHorizontalVelocity } from "./CartTraversalMath";

interface Phase58Session {
  car: CartArenaSession["car"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function cartTurboBreakawaySpeedFloor(
  beforeForwardSpeed: number,
  maxSpeed: number,
  charge: number,
): number {
  const chargedFloor = 7.6 + clamp(charge, 0, 1) * 3.4;
  const carryFloor = Math.max(0, beforeForwardSpeed) * (0.82 + clamp(charge, 0, 1) * 0.08);
  return Math.min(maxSpeed * 1.38, Math.max(chargedFloor, carryFloor));
}

export function cartTurboBreakawayLateralRetention(charge: number): number {
  return 0.78 - clamp(charge, 0, 1) * 0.12;
}

export function installCartRoguePhase58TurboBreakaway(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase58Session;
  const previous = prototype.step;
  prototype.step = function phase58TurboBreakawayStep(
    this: Phase58Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const beforeForward = this.car.forwardVelocity;
    previous.call(this, input, fixedDelta);

    const attack = getCartTurboAttackState(this as unknown as CartArenaSession);
    if (attack.mode !== "attack" || !this.car.boostActive) return;

    const floor = cartTurboBreakawaySpeedFloor(beforeForward, this.car.definition.maxSpeed, attack.charge);
    const impactLike = this.car.collisionImpact >= 0.34 || this.car.forwardVelocity < floor * 0.86;
    if (!impactLike) return;

    this.car.forwardVelocity = Math.max(this.car.forwardVelocity, floor);
    this.car.lateralVelocity *= cartTurboBreakawayLateralRetention(attack.charge);
    this.car.collisionImpact = Math.max(this.car.collisionImpact, 0.42 + attack.charge * 0.2);
    cartTraversalSyncHorizontalVelocity(this.car);
  };
}

installCartRoguePhase58TurboBreakaway();

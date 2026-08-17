import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { getCartTurboAttackState } from "./CartRoguePhase54TurboAttack";
import { getCartFlowSurgeState } from "./CartRoguePhase57FlowSurge";
import { cartTraversalSyncHorizontalVelocity } from "./CartTraversalMath";

interface Phase60Session {
  car: CartArenaSession["car"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function cartTurboCombatSpeedCap(maxSpeed: number, flow: number): number {
  return Math.max(1, maxSpeed) * (1.5 + clamp(flow, 0, 1) * 0.08);
}

export function cartTurboCombatLateralCap(forwardSpeed: number, flow: number): number {
  return Math.max(1.4, Math.abs(forwardSpeed) * (0.44 + clamp(flow, 0, 1) * 0.04));
}

export function cartTurboCombatSafeNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function installCartRoguePhase60TurboCombatSafety(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase60Session;
  const previous = prototype.step;
  prototype.step = function phase60TurboCombatSafetyStep(
    this: Phase60Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previous.call(this, input, fixedDelta);

    const session = this as unknown as CartArenaSession;
    const attack = getCartTurboAttackState(session);
    const flow = getCartFlowSurgeState(session);
    const active = attack.mode === "attack" || this.car.boostActive || flow.flow > 0.01;
    if (!active) return;

    const speedCap = cartTurboCombatSpeedCap(this.car.definition.maxSpeed, flow.flow);
    this.car.forwardVelocity = clamp(
      cartTurboCombatSafeNumber(this.car.forwardVelocity),
      -speedCap * 0.42,
      speedCap,
    );
    const lateralCap = cartTurboCombatLateralCap(this.car.forwardVelocity, flow.flow);
    this.car.lateralVelocity = clamp(
      cartTurboCombatSafeNumber(this.car.lateralVelocity),
      -lateralCap,
      lateralCap,
    );
    this.car.boostTimeRemaining = clamp(cartTurboCombatSafeNumber(this.car.boostTimeRemaining), 0, 3.2);
    this.car.collisionImpact = clamp(cartTurboCombatSafeNumber(this.car.collisionImpact), 0, 1.5);
    cartTraversalSyncHorizontalVelocity(this.car);
  };
}

installCartRoguePhase60TurboCombatSafety();

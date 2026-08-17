import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { getCartTurboCombatState } from "./CartRoguePhase15Turbo";
import { cartTraversalSyncHorizontalVelocity } from "./CartTraversalMath";

export interface CartTurboAimAssistState {
  aimSerial: number;
  lastEnemyId: string | null;
  lastCorrection: number;
  lastCharge: number;
}

interface Phase63Session {
  car: CartArenaSession["car"];
  enemies: CartArenaSession["enemies"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

const stateBySession = new WeakMap<object, CartTurboAimAssistState>();

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function internalState(session: CartArenaSession | Phase63Session): CartTurboAimAssistState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: CartTurboAimAssistState = {
    aimSerial: 0,
    lastEnemyId: null,
    lastCorrection: 0,
    lastCharge: 0,
  };
  stateBySession.set(key, created);
  return created;
}

export function cartTurboAimAssistCorrection(
  currentHeading: number,
  targetHeading: number,
  charge: number,
  steer: number,
): number {
  const safeCharge = Math.max(0, Math.min(1, charge));
  if (safeCharge < 0.55 || Math.abs(steer) > 0.78) return 0;
  const difference = normalizeAngle(targetHeading - currentHeading);
  const cone = 0.44;
  if (Math.abs(difference) > cone) return 0;
  const strength = 0.2 + safeCharge * 0.2;
  const maxCorrection = 0.075 + safeCharge * 0.055;
  return Math.max(-maxCorrection, Math.min(maxCorrection, difference * strength));
}

export function cartTurboAimTargetScore(
  playerX: number,
  playerZ: number,
  heading: number,
  targetX: number,
  targetZ: number,
): number {
  const dx = targetX - playerX;
  const dz = targetZ - playerZ;
  const distance = Math.hypot(dx, dz);
  const targetHeading = Math.atan2(dx, dz);
  const angle = Math.abs(normalizeAngle(targetHeading - heading));
  return distance + angle * 7.5;
}

export function getCartTurboAimAssistState(session: CartArenaSession): CartTurboAimAssistState {
  return { ...internalState(session) };
}

export function installCartRoguePhase63TurboAimAssist(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase63Session;
  const previous = prototype.step;
  prototype.step = function phase63TurboAimAssistStep(
    this: Phase63Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const session = this as unknown as CartArenaSession;
    const turboBefore = getCartTurboCombatState(session);
    const releasing = turboBefore.held && !input.boost;
    if (releasing && turboBefore.charge >= 0.55 && Math.abs(input.steer) <= 0.78) {
      const target = this.enemies
        .filter((enemy) => enemy.alive)
        .filter((enemy) => Math.hypot(
          enemy.x - this.car.position.x,
          enemy.z - this.car.position.z,
        ) <= 11.5 + enemy.radius)
        .sort((a, b) => cartTurboAimTargetScore(
          this.car.position.x,
          this.car.position.z,
          this.car.heading,
          a.x,
          a.z,
        ) - cartTurboAimTargetScore(
          this.car.position.x,
          this.car.position.z,
          this.car.heading,
          b.x,
          b.z,
        ))[0];

      if (target) {
        const targetHeading = Math.atan2(
          target.x - this.car.position.x,
          target.z - this.car.position.z,
        );
        const correction = cartTurboAimAssistCorrection(
          this.car.heading,
          targetHeading,
          turboBefore.charge,
          input.steer,
        );
        if (Math.abs(correction) > 0.0001) {
          this.car.heading = normalizeAngle(this.car.heading + correction);
          this.car.lateralVelocity *= 0.92;
          cartTraversalSyncHorizontalVelocity(this.car);
          const state = internalState(this);
          state.aimSerial += 1;
          state.lastEnemyId = target.id;
          state.lastCorrection = correction;
          state.lastCharge = turboBefore.charge;
        }
      }
    }

    previous.call(this, input, fixedDelta);
  };
}

installCartRoguePhase63TurboAimAssist();

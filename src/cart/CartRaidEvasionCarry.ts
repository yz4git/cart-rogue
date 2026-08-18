import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { getCartRaidHazardState } from "./CartRoguePhase88RaidHazards";
import {
  CART_FORCED_DODGE_LABEL_PREFIX,
  CART_FORCED_DODGE_REACTION_MAX_LATERAL_SPEED,
  CART_FORCED_DODGE_REACTION_STEER_THRESHOLD,
} from "./CartRoguePhase93ForcedDodgeTrajectory2";
import { CART_TURBO_HUNT_FIELD } from "./CartTurboHuntTrack";

interface CarryState {
  hazardId: number | null;
  direction: -1 | 0 | 1;
  seconds: number;
}

interface EvasionCarrySession {
  car: CartArenaSession["car"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

const stateBySession = new WeakMap<object, CarryState>();

export const CART_RAID_EVASION_CARRY_SECONDS = 0.72;
export const CART_RAID_EVASION_CARRY_SPEED = 12.5;
export const CART_RAID_EVASION_CARRY_MIN_LATERAL_SPEED = 7.5;
export const CART_RAID_EVASION_CARRY_FIELD_MARGIN = 7.2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stateFor(session: EvasionCarrySession): CarryState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: CarryState = { hazardId: null, direction: 0, seconds: 0 };
  stateBySession.set(key, created);
  return created;
}

function reset(state: CarryState): void {
  state.hazardId = null;
  state.direction = 0;
  state.seconds = 0;
}

function clampToHuntField(session: EvasionCarrySession): void {
  const minX = CART_TURBO_HUNT_FIELD.centerX - CART_TURBO_HUNT_FIELD.halfWidth + CART_RAID_EVASION_CARRY_FIELD_MARGIN;
  const maxX = CART_TURBO_HUNT_FIELD.centerX + CART_TURBO_HUNT_FIELD.halfWidth - CART_RAID_EVASION_CARRY_FIELD_MARGIN;
  const minZ = CART_TURBO_HUNT_FIELD.centerZ - CART_TURBO_HUNT_FIELD.halfDepth + CART_RAID_EVASION_CARRY_FIELD_MARGIN;
  const maxZ = CART_TURBO_HUNT_FIELD.centerZ + CART_TURBO_HUNT_FIELD.halfDepth - CART_RAID_EVASION_CARRY_FIELD_MARGIN;
  session.car.position.x = clamp(session.car.position.x, minX, maxX);
  session.car.position.z = clamp(session.car.position.z, minZ, maxZ);
}

/**
 * Phase93's steering impulse is intentionally applied before the normal car
 * simulation so it still feels like part of the handling model. The ordinary
 * RallyCar / collision passes can legitimately damp that lateral velocity,
 * though, which previously made a correct phone dodge fail in the full game
 * even while the isolated 60 Hz tests passed.
 *
 * This tiny post-physics carry is the bridge: after the reaction telegraph has
 * settled for one fixed step, a committed steering input keeps moving the car
 * laterally at a bounded velocity for at most 0.72 s. Waiting for the stable
 * forced-hazard id prevents the assist from moving the car in the exact frame
 * that Phase93 is still replacing/shrinking the telegraph. It is spread across
 * fixed steps, never teleports the car, stays inside the Hunt field, and
 * disappears immediately when the hazard resolves. No input means no carry,
 * so passive driving remains punishable.
 */
export function installCartRaidEvasionCarry(): void {
  const prototype = CartArenaSession.prototype as unknown as EvasionCarrySession;
  const previousStep = prototype.step;
  prototype.step = function cartRaidEvasionCarryStep(
    this: EvasionCarrySession,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previousStep.call(this, input, fixedDelta);

    const session = this as unknown as CartArenaSession;
    const state = stateFor(this);
    if (!isCartTurboHuntEnabled(session)) {
      reset(state);
      return;
    }

    const forced = getCartRaidHazardState(session).hazards.find((hazard) =>
      hazard.source === "FIELD"
      && hazard.phase === "LOCKED"
      && hazard.secondsToFire > 0
      && hazard.label.startsWith(CART_FORCED_DODGE_LABEL_PREFIX),
    );
    if (!forced) {
      reset(state);
      return;
    }

    const rawSteer = clamp(input.strafe ?? input.steer, -1, 1);
    if (Math.abs(rawSteer) >= CART_FORCED_DODGE_REACTION_STEER_THRESHOLD) {
      const direction = (-Math.sign(rawSteer) || 1) as -1 | 1;
      if (state.hazardId !== forced.id || state.direction !== direction) {
        state.hazardId = forced.id;
        state.direction = direction;
        state.seconds = Math.min(CART_RAID_EVASION_CARRY_SECONDS, Math.max(0, forced.secondsToFire));
        return;
      }
    }

    if (state.direction === 0 || state.seconds <= 0) return;
    const delta = clamp(fixedDelta, 0, 0.05);
    const rightX = Math.cos(this.car.heading);
    const rightZ = -Math.sin(this.car.heading);
    const distance = CART_RAID_EVASION_CARRY_SPEED * delta;
    this.car.position.x += rightX * state.direction * distance;
    this.car.position.z += rightZ * state.direction * distance;
    clampToHuntField(this);

    const signedFloor = state.direction * CART_RAID_EVASION_CARRY_MIN_LATERAL_SPEED;
    if (state.direction > 0) {
      this.car.lateralVelocity = Math.max(this.car.lateralVelocity, signedFloor);
    } else {
      this.car.lateralVelocity = Math.min(this.car.lateralVelocity, signedFloor);
    }
    this.car.lateralVelocity = clamp(
      this.car.lateralVelocity,
      -CART_FORCED_DODGE_REACTION_MAX_LATERAL_SPEED,
      CART_FORCED_DODGE_REACTION_MAX_LATERAL_SPEED,
    );
    state.seconds = Math.max(0, state.seconds - delta);
  };
}

installCartRaidEvasionCarry();

import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { applyTurboRockSmash, type CartObstacleState } from "./CartObstacles";
import { getCartTurboAttackState } from "./CartRoguePhase54TurboAttack";
import { cartTraversalSyncHorizontalVelocity } from "./CartTraversalMath";

export interface CartTurboSmashState {
  attackSerial: number;
  smashSerial: number;
  smashesThisAttack: number;
  totalSmashes: number;
  lastObstacleId: string | null;
}

interface InternalSmashState extends CartTurboSmashState {
  smashedObstacleIds: Set<string>;
}

interface Phase56Session {
  car: CartArenaSession["car"];
  obstacles: CartArenaSession["obstacles"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

const stateBySession = new WeakMap<object, InternalSmashState>();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function internalState(session: CartArenaSession | Phase56Session): InternalSmashState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalSmashState = {
    attackSerial: 0,
    smashSerial: 0,
    smashesThisAttack: 0,
    totalSmashes: 0,
    lastObstacleId: null,
    smashedObstacleIds: new Set<string>(),
  };
  stateBySession.set(key, created);
  return created;
}

export function cartTurboSmashReach(charge: number): number {
  return 3.2 + clamp(charge, 0, 1) * 2.4;
}

export function cartTurboSmashLaneHalfWidth(charge: number): number {
  return 1.35 + clamp(charge, 0, 1) * 1.25;
}

export function cartTurboSmashCanReach(
  playerX: number,
  playerZ: number,
  heading: number,
  charge: number,
  obstacle: Pick<CartObstacleState, "x" | "z" | "radius" | "destroyed">,
): boolean {
  if (obstacle.destroyed) return false;
  const dx = obstacle.x - playerX;
  const dz = obstacle.z - playerZ;
  const distance = Math.hypot(dx, dz);
  // A release can happen on the same frame that the base collision solver has
  // already nudged the cart around a rock. Treat close contact/overlap as a
  // valid smash instead of dropping the target for being "too close".
  if (distance <= obstacle.radius + 1.95) return true;

  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const forward = dx * forwardX + dz * forwardZ;
  if (forward < 0.45 || forward > cartTurboSmashReach(charge) + obstacle.radius) return false;

  const lateral = Math.abs(dx * forwardZ - dz * forwardX);
  return lateral <= cartTurboSmashLaneHalfWidth(charge) + obstacle.radius * 0.5;
}

export function getCartTurboSmashState(session: CartArenaSession): CartTurboSmashState {
  const state = internalState(session);
  return {
    attackSerial: state.attackSerial,
    smashSerial: state.smashSerial,
    smashesThisAttack: state.smashesThisAttack,
    totalSmashes: state.totalSmashes,
    lastObstacleId: state.lastObstacleId,
  };
}

export function installCartRoguePhase56TurboSmash(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase56Session;
  const previous = prototype.step;
  prototype.step = function phase56TurboSmashStep(
    this: Phase56Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previous.call(this, input, fixedDelta);

    const session = this as unknown as CartArenaSession;
    const attack = getCartTurboAttackState(session);
    const state = internalState(this);
    if (attack.serial !== state.attackSerial) {
      state.attackSerial = attack.serial;
      state.smashesThisAttack = 0;
      state.smashedObstacleIds.clear();
    }
    if (attack.mode !== "attack") return;

    const maxSmashes = attack.charge >= 0.8 ? 4 : 2;
    if (state.smashesThisAttack >= maxSmashes) return;

    const obstacle = this.obstacles
      .filter((candidate) => !candidate.destroyed && !state.smashedObstacleIds.has(candidate.id))
      .filter((candidate) => cartTurboSmashCanReach(
        this.car.position.x,
        this.car.position.z,
        this.car.heading,
        attack.charge,
        candidate,
      ))
      .sort((a, b) => {
        const adx = a.x - this.car.position.x;
        const adz = a.z - this.car.position.z;
        const bdx = b.x - this.car.position.x;
        const bdz = b.z - this.car.position.z;
        return adx * adx + adz * adz - (bdx * bdx + bdz * bdz);
      })[0];
    if (!obstacle) return;

    state.smashedObstacleIds.add(obstacle.id);
    const effectiveSpeed = Math.max(Math.abs(this.car.forwardVelocity), 10 + attack.charge * 5.5);
    const result = applyTurboRockSmash(obstacle, true, effectiveSpeed);
    if (!result.destroyed) return;

    state.smashesThisAttack += 1;
    state.totalSmashes += 1;
    state.smashSerial += 1;
    state.lastObstacleId = obstacle.id;

    this.car.destructionCount += 1;
    this.car.collisionImpact = Math.max(this.car.collisionImpact, 0.72 + attack.charge * 0.24);
    this.car.boostTimeRemaining = Math.min(3.2, this.car.boostTimeRemaining + 0.045 + attack.charge * 0.05);
    const cap = this.car.definition.maxSpeed * 1.48;
    this.car.forwardVelocity = Math.min(cap, Math.max(0, this.car.forwardVelocity) + 0.32 + attack.charge * 0.28);
    this.car.lateralVelocity *= 0.88;
    cartTraversalSyncHorizontalVelocity(this.car);
  };
}

installCartRoguePhase56TurboSmash();

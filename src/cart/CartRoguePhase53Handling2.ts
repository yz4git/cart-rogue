import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import {
  cartHandling2NormalizeAngle,
  cartHandling2Profile,
  cartHandling2ShapeHeadingDelta,
} from "./CartHandlingProfile";
import { cartTraversalClamp, cartTraversalSyncHorizontalVelocity } from "./CartTraversalMath";

interface Phase53Session {
  car: CartArenaSession["car"];
  location: CartArenaSession["location"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

function capLateralSlip(session: Phase53Session, maxRatio: number): void {
  if (session.car.collisionImpact > 0.4) return;
  const forward = Math.abs(session.car.forwardVelocity);
  const cap = Math.max(0.55, forward * maxRatio);
  const lateral = cartTraversalClamp(session.car.lateralVelocity, -cap, cap);
  if (Math.abs(lateral - session.car.lateralVelocity) < 0.0001) return;
  session.car.lateralVelocity = lateral;
  cartTraversalSyncHorizontalVelocity(session.car);
}

/**
 * Phase 53 is the final steering authority for Gameplay & Presentation 2.0.
 * Legacy phases still own acceleration, Turbo charge/release, contacts and
 * traversal. This wrapper shapes only the final player-authored steering result.
 */
export function installCartRoguePhase53Handling2(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase53Session;
  const previous = prototype.step;
  prototype.step = function phase53Handling2Step(
    this: Phase53Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const delta = Math.max(0, Math.min(0.05, fixedDelta));
    const beforeHeading = this.car.heading;
    const beforeNodeId = this.location.node.id;
    previous.call(this, input, fixedDelta);

    if (this.location.node.id !== beforeNodeId) return;

    const profile = cartHandling2Profile({
      speed: this.car.speed,
      steer: input.steer,
      brake: input.brake,
      turboHeld: input.boost === true,
      boostActive: this.car.boostActive,
      drifting: this.car.drifting,
    });

    if (Math.abs(input.steer) > 0.035 && delta > 0) {
      const rawDelta = cartHandling2NormalizeAngle(this.car.heading - beforeHeading);
      const shapedDelta = cartHandling2ShapeHeadingDelta(rawDelta, delta, profile);
      this.car.heading = cartHandling2NormalizeAngle(beforeHeading + shapedDelta);
      cartTraversalSyncHorizontalVelocity(this.car);
    }

    if (profile.mode !== "turbo-pivot") capLateralSlip(this, profile.maxLateralRatio);
  };
}

installCartRoguePhase53Handling2();

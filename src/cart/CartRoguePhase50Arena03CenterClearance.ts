import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";

interface Phase50Session {
  track: CartArenaSession["track"];
  step(input: RallyInputState, fixedDelta?: number): void;
  snapshot(): CartArenaSessionSnapshot;
}

const initializedSessions = new WeakSet<object>();

export function cartPhase50DisableLegacyRallyGatePosts(session: Phase50Session): number {
  let disabled = 0;
  for (const collider of session.track.staticColliders) {
    if (!collider.active || collider.source !== "gate-post") continue;
    collider.active = false;
    disabled += 1;
  }
  return disabled;
}

export function cartPhase50EnsureLegacyGatePostsDisabled(session: Phase50Session): void {
  const key = session as unknown as object;
  if (initializedSessions.has(key)) return;
  initializedSessions.add(key);
  const disabledGatePosts = cartPhase50DisableLegacyRallyGatePosts(session);
  (session as unknown as { phase50LegacyGatePosts?: { disabled: number } }).phase50LegacyGatePosts = {
    disabled: disabledGatePosts,
  };
}

export function installCartRoguePhase50Arena03CenterClearance(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase50Session;
  const originalStep = prototype.step;
  const originalSnapshot = prototype.snapshot;

  prototype.step = function phase50NoLegacyRallyGateCollision(
    this: Phase50Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    // Cart Rogue owns its combat gates and arena boundaries. RallyTrack is only
    // a low-level driving surface adapter here, so its invisible START / CHECKPOINT /
    // GOAL gate-post colliders must never participate in Cart Rogue physics.
    cartPhase50EnsureLegacyGatePostsDisabled(this);
    originalStep.call(this, input, fixedDelta);
  };

  prototype.snapshot = function phase50NoLegacyGateSnapshot(this: Phase50Session): CartArenaSessionSnapshot {
    cartPhase50EnsureLegacyGatePostsDisabled(this);
    return originalSnapshot.call(this);
  };
}

installCartRoguePhase50Arena03CenterClearance();

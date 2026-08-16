import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import {
  disableCartLegacyRallyGatePosts,
  ensureCartTrackCompatibility,
} from "./CartTrackCompatibility";

interface Phase50Session {
  track: CartArenaSession["track"];
  step(input: RallyInputState, fixedDelta?: number): void;
  snapshot(): CartArenaSessionSnapshot;
}

export function cartPhase50DisableLegacyRallyGatePosts(session: Phase50Session): number {
  return disableCartLegacyRallyGatePosts(session.track);
}

export function cartPhase50EnsureLegacyGatePostsDisabled(session: Phase50Session): void {
  const disabledGatePosts = ensureCartTrackCompatibility(session.track);
  if (disabledGatePosts <= 0) return;
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
    cartPhase50EnsureLegacyGatePostsDisabled(this);
    originalStep.call(this, input, fixedDelta);
  };

  prototype.snapshot = function phase50NoLegacyGateSnapshot(this: Phase50Session): CartArenaSessionSnapshot {
    cartPhase50EnsureLegacyGatePostsDisabled(this);
    return originalSnapshot.call(this);
  };
}

installCartRoguePhase50Arena03CenterClearance();

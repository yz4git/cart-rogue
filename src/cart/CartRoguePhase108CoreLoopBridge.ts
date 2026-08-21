import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import type { RallyInputState } from "../rally/RallyTypes";

interface CapturedSessionMethods {
  step(input: RallyInputState, fixedDelta?: number): void;
  snapshot(): CartArenaSessionSnapshot;
}

const prototype = CartArenaSession.prototype as unknown as CapturedSessionMethods;
const prePhase108Step = prototype.step;
const prePhase108Snapshot = prototype.snapshot;

/**
 * Phase108 owns two independent layers: contract progression on CartArenaSession
 * and death-flight presentation on the WebGL demo. Phase110 supersedes only the
 * former, so capture the session methods immediately before Phase108 is loaded.
 */
export function restoreCartPrePhase108CoreLoopSessionMethods(): void {
  const current = CartArenaSession.prototype as unknown as CapturedSessionMethods;
  current.step = prePhase108Step;
  current.snapshot = prePhase108Snapshot;
}

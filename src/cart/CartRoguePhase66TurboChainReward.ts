import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { getCartFlowSurgeState } from "./CartRoguePhase57FlowSurge";

export interface CartTurboChainRewardState {
  rewardSerial: number;
  totalRefills: number;
  lastThreshold: number;
  lastChain: number;
  lastChargeCount: number;
}

interface InternalChainRewardState extends CartTurboChainRewardState {
  awardedThresholds: Set<number>;
}

interface Phase66Session {
  car: CartArenaSession["car"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

const stateBySession = new WeakMap<object, InternalChainRewardState>();
export const CART_TURBO_CHAIN_REWARD_THRESHOLDS = [4, 7] as const;

function internalState(session: CartArenaSession | Phase66Session): InternalChainRewardState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalChainRewardState = {
    rewardSerial: 0,
    totalRefills: 0,
    lastThreshold: 0,
    lastChain: 0,
    lastChargeCount: (session as Phase66Session).car.boostCharges,
    awardedThresholds: new Set<number>(),
  };
  stateBySession.set(key, created);
  return created;
}

export function cartTurboChainRewardThresholds(previousChain: number, nextChain: number): number[] {
  const from = Math.max(0, Math.floor(previousChain));
  const to = Math.max(0, Math.floor(nextChain));
  if (to <= from) return [];
  return CART_TURBO_CHAIN_REWARD_THRESHOLDS.filter((threshold) => threshold > from && threshold <= to);
}

export function getCartTurboChainRewardState(session: CartArenaSession): CartTurboChainRewardState {
  const state = internalState(session);
  return {
    rewardSerial: state.rewardSerial,
    totalRefills: state.totalRefills,
    lastThreshold: state.lastThreshold,
    lastChain: state.lastChain,
    lastChargeCount: state.lastChargeCount,
  };
}

export function installCartRoguePhase66TurboChainReward(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase66Session;
  const previous = prototype.step;
  prototype.step = function phase66TurboChainRewardStep(
    this: Phase66Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const session = this as unknown as CartArenaSession;
    const state = internalState(this);
    const previousChain = state.lastChain;
    previous.call(this, input, fixedDelta);

    const flow = getCartFlowSurgeState(session);
    if (flow.chain <= 0) {
      state.lastChain = 0;
      state.awardedThresholds.clear();
      state.lastChargeCount = this.car.boostCharges;
      return;
    }

    const crossed = cartTurboChainRewardThresholds(previousChain, flow.chain);
    for (const threshold of crossed) {
      if (state.awardedThresholds.has(threshold)) continue;
      state.awardedThresholds.add(threshold);
      const before = this.car.boostCharges;
      const after = this.car.addBoostCharge(1);
      if (after > before) {
        state.rewardSerial += 1;
        state.totalRefills += after - before;
        state.lastThreshold = threshold;
        this.car.collisionImpact = Math.max(this.car.collisionImpact, 0.52);
      }
    }

    state.lastChain = flow.chain;
    state.lastChargeCount = this.car.boostCharges;
  };
}

installCartRoguePhase66TurboChainReward();

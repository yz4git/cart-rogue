import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { getCartTurboStrikeState } from "./CartRoguePhase55TurboStrike";
import { getCartTurboSmashState } from "./CartRoguePhase56TurboSmash";
import { cartTraversalSyncHorizontalVelocity } from "./CartTraversalMath";

export interface CartFlowSurgeState {
  chain: number;
  flow: number;
  secondsRemaining: number;
  pulseSerial: number;
  lastSource: "enemy" | "rock" | "mixed" | null;
}

interface InternalFlowState extends CartFlowSurgeState {
  lastStrikeSerial: number;
  lastSmashSerial: number;
}

interface Phase57Session {
  car: CartArenaSession["car"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

const stateBySession = new WeakMap<object, InternalFlowState>();
const FLOW_CHAIN_SECONDS = 2.4;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function internalState(session: CartArenaSession | Phase57Session): InternalFlowState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const strike = getCartTurboStrikeState(session as CartArenaSession);
  const smash = getCartTurboSmashState(session as CartArenaSession);
  const created: InternalFlowState = {
    chain: 0,
    flow: 0,
    secondsRemaining: 0,
    pulseSerial: 0,
    lastSource: null,
    lastStrikeSerial: strike.hitSerial,
    lastSmashSerial: smash.smashSerial,
  };
  stateBySession.set(key, created);
  return created;
}

export function cartFlowSurgeGain(chain: number, events = 1): number {
  const safeEvents = Math.max(0, Math.floor(events));
  if (safeEvents === 0) return 0;
  return clamp(0.13 * safeEvents + Math.min(0.18, Math.max(0, chain - 1) * 0.022), 0, 0.42);
}

export function cartFlowSurgeSpeedCarry(flow: number): number {
  return 0.91 + clamp(flow, 0, 1) * 0.075;
}

export function getCartFlowSurgeState(session: CartArenaSession): CartFlowSurgeState {
  const state = internalState(session);
  return {
    chain: state.chain,
    flow: state.flow,
    secondsRemaining: state.secondsRemaining,
    pulseSerial: state.pulseSerial,
    lastSource: state.lastSource,
  };
}

export function resetCartFlowSurge(session: CartArenaSession): void {
  const state = internalState(session);
  state.chain = 0;
  state.flow = 0;
  state.secondsRemaining = 0;
  state.lastSource = null;
}

export function installCartRoguePhase57FlowSurge(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase57Session;
  const previous = prototype.step;
  prototype.step = function phase57FlowSurgeStep(
    this: Phase57Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const session = this as unknown as CartArenaSession;
    const state = internalState(this);
    const beforeForward = this.car.forwardVelocity;
    previous.call(this, input, fixedDelta);

    const delta = Math.max(0, Math.min(0.05, fixedDelta));
    state.secondsRemaining = Math.max(0, state.secondsRemaining - delta);
    if (state.secondsRemaining <= 0) {
      state.chain = 0;
      state.lastSource = null;
      state.flow = Math.max(0, state.flow - delta * 0.52);
    } else {
      state.flow = Math.max(0, state.flow - delta * 0.045);
    }

    const strike = getCartTurboStrikeState(session);
    const smash = getCartTurboSmashState(session);
    const strikeEvents = Math.max(0, strike.hitSerial - state.lastStrikeSerial);
    const smashEvents = Math.max(0, smash.smashSerial - state.lastSmashSerial);
    state.lastStrikeSerial = strike.hitSerial;
    state.lastSmashSerial = smash.smashSerial;
    const events = strikeEvents + smashEvents;
    if (events <= 0) return;

    state.chain = state.secondsRemaining > 0 ? Math.min(9, state.chain + events) : Math.min(9, events);
    state.secondsRemaining = FLOW_CHAIN_SECONDS;
    state.flow = clamp(state.flow + cartFlowSurgeGain(state.chain, events), 0, 1);
    state.pulseSerial += events;
    state.lastSource = strikeEvents > 0 && smashEvents > 0
      ? "mixed"
      : strikeEvents > 0
        ? "enemy"
        : "rock";

    this.car.collisionImpact = Math.max(this.car.collisionImpact, 0.66 + state.flow * 0.3);
    if (this.car.boostActive) {
      this.car.boostTimeRemaining = Math.min(3.2, this.car.boostTimeRemaining + 0.025 * events + state.flow * 0.012);
    }

    if (beforeForward > 0) {
      const carry = beforeForward * cartFlowSurgeSpeedCarry(state.flow) + events * 0.28;
      const cap = this.car.definition.maxSpeed * (1.46 + state.flow * 0.06);
      this.car.forwardVelocity = Math.min(cap, Math.max(this.car.forwardVelocity, carry));
      this.car.lateralVelocity *= 0.9;
      cartTraversalSyncHorizontalVelocity(this.car);
    }
  };
}

installCartRoguePhase57FlowSurge();

import type { RallyInputState } from "../rally/RallyTypes";
import {
  CART_ARENA03_GATE_HALF_OPENING,
  CART_ARENA03_GATE_TRIGGER_Z,
  CART_ARENA03_GATE_Z,
  CART_ARENA03_JUNCTION_ENTRY_Z,
  cartArena03GateLocked,
  cartTryOpenArena03Exit,
} from "./CartArena03GateRules";
import { installCartArena03GateVisuals } from "./CartArena03GateVisual";
import { CartArenaSession } from "./CartArenaSession";

interface Phase51Session {
  step(input: RallyInputState, fixedDelta?: number): void;
}

export const CART_PHASE51_ARENA03_GATE_Z = CART_ARENA03_GATE_Z;
export const CART_PHASE51_ARENA03_TRIGGER_Z = CART_ARENA03_GATE_TRIGGER_Z;
export const CART_PHASE51_ARENA03_HALF_OPENING = CART_ARENA03_GATE_HALF_OPENING;
export const CART_PHASE51_JUNCTION_ENTRY_Z = CART_ARENA03_JUNCTION_ENTRY_Z;
export const cartPhase51Arena03GateLocked = cartArena03GateLocked;
export const cartPhase51TryOpenArena03Exit = cartTryOpenArena03Exit;

export function installCartRoguePhase51Arena03Gate(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase51Session;
  const originalStep = sessionPrototype.step;
  sessionPrototype.step = function phase51Arena03GateStep(
    this: Phase51Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    originalStep.call(this, input, fixedDelta);
    cartTryOpenArena03Exit(this as Parameters<typeof cartTryOpenArena03Exit>[0], input);
  };

  installCartArena03GateVisuals();
}

installCartRoguePhase51Arena03Gate();

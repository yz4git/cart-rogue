import { CartArenaSession } from "./CartArenaSession";

export interface CartEncounterDirectorGatePolicy {
  allowThreatPressure: boolean;
  allowFieldRaid: boolean;
}

const policyBySession = new WeakMap<object, CartEncounterDirectorGatePolicy>();
const DEFAULT_POLICY: CartEncounterDirectorGatePolicy = {
  allowThreatPressure: true,
  allowFieldRaid: true,
};

export function setCartEncounterDirectorGatePolicy(
  session: CartArenaSession,
  policy: CartEncounterDirectorGatePolicy,
): void {
  policyBySession.set(session as unknown as object, policy);
}

export function getCartEncounterDirectorGatePolicy(
  session: CartArenaSession,
): CartEncounterDirectorGatePolicy {
  return policyBySession.get(session as unknown as object) ?? DEFAULT_POLICY;
}

export function cartEncounterAllowsThreatPressure(session: CartArenaSession): boolean {
  return getCartEncounterDirectorGatePolicy(session).allowThreatPressure;
}

export function cartEncounterAllowsFieldRaid(session: CartArenaSession): boolean {
  return getCartEncounterDirectorGatePolicy(session).allowFieldRaid;
}

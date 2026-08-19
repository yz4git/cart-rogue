import type { CartArenaSession } from "./CartArenaSession";

export interface CartEncounterDirectorGatePolicy {
  allowThreatPressure: boolean;
  allowFieldRaid: boolean;
  allowChaseStart?: boolean;
}

const policyBySession = new WeakMap<object, CartEncounterDirectorGatePolicy>();
const dodgeSeenBySession = new WeakSet<object>();
const DEFAULT_POLICY: CartEncounterDirectorGatePolicy = {
  allowThreatPressure: true,
  allowFieldRaid: true,
  allowChaseStart: true,
};

export function setCartEncounterDirectorGatePolicy(
  session: CartArenaSession,
  policy: CartEncounterDirectorGatePolicy,
): void {
  const key = session as unknown as object;
  policyBySession.set(key, policy);
  if (policy.allowFieldRaid) dodgeSeenBySession.add(key);
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

export function cartEncounterAllowsChaseStart(session: CartArenaSession): boolean {
  const key = session as unknown as object;
  const policy = policyBySession.get(key);
  if (!policy) return true;
  if (policy.allowChaseStart !== undefined) return policy.allowChaseStart;
  return dodgeSeenBySession.has(key) && policy.allowThreatPressure;
}

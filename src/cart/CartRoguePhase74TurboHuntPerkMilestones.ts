import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import { getCartTurboHuntSnapshot, isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";

interface Phase74Session {
  snapshot(): CartArenaSessionSnapshot;
}

interface PerkMilestoneState {
  offered: Set<number>;
  activeNodeId: string | null;
  expiresAt: number;
  lastElapsed: number;
}

const states = new WeakMap<object, PerkMilestoneState>();
const MILESTONES = [2, 4] as const;
const NODE_FOR_MILESTONE = new Map<number, string>([
  [2, "arena-02"],
  [4, "arena-03"],
]);

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function stateFor(session: CartArenaSession): PerkMilestoneState {
  const key = session as unknown as object;
  const current = states.get(key);
  if (current) return current;
  const created: PerkMilestoneState = {
    offered: new Set<number>(),
    activeNodeId: null,
    expiresAt: 0,
    lastElapsed: 0,
  };
  states.set(key, created);
  return created;
}

export function cartTurboHuntPerkMilestone(ordersCompleted: number): number | null {
  let reached: number | null = null;
  for (const milestone of MILESTONES) {
    if (ordersCompleted >= milestone) reached = milestone;
  }
  return reached;
}

function nextUnclaimedMilestone(ordersCompleted: number, offered: ReadonlySet<number>): number | null {
  for (const milestone of MILESTONES) {
    if (ordersCompleted >= milestone && !offered.has(milestone)) return milestone;
  }
  return null;
}

function synthesizePerkClear(base: CartArenaSessionSnapshot, nodeId: string): CartArenaSessionSnapshot {
  return Object.assign(base, {
    nodeId,
    nodeKind: "arena",
    encounter: "combat",
    enemiesAlive: 0,
    enemiesTotal: 1,
    gateLocked: false,
    arena1GateLocked: false,
    arena2GateLocked: false,
    runComplete: false,
  });
}

export function installCartRoguePhase74TurboHuntPerkMilestones(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase74Session;
  const previousSnapshot = prototype.snapshot;
  prototype.snapshot = function phase74TurboHuntPerkSnapshot(this: Phase74Session): CartArenaSessionSnapshot {
    const base = previousSnapshot.call(this);
    const session = this as unknown as CartArenaSession;
    if (!isCartTurboHuntEnabled(session)) return base;

    const hunt = getCartTurboHuntSnapshot(session);
    if (!hunt) return base;
    const state = stateFor(session);

    if (hunt.huntElapsedSeconds + 0.5 < state.lastElapsed) {
      state.offered.clear();
      state.activeNodeId = null;
      state.expiresAt = 0;
    }
    state.lastElapsed = hunt.huntElapsedSeconds;

    const now = nowMs();
    if (state.activeNodeId && now <= state.expiresAt) {
      return synthesizePerkClear(base, state.activeNodeId);
    }
    state.activeNodeId = null;

    if (hunt.huntBossSpawned || hunt.huntPhase === "clear") return base;
    const milestone = nextUnclaimedMilestone(hunt.huntOrdersCompleted, state.offered);
    if (milestone === null) return base;
    const nodeId = NODE_FOR_MILESTONE.get(milestone);
    if (!nodeId) return base;

    state.offered.add(milestone);
    state.activeNodeId = nodeId;
    // Long enough for the React snapshot handler to see one stable milestone,
    // short enough to be gone before the player finishes choosing a perk.
    state.expiresAt = now + 420;
    return synthesizePerkClear(base, nodeId);
  };
}

installCartRoguePhase74TurboHuntPerkMilestones();

import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { launchCartEnemyFromVector } from "./CartRoguePhase16Flow";
import { getCartPerfectStrikeState } from "./CartRoguePhase61PerfectStrike";

export interface CartPerfectShockwaveState {
  shockSerial: number;
  lastPerfectSerial: number;
  lastOriginEnemyId: string | null;
  lastHitEnemyIds: string[];
  lastDamage: number;
  lastKOs: number;
}

type InternalShockwaveState = CartPerfectShockwaveState;

interface Phase62Session {
  car: CartArenaSession["car"];
  enemies: CartArenaSession["enemies"];
  step(input: RallyInputState, fixedDelta?: number): void;
}

const stateBySession = new WeakMap<object, InternalShockwaveState>();

function internalState(session: CartArenaSession | Phase62Session): InternalShockwaveState {
  const key = session as unknown as object;
  const existing = stateBySession.get(key);
  if (existing) return existing;
  const created: InternalShockwaveState = {
    shockSerial: 0,
    lastPerfectSerial: getCartPerfectStrikeState(session as CartArenaSession).perfectSerial,
    lastOriginEnemyId: null,
    lastHitEnemyIds: [],
    lastDamage: 0,
    lastKOs: 0,
  };
  stateBySession.set(key, created);
  return created;
}

export function cartPerfectShockwaveRadius(charge: number): number {
  return 5.1 + Math.max(0, Math.min(1, charge)) * 1.35;
}

export function cartPerfectShockwaveDamage(charge: number, distanceRatio: number, targetKind: string): number {
  const safeCharge = Math.max(0, Math.min(1, charge));
  const falloff = Math.max(0.32, 1 - Math.max(0, Math.min(1, distanceRatio)) * 0.68);
  const kindScale = targetKind === "boss" ? 0.34 : targetKind === "heavy" ? 0.62 : 1;
  return Math.max(1, Math.round((17 + safeCharge * 13) * falloff * kindScale));
}

export function getCartPerfectShockwaveState(session: CartArenaSession): CartPerfectShockwaveState {
  const state = internalState(session);
  return {
    ...state,
    lastHitEnemyIds: [...state.lastHitEnemyIds],
  };
}

export function installCartRoguePhase62PerfectShockwave(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase62Session;
  const previous = prototype.step;
  prototype.step = function phase62PerfectShockwaveStep(
    this: Phase62Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    previous.call(this, input, fixedDelta);

    const session = this as unknown as CartArenaSession;
    const perfect = getCartPerfectStrikeState(session);
    const state = internalState(this);
    if (perfect.perfectSerial <= state.lastPerfectSerial || !perfect.lastEnemyId) return;
    state.lastPerfectSerial = perfect.perfectSerial;

    const origin = this.enemies.find((enemy) => enemy.id === perfect.lastEnemyId);
    if (!origin) return;
    const radius = cartPerfectShockwaveRadius(perfect.lastCharge);
    const hitEnemyIds: string[] = [];
    let totalDamage = 0;
    let kos = 0;

    for (const target of this.enemies) {
      if (!target.alive || target.id === origin.id || target.nodeId !== origin.nodeId) continue;
      // Bomber deaths are deliberately left to the older dedicated explosion
      // system so a perfect shockwave cannot silently bypass its detonation path.
      if (target.archetype === "bomber") continue;
      const dx = target.x - origin.x;
      const dz = target.z - origin.z;
      const distance = Math.hypot(dx, dz);
      if (distance > radius + target.radius * 0.35) continue;

      const damage = cartPerfectShockwaveDamage(
        perfect.lastCharge,
        distance / Math.max(0.001, radius),
        target.kind,
      );
      target.hp = Math.max(0, target.hp - damage);
      target.alive = target.hp > 0;
      hitEnemyIds.push(target.id);
      totalDamage += damage;
      if (!target.alive) {
        kos += 1;
        this.car.ramCount += 1;
      }
      launchCartEnemyFromVector(
        session,
        target,
        dx,
        dz,
        target.alive ? 7.5 + perfect.lastCharge * 2.5 : 13 + perfect.lastCharge * 4,
        !target.alive,
        damage,
        0,
      );
    }

    state.shockSerial += 1;
    state.lastOriginEnemyId = origin.id;
    state.lastHitEnemyIds = hitEnemyIds;
    state.lastDamage = totalDamage;
    state.lastKOs = kos;
    this.car.collisionImpact = Math.max(this.car.collisionImpact, hitEnemyIds.length > 0 ? 1.04 : 0.94);
  };
}

installCartRoguePhase62PerfectShockwave();

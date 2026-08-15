import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, cartSteeringInput, quickenCartSteering } from "./CartArenaSession";
import { aliveCartEnemies, type CartEnemyState } from "./CartCombat";
import {
  cartArenaContains,
  cartArenaPointInPortal,
  cartArenaShapeForNode,
} from "./CartArenaShapes";
import { getCartTurboCombatState } from "./CartRoguePhase15Turbo";
import {
  cartWorldNodeById,
  type CartWorldLocation,
  type CartWorldNode,
} from "./CartWorldGraph";

interface Phase23Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  location: CartWorldLocation;
  step(input: RallyInputState, fixedDelta?: number): void;
}

const GATE_PORTAL_BRIDGE_PADDING = 3.4;
const GATE_EDGE_MARGIN = 2.2;
const CORRIDOR_ENTRY_INSET = 0.45;

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nextCorridor(node: CartWorldNode): CartWorldNode | null {
  for (const nextId of node.next) {
    const next = cartWorldNodeById(nextId);
    if (next?.kind === "corridor") return next;
  }
  return null;
}

function bridgeOpenGateSeam(session: Phase23Session, input: RallyInputState): boolean {
  const node = session.location.node;
  if (!cartArenaShapeForNode(node.id)) return false;
  if (aliveCartEnemies(session.enemies, node.id).length > 0) return false;

  const corridor = nextCorridor(node);
  if (!corridor) return false;

  const x = session.car.position.x;
  const z = session.car.position.z;
  if (!cartArenaPointInPortal(node, x, z, GATE_PORTAL_BRIDGE_PADDING)) return false;
  if (cartArenaContains(node.id, x, z, GATE_EDGE_MARGIN)) return false;

  const toX = corridor.rect.centerX - x;
  const toZ = corridor.rect.centerZ - z;
  const distance = Math.hypot(toX, toZ) || 1;
  const forwardX = Math.sin(session.car.heading);
  const forwardZ = Math.cos(session.car.heading);
  const forwardDot = (forwardX * toX + forwardZ * toZ) / distance;
  const hasForwardIntent = input.throttle > 0.04 || Math.abs(session.car.forwardVelocity) > 0.6;
  if (!hasForwardIntent || forwardDot < 0.1) return false;

  const minX = corridor.rect.centerX - corridor.rect.halfWidth + CORRIDOR_ENTRY_INSET;
  const maxX = corridor.rect.centerX + corridor.rect.halfWidth - CORRIDOR_ENTRY_INSET;
  const minZ = corridor.rect.centerZ - corridor.rect.halfDepth + CORRIDOR_ENTRY_INSET;
  const maxZ = corridor.rect.centerZ + corridor.rect.halfDepth - CORRIDOR_ENTRY_INSET;
  const centerDx = corridor.rect.centerX - node.rect.centerX;
  const centerDz = corridor.rect.centerZ - node.rect.centerZ;

  let targetX = clamp(x, minX, maxX);
  let targetZ = clamp(z, minZ, maxZ);
  if (Math.abs(centerDz) >= Math.abs(centerDx)) {
    targetZ = centerDz >= 0 ? minZ : maxZ;
  } else {
    targetX = centerDx >= 0 ? minX : maxX;
  }

  session.car.position.x = targetX;
  session.car.position.z = targetZ;
  session.location = {
    node: corridor,
    localX: targetX - corridor.rect.centerX,
    localZ: targetZ - corridor.rect.centerZ,
  };
  return true;
}

function stopTurboHoldTranslation(session: Phase23Session): void {
  const car = session.car;
  car.forwardVelocity = 0;
  car.lateralVelocity = 0;
  car.velocity.x = 0;
  car.velocity.z = 0;
  car.speed = 0;
  car.boostActive = false;
  car.boostTimeRemaining = 0;
}

function applyStationaryTurboPivot(session: Phase23Session, input: RallyInputState, delta: number): void {
  const car = session.car;
  const steer = quickenCartSteering(cartSteeringInput(input.steer));
  const steerMagnitude = Math.abs(steer);
  const charge = getCartTurboCombatState(session as unknown as CartArenaSession).charge;

  if (steerMagnitude > 0.035) {
    const yawRate = (1.55 + charge * 1.15) * steerMagnitude;
    car.heading = normalizeAngle(car.heading + Math.sign(steer) * yawRate * delta);
    car.drifting = true;
  } else {
    car.drifting = false;
  }

  stopTurboHoldTranslation(session);
}

export function installCartRoguePhase23GateAndPivot(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase23Session;
  const originalStep = prototype.step;

  prototype.step = function phase23GateAndPivotStep(
    this: Phase23Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    const turboHeld = Boolean(input.boost);

    if (turboHeld) stopTurboHoldTranslation(this);

    const transformed = turboHeld
      ? { ...input, throttle: 0 }
      : input;

    originalStep.call(this, transformed, fixedDelta);

    if (turboHeld) {
      applyStationaryTurboPivot(this, input, fixedDelta);
    } else {
      bridgeOpenGateSeam(this, input);
    }
  };
}

installCartRoguePhase23GateAndPivot();

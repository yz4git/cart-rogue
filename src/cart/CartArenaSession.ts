import { RallyCar } from "../rally/RallyCar";
import { RallyFixedStepClock } from "../rally/RallySimulation";
import { RallyTrack } from "../rally/RallyTrack";
import type { RallyInputState } from "../rally/RallyTypes";
import { getRallyVehicleDefinition, type RallyVehicleId } from "../rally/VehicleDefinition";
import { CART_ARENA_TRACK } from "./CartArenaTrack";
import {
  aliveCartEnemies,
  applyTurboRam,
  cartEnemyContact,
  createInitialCartEnemies,
  updateCartEnemyMovement,
  type CartEnemyState,
} from "./CartCombat";
import {
  cartResourceContact,
  createInitialCartResources,
  type CartResourcePickupState,
} from "./CartResources";
import {
  CART_WORLD_GRAPH,
  cartWorldNodeById,
  locateCartWorldNode,
  type CartWorldLocation,
  type CartWorldNode,
} from "./CartWorldGraph";

export interface CartEnemySnapshot {
  id: string;
  nodeId: string;
  kind: "blocker" | "heavy" | "chaser" | "boss";
  x: number;
  z: number;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  heading: number;
}

export interface CartResourceSnapshot {
  id: string;
  nodeId: string;
  kind: "gas" | "turbo";
  x: number;
  z: number;
  radius: number;
  collected: boolean;
}

export interface CartArenaSessionSnapshot {
  nodeId: string;
  nodeKind: "arena" | "corridor" | "boss";
  encounter: "combat" | "elite" | "reward" | "boss" | "none";
  x: number;
  z: number;
  heading: number;
  speed: number;
  gas: number;
  boostCharges: number;
  maxBoostCharges: number;
  boostActive: boolean;
  turboRechargeProgress: number;
  turboRechargeSeconds: number;
  enemiesAlive: number;
  enemiesTotal: number;
  gateLocked: boolean;
  arena1GateLocked: boolean;
  arena2GateLocked: boolean;
  ramCombo: number;
  lastRamEnemyId: string | null;
  lastRamDamage: number;
  lastReward: string | null;
  wallSliding: boolean;
  bossHp: number;
  bossMaxHp: number;
  runComplete: boolean;
  enemies: readonly CartEnemySnapshot[];
  resources: readonly CartResourceSnapshot[];
}

const GAS_DRAIN_PER_SECOND = 0.0032;
const RAM_COMBO_WINDOW = 2.1;
export const CART_TURBO_RECHARGE_SECONDS = 3.0;
const WALL_MARGIN = 1.05;

export function cartSteeringInput(value: number): number {
  return -Math.max(-1, Math.min(1, value));
}

/**
 * Cart Rogue driving/combat runtime. RallyCar remains the proven low-level
 * vehicle implementation, while arena progression, renewable Turbo stocks,
 * pickups, encounters and forgiving wall-slide behavior live here.
 */
export class CartArenaSession {
  readonly track: RallyTrack;
  readonly car: RallyCar;
  readonly clock = new RallyFixedStepClock();
  readonly enemies: CartEnemyState[] = createInitialCartEnemies();
  readonly resources: CartResourcePickupState[] = createInitialCartResources();
  private location: CartWorldLocation;
  private gas = 1;
  private ramCombo = 0;
  private ramComboTimer = 0;
  private lastRamEnemyId: string | null = null;
  private lastRamDamage = 0;
  private turboRechargeTimer = 0;
  private rewardTimer = 0;
  private lastReward: string | null = null;
  private wallSlideTimer = 0;
  private readonly rewardedNodes = new Set<string>();
  private readonly enemyHitCooldowns = new Map<string, number>();

  constructor(vehicleId: RallyVehicleId = "compact") {
    this.track = new RallyTrack(CART_ARENA_TRACK);
    this.car = new RallyCar(this.track, getRallyVehicleDefinition(vehicleId), "player");
    this.car.setHoverMode(false);
    this.car.setBoostChargeMode(true);
    this.car.damageEnabled = true;
    this.car.reset();
    this.location = locateCartWorldNode(this.car.position.x, this.car.position.z)
      ?? {
        node: cartWorldNodeById(CART_WORLD_GRAPH.startNodeId) as NonNullable<ReturnType<typeof cartWorldNodeById>>,
        localX: 0,
        localZ: 0,
      };
  }

  advance(elapsedSeconds: number, input: RallyInputState): number {
    return this.clock.advance(elapsedSeconds, (fixedDelta) => this.step(input, fixedDelta));
  }

  step(input: RallyInputState, fixedDelta = this.clock.step): void {
    const previousX = this.car.position.x;
    const previousZ = this.car.position.z;
    const activeInput: RallyInputState = {
      ...input,
      steer: cartSteeringInput(input.steer),
      throttle: this.gas > 0 ? input.throttle : 0,
      boost: this.gas > 0 ? input.boost : false,
    };

    this.car.update(activeInput, fixedDelta, true);
    this.updateTurboRecharge(fixedDelta);
    this.gas = Math.max(0, this.gas - Math.max(0, activeInput.throttle) * GAS_DRAIN_PER_SECOND * fixedDelta);
    this.ramComboTimer = Math.max(0, this.ramComboTimer - fixedDelta);
    if (this.ramComboTimer <= 0) this.ramCombo = 0;
    this.rewardTimer = Math.max(0, this.rewardTimer - fixedDelta);
    if (this.rewardTimer <= 0) this.lastReward = null;
    this.wallSlideTimer = Math.max(0, this.wallSlideTimer - fixedDelta);
    for (const [id, remaining] of this.enemyHitCooldowns) {
      const next = remaining - fixedDelta;
      if (next <= 0) this.enemyHitCooldowns.delete(id);
      else this.enemyHitCooldowns.set(id, next);
    }

    let nextLocation = locateCartWorldNode(this.car.position.x, this.car.position.z);
    if (!nextLocation) {
      this.slideAlongBoundary(previousX, previousZ);
      nextLocation = locateCartWorldNode(this.car.position.x, this.car.position.z) ?? this.location;
    }

    if (this.isNodeGateLocked(this.location.node.id) && this.isNextNode(this.location.node, nextLocation.node.id)) {
      this.slideAlongLockedGate(previousX, previousZ);
      nextLocation = locateCartWorldNode(this.car.position.x, this.car.position.z) ?? this.location;
    }

    this.location = nextLocation;
    this.collectNearbyResources();

    if (this.location.node.kind === "arena" || this.location.node.kind === "boss") {
      updateCartEnemyMovement(
        this.enemies,
        this.location.node.id,
        this.car.position.x,
        this.car.position.z,
        fixedDelta,
        this.location.node.rect,
      );
    }

    const contact = aliveCartEnemies(this.enemies, this.location.node.id)
      .find((enemy) => cartEnemyContact(enemy, this.car.position.x, this.car.position.z));
    if (contact && !this.enemyHitCooldowns.has(contact.id)) {
      const result = applyTurboRam(contact, this.car.boostActive, this.car.forwardVelocity);
      if (result.damage > 0) {
        this.enemyHitCooldowns.set(contact.id, contact.kind === "boss" ? 0.42 : 0.34);
        this.lastRamEnemyId = result.enemyId;
        this.lastRamDamage = result.damage;
        this.car.collisionImpact = Math.max(this.car.collisionImpact, result.destroyed ? 1 : 0.78);
        this.car.forwardVelocity *= result.destroyed ? 0.94 : contact.kind === "boss" ? 0.72 : 0.78;
        contact.x += Math.sin(this.car.heading) * (result.destroyed ? 0.5 : contact.kind === "boss" ? 0.8 : 1.4);
        contact.z += Math.cos(this.car.heading) * (result.destroyed ? 0.5 : contact.kind === "boss" ? 0.8 : 1.4);
        if (result.destroyed) {
          this.car.ramCount += 1;
          const gasReward = contact.kind === "boss" ? 0.1 : contact.kind === "heavy" ? 0.055 : 0.035;
          this.gas = Math.min(1, this.gas + gasReward);
          this.ramCombo = this.ramComboTimer > 0 ? Math.min(9, this.ramCombo + 1) : 1;
          this.ramComboTimer = RAM_COMBO_WINDOW;
        }
      } else {
        this.slideAroundEnemy(contact, previousX, previousZ);
      }
    }

    this.grantClearReward(this.location.node.id);
  }

  snapshot(): CartArenaSessionSnapshot {
    const enemies = this.enemies.map((enemy) => ({
      id: enemy.id,
      nodeId: enemy.nodeId,
      kind: enemy.kind,
      x: enemy.x,
      z: enemy.z,
      radius: enemy.radius,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      alive: enemy.alive,
      heading: enemy.heading,
    }));
    const resources = this.resources.map((pickup) => ({ ...pickup }));
    const localEnemies = this.enemies.filter((enemy) => enemy.nodeId === this.location.node.id);
    const localAlive = localEnemies.filter((enemy) => enemy.alive).length;
    const rechargeProgress = this.car.boostCharges >= this.car.maxBoostCharges
      ? 1
      : Math.min(1, this.turboRechargeTimer / CART_TURBO_RECHARGE_SECONDS);
    const boss = this.enemies.find((enemy) => enemy.kind === "boss");
    return {
      nodeId: this.location.node.id,
      nodeKind: this.location.node.kind,
      encounter: this.location.node.encounter,
      x: this.car.position.x,
      z: this.car.position.z,
      heading: this.car.heading,
      speed: this.car.speed,
      gas: this.gas,
      boostCharges: this.car.boostCharges,
      maxBoostCharges: this.car.maxBoostCharges,
      boostActive: this.car.boostActive,
      turboRechargeProgress: rechargeProgress,
      turboRechargeSeconds: this.car.boostCharges >= this.car.maxBoostCharges
        ? 0
        : Math.max(0, CART_TURBO_RECHARGE_SECONDS - this.turboRechargeTimer),
      enemiesAlive: localAlive,
      enemiesTotal: localEnemies.length,
      gateLocked: this.isNodeGateLocked(this.location.node.id),
      arena1GateLocked: this.isNodeGateLocked("arena-01"),
      arena2GateLocked: this.isNodeGateLocked("arena-02"),
      ramCombo: this.ramCombo,
      lastRamEnemyId: this.lastRamEnemyId,
      lastRamDamage: this.lastRamDamage,
      lastReward: this.lastReward,
      wallSliding: this.wallSlideTimer > 0,
      bossHp: boss?.hp ?? 0,
      bossMaxHp: boss?.maxHp ?? 0,
      runComplete: Boolean(boss && !boss.alive),
      enemies,
      resources,
    };
  }

  private updateTurboRecharge(delta: number): void {
    if (this.car.boostCharges >= this.car.maxBoostCharges) {
      this.turboRechargeTimer = 0;
      return;
    }
    this.turboRechargeTimer += delta;
    while (this.turboRechargeTimer >= CART_TURBO_RECHARGE_SECONDS && this.car.boostCharges < this.car.maxBoostCharges) {
      this.turboRechargeTimer -= CART_TURBO_RECHARGE_SECONDS;
      this.car.addBoostCharge(1);
    }
    if (this.car.boostCharges >= this.car.maxBoostCharges) this.turboRechargeTimer = 0;
  }

  private collectNearbyResources(): void {
    for (const pickup of this.resources) {
      if (!cartResourceContact(pickup, this.location.node.id, this.car.position.x, this.car.position.z)) continue;
      if (pickup.kind === "gas") {
        if (this.gas >= 0.995) continue;
        pickup.collected = true;
        this.gas = Math.min(1, this.gas + 0.12);
        this.lastReward = "GAS CELL · +12%";
        this.rewardTimer = 1.6;
        continue;
      }
      if (this.car.boostCharges >= this.car.maxBoostCharges) continue;
      pickup.collected = true;
      this.car.addBoostCharge(1);
      this.lastReward = "TURBO CELL · +1 STOCK";
      this.rewardTimer = 1.6;
    }
  }

  private isNodeGateLocked(nodeId: string): boolean {
    const node = cartWorldNodeById(nodeId);
    if (!node || !node.next.some((nextId) => cartWorldNodeById(nextId)?.kind === "corridor")) return false;
    return aliveCartEnemies(this.enemies, nodeId).length > 0;
  }

  private isNextNode(node: CartWorldNode, candidateId: string): boolean {
    return node.next.includes(candidateId);
  }

  private grantClearReward(nodeId: string): void {
    if (this.rewardedNodes.has(nodeId)) return;
    const authored = this.enemies.filter((enemy) => enemy.nodeId === nodeId);
    if (authored.length === 0 || authored.some((enemy) => enemy.alive)) return;
    this.rewardedNodes.add(nodeId);
    if (nodeId === "boss-01") {
      this.gas = Math.min(1, this.gas + 0.1);
      this.lastReward = "BOSS DOWN · RUN CLEAR";
      this.rewardTimer = 4;
      return;
    }
    const elite = nodeId === "arena-02";
    this.gas = Math.min(1, this.gas + (elite ? 0.18 : 0.1));
    this.car.addBoostCharge(elite ? 2 : 1);
    this.lastReward = elite ? "ELITE CLEAR · GAS +18% · TURBO +2" : "ARENA CLEAR · GAS +10% · TURBO +1";
    this.rewardTimer = 2.8;
  }

  private slideAlongBoundary(previousX: number, previousZ: number): void {
    const rect = this.location.node.rect;
    const attemptedX = this.car.position.x;
    const attemptedZ = this.car.position.z;
    const minX = rect.centerX - rect.halfWidth + WALL_MARGIN;
    const maxX = rect.centerX + rect.halfWidth - WALL_MARGIN;
    const minZ = rect.centerZ - rect.halfDepth + WALL_MARGIN;
    const maxZ = rect.centerZ + rect.halfDepth - WALL_MARGIN;
    const clampedX = Math.max(minX, Math.min(maxX, attemptedX));
    const clampedZ = Math.max(minZ, Math.min(maxZ, attemptedZ));
    const hitX = Math.abs(clampedX - attemptedX) > 1e-6;
    const hitZ = Math.abs(clampedZ - attemptedZ) > 1e-6;
    this.car.position.x = clampedX;
    this.car.position.z = clampedZ;

    if (hitX || hitZ) {
      const dx = attemptedX - previousX;
      const dz = attemptedZ - previousZ;
      const targetHeading = hitX && !hitZ
        ? this.closestHeading([0, Math.PI])
        : hitZ && !hitX
          ? this.closestHeading([Math.PI / 2, -Math.PI / 2])
          : Math.abs(dx) > Math.abs(dz)
            ? this.closestHeading([0, Math.PI])
            : this.closestHeading([Math.PI / 2, -Math.PI / 2]);
      this.car.heading = rotateToward(this.car.heading, targetHeading, 0.34);
      this.car.forwardVelocity *= 0.92;
      this.car.lateralVelocity *= 0.28;
      const speed = Math.max(3.5, Math.abs(this.car.forwardVelocity));
      this.car.velocity.x = Math.sin(this.car.heading) * speed;
      this.car.velocity.z = Math.cos(this.car.heading) * speed;
      this.car.collisionImpact = Math.max(this.car.collisionImpact, 0.34);
      this.wallSlideTimer = 0.22;
    }
  }

  private slideAlongLockedGate(previousX: number, previousZ: number): void {
    const rect = this.location.node.rect;
    this.car.position.z = rect.centerZ + rect.halfDepth - WALL_MARGIN;
    this.car.position.x = Math.max(
      rect.centerX - rect.halfWidth + WALL_MARGIN,
      Math.min(rect.centerX + rect.halfWidth - WALL_MARGIN, this.car.position.x),
    );
    const dx = this.car.position.x - previousX;
    const targetHeading = Math.abs(dx) > 0.02
      ? (dx >= 0 ? Math.PI / 2 : -Math.PI / 2)
      : this.closestHeading([Math.PI / 2, -Math.PI / 2]);
    this.car.heading = rotateToward(this.car.heading, targetHeading, 0.38);
    this.car.forwardVelocity *= 0.9;
    this.car.lateralVelocity *= 0.24;
    this.car.collisionImpact = Math.max(this.car.collisionImpact, 0.42);
    this.wallSlideTimer = 0.24;
  }

  private slideAroundEnemy(enemy: CartEnemyState, previousX: number, previousZ: number): void {
    const dx = previousX - enemy.x;
    const dz = previousZ - enemy.z;
    const distance = Math.max(0.001, Math.hypot(dx, dz));
    const safeRadius = enemy.radius + 1.52;
    this.car.position.x = enemy.x + dx / distance * safeRadius;
    this.car.position.z = enemy.z + dz / distance * safeRadius;
    const tangentA = Math.atan2(dz, -dx);
    const tangentB = normalizeAngle(tangentA + Math.PI);
    this.car.heading = rotateToward(this.car.heading, this.closestHeading([tangentA, tangentB]), 0.3);
    this.car.forwardVelocity *= enemy.kind === "boss" ? 0.78 : 0.86;
    this.car.lateralVelocity *= 0.3;
    this.car.collisionImpact = Math.max(this.car.collisionImpact, enemy.kind === "boss" ? 0.7 : 0.5);
  }

  private closestHeading(candidates: readonly number[]): number {
    let best = candidates[0] ?? this.car.heading;
    let bestDifference = Math.abs(normalizeAngle(best - this.car.heading));
    for (const candidate of candidates.slice(1)) {
      const difference = Math.abs(normalizeAngle(candidate - this.car.heading));
      if (difference < bestDifference) {
        best = candidate;
        bestDifference = difference;
      }
    }
    return best;
  }

  dispose(): void {
    this.car.dispose();
    this.track.dispose();
  }
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function rotateToward(current: number, target: number, maxAmount: number): number {
  const difference = normalizeAngle(target - current);
  return normalizeAngle(current + Math.max(-maxAmount, Math.min(maxAmount, difference)));
}

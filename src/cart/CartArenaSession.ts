import { RallyCar } from "../rally/RallyCar";
import { RallyFixedStepClock } from "../rally/RallySimulation";
import { RallyTrack } from "../rally/RallyTrack";
import type { RallyInputState } from "../rally/RallyTypes";
import { getRallyVehicleDefinition, type RallyVehicleId } from "../rally/VehicleDefinition";
import { CART_ARENA_TRACK } from "./CartArenaTrack";
import {
  aliveCartEnemies,
  applyTurboRam,
  breakHeavyParallelContact,
  cartEnemyContact,
  createInitialCartEnemies,
  updateCartEnemyMovement,
  type CartEnemyState,
} from "./CartCombat";
import {
  applyTurboRockSmash,
  cartObstacleSweepContact,
  createInitialCartObstacles,
  type CartObstacleState,
} from "./CartObstacles";
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
  type CartWorldNodeKind,
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

export interface CartObstacleSnapshot {
  id: string;
  nodeId: string;
  kind: "rock";
  x: number;
  z: number;
  radius: number;
  scale: number;
  variant: 0 | 1 | 2;
  destroyed: boolean;
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
  obstacles: readonly CartObstacleSnapshot[];
}

const GAS_DRAIN_PER_SECOND = 0.0032;
const RAM_COMBO_WINDOW = 2.65;
export const CART_TURBO_RECHARGE_SECONDS = 3.0;
const WALL_MARGIN = 1.05;
const CORNER_RELEASE_NUDGE = 0.72;
const ARENA_MAX_SPEED = 20;
const CORRIDOR_MAX_SPEED = 24;
const BOSS_MAX_SPEED = 19;
const ARENA_HANDLING_MULTIPLIER = 1.52;
const CORRIDOR_HANDLING_MULTIPLIER = 1.16;
const BOSS_HANDLING_MULTIPLIER = 1.46;
const MAX_FLOW_RECHARGE_MULTIPLIER = 1.62;

export function cartSteeringInput(value: number): number {
  return -Math.max(-1, Math.min(1, value));
}

export function quickenCartSteering(value: number): number {
  const clamped = Math.max(-1, Math.min(1, value));
  const magnitude = Math.abs(clamped);
  const quicker = Math.min(1, magnitude * 1.42 + magnitude * magnitude * 0.2);
  return Math.sign(clamped) * quicker;
}

export function cartHandlingMultiplier(kind: CartWorldNodeKind): number {
  return kind === "corridor"
    ? CORRIDOR_HANDLING_MULTIPLIER
    : kind === "boss"
      ? BOSS_HANDLING_MULTIPLIER
      : ARENA_HANDLING_MULTIPLIER;
}

export function cartTurboRechargeMultiplier(ramCombo: number): number {
  return Math.min(MAX_FLOW_RECHARGE_MULTIPLIER, 1 + Math.max(0, ramCombo - 1) * 0.14);
}

export function cartArcadeTurnAssistRate(
  kind: CartWorldNodeKind,
  speed: number,
  boostActive: boolean,
  brake: number,
  steerMagnitude: number,
): number {
  const absoluteSpeed = Math.abs(speed);
  const referenceSpeed = kind === "corridor" ? CORRIDOR_MAX_SPEED : kind === "boss" ? BOSS_MAX_SPEED : ARENA_MAX_SPEED;
  const speedRatio = Math.max(0, Math.min(1, absoluteSpeed / Math.max(1, referenceSpeed)));
  const baseRate = kind === "corridor" ? 0.46 : kind === "boss" ? 0.82 : 0.94;
  const lowSpeedAssist = 1.28 - speedRatio * 0.42;
  const turboAssist = boostActive ? 1.13 : 1;
  const brakePivot = brake > 0.18 ? 1.42 : 1;
  const steerScale = Math.max(0, Math.min(1, steerMagnitude * 1.18));
  return baseRate * lowSpeedAssist * turboAssist * brakePivot * steerScale;
}

/**
 * Cart Rogue driving/combat runtime. RallyCar remains the proven low-level
 * vehicle implementation, while arena progression, renewable Turbo stocks,
 * solid/destructible obstacles, encounters and forgiving arcade handling live here.
 */
export class CartArenaSession {
  readonly track: RallyTrack;
  readonly car: RallyCar;
  readonly clock = new RallyFixedStepClock();
  readonly enemies: CartEnemyState[] = createInitialCartEnemies();
  readonly resources: CartResourcePickupState[] = createInitialCartResources();
  readonly obstacles: CartObstacleState[] = createInitialCartObstacles();
  private readonly baseHandling: number;
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
  private readonly obstacleHitCooldowns = new Map<string, number>();

  constructor(vehicleId: RallyVehicleId = "compact") {
    this.track = new RallyTrack(CART_ARENA_TRACK);
    const baseDefinition = getRallyVehicleDefinition(vehicleId);
    this.baseHandling = baseDefinition.handling;
    this.car = new RallyCar(this.track, { ...baseDefinition }, "player");
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
    this.applyDriveProfile(this.location.node.kind);
  }

  advance(elapsedSeconds: number, input: RallyInputState): number {
    return this.clock.advance(elapsedSeconds, (fixedDelta) => this.step(input, fixedDelta));
  }

  step(input: RallyInputState, fixedDelta = this.clock.step): void {
    const previousX = this.car.position.x;
    const previousZ = this.car.position.z;
    this.applyDriveProfile(this.location.node.kind);
    const activeInput: RallyInputState = {
      ...input,
      steer: quickenCartSteering(cartSteeringInput(input.steer)),
      throttle: this.gas > 0 ? input.throttle : 0,
      boost: this.gas > 0 ? input.boost : false,
    };

    this.car.update(activeInput, fixedDelta, true);
    this.applyArcadeTurnAssist(activeInput.steer, activeInput.brake, fixedDelta);
    this.updateTurboRecharge(fixedDelta * cartTurboRechargeMultiplier(this.ramCombo));
    this.gas = Math.max(0, this.gas - Math.max(0, activeInput.throttle) * GAS_DRAIN_PER_SECOND * fixedDelta);
    this.ramComboTimer = Math.max(0, this.ramComboTimer - fixedDelta);
    if (this.ramComboTimer <= 0) this.ramCombo = 0;
    this.rewardTimer = Math.max(0, this.rewardTimer - fixedDelta);
    if (this.rewardTimer <= 0) this.lastReward = null;
    this.wallSlideTimer = Math.max(0, this.wallSlideTimer - fixedDelta);
    this.tickCooldowns(this.enemyHitCooldowns, fixedDelta);
    this.tickCooldowns(this.obstacleHitCooldowns, fixedDelta);

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
    this.applyDriveProfile(this.location.node.kind);
    this.resolveObstacleCollisions(previousX, previousZ);
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
      .find((enemy) => !this.enemyHitCooldowns.has(enemy.id)
        && cartEnemyContact(enemy, this.car.position.x, this.car.position.z));
    if (contact) {
      const ramImpactSpeed = this.car.boostActive
        ? Math.max(8, Math.abs(this.car.forwardVelocity))
        : this.car.forwardVelocity;
      const result = applyTurboRam(contact, this.car.boostActive, ramImpactSpeed);
      if (result.damage > 0) {
        this.enemyHitCooldowns.set(contact.id, contact.kind === "boss" ? 0.42 : 0.34);
        this.lastRamEnemyId = result.enemyId;
        this.lastRamDamage = result.damage;
        this.car.collisionImpact = Math.max(this.car.collisionImpact, result.destroyed ? 1 : 0.88);
        if (result.destroyed) {
          const attackCap = this.car.definition.maxSpeed * 1.4;
          this.car.forwardVelocity = Math.min(attackCap, Math.max(0, this.car.forwardVelocity) * 0.99 + 0.8);
        } else {
          this.car.forwardVelocity *= contact.kind === "boss" ? 0.82 : contact.kind === "heavy" ? 0.86 : 0.9;
        }
        contact.x += Math.sin(this.car.heading) * (result.destroyed ? 0.75 : contact.kind === "boss" ? 1.35 : 1.75);
        contact.z += Math.cos(this.car.heading) * (result.destroyed ? 0.75 : contact.kind === "boss" ? 1.35 : 1.75);
        breakHeavyParallelContact(contact, this.car.heading);
        if (this.car.boostActive) {
          this.car.boostTimeRemaining = Math.min(3.2, this.car.boostTimeRemaining + (result.destroyed ? 0.2 : 0.07));
        }
        if (result.destroyed) {
          this.car.ramCount += 1;
          const gasReward = contact.kind === "boss" ? 0.1 : contact.kind === "heavy" ? 0.055 : 0.035;
          this.gas = Math.min(1, this.gas + gasReward);
          this.registerFlowSmash(contact.kind === "boss" ? 0.12 : contact.kind === "heavy" ? 0.1 : 0.08);
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
    const obstacles = this.obstacles.map((obstacle) => ({ ...obstacle }));
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
      obstacles,
    };
  }

  private applyDriveProfile(kind: CartWorldNodeKind): void {
    this.car.definition.maxSpeed = kind === "corridor"
      ? CORRIDOR_MAX_SPEED
      : kind === "boss"
        ? BOSS_MAX_SPEED
        : ARENA_MAX_SPEED;
    this.car.definition.handling = this.baseHandling * cartHandlingMultiplier(kind);
  }

  private applyArcadeTurnAssist(steer: number, brake: number, delta: number): void {
    const steerMagnitude = Math.abs(steer);
    if (steerMagnitude < 0.05 || Math.abs(this.car.forwardVelocity) < 1.2) return;
    const rate = cartArcadeTurnAssistRate(
      this.location.node.kind,
      this.car.forwardVelocity,
      this.car.boostActive,
      brake,
      steerMagnitude,
    );
    const direction = Math.sign(this.car.forwardVelocity || 1);
    this.car.heading = normalizeAngle(this.car.heading + Math.sign(steer) * direction * rate * delta);
    const gripBase = brake > 0.18 ? 0.76 : this.car.boostActive ? 0.84 : 0.88;
    const gripPower = Math.max(0.2, steerMagnitude) * delta * 60;
    this.car.lateralVelocity *= Math.pow(gripBase, gripPower);
    this.syncHorizontalVelocity();
  }

  private registerFlowSmash(extraBoostSeconds = 0): void {
    this.ramCombo = this.ramComboTimer > 0 ? Math.min(9, this.ramCombo + 1) : 1;
    this.ramComboTimer = RAM_COMBO_WINDOW;
    if (extraBoostSeconds > 0 && this.car.boostActive) {
      this.car.boostTimeRemaining = Math.min(3.2, this.car.boostTimeRemaining + extraBoostSeconds);
    }
  }

  private tickCooldowns(cooldowns: Map<string, number>, delta: number): void {
    for (const [id, remaining] of cooldowns) {
      const next = remaining - delta;
      if (next <= 0) cooldowns.delete(id);
      else cooldowns.set(id, next);
    }
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

  private resolveObstacleCollisions(previousX: number, previousZ: number): void {
    const obstacle = this.obstacles.find((candidate) =>
      !this.obstacleHitCooldowns.has(candidate.id)
      && cartObstacleSweepContact(
        candidate,
        this.location.node.id,
        previousX,
        previousZ,
        this.car.position.x,
        this.car.position.z,
      ));
    if (!obstacle) return;

    const result = applyTurboRockSmash(obstacle, this.car.boostActive, this.car.forwardVelocity);
    if (result.destroyed) {
      this.obstacleHitCooldowns.set(obstacle.id, 0.3);
      this.car.destructionCount += 1;
      this.car.collisionImpact = Math.max(this.car.collisionImpact, 1);
      const attackCap = this.car.definition.maxSpeed * 1.4;
      this.car.forwardVelocity = Math.min(attackCap, Math.max(0, this.car.forwardVelocity) * 0.99 + 0.55);
      this.gas = Math.min(1, this.gas + 0.02);
      this.registerFlowSmash(0.08);
      this.lastReward = this.ramCombo > 1 ? `ROCK SMASH · FLOW ×${this.ramCombo}` : "ROCK SMASH · GAS +2%";
      this.rewardTimer = 1.35;
      return;
    }

    this.obstacleHitCooldowns.set(obstacle.id, 0.12);
    this.slideAroundObstacle(obstacle, previousX, previousZ);
    this.lastReward = "ROCK BLOCKED · USE TURBO";
    this.rewardTimer = 0.75;
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

    if (!hitX && !hitZ) return;

    const atXEdge = Math.abs(clampedX - minX) < 0.06 || Math.abs(clampedX - maxX) < 0.06;
    const atZEdge = Math.abs(clampedZ - minZ) < 0.06 || Math.abs(clampedZ - maxZ) < 0.06;
    if (atXEdge && atZEdge) {
      const inwardX = Math.abs(clampedX - minX) < Math.abs(clampedX - maxX) ? 1 : -1;
      const inwardZ = Math.abs(clampedZ - minZ) < Math.abs(clampedZ - maxZ) ? 1 : -1;
      this.car.position.x = Math.max(minX, Math.min(maxX, clampedX + inwardX * CORNER_RELEASE_NUDGE));
      this.car.position.z = Math.max(minZ, Math.min(maxZ, clampedZ + inwardZ * CORNER_RELEASE_NUDGE));
      const targetHeading = Math.atan2(inwardX, inwardZ);
      this.car.heading = rotateToward(this.car.heading, targetHeading, 0.82);
      this.car.forwardVelocity = Math.max(4.5, Math.abs(this.car.forwardVelocity) * 0.9);
      this.car.lateralVelocity *= 0.1;
      this.syncHorizontalVelocity();
      this.car.collisionImpact = Math.max(this.car.collisionImpact, 0.44);
      this.wallSlideTimer = 0.34;
      return;
    }

    const dx = attemptedX - previousX;
    const dz = attemptedZ - previousZ;
    const targetHeading = hitX
      ? this.closestHeading([0, Math.PI])
      : hitZ
        ? this.closestHeading([Math.PI / 2, -Math.PI / 2])
        : Math.abs(dx) > Math.abs(dz)
          ? this.closestHeading([0, Math.PI])
          : this.closestHeading([Math.PI / 2, -Math.PI / 2]);
    this.car.heading = rotateToward(this.car.heading, targetHeading, 0.48);
    this.car.forwardVelocity *= 0.94;
    this.car.lateralVelocity *= 0.2;
    this.car.forwardVelocity = Math.max(3.8, Math.abs(this.car.forwardVelocity));
    this.syncHorizontalVelocity();
    this.car.collisionImpact = Math.max(this.car.collisionImpact, 0.34);
    this.wallSlideTimer = 0.24;
  }

  private slideAlongLockedGate(previousX: number, previousZ: number): void {
    const rect = this.location.node.rect;
    const minX = rect.centerX - rect.halfWidth + WALL_MARGIN;
    const maxX = rect.centerX + rect.halfWidth - WALL_MARGIN;
    this.car.position.z = rect.centerZ + rect.halfDepth - WALL_MARGIN;
    this.car.position.x = Math.max(minX, Math.min(maxX, this.car.position.x));
    const nearSide = Math.min(this.car.position.x - minX, maxX - this.car.position.x) < 0.75;
    if (nearSide) {
      const inwardX = this.car.position.x < rect.centerX ? 1 : -1;
      this.car.position.x += inwardX * 0.52;
      this.car.position.z -= 0.58;
      const targetHeading = Math.atan2(inwardX * 0.72, -1);
      this.car.heading = rotateToward(this.car.heading, targetHeading, 0.76);
    } else {
      const dx = this.car.position.x - previousX;
      const targetHeading = Math.abs(dx) > 0.02
        ? (dx >= 0 ? Math.PI / 2 : -Math.PI / 2)
        : this.closestHeading([Math.PI / 2, -Math.PI / 2]);
      this.car.heading = rotateToward(this.car.heading, targetHeading, 0.5);
    }
    this.car.forwardVelocity = Math.max(3.8, Math.abs(this.car.forwardVelocity) * 0.9);
    this.car.lateralVelocity *= 0.18;
    this.syncHorizontalVelocity();
    this.car.collisionImpact = Math.max(this.car.collisionImpact, 0.42);
    this.wallSlideTimer = 0.28;
  }

  private slideAroundObstacle(obstacle: CartObstacleState, previousX: number, previousZ: number): void {
    let dx = previousX - obstacle.x;
    let dz = previousZ - obstacle.z;
    let distance = Math.hypot(dx, dz);
    if (distance < 0.001) {
      dx = -Math.sin(this.car.heading);
      dz = -Math.cos(this.car.heading);
      distance = 1;
    }
    const normalX = dx / distance;
    const normalZ = dz / distance;
    const safeRadius = obstacle.radius + 1.62;
    this.car.position.x = obstacle.x + normalX * safeRadius;
    this.car.position.z = obstacle.z + normalZ * safeRadius;
    const tangentA = Math.atan2(-normalZ, normalX);
    const tangentB = normalizeAngle(tangentA + Math.PI);
    this.car.heading = rotateToward(this.car.heading, this.closestHeading([tangentA, tangentB]), 0.56);
    this.car.forwardVelocity = Math.max(3.2, Math.abs(this.car.forwardVelocity) * 0.72);
    this.car.lateralVelocity *= 0.14;
    this.syncHorizontalVelocity();
    this.car.collisionImpact = Math.max(this.car.collisionImpact, 0.62);
  }

  private slideAroundEnemy(enemy: CartEnemyState, previousX: number, previousZ: number): void {
    let dx = previousX - enemy.x;
    let dz = previousZ - enemy.z;
    let distance = Math.hypot(dx, dz);
    if (distance < 0.001) {
      dx = -Math.sin(this.car.heading);
      dz = -Math.cos(this.car.heading);
      distance = 1;
    }
    const normalX = dx / distance;
    const normalZ = dz / distance;
    const heavyLike = enemy.kind === "heavy" || enemy.kind === "boss";
    const safeRadius = enemy.radius + (heavyLike ? 1.78 : 1.52);
    this.car.position.x = enemy.x + normalX * safeRadius;
    this.car.position.z = enemy.z + normalZ * safeRadius;

    if (heavyLike) {
      breakHeavyParallelContact(enemy, this.car.heading);
      enemy.x -= normalX * (enemy.kind === "boss" ? 0.28 : 0.38);
      enemy.z -= normalZ * (enemy.kind === "boss" ? 0.28 : 0.38);
      const awayHeading = Math.atan2(normalX, normalZ);
      const offsetA = normalizeAngle(awayHeading + 0.42);
      const offsetB = normalizeAngle(awayHeading - 0.42);
      this.car.heading = rotateToward(this.car.heading, this.closestHeading([offsetA, offsetB]), 0.72);
      this.car.forwardVelocity = Math.max(3.1, Math.abs(this.car.forwardVelocity) * (enemy.kind === "boss" ? 0.7 : 0.76));
      this.car.lateralVelocity *= 0.12;
    } else {
      const tangentA = Math.atan2(normalZ, -normalX);
      const tangentB = normalizeAngle(tangentA + Math.PI);
      this.car.heading = rotateToward(this.car.heading, this.closestHeading([tangentA, tangentB]), 0.42);
      this.car.forwardVelocity = Math.max(3.2, Math.abs(this.car.forwardVelocity) * 0.9);
      this.car.lateralVelocity *= 0.2;
    }
    this.syncHorizontalVelocity();
    this.car.collisionImpact = Math.max(this.car.collisionImpact, enemy.kind === "boss" ? 0.74 : heavyLike ? 0.64 : 0.52);
  }

  private syncHorizontalVelocity(): void {
    const forwardX = Math.sin(this.car.heading);
    const forwardZ = Math.cos(this.car.heading);
    const rightX = Math.cos(this.car.heading);
    const rightZ = -Math.sin(this.car.heading);
    this.car.velocity.x = forwardX * this.car.forwardVelocity + rightX * this.car.lateralVelocity;
    this.car.velocity.z = forwardZ * this.car.forwardVelocity + rightZ * this.car.lateralVelocity;
    this.car.speed = Math.hypot(this.car.velocity.x, this.car.velocity.z);
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
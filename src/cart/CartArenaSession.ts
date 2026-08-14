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
  type CartEnemyState,
} from "./CartCombat";
import {
  CART_WORLD_GRAPH,
  cartWorldNodeById,
  locateCartWorldNode,
  type CartWorldLocation,
} from "./CartWorldGraph";

export interface CartEnemySnapshot {
  id: string;
  nodeId: string;
  kind: "blocker" | "heavy";
  x: number;
  z: number;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
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
  boostActive: boolean;
  enemiesAlive: number;
  enemiesTotal: number;
  gateLocked: boolean;
  ramCombo: number;
  lastRamEnemyId: string | null;
  enemies: readonly CartEnemySnapshot[];
}

const GAS_DRAIN_PER_SECOND = 0.0032;
const RAM_COMBO_WINDOW = 2.1;

/**
 * Cart Rogue driving/combat runtime. RallyCar remains the proven low-level
 * vehicle implementation, but race/checkpoint progression is absent. Combat
 * arenas own progression: defeat the local enemies with turbo rams, then the
 * narrow transition gate unlocks.
 */
export class CartArenaSession {
  readonly track: RallyTrack;
  readonly car: RallyCar;
  readonly clock = new RallyFixedStepClock();
  readonly enemies: CartEnemyState[] = createInitialCartEnemies();
  private location: CartWorldLocation;
  private gas = 1;
  private ramCombo = 0;
  private ramComboTimer = 0;
  private lastRamEnemyId: string | null = null;

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
      throttle: this.gas > 0 ? input.throttle : 0,
      boost: this.gas > 0 ? input.boost : false,
    };
    this.car.update(activeInput, fixedDelta, true);
    this.gas = Math.max(0, this.gas - Math.max(0, activeInput.throttle) * GAS_DRAIN_PER_SECOND * fixedDelta);
    this.ramComboTimer = Math.max(0, this.ramComboTimer - fixedDelta);
    if (this.ramComboTimer <= 0) this.ramCombo = 0;

    const nextLocation = locateCartWorldNode(this.car.position.x, this.car.position.z);
    if (!nextLocation) {
      this.blockMovement(previousX, previousZ, 0.32);
      return;
    }

    if (this.isGateLocked() && this.location.node.id === "arena-01" && nextLocation.node.id === "corridor-01") {
      this.blockMovement(previousX, previousZ, 0.52);
      return;
    }

    const contact = aliveCartEnemies(this.enemies, nextLocation.node.id)
      .find((enemy) => cartEnemyContact(enemy, this.car.position.x, this.car.position.z));
    if (contact) {
      const result = applyTurboRam(contact, this.car.boostActive, this.car.forwardVelocity);
      if (result.destroyed) {
        this.car.ramCount += 1;
        this.car.forwardVelocity *= 0.94;
        this.car.collisionImpact = Math.max(this.car.collisionImpact, 1);
        this.ramCombo = this.ramComboTimer > 0 ? Math.min(9, this.ramCombo + 1) : 1;
        this.ramComboTimer = RAM_COMBO_WINDOW;
        this.lastRamEnemyId = result.enemyId;
      } else {
        this.blockMovement(previousX, previousZ, 0.62);
        return;
      }
    }

    this.location = nextLocation;
  }

  snapshot(): CartArenaSessionSnapshot {
    const enemies = this.enemies.map((enemy) => ({ ...enemy }));
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
      boostActive: this.car.boostActive,
      enemiesAlive: aliveCartEnemies(this.enemies).length,
      enemiesTotal: this.enemies.length,
      gateLocked: this.isGateLocked(),
      ramCombo: this.ramCombo,
      lastRamEnemyId: this.lastRamEnemyId,
      enemies,
    };
  }

  private isGateLocked(): boolean {
    return aliveCartEnemies(this.enemies, "arena-01").length > 0;
  }

  private blockMovement(previousX: number, previousZ: number, impact: number): void {
    this.car.position.x = previousX;
    this.car.position.z = previousZ;
    this.car.forwardVelocity *= 0.36;
    this.car.lateralVelocity *= -0.14;
    this.car.velocity.x *= 0.3;
    this.car.velocity.z *= 0.3;
    this.car.collisionImpact = Math.max(this.car.collisionImpact, impact);
  }

  dispose(): void {
    this.car.dispose();
    this.track.dispose();
  }
}

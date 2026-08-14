import { RallyCar } from "../rally/RallyCar";
import { RallyFixedStepClock } from "../rally/RallySimulation";
import { RallyTrack } from "../rally/RallyTrack";
import type { RallyInputState } from "../rally/RallyTypes";
import { getRallyVehicleDefinition, type RallyVehicleId } from "../rally/VehicleDefinition";
import { CART_ARENA_TRACK } from "./CartArenaTrack";
import {
  CART_WORLD_GRAPH,
  cartWorldNodeById,
  locateCartWorldNode,
  type CartWorldLocation,
} from "./CartWorldGraph";

export interface CartArenaSessionSnapshot {
  nodeId: string;
  nodeKind: "arena" | "corridor" | "boss";
  encounter: "combat" | "elite" | "reward" | "boss" | "none";
  x: number;
  z: number;
  heading: number;
  speed: number;
  boostCharges: number;
  boostActive: boolean;
}

/**
 * First Cart Rogue driving runtime. It intentionally reuses RallyCar and the
 * hardened fixed-step clock while removing race/checkpoint progression from
 * the update loop. Arena/corridor geometry is authoritative for where the
 * player may drive.
 */
export class CartArenaSession {
  readonly track: RallyTrack;
  readonly car: RallyCar;
  readonly clock = new RallyFixedStepClock();
  private location: CartWorldLocation;

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
    this.car.update(input, fixedDelta, true);

    const nextLocation = locateCartWorldNode(this.car.position.x, this.car.position.z);
    if (!nextLocation) {
      // Arena borders are gameplay walls. Keep collision response deliberately
      // simple in Phase 1; RAM combat will replace this with authored wall
      // impact data in a later phase.
      this.car.position.x = previousX;
      this.car.position.z = previousZ;
      this.car.forwardVelocity *= 0.42;
      this.car.lateralVelocity *= -0.18;
      this.car.velocity.x *= 0.35;
      this.car.velocity.z *= 0.35;
      this.car.collisionImpact = Math.max(this.car.collisionImpact, 0.32);
      return;
    }
    this.location = nextLocation;
  }

  snapshot(): CartArenaSessionSnapshot {
    return {
      nodeId: this.location.node.id,
      nodeKind: this.location.node.kind,
      encounter: this.location.node.encounter,
      x: this.car.position.x,
      z: this.car.position.z,
      heading: this.car.heading,
      speed: this.car.speed,
      boostCharges: this.car.boostCharges,
      boostActive: this.car.boostActive,
    };
  }

  dispose(): void {
    this.car.dispose();
    this.track.dispose();
  }
}

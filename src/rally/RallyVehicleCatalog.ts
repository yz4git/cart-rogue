import { RALLY_VEHICLES, type RallyVehicleDefinition, type RallyVehicleId } from "./VehicleDefinition";

export function listRallyVehicles(): readonly RallyVehicleDefinition[] {
  return Object.values(RALLY_VEHICLES);
}

export function getRallyVehicle(id: RallyVehicleId): RallyVehicleDefinition {
  return RALLY_VEHICLES[id];
}

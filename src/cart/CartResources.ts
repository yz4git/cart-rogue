import { CART_WORLD_GRAPH } from "./CartWorldGraph";

export type CartResourceKind = "gas" | "turbo";

export interface CartResourcePickupState {
  id: string;
  nodeId: string;
  kind: CartResourceKind;
  x: number;
  z: number;
  radius: number;
  collected: boolean;
}

export function createInitialCartResources(): CartResourcePickupState[] {
  const pickups: CartResourcePickupState[] = [
    { id: "gas-01", nodeId: "corridor-01", kind: "gas", x: -2.3, z: 63, radius: 1.65, collected: false },
    { id: "turbo-01", nodeId: "corridor-01", kind: "turbo", x: 2.2, z: 80, radius: 1.65, collected: false },
    { id: "gas-02", nodeId: "corridor-02", kind: "gas", x: -7.5, z: 394, radius: 1.65, collected: false },
    { id: "turbo-02", nodeId: "corridor-02", kind: "turbo", x: 7.5, z: 408, radius: 1.65, collected: false },
  ];

  for (const node of CART_WORLD_GRAPH.nodes) {
    if (node.routeType === "service") {
      addPickup(pickups, `${node.id}-gas-a`, node.id, "gas", node.rect.centerX - 7, node.rect.centerZ - 6);
      addPickup(pickups, `${node.id}-gas-b`, node.id, "gas", node.rect.centerX + 6, node.rect.centerZ + 6);
      addPickup(pickups, `${node.id}-gas-c`, node.id, "gas", node.rect.centerX, node.rect.centerZ + 1);
      addPickup(pickups, `${node.id}-turbo-a`, node.id, "turbo", node.rect.centerX - 5, node.rect.centerZ + 8);
      addPickup(pickups, `${node.id}-turbo-b`, node.id, "turbo", node.rect.centerX + 5, node.rect.centerZ - 8);
    } else if (node.routeType === "event") {
      // TURBO STORM: a high-energy slalom with enough stocks to encourage smashing.
      addPickup(pickups, `${node.id}-storm-gas`, node.id, "gas", node.rect.centerX, node.rect.centerZ);
      addPickup(pickups, `${node.id}-storm-turbo-a`, node.id, "turbo", node.rect.centerX - 8, node.rect.centerZ - 8);
      addPickup(pickups, `${node.id}-storm-turbo-b`, node.id, "turbo", node.rect.centerX + 8, node.rect.centerZ);
      addPickup(pickups, `${node.id}-storm-turbo-c`, node.id, "turbo", node.rect.centerX - 5, node.rect.centerZ + 9);
    } else if (node.routeType === "scrap") {
      addPickup(pickups, `${node.id}-salvage-turbo-a`, node.id, "turbo", node.rect.centerX - 7, node.rect.centerZ - 8);
      addPickup(pickups, `${node.id}-salvage-turbo-b`, node.id, "turbo", node.rect.centerX + 7, node.rect.centerZ + 8);
    }
  }
  return pickups;
}

export function cartResourceContact(
  pickup: CartResourcePickupState,
  nodeId: string,
  x: number,
  z: number,
  carRadius = 1.35,
): boolean {
  if (pickup.collected || pickup.nodeId !== nodeId) return false;
  const dx = x - pickup.x;
  const dz = z - pickup.z;
  const radius = pickup.radius + carRadius;
  return dx * dx + dz * dz <= radius * radius;
}

function addPickup(
  pickups: CartResourcePickupState[],
  id: string,
  nodeId: string,
  kind: CartResourceKind,
  x: number,
  z: number,
): void {
  pickups.push({ id, nodeId, kind, x, z, radius: 1.65, collected: false });
}

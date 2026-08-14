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
  return [
    { id: "gas-01", nodeId: "corridor-01", kind: "gas", x: -2.3, z: 63, radius: 1.65, collected: false },
    { id: "turbo-01", nodeId: "corridor-01", kind: "turbo", x: 2.2, z: 80, radius: 1.65, collected: false },
    { id: "gas-02", nodeId: "corridor-02", kind: "gas", x: 2.1, z: 150, radius: 1.65, collected: false },
    { id: "turbo-02", nodeId: "corridor-02", kind: "turbo", x: -2.1, z: 173, radius: 1.65, collected: false },
  ];
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

import { RALLY_CONFIG } from "../rally/RallyConfig";
import { RallyCar } from "../rally/RallyCar";
import { CART_TURBO_HUNT_FIELD } from "./CartTurboHuntTrack";

interface RecoverableRallyCar {
  position: { x: number; y: number; z: number };
  isFiniteAndInRecoverableBounds(): boolean;
}

const HUNT_RECOVERY_MARGIN = 12;

export function cartPointInTurboHuntRecoveryBounds(x: number, y: number, z: number): boolean {
  return Number.isFinite(x)
    && Number.isFinite(y)
    && Number.isFinite(z)
    && x >= CART_TURBO_HUNT_FIELD.centerX - CART_TURBO_HUNT_FIELD.halfWidth - HUNT_RECOVERY_MARGIN
    && x <= CART_TURBO_HUNT_FIELD.centerX + CART_TURBO_HUNT_FIELD.halfWidth + HUNT_RECOVERY_MARGIN
    && z >= CART_TURBO_HUNT_FIELD.centerZ - CART_TURBO_HUNT_FIELD.halfDepth - HUNT_RECOVERY_MARGIN
    && z <= CART_TURBO_HUNT_FIELD.centerZ + CART_TURBO_HUNT_FIELD.halfDepth + HUNT_RECOVERY_MARGIN
    && y >= RALLY_CONFIG.vehicle.recoveryMinY
    && y <= RALLY_CONFIG.vehicle.recoveryMaxY;
}

export function installCartRoguePhase67HuntRecoveryBounds(): void {
  const prototype = RallyCar.prototype as unknown as RecoverableRallyCar;
  const previous = prototype.isFiniteAndInRecoverableBounds;
  prototype.isFiniteAndInRecoverableBounds = function turboHuntRecoveryBounds(this: RecoverableRallyCar): boolean {
    if (cartPointInTurboHuntRecoveryBounds(this.position.x, this.position.y, this.position.z)) return true;
    return previous.call(this);
  };
}

installCartRoguePhase67HuntRecoveryBounds();

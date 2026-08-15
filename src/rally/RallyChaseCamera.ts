import * as THREE from "three";
import { RallyCar } from "./RallyCar";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function approach(current: number, target: number, amount: number): number {
  if (current < target) return Math.min(target, current + amount);
  return Math.max(target, current - amount);
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export interface RallyRoadCameraAnchor {
  x: number;
  z: number;
}

/** Keep the road corridor stable while allowing lateral strafe to read. */
export function roadCenteredCameraAnchor(
  roadCenterX: number,
  roadCenterZ: number,
  playerX: number,
  playerZ: number,
  roadWeight = 0.65,
): RallyRoadCameraAnchor {
  const weight = clamp(roadWeight, 0, 1);
  return {
    x: roadCenterX * weight + playerX * (1 - weight),
    z: roadCenterZ * weight + playerZ * (1 - weight),
  };
}

export class RallyChaseCamera {
  readonly position = new THREE.Vector3();
  readonly target = new THREE.Vector3();
  fov = 58;

  private orbit = 0;
  private pitch = 0.28;
  private returnDelay = 0;
  private elapsed = 0;
  private initialized = false;
  private sensitivity = 1;
  private shakeEnabled = true;
  private previousSpeed = 0;
  private readonly forward = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();

  drag(deltaX: number, deltaY: number): void {
    this.orbit = clamp(this.orbit - deltaX * 0.006 * this.sensitivity, -0.72, 0.72);
    this.pitch = clamp(this.pitch - deltaY * 0.004 * this.sensitivity, -0.05, 0.72);
    this.returnDelay = 0.8;
  }

  setSensitivity(value: number): void { this.sensitivity = clamp(value, 0.5, 1.6); }
  setShakeEnabled(enabled: boolean): void { this.shakeEnabled = enabled; }

  update(car: RallyCar, deltaSeconds: number, roadHint?: {
    heading: number;
    strength: number;
    centerX?: number;
    centerZ?: number;
    aheadX?: number;
    aheadZ?: number;
  }): void {
    const delta = Math.min(0.05, Math.max(0, deltaSeconds));
    this.elapsed += delta;
    this.returnDelay = Math.max(0, this.returnDelay - delta);
    if (this.returnDelay === 0) {
      this.orbit = approach(this.orbit, 0, delta * 0.55);
      this.pitch = approach(this.pitch, 0.28, delta * 0.28);
    }

    const speedFactor = Math.min(1, Math.abs(car.speed) / 56);
    const speedChange = delta > 0 ? (Math.abs(car.speed) - this.previousSpeed) / delta : 0;
    this.previousSpeed = Math.abs(car.speed);
    const accelerationPull = clamp(speedChange * 0.025, -0.65, 0.9);
    const hintStrength = clamp(roadHint?.strength ?? 0, 0, 1);
    const roadHeading = roadHint?.heading ?? car.heading;
    const cameraHeading = car.heading + wrapAngle(roadHeading - car.heading) * (0.12 + hintStrength * 0.22);
    const hoverMode = car.isHoverMode;
    const sinHeading = Math.sin(cameraHeading);
    const cosHeading = Math.cos(cameraHeading);
    const cosOrbit = Math.cos(this.orbit);
    const sinOrbit = Math.sin(this.orbit);
    this.forward.set(
      sinHeading * cosOrbit + cosHeading * sinOrbit,
      0,
      cosHeading * cosOrbit - sinHeading * sinOrbit,
    );
    // Keep more of the arena and incoming traffic visible around the car.
    // The slightly taller pullback also makes lateral steering easier to read
    // on a phone held in landscape without weakening Turbo's speed sensation.
    const boostPullback = car.boostActive ? 4.8 : 0;
    const distance = 15 + speedFactor * 4.6 + accelerationPull + boostPullback + (car.drifting ? 0.8 : 0)
      + (hoverMode ? 1.2 : 0);
    const height = 5.05 + speedFactor * 1.45 + (hoverMode ? 0.2 : 0) - (car.boostActive ? 0.18 : 0);
    this.desiredPosition.set(
      car.position.x - this.forward.x * distance,
      car.position.y + height + Math.sin(this.pitch) * 2,
      car.position.z - this.forward.z * distance,
    );
    const lookAheadSeconds = car.boostActive ? 0.82 : 0.62;
    const lookAhead = Math.max(8, Math.abs(car.speed) * lookAheadSeconds)
      + clamp(speedChange * 0.015, -0.35, 0.8)
      + (hoverMode ? 4.5 : 0);
    const roadCenterX = roadHint?.centerX ?? car.position.x;
    const roadCenterZ = roadHint?.centerZ ?? car.position.z;
    const aheadX = roadHint?.aheadX ?? (roadCenterX + sinHeading * lookAhead);
    const aheadZ = roadHint?.aheadZ ?? (roadCenterZ + cosHeading * lookAhead);
    // Keep the physical road corridor stable in frame while allowing strafe
    // to visibly move the racer across it.  This avoids the old 100% player
    // follow that made every lane look like the screen center.
    const anchor = car.isHoverMode
      ? roadCenteredCameraAnchor(roadCenterX, roadCenterZ, car.position.x, car.position.z)
      : { x: car.position.x, z: car.position.z };
    const anchorX = anchor.x;
    const anchorZ = anchor.z;
    this.desiredTarget.set(
      aheadX + car.velocity.x * (car.drifting ? 0.11 : 0.035),
      car.position.y + 1.1 + Math.sin(this.pitch) * 1.8,
      aheadZ + car.velocity.z * (car.drifting ? 0.11 : 0.035),
    );
    if (car.isHoverMode) {
      this.desiredPosition.x += anchorX - car.position.x;
      this.desiredPosition.z += anchorZ - car.position.z;
    }
    const shake = this.shakeEnabled ? Math.min(1, car.landingImpact + car.collisionImpact) : 0;
    this.desiredPosition.x += Math.sin(this.elapsed * 67) * shake * 0.12;
    this.desiredPosition.y += Math.cos(this.elapsed * 53) * shake * 0.07;
    const blend = 1 - Math.exp(-8 * delta);
    if (!this.initialized) {
      this.position.copy(this.desiredPosition);
      this.target.copy(this.desiredTarget);
      this.initialized = true;
    } else {
      this.position.lerp(this.desiredPosition, blend);
      this.target.lerp(this.desiredTarget, blend);
    }
    this.fov = clamp(
      (car.boostActive ? 72 : 58) + speedFactor * (car.boostActive ? 10 : 11)
        + clamp(speedChange * 0.02, -1.2, 2.2),
      55,
      car.boostActive ? 82 : 70,
    );
  }
}

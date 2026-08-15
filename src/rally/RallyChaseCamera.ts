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
      this.orbit = approach(this.orbit, 0, delta * 0.72);
      this.pitch = approach(this.pitch, 0.28, delta * 0.38);
    }

    // Cart Rogue runs in compact combat arenas at a lower absolute speed than
    // the inherited rally course. Reach the camera's useful speed response
    // earlier so 18-25 m/s still reads as fast and punchy.
    const speedFactor = Math.min(1, Math.abs(car.speed) / 28);
    const speedChange = delta > 0 ? (Math.abs(car.speed) - this.previousSpeed) / delta : 0;
    this.previousSpeed = Math.abs(car.speed);
    const accelerationPull = clamp(speedChange * 0.028, -0.7, 1.0);
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

    const boostPullback = car.boostActive ? 5.1 : 0;
    const distance = 11.2 + speedFactor * 3.8 + accelerationPull + boostPullback + (car.drifting ? 0.8 : 0)
      + (hoverMode ? 1.2 : 0);
    const height = 4.1 + speedFactor * 1.25 + (hoverMode ? 0.2 : 0) - (car.boostActive ? 0.22 : 0);
    this.desiredPosition.set(
      car.position.x - this.forward.x * distance,
      car.position.y + height + Math.sin(this.pitch) * 2,
      car.position.z - this.forward.z * distance,
    );
    const lookAheadSeconds = car.boostActive ? 0.86 : 0.6;
    const lookAhead = Math.max(7.5, Math.abs(car.speed) * lookAheadSeconds)
      + clamp(speedChange * 0.016, -0.35, 0.9)
      + (hoverMode ? 4.5 : 0);
    const roadCenterX = roadHint?.centerX ?? car.position.x;
    const roadCenterZ = roadHint?.centerZ ?? car.position.z;
    const aheadX = roadHint?.aheadX ?? (roadCenterX + sinHeading * lookAhead);
    const aheadZ = roadHint?.aheadZ ?? (roadCenterZ + cosHeading * lookAhead);
    const anchor = car.isHoverMode
      ? roadCenteredCameraAnchor(roadCenterX, roadCenterZ, car.position.x, car.position.z)
      : { x: car.position.x, z: car.position.z };
    const anchorX = anchor.x;
    const anchorZ = anchor.z;
    this.desiredTarget.set(
      aheadX + car.velocity.x * (car.drifting ? 0.11 : 0.04),
      car.position.y + 1.1 + Math.sin(this.pitch) * 1.8,
      aheadZ + car.velocity.z * (car.drifting ? 0.11 : 0.04),
    );
    if (car.isHoverMode) {
      this.desiredPosition.x += anchorX - car.position.x;
      this.desiredPosition.z += anchorZ - car.position.z;
    }
    const shake = this.shakeEnabled ? Math.min(1, car.landingImpact + car.collisionImpact) : 0;
    this.desiredPosition.x += Math.sin(this.elapsed * 71) * shake * 0.17;
    this.desiredPosition.y += Math.cos(this.elapsed * 59) * shake * 0.1;
    this.desiredTarget.x += Math.cos(this.elapsed * 47) * shake * 0.05;
    const blend = 1 - Math.exp(-10.5 * delta);
    if (!this.initialized) {
      this.position.copy(this.desiredPosition);
      this.target.copy(this.desiredTarget);
      this.initialized = true;
    } else {
      this.position.lerp(this.desiredPosition, blend);
      this.target.lerp(this.desiredTarget, blend);
    }
    this.fov = clamp(
      (car.boostActive ? 70 : 56.5) + speedFactor * (car.boostActive ? 11 : 10)
        + clamp(speedChange * 0.022, -1.2, 2.5),
      54,
      car.boostActive ? 83 : 69,
    );
  }
}

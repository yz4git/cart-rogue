import * as THREE from "three";
import { RallyCar } from "./RallyCar";
import { getRallySurfaceProfile } from "./RallySurface";
import type { RallyGraphicsQuality } from "./RallySettings";
import { rallyDestructionProfile, type RallyDestructionKind } from "./RallyDestruction";

const MAX_PARTICLES = 96;
const MAX_SKID_MARKS = 72;
const MAX_BOOST_TRAIL = 24;
type ParticleKind = "dust" | "smoke" | "spray" | "fragment";

export class RallyEffects {
  readonly group = new THREE.Group();
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly velocityX = new Float32Array(MAX_PARTICLES);
  private readonly velocityY = new Float32Array(MAX_PARTICLES);
  private readonly velocityZ = new Float32Array(MAX_PARTICLES);
  private readonly particleKind = new Uint8Array(MAX_PARTICLES);
  private readonly fragmentStyle = new Uint8Array(MAX_PARTICLES);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly points: THREE.Points;
  private readonly skidPositions = new Float32Array(MAX_SKID_MARKS * 2 * 3);
  private readonly skidLife = new Float32Array(MAX_SKID_MARKS);
  private readonly skidGeometry = new THREE.BufferGeometry();
  private readonly skidLines: THREE.LineSegments;
  private readonly skidMaterial: THREE.LineBasicMaterial;
  private readonly boostTrailPositions = new Float32Array(MAX_BOOST_TRAIL * 2 * 3);
  private readonly boostTrailLife = new Float32Array(MAX_BOOST_TRAIL);
  private readonly boostTrailGeometry = new THREE.BufferGeometry();
  private readonly boostTrailMaterial = new THREE.LineBasicMaterial({
    color: 0x8cf5ff,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    depthTest: false,
  });
  private readonly boostTrailLines: THREE.LineSegments;
  private cursor = 0;
  private skidCursor = 0;
  private emissionTimer = 0;
  private skidEmissionTimer = 0;
  private smokeTimer = 0;
  private previousCheckpoint = 0;
  private previousLanding = 0;
  private previousCollision = 0;
  private previousShortcutBreak = 0;
  private effectScale = 1;
  private destructionPulse = 0;
  private boostTrailCursor = 0;
  private boostTrailTimer = 0;
  private readonly destructionRing: THREE.Mesh;
  private readonly destructionRingMaterial: THREE.MeshBasicMaterial;

  constructor() {
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(this.geometry, new THREE.PointsMaterial({
      size: 0.42,
      vertexColors: true,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    }));
    this.group.add(this.points);
    this.skidGeometry.setAttribute("position", new THREE.BufferAttribute(this.skidPositions, 3));
    this.skidMaterial = new THREE.LineBasicMaterial({ color: 0x20252b, transparent: true, opacity: 0.38, depthWrite: false });
    this.skidLines = new THREE.LineSegments(this.skidGeometry, this.skidMaterial);
    this.skidGeometry.setDrawRange(0, MAX_SKID_MARKS * 2);
    this.group.add(this.skidLines);
    this.boostTrailGeometry.setAttribute("position", new THREE.BufferAttribute(this.boostTrailPositions, 3));
    this.boostTrailLines = new THREE.LineSegments(this.boostTrailGeometry, this.boostTrailMaterial);
    this.boostTrailLines.frustumCulled = false;
    this.boostTrailLines.renderOrder = 5;
    this.group.add(this.boostTrailLines);
    this.destructionRingMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.destructionRing = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.42, 8), this.destructionRingMaterial);
    this.destructionRing.rotation.x = -Math.PI / 2;
    this.destructionRing.visible = false;
    this.group.add(this.destructionRing);
    for (let index = 0; index < MAX_PARTICLES; index += 1) this.life[index] = 0;
    for (let index = 0; index < MAX_SKID_MARKS; index += 1) {
      this.skidLife[index] = 0;
      this.skidPositions[index * 6 + 1] = -100;
      this.skidPositions[index * 6 + 4] = -100;
    }
    for (let index = 0; index < MAX_BOOST_TRAIL; index += 1) {
      this.boostTrailLife[index] = 0;
      this.boostTrailPositions[index * 6 + 1] = -100;
      this.boostTrailPositions[index * 6 + 4] = -100;
    }
    this.boostTrailGeometry.setDrawRange(0, MAX_BOOST_TRAIL * 2);
  }

  setQuality(quality: RallyGraphicsQuality): void {
    this.effectScale = quality === "low" ? 0.45 : quality === "high" ? 1 : 0.75;
    this.skidLines.visible = quality !== "low";
    // Boost readability is gameplay-critical even on LOW. The pooled line
    // trail is intentionally retained at a smaller presentation scale.
    this.boostTrailLines.visible = true;
    this.boostTrailMaterial.opacity = quality === "high" ? 0.86 : quality === "normal" ? 0.68 : 0.52;
    (this.points.material as THREE.PointsMaterial).size = quality === "high" ? 0.48 : 0.42;
  }

  update(car: RallyCar, checkpoint: number, deltaSeconds: number): void {
    const delta = Math.min(0.05, Math.max(0, deltaSeconds));
    this.emissionTimer -= delta;
    this.skidEmissionTimer -= delta;
    this.boostTrailTimer -= delta;
    for (let index = 0; index < MAX_PARTICLES; index += 1) {
      if (this.life[index] <= 0) continue;
      this.life[index] -= delta * 1.8;
      this.positions[index * 3] += this.velocityX[index] * delta;
      this.positions[index * 3 + 1] += this.velocityY[index] * delta;
      this.positions[index * 3 + 2] += this.velocityZ[index] * delta;
      const kind = this.particleKind[index];
      this.velocityY[index] -= (kind === 1 ? 0.35 : kind === 2 ? 0.9 : 2.5) * delta;
      const brightness = Math.max(0, this.life[index]);
      const style = this.fragmentStyle[index];
      this.colors[index * 3] = kind === 1 ? brightness * 0.72 : kind === 2 ? brightness * 0.55 : kind === 3 ? brightness * (style === 1 ? 0.7 : style === 2 ? 0.56 : 0.55) : brightness;
      this.colors[index * 3 + 1] = kind === 1 ? brightness * 0.72 : kind === 2 ? brightness * 0.78 : kind === 3 ? brightness * (style === 1 ? 0.42 : style === 2 ? 0.58 : 0.86) : brightness * 0.72;
      this.colors[index * 3 + 2] = kind === 1 ? brightness * 0.75 : kind === 2 ? brightness : kind === 3 ? brightness * (style === 1 ? 0.18 : style === 2 ? 0.34 : 0.72) : brightness * 0.38;
    }
    const profile = getRallySurfaceProfile(car.surface, car.environmentVariant);
    if (this.emissionTimer <= 0 && (car.drifting || !car.grounded || Math.abs(car.speed) > 10) && profile.dustStrength > 0) {
      const strength = Math.max(0.18, profile.dustStrength);
      const kind: ParticleKind = car.environmentVariant === "wet" ? "spray" : "dust";
      this.emit(car, car.drifting ? 2 : 1, car.drifting ? 0.7 * strength : 0.45 * strength, kind);
      this.emissionTimer = car.drifting ? 0.045 : 0.12;
    }
    if (car.boostActive && this.emissionTimer <= 0) {
      this.emit(car, 5 + Math.min(5, car.boostChainCount), 0.85 + Math.min(0.25, car.boostChainCount * 0.03), "fragment");
      this.emissionTimer = 0.07;
    }
    if (car.boostActive && this.boostTrailLines.visible && this.boostTrailTimer <= 0) {
      this.emitBoostTrail(car, Math.min(3, 1 + Math.floor(car.boostChainCount / 2)));
      this.boostTrailTimer = 0.045;
    }
    for (let index = 0; index < MAX_BOOST_TRAIL; index += 1) {
      this.boostTrailLife[index] = Math.max(0, this.boostTrailLife[index] - delta * 5.4);
      if (this.boostTrailLife[index] <= 0) {
        this.boostTrailPositions[index * 6 + 1] = -100;
        this.boostTrailPositions[index * 6 + 4] = -100;
      }
    }
    if (this.skidEmissionTimer <= 0 && car.drifting && Math.abs(car.speed) > 6 && (car.surface === "road" || car.surface === "asphalt" || car.surface === "gravel")) {
      this.emitSkidMark(car);
      this.skidEmissionTimer = 0.055;
    }
    for (let index = 0; index < MAX_SKID_MARKS; index += 1) {
      this.skidLife[index] = Math.max(0, this.skidLife[index] - delta * 0.18);
      if (this.skidLife[index] === 0) {
        this.skidPositions[index * 6 + 1] = -100;
        this.skidPositions[index * 6 + 4] = -100;
      }
    }
    if (car.landingImpact > 0.3 && this.previousLanding <= 0.3) this.emit(car, 10, 1, "dust");
    if (car.collisionImpact > 0.45 && this.previousCollision <= 0.45) this.emit(car, 8, 0.9, "fragment");
    if (car.shortcutBreakImpact > 0.45 && this.previousShortcutBreak <= 0.45) {
      const destructionKind = car.lastDestructionKind ?? "barrier";
      const profile = rallyDestructionProfile(destructionKind);
      this.emit(car, profile.fragmentCount, profile.fragmentStrength, "fragment", destructionKind);
      this.emit(car, profile.dustCount, 0.95, "dust");
      this.destructionPulse = 1;
      this.destructionRingMaterial.color.setHex(profile.color);
    }
    this.smokeTimer -= delta;
    if (car.smokeLevel > 0 && this.smokeTimer <= 0) {
      this.emitSmoke(car, car.smokeLevel > 0.65 ? 2 : 1);
      this.smokeTimer = 0.14;
    }
    if (checkpoint > this.previousCheckpoint) this.emit(car, 12, 0.85, "fragment");
    this.previousLanding = car.landingImpact;
    this.previousCollision = car.collisionImpact;
    this.previousShortcutBreak = car.shortcutBreakImpact;
    this.previousCheckpoint = checkpoint;
    this.destructionPulse = Math.max(0, this.destructionPulse - delta * 4.2);
    if (this.destructionPulse > 0) {
      this.destructionRing.visible = true;
      this.destructionRing.position.set(car.position.x, car.position.y - 0.58, car.position.z);
      const ringScale = 1 + (1 - this.destructionPulse) * 4.5;
      this.destructionRing.scale.set(ringScale, ringScale, ringScale);
      this.destructionRingMaterial.opacity = this.destructionPulse * 0.7;
    } else {
      this.destructionRing.visible = false;
      this.destructionRingMaterial.opacity = 0;
    }
    (this.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    (this.boostTrailGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.skidGeometry.dispose();
    this.skidMaterial.dispose();
    this.boostTrailGeometry.dispose();
    this.boostTrailMaterial.dispose();
    this.destructionRing.geometry.dispose();
    this.destructionRingMaterial.dispose();
  }

  private emit(car: RallyCar, count: number, strength: number, kind: ParticleKind, destructionKind?: RallyDestructionKind): void {
    const kindCode = kind === "smoke" ? 1 : kind === "spray" ? 2 : kind === "fragment" ? 3 : 0;
    const scaledCount = Math.max(1, Math.round(count * this.effectScale));
    for (let countIndex = 0; countIndex < scaledCount; countIndex += 1) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      this.life[index] = 0.65 + strength * 0.35;
      this.particleKind[index] = kindCode;
      this.fragmentStyle[index] = kind === "fragment"
        ? destructionKind === "tree" ? 1
          : destructionKind === "rock" ? 2
            : destructionKind === "fence" ? 4
              : destructionKind === "wall" ? 5
                : destructionKind === "safety-block" ? 3 : 3
        : 0;
      this.positions[index * 3] = car.position.x + (Math.random() - 0.5) * 1.4;
      this.positions[index * 3 + 1] = car.position.y - 0.35 + Math.random() * 0.25;
      this.positions[index * 3 + 2] = car.position.z + (Math.random() - 0.5) * 1.4;
      this.velocityX[index] = (Math.random() - 0.5) * strength * 2;
      this.velocityY[index] = Math.random() * strength * 1.3;
      this.velocityZ[index] = (Math.random() - 0.5) * strength * 2;
    }
  }

  private emitSmoke(car: RallyCar, count: number): void {
    const scaledCount = Math.max(1, Math.round(count * this.effectScale));
    for (let countIndex = 0; countIndex < scaledCount; countIndex += 1) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      this.life[index] = 0.9;
      this.particleKind[index] = 1;
      this.positions[index * 3] = car.position.x + (Math.random() - 0.5) * 0.7;
      this.positions[index * 3 + 1] = car.position.y + 0.75 + Math.random() * 0.35;
      this.positions[index * 3 + 2] = car.position.z - 1.1 + (Math.random() - 0.5) * 0.5;
      this.velocityX[index] = (Math.random() - 0.5) * 0.45;
      this.velocityY[index] = 0.5 + Math.random() * 0.35;
      this.velocityZ[index] = (Math.random() - 0.5) * 0.45;
    }
  }

  private emitBoostTrail(car: RallyCar, count: number): void {
    const forwardX = Math.sin(car.heading);
    const forwardZ = Math.cos(car.heading);
    const rightX = Math.cos(car.heading);
    const rightZ = -Math.sin(car.heading);
    for (let offset = 0; offset < count; offset += 1) {
      const index = this.boostTrailCursor;
      this.boostTrailCursor = (this.boostTrailCursor + 1) % MAX_BOOST_TRAIL;
      const side = offset % 2 === 0 ? -0.42 : 0.42;
      const rearX = car.position.x - forwardX * (1.25 + offset * 0.18) + rightX * side;
      const rearZ = car.position.z - forwardZ * (1.25 + offset * 0.18) + rightZ * side;
      const start = index * 6;
      this.boostTrailPositions[start] = rearX;
      this.boostTrailPositions[start + 1] = car.position.y - 0.48;
      this.boostTrailPositions[start + 2] = rearZ;
      this.boostTrailPositions[start + 3] = rearX - forwardX * (0.8 + car.boostChainCount * 0.08);
      this.boostTrailPositions[start + 4] = car.position.y - 0.48;
      this.boostTrailPositions[start + 5] = rearZ - forwardZ * (0.8 + car.boostChainCount * 0.08);
      this.boostTrailLife[index] = 1;
    }
  }

  private emitSkidMark(car: RallyCar): void {
    const index = this.skidCursor;
    this.skidCursor = (this.skidCursor + 1) % MAX_SKID_MARKS;
    const forwardX = Math.sin(car.heading);
    const forwardZ = Math.cos(car.heading);
    const rightX = Math.cos(car.heading);
    const rightZ = -Math.sin(car.heading);
    const rearX = car.position.x - forwardX * 1.05;
    const rearZ = car.position.z - forwardZ * 1.05;
    const side = index % 2 === 0 ? -0.64 : 0.64;
    const start = index * 6;
    this.skidPositions[start] = rearX + rightX * side;
    this.skidPositions[start + 1] = car.position.y - 0.62;
    this.skidPositions[start + 2] = rearZ + rightZ * side;
    this.skidPositions[start + 3] = this.skidPositions[start] - forwardX * 0.85;
    this.skidPositions[start + 4] = this.skidPositions[start + 1];
    this.skidPositions[start + 5] = this.skidPositions[start + 2] - forwardZ * 0.85;
    this.skidLife[index] = 1;
    (this.skidGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }
}

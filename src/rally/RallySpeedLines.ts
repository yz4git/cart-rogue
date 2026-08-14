import * as THREE from "three";
import type { RallyGraphicsQuality } from "./RallySettings";

const MAX_SPEED_LINES = 32;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** A tiny camera-space line pool used to sell speed without post-processing. */
export class RallySpeedLines {
  readonly group = new THREE.Group();
  private readonly positions = new Float32Array(MAX_SPEED_LINES * 2 * 3);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.LineBasicMaterial({
    color: 0xe6fbff,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  });
  private readonly lines: THREE.LineSegments;
  private enabled = true;
  private intensity = 1;
  private normalLineCount = 12;
  private boostLineCount = 24;
  private activeLineCount = 0;

  constructor() {
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 1000;
    this.group.add(this.lines);
    this.group.frustumCulled = false;
  }

  setQuality(quality: RallyGraphicsQuality): void {
    this.enabled = true;
    this.intensity = quality === "high" ? 1 : quality === "normal" ? 0.72 : 0.5;
    this.normalLineCount = quality === "low" ? 8 : 12;
    this.boostLineCount = quality === "low" ? 12 : quality === "high" ? 30 : 24;
    if (!this.enabled) this.material.opacity = 0;
  }

  update(speed: number, boostActive = false, boostChain = 0): void {
    const speedFactor = clamp(Math.abs(speed) / 56, 0, 1);
    if (!this.enabled || speedFactor < 0.42) {
      this.material.opacity = 0;
      this.activeLineCount = 0;
      this.geometry.setDrawRange(0, 0);
      return;
    }
    const chainBonus = Math.min(8, Math.max(0, Math.floor(boostChain)) * 2);
    this.activeLineCount = boostActive ? Math.min(MAX_SPEED_LINES, this.boostLineCount + chainBonus) : this.normalLineCount;
    const presentationFactor = boostActive ? 1.55 + Math.min(0.28, Math.max(0, boostChain) * 0.04) : 1;
    this.material.opacity = Math.min(0.72, (speedFactor - 0.36) * 0.32 * this.intensity * presentationFactor);
    for (let index = 0; index < this.activeLineCount; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const band = Math.floor(index / 2);
      const y = -1.05 + (band % 8) * 0.32;
      const outer = 1.45 + (band % 4) * 0.26;
      const startX = side * outer;
      const endX = side * (outer - (0.12 + speedFactor * (boostActive ? 0.86 : 0.52)));
      const start = index * 6;
      this.positions[start] = startX;
      this.positions[start + 1] = y;
      this.positions[start + 2] = -2.2 - (band % 2) * 0.2;
      this.positions[start + 3] = endX;
      this.positions[start + 4] = y + (band % 2 === 0 ? 0.02 : -0.02);
      this.positions[start + 5] = this.positions[start + 2] - 0.05;
    }
    this.geometry.setDrawRange(0, this.activeLineCount * 2);
    (this.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }

  get activeCount(): number { return this.activeLineCount; }
  get boostPresentation(): boolean { return this.activeLineCount > 12; }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Attach the pooled lines to the camera so their coordinates stay camera-space. */
export function attachRallySpeedLines(camera: THREE.Camera, speedLines: RallySpeedLines): void {
  camera.add(speedLines.group);
}

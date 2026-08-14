import * as THREE from "three";
import type { RallyGhostSample } from "./RallyGhost";

export class RallyGhostVisual {
  readonly group = new THREE.Group();
  private readonly body: THREE.Mesh;

  constructor() {
    const material = new THREE.MeshBasicMaterial({
      color: 0x92f4e6,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 3.25), material);
    this.body.position.y = 0.7;
    this.group.add(this.body);
    this.group.visible = false;
  }

  update(sample: RallyGhostSample | null): void {
    if (!sample) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.group.position.set(sample.x, sample.y, sample.z);
    this.group.rotation.y = sample.heading;
  }

  dispose(): void {
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
      else mesh.material.dispose();
    });
  }
}

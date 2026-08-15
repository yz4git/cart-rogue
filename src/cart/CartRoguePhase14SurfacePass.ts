import * as THREE from "three";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase14SurfaceDemo {
  scene: THREE.Scene;
  buildWorld(): void;
}

export function installCartRoguePhase14SurfacePass(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase14SurfaceDemo;
  const originalBuildWorld = prototype.buildWorld;
  prototype.buildWorld = function buildWorldPhase14Surface(this: Phase14SurfaceDemo): void {
    originalBuildWorld.call(this);
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.geometry.type !== "ShapeGeometry") return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.side = THREE.DoubleSide;
        material.needsUpdate = true;
      }
    });
  };
}

installCartRoguePhase14SurfacePass();

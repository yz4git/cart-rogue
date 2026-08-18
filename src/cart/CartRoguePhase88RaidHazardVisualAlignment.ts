import * as THREE from "three";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase88AlignmentDemo {
  scene: THREE.Scene;
  updateVisuals(delta: number): void;
}

/**
 * CircleGeometry sectors are authored around local +X while gameplay heading 0
 * points toward world +Z. Apply the fixed quarter-turn after Phase88 updates
 * its pooled cone meshes so the visible warning exactly matches hit testing.
 */
export function installCartRoguePhase88RaidHazardVisualAlignment(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase88AlignmentDemo;
  const previousUpdateVisuals = prototype.updateVisuals;
  prototype.updateVisuals = function phase88RaidHazardVisualAlignment(this: Phase88AlignmentDemo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    for (let index = 0; index < 4; index += 1) {
      const cone = this.scene.getObjectByName(`phase88-hazard-cone-${index}`);
      if (!cone?.visible) continue;
      cone.rotation.y -= Math.PI / 2;
    }
  };
}

installCartRoguePhase88RaidHazardVisualAlignment();

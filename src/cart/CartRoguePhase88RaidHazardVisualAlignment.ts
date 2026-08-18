import * as THREE from "three";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase88AlignmentDemo {
  scene: THREE.Scene;
  updateVisuals(delta: number): void;
}

function enforceHighContrastWarningMaterials(scene: THREE.Scene): void {
  const root = scene.getObjectByName("phase88-raid-hazard-root");
  if (!root || root.userData.highContrastWarning === true) return;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshBasicMaterial)) return;
    const material = object.material;
    const hex = material.color.getHex();
    if (hex === 0xff1238) {
      material.color.setHex(0xff001e);
      material.opacity = 0.58;
    } else if (hex === 0xff2416) {
      material.color.setHex(0xff1200);
      material.opacity = 0.72;
    } else if (hex === 0xffb000) {
      material.color.setHex(0xffd000);
      material.opacity = 0.82;
    } else if (hex === 0xffffff) {
      material.opacity = 0.94;
    }
    material.needsUpdate = true;
  });
  root.userData.highContrastWarning = true;
  root.userData.warningPalette = "alarm-red-amber-white";
}

/**
 * CircleGeometry sectors are authored around local +X while gameplay heading 0
 * points toward world +Z. Apply the fixed quarter-turn after Phase88 updates
 * its pooled cone meshes so the visible warning exactly matches hit testing.
 * Also upgrade the shared materials once so bright pastel scenery cannot wash
 * the hazard language out on an iPhone display.
 */
export function installCartRoguePhase88RaidHazardVisualAlignment(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase88AlignmentDemo;
  const previousUpdateVisuals = prototype.updateVisuals;
  prototype.updateVisuals = function phase88RaidHazardVisualAlignment(this: Phase88AlignmentDemo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    enforceHighContrastWarningMaterials(this.scene);
    for (let index = 0; index < 4; index += 1) {
      const cone = this.scene.getObjectByName(`phase88-hazard-cone-${index}`);
      if (!cone?.visible) continue;
      cone.rotation.y -= Math.PI / 2;
    }
  };
}

installCartRoguePhase88RaidHazardVisualAlignment();

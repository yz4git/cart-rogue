import * as THREE from "three";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase88AlignmentDemo {
  scene: THREE.Scene;
  updateVisuals(delta: number): void;
}

const upgradedWarningMaterials = new WeakSet<THREE.Material>();

function upgradeWarningMaterial(material: THREE.MeshBasicMaterial): void {
  if (upgradedWarningMaterials.has(material)) return;
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
  upgradedWarningMaterials.add(material);
}

function enforceHighContrastWarningMaterials(scene: THREE.Scene): void {
  const root = scene.getObjectByName("phase88-raid-hazard-root");
  if (!root) return;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshBasicMaterial)) return;
    upgradeWarningMaterial(object.material);
  });
  root.userData.highContrastWarning = true;
  root.userData.warningPalette = "alarm-red-amber-white";
}

/**
 * CircleGeometry sectors are authored around local +X while gameplay heading 0
 * points toward world +Z. Apply the fixed quarter-turn after Phase88 updates
 * its pooled cone meshes so the visible warning exactly matches hit testing.
 * Shared warning materials are upgraded on first use, so TRACKING, LOCKED,
 * IMMINENT and FIRED states all stay readable against the bright scenery.
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

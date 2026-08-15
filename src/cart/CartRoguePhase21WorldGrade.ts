import * as THREE from "three";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase21WorldDemo {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  buildWorld(): void;
}

function lightness(color: THREE.Color): number {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return hsl.l;
}

function recolorDarkEnvironment(demo: Phase21WorldDemo): void {
  const trunk = new THREE.Color(0x91674d);
  const stone = new THREE.Color(0xe9e3d9);
  const shrub = new THREE.Color(0x80ba60);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const instanceColor = new THREE.Color();

  demo.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;

    if (object instanceof THREE.InstancedMesh && object.instanceColor) {
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      const base = new THREE.Vector3(1, 1, 1);
      object.geometry.boundingBox?.getSize(base);
      let changed = false;
      for (let index = 0; index < object.count; index += 1) {
        object.getColorAt(index, instanceColor);
        if (lightness(instanceColor) >= 0.32) continue;
        object.getMatrixAt(index, matrix);
        matrix.decompose(position, quaternion, scale);
        const sx = Math.abs(base.x * scale.x);
        const sy = Math.abs(base.y * scale.y);
        const sz = Math.abs(base.z * scale.z);
        const tall = sy > Math.max(sx, sz) * 1.2;
        const rail = sy < 0.85 && Math.max(sx, sz) > 1.65;
        object.setColorAt(index, tall ? trunk : rail ? stone : shrub);
        changed = true;
      }
      if (changed && object.instanceColor) object.instanceColor.needsUpdate = true;
      return;
    }

    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const size = new THREE.Vector3(1, 1, 1);
    object.geometry.boundingBox?.getSize(size);
    size.multiply(new THREE.Vector3(Math.abs(object.scale.x), Math.abs(object.scale.y), Math.abs(object.scale.z)));
    const tall = size.y > Math.max(size.x, size.z) * 1.2;
    const rail = size.y < 0.85 && Math.max(size.x, size.z) > 1.65;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshBasicMaterial)) continue;
      if (lightness(material.color) >= 0.32) continue;
      material.color.copy(tall ? trunk : rail ? stone : shrub);
      if (material instanceof THREE.MeshStandardMaterial) {
        material.metalness = 0;
        material.roughness = Math.max(0.82, material.roughness);
      }
      material.needsUpdate = true;
    }
  });
}

function enrichPastelPalette(demo: Phase21WorldDemo): void {
  const touched = new Set<THREE.Material>();
  demo.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (touched.has(material) || !(material instanceof THREE.MeshStandardMaterial)) continue;
      touched.add(material);
      const hsl = { h: 0, s: 0, l: 0 };
      material.color.getHSL(hsl);
      const green = hsl.h > 0.2 && hsl.h < 0.43 && hsl.s > 0.2;
      const pink = (hsl.h > 0.88 || hsl.h < 0.03) && hsl.s > 0.24;
      const sand = hsl.h > 0.07 && hsl.h < 0.16 && hsl.s > 0.18;
      if (green) material.color.setHSL(hsl.h, Math.min(0.82, hsl.s * 1.08 + 0.04), Math.min(0.72, hsl.l * 1.04 + 0.025));
      else if (pink) material.color.setHSL(hsl.h, Math.min(0.9, hsl.s * 1.08 + 0.035), Math.min(0.77, hsl.l * 1.035 + 0.02));
      else if (sand) material.color.setHSL(hsl.h, Math.min(0.74, hsl.s * 1.03 + 0.02), Math.min(0.79, hsl.l * 1.025 + 0.015));
    }
  });
}

function softenLighting(demo: Phase21WorldDemo): void {
  const existing = demo.scene.getObjectByName("phase21-soft-ambient");
  if (!existing) {
    const ambient = new THREE.AmbientLight(0xfff8ee, 1.12);
    ambient.name = "phase21-soft-ambient";
    demo.scene.add(ambient);
  } else if (existing instanceof THREE.AmbientLight) {
    existing.intensity = 1.12;
  }
  demo.scene.traverse((object) => {
    if (object instanceof THREE.HemisphereLight) {
      object.intensity = Math.max(2.35, object.intensity);
      object.groundColor.setHex(0xc0cf9f);
    }
    if (object instanceof THREE.DirectionalLight) object.intensity = Math.min(object.intensity, 1.5);
  });
}

function gradeWorld(demo: Phase21WorldDemo): void {
  demo.renderer.toneMappingExposure = 1.15;
  demo.scene.background = new THREE.Color(0x82c9ff);
  if (demo.scene.fog instanceof THREE.Fog) {
    demo.scene.fog.color.setHex(0xbfe2ff);
    demo.scene.fog.near = 104;
    demo.scene.fog.far = 310;
  }
  recolorDarkEnvironment(demo);
  enrichPastelPalette(demo);
  softenLighting(demo);
}

export function installCartRoguePhase21WorldGrade(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase21WorldDemo;
  const oldWorld = prototype.buildWorld;
  prototype.buildWorld = function phase21WorldGrade(this: Phase21WorldDemo): void {
    oldWorld.call(this);
    gradeWorld(this);
  };
}

installCartRoguePhase21WorldGrade();

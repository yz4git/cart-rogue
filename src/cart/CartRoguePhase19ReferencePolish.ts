import * as THREE from "three";
import type { CartArenaSessionSnapshot } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase19PolishDemo {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  steer: number;
  buildWorld(): void;
  applyCameraPresentation(snapshot: CartArenaSessionSnapshot): void;
}

function materialLightness(material: THREE.Material): number | null {
  if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshBasicMaterial)) return null;
  const hsl = { h: 0, s: 0, l: 0 };
  material.color.getHSL(hsl);
  return hsl.l;
}

function cleanupLegacyDarkScenery(demo: Phase19PolishDemo): void {
  demo.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const dark = materials.some((material) => {
      const l = materialLightness(material);
      return l !== null && l < 0.22;
    });
    if (!dark) return;

    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    if (!box) return;
    const size = new THREE.Vector3();
    box.getSize(size);
    size.multiply(new THREE.Vector3(Math.abs(object.scale.x), Math.abs(object.scale.y), Math.abs(object.scale.z)));
    const horizontalArea = size.x * size.z;
    const world = new THREE.Vector3();
    object.getWorldPosition(world);

    const flatGroundArtifact = world.y < 0.58 && size.y < 0.62 && horizontalArea > 0.14;
    const distantMonolith = (Math.abs(world.x) > 32 || Math.abs(world.z) > 48) && (size.y > 1.8 || horizontalArea > 3.5);
    const oversizedDarkShape = size.y > 5.5 || horizontalArea > 20;
    if (flatGroundArtifact || distantMonolith || oversizedDarkShape) object.visible = false;
  });
}

function brightenPastelWorld(demo: Phase19PolishDemo): void {
  const touched = new Set<THREE.Material>();
  demo.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (touched.has(material) || !(material instanceof THREE.MeshStandardMaterial)) continue;
      touched.add(material);
      const hsl = { h: 0, s: 0, l: 0 };
      material.color.getHSL(hsl);
      const green = hsl.h > 0.19 && hsl.h < 0.43 && hsl.s > 0.18;
      const pink = (hsl.h > 0.88 || hsl.h < 0.035) && hsl.s > 0.22;
      const warmGround = hsl.h > 0.055 && hsl.h < 0.17 && hsl.s > 0.18;
      const brown = hsl.h > 0.035 && hsl.h < 0.105 && hsl.s > 0.16 && hsl.l < 0.52;
      if (green) material.color.setHSL(hsl.h, Math.min(0.84, hsl.s * 1.08 + 0.05), Math.min(0.72, hsl.l * 1.06 + 0.035));
      else if (pink) material.color.setHSL(hsl.h, Math.min(0.9, hsl.s * 1.1 + 0.04), Math.min(0.76, hsl.l * 1.05 + 0.04));
      else if (brown) material.color.setHSL(hsl.h, Math.min(0.72, hsl.s * 0.92 + 0.04), Math.min(0.56, hsl.l * 1.16 + 0.06));
      else if (warmGround && hsl.l < 0.78) material.color.setHSL(hsl.h, Math.min(0.76, hsl.s * 1.05 + 0.025), Math.min(0.78, hsl.l * 1.06 + 0.025));
      material.metalness = Math.min(material.metalness, 0.04);
      material.roughness = Math.max(material.roughness, 0.72);
    }
  });
}

function softenReferenceLighting(demo: Phase19PolishDemo): void {
  demo.renderer.shadowMap.enabled = false;
  demo.scene.traverse((object) => {
    if (object instanceof THREE.HemisphereLight) object.intensity = Math.max(object.intensity, 2.0);
    if (object instanceof THREE.DirectionalLight) object.intensity *= 0.78;
  });
}

function applyHigherReferenceCamera(demo: Phase19PolishDemo, snapshot: CartArenaSessionSnapshot): void {
  const forwardX = Math.sin(snapshot.heading);
  const forwardZ = Math.cos(snapshot.heading);
  const rightX = Math.cos(snapshot.heading);
  const rightZ = -Math.sin(snapshot.heading);
  const speedRatio = THREE.MathUtils.clamp(Math.abs(snapshot.speed) / 28, 0, 1);
  const distance = snapshot.boostActive ? 10.6 : 9.55 + speedRatio * 0.46;
  const height = snapshot.boostActive ? 7.55 : 6.95 + speedRatio * 0.3;
  const lateral = -demo.steer * 0.32;
  demo.camera.position.set(
    snapshot.x - forwardX * distance + rightX * lateral,
    height,
    snapshot.z - forwardZ * distance + rightZ * lateral,
  );
  const lookAhead = 4.75 + speedRatio * 1.45;
  demo.camera.lookAt(new THREE.Vector3(snapshot.x + forwardX * lookAhead, 0.72, snapshot.z + forwardZ * lookAhead));
  demo.camera.fov = snapshot.boostActive ? 60.5 : 55.2 + speedRatio * 1.25;
  demo.camera.updateProjectionMatrix();
}

export function installCartRoguePhase19ReferencePolish(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase19PolishDemo;
  const originalBuildWorld = prototype.buildWorld;
  const originalCamera = prototype.applyCameraPresentation;

  prototype.buildWorld = function buildWorldPhase19Polish(this: Phase19PolishDemo): void {
    originalBuildWorld.call(this);
    cleanupLegacyDarkScenery(this);
    brightenPastelWorld(this);
    softenReferenceLighting(this);
  };

  prototype.applyCameraPresentation = function cameraPhase19Polish(this: Phase19PolishDemo, snapshot: CartArenaSessionSnapshot): void {
    originalCamera.call(this, snapshot);
    applyHigherReferenceCamera(this, snapshot);
  };
}

installCartRoguePhase19ReferencePolish();

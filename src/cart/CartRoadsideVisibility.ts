import * as THREE from "three";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface CartRoadsideVisibilityDemo {
  scene: THREE.Scene;
  buildWorld(): void;
}

const GRASS_LIFT = 0.035;
const DECOR_LIFT = 0.045;
const CONTRAST_PATTERN = [0.76, 1.08, 0.91, 1.0, 0.83, 1.13, 0.95] as const;

export function cartRoadsideGrassLift(): number {
  return GRASS_LIFT;
}

export function cartRoadsideContrast(index: number): number {
  const normalized = Math.abs(Math.floor(index));
  return CONTRAST_PATTERN[(normalized * 5 + 3) % CONTRAST_PATTERN.length];
}

function adjustInstancedColors(mesh: THREE.InstancedMesh, seed: number): void {
  if (!mesh.instanceColor) return;
  const color = new THREE.Color();
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getColorAt(index, color);
    color.multiplyScalar(cartRoadsideContrast(index + seed));
    color.r = Math.min(1, color.r);
    color.g = Math.min(1, color.g);
    color.b = Math.min(1, color.b);
    mesh.setColorAt(index, color);
  }
  mesh.instanceColor.needsUpdate = true;

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -1;
    material.needsUpdate = true;
  }
}

function liftRoadsideLayer(scene: THREE.Scene, name: string, lift: number, seed: number): void {
  const object = scene.getObjectByName(name);
  if (!(object instanceof THREE.InstancedMesh)) return;
  object.position.y = lift;
  adjustInstancedColors(object, seed);
}

function strengthenRoadsideVisibility(scene: THREE.Scene): void {
  liftRoadsideLayer(scene, "phase35-grass-mosaic", GRASS_LIFT, 11);
  liftRoadsideLayer(scene, "phase35-water-mosaic", DECOR_LIFT, 19);
  liftRoadsideLayer(scene, "phase35-stone-banks", DECOR_LIFT + 0.008, 23);
  liftRoadsideLayer(scene, "phase35-flower-beds", DECOR_LIFT + 0.014, 29);
}

export function installCartRoadsideVisibility(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as CartRoadsideVisibilityDemo;
  const originalWorld = prototype.buildWorld;
  prototype.buildWorld = function roadsideVisibilityWorld(this: CartRoadsideVisibilityDemo): void {
    originalWorld.call(this);
    strengthenRoadsideVisibility(this.scene);
  };
}

installCartRoadsideVisibility();

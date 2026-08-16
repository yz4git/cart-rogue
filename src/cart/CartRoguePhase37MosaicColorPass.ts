import * as THREE from "three";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase37Demo {
  scene: THREE.Scene;
  buildWorld(): void;
}

const ROADSIDE_MOSAIC_NAMES = [
  "phase35-grass-mosaic",
  "phase35-water-mosaic",
  "phase35-stone-banks",
  "phase35-flower-beds",
] as const;

export function cartPhase37UsesUnlitMosaic(): boolean {
  return true;
}

function replaceWithVisibleColorMaterial(mesh: THREE.InstancedMesh): void {
  const oldMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    toneMapped: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  mesh.material = material;
  for (const oldMaterial of oldMaterials) oldMaterial.dispose();
}

function applyRoadsideColorPass(scene: THREE.Scene): void {
  for (const name of ROADSIDE_MOSAIC_NAMES) {
    const object = scene.getObjectByName(name);
    if (!(object instanceof THREE.InstancedMesh)) continue;
    replaceWithVisibleColorMaterial(object);
  }
}

export function installCartRoguePhase37MosaicColorPass(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase37Demo;
  const oldWorld = prototype.buildWorld;
  prototype.buildWorld = function phase37World(this: Phase37Demo): void {
    oldWorld.call(this);
    applyRoadsideColorPass(this.scene);
  };
}

installCartRoguePhase37MosaicColorPass();

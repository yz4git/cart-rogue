import * as THREE from "three";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface CleanupDemo {
  scene: THREE.Scene;
  updateVisuals(delta: number): void;
}

const cleaned = new WeakSet<object>();
const green = new THREE.Color(0x9dce70);

function luminance(color: THREE.Color): number {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
}

function hasPhase19Ancestor(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.name.startsWith("phase19-")) return true;
    current = current.parent;
  }
  return false;
}

function cleanupInstancedMesh(mesh: THREE.InstancedMesh): void {
  if (hasPhase19Ancestor(mesh)) return;
  const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const materialColor = new THREE.Color(1, 1, 1);
  const firstColored = materialList.find((material) => material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial);
  if (firstColored instanceof THREE.MeshStandardMaterial || firstColored instanceof THREE.MeshBasicMaterial) materialColor.copy(firstColored.color);

  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const geometrySize = new THREE.Vector3(1, 1, 1);
  mesh.geometry.boundingBox?.getSize(geometrySize);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const instanceColor = new THREE.Color();
  let matrixChanged = false;
  let colorChanged = false;

  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    matrix.decompose(position, quaternion, scale);
    const color = mesh.instanceColor ? (mesh.getColorAt(index, instanceColor), instanceColor) : materialColor;
    const dark = luminance(color) < 0.24;
    if (!dark) continue;

    const sizeX = Math.abs(geometrySize.x * scale.x);
    const sizeY = Math.abs(geometrySize.y * scale.y);
    const sizeZ = Math.abs(geometrySize.z * scale.z);
    const horizontalArea = sizeX * sizeZ;
    const flatGround = position.y < 0.72 && sizeY < 0.48 && horizontalArea > 0.14;
    const far = Math.abs(position.x) > 28 || Math.abs(position.z) > 45;
    const oversized = sizeY > 2.2 || horizontalArea > 8;

    // Phase 13 skid marks are thin geometry with a unit instance Y-scale.
    // Classifying by effective geometry dimensions removes them correctly.
    if (flatGround || (far && oversized)) {
      scale.multiplyScalar(0.001);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      matrixChanged = true;
    } else if (far) {
      if (!mesh.instanceColor) {
        for (let fill = 0; fill < mesh.count; fill += 1) mesh.setColorAt(fill, materialColor);
      }
      mesh.setColorAt(index, green);
      colorChanged = true;
    }
  }

  if (matrixChanged) mesh.instanceMatrix.needsUpdate = true;
  if (colorChanged && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function cleanupRegularMesh(mesh: THREE.Mesh): void {
  if (hasPhase19Ancestor(mesh)) return;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const colors = materials.flatMap((material) => {
    if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) return [material.color];
    return [];
  });
  if (colors.length === 0 || !colors.some((color) => luminance(color) < 0.2)) return;

  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  if (!box) return;
  const localSize = new THREE.Vector3();
  box.getSize(localSize);
  const worldScale = new THREE.Vector3();
  mesh.getWorldScale(worldScale);
  const size = localSize.multiply(new THREE.Vector3(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z)));
  const world = new THREE.Vector3();
  mesh.getWorldPosition(world);
  const flatGround = world.y < 0.62 && size.y < 0.7 && size.x * size.z > 0.2;
  const distantLarge = (Math.abs(world.x) > 28 || Math.abs(world.z) > 45) && (size.y > 2 || size.x * size.z > 4);
  if (flatGround || distantLarge) mesh.visible = false;
}

function sanitizeScene(demo: CleanupDemo): void {
  demo.scene.updateMatrixWorld(true);
  demo.scene.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) cleanupInstancedMesh(object);
    else if (object instanceof THREE.Mesh) cleanupRegularMesh(object);
  });
}

export function installCartRoguePhase19ArtifactCleanup(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as CleanupDemo;
  const originalUpdate = prototype.updateVisuals;
  prototype.updateVisuals = function updatePhase19ArtifactCleanup(this: CleanupDemo, delta: number): void {
    originalUpdate.call(this, delta);
    const key = this as unknown as object;
    if (!cleaned.has(key)) {
      sanitizeScene(this);
      cleaned.add(key);
    }
  };
}

installCartRoguePhase19ArtifactCleanup();

import * as THREE from "three";
import { applyCartPerFaceVertexColor } from "./CartFaceColor";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase42RepairDemo {
  scene: THREE.Scene;
  buildWorld(): void;
}

interface ColorBucket {
  matrices: THREE.Matrix4[];
  r: number;
  g: number;
  b: number;
  count: number;
}

const STATIC_ROOTS = [
  { name: "phase19-target-art-world", faceColor: true },
  { name: "phase19-near-garden-polish", faceColor: true },
  { name: "phase19-reference-ground-cover", faceColor: true },
  { name: "phase35-mosaic-diorama", faceColor: false },
] as const;

const SKIP_NAMES = new Set([
  "phase35-road-mosaic",
  "phase35-hero-tree-canopies",
]);

function bucketKey(color: THREE.Color): string {
  const steps = 5;
  return `${Math.round(color.r * steps)}:${Math.round(color.g * steps)}:${Math.round(color.b * steps)}`;
}

function cloneFixedMaterial(source: THREE.Material, color: THREE.Color): THREE.Material {
  if (source instanceof THREE.MeshBasicMaterial) {
    const material = source.clone();
    material.color.copy(color);
    material.vertexColors = false;
    material.needsUpdate = true;
    return material;
  }
  if (source instanceof THREE.MeshStandardMaterial) {
    const material = source.clone();
    material.color.copy(color);
    material.vertexColors = false;
    material.needsUpdate = true;
    return material;
  }
  return new THREE.MeshBasicMaterial({ color, toneMapped: false });
}

function rebuildStaticInstancedMesh(
  source: THREE.InstancedMesh,
  faceColor: boolean,
  seedBase: number,
): number {
  if (!source.instanceColor || !source.parent || source.count <= 0 || !source.visible) return 0;
  if (SKIP_NAMES.has(source.name)) return 0;

  const buckets = new Map<string, ColorBucket>();
  const color = new THREE.Color();
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < source.count; index += 1) {
    source.getColorAt(index, color);
    source.getMatrixAt(index, matrix);
    const key = bucketKey(color);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { matrices: [], r: 0, g: 0, b: 0, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.matrices.push(matrix.clone());
    bucket.r += color.r;
    bucket.g += color.g;
    bucket.b += color.b;
    bucket.count += 1;
  }

  const parent = source.parent;
  const replacementRoot = new THREE.Group();
  replacementRoot.name = `phase42-fixed-${source.name || "static-instanced"}`;
  replacementRoot.position.copy(source.position);
  replacementRoot.quaternion.copy(source.quaternion);
  replacementRoot.scale.copy(source.scale);
  replacementRoot.renderOrder = source.renderOrder;

  const sourceMaterial = Array.isArray(source.material) ? source.material[0] : source.material;
  let bucketIndex = 0;
  for (const bucket of buckets.values()) {
    const average = new THREE.Color(
      bucket.r / Math.max(1, bucket.count),
      bucket.g / Math.max(1, bucket.count),
      bucket.b / Math.max(1, bucket.count),
    );
    const material = cloneFixedMaterial(sourceMaterial, average);
    const mesh = new THREE.InstancedMesh(source.geometry, material, bucket.matrices.length);
    mesh.name = `${replacementRoot.name}-${bucketIndex}`;
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    mesh.frustumCulled = source.frustumCulled;
    bucket.matrices.forEach((item, index) => mesh.setMatrixAt(index, item));
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;

    if (faceColor && material instanceof THREE.MeshStandardMaterial) {
      applyCartPerFaceVertexColor(mesh, {
        variance: 0.065,
        topLift: 1.11,
        sideShade: 0.96,
        bottomShade: 0.8,
        hueJitter: 0.014,
        seed: seedBase + bucketIndex,
      });
    }
    replacementRoot.add(mesh);
    bucketIndex += 1;
  }

  source.visible = false;
  parent.add(replacementRoot);
  return bucketIndex;
}

function repairStaticRoots(scene: THREE.Scene): void {
  let repairedMeshes = 0;
  let fixedBuckets = 0;
  for (let rootIndex = 0; rootIndex < STATIC_ROOTS.length; rootIndex += 1) {
    const spec = STATIC_ROOTS[rootIndex];
    const root = scene.getObjectByName(spec.name);
    if (!root) continue;
    const targets: THREE.InstancedMesh[] = [];
    root.traverse((object) => {
      if (object instanceof THREE.InstancedMesh && object.instanceColor && object.visible && !SKIP_NAMES.has(object.name)) {
        targets.push(object);
      }
    });
    for (const target of targets) {
      const buckets = rebuildStaticInstancedMesh(target, spec.faceColor, 520 + rootIndex * 70 + repairedMeshes * 11);
      if (buckets > 0) {
        repairedMeshes += 1;
        fixedBuckets += buckets;
      }
    }
  }
  scene.userData.phase42FixedInstanceMeshes = repairedMeshes;
  scene.userData.phase42FixedColorBuckets = fixedBuckets;
}

export function installCartRoguePhase42StaticInstanceColorRepair(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase42RepairDemo;
  const oldWorld = prototype.buildWorld;
  prototype.buildWorld = function phase42StaticColorRepair(this: Phase42RepairDemo): void {
    oldWorld.call(this);
    repairStaticRoots(this.scene);
  };
}

installCartRoguePhase42StaticInstanceColorRepair();

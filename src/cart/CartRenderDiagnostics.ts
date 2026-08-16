import * as THREE from "three";

export interface CartRenderObjectState {
  exists: boolean;
  visible: boolean;
}

export interface CartRenderDiagnostics {
  ok: boolean;
  issues: string[];
  visibleMeshCount: number;
  visibleInstancedMeshCount: number;
  visibleInstanceColorMeshes: string[];
  finalGround: CartRenderObjectState;
  finalGroundBucketCount: number;
  finalWearBucketCount: number;
  legacyGround: Record<string, CartRenderObjectState>;
  stationaryTurboSkids: CartRenderObjectState;
  exitGuide: CartRenderObjectState;
  compactUndertray: CartRenderObjectState;
}

const LEGACY_GROUND_NAMES = [
  "phase34-floor-detail",
  "phase35-road-mosaic",
  "phase38-reliable-road-mosaic",
] as const;

function isEffectivelyVisible(object: THREE.Object3D | null): boolean {
  let current = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return object !== null;
}

function objectState(scene: THREE.Scene, name: string): CartRenderObjectState {
  const object = scene.getObjectByName(name) ?? null;
  return {
    exists: object !== null,
    visible: isEffectivelyVisible(object),
  };
}

function displayName(object: THREE.Object3D): string {
  return object.name || `${object.type}#${object.id}`;
}

export function collectCartRenderDiagnostics(scene: THREE.Scene): CartRenderDiagnostics {
  let visibleMeshCount = 0;
  let visibleInstancedMeshCount = 0;
  const visibleInstanceColorMeshes: string[] = [];

  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !isEffectivelyVisible(object)) return;
    visibleMeshCount += 1;
    if (!(object instanceof THREE.InstancedMesh)) return;
    visibleInstancedMeshCount += 1;
    if (object.instanceColor) visibleInstanceColorMeshes.push(displayName(object));
  });

  const finalGround = objectState(scene, "phase46-safe-ground-pattern");
  const finalRoot = scene.getObjectByName("phase46-safe-ground-pattern");
  let finalGroundBucketCount = 0;
  let finalWearBucketCount = 0;
  finalRoot?.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh) || !isEffectivelyVisible(object)) return;
    if (object.name.startsWith("phase46-ground-")) finalGroundBucketCount += 1;
    if (object.name.startsWith("phase46-wear-")) finalWearBucketCount += 1;
  });

  const legacyGround = Object.fromEntries(
    LEGACY_GROUND_NAMES.map((name) => [name, objectState(scene, name)]),
  ) as Record<string, CartRenderObjectState>;

  const issues: string[] = [];
  if (!finalGround.exists) issues.push("final ground root is missing");
  else if (!finalGround.visible) issues.push("final ground root is not effectively visible");
  if (finalGroundBucketCount < 5) issues.push(`final ground has too few visible color buckets: ${finalGroundBucketCount}`);
  if (finalWearBucketCount < 1) issues.push("final ground wear layer is missing");
  for (const [name, state] of Object.entries(legacyGround)) {
    if (state.visible) issues.push(`legacy ground is still visible: ${name}`);
  }

  return {
    ok: issues.length === 0,
    issues,
    visibleMeshCount,
    visibleInstancedMeshCount,
    visibleInstanceColorMeshes: visibleInstanceColorMeshes.sort(),
    finalGround,
    finalGroundBucketCount,
    finalWearBucketCount,
    legacyGround,
    stationaryTurboSkids: objectState(scene, "phase44-stationary-turbo-skids"),
    exitGuide: objectState(scene, "phase45-exit-guide"),
    compactUndertray: objectState(scene, "phase44-dark-compact-undertray"),
  };
}

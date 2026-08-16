import * as THREE from "three";

export interface CartRenderObjectState {
  exists: boolean;
  visible: boolean;
}

export interface CartRenderCameraState {
  exists: boolean;
  fov: number | null;
  y: number | null;
}

export interface CartRenderDiagnostics {
  ok: boolean;
  issues: string[];
  visibleMeshCount: number;
  visibleInstancedMeshCount: number;
  visibleInstanceColorMeshes: string[];
  riskyStaticInstanceColorMeshes: string[];
  finalGround: CartRenderObjectState;
  finalGroundBucketCount: number;
  finalWearBucketCount: number;
  legacyGround: Record<string, CartRenderObjectState>;
  stationaryTurboSkids: CartRenderObjectState;
  stationaryTurboSkidActiveCount: number;
  exitGuide: CartRenderObjectState;
  compactUndertray: CartRenderObjectState;
  heroPresentationPitch: number | null;
  heroPresentationRoll: number | null;
  camera: CartRenderCameraState;
}

const LEGACY_GROUND_NAMES = [
  "phase34-floor-detail",
  "phase35-road-mosaic",
  "phase38-reliable-road-mosaic",
] as const;

const RISKY_STATIC_INSTANCE_ROOTS = new Set([
  "phase19-target-art-world",
  "phase19-near-garden-polish",
  "phase19-reference-ground-cover",
  "phase35-mosaic-diorama",
]);

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

function objectPath(object: THREE.Object3D): string {
  const parts: string[] = [];
  let current: THREE.Object3D | null = object;
  while (current && !(current instanceof THREE.Scene)) {
    parts.unshift(current.name || `${current.type}#${current.id}`);
    current = current.parent;
  }
  return parts.join("/");
}

function hasRiskyStaticAncestor(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (RISKY_STATIC_INSTANCE_ROOTS.has(current.name)) return true;
    current = current.parent;
  }
  return false;
}

function activeSkidCount(scene: THREE.Scene): number {
  const object = scene.getObjectByName("phase44-stationary-turbo-skids");
  if (!(object instanceof THREE.InstancedMesh)) return 0;
  const matrix = new THREE.Matrix4();
  let active = 0;
  for (let index = 0; index < object.count; index += 1) {
    object.getMatrixAt(index, matrix);
    if (matrix.elements[13] > -10) active += 1;
  }
  return active;
}

function heroPresentationRotation(scene: THREE.Scene): { pitch: number | null; roll: number | null } {
  const surface = scene.getObjectByName("phase28-hero-surface");
  const presentation = surface?.parent ?? null;
  return {
    pitch: presentation ? presentation.rotation.x : null,
    roll: presentation ? presentation.rotation.z : null,
  };
}

function cameraState(scene: THREE.Scene): CartRenderCameraState {
  let camera: THREE.PerspectiveCamera | null = null;
  scene.traverse((object) => {
    if (!camera && object instanceof THREE.PerspectiveCamera) camera = object;
  });
  return {
    exists: camera !== null,
    fov: camera ? camera.fov : null,
    y: camera ? camera.position.y : null,
  };
}

export function collectCartRenderDiagnostics(scene: THREE.Scene): CartRenderDiagnostics {
  let visibleMeshCount = 0;
  let visibleInstancedMeshCount = 0;
  const visibleInstanceColorMeshes: string[] = [];
  const riskyStaticInstanceColorMeshes: string[] = [];

  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !isEffectivelyVisible(object)) return;
    visibleMeshCount += 1;
    if (!(object instanceof THREE.InstancedMesh)) return;
    visibleInstancedMeshCount += 1;
    if (!object.instanceColor) return;
    const path = objectPath(object);
    visibleInstanceColorMeshes.push(path);
    if (hasRiskyStaticAncestor(object)) riskyStaticInstanceColorMeshes.push(path);
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
  const camera = cameraState(scene);
  const heroRotation = heroPresentationRotation(scene);

  const issues: string[] = [];
  if (!finalGround.exists) issues.push("final ground root is missing");
  else if (!finalGround.visible) issues.push("final ground root is not effectively visible");
  if (finalGroundBucketCount < 5) issues.push(`final ground has too few visible color buckets: ${finalGroundBucketCount}`);
  if (finalWearBucketCount < 1) issues.push("final ground wear layer is missing");
  for (const [name, state] of Object.entries(legacyGround)) {
    if (state.visible) issues.push(`legacy ground is still visible: ${name}`);
  }
  if (riskyStaticInstanceColorMeshes.length > 0) {
    issues.push(`static instanceColor meshes escaped fixed-color repair: ${riskyStaticInstanceColorMeshes.join(", ")}`);
  }
  if (!camera.exists || camera.fov === null || camera.y === null) issues.push("perspective chase camera is missing");
  else {
    if (camera.fov < 50 || camera.fov > 66) issues.push(`camera FOV is outside the intended chase range: ${camera.fov}`);
    if (camera.y < 4.5 || camera.y > 10) issues.push(`camera height is outside the intended chase range: ${camera.y}`);
  }

  return {
    ok: issues.length === 0,
    issues,
    visibleMeshCount,
    visibleInstancedMeshCount,
    visibleInstanceColorMeshes: visibleInstanceColorMeshes.sort(),
    riskyStaticInstanceColorMeshes: riskyStaticInstanceColorMeshes.sort(),
    finalGround,
    finalGroundBucketCount,
    finalWearBucketCount,
    legacyGround,
    stationaryTurboSkids: objectState(scene, "phase44-stationary-turbo-skids"),
    stationaryTurboSkidActiveCount: activeSkidCount(scene),
    exitGuide: objectState(scene, "phase45-exit-guide"),
    compactUndertray: objectState(scene, "phase44-dark-compact-undertray"),
    heroPresentationPitch: heroRotation.pitch,
    heroPresentationRoll: heroRotation.roll,
    camera,
  };
}

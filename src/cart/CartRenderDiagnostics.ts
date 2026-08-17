import * as THREE from "three";

export interface CartRenderObjectState {
  exists: boolean;
  visible: boolean;
}

export interface CartRenderCameraState {
  exists: boolean;
  path: string | null;
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
  environmentRichness: CartRenderObjectState;
  environmentInstancedMeshCount: number;
  environmentRenderableMeshCount: number;
  environmentInstanceColorMeshCount: number;
  environmentSafeColorPipeline: string | null;
  environmentSurfaceY: number | null;
  environmentRoadRhythmY: number | null;
  impactSpeedRoot: CartRenderObjectState;
  impactSpeedLineState: CartRenderObjectState;
  impactSpeedIntensity: number;
  impactEventChain: number;
  impactOverdriveSeconds: number;
  titanVisualRoot: CartRenderObjectState;
  titanArmorRing: CartRenderObjectState;
  titanWeakCore: CartRenderObjectState;
  threatDodgeRoot: CartRenderObjectState;
  threatLine: CartRenderObjectState;
  pursuitEventRoot: CartRenderObjectState;
  dangerZone: CartRenderObjectState;
  titanPredatorRoot: CartRenderObjectState;
  titanPredatorRing: CartRenderObjectState;
  titanCounterRing: CartRenderObjectState;
  stationaryTurboSkids: CartRenderObjectState;
  stationaryTurboSkidActiveCount: number;
  turboAttackFrame?: CartRenderObjectState;
  turboAttackMode?: string | null;
  turboAttackIntensity?: number;
  turboAttackSerial?: number;
  turboAttackObservedAttackSerial?: number;
  turboAttackPeakIntensity?: number;
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
  "phase80-environment-richness",
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
  return { exists: object !== null, visible: isEffectivelyVisible(object) };
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

function countVisibleInstancedMeshes(root: THREE.Object3D | null): number {
  if (!root) return 0;
  let count = 0;
  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh && isEffectivelyVisible(object)) count += 1;
  });
  return count;
}

function countVisibleRenderableMeshes(root: THREE.Object3D | null): number {
  if (!root) return 0;
  let count = 0;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && isEffectivelyVisible(object)) count += 1;
  });
  return count;
}

function countInstanceColorMeshes(root: THREE.Object3D | null): number {
  if (!root) return 0;
  let count = 0;
  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh && object.instanceColor) count += 1;
  });
  return count;
}

function heroPresentationRotation(scene: THREE.Scene): { pitch: number | null; roll: number | null } {
  const surface = scene.getObjectByName("phase28-hero-surface");
  const presentation = surface?.parent ?? null;
  return {
    pitch: presentation ? presentation.rotation.x : null,
    roll: presentation ? presentation.rotation.z : null,
  };
}

function finiteUserDataNumber(object: THREE.Object3D | null, key: string): number {
  const value = object?.userData[key];
  return Number.isFinite(value) ? Number(value) : 0;
}

function finiteNestedNumber(object: THREE.Object3D | null, key: string): number | null {
  const details = object?.userData.environmentRichness as Record<string, unknown> | undefined;
  const value = details?.[key];
  return Number.isFinite(value) ? Number(value) : null;
}

function nestedString(object: THREE.Object3D | null, key: string): string | null {
  const details = object?.userData.environmentRichness as Record<string, unknown> | undefined;
  const value = details?.[key];
  return typeof value === "string" ? value : null;
}

function turboAttackState(scene: THREE.Scene): {
  state: CartRenderObjectState;
  mode: string | null;
  intensity: number;
  serial: number;
  observedAttackSerial: number;
  peakIntensity: number;
} {
  const object = scene.getObjectByName("phase54-turbo-attack-frame") ?? null;
  return {
    state: { exists: object !== null, visible: isEffectivelyVisible(object) },
    mode: typeof object?.userData.cartTurboAttackMode === "string" ? object.userData.cartTurboAttackMode : null,
    intensity: finiteUserDataNumber(object, "cartTurboAttackIntensity"),
    serial: finiteUserDataNumber(object, "cartTurboAttackSerial"),
    observedAttackSerial: finiteUserDataNumber(object, "cartTurboAttackObservedAttackSerial"),
    peakIntensity: finiteUserDataNumber(object, "cartTurboAttackPeakIntensity"),
  };
}

function cameraState(scene: THREE.Scene): CartRenderCameraState {
  let camera: THREE.PerspectiveCamera | null = null;
  scene.traverse((object) => {
    if (!camera && object instanceof THREE.PerspectiveCamera) camera = object;
  });
  if (!camera) return { exists: false, path: null, fov: null, y: null };
  const worldPosition = new THREE.Vector3();
  camera.getWorldPosition(worldPosition);
  return { exists: true, path: objectPath(camera), fov: camera.fov, y: worldPosition.y };
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
  const environmentRoot = scene.getObjectByName("phase80-environment-richness") ?? null;
  const turboHuntWorld = scene.getObjectByName("phase67-turbo-hunt-world") ?? null;
  const environmentRichness = objectState(scene, "phase80-environment-richness");
  const environmentInstancedMeshCount = countVisibleInstancedMeshes(environmentRoot);
  const environmentRenderableMeshCount = countVisibleRenderableMeshes(environmentRoot);
  const environmentInstanceColorMeshCount = countInstanceColorMeshes(environmentRoot);
  const environmentSafeColorPipeline = nestedString(environmentRoot, "safeColorPipeline");
  const environmentSurfaceY = finiteNestedNumber(environmentRoot, "surfaceY");
  const environmentRoadRhythmY = finiteNestedNumber(environmentRoot, "roadRhythmY");
  const impactRoot = scene.getObjectByName("phase82-impact-speed-root") ?? null;
  const impactSpeedRoot = objectState(scene, "phase82-impact-speed-root");
  const impactSpeedLineState = objectState(scene, "phase82-speed-lines");
  const impactSpeedIntensity = finiteUserDataNumber(impactRoot, "cartSpeedIntensity");
  const impactEventChain = finiteUserDataNumber(impactRoot, "cartEventChain");
  const impactOverdriveSeconds = finiteUserDataNumber(impactRoot, "cartOverdriveSeconds");
  const titanVisualRoot = objectState(scene, "phase83-titan-visual-root");
  const titanArmorRing = objectState(scene, "phase83-titan-armor-ring");
  const titanWeakCore = objectState(scene, "phase83-titan-weak-core");
  const threatDodgeRoot = objectState(scene, "phase84-threat-dodge-root");
  const threatLine = objectState(scene, "phase84-threat-line");
  const pursuitEventRoot = objectState(scene, "phase85-pursuit-event-root");
  const dangerZone = objectState(scene, "phase85-danger-zone");
  const titanPredatorRoot = objectState(scene, "phase86-titan-predator-root");
  const titanPredatorRing = objectState(scene, "phase86-titan-predator-ring");
  const titanCounterRing = objectState(scene, "phase86-titan-counter-ring");
  const camera = cameraState(scene);
  const heroRotation = heroPresentationRotation(scene);
  const turboAttack = turboAttackState(scene);

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
  if (environmentRoot && environmentInstanceColorMeshCount > 0) {
    issues.push(`Phase80 contains unsafe instanceColor meshes: ${environmentInstanceColorMeshCount}`);
  }
  if (environmentRoot && environmentSafeColorPipeline !== "fixed-material-buckets") {
    issues.push(`Phase80 safe color pipeline is missing: ${environmentSafeColorPipeline ?? "null"}`);
  }
  if (environmentRoot && (environmentSurfaceY === null || environmentSurfaceY <= 0)) {
    issues.push(`Phase80 surface overlay is not above the Turbo Hunt floor: ${environmentSurfaceY}`);
  }
  if (environmentRoot && (environmentRoadRhythmY === null || environmentRoadRhythmY <= (environmentSurfaceY ?? 0))) {
    issues.push(`Phase80 road rhythm is not layered above the surface patches: ${environmentRoadRhythmY}`);
  }
  if (turboHuntWorld && !impactSpeedRoot.exists) issues.push("Phase82 impact/speed root is missing");
  if (turboHuntWorld && !impactSpeedLineState.exists) issues.push("Phase82 speed-line batch is missing");
  if (turboHuntWorld && !titanVisualRoot.exists) issues.push("Phase83 Titan visual root is missing");
  if (turboHuntWorld && !titanArmorRing.exists) issues.push("Phase83 Titan armor ring is missing");
  if (turboHuntWorld && !titanWeakCore.exists) issues.push("Phase83 Titan weak core is missing");
  if (turboHuntWorld && !threatDodgeRoot.exists) issues.push("Phase84 threat/dodge root is missing");
  if (turboHuntWorld && !threatLine.exists) issues.push("Phase84 threat line is missing");
  if (turboHuntWorld && !pursuitEventRoot.exists) issues.push("Phase85 pursuit event root is missing");
  if (turboHuntWorld && !dangerZone.exists) issues.push("Phase85 danger zone is missing");
  if (turboHuntWorld && !titanPredatorRoot.exists) issues.push("Phase86 Titan Predator root is missing");
  if (turboHuntWorld && !titanPredatorRing.exists) issues.push("Phase86 Titan Predator ring is missing");
  if (turboHuntWorld && !titanCounterRing.exists) issues.push("Phase86 Titan counter ring is missing");
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
    environmentRichness,
    environmentInstancedMeshCount,
    environmentRenderableMeshCount,
    environmentInstanceColorMeshCount,
    environmentSafeColorPipeline,
    environmentSurfaceY,
    environmentRoadRhythmY,
    impactSpeedRoot,
    impactSpeedLineState,
    impactSpeedIntensity,
    impactEventChain,
    impactOverdriveSeconds,
    titanVisualRoot,
    titanArmorRing,
    titanWeakCore,
    threatDodgeRoot,
    threatLine,
    pursuitEventRoot,
    dangerZone,
    titanPredatorRoot,
    titanPredatorRing,
    titanCounterRing,
    stationaryTurboSkids: objectState(scene, "phase44-stationary-turbo-skids"),
    stationaryTurboSkidActiveCount: activeSkidCount(scene),
    turboAttackFrame: turboAttack.state,
    turboAttackMode: turboAttack.mode,
    turboAttackIntensity: turboAttack.intensity,
    turboAttackSerial: turboAttack.serial,
    turboAttackObservedAttackSerial: turboAttack.observedAttackSerial,
    turboAttackPeakIntensity: turboAttack.peakIntensity,
    exitGuide: objectState(scene, "phase45-exit-guide"),
    compactUndertray: objectState(scene, "phase44-dark-compact-undertray"),
    heroPresentationPitch: heroRotation.pitch,
    heroPresentationRoll: heroRotation.roll,
    camera,
  };
}

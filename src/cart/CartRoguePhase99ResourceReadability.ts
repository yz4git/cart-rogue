import * as THREE from "three";
import type { CartResourceSnapshot } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase99Demo {
  resourceGroups: Map<string, THREE.Group>;
  buildResources(resources: readonly CartResourceSnapshot[]): void;
  updateVisuals(delta: number): void;
}

interface ResourceVisualEntry {
  kind: CartResourceSnapshot["kind"];
  group: THREE.Group;
  accent: THREE.Group;
  halo: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
}

interface ResourceVisualState {
  entries: Map<string, ResourceVisualEntry>;
  recoveryCrossVertical: THREE.BoxGeometry;
  recoveryCrossHorizontal: THREE.BoxGeometry;
  recoveryWing: THREE.BoxGeometry;
  turboBolt: THREE.ShapeGeometry;
  turboSpine: THREE.BoxGeometry;
  haloGeometry: THREE.TorusGeometry;
  recoveryWhite: THREE.MeshStandardMaterial;
  recoveryBody: THREE.MeshStandardMaterial;
  recoveryGlow: THREE.MeshBasicMaterial;
  turboWhite: THREE.MeshStandardMaterial;
  turboGlow: THREE.MeshBasicMaterial;
}

const stateByDemo = new WeakMap<object, ResourceVisualState>();

export const CART_RECOVERY_VISUAL_COLOR = 0xff4f68;
export const CART_RECOVERY_GLOW_COLOR = 0x82ffb0;
export const CART_TURBO_VISUAL_COLOR = 0x42c7ff;
export const CART_RESOURCE_RECOVERY_MARK = "recovery-cross";
export const CART_RESOURCE_TURBO_MARK = "turbo-bolt";

function standardMaterial(color: number, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.58,
    metalness: 0.08,
    flatShading: true,
    emissive: emissive || 0x000000,
    emissiveIntensity: emissive ? 0.48 : 0,
  });
}

function glowMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

function makeTurboBoltGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.1, 0.86);
  shape.lineTo(0.34, 0.28);
  shape.lineTo(0.08, 0.28);
  shape.lineTo(0.3, -0.84);
  shape.lineTo(-0.4, -0.12);
  shape.lineTo(-0.12, -0.12);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 1);
}

function stateFor(demo: Phase99Demo): ResourceVisualState {
  const key = demo as unknown as object;
  const existing = stateByDemo.get(key);
  if (existing) return existing;
  const created: ResourceVisualState = {
    entries: new Map(),
    recoveryCrossVertical: new THREE.BoxGeometry(0.24, 0.9, 0.12),
    recoveryCrossHorizontal: new THREE.BoxGeometry(0.9, 0.24, 0.12),
    recoveryWing: new THREE.BoxGeometry(0.34, 0.86, 0.34),
    turboBolt: makeTurboBoltGeometry(),
    turboSpine: new THREE.BoxGeometry(0.16, 1.92, 0.16),
    haloGeometry: new THREE.TorusGeometry(0.86, 0.055, 6, 24),
    recoveryWhite: standardMaterial(0xffffff, 0xffffff),
    recoveryBody: standardMaterial(CART_RECOVERY_VISUAL_COLOR, CART_RECOVERY_VISUAL_COLOR),
    recoveryGlow: glowMaterial(CART_RECOVERY_GLOW_COLOR, 0.56),
    turboWhite: standardMaterial(0xffffff, 0xffffff),
    turboGlow: glowMaterial(CART_TURBO_VISUAL_COLOR, 0.62),
  };
  stateByDemo.set(key, created);
  return created;
}

function mesh<G extends THREE.BufferGeometry, M extends THREE.Material>(
  geometry: G,
  material: M,
  name: string,
): THREE.Mesh<G, M> {
  const value = new THREE.Mesh(geometry, material);
  value.name = name;
  value.renderOrder = 10;
  return value;
}

function buildRecoveryAccent(state: ResourceVisualState, id: string): { accent: THREE.Group; halo: ResourceVisualEntry["halo"] } {
  const accent = new THREE.Group();
  accent.name = `cart-resource-${id}-${CART_RESOURCE_RECOVERY_MARK}`;
  accent.userData.resourceRole = "RECOVERY";
  accent.userData.symbol = "MEDICAL_PLUS";

  // Broad side shoulders make recovery visibly wider than Turbo, so it stays
  // identifiable even in monochrome or peripheral vision.
  const leftWing = mesh(state.recoveryWing, state.recoveryBody, `cart-resource-${id}-recovery-wing-left`);
  const rightWing = mesh(state.recoveryWing, state.recoveryBody, `cart-resource-${id}-recovery-wing-right`);
  leftWing.position.set(-0.72, 1.1, 0);
  rightWing.position.set(0.72, 1.1, 0);
  accent.add(leftWing, rightWing);

  for (const z of [-0.48, 0.48] as const) {
    const vertical = mesh(state.recoveryCrossVertical, state.recoveryWhite, `cart-resource-${id}-recovery-cross-v`);
    const horizontal = mesh(state.recoveryCrossHorizontal, state.recoveryWhite, `cart-resource-${id}-recovery-cross-h`);
    vertical.position.set(0, 1.16, z);
    horizontal.position.set(0, 1.16, z);
    accent.add(vertical, horizontal);
  }

  const halo = mesh(state.haloGeometry, state.recoveryGlow, `cart-resource-${id}-recovery-halo`);
  halo.position.y = 2.04;
  halo.rotation.x = Math.PI / 2;
  accent.add(halo);
  return { accent, halo };
}

function buildTurboAccent(state: ResourceVisualState, id: string): { accent: THREE.Group; halo: ResourceVisualEntry["halo"] } {
  const accent = new THREE.Group();
  accent.name = `cart-resource-${id}-${CART_RESOURCE_TURBO_MARK}`;
  accent.userData.resourceRole = "TURBO";
  accent.userData.symbol = "LIGHTNING_BOLT";

  const spine = mesh(state.turboSpine, state.turboGlow, `cart-resource-${id}-turbo-spine`);
  spine.position.y = 1.18;
  accent.add(spine);

  for (const z of [-0.5, 0.5] as const) {
    const bolt = mesh(state.turboBolt, state.turboWhite, `cart-resource-${id}-turbo-bolt`);
    bolt.position.set(0, 1.2, z);
    bolt.scale.setScalar(0.9);
    if (z < 0) bolt.rotation.y = Math.PI;
    accent.add(bolt);
  }

  const halo = mesh(state.haloGeometry, state.turboGlow, `cart-resource-${id}-turbo-halo`);
  halo.position.y = 1.18;
  halo.rotation.y = Math.PI / 2;
  halo.scale.setScalar(1.18);
  accent.add(halo);
  return { accent, halo };
}

function decorateResources(demo: Phase99Demo, resources: readonly CartResourceSnapshot[]): void {
  const state = stateFor(demo);
  for (const pickup of resources) {
    if (state.entries.has(pickup.id)) continue;
    const group = demo.resourceGroups.get(pickup.id);
    if (!group) continue;
    const decoration = pickup.kind === "gas"
      ? buildRecoveryAccent(state, pickup.id)
      : buildTurboAccent(state, pickup.id);
    group.add(decoration.accent);
    group.userData.cartResourceKind = pickup.kind;
    group.userData.cartResourceRole = pickup.kind === "gas" ? "RECOVERY" : "TURBO";
    group.userData.cartResourceSymbol = pickup.kind === "gas" ? "MEDICAL_PLUS" : "LIGHTNING_BOLT";
    state.entries.set(pickup.id, { kind: pickup.kind, group, ...decoration });
  }
}

function updateResourceReadability(demo: Phase99Demo, delta: number): void {
  const state = stateByDemo.get(demo as unknown as object);
  if (!state) return;
  const now = typeof performance !== "undefined" ? performance.now() * 0.001 : Date.now() * 0.001;
  const safeDelta = Math.max(0, Math.min(0.05, delta));
  for (const [id, entry] of state.entries) {
    if (!entry.group.visible) continue;
    const phase = now + id.length * 0.37;
    if (entry.kind === "gas") {
      // Recovery deliberately stays mostly face-on. A slow breathing pulse reads
      // as safe/replenish and keeps the plus sign legible while cornering.
      entry.group.rotation.y = Math.sin(phase * 1.45) * 0.11;
      const pulse = 1 + Math.sin(phase * 3.2) * 0.055;
      entry.accent.scale.setScalar(pulse);
      entry.halo.rotation.z += safeDelta * 0.55;
      entry.halo.material.opacity = 0.48 + (Math.sin(phase * 3.2) * 0.5 + 0.5) * 0.2;
    } else {
      // Turbo has a sharper, energetic spin and a vertical bolt silhouette.
      entry.group.rotation.y = phase * 2.15;
      entry.accent.scale.setScalar(1 + Math.sin(phase * 6.4) * 0.025);
      entry.halo.rotation.z += safeDelta * 2.8;
      entry.halo.material.opacity = 0.52 + (Math.sin(phase * 6.4) * 0.5 + 0.5) * 0.24;
    }
  }
}

export function installCartRoguePhase99ResourceReadability(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase99Demo;
  const previousBuildResources = prototype.buildResources;
  prototype.buildResources = function phase99ResourceReadabilityBuild(
    this: Phase99Demo,
    resources: readonly CartResourceSnapshot[],
  ): void {
    previousBuildResources.call(this, resources);
    decorateResources(this, resources);
  };

  const previousUpdateVisuals = prototype.updateVisuals;
  prototype.updateVisuals = function phase99ResourceReadabilityUpdate(this: Phase99Demo, delta: number): void {
    previousUpdateVisuals.call(this, delta);
    updateResourceReadability(this, delta);
  };
}

installCartRoguePhase99ResourceReadability();

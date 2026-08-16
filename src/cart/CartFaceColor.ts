import * as THREE from "three";

export interface CartFaceColorOptions {
  variance?: number;
  topLift?: number;
  sideShade?: number;
  bottomShade?: number;
  hueJitter?: number;
  seed?: number;
}

function hash01(value: number): number {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function faceNormalY(position: THREE.BufferAttribute, index: number): number {
  const ax = position.getX(index);
  const ay = position.getY(index);
  const az = position.getZ(index);
  const bx = position.getX(index + 1);
  const by = position.getY(index + 1);
  const bz = position.getZ(index + 1);
  const cx = position.getX(index + 2);
  const cy = position.getY(index + 2);
  const cz = position.getZ(index + 2);
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return ny / length;
}

/**
 * Convert one MeshStandardMaterial mesh to deterministic triangle-flat vertex
 * colors. Every triangle receives exactly one RGB value on all three corners,
 * preserving the texture-free flat polygon art direction.
 */
export function applyCartPerFaceVertexColor(
  mesh: THREE.Mesh,
  options: CartFaceColorOptions = {},
): boolean {
  if (Array.isArray(mesh.material) || !(mesh.material instanceof THREE.MeshStandardMaterial)) return false;
  const sourcePosition = mesh.geometry.getAttribute("position");
  if (!(sourcePosition instanceof THREE.BufferAttribute) || sourcePosition.count < 3) return false;

  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  geometry.computeVertexNormals();
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const baseMaterial = mesh.material;
  const base = baseMaterial.color.clone();
  const color = new THREE.Color();
  const variance = options.variance ?? 0.055;
  const topLift = options.topLift ?? 1.08;
  const sideShade = options.sideShade ?? 0.96;
  const bottomShade = options.bottomShade ?? 0.84;
  const hueJitter = options.hueJitter ?? 0.012;
  const seed = options.seed ?? 0;

  for (let face = 0; face + 2 < position.count; face += 3) {
    const normalY = faceNormalY(position, face);
    const faceIndex = face / 3;
    const noise = hash01(faceIndex * 17.37 + seed * 31.7);
    const hue = (hash01(faceIndex * 9.11 + seed * 7.3) - 0.5) * hueJitter;
    const direction = normalY > 0.55 ? topLift : normalY < -0.35 ? bottomShade : sideShade;
    const shade = direction * (1 + (noise * 2 - 1) * variance);
    color.copy(base).offsetHSL(hue, 0, (noise - 0.5) * 0.025).multiplyScalar(shade);
    color.r = Math.min(1, Math.max(0, color.r));
    color.g = Math.min(1, Math.max(0, color.g));
    color.b = Math.min(1, Math.max(0, color.b));
    for (let corner = 0; corner < 3; corner += 1) {
      const offset = (face + corner) * 3;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = baseMaterial.clone();
  material.color.set(0xffffff);
  material.vertexColors = true;
  material.flatShading = true;
  material.needsUpdate = true;
  mesh.geometry = geometry;
  mesh.material = material;
  mesh.userData.cartPerFaceVertexColor = true;
  return true;
}

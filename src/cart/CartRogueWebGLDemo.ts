import * as THREE from "three";
import { RallyChaseCamera } from "../rally/RallyChaseCamera";
import { CartArenaSession } from "./CartArenaSession";
import type { CartArenaSessionSnapshot, CartEnemySnapshot, CartObstacleSnapshot, CartResourceSnapshot } from "./CartArenaSession";
import type { CartRogueDemoHandle, CartRogueSnapshotHandler } from "./CartRogueDemo";
import { CART_WORLD_GRAPH } from "./CartWorldGraph";

interface DebrisPiece {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  spin: THREE.Vector3;
}

interface ImpactBurst {
  group: THREE.Group;
  life: number;
  maxLife: number;
}

interface DustParticle {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

interface SpeedLineSeed {
  x: number;
  y: number;
  phase: number;
  length: number;
}

const C = {
  sky: 0xaedcff,
  skyTop: 0x73bde8,
  skyHorizon: 0xe8f7ff,
  fog: 0xdaf0ff,
  sand: 0xf0c990,
  sand2: 0xe7b977,
  sandHi: 0xf8dfad,
  grass: 0xa8d68d,
  grass2: 0x82c47d,
  grassDark: 0x65aa6d,
  boss: 0xc6a8dd,
  white: 0xfff5df,
  fence: 0xe9e0d0,
  trunk: 0x8f674f,
  pink: 0xf29ac2,
  pink2: 0xe779aa,
  lavender: 0xb8a0e5,
  flowerBlue: 0x91b8f3,
  flowerYellow: 0xf3d46c,
  leaf: 0x8bc977,
  leaf2: 0x6fb46c,
  player: 0x42bdb7,
  playerDark: 0x258d8f,
  playerRoof: 0xf4efe7,
  glass: 0x4f7180,
  tire: 0x313943,
  wheelHub: 0xd9e0de,
  enemy: 0xd7d95d,
  chaser: 0x93d05e,
  heavy: 0x7b6b82,
  bossEnemy: 0x37333d,
  bossAccent: 0xf05f64,
  hp: 0xf05463,
  hpBack: 0x252b31,
  turbo: 0x42bdf4,
  gateLocked: 0xe95f66,
  gateOpen: 0x6bd3a4,
  gas: 0xf05f70,
  turboCell: 0x55c8f3,
  rock: 0xc8c2b7,
  rock2: 0xd8d2c7,
  smash: 0x58d7ee,
};

const DUST_COUNT = 30;
const PETAL_COUNT = 52;
const SPEED_LINE_COUNT = 18;

export class CartRogueWebGLDemo implements CartRogueDemoHandle {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 420);
  private readonly chaseCamera = new RallyChaseCamera();
  private readonly session = new CartArenaSession();
  private readonly enemyGroups = new Map<string, THREE.Group>();
  private readonly enemyAlive = new Map<string, boolean>();
  private readonly resourceGroups = new Map<string, THREE.Group>();
  private readonly obstacleGroups = new Map<string, THREE.Group>();
  private readonly obstacleAlive = new Map<string, boolean>();
  private readonly gateBars = new Map<string, THREE.Mesh>();
  private readonly debris: DebrisPiece[] = [];
  private readonly bursts: ImpactBurst[] = [];
  private readonly turboTrails = new THREE.Group();
  private readonly playerVisual = new THREE.Group();
  private readonly speedLines = new THREE.Group();
  private readonly speedLineGeometry = new THREE.BufferGeometry();
  private readonly speedLineMaterial = new THREE.LineBasicMaterial({
    color: C.turbo,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  private readonly speedLineSeeds: SpeedLineSeed[] = [];
  private readonly impactOverlayMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  private readonly impactOverlay = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), this.impactOverlayMaterial);
  private readonly boostLight = new THREE.PointLight(C.turbo, 0, 14, 2);
  private readonly dustMesh: THREE.InstancedMesh;
  private readonly dustParticles: DustParticle[] = [];
  private readonly dustDummy = new THREE.Object3D();
  private readonly petalGeometry = new THREE.BufferGeometry();
  private readonly petalPositions = new Float32Array(PETAL_COUNT * 3);
  private readonly petalBase = new Float32Array(PETAL_COUNT * 3);
  private readonly petalSeeds = new Float32Array(PETAL_COUNT);
  private readonly petalPoints: THREE.Points;
  private dustCursor = 0;
  private dustAccumulator = 0;
  private frameId = 0;
  private lastTime = performance.now();
  private statsTimer = 0;
  private elapsed = 0;
  private cameraShake = 0;
  private impactFlash = 0;
  private lastRamSignature = "";
  private steer = 0;
  private boost = false;
  private brake = false;
  private paused = false;
  private failed = false;
  private disposed = false;

  constructor(
    private readonly mount: HTMLElement,
    private readonly onSnapshot: CartRogueSnapshotHandler,
    private readonly onRuntimeFailure: (message: string, error: unknown) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
    this.renderer.domElement.className = "cart-rogue-canvas";
    this.renderer.domElement.setAttribute("aria-label", "Cart Rogue WebGL game view");
    this.renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost, { passive: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45));
    this.mount.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(C.sky);
    this.scene.fog = new THREE.Fog(C.fog, 100, 310);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x6f8f63, 2.25));
    const sun = new THREE.DirectionalLight(0xffefd4, 3.2);
    sun.position.set(-42, 62, -32);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -72;
    sun.shadow.camera.right = 72;
    sun.shadow.camera.top = 84;
    sun.shadow.camera.bottom = -32;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 170;
    sun.shadow.bias = -0.00035;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xb9d9ff, 0.75);
    fill.position.set(38, 28, 24);
    this.scene.add(fill);

    this.dustMesh = this.buildDustPool();
    this.petalPoints = this.buildPetalCloud();
    this.buildAtmosphere();
    this.buildWorld();
    this.scene.add(this.session.car.group);
    this.buildPlayerVisual();
    this.buildTurboTrails();
    this.buildCameraFx();

    const initial = this.session.snapshot();
    this.buildEnemies(initial.enemies);
    this.buildResources(initial.resources);
    this.buildObstacles(initial.obstacles);
    this.buildGate("arena-01", 52);
    this.buildGate("arena-02", 140);
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("orientationchange", this.resize);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.animate(performance.now());
  }

  setSteering(value: number): void {
    this.steer = Math.max(-1, Math.min(1, value));
  }

  setBoost(active: boolean): void {
    this.boost = active;
  }

  setBrake(active: boolean): void {
    this.brake = active;
  }

  pause(): void {
    this.paused = true;
    this.boost = false;
    this.brake = false;
    this.steer = 0;
  }

  resume(): void {
    if (!this.failed) {
      this.paused = false;
      this.lastTime = performance.now();
    }
  }

  getSnapshot() {
    return this.session.snapshot();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("orientationchange", this.resize);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.handleContextLost);
    this.session.dispose();

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Points) && !(object instanceof THREE.LineSegments)) return;
      geometries.add(object.geometry as THREE.BufferGeometry);
      const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
      meshMaterials.forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private mat(color: number, emissive = 0): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.78,
      metalness: 0.035,
      flatShading: true,
      emissive: emissive || 0x000000,
      emissiveIntensity: emissive ? 0.3 : 0,
    });
  }

  private box(w: number, h: number, d: number, color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private taperedBox(w: number, h: number, d: number, color: number, frontScale = 0.82, slope = 0.12): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      let x = position.getX(index);
      let y = position.getY(index);
      const z = position.getZ(index);
      if (z > 0) x *= frontScale;
      if (y > 0 && z > 0) y -= h * slope;
      position.setXYZ(index, x, y, z);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.mat(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private addContactShadow(parent: THREE.Object3D, radiusX: number, radiusZ: number, opacity = 0.18): void {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 20),
      new THREE.MeshBasicMaterial({ color: 0x26323a, transparent: true, opacity, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(radiusX, radiusZ, 1);
    shadow.position.y = 0.028;
    shadow.receiveShadow = false;
    shadow.renderOrder = 1;
    parent.add(shadow);
  }

  private buildAtmosphere(): void {
    const skyGeometry = new THREE.SphereGeometry(330, 24, 12);
    const position = skyGeometry.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(position.count * 3);
    const top = new THREE.Color(C.skyTop);
    const horizon = new THREE.Color(C.skyHorizon);
    const color = new THREE.Color();
    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index);
      const t = THREE.MathUtils.clamp((y + 80) / 230, 0, 1);
      color.lerpColors(horizon, top, t);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    skyGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(
      skyGeometry,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false }),
    );
    sky.position.y = 38;
    this.scene.add(sky);

    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(14, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    sun.position.set(-92, 78, -180);
    sun.lookAt(0, 16, 70);
    this.scene.add(sun);

    const cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false });
    for (let index = 0; index < 10; index += 1) {
      const group = new THREE.Group();
      for (let part = 0; part < 3; part += 1) {
        const cloud = new THREE.Mesh(new THREE.BoxGeometry(12 + part * 4, 3.2 + (part % 2) * 1.2, 4.5), cloudMaterial);
        cloud.position.set((part - 1) * 7, (part % 2) * 2, 0);
        group.add(cloud);
      }
      const side = index % 2 === 0 ? -1 : 1;
      group.position.set(side * (66 + (index % 4) * 16), 42 + (index % 3) * 7, -40 + index * 42);
      group.rotation.y = (index % 3 - 1) * 0.22;
      this.scene.add(group);
    }
  }

  private buildWorld(): void {
    for (const node of CART_WORLD_GRAPH.nodes) {
      const isCorridor = node.kind === "corridor";
      const floorColor = isCorridor ? C.sand : node.kind === "boss" ? C.boss : C.sand2;
      const floor = this.box(node.rect.halfWidth * 2, 0.34, node.rect.halfDepth * 2, floorColor);
      floor.position.set(node.rect.centerX, -0.25, node.rect.centerZ);
      floor.castShadow = false;
      this.scene.add(floor);
      this.addFloorTiles(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth, isCorridor);
      this.addBoundaryBlocks(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth, isCorridor);
      this.addTerrainTerraces(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth, isCorridor);
      if (isCorridor) {
        this.addCorridorArches(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth);
      } else {
        this.decorateArena(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth);
      }
      if (node.kind === "boss") this.decorateBossArena(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth);
    }
    this.addDistantGarden();
  }

  private addFloorTiles(cx: number, cz: number, hw: number, hd: number, corridor: boolean): void {
    const size = corridor ? 3.2 : 4.2;
    const geometry = new THREE.BoxGeometry(size * 0.94, 0.035, size * 0.94);
    const materials = [this.mat(corridor ? 0xf4d39d : 0xecc286), this.mat(corridor ? 0xeec78f : 0xe4b677)];
    let tileIndex = 0;
    for (let x = -hw + size * 0.5; x < hw; x += size) {
      for (let z = -hd + size * 0.5; z < hd; z += size) {
        tileIndex += 1;
        if (tileIndex % 3 !== 0) continue;
        const tile = new THREE.Mesh(geometry, materials[tileIndex % 2]);
        tile.position.set(cx + x, -0.065, cz + z);
        tile.receiveShadow = true;
        this.scene.add(tile);
      }
    }
  }

  private addBoundaryBlocks(cx: number, cz: number, hw: number, hd: number, corridor: boolean): void {
    const step = corridor ? 3.4 : 4.5;
    for (let z = -hd + step * 0.5; z < hd; z += step) {
      for (const side of [-1, 1]) {
        this.addFenceSegment(cx + side * (hw + 0.8), cz + z, Math.PI / 2, corridor ? C.fence : 0xe7dfd1);
        if (!corridor && Math.floor((z + hd) / step) % 3 === 0) {
          this.addShrub(cx + side * (hw + 2.1), cz + z, 0.9 + ((Math.abs(z) * 7) % 3) * 0.12);
        }
      }
    }
    if (corridor) return;
    for (let x = -hw + step * 0.5; x < hw; x += step) {
      if (Math.abs(x) < 7.5) continue;
      this.addFenceSegment(cx + x, cz - hd - 0.8, 0, C.fence);
      this.addFenceSegment(cx + x, cz + hd + 0.8, 0, C.fence);
    }
  }

  private addTerrainTerraces(cx: number, cz: number, hw: number, hd: number, corridor: boolean): void {
    const count = corridor ? 2 : 4;
    for (let index = 0; index < count; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const width = corridor ? 5.5 : 8 + (index % 2) * 3;
      const depth = corridor ? Math.min(12, hd * 0.55) : 9 + (index % 3) * 3;
      const height = 0.9 + (index % 3) * 0.55;
      const terrace = this.box(width, height, depth, index % 2 ? C.grass2 : C.grass);
      terrace.position.set(
        cx + side * (hw + 4.6 + index * 1.4),
        -0.18 + height * 0.5,
        cz + (index - (count - 1) * 0.5) * Math.min(12, hd * 0.42),
      );
      terrace.castShadow = false;
      this.scene.add(terrace);
      if (!corridor) this.addShrub(terrace.position.x, terrace.position.z, 0.75 + (index % 2) * 0.2);
    }
  }

  private addCorridorArches(cx: number, cz: number, hw: number, hd: number): void {
    const archCount = Math.max(1, Math.min(3, Math.floor(hd / 10)));
    for (let index = 0; index < archCount; index += 1) {
      const z = cz - hd * 0.65 + (index + 0.5) * ((hd * 1.3) / archCount);
      const materialColor = index % 2 ? 0xf1e7d7 : C.fence;
      for (const side of [-1, 1]) {
        const pillar = this.box(0.65, 4.8, 0.65, materialColor);
        pillar.position.set(cx + side * (hw + 0.35), 2.4, z);
        this.scene.add(pillar);
      }
      const beam = this.box(hw * 2 + 1.35, 0.55, 0.72, materialColor);
      beam.position.set(cx, 4.7, z);
      this.scene.add(beam);
      const light = this.box(0.7, 0.24, 0.35, index % 2 ? C.turboCell : C.flowerYellow);
      light.position.set(cx, 4.35, z + 0.36);
      (light.material as THREE.MeshStandardMaterial).emissive.setHex(index % 2 ? C.turboCell : 0xffc74f);
      (light.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
      this.scene.add(light);
    }
  }

  private addFenceSegment(x: number, z: number, rotation: number, color: number): void {
    const group = new THREE.Group();
    const postA = this.box(0.32, 1.65, 0.32, color);
    const postB = this.box(0.32, 1.65, 0.32, color);
    postA.position.set(-1.45, 0.82, 0);
    postB.position.set(1.45, 0.82, 0);
    const rail1 = this.box(3.1, 0.25, 0.24, color);
    const rail2 = this.box(3.1, 0.25, 0.24, color);
    rail1.position.y = 0.62;
    rail2.position.y = 1.18;
    group.add(postA, postB, rail1, rail2);
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    this.scene.add(group);
  }

  private decorateArena(cx: number, cz: number, hw: number, hd: number): void {
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;
    corners.forEach(([sx, sz], index) => {
      this.addVoxelTree(cx + sx * (hw + 5 + (index % 2) * 2), cz + sz * (hd * 0.62), 0.92 + (index % 3) * 0.12);
      this.addShrub(cx + sx * (hw + 2.5), cz + sz * (hd * 0.42), 1.1);
      this.addFlowerPatch(cx + sx * (hw + 1.7), cz + sz * (hd * 0.18), index);
    });
    for (const x of [-hw * 0.72, hw * 0.72]) {
      this.addStonePile(cx + x, cz - hd * 0.2);
      this.addStonePile(cx + x * 0.84, cz + hd * 0.34);
    }
  }

  private decorateBossArena(cx: number, cz: number, hw: number, hd: number): void {
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xf4c8ff, transparent: true, opacity: 0.36, depthWrite: false });
    for (const radius of [6.5, 12.5]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.12, 6, 40), ringMaterial);
      ring.position.set(cx, 0.03, cz);
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
    }
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;
    corners.forEach(([sx, sz], index) => {
      const obelisk = this.taperedBox(2.2, 8 + (index % 2) * 2, 2.2, index % 2 ? 0x6e617c : 0x87729a, 0.7, 0.08);
      obelisk.position.set(cx + sx * (hw + 3.8), 4, cz + sz * Math.min(hd * 0.68, 18));
      obelisk.rotation.y = index * 0.33;
      this.scene.add(obelisk);
      const cap = this.box(0.65, 0.65, 0.65, C.bossAccent);
      cap.position.set(obelisk.position.x, 8.1 + (index % 2), obelisk.position.z);
      (cap.material as THREE.MeshStandardMaterial).emissive.setHex(C.bossAccent);
      (cap.material as THREE.MeshStandardMaterial).emissiveIntensity = 1;
      this.scene.add(cap);
    });
  }

  private addVoxelTree(x: number, z: number, scale: number): void {
    const group = new THREE.Group();
    const trunk = this.box(1.15 * scale, 4.5 * scale, 1.15 * scale, C.trunk);
    trunk.position.y = 2.25 * scale;
    group.add(trunk);
    const colors = [C.pink, C.pink2, 0xf4afd0];
    for (let y = 0; y < 3; y += 1) {
      for (let ix = -1; ix <= 1; ix += 1) {
        for (let iz = -1; iz <= 1; iz += 1) {
          if (Math.abs(ix) + Math.abs(iz) + y > 3) continue;
          const blossom = this.box(1.55 * scale, 1.35 * scale, 1.55 * scale, colors[(ix + iz + y + 6) % colors.length]);
          blossom.position.set(ix * 1.22 * scale, (4.45 + y * 0.95) * scale, iz * 1.22 * scale);
          group.add(blossom);
        }
      }
    }
    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  private addShrub(x: number, z: number, scale: number): void {
    const group = new THREE.Group();
    for (let index = 0; index < 5; index += 1) {
      const width = (1.1 + (index % 2) * 0.3) * scale;
      const height = (0.85 + (index % 3) * 0.18) * scale;
      const shrub = this.box(width, height, 1.05 * scale, index % 2 ? C.leaf : C.leaf2);
      shrub.position.set((index % 3 - 1) * 0.75 * scale, height * 0.5, (Math.floor(index / 3) - 0.35) * 0.7 * scale);
      group.add(shrub);
    }
    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  private addFlowerPatch(x: number, z: number, seed: number): void {
    const colors = [C.flowerBlue, C.lavender, C.flowerYellow, C.pink];
    for (let index = 0; index < 5; index += 1) {
      const stem = this.box(0.12, 0.48, 0.12, 0x70b56f);
      stem.position.set(x + (index - 2) * 0.55, 0.24, z + ((index + seed) % 2) * 0.42);
      const bloom = this.box(0.38, 0.3, 0.38, colors[(index + seed) % colors.length]);
      bloom.position.set(stem.position.x, 0.58, stem.position.z);
      this.scene.add(stem, bloom);
    }
  }

  private addStonePile(x: number, z: number): void {
    const group = new THREE.Group();
    for (let index = 0; index < 4; index += 1) {
      const height = 0.7 + (index % 3) * 0.25;
      const rock = this.box(0.8 + (index % 2) * 0.35, height, 0.8, index % 2 ? C.rock : C.rock2);
      rock.position.set((index - 1.5) * 0.55, height * 0.5, (index % 2) * 0.45);
      group.add(rock);
    }
    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  private addDistantGarden(): void {
    for (let index = 0; index < 22; index += 1) {
      const side = index % 2 ? -1 : 1;
      this.addVoxelTree(side * (42 + (index % 4) * 6), 16 + index * 25, 0.68 + (index % 3) * 0.1);
      if (index % 3 === 0) {
        const hillHeight = 3.2 + (index % 2) * 1.7;
        const hill = this.box(14 + (index % 4) * 4, hillHeight, 16, index % 2 ? C.grassDark : C.grass2);
        hill.position.set(side * (58 + (index % 5) * 7), hillHeight * 0.5 - 0.4, 22 + index * 24);
        hill.castShadow = false;
        this.scene.add(hill);
      }
    }
  }

  private buildPlayerVisual(): void {
    this.session.car.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.visible = false;
    });

    this.addContactShadow(this.playerVisual, 1.65, 2.35, 0.2);
    const body = this.taperedBox(2.7, 0.92, 3.9, C.player, 0.84, 0.08);
    body.position.y = 0.82;
    const hood = this.taperedBox(2.25, 0.42, 1.45, C.playerDark, 0.72, 0.18);
    hood.position.set(0, 1.18, 1.18);
    const cabin = this.taperedBox(2.1, 1.05, 1.75, C.playerRoof, 0.84, 0.05);
    cabin.position.set(0, 1.56, -0.28);
    const glass = this.taperedBox(1.72, 0.62, 0.18, C.glass, 0.9, 0.02);
    glass.position.set(0, 1.67, 0.65);
    glass.rotation.x = -0.18;
    const roofStripe = this.box(0.62, 0.08, 1.7, C.playerDark);
    roofStripe.position.set(0, 2.13, -0.3);
    this.playerVisual.add(body, hood, cabin, glass, roofStripe);

    const bumper = this.box(2.9, 0.34, 0.36, 0xe7e5df);
    bumper.position.set(0, 0.62, 2.02);
    const rearBumper = this.box(2.72, 0.28, 0.3, C.playerDark);
    rearBumper.position.set(0, 0.6, -2.02);
    const grille = this.box(1.18, 0.38, 0.11, 0x34434a);
    grille.position.set(0, 0.84, 2.23);
    this.playerVisual.add(bumper, rearBumper, grille);

    const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xffe37c, emissive: 0xffb52f, emissiveIntensity: 1.55 });
    for (const x of [-0.84, 0.84]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.12), lightMaterial);
      light.position.set(x, 0.98, 2.2);
      this.playerVisual.add(light);
    }

    for (const x of [-1.36, 1.36]) {
      for (const z of [-1.2, 1.2]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.44, 10), this.mat(C.tire));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.54, z);
        wheel.castShadow = true;
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.47, 10), this.mat(C.wheelHub));
        hub.rotation.z = Math.PI / 2;
        hub.position.copy(wheel.position);
        this.playerVisual.add(wheel, hub);
        const fender = this.box(0.18, 0.42, 1.12, C.playerDark);
        fender.position.set(x > 0 ? 1.19 : -1.19, 0.92, z);
        this.playerVisual.add(fender);
      }
    }

    const sideRailA = this.box(0.16, 0.18, 2.35, C.white);
    sideRailA.position.set(-1.38, 0.82, -0.05);
    const sideRailB = this.box(0.16, 0.18, 2.35, C.white);
    sideRailB.position.set(1.38, 0.82, -0.05);
    this.playerVisual.add(sideRailA, sideRailB);
    this.boostLight.position.set(0, 0.72, -2.15);
    this.playerVisual.add(this.boostLight);
    this.session.car.group.add(this.playerVisual);
  }

  private buildEnemies(enemies: readonly CartEnemySnapshot[]): void {
    for (const enemy of enemies) {
      const group = new THREE.Group();
      const boss = enemy.kind === "boss";
      const heavy = enemy.kind === "heavy";
      const chaser = enemy.kind === "chaser";
      const color = boss ? C.bossEnemy : heavy ? C.heavy : chaser ? C.chaser : C.enemy;
      this.addContactShadow(group, enemy.radius * 1.05, enemy.radius * 1.35, boss ? 0.24 : 0.17);

      const body = this.taperedBox(enemy.radius * 1.78, boss ? 1.82 : heavy ? 1.4 : 1.14, enemy.radius * 2.0, color, boss ? 0.94 : chaser ? 0.7 : 0.82, chaser ? 0.16 : 0.08);
      body.position.y = boss ? 1.08 : heavy ? 0.8 : 0.7;
      group.add(body);
      const cabin = this.taperedBox(enemy.radius * 1.18, boss ? 1.05 : heavy ? 0.94 : 0.8, enemy.radius * 0.98, boss ? 0x55505b : 0xf1e4c7, chaser ? 0.74 : 0.86, 0.05);
      cabin.position.set(0, boss ? 2.18 : heavy ? 1.65 : 1.47, -0.12);
      group.add(cabin);
      const face = this.box(enemy.radius * 0.9, boss ? 0.75 : 0.5, 0.12, boss ? 0xf1e6d2 : 0xf8f0d8);
      face.position.set(0, boss ? 2.12 : heavy ? 1.61 : 1.43, enemy.radius * 0.53);
      group.add(face);
      const eyeMaterial = new THREE.MeshBasicMaterial({ color: boss ? 0xff575d : 0x33373d });
      for (const x of [-enemy.radius * 0.22, enemy.radius * 0.22]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.18, boss ? 0.16 : 0.18, 0.08), eyeMaterial);
        eye.position.set(x, boss ? 2.18 : heavy ? 1.66 : 1.48, enemy.radius * 0.6);
        group.add(eye);
      }

      if (chaser) {
        const spoiler = this.box(enemy.radius * 1.4, 0.14, 0.24, 0x5f9e58);
        spoiler.position.set(0, 1.45, -enemy.radius * 0.96);
        group.add(spoiler);
        for (const x of [-enemy.radius * 0.58, enemy.radius * 0.58]) {
          const post = this.box(0.12, 0.52, 0.12, 0x5f9e58);
          post.position.set(x, 1.25, -enemy.radius * 0.92);
          group.add(post);
        }
      }

      if (heavy) {
        for (const x of [-enemy.radius * 0.66, enemy.radius * 0.66]) {
          const armor = this.taperedBox(0.52, 1.0, enemy.radius * 1.45, 0x62586a, 0.82, 0.04);
          armor.position.set(x, 1.12, 0.1);
          group.add(armor);
        }
        const brow = this.box(enemy.radius * 1.1, 0.22, 0.28, 0x544c5d);
        brow.position.set(0, 1.95, enemy.radius * 0.5);
        group.add(brow);
      }

      if (boss) {
        for (const x of [-enemy.radius * 0.62, enemy.radius * 0.62]) {
          const ram = this.taperedBox(0.5, 0.62, 2.35, C.bossAccent, 0.58, 0.1);
          ram.position.set(x, 0.84, enemy.radius * 1.1);
          ram.rotation.x = -0.16;
          group.add(ram);
          const exhaust = this.box(0.3, 1.45, 0.3, 0x5f5964);
          exhaust.position.set(x * 0.86, 2.75, -enemy.radius * 0.52);
          group.add(exhaust);
        }
        const crown = this.taperedBox(enemy.radius * 1.18, 0.48, 0.72, 0x514955, 0.75, 0.12);
        crown.position.set(0, 3.05, -0.08);
        group.add(crown);
      }

      for (const x of [-enemy.radius * 0.94, enemy.radius * 0.94]) {
        for (const z of [-enemy.radius * 0.64, enemy.radius * 0.64]) {
          const radius = boss ? 0.7 : heavy ? 0.52 : 0.44;
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, boss ? 0.56 : 0.39, 10), this.mat(C.tire));
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(x, boss ? 0.64 : heavy ? 0.5 : 0.43, z);
          wheel.castShadow = true;
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.46, radius * 0.46, boss ? 0.59 : 0.42, 10), this.mat(boss ? C.bossAccent : C.wheelHub));
          hub.rotation.z = Math.PI / 2;
          hub.position.copy(wheel.position);
          group.add(wheel, hub);
        }
      }

      const hpY = boss ? 3.9 : heavy ? 2.9 : 2.55;
      const hpBack = this.box(enemy.radius * 1.85, 0.2, 0.18, C.hpBack);
      hpBack.position.y = hpY;
      const hp = this.box(enemy.radius * 1.72, 0.13, 0.2, C.hp);
      hp.name = "hp-fill";
      hp.position.set(0, hpY + 0.01, -0.02);
      group.add(hpBack, hp);
      group.position.set(enemy.x, 0, enemy.z);
      group.rotation.y = enemy.heading;
      this.enemyGroups.set(enemy.id, group);
      this.enemyAlive.set(enemy.id, true);
      this.scene.add(group);
    }
  }

  private buildResources(resources: readonly CartResourceSnapshot[]): void {
    for (const pickup of resources) {
      const group = new THREE.Group();
      const color = pickup.kind === "gas" ? C.gas : C.turboCell;
      const core = this.taperedBox(1.08, 1.35, 0.78, color, 0.82, 0.08);
      core.position.y = 1.1;
      const band = this.box(1.2, 0.18, 0.9, C.white);
      band.position.y = 1.1;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.05, 0.075, 6, 18),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.74, blending: THREE.AdditiveBlending }),
      );
      ring.position.y = 1.1;
      ring.rotation.x = Math.PI / 2;
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.65, 1.2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      glow.position.y = 1.1;
      group.add(core, band, ring, glow);
      group.position.set(pickup.x, 0, pickup.z);
      this.resourceGroups.set(pickup.id, group);
      this.scene.add(group);
    }
  }

  private buildObstacles(obstacles: readonly CartObstacleSnapshot[]): void {
    for (const obstacle of obstacles) {
      const group = new THREE.Group();
      const color = obstacle.variant === 0 ? C.rock : obstacle.variant === 1 ? C.rock2 : 0xb7b0a5;
      for (let index = 0; index < 5; index += 1) {
        const width = obstacle.scale * (0.78 + (index % 3) * 0.23);
        const height = obstacle.scale * (0.58 + (index % 3) * 0.22);
        const rock = this.taperedBox(width, height, obstacle.scale * 0.78, index === 4 ? 0xaaa397 : color, 0.86, 0.08);
        rock.position.set((index % 3 - 1) * obstacle.scale * 0.58, height * 0.5, (Math.floor(index / 3) - 0.35) * obstacle.scale * 0.68);
        rock.rotation.y = index * 0.31;
        group.add(rock);
      }
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(obstacle.scale * 0.86, 0.075, 5, 16),
        new THREE.MeshBasicMaterial({ color: C.smash, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending }),
      );
      band.position.y = obstacle.scale * 0.78;
      band.rotation.x = Math.PI / 2;
      group.add(band);
      group.position.set(obstacle.x, 0, obstacle.z);
      this.obstacleGroups.set(obstacle.id, group);
      this.obstacleAlive.set(obstacle.id, !obstacle.destroyed);
      this.scene.add(group);
    }
  }

  private buildGate(nodeId: string, z: number): void {
    const group = new THREE.Group();
    for (const x of [-6.5, 6.5]) {
      const pillar = this.taperedBox(1.4, 5.5, 1.6, C.fence, 0.9, 0.02);
      pillar.position.set(x, 2.75, z);
      group.add(pillar);
      const cap = this.box(1.72, 0.45, 1.86, 0xded5c8);
      cap.position.set(x, 5.42, z);
      group.add(cap);
      const lamp = this.box(0.76, 0.76, 0.76, 0xffd96a);
      lamp.position.set(x, 5.9, z);
      (lamp.material as THREE.MeshStandardMaterial).emissive.setHex(0xffb830);
      (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.05;
      group.add(lamp);
    }
    const bar = this.box(12, 0.88, 1.1, C.gateLocked);
    bar.position.set(0, 1.5, z);
    group.add(bar);
    this.gateBars.set(nodeId, bar);
    this.scene.add(group);
  }

  private buildTurboTrails(): void {
    const outerMaterial = new THREE.MeshBasicMaterial({
      color: C.turbo,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: 0xe5fbff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (const x of [-0.7, 0.7]) {
      const outer = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 5.2), outerMaterial);
      outer.position.set(x, 0.5, -3.55);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 4.3), innerMaterial);
      inner.position.set(x, 0.5, -3.25);
      this.turboTrails.add(outer, inner);
    }
    this.turboTrails.visible = false;
    this.session.car.group.add(this.turboTrails);
  }

  private buildCameraFx(): void {
    const positions = new Float32Array(SPEED_LINE_COUNT * 2 * 3);
    for (let index = 0; index < SPEED_LINE_COUNT; index += 1) {
      const angle = (index / SPEED_LINE_COUNT) * Math.PI * 2 + (index % 3) * 0.18;
      const radius = 0.16 + (index % 5) * 0.055;
      this.speedLineSeeds.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.62,
        phase: (index * 0.137) % 1,
        length: 0.35 + (index % 4) * 0.16,
      });
    }
    this.speedLineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(this.speedLineGeometry, this.speedLineMaterial);
    lines.renderOrder = 998;
    this.speedLines.add(lines);
    this.camera.add(this.speedLines);

    this.impactOverlay.position.z = -0.22;
    this.impactOverlay.renderOrder = 999;
    this.camera.add(this.impactOverlay);
  }

  private buildDustPool(): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.38, 0),
      new THREE.MeshBasicMaterial({ color: 0xe9c79b, transparent: true, opacity: 0.3, depthWrite: false }),
      DUST_COUNT,
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    for (let index = 0; index < DUST_COUNT; index += 1) {
      this.dustParticles.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0.6,
        size: 0,
      });
      this.dustDummy.position.set(0, -100, 0);
      this.dustDummy.scale.setScalar(0.001);
      this.dustDummy.updateMatrix();
      mesh.setMatrixAt(index, this.dustDummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    return mesh;
  }

  private buildPetalCloud(): THREE.Points {
    for (let index = 0; index < PETAL_COUNT; index += 1) {
      const angle = index * 2.399963;
      const radius = 6 + (index % 9) * 2.45;
      const baseX = Math.cos(angle) * radius;
      const baseY = 2.5 + (index % 8) * 1.15;
      const baseZ = Math.sin(angle) * radius;
      this.petalBase[index * 3] = baseX;
      this.petalBase[index * 3 + 1] = baseY;
      this.petalBase[index * 3 + 2] = baseZ;
      this.petalPositions[index * 3] = baseX;
      this.petalPositions[index * 3 + 1] = baseY;
      this.petalPositions[index * 3 + 2] = baseZ;
      this.petalSeeds[index] = (index * 0.173) % 1;
    }
    this.petalGeometry.setAttribute("position", new THREE.Float32BufferAttribute(this.petalPositions, 3));
    const points = new THREE.Points(
      this.petalGeometry,
      new THREE.PointsMaterial({ color: 0xffb4d3, size: 0.2, transparent: true, opacity: 0.56, sizeAttenuation: true, depthWrite: false }),
    );
    points.frustumCulled = false;
    this.scene.add(points);
    return points;
  }

  private updateVisuals(delta: number): void {
    const snapshot = this.session.snapshot();
    this.elapsed += delta;
    this.turboTrails.visible = snapshot.boostActive;
    this.boostLight.intensity += ((snapshot.boostActive ? 3.2 : 0) - this.boostLight.intensity) * Math.min(1, delta * 10);
    this.playerVisual.rotation.z += ((-this.steer * 0.06) - this.playerVisual.rotation.z) * Math.min(1, delta * 10);
    this.playerVisual.rotation.x += (((this.brake ? -0.025 : snapshot.boostActive ? 0.018 : 0)) - this.playerVisual.rotation.x) * Math.min(1, delta * 9);
    this.updateGate("arena-01", snapshot.arena1GateLocked, delta);
    this.updateGate("arena-02", snapshot.arena2GateLocked, delta);

    for (const enemy of snapshot.enemies) {
      const group = this.enemyGroups.get(enemy.id);
      if (!group) continue;
      const wasAlive = this.enemyAlive.get(enemy.id) ?? true;
      if (wasAlive && !enemy.alive) {
        this.spawnDebris(
          group.position,
          enemy.kind === "boss" ? C.bossAccent : enemy.kind === "heavy" ? C.heavy : enemy.kind === "chaser" ? C.chaser : C.enemy,
          enemy.kind === "boss" ? 38 : 22,
        );
        this.spawnImpact(group.position, enemy.kind === "boss" ? C.bossAccent : 0xffd46a, enemy.kind === "boss" ? 1.35 : 1);
      }
      this.enemyAlive.set(enemy.id, enemy.alive);
      group.visible = enemy.alive;
      if (enemy.alive) {
        group.position.x += (enemy.x - group.position.x) * Math.min(1, delta * 14);
        group.position.z += (enemy.z - group.position.z) * Math.min(1, delta * 14);
        group.rotation.y = enemy.heading;
        const hp = group.getObjectByName("hp-fill") as THREE.Mesh | undefined;
        if (hp) {
          const ratio = Math.max(0.02, Math.min(1, enemy.hp / Math.max(1, enemy.maxHp)));
          hp.scale.x = ratio;
          hp.position.x = -(1 - ratio) * enemy.radius * 0.86;
        }
      }
    }

    for (const pickup of snapshot.resources) {
      const group = this.resourceGroups.get(pickup.id);
      if (!group) continue;
      group.visible = !pickup.collected;
      if (!pickup.collected) {
        group.rotation.y += delta * 1.8;
        group.rotation.z = Math.sin(this.elapsed * 1.8 + pickup.x) * 0.07;
        group.position.y = Math.sin(this.elapsed * 4 + pickup.x) * 0.18;
      }
    }

    for (const obstacle of snapshot.obstacles) {
      const group = this.obstacleGroups.get(obstacle.id);
      if (!group) continue;
      const wasAlive = this.obstacleAlive.get(obstacle.id) ?? true;
      if (wasAlive && obstacle.destroyed) {
        this.spawnDebris(group.position, C.rock2, 30);
        this.spawnImpact(group.position, C.smash, 1.1);
      }
      this.obstacleAlive.set(obstacle.id, !obstacle.destroyed);
      group.visible = !obstacle.destroyed;
    }

    this.updateRamPresentation(snapshot);
    this.updatePetals(snapshot.x, snapshot.z);
    this.emitDust(snapshot, delta);
    this.updateDust(delta);
    this.updateSpeedLines(snapshot.speed, snapshot.boostActive);
    this.updateParticles(delta);
    this.cameraShake = Math.max(0, this.cameraShake - delta * 2.8);
    this.impactFlash = Math.max(0, this.impactFlash - delta * 3.4);
    this.impactOverlayMaterial.opacity = this.impactFlash * 0.12;
  }

  private updateRamPresentation(snapshot: CartArenaSessionSnapshot): void {
    const signature = `${snapshot.nodeId}:${snapshot.ramCombo}:${snapshot.lastRamEnemyId ?? "none"}:${Math.round(snapshot.lastRamDamage)}`;
    if (snapshot.lastRamEnemyId && snapshot.lastRamDamage > 0 && signature !== this.lastRamSignature) {
      this.lastRamSignature = signature;
      const target = this.enemyGroups.get(snapshot.lastRamEnemyId);
      if (target) this.spawnImpact(target.position, snapshot.nodeKind === "boss" ? C.bossAccent : C.turbo, 0.9 + Math.min(0.45, snapshot.lastRamDamage / 180));
      this.cameraShake = Math.min(1.1, 0.24 + snapshot.lastRamDamage / 180);
      this.impactFlash = Math.min(1, 0.42 + snapshot.lastRamDamage / 160);
      this.impactOverlayMaterial.color.setHex(snapshot.nodeKind === "boss" ? 0xff8f99 : 0x8fe8ff);
    }
    if (!snapshot.lastRamEnemyId) this.lastRamSignature = "";
  }

  private emitDust(snapshot: CartArenaSessionSnapshot, delta: number): void {
    const speed = Math.abs(snapshot.speed);
    const activity = this.brake || Math.abs(this.steer) > 0.34 || speed > 17;
    if (!activity || speed < 4) return;
    this.dustAccumulator += delta * (snapshot.boostActive ? 11 : this.brake ? 16 : 8);
    const backX = -Math.sin(snapshot.heading);
    const backZ = -Math.cos(snapshot.heading);
    while (this.dustAccumulator >= 1) {
      this.dustAccumulator -= 1;
      const particle = this.dustParticles[this.dustCursor];
      const lane = (this.dustCursor % 2 === 0 ? -1 : 1) * 0.78;
      const rightX = Math.cos(snapshot.heading);
      const rightZ = -Math.sin(snapshot.heading);
      particle.active = true;
      particle.maxLife = 0.52 + (this.dustCursor % 4) * 0.06;
      particle.life = particle.maxLife;
      particle.size = 0.52 + (this.dustCursor % 3) * 0.15;
      particle.position.set(
        snapshot.x + backX * 1.45 + rightX * lane,
        0.3,
        snapshot.z + backZ * 1.45 + rightZ * lane,
      );
      particle.velocity.set(backX * (1.4 + speed * 0.035) + rightX * lane * 0.25, 0.65, backZ * (1.4 + speed * 0.035) + rightZ * lane * 0.25);
      this.dustCursor = (this.dustCursor + 1) % DUST_COUNT;
    }
  }

  private updateDust(delta: number): void {
    for (let index = 0; index < this.dustParticles.length; index += 1) {
      const particle = this.dustParticles[index];
      if (!particle.active) {
        this.dustDummy.position.set(0, -100, 0);
        this.dustDummy.scale.setScalar(0.001);
      } else {
        particle.life -= delta;
        particle.position.addScaledVector(particle.velocity, delta);
        particle.velocity.y += 0.35 * delta;
        const ratio = Math.max(0, particle.life / particle.maxLife);
        const size = particle.size * (0.6 + (1 - ratio) * 1.5) * ratio;
        this.dustDummy.position.copy(particle.position);
        this.dustDummy.rotation.set(this.elapsed * 1.7 + index, this.elapsed * 1.2 + index * 0.2, 0);
        this.dustDummy.scale.setScalar(Math.max(0.001, size));
        if (particle.life <= 0) particle.active = false;
      }
      this.dustDummy.updateMatrix();
      this.dustMesh.setMatrixAt(index, this.dustDummy.matrix);
    }
    this.dustMesh.instanceMatrix.needsUpdate = true;
  }

  private updatePetals(playerX: number, playerZ: number): void {
    const position = this.petalGeometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < PETAL_COUNT; index += 1) {
      const baseX = this.petalBase[index * 3];
      const baseY = this.petalBase[index * 3 + 1];
      const baseZ = this.petalBase[index * 3 + 2];
      const seed = this.petalSeeds[index];
      const fall = (this.elapsed * (0.7 + seed * 0.5) + seed * 9) % 8.5;
      position.setXYZ(
        index,
        baseX + Math.sin(this.elapsed * 0.8 + seed * 12) * 1.4,
        2.2 + ((baseY + 6.5 - fall) % 8.5),
        baseZ + Math.cos(this.elapsed * 0.65 + seed * 9) * 1.2,
      );
    }
    position.needsUpdate = true;
    this.petalPoints.position.set(playerX, 0, playerZ);
    this.petalPoints.rotation.y = this.elapsed * 0.04;
  }

  private updateSpeedLines(speed: number, boostActive: boolean): void {
    const normalized = THREE.MathUtils.clamp((Math.abs(speed) - 10) / 24, 0, 1);
    const strength = boostActive ? 1 : normalized * 0.55;
    this.speedLineMaterial.opacity = strength * 0.62;
    this.speedLines.visible = strength > 0.025;
    const position = this.speedLineGeometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < this.speedLineSeeds.length; index += 1) {
      const seed = this.speedLineSeeds[index];
      const pulse = (this.elapsed * (boostActive ? 1.9 : 1.15) + seed.phase) % 1;
      const zFront = -0.72 - pulse * 3.4;
      const zBack = zFront - seed.length * (0.7 + strength * 1.8);
      const spread = 1 + pulse * 0.28;
      position.setXYZ(index * 2, seed.x * spread, seed.y * spread, zFront);
      position.setXYZ(index * 2 + 1, seed.x * spread * 1.18, seed.y * spread * 1.18, zBack);
    }
    position.needsUpdate = true;
  }

  private spawnImpact(position: THREE.Vector3, color: number, scale = 1): void {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let index = 0; index < 12; index += 1) {
      const ray = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, (2.1 + (index % 4) * 0.48) * scale), material);
      ray.position.y = 1.05;
      ray.rotation.y = (index / 12) * Math.PI * 2;
      ray.rotation.x = index % 2 ? 0.28 : -0.18;
      group.add(ray);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05 * scale, 0.08, 5, 18), material);
    ring.position.y = 1.05;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.62 * scale, 0), material);
    core.position.y = 1.05;
    group.add(core);
    group.position.copy(position);
    this.scene.add(group);
    this.bursts.push({ group, life: 0.3, maxLife: 0.3 });
  }

  private spawnDebris(position: THREE.Vector3, color: number, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const mesh = this.box(0.2 + (index % 4) * 0.09, 0.2 + (index % 2) * 0.08, 0.2, index % 5 === 0 ? C.white : color);
      mesh.position.copy(position).add(new THREE.Vector3((index % 7 - 3) * 0.22, 0.7 + (index % 4) * 0.24, (Math.floor(index / 7) - 1.5) * 0.25));
      this.scene.add(mesh);
      this.debris.push({
        mesh,
        velocity: new THREE.Vector3((index % 7 - 3) * 2.0, 4.5 + (index % 5) * 0.75, (Math.floor(index / 7) - 1.5) * 2.2),
        life: 0.9 + (index % 4) * 0.1,
        spin: new THREE.Vector3(3 + index % 4, 4 + index % 5, 2 + index % 3),
      });
    }
  }

  private updateParticles(delta: number): void {
    for (let index = this.debris.length - 1; index >= 0; index -= 1) {
      const particle = this.debris[index];
      particle.life -= delta;
      particle.velocity.y -= 13 * delta;
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.rotation.x += particle.spin.x * delta;
      particle.mesh.rotation.y += particle.spin.y * delta;
      const scale = Math.max(0, Math.min(1, particle.life / 0.65));
      particle.mesh.scale.setScalar(scale);
      if (particle.life <= 0) {
        this.scene.remove(particle.mesh);
        particle.mesh.geometry.dispose();
        const materials = Array.isArray(particle.mesh.material) ? particle.mesh.material : [particle.mesh.material];
        materials.forEach((material) => material.dispose());
        this.debris.splice(index, 1);
      }
    }

    for (let index = this.bursts.length - 1; index >= 0; index -= 1) {
      const burst = this.bursts[index];
      burst.life -= delta;
      const ratio = Math.max(0, burst.life / burst.maxLife);
      burst.group.scale.setScalar(1 + (1 - ratio) * 2.15);
      burst.group.children.forEach((object) => {
        if (object instanceof THREE.Mesh) (object.material as THREE.MeshBasicMaterial).opacity = ratio * 0.95;
      });
      if (burst.life <= 0) {
        this.scene.remove(burst.group);
        const geometries = new Set<THREE.BufferGeometry>();
        const materials = new Set<THREE.Material>();
        burst.group.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          geometries.add(object.geometry);
          const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
          meshMaterials.forEach((material) => materials.add(material));
        });
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
        this.bursts.splice(index, 1);
      }
    }
  }

  private updateGate(nodeId: string, locked: boolean, delta: number): void {
    const bar = this.gateBars.get(nodeId);
    if (!bar) return;
    const target = locked ? 1.5 : 6.5;
    bar.position.y += (target - bar.position.y) * Math.min(1, delta * 6);
    (bar.material as THREE.MeshStandardMaterial).color.setHex(locked ? C.gateLocked : C.gateOpen);
    (bar.material as THREE.MeshStandardMaterial).emissive.setHex(locked ? 0x4a0f16 : 0x16513d);
    (bar.material as THREE.MeshStandardMaterial).emissiveIntensity = locked ? 0.16 : 0.42;
  }

  private applyCameraPresentation(boostActive: boolean): void {
    const shake = this.cameraShake + (boostActive ? 0.035 : 0);
    if (shake <= 0) return;
    this.camera.position.x += Math.sin(this.elapsed * 73) * shake * 0.23;
    this.camera.position.y += Math.sin(this.elapsed * 91 + 0.8) * shake * 0.12;
    this.camera.position.z += Math.cos(this.elapsed * 67 + 0.35) * shake * 0.16;
  }

  private readonly resize = (): void => {
    if (this.failed || this.disposed) return;
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.impactOverlay.scale.x = Math.max(1, this.camera.aspect / 1.65);
    this.renderer.setSize(width, height, false);
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.fail("WebGLコンテキストが失われました。Canvas表示へ切り替えます。", event);
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === "visible") {
      this.lastTime = performance.now();
      this.resize();
      return;
    }
    this.pause();
  };

  private animate = (now: number): void => {
    if (this.failed || this.disposed) return;
    try {
      const delta = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
      this.lastTime = now;
      if (!this.paused) {
        this.session.advance(delta, {
          throttle: this.brake ? 0 : (this.boost ? 1 : 0.84),
          brake: this.brake ? 1 : 0,
          steer: this.steer,
          boost: this.boost,
        });
        this.chaseCamera.update(this.session.car, delta);
        this.updateVisuals(delta);
        this.camera.position.copy(this.chaseCamera.position);
        this.camera.fov = this.chaseCamera.fov + (this.boost ? 4.4 : 0);
        this.camera.updateProjectionMatrix();
        this.applyCameraPresentation(this.boost);
        this.camera.lookAt(this.chaseCamera.target);
        this.renderer.render(this.scene, this.camera);
        this.statsTimer += delta;
        if (this.statsTimer >= 0.1) {
          this.onSnapshot(this.session.snapshot());
          this.statsTimer = 0;
        }
      }
      this.frameId = requestAnimationFrame(this.animate);
    } catch (error) {
      this.fail("ゲーム描画中にエラーが発生しました。Canvas表示へ切り替えます。", error);
    }
  };

  private fail(message: string, error: unknown): void {
    if (this.failed || this.disposed) return;
    this.failed = true;
    cancelAnimationFrame(this.frameId);
    this.onRuntimeFailure(message, error);
  }
}

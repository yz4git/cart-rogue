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
  maxLife: number;
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

interface SparkParticle {
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
  skyTop: 0x66b9ec,
  skyHorizon: 0xf2fbff,
  fog: 0xdaf0ff,
  sand: 0xf1cd94,
  sand2: 0xe6b778,
  sandHi: 0xffe3ad,
  sandLow: 0xd69e64,
  grass: 0xaad98f,
  grass2: 0x82c47d,
  grassDark: 0x5da96a,
  grassLight: 0xc5e7a6,
  boss: 0xc8addf,
  white: 0xfff5df,
  fence: 0xeee6d8,
  fenceShade: 0xd4caba,
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
  playerAccent: 0x73e0d5,
  playerRoof: 0xf4efe7,
  glass: 0x496b79,
  tire: 0x2c333c,
  wheelHub: 0xd9e0de,
  brakeDisc: 0x7c858b,
  enemy: 0xe0d95d,
  chaser: 0x92d361,
  heavy: 0x7d6c86,
  bossEnemy: 0x34313a,
  bossAccent: 0xf05f64,
  hp: 0xf05463,
  hpBack: 0x252b31,
  turbo: 0x42c7ff,
  gateLocked: 0xe95f66,
  gateOpen: 0x6bd3a4,
  gas: 0xf05f70,
  turboCell: 0x55c8f3,
  rock: 0xc8c2b7,
  rock2: 0xd8d2c7,
  smash: 0x58d7ee,
  shadow: 0x26323a,
  spark: 0xffd36c,
};

const DUST_COUNT = 40;
const PETAL_COUNT = 64;
const SPEED_LINE_COUNT = 24;
const SPARK_COUNT = 28;
const GROUND_DETAIL_CAPACITY = 520;
const GRASS_DETAIL_CAPACITY = 420;
const FLOWER_DETAIL_CAPACITY = 180;

export class CartRogueWebGLDemo implements CartRogueDemoHandle {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 440);
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
  private readonly playerWheels: THREE.Mesh[] = [];
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
  private readonly impactOverlay = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.4), this.impactOverlayMaterial);
  private readonly boostLight = new THREE.PointLight(C.turbo, 0, 16, 2);
  private readonly dustMesh: THREE.InstancedMesh;
  private readonly dustParticles: DustParticle[] = [];
  private readonly dustDummy = new THREE.Object3D();
  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly sparkParticles: SparkParticle[] = [];
  private readonly sparkDummy = new THREE.Object3D();
  private readonly terrainPebbles: THREE.InstancedMesh;
  private readonly terrainGrass: THREE.InstancedMesh;
  private readonly terrainFlowers: THREE.InstancedMesh;
  private readonly detailDummy = new THREE.Object3D();
  private pebbleCursor = 0;
  private grassCursor = 0;
  private flowerCursor = 0;
  private readonly petalGeometry = new THREE.BufferGeometry();
  private readonly petalPositions = new Float32Array(PETAL_COUNT * 3);
  private readonly petalBase = new Float32Array(PETAL_COUNT * 3);
  private readonly petalSeeds = new Float32Array(PETAL_COUNT);
  private readonly petalPoints: THREE.Points;
  private dustCursor = 0;
  private sparkCursor = 0;
  private dustAccumulator = 0;
  private sparkAccumulator = 0;
  private frameId = 0;
  private lastTime = performance.now();
  private statsTimer = 0;
  private elapsed = 0;
  private cameraShake = 0;
  private cameraRoll = 0;
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
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false });
    this.renderer.domElement.className = "cart-rogue-canvas";
    this.renderer.domElement.setAttribute("aria-label", "Cart Rogue WebGL game view");
    this.renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost, { passive: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45));
    this.mount.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(C.sky);
    this.scene.fog = new THREE.Fog(C.fog, 106, 326);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xf2fbff, 0x68875c, 2.22));

    const sun = new THREE.DirectionalLight(0xffefd2, 3.35);
    sun.position.set(-44, 64, -30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -74;
    sun.shadow.camera.right = 74;
    sun.shadow.camera.top = 88;
    sun.shadow.camera.bottom = -34;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 180;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.018;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xb8dcff, 0.82);
    fill.position.set(42, 31, 26);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffc9e1, 0.34);
    rim.position.set(-24, 18, 48);
    this.scene.add(rim);

    this.dustMesh = this.buildDustPool();
    this.sparkMesh = this.buildSparkPool();
    [this.terrainPebbles, this.terrainGrass, this.terrainFlowers] = this.buildWorldDetailPools();
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

  setSteering(value: number): void { this.steer = Math.max(-1, Math.min(1, value)); }
  setBoost(active: boolean): void { this.boost = active; }
  setBrake(active: boolean): void { this.brake = active; }
  pause(): void { this.paused = true; this.boost = false; this.brake = false; this.steer = 0; }
  resume(): void { if (!this.failed) { this.paused = false; this.lastTime = performance.now(); } }
  getSnapshot() { return this.session.snapshot(); }

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
      const materialList = Array.isArray(object.material) ? object.material : [object.material];
      materialList.forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private mat(color: number, emissive = 0): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.76, metalness: 0.045, flatShading: true, emissive: emissive || 0x000000, emissiveIntensity: emissive ? 0.34 : 0 });
  }

  private box(width: number, height: number, depth: number, color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), this.mat(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private taperedBox(width: number, height: number, depth: number, color: number, frontScale = 0.82, slope = 0.12): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      let x = position.getX(index);
      let y = position.getY(index);
      const z = position.getZ(index);
      if (z > 0) x *= frontScale;
      if (y > 0 && z > 0) y -= height * slope;
      position.setXYZ(index, x, y, z);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.mat(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private wedge(width: number, height: number, depth: number, color: number): THREE.Mesh {
    const mesh = this.taperedBox(width, height, depth, color, 0.55, 0.26);
    mesh.rotation.x = -0.025;
    return mesh;
  }

  private addContactShadow(parent: THREE.Object3D, radiusX: number, radiusZ: number, opacity = 0.18): void {
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: C.shadow, transparent: true, opacity, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(radiusX, radiusZ, 1);
    shadow.position.y = 0.028;
    shadow.renderOrder = 1;
    parent.add(shadow);
  }

  private hash(seed: number): number {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
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
    const sky = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false }));
    sky.position.y = 38;
    this.scene.add(sky);

    const sun = new THREE.Mesh(new THREE.CircleGeometry(14, 24), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.42, depthWrite: false }));
    sun.position.set(-92, 78, -180);
    sun.lookAt(0, 16, 70);
    this.scene.add(sun);

    const cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false });
    for (let index = 0; index < 12; index += 1) {
      const group = new THREE.Group();
      for (let part = 0; part < 4; part += 1) {
        const cloud = new THREE.Mesh(new THREE.BoxGeometry(10 + part * 3.7, 2.7 + (part % 2) * 1.15, 4.2 + (part % 3) * 0.55), cloudMaterial);
        cloud.position.set((part - 1.5) * 6.2, (part % 2) * 1.7, (part % 3 - 1) * 1.2);
        group.add(cloud);
      }
      const side = index % 2 === 0 ? -1 : 1;
      group.position.set(side * (70 + (index % 4) * 15), 41 + (index % 3) * 7, -52 + index * 38);
      group.rotation.y = (index % 3 - 1) * 0.2;
      this.scene.add(group);
    }
  }

  private buildWorldDetailPools(): [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh] {
    const pebbleMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true, vertexColors: true });
    const grassMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true, vertexColors: true });
    const flowerMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, flatShading: true, vertexColors: true });
    const pebbles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.08, 0.24), pebbleMaterial, GROUND_DETAIL_CAPACITY);
    const grass = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.52, 0.15), grassMaterial, GRASS_DETAIL_CAPACITY);
    const flowers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), flowerMaterial, FLOWER_DETAIL_CAPACITY);
    pebbles.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    grass.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    flowers.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    pebbles.receiveShadow = true;
    grass.castShadow = false;
    flowers.castShadow = false;
    pebbles.count = 0;
    grass.count = 0;
    flowers.count = 0;
    this.scene.add(pebbles, grass, flowers);
    return [pebbles, grass, flowers];
  }

  private buildWorld(): void {
    for (const node of CART_WORLD_GRAPH.nodes) {
      const corridor = node.kind === "corridor";
      const floorColor = corridor ? C.sand : node.kind === "boss" ? C.boss : C.sand2;
      const floor = this.box(node.rect.halfWidth * 2, 0.34, node.rect.halfDepth * 2, floorColor);
      floor.position.set(node.rect.centerX, -0.25, node.rect.centerZ);
      floor.castShadow = false;
      this.scene.add(floor);
      this.addRoadShoulders(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth, corridor);
      this.addFloorTiles(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth, corridor);
      this.addBoundaryBlocks(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth, corridor);
      this.addTerrainTerraces(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth, corridor);
      this.scatterWorldDetail(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth, corridor);
      if (corridor) this.addCorridorArches(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth);
      else this.decorateArena(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth);
      if (node.kind === "boss") this.decorateBossArena(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth);
    }
    this.terrainPebbles.count = this.pebbleCursor;
    this.terrainGrass.count = this.grassCursor;
    this.terrainFlowers.count = this.flowerCursor;
    this.terrainPebbles.instanceMatrix.needsUpdate = true;
    this.terrainGrass.instanceMatrix.needsUpdate = true;
    this.terrainFlowers.instanceMatrix.needsUpdate = true;
    if (this.terrainPebbles.instanceColor) this.terrainPebbles.instanceColor.needsUpdate = true;
    if (this.terrainGrass.instanceColor) this.terrainGrass.instanceColor.needsUpdate = true;
    if (this.terrainFlowers.instanceColor) this.terrainFlowers.instanceColor.needsUpdate = true;
    this.addDistantGarden();
    this.addBackdropPavilions();
  }

  private addRoadShoulders(cx: number, cz: number, hw: number, hd: number, corridor: boolean): void {
    const shoulder = corridor ? 2.3 : 3.2;
    const left = this.box(shoulder, 0.22, hd * 2 + shoulder * 1.2, C.grass);
    left.position.set(cx - hw - shoulder * 0.5 - 0.25, -0.31, cz);
    left.castShadow = false;
    const right = this.box(shoulder, 0.22, hd * 2 + shoulder * 1.2, C.grass2);
    right.position.set(cx + hw + shoulder * 0.5 + 0.25, -0.31, cz);
    right.castShadow = false;
    this.scene.add(left, right);
    if (corridor) {
      for (const side of [-1, 1]) {
        const curb = this.box(0.44, 0.2, hd * 2, C.fenceShade);
        curb.position.set(cx + side * (hw + 0.24), -0.08, cz);
        curb.castShadow = false;
        this.scene.add(curb);
      }
    }
  }

  private addFloorTiles(cx: number, cz: number, hw: number, hd: number, corridor: boolean): void {
    const size = corridor ? 3.15 : 4.1;
    const geometry = new THREE.BoxGeometry(size * 0.94, 0.035, size * 0.94);
    const materials = [this.mat(corridor ? 0xf7d6a1 : 0xeec58b), this.mat(corridor ? 0xefc68e : 0xe3b474), this.mat(C.sandHi)];
    let tileIndex = 0;
    for (let x = -hw + size * 0.5; x < hw; x += size) {
      for (let z = -hd + size * 0.5; z < hd; z += size) {
        tileIndex += 1;
        if (tileIndex % 3 !== 0) continue;
        const tile = new THREE.Mesh(geometry, materials[tileIndex % materials.length]);
        tile.position.set(cx + x, -0.065, cz + z);
        tile.receiveShadow = true;
        this.scene.add(tile);
      }
    }
  }

  private scatterWorldDetail(cx: number, cz: number, hw: number, hd: number, corridor: boolean): void {
    const pebbleCount = corridor ? 18 : 26;
    for (let index = 0; index < pebbleCount && this.pebbleCursor < GROUND_DETAIL_CAPACITY; index += 1) {
      const seed = cx * 0.17 + cz * 0.013 + index * 7.31;
      const x = cx + (this.hash(seed) * 2 - 1) * hw * 0.9;
      const z = cz + (this.hash(seed + 11) * 2 - 1) * hd * 0.93;
      const scale = 0.55 + this.hash(seed + 21) * 0.75;
      this.detailDummy.position.set(x, -0.02, z);
      this.detailDummy.rotation.set(0, this.hash(seed + 31) * Math.PI, 0);
      this.detailDummy.scale.set(scale * 1.2, scale, scale * 0.75);
      this.detailDummy.updateMatrix();
      this.terrainPebbles.setMatrixAt(this.pebbleCursor, this.detailDummy.matrix);
      this.terrainPebbles.setColorAt(this.pebbleCursor, new THREE.Color(index % 3 === 0 ? C.sandHi : index % 3 === 1 ? C.sandLow : C.rock2));
      this.pebbleCursor += 1;
    }

    const plantCount = corridor ? 16 : 24;
    for (let index = 0; index < plantCount && this.grassCursor < GRASS_DETAIL_CAPACITY; index += 1) {
      const seed = cx * 0.11 + cz * 0.019 + index * 5.13;
      const side = index % 2 === 0 ? -1 : 1;
      const edgeX = cx + side * (hw + 1.35 + this.hash(seed + 4) * 2.2);
      const edgeZ = cz + (this.hash(seed + 9) * 2 - 1) * hd * 0.96;
      const scale = 0.72 + this.hash(seed + 15) * 0.72;
      this.detailDummy.position.set(edgeX, 0.18 * scale, edgeZ);
      this.detailDummy.rotation.set(0, this.hash(seed + 18) * Math.PI, (this.hash(seed + 20) - 0.5) * 0.22);
      this.detailDummy.scale.set(scale, scale, scale);
      this.detailDummy.updateMatrix();
      this.terrainGrass.setMatrixAt(this.grassCursor, this.detailDummy.matrix);
      this.terrainGrass.setColorAt(this.grassCursor, new THREE.Color(index % 3 === 0 ? C.grassLight : index % 3 === 1 ? C.leaf : C.leaf2));
      this.grassCursor += 1;

      if (index % 4 === 0 && this.flowerCursor < FLOWER_DETAIL_CAPACITY) {
        this.detailDummy.position.set(edgeX + side * 0.34, 0.48 * scale, edgeZ + 0.22);
        this.detailDummy.rotation.set(0, 0, 0);
        this.detailDummy.scale.set(scale, scale, scale);
        this.detailDummy.updateMatrix();
        this.terrainFlowers.setMatrixAt(this.flowerCursor, this.detailDummy.matrix);
        const flowerColor = [C.flowerBlue, C.lavender, C.flowerYellow, C.pink][this.flowerCursor % 4];
        this.terrainFlowers.setColorAt(this.flowerCursor, new THREE.Color(flowerColor));
        this.flowerCursor += 1;
      }
    }
  }

  private addBoundaryBlocks(cx: number, cz: number, hw: number, hd: number, corridor: boolean): void {
    const step = corridor ? 3.4 : 4.5;
    for (let z = -hd + step * 0.5; z < hd; z += step) {
      for (const side of [-1, 1]) {
        this.addFenceSegment(cx + side * (hw + 0.8), cz + z, Math.PI / 2, corridor ? C.fence : 0xe7dfd1);
        if (!corridor && Math.floor((z + hd) / step) % 3 === 0) this.addShrub(cx + side * (hw + 2.1), cz + z, 0.9 + ((Math.abs(z) * 7) % 3) * 0.12);
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
      terrace.position.set(cx + side * (hw + 4.6 + index * 1.4), -0.18 + height * 0.5, cz + (index - (count - 1) * 0.5) * Math.min(12, hd * 0.42));
      terrace.castShadow = false;
      this.scene.add(terrace);
      const lip = this.box(width * 0.94, 0.18, 0.42, C.grassDark);
      lip.position.set(terrace.position.x, terrace.position.y + height * 0.5 + 0.06, terrace.position.z + depth * 0.5 - 0.3);
      lip.castShadow = false;
      this.scene.add(lip);
      if (!corridor) this.addShrub(terrace.position.x, terrace.position.z, 0.75 + (index % 2) * 0.2);
    }
  }

  private addCorridorArches(cx: number, cz: number, hw: number, hd: number): void {
    const archCount = Math.max(1, Math.min(3, Math.floor(hd / 10)));
    for (let index = 0; index < archCount; index += 1) {
      const z = cz - hd * 0.65 + (index + 0.5) * ((hd * 1.3) / archCount);
      const color = index % 2 ? 0xf1e7d7 : C.fence;
      for (const side of [-1, 1]) {
        const pillar = this.taperedBox(0.72, 5.05, 0.72, color, 0.9, 0.02);
        pillar.position.set(cx + side * (hw + 0.35), 2.52, z);
        this.scene.add(pillar);
        const base = this.box(1.05, 0.32, 1.05, C.fenceShade);
        base.position.set(pillar.position.x, 0.16, z);
        this.scene.add(base);
      }
      const beam = this.box(hw * 2 + 1.55, 0.58, 0.78, color);
      beam.position.set(cx, 4.92, z);
      this.scene.add(beam);
      const light = this.box(0.82, 0.26, 0.38, index % 2 ? C.turboCell : C.flowerYellow);
      light.position.set(cx, 4.5, z + 0.4);
      const material = light.material as THREE.MeshStandardMaterial;
      material.emissive.setHex(index % 2 ? C.turboCell : 0xffc74f);
      material.emissiveIntensity = 1.1;
      this.scene.add(light);
    }
  }

  private addFenceSegment(x: number, z: number, rotation: number, color: number): void {
    const group = new THREE.Group();
    const postA = this.taperedBox(0.38, 1.78, 0.38, color, 0.92, 0.02);
    const postB = this.taperedBox(0.38, 1.78, 0.38, color, 0.92, 0.02);
    postA.position.set(-1.45, 0.89, 0);
    postB.position.set(1.45, 0.89, 0);
    const rail1 = this.box(3.1, 0.25, 0.24, color);
    const rail2 = this.box(3.1, 0.25, 0.24, color);
    rail1.position.y = 0.64;
    rail2.position.y = 1.22;
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
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xf4c8ff, transparent: true, opacity: 0.38, depthWrite: false });
    for (const radius of [6.5, 12.5, 18.5]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.12, 6, 40), ringMaterial);
      ring.position.set(cx, 0.03, cz);
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
    }
    const center = new THREE.Mesh(new THREE.CircleGeometry(8.2, 20), new THREE.MeshBasicMaterial({ color: 0xb993ce, transparent: true, opacity: 0.12, depthWrite: false }));
    center.rotation.x = -Math.PI / 2;
    center.position.set(cx, 0.025, cz);
    this.scene.add(center);
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;
    corners.forEach(([sx, sz], index) => {
      const obelisk = this.taperedBox(2.3, 8.4 + (index % 2) * 2, 2.3, index % 2 ? 0x6e617c : 0x87729a, 0.68, 0.08);
      obelisk.position.set(cx + sx * (hw + 3.8), 4.2, cz + sz * Math.min(hd * 0.68, 18));
      obelisk.rotation.y = index * 0.33;
      this.scene.add(obelisk);
      const cap = this.box(0.72, 0.72, 0.72, C.bossAccent);
      cap.position.set(obelisk.position.x, 8.5 + (index % 2), obelisk.position.z);
      const material = cap.material as THREE.MeshStandardMaterial;
      material.emissive.setHex(C.bossAccent);
      material.emissiveIntensity = 1.25;
      this.scene.add(cap);
    });
  }

  private addVoxelTree(x: number, z: number, scale: number): void {
    const group = new THREE.Group();
    const trunk = this.taperedBox(1.05 * scale, 4.7 * scale, 1.05 * scale, C.trunk, 0.9, 0.02);
    trunk.position.y = 2.35 * scale;
    group.add(trunk);
    const colors = [C.pink, C.pink2, 0xf4afd0, 0xffc4dc];
    for (let y = 0; y < 3; y += 1) {
      for (let ix = -1; ix <= 1; ix += 1) {
        for (let iz = -1; iz <= 1; iz += 1) {
          if (Math.abs(ix) + Math.abs(iz) + y > 3) continue;
          const crown = this.taperedBox(1.55 * scale, 1.32 * scale, 1.55 * scale, colors[(ix + iz + y + 8) % colors.length], 0.92, 0.04);
          crown.position.set(ix * 1.2 * scale, (4.48 + y * 0.92) * scale, iz * 1.2 * scale);
          crown.rotation.y = (ix - iz) * 0.12;
          group.add(crown);
        }
      }
    }
    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  private addShrub(x: number, z: number, scale: number): void {
    const group = new THREE.Group();
    for (let index = 0; index < 6; index += 1) {
      const width = (1 + (index % 2) * 0.3) * scale;
      const height = (0.78 + (index % 3) * 0.18) * scale;
      const shrub = this.taperedBox(width, height, 1.0 * scale, index % 2 ? C.leaf : C.leaf2, 0.9, 0.05);
      shrub.position.set((index % 3 - 1) * 0.72 * scale, height * 0.5, (Math.floor(index / 3) - 0.35) * 0.68 * scale);
      shrub.rotation.y = index * 0.24;
      group.add(shrub);
    }
    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  private addFlowerPatch(x: number, z: number, seed: number): void {
    const colors = [C.flowerBlue, C.lavender, C.flowerYellow, C.pink];
    for (let index = 0; index < 6; index += 1) {
      const stem = this.box(0.1, 0.45, 0.1, 0x70b56f);
      stem.position.set(x + (index - 2.5) * 0.48, 0.22, z + ((index + seed) % 2) * 0.42);
      const bloom = this.taperedBox(0.36, 0.28, 0.36, colors[(index + seed) % colors.length], 0.82, 0.04);
      bloom.position.set(stem.position.x, 0.56, stem.position.z);
      this.scene.add(stem, bloom);
    }
  }

  private addStonePile(x: number, z: number): void {
    const group = new THREE.Group();
    for (let index = 0; index < 5; index += 1) {
      const height = 0.62 + (index % 3) * 0.25;
      const rock = this.taperedBox(0.78 + (index % 2) * 0.32, height, 0.82, index % 2 ? C.rock : C.rock2, 0.82, 0.06);
      rock.position.set((index - 2) * 0.48, height * 0.5, (index % 2) * 0.42);
      rock.rotation.y = index * 0.4;
      group.add(rock);
    }
    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  private addDistantGarden(): void {
    for (let index = 0; index < 24; index += 1) {
      const side = index % 2 ? -1 : 1;
      this.addVoxelTree(side * (43 + (index % 4) * 6), 14 + index * 24, 0.66 + (index % 3) * 0.1);
      if (index % 3 === 0) {
        const hillHeight = 3.2 + (index % 2) * 1.7;
        const hill = this.box(14 + (index % 4) * 4, hillHeight, 16, index % 2 ? C.grassDark : C.grass2);
        hill.position.set(side * (59 + (index % 5) * 7), hillHeight * 0.5 - 0.4, 20 + index * 24);
        hill.castShadow = false;
        this.scene.add(hill);
      }
    }
  }

  private addBackdropPavilions(): void {
    for (let index = 0; index < 8; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const group = new THREE.Group();
      const base = this.box(7.5, 1.3, 6.4, index % 2 ? 0xe9dfcd : 0xf3ead8);
      base.position.y = 0.65;
      group.add(base);
      for (const x of [-2.4, 2.4]) {
        for (const z of [-1.8, 1.8]) {
          const pillar = this.taperedBox(0.5, 4.4, 0.5, C.fenceShade, 0.9, 0.02);
          pillar.position.set(x, 2.6, z);
          group.add(pillar);
        }
      }
      const roof = this.taperedBox(9.3, 1.15, 7.8, index % 2 ? C.pink2 : C.pink, 0.72, 0.18);
      roof.position.y = 5.1;
      group.add(roof);
      group.position.set(side * (78 + (index % 3) * 18), 0, 85 + index * 58);
      group.rotation.y = side * 0.16;
      this.scene.add(group);
    }
  }

  private buildPlayerVisual(): void {
    this.session.car.group.traverse((object) => { if (object instanceof THREE.Mesh) object.visible = false; });
    this.addContactShadow(this.playerVisual, 1.75, 2.5, 0.22);

    const underbody = this.taperedBox(2.72, 0.38, 3.92, 0x31484c, 0.88, 0.03);
    underbody.position.y = 0.5;
    const body = this.taperedBox(2.82, 0.92, 4.05, C.player, 0.82, 0.08);
    body.position.y = 0.9;
    const belt = this.box(2.86, 0.18, 3.35, C.playerAccent);
    belt.position.set(0, 1.18, -0.02);
    const hood = this.wedge(2.28, 0.46, 1.55, C.playerDark);
    hood.position.set(0, 1.27, 1.2);
    const cabin = this.taperedBox(2.12, 1.08, 1.78, C.playerRoof, 0.8, 0.08);
    cabin.position.set(0, 1.65, -0.28);
    const windshield = this.taperedBox(1.76, 0.64, 0.16, C.glass, 0.9, 0.02);
    windshield.position.set(0, 1.74, 0.67);
    windshield.rotation.x = -0.2;
    const rearGlass = this.box(1.72, 0.52, 0.12, C.glass);
    rearGlass.position.set(0, 1.72, -1.1);
    rearGlass.rotation.x = 0.11;
    const roofStripe = this.box(0.62, 0.08, 1.66, C.playerDark);
    roofStripe.position.set(0, 2.22, -0.3);
    this.playerVisual.add(underbody, body, belt, hood, cabin, windshield, rearGlass, roofStripe);

    const frontBumper = this.taperedBox(2.92, 0.36, 0.42, C.white, 0.9, 0.04);
    frontBumper.position.set(0, 0.65, 2.08);
    const rearBumper = this.box(2.88, 0.32, 0.38, C.playerDark);
    rearBumper.position.set(0, 0.64, -2.1);
    const grille = this.box(1.22, 0.4, 0.11, 0x34434a);
    grille.position.set(0, 0.9, 2.3);
    this.playerVisual.add(frontBumper, rearBumper, grille);

    const headlightMaterial = new THREE.MeshStandardMaterial({ color: 0xffe37c, emissive: 0xffb52f, emissiveIntensity: 1.65 });
    const tailMaterial = new THREE.MeshStandardMaterial({ color: 0xff5f67, emissive: 0xff3c4f, emissiveIntensity: 1.25 });
    for (const x of [-0.86, 0.86]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.12), headlightMaterial);
      light.position.set(x, 1.0, 2.27);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.12), tailMaterial);
      tail.position.set(x, 0.98, -2.25);
      this.playerVisual.add(light, tail);
    }

    const rackA = this.box(1.7, 0.12, 0.12, C.playerDark);
    rackA.position.set(0, 2.34, -0.75);
    const rackB = this.box(1.7, 0.12, 0.12, C.playerDark);
    rackB.position.set(0, 2.34, 0.12);
    const rackRailA = this.box(0.12, 0.12, 1.05, C.playerDark);
    rackRailA.position.set(-0.72, 2.34, -0.32);
    const rackRailB = rackRailA.clone();
    rackRailB.position.x = 0.72;
    this.playerVisual.add(rackA, rackB, rackRailA, rackRailB);

    for (const x of [-1.4, 1.4]) {
      for (const z of [-1.22, 1.22]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.46, 12), this.mat(C.tire));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.56, z);
        wheel.castShadow = true;
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.48, 12), this.mat(C.brakeDisc));
        disc.rotation.z = Math.PI / 2;
        disc.position.copy(wheel.position);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.5, 10), this.mat(C.wheelHub));
        hub.rotation.z = Math.PI / 2;
        hub.position.copy(wheel.position);
        this.playerVisual.add(wheel, disc, hub);
        this.playerWheels.push(wheel, disc, hub);
        this.addWheelArch(this.playerVisual, x > 0 ? 1 : -1, z);
      }
    }

    const sideRailA = this.box(0.16, 0.2, 2.45, C.white);
    sideRailA.position.set(-1.4, 0.84, -0.05);
    const sideRailB = sideRailA.clone();
    sideRailB.position.x = 1.4;
    this.playerVisual.add(sideRailA, sideRailB);

    const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.34, 12), this.mat(C.tire));
    spare.rotation.x = Math.PI / 2;
    spare.position.set(0, 1.08, -2.22);
    const spareHub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.37, 10), this.mat(C.wheelHub));
    spareHub.rotation.x = Math.PI / 2;
    spareHub.position.copy(spare.position);
    this.playerVisual.add(spare, spareHub);

    for (const x of [-0.62, 0.62]) {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.42, 10), this.mat(0x3b4a51));
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(x, 0.56, -2.32);
      this.playerVisual.add(nozzle);
    }

    this.boostLight.position.set(0, 0.72, -2.2);
    this.playerVisual.add(this.boostLight);
    this.session.car.group.add(this.playerVisual);
  }

  private addWheelArch(parent: THREE.Object3D, side: number, z: number): void {
    const fender = this.taperedBox(0.2, 0.48, 1.18, C.playerDark, 0.88, 0.04);
    fender.position.set(side * 1.23, 0.98, z);
    parent.add(fender);
    const highlight = this.box(0.08, 0.14, 0.92, C.playerAccent);
    highlight.position.set(side * 1.34, 1.16, z);
    parent.add(highlight);
  }

  private buildEnemies(enemies: readonly CartEnemySnapshot[]): void {
    for (const enemy of enemies) {
      const group = this.buildEnemyVehicle(enemy);
      group.position.set(enemy.x, 0, enemy.z);
      group.rotation.y = enemy.heading;
      group.userData.lastX = enemy.x;
      group.userData.lastZ = enemy.z;
      this.enemyGroups.set(enemy.id, group);
      this.enemyAlive.set(enemy.id, true);
      this.scene.add(group);
    }
  }

  private buildEnemyVehicle(enemy: CartEnemySnapshot): THREE.Group {
    const group = new THREE.Group();
    const boss = enemy.kind === "boss";
    const heavy = enemy.kind === "heavy";
    const chaser = enemy.kind === "chaser";
    const color = boss ? C.bossEnemy : heavy ? C.heavy : chaser ? C.chaser : C.enemy;
    this.addContactShadow(group, enemy.radius * 1.08, enemy.radius * 1.38, boss ? 0.25 : 0.18);

    const body = this.taperedBox(enemy.radius * 1.82, boss ? 1.88 : heavy ? 1.45 : 1.18, enemy.radius * 2.04, color, boss ? 0.94 : chaser ? 0.68 : 0.82, chaser ? 0.18 : 0.08);
    body.position.y = boss ? 1.12 : heavy ? 0.82 : 0.71;
    const belt = this.box(enemy.radius * 1.76, 0.14, enemy.radius * 1.72, boss ? C.bossAccent : heavy ? 0x9d8ba7 : chaser ? 0xb8e879 : 0xf0e879);
    belt.position.y = boss ? 1.38 : heavy ? 1.08 : 0.97;
    const cabin = this.taperedBox(enemy.radius * 1.18, boss ? 1.08 : heavy ? 0.96 : 0.82, enemy.radius * 0.98, boss ? 0x55505b : 0xf1e4c7, chaser ? 0.72 : 0.86, 0.05);
    cabin.position.set(0, boss ? 2.22 : heavy ? 1.68 : 1.49, -0.12);
    group.add(body, belt, cabin);

    const face = this.box(enemy.radius * 0.9, boss ? 0.76 : 0.52, 0.12, boss ? 0xf1e6d2 : 0xf8f0d8);
    face.position.set(0, boss ? 2.16 : heavy ? 1.64 : 1.45, enemy.radius * 0.54);
    group.add(face);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: boss ? 0xff575d : 0x30343a });
    for (const x of [-enemy.radius * 0.22, enemy.radius * 0.22]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.2, boss ? 0.16 : 0.18, 0.08), eyeMaterial);
      eye.position.set(x, boss ? 2.22 : heavy ? 1.69 : 1.5, enemy.radius * 0.61);
      eye.rotation.z = x < 0 ? 0.08 : -0.08;
      group.add(eye);
    }

    if (chaser) {
      const spoiler = this.box(enemy.radius * 1.45, 0.15, 0.25, 0x5f9e58);
      spoiler.position.set(0, 1.49, -enemy.radius * 0.98);
      group.add(spoiler);
      for (const x of [-enemy.radius * 0.58, enemy.radius * 0.58]) {
        const post = this.box(0.12, 0.54, 0.12, 0x5f9e58);
        post.position.set(x, 1.28, -enemy.radius * 0.94);
        group.add(post);
      }
      const nose = this.wedge(enemy.radius * 1.5, 0.28, 0.76, 0xb9e27a);
      nose.position.set(0, 0.94, enemy.radius * 1.05);
      group.add(nose);
    }

    if (heavy) {
      for (const x of [-enemy.radius * 0.67, enemy.radius * 0.67]) {
        const armor = this.taperedBox(0.56, 1.08, enemy.radius * 1.48, 0x62586a, 0.8, 0.04);
        armor.position.set(x, 1.14, 0.1);
        group.add(armor);
      }
      const brow = this.box(enemy.radius * 1.12, 0.24, 0.3, 0x544c5d);
      brow.position.set(0, 1.99, enemy.radius * 0.51);
      const bashPlate = this.wedge(enemy.radius * 1.45, 0.52, 0.72, 0x93839e);
      bashPlate.position.set(0, 0.66, enemy.radius * 1.05);
      group.add(brow, bashPlate);
    }

    if (boss) {
      for (const x of [-enemy.radius * 0.64, enemy.radius * 0.64]) {
        const ram = this.wedge(0.54, 0.66, 2.55, C.bossAccent);
        ram.position.set(x, 0.86, enemy.radius * 1.16);
        ram.rotation.x = -0.16;
        group.add(ram);
        const exhaust = this.box(0.32, 1.5, 0.32, 0x5f5964);
        exhaust.position.set(x * 0.86, 2.8, -enemy.radius * 0.54);
        group.add(exhaust);
      }
      const crown = this.taperedBox(enemy.radius * 1.22, 0.5, 0.76, 0x514955, 0.74, 0.12);
      crown.position.set(0, 3.1, -0.08);
      group.add(crown);
      for (const x of [-0.55, 0.55]) {
        const horn = this.wedge(0.22, 0.24, 0.9, C.bossAccent);
        horn.position.set(x * enemy.radius, 3.24, 0.22);
        group.add(horn);
      }
    }

    const wheels: THREE.Mesh[] = [];
    for (const x of [-enemy.radius * 0.95, enemy.radius * 0.95]) {
      for (const z of [-enemy.radius * 0.65, enemy.radius * 0.65]) {
        const radius = boss ? 0.72 : heavy ? 0.54 : 0.45;
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, boss ? 0.58 : 0.4, 12), this.mat(C.tire));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, boss ? 0.66 : heavy ? 0.52 : 0.44, z);
        wheel.castShadow = true;
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.46, radius * 0.46, boss ? 0.61 : 0.43, 10), this.mat(boss ? C.bossAccent : C.wheelHub));
        hub.rotation.z = Math.PI / 2;
        hub.position.copy(wheel.position);
        group.add(wheel, hub);
        wheels.push(wheel, hub);
      }
    }
    group.userData.wheels = wheels;

    const hpY = boss ? 3.95 : heavy ? 2.94 : 2.58;
    const hpBack = this.box(enemy.radius * 1.9, 0.22, 0.18, C.hpBack);
    hpBack.position.y = hpY;
    const hp = this.box(enemy.radius * 1.76, 0.14, 0.2, C.hp);
    hp.name = "hp-fill";
    hp.position.set(0, hpY + 0.01, -0.02);
    group.add(hpBack, hp);
    return group;
  }

  private buildResources(resources: readonly CartResourceSnapshot[]): void {
    for (const pickup of resources) {
      const group = new THREE.Group();
      const color = pickup.kind === "gas" ? C.gas : C.turboCell;
      this.addContactShadow(group, 0.85, 0.85, 0.12);
      const core = this.taperedBox(1.08, 1.35, 0.78, color, 0.82, 0.08);
      core.position.y = 1.1;
      const band = this.box(1.2, 0.18, 0.9, C.white);
      band.position.y = 1.1;
      const cap = this.box(0.36, 0.22, 0.36, pickup.kind === "gas" ? 0x8f3a47 : C.white);
      cap.position.set(0.32, 1.88, 0);
      const handle = this.box(0.56, 0.12, 0.16, C.white);
      handle.position.set(-0.12, 1.82, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.075, 6, 18), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending }));
      ring.position.y = 1.1;
      ring.rotation.x = Math.PI / 2;
      const glow = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.65, 1.2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.y = 1.1;
      group.add(core, band, cap, handle, ring, glow);
      group.position.set(pickup.x, 0, pickup.z);
      this.resourceGroups.set(pickup.id, group);
      this.scene.add(group);
    }
  }

  private buildObstacles(obstacles: readonly CartObstacleSnapshot[]): void {
    for (const obstacle of obstacles) {
      const group = new THREE.Group();
      this.addContactShadow(group, obstacle.scale * 0.92, obstacle.scale * 0.92, 0.14);
      const color = obstacle.variant === 0 ? C.rock : obstacle.variant === 1 ? C.rock2 : 0xb7b0a5;
      for (let index = 0; index < 7; index += 1) {
        const height = obstacle.scale * (0.58 + (index % 3) * 0.2);
        const rock = this.taperedBox(obstacle.scale * (0.72 + (index % 2) * 0.26), height, obstacle.scale * (0.72 + ((index + 1) % 2) * 0.2), index % 3 === 0 ? C.rock2 : color, 0.78, 0.08);
        rock.position.set((index % 3 - 1) * obstacle.scale * 0.58, height * 0.5, (Math.floor(index / 3) - 0.68) * obstacle.scale * 0.52);
        rock.rotation.y = index * 0.37;
        group.add(rock);
      }
      const band = new THREE.Mesh(new THREE.TorusGeometry(obstacle.scale * 0.86, 0.08, 5, 14), new THREE.MeshBasicMaterial({ color: C.smash, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending }));
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
      const base = this.box(1.8, 0.38, 2, C.fenceShade);
      base.position.set(x, 0.19, z);
      const pillar = this.taperedBox(1.35, 5.4, 1.55, C.fence, 0.88, 0.02);
      pillar.position.set(x, 2.7, z);
      const trim = this.box(1.55, 0.22, 1.75, C.white);
      trim.position.set(x, 4.7, z);
      const lamp = this.box(0.78, 0.78, 0.78, 0xffd96a);
      lamp.position.set(x, 5.62, z);
      const material = lamp.material as THREE.MeshStandardMaterial;
      material.emissive.setHex(0xffb830);
      material.emissiveIntensity = 1.15;
      group.add(base, pillar, trim, lamp);
    }
    const beam = this.box(13.6, 0.42, 1.45, C.fenceShade);
    beam.position.set(0, 4.88, z);
    group.add(beam);
    const bar = this.taperedBox(12, 0.9, 1.14, C.gateLocked, 0.92, 0.04);
    bar.position.set(0, 1.5, z);
    group.add(bar);
    this.gateBars.set(nodeId, bar);
    this.scene.add(group);
  }

  private buildTurboTrails(): void {
    const outerMaterial = new THREE.MeshBasicMaterial({ color: C.turbo, transparent: true, opacity: 0.36, blending: THREE.AdditiveBlending, depthWrite: false });
    const innerMaterial = new THREE.MeshBasicMaterial({ color: 0xcdf7ff, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const x of [-0.62, 0.62]) {
      const outer = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 5.4), outerMaterial);
      outer.position.set(x, 0.49, -3.65);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 4.8), innerMaterial);
      inner.position.set(x, 0.5, -3.45);
      const flare = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.7, 8), outerMaterial);
      flare.rotation.x = -Math.PI / 2;
      flare.position.set(x, 0.49, -2.7);
      this.turboTrails.add(outer, inner, flare);
    }
    this.turboTrails.visible = false;
    this.session.car.group.add(this.turboTrails);
  }

  private buildCameraFx(): void {
    const positions = new Float32Array(SPEED_LINE_COUNT * 2 * 3);
    for (let index = 0; index < SPEED_LINE_COUNT; index += 1) {
      const angle = (index / SPEED_LINE_COUNT) * Math.PI * 2 + (index % 3) * 0.18;
      const radius = 0.15 + (index % 6) * 0.052;
      this.speedLineSeeds.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.62, phase: (index * 0.137) % 1, length: 0.34 + (index % 5) * 0.15 });
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
    const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.38, 0), new THREE.MeshBasicMaterial({ color: 0xe9c79b, transparent: true, opacity: 0.3, depthWrite: false }), DUST_COUNT);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    for (let index = 0; index < DUST_COUNT; index += 1) {
      this.dustParticles.push({ active: false, position: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0, maxLife: 0.6, size: 0 });
      this.dustDummy.position.set(0, -100, 0);
      this.dustDummy.scale.setScalar(0.001);
      this.dustDummy.updateMatrix();
      mesh.setMatrixAt(index, this.dustDummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    return mesh;
  }

  private buildSparkPool(): THREE.InstancedMesh {
    const material = new THREE.MeshBasicMaterial({ color: C.spark, transparent: true, opacity: 0.94, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 0.52), material, SPARK_COUNT);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    for (let index = 0; index < SPARK_COUNT; index += 1) {
      this.sparkParticles.push({ active: false, position: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0, maxLife: 0.34, size: 1 });
      this.sparkDummy.position.set(0, -100, 0);
      this.sparkDummy.scale.setScalar(0.001);
      this.sparkDummy.updateMatrix();
      mesh.setMatrixAt(index, this.sparkDummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    return mesh;
  }

  private buildPetalCloud(): THREE.Points {
    for (let index = 0; index < PETAL_COUNT; index += 1) {
      const angle = index * 2.399963;
      const radius = 6 + (index % 10) * 2.25;
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
    const points = new THREE.Points(this.petalGeometry, new THREE.PointsMaterial({ color: 0xffb4d3, size: 0.22, transparent: true, opacity: 0.6, sizeAttenuation: true, depthWrite: false }));
    points.frustumCulled = false;
    this.scene.add(points);
    return points;
  }

  private updateVisuals(delta: number): void {
    const snapshot = this.session.snapshot();
    this.elapsed += delta;
    this.turboTrails.visible = snapshot.boostActive;
    this.boostLight.intensity += ((snapshot.boostActive ? 3.7 : 0) - this.boostLight.intensity) * Math.min(1, delta * 11);
    this.playerVisual.rotation.z += ((-this.steer * 0.07) - this.playerVisual.rotation.z) * Math.min(1, delta * 11);
    this.playerVisual.rotation.x += (((this.brake ? -0.034 : snapshot.boostActive ? 0.022 : 0)) - this.playerVisual.rotation.x) * Math.min(1, delta * 10);
    const wheelSpin = snapshot.speed * delta * 1.7;
    this.playerWheels.forEach((wheel) => { wheel.rotation.x -= wheelSpin; });
    this.updateGate("arena-01", snapshot.arena1GateLocked, delta);
    this.updateGate("arena-02", snapshot.arena2GateLocked, delta);

    for (const enemy of snapshot.enemies) {
      const group = this.enemyGroups.get(enemy.id);
      if (!group) continue;
      const wasAlive = this.enemyAlive.get(enemy.id) ?? true;
      if (wasAlive && !enemy.alive) {
        this.spawnDebris(group.position, enemy.kind === "boss" ? C.bossAccent : enemy.kind === "heavy" ? C.heavy : enemy.kind === "chaser" ? C.chaser : C.enemy, enemy.kind === "boss" ? 44 : 26);
        this.spawnImpact(group.position, enemy.kind === "boss" ? C.bossAccent : 0xffd46a, enemy.kind === "boss" ? 1.45 : 1.05);
        this.emitImpactSparks(group.position, enemy.kind === "boss" ? 12 : 8);
      }
      this.enemyAlive.set(enemy.id, enemy.alive);
      group.visible = enemy.alive;
      if (enemy.alive) {
        const lastX = Number(group.userData.lastX ?? enemy.x);
        const lastZ = Number(group.userData.lastZ ?? enemy.z);
        const distance = Math.hypot(enemy.x - lastX, enemy.z - lastZ);
        group.position.x += (enemy.x - group.position.x) * Math.min(1, delta * 14);
        group.position.z += (enemy.z - group.position.z) * Math.min(1, delta * 14);
        group.rotation.y = enemy.heading;
        group.position.y = Math.sin(this.elapsed * 7 + enemy.x * 0.17) * 0.015;
        const wheels = (group.userData.wheels ?? []) as THREE.Mesh[];
        wheels.forEach((wheel) => { wheel.rotation.x -= distance * 0.95; });
        group.userData.lastX = enemy.x;
        group.userData.lastZ = enemy.z;
        const hp = group.getObjectByName("hp-fill") as THREE.Mesh | undefined;
        if (hp) {
          const ratio = Math.max(0.02, Math.min(1, enemy.hp / Math.max(1, enemy.maxHp)));
          hp.scale.x = ratio;
          hp.position.x = -(1 - ratio) * enemy.radius * 0.88;
        }
      }
    }

    for (const pickup of snapshot.resources) {
      const group = this.resourceGroups.get(pickup.id);
      if (!group) continue;
      group.visible = !pickup.collected;
      if (!pickup.collected) {
        group.rotation.y += delta * 1.9;
        group.rotation.z = Math.sin(this.elapsed * 1.8 + pickup.x) * 0.08;
        group.position.y = Math.sin(this.elapsed * 4 + pickup.x) * 0.2;
      }
    }

    for (const obstacle of snapshot.obstacles) {
      const group = this.obstacleGroups.get(obstacle.id);
      if (!group) continue;
      const wasAlive = this.obstacleAlive.get(obstacle.id) ?? true;
      if (wasAlive && obstacle.destroyed) {
        this.spawnDebris(group.position, C.rock2, 34);
        this.spawnImpact(group.position, C.smash, 1.18);
        this.emitImpactSparks(group.position, 10);
      }
      this.obstacleAlive.set(obstacle.id, !obstacle.destroyed);
      group.visible = !obstacle.destroyed;
    }

    this.updateRamPresentation(snapshot);
    this.updatePetals(snapshot.x, snapshot.z);
    this.emitDust(snapshot, delta);
    this.emitWallSparks(snapshot, delta);
    this.updateDust(delta);
    this.updateSparks(delta);
    this.updateSpeedLines(snapshot.speed, snapshot.boostActive);
    this.updateParticles(delta);
    this.cameraShake = Math.max(0, this.cameraShake - delta * 2.7);
    this.cameraRoll += ((-this.steer * THREE.MathUtils.degToRad(snapshot.boostActive ? 2.3 : 1.3)) - this.cameraRoll) * Math.min(1, delta * 5.5);
    this.impactFlash = Math.max(0, this.impactFlash - delta * 3.3);
    this.impactOverlayMaterial.opacity = this.impactFlash * 0.14;
  }

  private updateRamPresentation(snapshot: CartArenaSessionSnapshot): void {
    const signature = `${snapshot.nodeId}:${snapshot.ramCombo}:${snapshot.lastRamEnemyId ?? "none"}:${Math.round(snapshot.lastRamDamage)}`;
    if (snapshot.lastRamEnemyId && snapshot.lastRamDamage > 0 && signature !== this.lastRamSignature) {
      this.lastRamSignature = signature;
      const target = this.enemyGroups.get(snapshot.lastRamEnemyId);
      if (target) {
        this.spawnImpact(target.position, snapshot.nodeKind === "boss" ? C.bossAccent : C.turbo, 0.95 + Math.min(0.5, snapshot.lastRamDamage / 170));
        this.emitImpactSparks(target.position, 10 + Math.min(8, Math.floor(snapshot.lastRamDamage / 25)));
      }
      this.cameraShake = Math.min(1.2, 0.28 + snapshot.lastRamDamage / 165);
      this.impactFlash = Math.min(1, 0.46 + snapshot.lastRamDamage / 150);
      this.impactOverlayMaterial.color.setHex(snapshot.nodeKind === "boss" ? 0xff8f99 : 0x8fe8ff);
    }
    if (!snapshot.lastRamEnemyId) this.lastRamSignature = "";
  }

  private emitDust(snapshot: CartArenaSessionSnapshot, delta: number): void {
    const speed = Math.abs(snapshot.speed);
    const activity = this.brake || Math.abs(this.steer) > 0.3 || speed > 16;
    if (!activity || speed < 4) return;
    this.dustAccumulator += delta * (snapshot.boostActive ? 13 : this.brake ? 18 : 9);
    const backX = -Math.sin(snapshot.heading);
    const backZ = -Math.cos(snapshot.heading);
    const rightX = Math.cos(snapshot.heading);
    const rightZ = -Math.sin(snapshot.heading);
    while (this.dustAccumulator >= 1) {
      this.dustAccumulator -= 1;
      const particle = this.dustParticles[this.dustCursor];
      const lane = (this.dustCursor % 2 === 0 ? -1 : 1) * 0.82;
      particle.active = true;
      particle.maxLife = 0.54 + (this.dustCursor % 4) * 0.06;
      particle.life = particle.maxLife;
      particle.size = 0.54 + (this.dustCursor % 3) * 0.16;
      particle.position.set(snapshot.x + backX * 1.5 + rightX * lane, 0.28, snapshot.z + backZ * 1.5 + rightZ * lane);
      particle.velocity.set(backX * (1.5 + speed * 0.04) + rightX * lane * 0.24, 0.68, backZ * (1.5 + speed * 0.04) + rightZ * lane * 0.24);
      this.dustCursor = (this.dustCursor + 1) % DUST_COUNT;
    }
  }

  private emitWallSparks(snapshot: CartArenaSessionSnapshot, delta: number): void {
    if (!snapshot.wallSliding || Math.abs(snapshot.speed) < 6) return;
    this.sparkAccumulator += delta * 20;
    while (this.sparkAccumulator >= 1) {
      this.sparkAccumulator -= 1;
      const side = this.steer >= 0 ? 1 : -1;
      const rightX = Math.cos(snapshot.heading);
      const rightZ = -Math.sin(snapshot.heading);
      const backX = -Math.sin(snapshot.heading);
      const backZ = -Math.cos(snapshot.heading);
      const particle = this.sparkParticles[this.sparkCursor];
      particle.active = true;
      particle.maxLife = 0.25 + (this.sparkCursor % 4) * 0.025;
      particle.life = particle.maxLife;
      particle.size = 0.65 + (this.sparkCursor % 3) * 0.18;
      particle.position.set(snapshot.x + rightX * side * 1.25 + backX * 0.5, 0.55, snapshot.z + rightZ * side * 1.25 + backZ * 0.5);
      particle.velocity.set(backX * 5 + rightX * side * 4.5, 2.3 + (this.sparkCursor % 3), backZ * 5 + rightZ * side * 4.5);
      this.sparkCursor = (this.sparkCursor + 1) % SPARK_COUNT;
    }
  }

  private emitImpactSparks(position: THREE.Vector3, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const particle = this.sparkParticles[this.sparkCursor];
      const angle = (index / Math.max(1, count)) * Math.PI * 2 + this.hash(index + this.elapsed) * 0.5;
      const speed = 4.5 + (index % 5) * 1.2;
      particle.active = true;
      particle.maxLife = 0.3 + (index % 4) * 0.035;
      particle.life = particle.maxLife;
      particle.size = 0.75 + (index % 3) * 0.18;
      particle.position.copy(position).add(new THREE.Vector3(0, 0.9 + (index % 3) * 0.15, 0));
      particle.velocity.set(Math.cos(angle) * speed, 2.8 + (index % 4) * 1.1, Math.sin(angle) * speed);
      this.sparkCursor = (this.sparkCursor + 1) % SPARK_COUNT;
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

  private updateSparks(delta: number): void {
    for (let index = 0; index < this.sparkParticles.length; index += 1) {
      const particle = this.sparkParticles[index];
      if (!particle.active) {
        this.sparkDummy.position.set(0, -100, 0);
        this.sparkDummy.scale.setScalar(0.001);
      } else {
        particle.life -= delta;
        particle.position.addScaledVector(particle.velocity, delta);
        particle.velocity.y -= 12 * delta;
        const ratio = Math.max(0, particle.life / particle.maxLife);
        this.sparkDummy.position.copy(particle.position);
        this.sparkDummy.lookAt(particle.position.clone().add(particle.velocity));
        this.sparkDummy.scale.set(particle.size * ratio, particle.size * ratio, particle.size * (0.5 + ratio * 1.5));
        if (particle.life <= 0) particle.active = false;
      }
      this.sparkDummy.updateMatrix();
      this.sparkMesh.setMatrixAt(index, this.sparkDummy.matrix);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
  }

  private updatePetals(playerX: number, playerZ: number): void {
    const position = this.petalGeometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < PETAL_COUNT; index += 1) {
      const baseX = this.petalBase[index * 3];
      const baseY = this.petalBase[index * 3 + 1];
      const baseZ = this.petalBase[index * 3 + 2];
      const seed = this.petalSeeds[index];
      const fall = (this.elapsed * (0.7 + seed * 0.5) + seed * 9) % 8.5;
      position.setXYZ(index, baseX + Math.sin(this.elapsed * 0.8 + seed * 12) * 1.5, 2.2 + ((baseY + 6.5 - fall) % 8.5), baseZ + Math.cos(this.elapsed * 0.65 + seed * 9) * 1.3);
    }
    position.needsUpdate = true;
    this.petalPoints.position.set(playerX, 0, playerZ);
    this.petalPoints.rotation.y = this.elapsed * 0.04;
  }

  private updateSpeedLines(speed: number, boostActive: boolean): void {
    const normalized = THREE.MathUtils.clamp((Math.abs(speed) - 9) / 24, 0, 1);
    const strength = boostActive ? 1 : normalized * 0.58;
    this.speedLineMaterial.opacity = strength * 0.66;
    this.speedLines.visible = strength > 0.025;
    const position = this.speedLineGeometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < this.speedLineSeeds.length; index += 1) {
      const seed = this.speedLineSeeds[index];
      const pulse = (this.elapsed * (boostActive ? 2.05 : 1.18) + seed.phase) % 1;
      const zFront = -0.7 - pulse * 3.6;
      const zBack = zFront - seed.length * (0.7 + strength * 2.0);
      const spread = 1 + pulse * 0.3;
      position.setXYZ(index * 2, seed.x * spread, seed.y * spread, zFront);
      position.setXYZ(index * 2 + 1, seed.x * spread * 1.2, seed.y * spread * 1.2, zBack);
    }
    position.needsUpdate = true;
  }

  private spawnImpact(position: THREE.Vector3, color: number, scale = 1): void {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.96, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let index = 0; index < 16; index += 1) {
      const ray = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, (2.05 + (index % 5) * 0.46) * scale), material);
      ray.position.y = 1.05;
      ray.rotation.y = (index / 16) * Math.PI * 2;
      ray.rotation.x = index % 2 ? 0.3 : -0.2;
      group.add(ray);
    }
    for (const ringScale of [1, 1.55]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.04 * scale * ringScale, 0.08 / ringScale, 5, 20), material);
      ring.position.y = 1.05;
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.66 * scale, 0), material);
    core.position.y = 1.05;
    group.add(core);
    group.position.copy(position);
    this.scene.add(group);
    this.bursts.push({ group, life: 0.32, maxLife: 0.32 });
  }

  private spawnDebris(position: THREE.Vector3, color: number, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const mesh = this.box(0.18 + (index % 4) * 0.08, 0.18 + (index % 3) * 0.07, 0.2 + (index % 2) * 0.05, index % 6 === 0 ? C.white : index % 5 === 0 ? C.spark : color);
      mesh.position.copy(position).add(new THREE.Vector3((index % 8 - 3.5) * 0.2, 0.7 + (index % 5) * 0.22, (Math.floor(index / 8) - 1.8) * 0.22));
      this.scene.add(mesh);
      const maxLife = 0.95 + (index % 5) * 0.11;
      this.debris.push({ mesh, velocity: new THREE.Vector3((index % 8 - 3.5) * 2.15, 4.8 + (index % 6) * 0.72, (Math.floor(index / 8) - 1.8) * 2.35), life: maxLife, maxLife, spin: new THREE.Vector3(3 + index % 4, 4 + index % 5, 2 + index % 3) });
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
      particle.mesh.rotation.z += particle.spin.z * delta;
      const ratio = Math.max(0, particle.life / particle.maxLife);
      particle.mesh.scale.setScalar(Math.max(0.001, ratio));
      if (particle.mesh.position.y < 0.12 && particle.velocity.y < 0) {
        particle.mesh.position.y = 0.12;
        particle.velocity.y *= -0.24;
        particle.velocity.x *= 0.78;
        particle.velocity.z *= 0.78;
      }
      if (particle.life <= 0) {
        this.scene.remove(particle.mesh);
        particle.mesh.geometry.dispose();
        (particle.mesh.material as THREE.Material).dispose();
        this.debris.splice(index, 1);
      }
    }
    for (let index = this.bursts.length - 1; index >= 0; index -= 1) {
      const burst = this.bursts[index];
      burst.life -= delta;
      const ratio = Math.max(0, burst.life / burst.maxLife);
      burst.group.scale.setScalar(1 + (1 - ratio) * 2.2);
      burst.group.children.forEach((object) => {
        if (object instanceof THREE.Mesh) (object.material as THREE.MeshBasicMaterial).opacity = ratio;
      });
      if (burst.life <= 0) {
        this.scene.remove(burst.group);
        burst.group.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            (object.material as THREE.Material).dispose();
          }
        });
        this.bursts.splice(index, 1);
      }
    }
  }

  private updateGate(nodeId: string, locked: boolean, delta: number): void {
    const bar = this.gateBars.get(nodeId);
    if (!bar) return;
    const target = locked ? 1.5 : 6.7;
    bar.position.y += (target - bar.position.y) * Math.min(1, delta * 6);
    const material = bar.material as THREE.MeshStandardMaterial;
    material.color.setHex(locked ? C.gateLocked : C.gateOpen);
    material.emissive.setHex(locked ? 0x7a1f30 : 0x1e7656);
    material.emissiveIntensity = locked ? 0.16 : 0.22;
  }

  private applyCameraPresentation(snapshot: CartArenaSessionSnapshot): void {
    const dynamicFov = THREE.MathUtils.clamp(Math.abs(snapshot.speed) / 28, 0, 1) * 2.8 + (snapshot.boostActive ? 4.8 : 0);
    this.camera.fov = this.chaseCamera.fov + dynamicFov;
    this.camera.updateProjectionMatrix();
    const shake = this.cameraShake;
    if (shake > 0.001) {
      this.camera.position.x += Math.sin(this.elapsed * 73) * shake * 0.18;
      this.camera.position.y += Math.sin(this.elapsed * 91 + 0.7) * shake * 0.12;
      this.camera.position.z += Math.cos(this.elapsed * 81) * shake * 0.14;
    }
    const lookAhead = THREE.MathUtils.clamp(Math.abs(snapshot.speed) / 24, 0, 1) * 1.8;
    const target = this.chaseCamera.target.clone().add(new THREE.Vector3(Math.sin(snapshot.heading) * lookAhead, 0.12, Math.cos(snapshot.heading) * lookAhead));
    this.camera.lookAt(target);
    this.camera.rotateZ(this.cameraRoll + Math.sin(this.elapsed * 79) * shake * 0.008);
  }

  private readonly resize = (): void => {
    if (this.failed || this.disposed) return;
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
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
        const snapshot = this.session.snapshot();
        this.camera.position.copy(this.chaseCamera.position);
        this.applyCameraPresentation(snapshot);
        this.renderer.render(this.scene, this.camera);
        this.statsTimer += delta;
        if (this.statsTimer >= 0.1) {
          this.onSnapshot(snapshot);
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

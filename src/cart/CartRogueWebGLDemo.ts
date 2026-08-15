import * as THREE from "three";
import { RallyChaseCamera } from "../rally/RallyChaseCamera";
import { CartArenaSession } from "./CartArenaSession";
import type { CartEnemySnapshot, CartObstacleSnapshot, CartResourceSnapshot } from "./CartArenaSession";
import type { CartRogueDemoHandle, CartRogueSnapshotHandler } from "./CartRogueDemo";
import { CART_WORLD_GRAPH } from "./CartWorldGraph";

interface DebrisPiece { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; spin: THREE.Vector3; }
interface ImpactBurst { group: THREE.Group; life: number; }

const C = {
  sky: 0xaedcff, fog: 0xdaf0ff, sand: 0xf0c990, sand2: 0xe7b977, grass: 0xa8d68d, grass2: 0x82c47d,
  boss: 0xc6a8dd, white: 0xfff5df, fence: 0xe9e0d0, trunk: 0x8f674f, pink: 0xf29ac2, pink2: 0xe779aa,
  lavender: 0xb8a0e5, flowerBlue: 0x91b8f3, flowerYellow: 0xf3d46c, leaf: 0x8bc977, leaf2: 0x6fb46c,
  player: 0x42bdb7, playerDark: 0x258d8f, playerRoof: 0xf4efe7, glass: 0x4f7180, tire: 0x313943,
  enemy: 0xd7d95d, chaser: 0x93d05e, heavy: 0x7b6b82, bossEnemy: 0x37333d, bossAccent: 0xf05f64,
  hp: 0xf05463, hpBack: 0x252b31, turbo: 0x42bdf4, gateLocked: 0xe95f66, gateOpen: 0x6bd3a4,
  gas: 0xf05f70, turboCell: 0x55c8f3, rock: 0xc8c2b7, rock2: 0xd8d2c7, smash: 0x58d7ee,
};

export class CartRogueWebGLDemo implements CartRogueDemoHandle {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 360);
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
  private frameId = 0; private lastTime = performance.now(); private statsTimer = 0;
  private steer = 0; private boost = false; private brake = false; private paused = false; private failed = false; private disposed = false;

  constructor(private readonly mount: HTMLElement, private readonly onSnapshot: CartRogueSnapshotHandler, private readonly onRuntimeFailure: (message: string, error: unknown) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false });
    this.renderer.domElement.className = "cart-rogue-canvas";
    this.renderer.domElement.setAttribute("aria-label", "Cart Rogue WebGL game view");
    this.renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost, { passive: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45));
    this.mount.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(C.sky);
    this.scene.fog = new THREE.Fog(C.fog, 92, 270);
    this.scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x779566, 2.35));
    const sun = new THREE.DirectionalLight(0xfff0d5, 3.15);
    sun.position.set(-38, 58, -28); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 80; sun.shadow.camera.bottom = -30;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xb9d9ff, 0.7); fill.position.set(35, 24, 25); this.scene.add(fill);

    this.buildWorld();
    this.scene.add(this.session.car.group);
    this.buildPlayerVisual();
    this.buildTurboTrails();
    const initial = this.session.snapshot();
    this.buildEnemies(initial.enemies); this.buildResources(initial.resources); this.buildObstacles(initial.obstacles);
    this.buildGate("arena-01", 52); this.buildGate("arena-02", 140);
    this.resize();
    window.addEventListener("resize", this.resize); window.addEventListener("orientationchange", this.resize); document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.animate(performance.now());
  }

  setSteering(value: number): void { this.steer = Math.max(-1, Math.min(1, value)); }
  setBoost(active: boolean): void { this.boost = active; }
  setBrake(active: boolean): void { this.brake = active; }
  pause(): void { this.paused = true; this.boost = false; this.brake = false; this.steer = 0; }
  resume(): void { if (!this.failed) { this.paused = false; this.lastTime = performance.now(); } }
  getSnapshot() { return this.session.snapshot(); }

  dispose(): void {
    if (this.disposed) return; this.disposed = true; cancelAnimationFrame(this.frameId);
    window.removeEventListener("resize", this.resize); window.removeEventListener("orientationchange", this.resize); document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.handleContextLost); this.session.dispose();
    this.scene.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => x.dispose()); } });
    this.renderer.dispose(); this.renderer.domElement.remove();
  }

  private mat(color: number, emissive = 0): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02, flatShading: true, emissive: emissive || 0x000000, emissiveIntensity: emissive ? 0.28 : 0 });
  }

  private box(w: number, h: number, d: number, color: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color)); m.castShadow = true; m.receiveShadow = true; return m;
  }

  private buildWorld(): void {
    for (const node of CART_WORLD_GRAPH.nodes) {
      const isCorridor = node.kind === "corridor";
      const floorColor = isCorridor ? C.sand : node.kind === "boss" ? C.boss : C.sand2;
      const floor = this.box(node.rect.halfWidth * 2, 0.32, node.rect.halfDepth * 2, floorColor);
      floor.position.set(node.rect.centerX, -0.25, node.rect.centerZ); floor.castShadow = false; this.scene.add(floor);
      this.addFloorTiles(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth, isCorridor);
      this.addBoundaryBlocks(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth, isCorridor);
      if (!isCorridor) this.decorateArena(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth);
    }
    this.addDistantGarden();
  }

  private addFloorTiles(cx: number, cz: number, hw: number, hd: number, corridor: boolean): void {
    const size = corridor ? 3.2 : 4.2; const geo = new THREE.BoxGeometry(size * 0.94, 0.035, size * 0.94);
    const mats = [this.mat(corridor ? 0xf4d39d : 0xecc286), this.mat(corridor ? 0xeec78f : 0xe4b677)];
    let n = 0;
    for (let x = -hw + size * 0.5; x < hw; x += size) for (let z = -hd + size * 0.5; z < hd; z += size) {
      if ((n++ % 3) !== 0) continue; const tile = new THREE.Mesh(geo, mats[n % 2]); tile.position.set(cx + x, -0.065, cz + z); tile.receiveShadow = true; this.scene.add(tile);
    }
  }

  private addBoundaryBlocks(cx: number, cz: number, hw: number, hd: number, corridor: boolean): void {
    const step = corridor ? 3.4 : 4.5;
    for (let z = -hd + step * 0.5; z < hd; z += step) for (const side of [-1, 1]) {
      this.addFenceSegment(cx + side * (hw + 0.8), cz + z, Math.PI / 2, corridor ? C.fence : 0xe7dfd1);
      if (!corridor && Math.floor((z + hd) / step) % 3 === 0) this.addShrub(cx + side * (hw + 2.1), cz + z, 0.9 + ((z * 7) % 3) * 0.12);
    }
    if (corridor) return;
    for (let x = -hw + step * 0.5; x < hw; x += step) {
      if (Math.abs(x) < 7.5) continue;
      this.addFenceSegment(cx + x, cz - hd - 0.8, 0, C.fence); this.addFenceSegment(cx + x, cz + hd + 0.8, 0, C.fence);
    }
  }

  private addFenceSegment(x: number, z: number, rot: number, color: number): void {
    const g = new THREE.Group(); const postA = this.box(0.32, 1.65, 0.32, color); const postB = postA.clone(); postA.position.set(-1.45, 0.82, 0); postB.position.set(1.45, 0.82, 0);
    const rail1 = this.box(3.1, 0.25, 0.24, color); const rail2 = rail1.clone(); rail1.position.y = 0.62; rail2.position.y = 1.18; g.add(postA, postB, rail1, rail2); g.position.set(x, 0, z); g.rotation.y = rot; this.scene.add(g);
  }

  private decorateArena(cx: number, cz: number, hw: number, hd: number): void {
    const corners = [[-1,-1],[1,-1],[-1,1],[1,1]] as const;
    corners.forEach(([sx, sz], i) => {
      this.addVoxelTree(cx + sx * (hw + 5 + (i % 2) * 2), cz + sz * (hd * 0.62), 0.92 + (i % 3) * 0.12);
      this.addShrub(cx + sx * (hw + 2.5), cz + sz * (hd * 0.42), 1.1);
      this.addFlowerPatch(cx + sx * (hw + 1.7), cz + sz * (hd * 0.18), i);
    });
    for (const x of [-hw * 0.72, hw * 0.72]) { this.addStonePile(cx + x, cz - hd * 0.2); this.addStonePile(cx + x * 0.84, cz + hd * 0.34); }
  }

  private addVoxelTree(x: number, z: number, scale: number): void {
    const g = new THREE.Group(); const trunk = this.box(1.15 * scale, 4.5 * scale, 1.15 * scale, C.trunk); trunk.position.y = 2.25 * scale; g.add(trunk);
    const colors = [C.pink, C.pink2, 0xf4afd0];
    for (let y = 0; y < 3; y++) for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
      if (Math.abs(ix) + Math.abs(iz) + y > 3) continue; const b = this.box(1.55 * scale, 1.35 * scale, 1.55 * scale, colors[(ix + iz + y + 6) % colors.length]);
      b.position.set(ix * 1.22 * scale, (4.45 + y * 0.95) * scale, iz * 1.22 * scale); g.add(b);
    }
    g.position.set(x, 0, z); this.scene.add(g);
  }

  private addShrub(x: number, z: number, scale: number): void {
    const g = new THREE.Group(); for (let i = 0; i < 5; i++) { const b = this.box((1.1 + (i % 2) * 0.3) * scale, (0.85 + (i % 3) * 0.18) * scale, 1.05 * scale, i % 2 ? C.leaf : C.leaf2); b.position.set((i % 3 - 1) * 0.75 * scale, b.geometry.parameters.height * 0.5, (Math.floor(i / 3) - 0.35) * 0.7 * scale); g.add(b); } g.position.set(x, 0, z); this.scene.add(g);
  }

  private addFlowerPatch(x: number, z: number, seed: number): void {
    const colors = [C.flowerBlue, C.lavender, C.flowerYellow, C.pink]; for (let i = 0; i < 5; i++) { const stem = this.box(0.12, 0.48, 0.12, 0x70b56f); stem.position.set(x + (i - 2) * 0.55, 0.24, z + ((i + seed) % 2) * 0.42); const bloom = this.box(0.38, 0.3, 0.38, colors[(i + seed) % colors.length]); bloom.position.set(stem.position.x, 0.58, stem.position.z); this.scene.add(stem, bloom); }
  }

  private addStonePile(x: number, z: number): void {
    const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = this.box(0.8 + (i % 2) * 0.35, 0.7 + (i % 3) * 0.25, 0.8, i % 2 ? C.rock : C.rock2); b.position.set((i - 1.5) * 0.55, b.geometry.parameters.height * 0.5, (i % 2) * 0.45); g.add(b); } g.position.set(x, 0, z); this.scene.add(g);
  }

  private addDistantGarden(): void {
    for (let i = 0; i < 18; i++) { const side = i % 2 ? -1 : 1; this.addVoxelTree(side * (38 + (i % 4) * 5), 20 + i * 28, 0.75 + (i % 3) * 0.1); }
  }

  private buildPlayerVisual(): void {
    this.session.car.group.traverse((o) => { if (o instanceof THREE.Mesh) o.visible = false; });
    const body = this.box(2.55, 0.95, 3.65, C.player); body.position.y = 0.78; const hood = this.box(2.28, 0.45, 1.2, C.playerDark); hood.position.set(0, 1.12, 1.18);
    const cabin = this.box(2.05, 1.05, 1.65, C.playerRoof); cabin.position.set(0, 1.55, -0.25); const glass = this.box(1.7, 0.62, 0.12, C.glass); glass.position.set(0, 1.64, 0.62); glass.rotation.x = -0.16;
    this.playerVisual.add(body, hood, cabin, glass);
    const bumper = this.box(2.75, 0.34, 0.35, 0xe7e5df); bumper.position.set(0, 0.62, 1.92); this.playerVisual.add(bumper);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffd85f, emissive: 0xffb52f, emissiveIntensity: 1.4 });
    for (const x of [-0.8, 0.8]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.12), lightMat); l.position.set(x, 0.95, 1.88); this.playerVisual.add(l); }
    for (const x of [-1.32, 1.32]) for (const z of [-1.1, 1.1]) { const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.42, 8), this.mat(C.tire)); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.52, z); wheel.castShadow = true; this.playerVisual.add(wheel); }
    this.session.car.group.add(this.playerVisual);
  }

  private buildEnemies(enemies: readonly CartEnemySnapshot[]): void {
    for (const enemy of enemies) {
      const g = new THREE.Group(); const boss = enemy.kind === "boss"; const heavy = enemy.kind === "heavy";
      const color = boss ? C.bossEnemy : heavy ? C.heavy : enemy.kind === "chaser" ? C.chaser : C.enemy;
      const body = this.box(enemy.radius * 1.7, boss ? 1.75 : 1.18, enemy.radius * 1.9, color); body.position.y = boss ? 1.05 : 0.7; g.add(body);
      const cabin = this.box(enemy.radius * 1.18, boss ? 1.05 : 0.82, enemy.radius * 0.95, boss ? 0x55505b : 0xf1e4c7); cabin.position.set(0, boss ? 2.15 : 1.48, -0.08); g.add(cabin);
      const face = this.box(enemy.radius * 0.9, boss ? 0.75 : 0.5, 0.12, boss ? 0xf1e6d2 : 0xf8f0d8); face.position.set(0, boss ? 2.1 : 1.43, enemy.radius * 0.52); g.add(face);
      const eyeMat = new THREE.MeshBasicMaterial({ color: boss ? 0xff575d : 0x33373d });
      for (const x of [-enemy.radius * 0.22, enemy.radius * 0.22]) { const eye = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.08), eyeMat); eye.position.set(x, boss ? 2.16 : 1.48, enemy.radius * 0.59); g.add(eye); }
      if (boss) for (const x of [-enemy.radius * 0.62, enemy.radius * 0.62]) { const ram = this.box(0.48, 0.62, 2.2, C.bossAccent); ram.position.set(x, 0.82, enemy.radius * 1.05); ram.rotation.x = -0.18; g.add(ram); }
      for (const x of [-enemy.radius * 0.92, enemy.radius * 0.92]) for (const z of [-enemy.radius * 0.62, enemy.radius * 0.62]) { const wheel = new THREE.Mesh(new THREE.CylinderGeometry(boss ? 0.68 : 0.44, boss ? 0.68 : 0.44, boss ? 0.55 : 0.38, 8), this.mat(C.tire)); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, boss ? 0.62 : 0.43, z); wheel.castShadow = true; g.add(wheel); }
      const hpY = boss ? 3.6 : 2.55; const hpBack = this.box(enemy.radius * 1.85, 0.2, 0.18, C.hpBack); hpBack.position.y = hpY; const hp = this.box(enemy.radius * 1.72, 0.13, 0.2, C.hp); hp.name = "hp-fill"; hp.position.set(0, hpY + 0.01, -0.02); g.add(hpBack, hp);
      g.position.set(enemy.x, 0, enemy.z); g.rotation.y = enemy.heading; this.enemyGroups.set(enemy.id, g); this.enemyAlive.set(enemy.id, true); this.scene.add(g);
    }
  }

  private buildResources(resources: readonly CartResourceSnapshot[]): void {
    for (const p of resources) { const g = new THREE.Group(); const color = p.kind === "gas" ? C.gas : C.turboCell; const core = this.box(1.15, 1.15, 1.15, color); core.position.y = 1.05; const glow = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.45, 1.45), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 })); glow.position.y = 1.05; g.add(core, glow); g.position.set(p.x, 0, p.z); this.resourceGroups.set(p.id, g); this.scene.add(g); }
  }

  private buildObstacles(obstacles: readonly CartObstacleSnapshot[]): void {
    for (const o of obstacles) { const g = new THREE.Group(); const color = o.variant === 0 ? C.rock : o.variant === 1 ? C.rock2 : 0xb7b0a5; for (let i = 0; i < 4; i++) { const b = this.box(o.scale * (0.9 + (i % 2) * 0.28), o.scale * (0.65 + (i % 3) * 0.22), o.scale * 0.85, color); b.position.set((i % 2 - 0.5) * o.scale * 0.75, b.geometry.parameters.height * 0.5, (Math.floor(i / 2) - 0.5) * o.scale * 0.65); b.rotation.y = i * 0.35; g.add(b); } const band = new THREE.Mesh(new THREE.TorusGeometry(o.scale * 0.82, 0.08, 5, 12), new THREE.MeshBasicMaterial({ color: C.smash, transparent: true, opacity: 0.75 })); band.position.y = o.scale * 0.75; band.rotation.x = Math.PI / 2; g.add(band); g.position.set(o.x, 0, o.z); this.obstacleGroups.set(o.id, g); this.obstacleAlive.set(o.id, !o.destroyed); this.scene.add(g); }
  }

  private buildGate(nodeId: string, z: number): void {
    const g = new THREE.Group(); for (const x of [-6.5, 6.5]) { const p = this.box(1.3, 5.2, 1.5, C.fence); p.position.set(x, 2.6, z); g.add(p); const lamp = this.box(0.72, 0.72, 0.72, 0xffd96a); lamp.position.set(x, 5.45, z); (lamp.material as THREE.MeshStandardMaterial).emissive.setHex(0xffb830); (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9; g.add(lamp); }
    const bar = this.box(12, 0.88, 1.1, C.gateLocked); bar.position.set(0, 1.5, z); g.add(bar); this.gateBars.set(nodeId, bar); this.scene.add(g);
  }

  private buildTurboTrails(): void {
    const mat = new THREE.MeshBasicMaterial({ color: C.turbo, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending });
    for (const x of [-0.62, 0.62]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 4.4), mat); t.position.set(x, 0.48, -3.2); this.turboTrails.add(t); }
    this.turboTrails.visible = false; this.session.car.group.add(this.turboTrails);
  }

  private updateVisuals(delta: number): void {
    const s = this.session.snapshot(); this.turboTrails.visible = s.boostActive; this.playerVisual.rotation.z += ((-this.steer * 0.055) - this.playerVisual.rotation.z) * Math.min(1, delta * 10);
    this.updateGate("arena-01", s.arena1GateLocked, delta); this.updateGate("arena-02", s.arena2GateLocked, delta);
    for (const e of s.enemies) { const g = this.enemyGroups.get(e.id); if (!g) continue; const was = this.enemyAlive.get(e.id) ?? true; if (was && !e.alive) { this.spawnDebris(g.position, e.kind === "boss" ? C.bossAccent : e.kind === "heavy" ? C.heavy : e.kind === "chaser" ? C.chaser : C.enemy, e.kind === "boss" ? 34 : 20); this.spawnImpact(g.position, e.kind === "boss" ? C.bossAccent : 0xffd46a); } this.enemyAlive.set(e.id, e.alive); g.visible = e.alive; if (e.alive) { g.position.x += (e.x - g.position.x) * Math.min(1, delta * 14); g.position.z += (e.z - g.position.z) * Math.min(1, delta * 14); g.rotation.y = e.heading; const hp = g.getObjectByName("hp-fill") as THREE.Mesh | undefined; if (hp) { const r = Math.max(0.02, Math.min(1, e.hp / Math.max(1, e.maxHp))); hp.scale.x = r; hp.position.x = -(1 - r) * e.radius * 0.86; } } }
    for (const p of s.resources) { const g = this.resourceGroups.get(p.id); if (!g) continue; g.visible = !p.collected; if (!p.collected) { g.rotation.y += delta * 1.8; g.position.y = Math.sin(performance.now() * 0.004 + p.x) * 0.18; } }
    for (const o of s.obstacles) { const g = this.obstacleGroups.get(o.id); if (!g) continue; const was = this.obstacleAlive.get(o.id) ?? true; if (was && o.destroyed) { this.spawnDebris(g.position, C.rock2, 28); this.spawnImpact(g.position, C.smash); } this.obstacleAlive.set(o.id, !o.destroyed); g.visible = !o.destroyed; }
    this.updateParticles(delta);
  }

  private spawnImpact(position: THREE.Vector3, color: number): void {
    const g = new THREE.Group(); for (let i = 0; i < 10; i++) { const ray = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.2 + (i % 3) * 0.55), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })); ray.position.y = 1.1; ray.rotation.y = (i / 10) * Math.PI * 2; ray.rotation.x = (i % 2 ? 0.28 : -0.18); g.add(ray); } g.position.copy(position); this.scene.add(g); this.bursts.push({ group: g, life: 0.28 });
  }

  private spawnDebris(position: THREE.Vector3, color: number, count: number): void {
    for (let i = 0; i < count; i++) { const mesh = this.box(0.22 + (i % 4) * 0.09, 0.22 + (i % 2) * 0.08, 0.22, i % 5 === 0 ? C.white : color); mesh.position.copy(position).add(new THREE.Vector3((i % 7 - 3) * 0.22, 0.7 + (i % 4) * 0.24, (Math.floor(i / 7) - 1.5) * 0.25)); this.scene.add(mesh); this.debris.push({ mesh, velocity: new THREE.Vector3((i % 7 - 3) * 2.0, 4.5 + (i % 5) * 0.75, (Math.floor(i / 7) - 1.5) * 2.2), life: 0.9 + (i % 4) * 0.1, spin: new THREE.Vector3(3 + i % 4, 4 + i % 5, 2 + i % 3) }); }
  }

  private updateParticles(delta: number): void {
    for (let i = this.debris.length - 1; i >= 0; i--) { const p = this.debris[i]; p.life -= delta; p.velocity.y -= 13 * delta; p.mesh.position.addScaledVector(p.velocity, delta); p.mesh.rotation.x += p.spin.x * delta; p.mesh.rotation.y += p.spin.y * delta; const k = Math.max(0, Math.min(1, p.life / 0.65)); p.mesh.scale.setScalar(k); if (p.life <= 0) { this.scene.remove(p.mesh); p.mesh.geometry.dispose(); (p.mesh.material as THREE.Material).dispose(); this.debris.splice(i, 1); } }
    for (let i = this.bursts.length - 1; i >= 0; i--) { const b = this.bursts[i]; b.life -= delta; const k = Math.max(0, b.life / 0.28); b.group.scale.setScalar(1 + (1 - k) * 1.8); b.group.children.forEach((o) => { if (o instanceof THREE.Mesh) (o.material as THREE.MeshBasicMaterial).opacity = k; }); if (b.life <= 0) { this.scene.remove(b.group); b.group.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } }); this.bursts.splice(i, 1); } }
  }

  private updateGate(nodeId: string, locked: boolean, delta: number): void { const bar = this.gateBars.get(nodeId); if (!bar) return; const target = locked ? 1.5 : 6.5; bar.position.y += (target - bar.position.y) * Math.min(1, delta * 6); (bar.material as THREE.MeshStandardMaterial).color.setHex(locked ? C.gateLocked : C.gateOpen); }

  private readonly resize = (): void => { if (this.failed || this.disposed) return; const w = Math.max(1, this.mount.clientWidth), h = Math.max(1, this.mount.clientHeight); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h, false); };
  private readonly handleContextLost = (event: Event): void => { event.preventDefault(); this.fail("WebGLコンテキストが失われました。Canvas表示へ切り替えます。", event); };
  private readonly handleVisibilityChange = (): void => { if (document.visibilityState === "visible") { this.lastTime = performance.now(); this.resize(); return; } this.pause(); };

  private animate = (now: number): void => {
    if (this.failed || this.disposed) return;
    try { const delta = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000)); this.lastTime = now; if (!this.paused) { this.session.advance(delta, { throttle: this.brake ? 0 : (this.boost ? 1 : 0.84), brake: this.brake ? 1 : 0, steer: this.steer, boost: this.boost }); this.chaseCamera.update(this.session.car, delta); this.camera.position.copy(this.chaseCamera.position); this.camera.fov = this.chaseCamera.fov + (this.boost ? 3.5 : 0); this.camera.updateProjectionMatrix(); this.camera.lookAt(this.chaseCamera.target); this.updateVisuals(delta); this.renderer.render(this.scene, this.camera); this.statsTimer += delta; if (this.statsTimer >= 0.1) { this.onSnapshot(this.session.snapshot()); this.statsTimer = 0; } } this.frameId = requestAnimationFrame(this.animate); } catch (error) { this.fail("ゲーム描画中にエラーが発生しました。Canvas表示へ切り替えます。", error); }
  };

  private fail(message: string, error: unknown): void { if (this.failed || this.disposed) return; this.failed = true; cancelAnimationFrame(this.frameId); this.onRuntimeFailure(message, error); }
}

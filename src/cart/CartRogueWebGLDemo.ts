import * as THREE from "three";
import { RallyChaseCamera } from "../rally/RallyChaseCamera";
import { CartArenaSession } from "./CartArenaSession";
import type { CartEnemySnapshot } from "./CartArenaSession";
import type { CartRogueDemoHandle, CartRogueSnapshotHandler } from "./CartRogueDemo";
import { CART_WORLD_GRAPH } from "./CartWorldGraph";

interface DebrisPiece {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

const PALETTE = {
  sky: 0xc9edf1,
  fog: 0xdff1e8,
  arena: 0xc9e6ae,
  corridor: 0xf2d6ad,
  boss: 0xe2c9ef,
  wall: 0xf4cfb8,
  wallAlt: 0xcab8e5,
  playerTrail: 0x7fe8f4,
  enemy: 0xef7f9f,
  enemyChaser: 0x9e78d8,
  enemyHeavy: 0xd65d88,
  enemyCabin: 0xf6bdd0,
  tire: 0x4d5764,
  hpBack: 0x514c59,
  hp: 0x8fd784,
  gateLocked: 0xe96570,
  gateOpen: 0x71cba8,
};

export class CartRogueWebGLDemo implements CartRogueDemoHandle {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
  private readonly chaseCamera = new RallyChaseCamera();
  private readonly session = new CartArenaSession();
  private readonly enemyGroups = new Map<string, THREE.Group>();
  private readonly enemyAlive = new Map<string, boolean>();
  private readonly debris: DebrisPiece[] = [];
  private readonly gateBars = new Map<string, THREE.Mesh>();
  private readonly turboTrails = new THREE.Group();
  private frameId = 0;
  private lastTime = performance.now();
  private statsTimer = 0;
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.mount.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 82, 220);
    this.scene.add(new THREE.HemisphereLight(0xf3ffff, 0x77906d, 2.25));
    const sun = new THREE.DirectionalLight(0xfff1d3, 2.35);
    sun.position.set(-45, 70, -25);
    this.scene.add(sun);

    this.buildWorld();
    this.scene.add(this.session.car.group);
    this.buildTurboTrails();
    this.session.car.group.add(this.turboTrails);
    this.buildEnemies(this.session.snapshot().enemies);
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
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private buildWorld(): void {
    for (const node of CART_WORLD_GRAPH.nodes) {
      const floorColor = node.kind === "corridor" ? PALETTE.corridor : node.kind === "boss" ? PALETTE.boss : PALETTE.arena;
      const floor = new THREE.Mesh(
        new THREE.BoxGeometry(node.rect.halfWidth * 2, 0.28, node.rect.halfDepth * 2),
        new THREE.MeshLambertMaterial({ color: floorColor, flatShading: true }),
      );
      floor.position.set(node.rect.centerX, -0.24, node.rect.centerZ);
      this.scene.add(floor);
      this.addBoundaryBlocks(node.rect.centerX, node.rect.centerZ, node.rect.halfWidth, node.rect.halfDepth, node.kind === "corridor");
    }

    const decorMaterialA = new THREE.MeshLambertMaterial({ color: 0xf1b5c9, flatShading: true });
    const decorMaterialB = new THREE.MeshLambertMaterial({ color: 0xb7a9dd, flatShading: true });
    const decorMaterialC = new THREE.MeshLambertMaterial({ color: 0x9fd5c8, flatShading: true });
    const spots = [
      [-22, 15, 2.2, decorMaterialA], [22, 18, 2.8, decorMaterialB], [-21, 43, 1.8, decorMaterialC], [21, 41, 2.1, decorMaterialA],
      [-25, 105, 2.8, decorMaterialB], [24, 126, 2.4, decorMaterialC], [-28, 210, 3.2, decorMaterialA], [27, 218, 2.7, decorMaterialB],
    ] as const;
    for (const [x, z, scale, material] of spots) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), material);
      rock.position.set(x, scale * 0.65, z);
      rock.rotation.set(0.2, x * 0.04, 0.12);
      this.scene.add(rock);
    }

    for (let index = 0; index < 28; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const x = side * (18 + (row % 3) * 3.5);
      const z = 8 + row * 3.2;
      const stem = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.65, 0.18),
        new THREE.MeshLambertMaterial({ color: 0x72b78a, flatShading: true }),
      );
      stem.position.set(x, 0.32, z);
      const bloom = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.38, 0.52),
        new THREE.MeshLambertMaterial({ color: index % 4 < 2 ? 0xffb8cf : 0xd4b7ef, flatShading: true }),
      );
      bloom.position.set(x, 0.78, z);
      this.scene.add(stem, bloom);
    }
  }

  private addBoundaryBlocks(centerX: number, centerZ: number, halfWidth: number, halfDepth: number, corridor: boolean): void {
    const material = new THREE.MeshLambertMaterial({ color: corridor ? PALETTE.wallAlt : PALETTE.wall, flatShading: true });
    const blockSize = corridor ? 2.2 : 3.4;
    const height = corridor ? 1.5 : 1.15;
    for (let z = -halfDepth + blockSize * 0.5; z < halfDepth; z += blockSize) {
      for (const side of [-1, 1]) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(1.1, height, blockSize * 0.9), material);
        block.position.set(centerX + side * (halfWidth + 0.55), height * 0.5, centerZ + z);
        this.scene.add(block);
      }
    }
    if (corridor) return;
    for (let x = -halfWidth + blockSize * 0.5; x < halfWidth; x += blockSize) {
      if (Math.abs(x) < 7.5) continue;
      const back = new THREE.Mesh(new THREE.BoxGeometry(blockSize * 0.9, height, 1.1), material);
      back.position.set(centerX + x, height * 0.5, centerZ - halfDepth - 0.55);
      const front = back.clone();
      front.position.z = centerZ + halfDepth + 0.55;
      this.scene.add(back, front);
    }
  }

  private buildEnemies(enemies: readonly CartEnemySnapshot[]): void {
    for (const enemy of enemies) {
      const group = new THREE.Group();
      const bodyColor = enemy.kind === "heavy" ? PALETTE.enemyHeavy : enemy.kind === "chaser" ? PALETTE.enemyChaser : PALETTE.enemy;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(enemy.radius * 1.65, 1.1, enemy.radius * 2.05),
        new THREE.MeshLambertMaterial({ color: bodyColor, flatShading: true }),
      );
      body.position.y = 0.72;
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(enemy.radius * 1.15, 0.78, enemy.radius * 1.0),
        new THREE.MeshLambertMaterial({ color: PALETTE.enemyCabin, flatShading: true }),
      );
      cabin.position.set(0, 1.45, -0.08);
      group.add(body, cabin);
      const tireMaterial = new THREE.MeshLambertMaterial({ color: PALETTE.tire, flatShading: true });
      for (const x of [-enemy.radius * 0.95, enemy.radius * 0.95]) {
        for (const z of [-enemy.radius * 0.65, enemy.radius * 0.65]) {
          const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.36, 8), tireMaterial);
          tire.rotation.z = Math.PI / 2;
          tire.position.set(x, 0.45, z);
          group.add(tire);
        }
      }
      const hpBack = new THREE.Mesh(new THREE.BoxGeometry(enemy.radius * 1.8, 0.18, 0.18), new THREE.MeshBasicMaterial({ color: PALETTE.hpBack }));
      hpBack.position.set(0, 2.55, 0);
      const hp = new THREE.Mesh(new THREE.BoxGeometry(enemy.radius * 1.68, 0.11, 0.2), new THREE.MeshBasicMaterial({ color: PALETTE.hp }));
      hp.name = "hp-fill";
      hp.position.set(0, 2.56, -0.02);
      group.add(hpBack, hp);
      group.position.set(enemy.x, 0, enemy.z);
      group.rotation.y = enemy.heading;
      this.enemyGroups.set(enemy.id, group);
      this.enemyAlive.set(enemy.id, true);
      this.scene.add(group);
    }
  }

  private buildGate(nodeId: string, z: number): void {
    const gate = new THREE.Group();
    const pillarMaterial = new THREE.MeshLambertMaterial({ color: 0xf1d6b5, flatShading: true });
    for (const x of [-6.5, 6.5]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.6, 1.4), pillarMaterial);
      pillar.position.set(x, 2.3, z);
      gate.add(pillar);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(12, 0.85, 1.1), new THREE.MeshLambertMaterial({ color: PALETTE.gateLocked, flatShading: true }));
    bar.position.set(0, 1.45, z);
    gate.add(bar);
    this.gateBars.set(nodeId, bar);
    this.scene.add(gate);
  }

  private buildTurboTrails(): void {
    const material = new THREE.MeshBasicMaterial({ color: PALETTE.playerTrail, transparent: true, opacity: 0.82 });
    for (const x of [-0.65, 0.65]) {
      const trail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 3.6), material);
      trail.position.set(x, 0.45, -2.8);
      this.turboTrails.add(trail);
    }
    this.turboTrails.visible = false;
  }

  private updateVisuals(delta: number): void {
    const snapshot = this.session.snapshot();
    this.turboTrails.visible = snapshot.boostActive;
    this.updateGate("arena-01", snapshot.arena1GateLocked, delta);
    this.updateGate("arena-02", snapshot.arena2GateLocked, delta);

    for (const enemy of snapshot.enemies) {
      const group = this.enemyGroups.get(enemy.id);
      if (!group) continue;
      const wasAlive = this.enemyAlive.get(enemy.id) ?? true;
      const debrisColor = enemy.kind === "heavy" ? PALETTE.enemyHeavy : enemy.kind === "chaser" ? PALETTE.enemyChaser : PALETTE.enemy;
      if (wasAlive && !enemy.alive) this.spawnDebris(group.position, debrisColor);
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
          hp.position.x = -(1 - ratio) * enemy.radius * 0.84;
        }
      }
    }

    for (let index = this.debris.length - 1; index >= 0; index -= 1) {
      const piece = this.debris[index];
      piece.life -= delta;
      piece.velocity.y -= 13 * delta;
      piece.mesh.position.addScaledVector(piece.velocity, delta);
      piece.mesh.rotation.x += delta * 4.1;
      piece.mesh.rotation.y += delta * 5.3;
      const scale = Math.max(0, Math.min(1, piece.life / 0.8));
      piece.mesh.scale.setScalar(scale);
      if (piece.life <= 0) {
        this.scene.remove(piece.mesh);
        piece.mesh.geometry.dispose();
        (piece.mesh.material as THREE.Material).dispose();
        this.debris.splice(index, 1);
      }
    }
  }

  private updateGate(nodeId: string, locked: boolean, delta: number): void {
    const bar = this.gateBars.get(nodeId);
    if (!bar) return;
    const targetY = locked ? 1.45 : 6.2;
    bar.position.y += (targetY - bar.position.y) * Math.min(1, delta * 6);
    (bar.material as THREE.MeshLambertMaterial).color.setHex(locked ? PALETTE.gateLocked : PALETTE.gateOpen);
  }

  private spawnDebris(position: THREE.Vector3, color: number): void {
    for (let index = 0; index < 14; index += 1) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.35 + (index % 3) * 0.1, 0.35, 0.35),
        new THREE.MeshLambertMaterial({ color, flatShading: true }),
      );
      mesh.position.copy(position).add(new THREE.Vector3((index % 4 - 1.5) * 0.28, 0.9 + (index % 2) * 0.35, (Math.floor(index / 4) - 1.5) * 0.3));
      this.scene.add(mesh);
      this.debris.push({
        mesh,
        velocity: new THREE.Vector3((index % 5 - 2) * 1.8, 4.5 + (index % 4) * 0.9, (Math.floor(index / 5) - 1) * 2.4),
        life: 0.85 + (index % 3) * 0.12,
      });
    }
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
        this.camera.position.copy(this.chaseCamera.position);
        this.camera.fov = this.chaseCamera.fov;
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(this.chaseCamera.target);
        this.updateVisuals(delta);
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

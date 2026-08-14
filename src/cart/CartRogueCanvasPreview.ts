import { CartArenaSession } from "./CartArenaSession";
import type { CartRogueDemoHandle, CartRogueSnapshotHandler } from "./CartRogueDemo";
import { CART_WORLD_GRAPH } from "./CartWorldGraph";

export class CartRogueCanvasPreview implements CartRogueDemoHandle {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly session = new CartArenaSession();
  private frameId = 0;
  private lastTime = performance.now();
  private paused = false;
  private steer = 0;
  private boost = false;
  private brake = false;
  private statsTimer = 0;

  constructor(
    private readonly mount: HTMLElement,
    private readonly onSnapshot: CartRogueSnapshotHandler,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "cart-rogue-canvas cart-rogue-canvas-fallback";
    this.canvas.setAttribute("aria-label", "Cart Rogue Canvas fallback");
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D unavailable");
    this.context = context;
    this.mount.appendChild(this.canvas);
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("orientationchange", this.resize);
    this.animate(performance.now());
  }

  setSteering(value: number): void { this.steer = Math.max(-1, Math.min(1, value)); }
  setBoost(active: boolean): void { this.boost = active; }
  setBrake(active: boolean): void { this.brake = active; }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; this.lastTime = performance.now(); }
  getSnapshot() { return this.session.snapshot(); }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("orientationchange", this.resize);
    this.session.dispose();
    this.canvas.remove();
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
    this.canvas.width = Math.floor(width * ratio);
    this.canvas.height = Math.floor(height * ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  private animate = (now: number): void => {
    const delta = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    if (!this.paused) {
      this.session.advance(delta, {
        throttle: this.brake ? 0 : 0.84,
        brake: this.brake ? 1 : 0,
        steer: this.steer,
        boost: this.boost,
      });
      this.draw();
      this.statsTimer += delta;
      if (this.statsTimer >= 0.1) {
        this.onSnapshot(this.session.snapshot());
        this.statsTimer = 0;
      }
    }
    this.frameId = requestAnimationFrame(this.animate);
  };

  private draw(): void {
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    const ctx = this.context;
    const snapshot = this.session.snapshot();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#cceff1";
    ctx.fillRect(0, 0, width, height);

    const scale = Math.min(width / 82, height / 68);
    const centerX = width * 0.5;
    const centerZ = height * 0.63;
    const worldToScreen = (x: number, z: number) => ({
      x: centerX + (x - snapshot.x) * scale,
      y: centerZ - (z - snapshot.z) * scale,
    });

    for (const node of CART_WORLD_GRAPH.nodes) {
      const p = worldToScreen(node.rect.centerX, node.rect.centerZ);
      ctx.fillStyle = node.kind === "corridor" ? "#f7d9ad" : node.kind === "boss" ? "#e9d1f5" : "#c8e7b0";
      ctx.fillRect(
        p.x - node.rect.halfWidth * scale,
        p.y - node.rect.halfDepth * scale,
        node.rect.halfWidth * 2 * scale,
        node.rect.halfDepth * 2 * scale,
      );
    }

    for (const pickup of snapshot.resources) {
      if (pickup.collected) continue;
      const p = worldToScreen(pickup.x, pickup.z);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = pickup.kind === "gas" ? "#79d99a" : "#61dbe8";
      ctx.fillRect(-0.8 * scale, -0.8 * scale, 1.6 * scale, 1.6 * scale);
      ctx.strokeStyle = "rgba(255,255,255,.82)";
      ctx.lineWidth = Math.max(1, 0.18 * scale);
      ctx.strokeRect(-1.05 * scale, -1.05 * scale, 2.1 * scale, 2.1 * scale);
      ctx.restore();
    }

    for (const enemy of snapshot.enemies) {
      if (!enemy.alive) continue;
      const p = worldToScreen(enemy.x, enemy.z);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(enemy.heading);
      ctx.fillStyle = enemy.kind === "boss"
        ? "#65457f"
        : enemy.kind === "heavy"
          ? "#d85f87"
          : enemy.kind === "chaser"
            ? "#9e78d8"
            : "#ef7f9f";
      ctx.fillRect(-enemy.radius * scale, -enemy.radius * scale, enemy.radius * 2 * scale, enemy.radius * 2 * scale);
      if (enemy.kind === "boss") {
        ctx.fillStyle = "#f37aa2";
        ctx.fillRect(-enemy.radius * 0.65 * scale, -enemy.radius * 1.25 * scale, enemy.radius * 0.45 * scale, enemy.radius * 0.9 * scale);
        ctx.fillRect(enemy.radius * 0.2 * scale, -enemy.radius * 1.25 * scale, enemy.radius * 0.45 * scale, enemy.radius * 0.9 * scale);
      }
      ctx.restore();
      const ratio = Math.max(0, Math.min(1, enemy.hp / Math.max(1, enemy.maxHp)));
      ctx.fillStyle = "#514c59";
      ctx.fillRect(p.x - enemy.radius * scale, p.y - enemy.radius * 1.45 * scale, enemy.radius * 2 * scale, 0.18 * scale);
      ctx.fillStyle = enemy.kind === "boss" ? "#f37aa2" : "#8fd784";
      ctx.fillRect(p.x - enemy.radius * scale, p.y - enemy.radius * 1.45 * scale, enemy.radius * 2 * scale * ratio, 0.18 * scale);
    }

    this.drawGate(worldToScreen, 52, snapshot.arena1GateLocked, scale);
    this.drawGate(worldToScreen, 140, snapshot.arena2GateLocked, scale);

    ctx.save();
    ctx.translate(centerX, centerZ);
    ctx.rotate(snapshot.heading);
    ctx.fillStyle = snapshot.boostActive ? "#3bbbd1" : "#37a7a1";
    ctx.fillRect(-1.4 * scale, -2.0 * scale, 2.8 * scale, 4 * scale);
    ctx.fillStyle = "#eff8e8";
    ctx.fillRect(-0.9 * scale, -0.5 * scale, 1.8 * scale, 1.4 * scale);
    ctx.restore();
  }

  private drawGate(
    worldToScreen: (x: number, z: number) => { x: number; y: number },
    z: number,
    locked: boolean,
    scale: number,
  ): void {
    const gate = worldToScreen(0, z);
    this.context.fillStyle = locked ? "#e8666e" : "#69c3a2";
    this.context.fillRect(gate.x - 6.5 * scale, gate.y - 0.45 * scale, 13 * scale, 0.9 * scale);
  }
}

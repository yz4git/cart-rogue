import * as THREE from "three";
import { CartArenaSession } from "./CartArenaSession";
import {
  CART_ARENA03_GATE_HALF_OPENING,
  CART_ARENA03_GATE_Z,
  cartArena03GateLocked,
} from "./CartArena03GateRules";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface CartArena03GateDemo {
  scene: THREE.Scene;
  gateBars: Map<string, THREE.Mesh>;
  session: CartArenaSession;
  buildWorld(): void;
  updateVisuals(delta: number): void;
  updateGate(nodeId: string, locked: boolean, delta: number): void;
  box(width: number, height: number, depth: number, color: number): THREE.Mesh;
  taperedBox(width: number, height: number, depth: number, color: number, frontScale?: number, slope?: number): THREE.Mesh;
}

const GATE_LOCKED_COLOR = 0xe95f66;
const GATE_POST_COLOR = 0xeee6d8;
const GATE_POST_SHADE = 0xd4caba;

function buildArena03Gate(demo: CartArena03GateDemo): void {
  if (demo.gateBars.has("arena-03")) return;

  const group = new THREE.Group();
  group.name = "phase51-arena03-gate";
  const postX = CART_ARENA03_GATE_HALF_OPENING;

  for (const x of [-postX, postX]) {
    const base = demo.box(1.8, 0.38, 2, GATE_POST_SHADE);
    base.position.set(x, 0.19, CART_ARENA03_GATE_Z);
    group.add(base);

    const pillar = demo.taperedBox(1.35, 5.4, 1.55, GATE_POST_COLOR, 0.88, 0.02);
    pillar.position.set(x, 2.85, CART_ARENA03_GATE_Z);
    group.add(pillar);
  }

  const beam = demo.taperedBox(postX * 2 + 1.4, 0.72, 1.35, GATE_POST_COLOR, 0.96, 0.02);
  beam.position.set(0, 5.25, CART_ARENA03_GATE_Z);
  group.add(beam);

  const bar = demo.taperedBox(postX * 2 - 0.8, 0.9, 1.14, GATE_LOCKED_COLOR, 0.92, 0.04);
  bar.name = "phase51-arena03-gate-bar";
  bar.position.set(0, 1.5, CART_ARENA03_GATE_Z);
  group.add(bar);
  demo.gateBars.set("arena-03", bar);
  demo.scene.add(group);
}

export function installCartArena03GateVisuals(): void {
  const demoPrototype = CartRogueWebGLDemo.prototype as unknown as CartArena03GateDemo;
  const originalBuildWorld = demoPrototype.buildWorld;
  demoPrototype.buildWorld = function cartArena03GateWorld(this: CartArena03GateDemo): void {
    originalBuildWorld.call(this);
    buildArena03Gate(this);
  };

  const originalUpdateVisuals = demoPrototype.updateVisuals;
  demoPrototype.updateVisuals = function cartArena03GateVisuals(this: CartArena03GateDemo, delta: number): void {
    originalUpdateVisuals.call(this, delta);
    this.updateGate("arena-03", cartArena03GateLocked(this.session.enemies), delta);
  };
}

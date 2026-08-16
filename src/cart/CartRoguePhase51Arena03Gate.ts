import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession } from "./CartArenaSession";
import { aliveCartEnemies, type CartEnemyState } from "./CartCombat";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import {
  cartTraversalClamp,
  cartTraversalSyncHorizontalVelocity,
} from "./CartTraversalMath";
import { cartWorldNodeById, type CartWorldLocation } from "./CartWorldGraph";

interface Phase51Session {
  car: CartArenaSession["car"];
  enemies: CartEnemyState[];
  location: CartWorldLocation;
  step(input: RallyInputState, fixedDelta?: number): void;
}

interface Phase51Demo {
  scene: THREE.Scene;
  gateBars: Map<string, THREE.Mesh>;
  session: CartArenaSession;
  buildWorld(): void;
  updateVisuals(delta: number): void;
  updateGate(nodeId: string, locked: boolean, delta: number): void;
  box(width: number, height: number, depth: number, color: number): THREE.Mesh;
  taperedBox(width: number, height: number, depth: number, color: number, frontScale?: number, slope?: number): THREE.Mesh;
}

export const CART_PHASE51_ARENA03_GATE_Z = 302.75;
export const CART_PHASE51_ARENA03_TRIGGER_Z = 300.72;
export const CART_PHASE51_ARENA03_HALF_OPENING = 9.4;
export const CART_PHASE51_JUNCTION_ENTRY_Z = 304.65;

const GATE_LOCKED_COLOR = 0xe95f66;
const GATE_POST_COLOR = 0xeee6d8;
const GATE_POST_SHADE = 0xd4caba;

export function cartPhase51Arena03GateLocked(enemies: readonly CartEnemyState[]): boolean {
  return aliveCartEnemies(enemies as CartEnemyState[], "arena-03").length > 0;
}

function hasForwardExitIntent(session: Phase51Session, input: RallyInputState): boolean {
  if (input.brake >= 0.58) return false;
  const velocityForward = session.car.velocity.z;
  const headingForward = Math.cos(session.car.heading);
  return velocityForward > 0.08 || (input.throttle > 0.04 && headingForward > -0.22);
}

export function cartPhase51TryOpenArena03Exit(session: Phase51Session, input: RallyInputState): boolean {
  if (session.location.node.id !== "arena-03") return false;
  if (cartPhase51Arena03GateLocked(session.enemies)) return false;
  if (Math.abs(session.car.position.x) > CART_PHASE51_ARENA03_HALF_OPENING) return false;
  if (session.car.position.z < CART_PHASE51_ARENA03_TRIGGER_Z) return false;
  if (!hasForwardExitIntent(session, input)) return false;

  const target = cartWorldNodeById("junction-04");
  if (!target || !session.location.node.next.includes(target.id)) return false;

  const minX = target.rect.centerX - target.rect.halfWidth + 1.45;
  const maxX = target.rect.centerX + target.rect.halfWidth - 1.45;
  const targetX = cartTraversalClamp(session.car.position.x, minX, maxX);
  const targetZ = Math.max(CART_PHASE51_JUNCTION_ENTRY_Z, target.rect.centerZ - target.rect.halfDepth + 0.45);

  session.car.position.x = targetX;
  session.car.position.z = targetZ;
  session.location = {
    node: target,
    localX: targetX - target.rect.centerX,
    localZ: targetZ - target.rect.centerZ,
  };
  session.car.forwardVelocity = Math.max(4.2, Math.abs(session.car.forwardVelocity) * 0.96);
  session.car.lateralVelocity *= 0.32;
  cartTraversalSyncHorizontalVelocity(session.car);
  return true;
}

function buildArena03Gate(demo: Phase51Demo): void {
  if (demo.gateBars.has("arena-03")) return;

  const group = new THREE.Group();
  group.name = "phase51-arena03-gate";
  const postX = CART_PHASE51_ARENA03_HALF_OPENING;

  for (const x of [-postX, postX]) {
    const base = demo.box(1.8, 0.38, 2, GATE_POST_SHADE);
    base.position.set(x, 0.19, CART_PHASE51_ARENA03_GATE_Z);
    group.add(base);

    const pillar = demo.taperedBox(1.35, 5.4, 1.55, GATE_POST_COLOR, 0.88, 0.02);
    pillar.position.set(x, 2.85, CART_PHASE51_ARENA03_GATE_Z);
    group.add(pillar);
  }

  const beam = demo.taperedBox(postX * 2 + 1.4, 0.72, 1.35, GATE_POST_COLOR, 0.96, 0.02);
  beam.position.set(0, 5.25, CART_PHASE51_ARENA03_GATE_Z);
  group.add(beam);

  const bar = demo.taperedBox(postX * 2 - 0.8, 0.9, 1.14, GATE_LOCKED_COLOR, 0.92, 0.04);
  bar.name = "phase51-arena03-gate-bar";
  bar.position.set(0, 1.5, CART_PHASE51_ARENA03_GATE_Z);
  group.add(bar);
  demo.gateBars.set("arena-03", bar);
  demo.scene.add(group);
}

export function installCartRoguePhase51Arena03Gate(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase51Session;
  const originalStep = sessionPrototype.step;
  sessionPrototype.step = function phase51Arena03GateStep(
    this: Phase51Session,
    input: RallyInputState,
    fixedDelta = 1 / 60,
  ): void {
    originalStep.call(this, input, fixedDelta);
    cartPhase51TryOpenArena03Exit(this, input);
  };

  const demoPrototype = CartRogueWebGLDemo.prototype as unknown as Phase51Demo;
  const originalBuildWorld = demoPrototype.buildWorld;
  demoPrototype.buildWorld = function phase51Arena03GateWorld(this: Phase51Demo): void {
    originalBuildWorld.call(this);
    buildArena03Gate(this);
  };

  const originalUpdateVisuals = demoPrototype.updateVisuals;
  demoPrototype.updateVisuals = function phase51Arena03GateVisuals(this: Phase51Demo, delta: number): void {
    originalUpdateVisuals.call(this, delta);
    this.updateGate("arena-03", cartPhase51Arena03GateLocked(this.session.enemies), delta);
  };
}

installCartRoguePhase51Arena03Gate();

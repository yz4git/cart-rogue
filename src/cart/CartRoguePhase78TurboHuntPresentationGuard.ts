import * as THREE from "three";
import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import { getCartTurboCombatState } from "./CartRoguePhase15Turbo";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase78Demo {
  scene: THREE.Scene;
  session: CartArenaSession;
  steer: number;
  elapsed: number;
  updateVisuals(delta: number): void;
}

interface Phase78State {
  cursor: number;
  accumulator: number;
  dummy: THREE.Object3D;
}

const states = new WeakMap<object, Phase78State>();
const STAMP_INTERVAL = 0.075;

function stateFor(demo: Phase78Demo): Phase78State {
  const key = demo as unknown as object;
  const current = states.get(key);
  if (current) return current;
  const created = { cursor: 0, accumulator: 0, dummy: new THREE.Object3D() };
  states.set(key, created);
  return created;
}

function stampHuntPivotSkids(demo: Phase78Demo, snapshot: CartArenaSessionSnapshot, delta: number): void {
  if (!isCartTurboHuntEnabled(demo.session)) return;
  const turbo = getCartTurboCombatState(demo.session);
  const steering = Math.abs(demo.steer);
  const state = stateFor(demo);
  if (!turbo.held || steering <= 0.035) {
    state.accumulator = 0;
    return;
  }

  state.accumulator += Math.max(0, delta);
  if (state.accumulator < STAMP_INTERVAL) return;
  state.accumulator %= STAMP_INTERVAL;

  const mesh = demo.scene.getObjectByName("phase44-stationary-turbo-skids");
  if (!(mesh instanceof THREE.InstancedMesh) || mesh.count <= 0) return;

  const forwardX = Math.sin(snapshot.heading);
  const forwardZ = Math.cos(snapshot.heading);
  const rightX = Math.cos(snapshot.heading);
  const rightZ = -Math.sin(snapshot.heading);
  const turnSign = Math.sign(demo.steer || 1);
  const strength = THREE.MathUtils.clamp(0.5 + turbo.charge * 0.35 + steering * 0.15, 0, 1);

  for (const lane of [-0.92, 0.92]) {
    const index = state.cursor % mesh.count;
    state.cursor = (state.cursor + 1) % mesh.count;
    state.dummy.position.set(
      snapshot.x - forwardX * 1.18 + rightX * lane,
      0.112,
      snapshot.z - forwardZ * 1.18 + rightZ * lane,
    );
    state.dummy.rotation.set(0, snapshot.heading - turnSign * 0.1, 0);
    state.dummy.scale.set(0.22 + strength * 0.06, 0.012, 0.6 + strength * 0.24);
    state.dummy.updateMatrix();
    mesh.setMatrixAt(index, state.dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export function installCartRoguePhase78TurboHuntPresentationGuard(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase78Demo;
  const previous = prototype.updateVisuals;
  prototype.updateVisuals = function phase78TurboHuntPresentation(this: Phase78Demo, delta: number): void {
    previous.call(this, delta);
    if (!isCartTurboHuntEnabled(this.session)) return;
    stampHuntPivotSkids(this, this.session.snapshot(), delta);
  };
}

installCartRoguePhase78TurboHuntPresentationGuard();

import * as THREE from "three";
import type { CartArenaSessionSnapshot } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase18PolishDemo {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  chaseCamera: { target: THREE.Vector3 };
  steer: number;
  cameraRoll: number;
  cameraShake: number;
  elapsed: number;
  buildWorld(): void;
  applyCameraPresentation(snapshot: CartArenaSessionSnapshot): void;
}

function polishFacetedHorizon(demo: Phase18PolishDemo): void {
  const root = demo.scene.getObjectByName("phase18-visual-overdrive-world");
  if (!root) return;
  root.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh) || object.geometry.type !== "ConeGeometry") return;
    const previousMaterial = object.material;
    object.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      fog: true,
    });
    if (previousMaterial instanceof THREE.Material) previousMaterial.dispose();

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let index = 0; index < object.count; index += 1) {
      object.getMatrixAt(index, matrix);
      matrix.decompose(position, quaternion, scale);
      position.x *= 1.2;
      scale.x *= 0.62;
      scale.y *= 0.68;
      scale.z *= 0.62;
      position.y = scale.y * 0.48 - 1.45;
      matrix.compose(position, quaternion, scale);
      object.setMatrixAt(index, matrix);
    }
    object.instanceMatrix.needsUpdate = true;
  });
}

function restoreCinematicHorizon(demo: Phase18PolishDemo, snapshot: CartArenaSessionSnapshot): void {
  const speed = THREE.MathUtils.clamp(Math.abs(snapshot.speed) / 25, 0, 1);
  const lookAhead = THREE.MathUtils.clamp(Math.abs(snapshot.speed) / 24, 0, 1) * 1.8;
  const target = demo.chaseCamera.target.clone().add(new THREE.Vector3(
    Math.sin(snapshot.heading) * lookAhead,
    0.12,
    Math.cos(snapshot.heading) * lookAhead,
  ));
  demo.camera.lookAt(target);
  const impactRoll = demo.cameraRoll + Math.sin(demo.elapsed * 79) * demo.cameraShake * 0.008;
  const handlingRoll = -demo.steer * speed * (snapshot.boostActive ? 0.014 : 0.008);
  demo.camera.rotateZ(impactRoll + handlingRoll);
}

export function installCartRoguePhase18VisualPolish(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase18PolishDemo;
  const originalBuildWorld = prototype.buildWorld;
  const originalCamera = prototype.applyCameraPresentation;

  prototype.buildWorld = function buildWorldPhase18Polish(this: Phase18PolishDemo): void {
    originalBuildWorld.call(this);
    polishFacetedHorizon(this);
  };

  prototype.applyCameraPresentation = function cameraPhase18Polish(this: Phase18PolishDemo, snapshot: CartArenaSessionSnapshot): void {
    originalCamera.call(this, snapshot);
    restoreCinematicHorizon(this, snapshot);
  };
}

installCartRoguePhase18VisualPolish();

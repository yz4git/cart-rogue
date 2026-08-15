import * as THREE from "three";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase13GradeDemo {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  chaseCamera: { target: THREE.Vector3 };
  buildWorld(): void;
  applyCameraPresentation(boostActive: boolean): void;
}

export function installCartRoguePhase13Grade(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase13GradeDemo;
  const originalBuildWorld = prototype.buildWorld;
  const originalCamera = prototype.applyCameraPresentation;

  prototype.buildWorld = function phase13ColorGrade(this: Phase13GradeDemo): void {
    originalBuildWorld.call(this);
    this.renderer.toneMappingExposure = 1.16;
    this.scene.background = new THREE.Color(0x9fd9fb);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(0xd4edff);
      this.scene.fog.near = 122;
      this.scene.fog.far = 350;
    }
  };

  prototype.applyCameraPresentation = function phase13CloserFraming(this: Phase13GradeDemo, boostActive: boolean): void {
    originalCamera.call(this, boostActive);
    const direction = this.chaseCamera.target.clone().sub(this.camera.position);
    const length = direction.length();
    if (length > 0.001) {
      direction.multiplyScalar(1 / length);
      this.camera.position.addScaledVector(direction, boostActive ? 0.45 : 0.88);
      this.camera.position.y -= boostActive ? 0.03 : 0.1;
    }
    this.camera.fov = Math.max(53.5, this.camera.fov - (boostActive ? 0 : 0.8));
    this.camera.updateProjectionMatrix();
  };
}

installCartRoguePhase13Grade();

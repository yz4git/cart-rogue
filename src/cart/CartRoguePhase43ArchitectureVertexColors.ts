import * as THREE from "three";
import { applyCartPerFaceVertexColor } from "./CartFaceColor";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase43Demo {
  scene: THREE.Scene;
  buildWorld(): void;
}

const STONE_COLORS = new Set([
  0xeee9df, 0xd6d0c5, 0xeae5dc, 0xd4cec3,
  0xe8e4dd, 0xcfc9c0, 0xeee6d8, 0xe7dfd1,
  0xd4caba, 0xc5bca4, 0xa8a28f,
]);

const RED_ARCHITECTURE = new Set([
  0xd96559, 0x9d443f, 0xd76f5d, 0xc95b52,
]);

const DARK_ARCHITECTURE = new Set([
  0x4b5158, 0x40384a, 0x51465b, 0x625a69,
]);

function colorizeArchitecture(scene: THREE.Scene): void {
  let colored = 0;
  const worldPosition = new THREE.Vector3();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.userData.cartPerFaceVertexColor) return;
    if (object instanceof THREE.InstancedMesh && object.instanceColor) return;
    if (Array.isArray(object.material) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
    if (object.material.emissive.getHex() !== 0x000000 && object.material.emissiveIntensity > 0.25) return;

    const hex = object.material.color.getHex();
    const stone = STONE_COLORS.has(hex);
    const red = RED_ARCHITECTURE.has(hex);
    const dark = DARK_ARCHITECTURE.has(hex);
    if (!stone && !red && !dark) return;

    const bossStructure = dark && object.getWorldPosition(worldPosition).z > 400;
    if (applyCartPerFaceVertexColor(object, {
      variance: stone ? 0.045 : red ? 0.065 : 0.055,
      topLift: stone ? 1.09 : red ? 1.12 : bossStructure ? 1.1 : 1.07,
      sideShade: stone ? 0.97 : red ? 0.94 : 0.93,
      bottomShade: stone ? 0.83 : red ? 0.76 : 0.7,
      hueJitter: stone ? 0.004 : red ? 0.012 : 0.008,
      seed: 700 + colored * 13,
    })) colored += 1;
  });
  scene.userData.phase43ArchitectureVertexColors = colored;
}

export function installCartRoguePhase43ArchitectureVertexColors(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase43Demo;
  const oldWorld = prototype.buildWorld;
  prototype.buildWorld = function phase43ArchitectureWorld(this: Phase43Demo): void {
    oldWorld.call(this);
    colorizeArchitecture(this.scene);
  };
}

installCartRoguePhase43ArchitectureVertexColors();

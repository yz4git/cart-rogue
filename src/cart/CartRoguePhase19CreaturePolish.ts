import * as THREE from "three";
import type { CartEnemySnapshot } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface CreaturePolishDemo {
  enemyGroups: Map<string, THREE.Group>;
  buildEnemies(enemies: readonly CartEnemySnapshot[]): void;
}

function standard(color: number, roughness = 0.78): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true });
}

function hideLegacyVehicleShell(group: THREE.Group): void {
  const cubeShell = group.getObjectByName("phase19-cube-creature");
  if (!cubeShell) return;

  const previousHp = group.getObjectByName("hp-fill");
  if (previousHp) previousHp.name = "phase19-hidden-hp-fill";

  for (const child of group.children) {
    if (child === cubeShell) continue;
    child.visible = false;
  }

  cubeShell.visible = true;
  cubeShell.scale.setScalar(1.14);
  cubeShell.position.y = 0.04;
}

function addCreaturePresentation(group: THREE.Group, enemy: CartEnemySnapshot): void {
  if (enemy.kind === "boss" || enemy.kind === "heavy" || enemy.archetype === "tank") return;
  if (group.userData.phase19CreaturePolished) return;
  const cubeShell = group.getObjectByName("phase19-cube-creature");
  if (!cubeShell) return;

  hideLegacyVehicleShell(group);
  group.userData.phase19CreaturePolished = true;

  const radius = Math.max(1.1, enemy.radius);
  const ui = new THREE.Group();
  ui.name = "phase19-creature-ui";

  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.92, 18),
    new THREE.MeshBasicMaterial({ color: 0x46534a, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.scale.set(1, 0.76, 1);
  contact.position.y = 0.028;
  ui.add(contact);

  const hpBack = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 1.92, 0.2, 0.16),
    new THREE.MeshBasicMaterial({ color: 0x293038 }),
  );
  hpBack.position.set(0, 2.82, 0);
  ui.add(hpBack);

  const hpFill = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 1.78, 0.13, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xf25768 }),
  );
  hpFill.name = "hp-fill";
  hpFill.position.set(0, 2.83, -0.015);
  ui.add(hpFill);

  const cheekMaterial = standard(0xffb1c8, 0.7);
  for (const x of [-radius * 0.46, radius * 0.46]) {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.13, 0.06), cheekMaterial);
    cheek.position.set(x, 0.99, radius * 0.76);
    ui.add(cheek);
  }

  group.add(ui);
}

export function installCartRoguePhase19CreaturePolish(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as CreaturePolishDemo;
  const originalBuildEnemies = prototype.buildEnemies;

  prototype.buildEnemies = function buildEnemiesPhase19CreaturePolish(
    this: CreaturePolishDemo,
    enemies: readonly CartEnemySnapshot[],
  ): void {
    originalBuildEnemies.call(this, enemies);
    for (const enemy of enemies) {
      const group = this.enemyGroups.get(enemy.id);
      if (group) addCreaturePresentation(group, enemy);
    }
  };
}

installCartRoguePhase19CreaturePolish();

import * as THREE from "three";
import type { CartEnemySnapshot } from "./CartArenaSession";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

export type CartEnemyDamageVisualStage = 0 | 1 | 2 | 3;

export function cartEnemyDamageVisualStage(hp: number, maxHp: number): CartEnemyDamageVisualStage {
  const ratio = maxHp > 0 ? THREE.MathUtils.clamp(hp / maxHp, 0, 1) : 0;
  if (ratio <= 0.2) return 3;
  if (ratio <= 0.45) return 2;
  if (ratio <= 0.72) return 1;
  return 0;
}

interface Phase27Session {
  snapshot(): { enemies: readonly CartEnemySnapshot[] };
}

interface DamageRig {
  scars: THREE.Mesh[];
  warning: THREE.Mesh;
  smoke: THREE.Mesh[];
  loosePanel: THREE.Mesh;
}

interface Phase27Demo {
  enemyGroups: Map<string, THREE.Group>;
  session: Phase27Session;
  elapsed: number;
  buildEnemies(enemies: readonly CartEnemySnapshot[]): void;
  updateVisuals(delta: number): void;
}

const SCAR_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x403b3a });
const WARNING_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xff7c56, transparent: true, opacity: 0.9 });
const SMOKE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x596066, transparent: true, opacity: 0.28, depthWrite: false });
const PANEL_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x706b6c, roughness: 0.92, metalness: 0, flatShading: true });

function buildDamageRig(group: THREE.Group, enemy: CartEnemySnapshot): void {
  if (group.userData.phase27DamageRig) return;
  const scars: THREE.Mesh[] = [];
  const scarGeometry = new THREE.BoxGeometry(0.1, 0.055, Math.max(0.62, enemy.radius * 0.7));
  for (let index = 0; index < 3; index += 1) {
    const scar = new THREE.Mesh(scarGeometry, SCAR_MATERIAL);
    scar.position.set((index - 1) * enemy.radius * 0.38, 1.22 + index * 0.2, enemy.radius * (0.7 - index * 0.08));
    scar.rotation.set(0.12 * (index - 1), (index - 1) * 0.2, (index - 1) * 0.42);
    scar.visible = false;
    group.add(scar);
    scars.push(scar);
  }

  const warning = new THREE.Mesh(new THREE.OctahedronGeometry(enemy.kind === "boss" ? 0.24 : 0.17, 0), WARNING_MATERIAL);
  warning.position.set(0, enemy.kind === "boss" ? 3.35 : enemy.kind === "heavy" ? 2.28 : 1.95, enemy.radius * 0.35);
  warning.visible = false;
  group.add(warning);

  const smoke: THREE.Mesh[] = [];
  for (let index = 0; index < 3; index += 1) {
    const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24 + index * 0.06, 0), SMOKE_MATERIAL);
    puff.position.set((index - 1) * 0.22, enemy.kind === "boss" ? 3.15 : 2.0, -enemy.radius * 0.38);
    puff.visible = false;
    group.add(puff);
    smoke.push(puff);
  }

  const loosePanel = new THREE.Mesh(
    new THREE.BoxGeometry(enemy.radius * 0.6, 0.09, enemy.radius * 0.72),
    PANEL_MATERIAL,
  );
  loosePanel.position.set(enemy.radius * 0.52, enemy.kind === "boss" ? 2.0 : 1.18, 0.1);
  loosePanel.rotation.z = -0.12;
  loosePanel.visible = false;
  group.add(loosePanel);

  const rig: DamageRig = { scars, warning, smoke, loosePanel };
  group.userData.phase27DamageRig = rig;
}

function updateDamageRig(group: THREE.Group, enemy: CartEnemySnapshot, elapsed: number): void {
  const rig = group.userData.phase27DamageRig as DamageRig | undefined;
  if (!rig) return;
  const stage = enemy.alive ? cartEnemyDamageVisualStage(enemy.hp, enemy.maxHp) : 0;
  rig.scars.forEach((scar, index) => { scar.visible = stage >= index + 1; });
  rig.warning.visible = stage >= 2;
  rig.loosePanel.visible = stage >= 2;
  rig.smoke.forEach((puff, index) => {
    puff.visible = stage >= 3;
    if (!puff.visible) return;
    const phase = elapsed * (1.8 + index * 0.22) + index * 2.1;
    puff.position.y = (enemy.kind === "boss" ? 3.15 : 2.0) + ((phase * 0.34) % 1) * 0.7;
    puff.position.x = Math.sin(phase) * (0.16 + index * 0.04);
    const scale = 0.72 + ((phase * 0.34) % 1) * 0.75;
    puff.scale.setScalar(scale);
  });
  if (rig.warning.visible) {
    const pulse = 0.85 + Math.sin(elapsed * (stage >= 3 ? 12 : 8)) * 0.18;
    rig.warning.scale.setScalar(pulse);
    rig.warning.rotation.y = elapsed * 2.4;
  }
  if (rig.loosePanel.visible) {
    rig.loosePanel.rotation.x = Math.sin(elapsed * 7.5 + enemy.x * 0.1) * (stage >= 3 ? 0.22 : 0.08);
    rig.loosePanel.rotation.z = -0.12 + Math.sin(elapsed * 5.8 + enemy.z * 0.08) * (stage >= 3 ? 0.14 : 0.05);
  }
}

export function installCartRoguePhase27EnemyDamageVisuals(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase27Demo;
  const oldEnemies = prototype.buildEnemies;
  const oldUpdate = prototype.updateVisuals;

  prototype.buildEnemies = function phase27Enemies(this: Phase27Demo, enemies: readonly CartEnemySnapshot[]): void {
    oldEnemies.call(this, enemies);
    for (const enemy of enemies) {
      const group = this.enemyGroups.get(enemy.id);
      if (group) buildDamageRig(group, enemy);
    }
  };

  prototype.updateVisuals = function phase27Update(this: Phase27Demo, delta: number): void {
    oldUpdate.call(this, delta);
    const snapshot = this.session.snapshot();
    for (const enemy of snapshot.enemies) {
      const group = this.enemyGroups.get(enemy.id);
      if (group) updateDamageRig(group, enemy, this.elapsed);
    }
  };
}

installCartRoguePhase27EnemyDamageVisuals();

import * as THREE from "three";
import type { CartEnemySnapshot } from "./CartArenaSession";
import { cartEnemyDamageVisualStage } from "./CartRoguePhase27EnemyDamageVisuals";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface Phase30Session {
  snapshot(): { enemies: readonly CartEnemySnapshot[] };
}

interface Phase30Demo {
  enemyGroups: Map<string, THREE.Group>;
  session: Phase30Session;
  elapsed: number;
  buildEnemies(enemies: readonly CartEnemySnapshot[]): void;
  updateVisuals(delta: number): void;
}

interface BreakupRig {
  hood: THREE.Mesh;
  fenders: THREE.Mesh[];
  sparks: THREE.Mesh[];
  core: THREE.Mesh;
  coreMaterial: THREE.MeshBasicMaterial;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const states = new WeakMap<THREE.Group, BreakupRig>();

export function cartEnemyBreakupIntensity(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 1;
  const ratio = THREE.MathUtils.clamp(hp / maxHp, 0, 1);
  return THREE.MathUtils.clamp((0.7 - ratio) / 0.7, 0, 1);
}

function standard(color: number, roughness = 0.82, metalness = 0.08): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
}

function buildRig(group: THREE.Group, enemy: CartEnemySnapshot): BreakupRig {
  const existing = states.get(group);
  if (existing) return existing;
  const scale = enemy.kind === "boss" ? 1.35 : enemy.kind === "heavy" ? 1.12 : 0.94;
  const armor = standard(enemy.kind === "boss" ? 0x665a69 : enemy.kind === "heavy" ? 0x756d79 : 0xc9b75d, 0.9, 0.04);
  const dark = standard(0x393b40, 0.72, 0.18);
  const hood = new THREE.Mesh(BOX, armor);
  hood.position.set(0, enemy.kind === "boss" ? 1.78 : 1.16, enemy.radius * 0.78);
  hood.scale.set(enemy.radius * 1.22, 0.1 * scale, enemy.radius * 0.72);
  hood.visible = false;
  group.add(hood);

  const fenders: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const fender = new THREE.Mesh(BOX, dark);
    fender.position.set(side * enemy.radius * 0.82, enemy.kind === "boss" ? 1.12 : 0.82, 0.1);
    fender.scale.set(0.15 * scale, 0.46 * scale, enemy.radius * 1.08);
    fender.visible = false;
    group.add(fender);
    fenders.push(fender);
  }

  const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffc65d, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks: THREE.Mesh[] = [];
  for (let index = 0; index < 6; index += 1) {
    const spark = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.46 + index * 0.04), sparkMaterial);
    spark.position.set((index % 2 ? 1 : -1) * enemy.radius * (0.38 + (index % 3) * 0.13), enemy.kind === "boss" ? 2.2 : 1.45, enemy.radius * 0.35);
    spark.rotation.set(index * 0.31, index * 0.67, index * 0.19);
    spark.visible = false;
    group.add(spark);
    sparks.push(spark);
  }

  const coreMaterial = new THREE.MeshBasicMaterial({ color: enemy.kind === "boss" ? 0xff5270 : 0xff9a52, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(enemy.kind === "boss" ? 0.62 : 0.34, 0), coreMaterial);
  core.position.set(0, enemy.kind === "boss" ? 1.72 : 1.15, 0.15);
  core.visible = false;
  group.add(core);

  const rig = { hood, fenders, sparks, core, coreMaterial };
  states.set(group, rig);
  return rig;
}

function updateRig(group: THREE.Group, enemy: CartEnemySnapshot, elapsed: number): void {
  const rig = buildRig(group, enemy);
  const stage = enemy.alive ? cartEnemyDamageVisualStage(enemy.hp, enemy.maxHp) : 0;
  const intensity = enemy.alive ? cartEnemyBreakupIntensity(enemy.hp, enemy.maxHp) : 0;
  rig.hood.visible = stage >= 2;
  rig.fenders.forEach((fender) => { fender.visible = stage >= 2; });
  rig.core.visible = stage >= 3;
  rig.sparks.forEach((spark, index) => {
    spark.visible = stage >= 3 && ((Math.floor(elapsed * 18) + index) % 3 !== 0);
    if (!spark.visible) return;
    spark.rotation.z += 0.12 + index * 0.015;
    spark.scale.z = 0.65 + Math.sin(elapsed * 20 + index) * 0.35;
  });
  if (rig.hood.visible) {
    rig.hood.position.y += Math.sin(elapsed * 8.5 + enemy.x * 0.03) * 0.004 * (1 + intensity * 2.5);
    rig.hood.rotation.x = -0.05 - intensity * 0.22 + Math.sin(elapsed * 6.5) * 0.025;
    rig.hood.rotation.z = Math.sin(elapsed * 5.2 + enemy.z * 0.04) * 0.045 * (1 + intensity);
  }
  rig.fenders.forEach((fender, index) => {
    if (!fender.visible) return;
    const side = index === 0 ? -1 : 1;
    fender.rotation.z = side * (0.04 + intensity * 0.18) + Math.sin(elapsed * 7 + index) * 0.025;
    fender.position.x = side * enemy.radius * (0.82 + intensity * 0.08);
  });
  if (rig.core.visible) {
    const pulse = 0.85 + Math.sin(elapsed * 13) * 0.18 + intensity * 0.22;
    rig.core.scale.setScalar(pulse);
    rig.core.rotation.y = elapsed * 3.2;
    rig.coreMaterial.opacity = 0.38 + intensity * 0.48;
  }
}

export function installCartRoguePhase30EnemyBreakup(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as Phase30Demo;
  const oldEnemies = prototype.buildEnemies;
  const oldUpdate = prototype.updateVisuals;
  prototype.buildEnemies = function phase30Enemies(this: Phase30Demo, enemies: readonly CartEnemySnapshot[]): void {
    oldEnemies.call(this, enemies);
    for (const enemy of enemies) {
      const group = this.enemyGroups.get(enemy.id);
      if (group) buildRig(group, enemy);
    }
  };
  prototype.updateVisuals = function phase30Update(this: Phase30Demo, delta: number): void {
    oldUpdate.call(this, delta);
    const snapshot = this.session.snapshot();
    for (const enemy of snapshot.enemies) {
      const group = this.enemyGroups.get(enemy.id);
      if (group) updateRig(group, enemy, this.elapsed);
    }
  };
}

installCartRoguePhase30EnemyBreakup();

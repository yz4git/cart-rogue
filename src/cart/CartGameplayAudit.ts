import type { CartArenaSessionSnapshot } from "./CartArenaSession";
import type { CartRenderDiagnostics } from "./CartRenderDiagnostics";

export interface CartGameplayAuditControls {
  boostRequested?: boolean;
}

export interface CartGameplayAuditAuthoredContent {
  enemies: number;
  resources: number;
  obstacles: number;
  enemiesByNode: Record<string, number>;
  resourcesByNode: Record<string, number>;
  obstaclesByNode: Record<string, number>;
}

export interface CartGameplayAuditNodeReport {
  nodeId: string;
  nodeKind: CartArenaSessionSnapshot["nodeKind"];
  encounter: CartArenaSessionSnapshot["encounter"];
  seconds: number;
  distance: number;
  averageSpeed: number;
  maxSpeed: number;
  samples: number;
  authoredEnemies: number;
  maxEnemiesAlive: number;
  wallSlideSeconds: number;
}

export interface CartGameplayAuditRenderSummary {
  ok: boolean;
  visibleMeshCount: number;
  visibleInstancedMeshCount: number;
  finalGroundBucketCount: number;
  finalWearBucketCount: number;
  riskyStaticInstanceColorCount: number;
  cameraFov: number | null;
  cameraHeight: number | null;
}

export interface CartGameplayAuditReport {
  version: 1;
  ok: boolean;
  issues: string[];
  durationSeconds: number;
  sampleCount: number;
  distance: number;
  averageSpeed: number;
  maxSpeed: number;
  turboRequestedSeconds: number;
  turboActiveSeconds: number;
  turboRequestedDuty: number;
  turboActiveDuty: number;
  turboActivations: number;
  wallSlideSeconds: number;
  wallSlideEvents: number;
  ramEvents: number;
  enemyKills: number;
  nodeTransitions: number;
  visitedNodes: string[];
  minGas: number;
  minBoostCharges: number;
  authored: CartGameplayAuditAuthoredContent | null;
  nodes: Record<string, CartGameplayAuditNodeReport>;
  render: CartGameplayAuditRenderSummary | null;
}

interface NodeAccumulator {
  nodeId: string;
  nodeKind: CartArenaSessionSnapshot["nodeKind"];
  encounter: CartArenaSessionSnapshot["encounter"];
  seconds: number;
  distance: number;
  weightedSpeed: number;
  maxSpeed: number;
  samples: number;
  authoredEnemies: number;
  maxEnemiesAlive: number;
  wallSlideSeconds: number;
}

function clampDelta(delta: number): number {
  if (!Number.isFinite(delta)) return 0;
  return Math.max(0, Math.min(0.25, delta));
}

function countByNode(items: readonly { nodeId: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.nodeId] = (counts[item.nodeId] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function authoredContent(snapshot: CartArenaSessionSnapshot): CartGameplayAuditAuthoredContent {
  return {
    enemies: snapshot.enemies.length,
    resources: snapshot.resources.length,
    obstacles: snapshot.obstacles.length,
    enemiesByNode: countByNode(snapshot.enemies),
    resourcesByNode: countByNode(snapshot.resources),
    obstaclesByNode: countByNode(snapshot.obstacles),
  };
}

function summarizeRender(diagnostics?: CartRenderDiagnostics | null): CartGameplayAuditRenderSummary | null {
  if (!diagnostics) return null;
  return {
    ok: diagnostics.ok,
    visibleMeshCount: diagnostics.visibleMeshCount,
    visibleInstancedMeshCount: diagnostics.visibleInstancedMeshCount,
    finalGroundBucketCount: diagnostics.finalGroundBucketCount,
    finalWearBucketCount: diagnostics.finalWearBucketCount,
    riskyStaticInstanceColorCount: diagnostics.riskyStaticInstanceColorMeshes.length,
    cameraFov: diagnostics.camera.fov,
    cameraHeight: diagnostics.camera.y,
  };
}

/**
 * Side-effect-free gameplay telemetry used as the baseline for the large
 * Gameplay & Presentation 2.0 update. It consumes public session snapshots so
 * later handling/combat refactors can be compared without reaching into
 * CartArenaSession private state.
 */
export class CartGameplayAuditRecorder {
  private durationSeconds = 0;
  private sampleCount = 0;
  private distance = 0;
  private weightedSpeed = 0;
  private maxSpeed = 0;
  private turboRequestedSeconds = 0;
  private turboActiveSeconds = 0;
  private turboActivations = 0;
  private wallSlideSeconds = 0;
  private wallSlideEvents = 0;
  private ramEvents = 0;
  private enemyKills = 0;
  private nodeTransitions = 0;
  private minGas = 1;
  private minBoostCharges = Number.POSITIVE_INFINITY;
  private authored: CartGameplayAuditAuthoredContent | null = null;
  private previous: CartArenaSessionSnapshot | null = null;
  private previousBoostActive = false;
  private previousWallSliding = false;
  private previousAliveEnemies = 0;
  private previousRamSignature = "";
  private readonly visitedNodes = new Set<string>();
  private readonly nodes = new Map<string, NodeAccumulator>();

  record(
    snapshot: CartArenaSessionSnapshot,
    delta: number,
    controls: CartGameplayAuditControls = {},
  ): void {
    const dt = clampDelta(delta);
    if (dt <= 0) return;

    if (!this.authored) this.authored = authoredContent(snapshot);
    const speed = Math.max(0, Number.isFinite(snapshot.speed) ? snapshot.speed : 0);
    const aliveEnemies = snapshot.enemies.reduce((count, enemy) => count + (enemy.alive ? 1 : 0), 0);
    const ramSignature = snapshot.lastRamEnemyId && snapshot.lastRamDamage > 0
      ? `${snapshot.lastRamEnemyId}:${snapshot.lastRamDamage.toFixed(4)}:${snapshot.ramCombo}`
      : "";

    let stepDistance = 0;
    if (this.previous) {
      stepDistance = Math.hypot(snapshot.x - this.previous.x, snapshot.z - this.previous.z);
      if (snapshot.nodeId !== this.previous.nodeId) this.nodeTransitions += 1;
      if (this.previousAliveEnemies > aliveEnemies) this.enemyKills += this.previousAliveEnemies - aliveEnemies;
    }

    if (snapshot.boostActive && !this.previousBoostActive) this.turboActivations += 1;
    if (snapshot.wallSliding && !this.previousWallSliding) this.wallSlideEvents += 1;
    if (ramSignature && ramSignature !== this.previousRamSignature) this.ramEvents += 1;

    this.durationSeconds += dt;
    this.sampleCount += 1;
    this.distance += stepDistance;
    this.weightedSpeed += speed * dt;
    this.maxSpeed = Math.max(this.maxSpeed, speed);
    if (controls.boostRequested) this.turboRequestedSeconds += dt;
    if (snapshot.boostActive) this.turboActiveSeconds += dt;
    if (snapshot.wallSliding) this.wallSlideSeconds += dt;
    this.minGas = Math.min(this.minGas, snapshot.gas);
    this.minBoostCharges = Math.min(this.minBoostCharges, snapshot.boostCharges);
    this.visitedNodes.add(snapshot.nodeId);

    let node = this.nodes.get(snapshot.nodeId);
    if (!node) {
      node = {
        nodeId: snapshot.nodeId,
        nodeKind: snapshot.nodeKind,
        encounter: snapshot.encounter,
        seconds: 0,
        distance: 0,
        weightedSpeed: 0,
        maxSpeed: 0,
        samples: 0,
        authoredEnemies: snapshot.enemiesTotal,
        maxEnemiesAlive: 0,
        wallSlideSeconds: 0,
      };
      this.nodes.set(snapshot.nodeId, node);
    }
    node.seconds += dt;
    node.distance += stepDistance;
    node.weightedSpeed += speed * dt;
    node.maxSpeed = Math.max(node.maxSpeed, speed);
    node.samples += 1;
    node.authoredEnemies = Math.max(node.authoredEnemies, snapshot.enemiesTotal);
    node.maxEnemiesAlive = Math.max(node.maxEnemiesAlive, snapshot.enemiesAlive);
    if (snapshot.wallSliding) node.wallSlideSeconds += dt;

    this.previous = snapshot;
    this.previousBoostActive = snapshot.boostActive;
    this.previousWallSliding = snapshot.wallSliding;
    this.previousAliveEnemies = aliveEnemies;
    this.previousRamSignature = ramSignature;
  }

  report(renderDiagnostics?: CartRenderDiagnostics | null): CartGameplayAuditReport {
    const render = summarizeRender(renderDiagnostics);
    const issues: string[] = [];
    if (this.sampleCount === 0) issues.push("gameplay audit has no samples");
    if (!Number.isFinite(this.distance) || this.distance < 0) issues.push("gameplay distance is invalid");
    if (!Number.isFinite(this.maxSpeed) || this.maxSpeed < 0) issues.push("gameplay max speed is invalid");
    if (render && !render.ok) issues.push("render diagnostics are not healthy");

    const nodeReports: Record<string, CartGameplayAuditNodeReport> = {};
    for (const [nodeId, node] of [...this.nodes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      nodeReports[nodeId] = {
        nodeId,
        nodeKind: node.nodeKind,
        encounter: node.encounter,
        seconds: node.seconds,
        distance: node.distance,
        averageSpeed: node.seconds > 0 ? node.weightedSpeed / node.seconds : 0,
        maxSpeed: node.maxSpeed,
        samples: node.samples,
        authoredEnemies: node.authoredEnemies,
        maxEnemiesAlive: node.maxEnemiesAlive,
        wallSlideSeconds: node.wallSlideSeconds,
      };
    }

    const duration = this.durationSeconds;
    return {
      version: 1,
      ok: issues.length === 0,
      issues,
      durationSeconds: duration,
      sampleCount: this.sampleCount,
      distance: this.distance,
      averageSpeed: duration > 0 ? this.weightedSpeed / duration : 0,
      maxSpeed: this.maxSpeed,
      turboRequestedSeconds: this.turboRequestedSeconds,
      turboActiveSeconds: this.turboActiveSeconds,
      turboRequestedDuty: duration > 0 ? this.turboRequestedSeconds / duration : 0,
      turboActiveDuty: duration > 0 ? this.turboActiveSeconds / duration : 0,
      turboActivations: this.turboActivations,
      wallSlideSeconds: this.wallSlideSeconds,
      wallSlideEvents: this.wallSlideEvents,
      ramEvents: this.ramEvents,
      enemyKills: this.enemyKills,
      nodeTransitions: this.nodeTransitions,
      visitedNodes: [...this.visitedNodes].sort(),
      minGas: this.sampleCount > 0 ? this.minGas : 1,
      minBoostCharges: Number.isFinite(this.minBoostCharges) ? this.minBoostCharges : 0,
      authored: this.authored,
      nodes: nodeReports,
      render,
    };
  }
}

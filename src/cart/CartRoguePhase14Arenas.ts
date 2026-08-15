import * as THREE from "three";
import type { RallyInputState } from "../rally/RallyTypes";
import { CartArenaSession, type CartArenaSessionSnapshot } from "./CartArenaSession";
import type { CartEnemyState } from "./CartCombat";
import { CartRogueCanvasPreview } from "./CartRogueCanvasPreview";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";
import { CART_WORLD_GRAPH, type CartWorldLocation, type CartWorldNode } from "./CartWorldGraph";
import {
  CART_ARENA_SHAPES,
  cartArenaAdjacentCorridors,
  cartArenaBoundaryPoints,
  cartArenaContains,
  cartArenaPointInPortal,
  cartArenaShapeForNode,
  cartNodesAreAdjacent,
  projectCartPointInsideArena,
} from "./CartArenaShapes";

const CAR_WALL_MARGIN = 1.62;
const WALL_INSET = 0.16;
const ENEMY_SEPARATION_SLOP = 0.16;

interface SessionCar {
  position: { x: number; z: number };
  velocity: { x: number; z: number };
  heading: number;
  forwardVelocity: number;
  lateralVelocity: number;
  speed: number;
  collisionImpact: number;
}

interface Phase14Session {
  car: SessionCar;
  enemies: CartEnemyState[];
  location: CartWorldLocation;
  wallSlideTimer: number;
  step(input: RallyInputState, fixedDelta?: number): void;
  slideAlongBoundary(previousX: number, previousZ: number): void;
  slideAroundEnemy(enemy: CartEnemyState, previousX: number, previousZ: number): void;
  syncHorizontalVelocity(): void;
  snapshot(): CartArenaSessionSnapshot;
}

interface Phase14Demo {
  scene: THREE.Scene;
  buildWorld(): void;
  addBoundaryBlocks(cx: number, cz: number, hw: number, hd: number, corridor: boolean): void;
  addFenceSegment(x: number, z: number, rotation: number, color: number): void;
}

interface Phase14Canvas {
  context: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  session: { snapshot(): CartArenaSessionSnapshot };
  draw(): void;
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function rotateToward(current: number, target: number, maxAmount: number): number {
  const difference = normalizeAngle(target - current);
  return normalizeAngle(current + Math.max(-maxAmount, Math.min(maxAmount, difference)));
}

function applyTangentSlide(session: Phase14Session, normalX: number, normalZ: number, impact = 0.42): void {
  let nx = normalX;
  let nz = normalZ;
  const normalLength = Math.hypot(nx, nz);
  if (normalLength < 1e-5) {
    nx = Math.sin(session.car.heading);
    nz = Math.cos(session.car.heading);
  } else {
    nx /= normalLength;
    nz /= normalLength;
  }

  let vx = session.car.velocity.x;
  let vz = session.car.velocity.z;
  const outwardSpeed = vx * nx + vz * nz;
  if (outwardSpeed > 0) {
    vx -= nx * outwardSpeed * 1.08;
    vz -= nz * outwardSpeed * 1.08;
  }

  const tangentAX = -nz;
  const tangentAZ = nx;
  const tangentBX = nz;
  const tangentBZ = -nx;
  const forwardX = Math.sin(session.car.heading);
  const forwardZ = Math.cos(session.car.heading);
  const dotA = forwardX * tangentAX + forwardZ * tangentAZ;
  const dotB = forwardX * tangentBX + forwardZ * tangentBZ;
  const tangentX = dotA >= dotB ? tangentAX : tangentBX;
  const tangentZ = dotA >= dotB ? tangentAZ : tangentBZ;

  let remainingSpeed = Math.hypot(vx, vz);
  const preserved = Math.max(4.1, Math.abs(session.car.forwardVelocity) * 0.88);
  if (remainingSpeed < preserved * 0.72) {
    remainingSpeed = preserved;
    vx = tangentX * remainingSpeed - nx * 0.28;
    vz = tangentZ * remainingSpeed - nz * 0.28;
  } else {
    vx -= nx * 0.22;
    vz -= nz * 0.22;
  }

  const targetHeading = Math.atan2(vx, vz);
  session.car.heading = rotateToward(session.car.heading, targetHeading, 0.82);
  session.car.forwardVelocity = Math.max(3.8, Math.hypot(vx, vz) * 0.96);
  session.car.lateralVelocity *= 0.08;
  session.syncHorizontalVelocity();
  session.car.collisionImpact = Math.max(session.car.collisionImpact, impact);
  session.wallSlideTimer = 0.3;
}

function resolveArenaWall(session: Phase14Session, node: CartWorldNode): boolean {
  const x = session.car.position.x;
  const z = session.car.position.z;
  if (!cartArenaShapeForNode(node.id)) return false;
  if (cartArenaContains(node.id, x, z, CAR_WALL_MARGIN)) return false;

  // A point already inside a connected corridor is a valid portal transition,
  // not an arena-wall penetration.
  if (cartArenaPointInPortal(node, x, z, 0)) {
    const insideCorridor = cartArenaAdjacentCorridors(node).some((corridor) =>
      Math.abs(x - corridor.rect.centerX) <= corridor.rect.halfWidth
      && Math.abs(z - corridor.rect.centerZ) <= corridor.rect.halfDepth,
    );
    if (insideCorridor) return false;
  }

  const projection = projectCartPointInsideArena(node.id, x, z, CAR_WALL_MARGIN);
  session.car.position.x = projection.x - projection.normalX * WALL_INSET;
  session.car.position.z = projection.z - projection.normalZ * WALL_INSET;
  applyTangentSlide(session, projection.normalX, projection.normalZ);
  return true;
}

function resolveRectWall(session: Phase14Session, node: CartWorldNode): void {
  const rect = node.rect;
  const attemptedX = session.car.position.x;
  const attemptedZ = session.car.position.z;
  const minX = rect.centerX - rect.halfWidth + CAR_WALL_MARGIN;
  const maxX = rect.centerX + rect.halfWidth - CAR_WALL_MARGIN;
  const minZ = rect.centerZ - rect.halfDepth + CAR_WALL_MARGIN;
  const maxZ = rect.centerZ + rect.halfDepth - CAR_WALL_MARGIN;
  const clampedX = Math.max(minX, Math.min(maxX, attemptedX));
  const clampedZ = Math.max(minZ, Math.min(maxZ, attemptedZ));
  let normalX = 0;
  let normalZ = 0;
  if (attemptedX < minX) normalX = -1;
  else if (attemptedX > maxX) normalX = 1;
  if (attemptedZ < minZ) normalZ = -1;
  else if (attemptedZ > maxZ) normalZ = 1;
  if (normalX === 0 && normalZ === 0) {
    const left = Math.abs(attemptedX - minX);
    const right = Math.abs(maxX - attemptedX);
    const bottom = Math.abs(attemptedZ - minZ);
    const top = Math.abs(maxZ - attemptedZ);
    const closest = Math.min(left, right, bottom, top);
    if (closest === left) normalX = -1;
    else if (closest === right) normalX = 1;
    else if (closest === bottom) normalZ = -1;
    else normalZ = 1;
  }
  const length = Math.hypot(normalX, normalZ) || 1;
  normalX /= length;
  normalZ /= length;
  session.car.position.x = clampedX - normalX * WALL_INSET;
  session.car.position.z = clampedZ - normalZ * WALL_INSET;
  applyTangentSlide(session, normalX, normalZ, 0.38);
}

function projectEnemyInsideArena(enemy: CartEnemyState): void {
  if (!cartArenaShapeForNode(enemy.nodeId)) return;
  const projection = projectCartPointInsideArena(enemy.nodeId, enemy.x, enemy.z, enemy.radius + 0.5);
  if (!projection.corrected) return;
  enemy.x = projection.x - projection.normalX * 0.12;
  enemy.z = projection.z - projection.normalZ * 0.12;
  const tangentA = Math.atan2(-projection.normalZ, projection.normalX);
  const tangentB = normalizeAngle(tangentA + Math.PI);
  const aDiff = Math.abs(normalizeAngle(tangentA - enemy.heading));
  const bDiff = Math.abs(normalizeAngle(tangentB - enemy.heading));
  enemy.heading = rotateToward(enemy.heading, aDiff <= bDiff ? tangentA : tangentB, 0.48);
}

function separateEnemy(session: Phase14Session, enemy: CartEnemyState, strongEscape: boolean): boolean {
  if (!enemy.alive || enemy.nodeId !== session.location.node.id) return false;
  let dx = session.car.position.x - enemy.x;
  let dz = session.car.position.z - enemy.z;
  let distance = Math.hypot(dx, dz);
  const desired = enemy.radius + 1.5 + ENEMY_SEPARATION_SLOP;
  if (distance >= desired) return false;
  if (distance < 1e-4) {
    dx = -Math.sin(session.car.heading);
    dz = -Math.cos(session.car.heading);
    distance = 1;
  }
  const nx = dx / distance;
  const nz = dz / distance;
  const penetration = Math.max(0.08, desired - distance + ENEMY_SEPARATION_SLOP);
  const heavyLike = enemy.kind === "heavy" || enemy.kind === "boss";
  const carShare = enemy.kind === "boss" ? 0.94 : enemy.kind === "heavy" ? 0.84 : enemy.kind === "blocker" ? 1 : 0.72;
  const enemyShare = enemy.kind === "blocker" ? 0 : 1 - carShare;

  session.car.position.x += nx * penetration * carShare;
  session.car.position.z += nz * penetration * carShare;
  enemy.x -= nx * penetration * enemyShare;
  enemy.z -= nz * penetration * enemyShare;
  projectEnemyInsideArena(enemy);

  if (cartArenaShapeForNode(session.location.node.id)) resolveArenaWall(session, session.location.node);

  // If a wall projection and an enemy push fight each other, escape sideways.
  dx = session.car.position.x - enemy.x;
  dz = session.car.position.z - enemy.z;
  distance = Math.hypot(dx, dz);
  if (distance < desired - 0.02) {
    const tangentAX = -nz;
    const tangentAZ = nx;
    const tangentBX = nz;
    const tangentBZ = -nx;
    const forwardX = Math.sin(session.car.heading);
    const forwardZ = Math.cos(session.car.heading);
    const useA = forwardX * tangentAX + forwardZ * tangentAZ >= forwardX * tangentBX + forwardZ * tangentBZ;
    const tangentX = useA ? tangentAX : tangentBX;
    const tangentZ = useA ? tangentAZ : tangentBZ;
    const sideNudge = (desired - distance) + (strongEscape ? 0.72 : 0.42);
    session.car.position.x += tangentX * sideNudge;
    session.car.position.z += tangentZ * sideNudge;
    if (enemy.kind !== "blocker") {
      enemy.x -= tangentX * Math.min(0.32, sideNudge * 0.18);
      enemy.z -= tangentZ * Math.min(0.32, sideNudge * 0.18);
      projectEnemyInsideArena(enemy);
    }
    if (cartArenaShapeForNode(session.location.node.id)) resolveArenaWall(session, session.location.node);
  }

  const awayHeading = Math.atan2(nx, nz);
  const tangentHeadingA = normalizeAngle(awayHeading + 0.72);
  const tangentHeadingB = normalizeAngle(awayHeading - 0.72);
  const diffA = Math.abs(normalizeAngle(tangentHeadingA - session.car.heading));
  const diffB = Math.abs(normalizeAngle(tangentHeadingB - session.car.heading));
  session.car.heading = rotateToward(session.car.heading, diffA <= diffB ? tangentHeadingA : tangentHeadingB, heavyLike ? 0.82 : 0.64);
  session.car.forwardVelocity = Math.max(3.8, Math.abs(session.car.forwardVelocity) * (enemy.kind === "boss" ? 0.82 : heavyLike ? 0.86 : 0.93));
  session.car.lateralVelocity *= 0.08;
  session.syncHorizontalVelocity();
  session.car.collisionImpact = Math.max(session.car.collisionImpact, enemy.kind === "boss" ? 0.72 : heavyLike ? 0.6 : 0.48);
  return true;
}

function enforcePostStep(session: Phase14Session, previousNodeId: string, previousX: number, previousZ: number): void {
  const currentNode = session.location.node;
  if (!cartNodesAreAdjacent(previousNodeId, currentNode.id)) {
    const previousNode = CART_WORLD_GRAPH.nodes.find((node) => node.id === previousNodeId);
    if (previousNode) {
      session.location = {
        node: previousNode,
        localX: previousX - previousNode.rect.centerX,
        localZ: previousZ - previousNode.rect.centerZ,
      };
      session.car.position.x = previousX;
      session.car.position.z = previousZ;
      if (cartArenaShapeForNode(previousNode.id)) resolveArenaWall(session, previousNode);
      else resolveRectWall(session, previousNode);
    }
  }

  const node = session.location.node;
  if (cartArenaShapeForNode(node.id)) resolveArenaWall(session, node);
  for (const enemy of session.enemies) {
    if (!enemy.alive || enemy.nodeId !== node.id) continue;
    projectEnemyInsideArena(enemy);
  }
  for (let pass = 0; pass < 2; pass += 1) {
    let touched = false;
    for (const enemy of session.enemies) touched = separateEnemy(session, enemy, false) || touched;
    if (!touched) break;
  }
  if (cartArenaShapeForNode(node.id)) resolveArenaWall(session, node);
}

function findArenaNode(cx: number, cz: number, hw: number, hd: number): CartWorldNode | null {
  return CART_WORLD_GRAPH.nodes.find((node) =>
    node.kind !== "corridor"
    && Math.abs(node.rect.centerX - cx) < 1e-6
    && Math.abs(node.rect.centerZ - cz) < 1e-6
    && Math.abs(node.rect.halfWidth - hw) < 1e-6
    && Math.abs(node.rect.halfDepth - hd) < 1e-6,
  ) ?? null;
}

function addCurvedBoundary(demo: Phase14Demo, node: CartWorldNode): void {
  const points = cartArenaBoundaryPoints(node.id, 64, -0.72);
  if (points.length < 3) return;
  const color = node.kind === "boss" ? 0xd8d0e4 : 0xe7dfd1;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (cartArenaPointInPortal(node, point.x, point.z, 1.15)) continue;
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const rotation = Math.atan2(-dz, dx);
    demo.addFenceSegment(point.x, point.z, rotation, color);
  }
}

function shapePath(node: CartWorldNode): THREE.Shape {
  const points = cartArenaBoundaryPoints(node.id, 72, 0);
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    const x = point.x - node.rect.centerX;
    const z = point.z - node.rect.centerZ;
    if (index === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  });
  shape.closePath();
  return shape;
}

function addArenaShapeSurfaces(demo: Phase14Demo): void {
  for (const node of CART_WORLD_GRAPH.nodes) {
    if (!cartArenaShapeForNode(node.id)) continue;
    const grassColor = node.kind === "boss" ? 0x8dbb87 : 0x9ed28d;
    const cover = new THREE.Mesh(
      new THREE.BoxGeometry(node.rect.halfWidth * 2 + 0.2, 0.08, node.rect.halfDepth * 2 + 0.2),
      new THREE.MeshStandardMaterial({ color: grassColor, roughness: 0.92, flatShading: true }),
    );
    cover.position.set(node.rect.centerX, -0.035, node.rect.centerZ);
    cover.receiveShadow = true;
    demo.scene.add(cover);

    const floorColor = node.kind === "boss" ? 0xc8addf : node.id === "arena-02" ? 0xe7b97c : 0xefc88d;
    const floor = new THREE.Mesh(
      new THREE.ShapeGeometry(shapePath(node), 1),
      new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.9, metalness: 0, flatShading: true }),
    );
    floor.rotation.x = Math.PI / 2;
    floor.position.set(node.rect.centerX, 0.022, node.rect.centerZ);
    floor.receiveShadow = true;
    demo.scene.add(floor);

    const borderPoints = cartArenaBoundaryPoints(node.id, 88, 0.18).map((point) => new THREE.Vector3(point.x, 0.075, point.z));
    const border = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(borderPoints),
      new THREE.LineBasicMaterial({ color: node.kind === "boss" ? 0xf1d2ff : 0xffe4ad, transparent: true, opacity: 0.6 }),
    );
    demo.scene.add(border);

    const tileGeometry = new THREE.BoxGeometry(2.3, 0.035, 2.3);
    const tileMaterial = new THREE.MeshStandardMaterial({ color: node.kind === "boss" ? 0xd7bce8 : 0xf4d39d, roughness: 0.94, flatShading: true });
    let tileCount = 0;
    for (let x = node.rect.centerX - node.rect.halfWidth + 2.5; x < node.rect.centerX + node.rect.halfWidth - 2; x += 5.1) {
      for (let z = node.rect.centerZ - node.rect.halfDepth + 2.5; z < node.rect.centerZ + node.rect.halfDepth - 2; z += 5.1) {
        if (tileCount >= 38 || !cartArenaContains(node.id, x, z, 2.4)) continue;
        const seed = Math.abs(Math.floor(x * 13 + z * 7));
        if (seed % 3 !== 0) continue;
        const tile = new THREE.Mesh(tileGeometry, tileMaterial);
        tile.position.set(x, 0.052, z);
        tile.rotation.y = ((seed % 5) - 2) * 0.035;
        tile.receiveShadow = true;
        demo.scene.add(tile);
        tileCount += 1;
      }
    }
  }
}

function drawArenaOutlines(canvas: Phase14Canvas): void {
  const snapshot = canvas.session.snapshot();
  const width = canvas.canvas.clientWidth || canvas.canvas.width;
  const height = canvas.canvas.clientHeight || canvas.canvas.height;
  const scale = Math.min(width / 82, height / 68);
  const centerX = width * 0.5;
  const centerZ = height * 0.63;
  const ctx = canvas.context;
  ctx.save();
  ctx.lineWidth = Math.max(1.4, 0.16 * scale);
  ctx.strokeStyle = "rgba(255,255,255,.78)";
  for (const node of CART_WORLD_GRAPH.nodes) {
    if (!cartArenaShapeForNode(node.id)) continue;
    const points = cartArenaBoundaryPoints(node.id, 48, 0);
    ctx.beginPath();
    points.forEach((point, index) => {
      const sx = centerX + (point.x - snapshot.x) * scale;
      const sy = centerZ - (point.z - snapshot.z) * scale;
      if (index === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

export function installCartRoguePhase14Arenas(): void {
  const sessionPrototype = CartArenaSession.prototype as unknown as Phase14Session;
  const originalStep = sessionPrototype.step;
  const originalBoundary = sessionPrototype.slideAlongBoundary;
  const originalEnemySlide = sessionPrototype.slideAroundEnemy;

  sessionPrototype.slideAlongBoundary = function slideAlongBoundaryPhase14(this: Phase14Session, previousX: number, previousZ: number): void {
    const node = this.location.node;
    if (cartArenaShapeForNode(node.id)) {
      if (!resolveArenaWall(this, node)) originalBoundary.call(this, previousX, previousZ);
      return;
    }
    resolveRectWall(this, node);
  };

  sessionPrototype.slideAroundEnemy = function slideAroundEnemyPhase14(this: Phase14Session, enemy: CartEnemyState, previousX: number, previousZ: number): void {
    if (!separateEnemy(this, enemy, true)) originalEnemySlide.call(this, enemy, previousX, previousZ);
  };

  sessionPrototype.step = function stepPhase14(this: Phase14Session, input: RallyInputState, fixedDelta?: number): void {
    const previousX = this.car.position.x;
    const previousZ = this.car.position.z;
    const previousNodeId = this.location.node.id;
    originalStep.call(this, input, fixedDelta);
    enforcePostStep(this, previousNodeId, previousX, previousZ);
  };

  const webglPrototype = CartRogueWebGLDemo.prototype as unknown as Phase14Demo;
  const originalBuildWorld = webglPrototype.buildWorld;
  const originalBoundaryBlocks = webglPrototype.addBoundaryBlocks;
  webglPrototype.addBoundaryBlocks = function boundaryBlocksPhase14(this: Phase14Demo, cx: number, cz: number, hw: number, hd: number, corridor: boolean): void {
    if (corridor) {
      originalBoundaryBlocks.call(this, cx, cz, hw, hd, true);
      return;
    }
    const node = findArenaNode(cx, cz, hw, hd);
    if (!node || !CART_ARENA_SHAPES[node.id]) {
      originalBoundaryBlocks.call(this, cx, cz, hw, hd, false);
      return;
    }
    addCurvedBoundary(this, node);
  };
  webglPrototype.buildWorld = function buildWorldPhase14(this: Phase14Demo): void {
    originalBuildWorld.call(this);
    addArenaShapeSurfaces(this);
  };

  const canvasPrototype = CartRogueCanvasPreview.prototype as unknown as Phase14Canvas;
  const originalCanvasDraw = canvasPrototype.draw;
  canvasPrototype.draw = function drawPhase14(this: Phase14Canvas): void {
    originalCanvasDraw.call(this);
    drawArenaOutlines(this);
  };
}

installCartRoguePhase14Arenas();

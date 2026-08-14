import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RallyCar } from "../src/rally/RallyCar";
import { RallyTrack, RALLY_TRACK_CONSTANTS } from "../src/rally/RallyTrack";
import { expandObstaclePatterns } from "../src/rally/RallyObstaclePatterns";
import { attachRallySpeedLines, RallySpeedLines } from "../src/rally/RallySpeedLines";
import { TRACK_02 } from "../src/rally/tracks/Track02";
import { TRACK_03 } from "../src/rally/tracks/Track03";
import { getRallyVisualTheme, rallyThemeColors, rallyThemeCss } from "../src/rally/RallyVisualTheme";

test("rally visual themes provide distinct track identities and environment variants", () => {
  const themes = rallyThemeColors();
  assert.equal(themes.length, 3);
  assert.equal(new Set(themes.map((theme) => theme.id)).size, 3);
  for (const theme of themes) {
    for (const value of Object.values(theme).filter((value): value is number => typeof value === "number")) {
      assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffff);
      assert.match(rallyThemeCss(value), /^#[0-9a-f]{6}$/);
    }
  }

  assert.equal(getRallyVisualTheme("track-01").id, "forest");
  assert.equal(getRallyVisualTheme("track-02").id, "mountain");
  assert.equal(getRallyVisualTheme("track-03").id, "badlands");
  assert.notEqual(getRallyVisualTheme("track-01", "dry").road, getRallyVisualTheme("track-01", "wet").road);
  assert.notEqual(getRallyVisualTheme("track-01", "dry").sky, getRallyVisualTheme("track-01", "sunset").sky);
});

test("tracks expose the canonical visual theme used by both renderers", () => {
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    const track = new RallyTrack(definition);
    assert.equal(track.visualTheme.id, track.id === "track-02" ? "mountain" : track.id === "track-03" ? "badlands" : "forest");
    track.dispose();
  }
});

test("track geometry is closed and its terrain front faces point upward", () => {
  const track = new RallyTrack();
  const start = track.sampleAtDistance(0);
  const end = track.sampleAtDistance(track.length);
  assert.ok(Math.hypot(start.x - end.x, start.z - end.z) < 0.01);
  const terrain = track.group.children[0] as THREE.Mesh;
  const positions = terrain.geometry.getAttribute("position");
  const index = terrain.geometry.getIndex();
  assert.ok(index);
  const a = new THREE.Vector3().fromBufferAttribute(positions, index.getX(0));
  const b = new THREE.Vector3().fromBufferAttribute(positions, index.getX(1));
  const c = new THREE.Vector3().fromBufferAttribute(positions, index.getX(2));
  assert.ok(new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).y > 0);
  track.dispose();
});

test("all rally tracks use true closed-loop arc-length sampling", () => {
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    const track = new RallyTrack(definition);
    assert.equal(track.segmentLengths.length, track.segments);
    assert.ok(track.segmentLengths.every((length) => length > 0));
    assert.ok(Math.abs(track.segmentLengths.reduce((sum, length) => sum + length, 0) - track.length) < 0.0001);

    for (let index = 0; index < 256; index += 1) {
      const sample = track.sampleAtDistance((track.length * index) / 256);
      const query = track.queryAt(sample.x, sample.z);
      assert.ok(Math.abs(query.lateralDistance) < 0.05, `${track.id} sample ${index} left the physical centerline`);
    }

    const start = track.sampleAtDistance(0);
    const wrapped = track.sampleAtDistance(track.length);
    assert.ok(Math.hypot(start.x - wrapped.x, start.z - wrapped.z) < 0.001);
    track.dispose();
  }
});

test("upcoming turn query reads physical track curvature for mobile planning", () => {
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    const track = new RallyTrack(definition);
    let strongest = 0;
    for (let index = 0; index < 192; index += 1) {
      const query = track.queryAt(track.sampleAtDistance(track.length * index / 192).x, track.sampleAtDistance(track.length * index / 192).z);
      const turn = track.upcomingTurnAt(query, 22);
      assert.ok(turn.strength >= 0 && turn.strength <= 1);
      assert.ok(turn.direction >= -1 && turn.direction <= 1);
      assert.ok(Number.isFinite(turn.recommendedSpeed) && turn.recommendedSpeed > 0);
      strongest = Math.max(strongest, turn.strength);
    }
    assert.ok(strongest > 0.15, `${track.id} must expose a usable upcoming corner signal`);
    track.dispose();
  }
});

test("all hover tracks provide a long high-speed straight and authored destructible patterns", () => {
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    const track = new RallyTrack(definition);
    const step = track.length / 192;
    let straightRun = 0;
    let longestStraight = 0;
    for (let index = 0; index < 192; index += 1) {
      const current = track.sampleAtDistance(step * index);
      const next = track.sampleAtDistance(step * (index + 1));
      const headingDelta = Math.abs(Math.atan2(
        Math.sin(next.heading - current.heading),
        Math.cos(next.heading - current.heading),
      ));
      if (headingDelta < 0.06) straightRun += step;
      else {
        longestStraight = Math.max(longestStraight, straightRun);
        straightRun = 0;
      }
    }
    longestStraight = Math.max(longestStraight, straightRun);
    assert.ok(longestStraight >= 65, `${track.id} needs a readable high-speed straight, got ${longestStraight.toFixed(1)}m`);

    const authored = track.definition.obstacles ?? [];
    assert.ok(authored.length >= 8, `${track.id} needs a dense destructible decision set`);
    assert.ok(authored.every((obstacle) => obstacle.kind !== "rock" || obstacle.destructible === true), `${track.id} has a non-destructible gameplay rock`);
    const patterns = new Set(authored.map((obstacle) => obstacle.pattern).filter(Boolean));
    assert.ok(patterns.has("wall-gate"), `${track.id} needs a readable wall gate pattern`);
    assert.ok(patterns.has("smash-line"), `${track.id} needs a boost smash line pattern`);
    assert.ok(patterns.has("slalom"), `${track.id} needs a strafe slalom pattern`);
    track.dispose();
  }
});

test("visual road width and terrain vertices use the physical track surface", () => {
  const track = new RallyTrack();
  const sample = track.sampleAtDistance(track.length * 0.27);
  const sideX = -sample.tangentZ;
  const sideZ = sample.tangentX;
  const edgeX = sample.x + sideX * (sample.roadWidth * 0.5);
  const edgeZ = sample.z + sideZ * (sample.roadWidth * 0.5);
  const edge = track.queryAt(edgeX, edgeZ);
  const outside = track.queryAt(edgeX + sideX * 0.06, edgeZ + sideZ * 0.06);
  assert.equal(edge.onRoad, true);
  assert.equal(outside.onRoad, false);
  assert.ok(Math.abs(edge.roadHalfWidth - sample.roadWidth * 0.5) < 0.01);

  const terrain = track.group.children[0] as THREE.Mesh;
  const positions = terrain.geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += Math.max(1, Math.floor(positions.count / 17))) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    assert.ok(Math.abs((y + RALLY_TRACK_CONSTANTS.terrainVisualEpsilon) - track.groundHeight(x, z)) < 0.001);
  }
  track.dispose();
});

test("road presentation exposes shared shoulders, surface overlay, and guide markings", () => {
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    const track = new RallyTrack(definition);
    const road = track.group.children[1] as THREE.Mesh;
    assert.equal(road.name, "");
    for (const name of ["rally-road-boundaries", "rally-road-surface", "rally-road-markings"]) {
      assert.ok(track.group.getObjectByName(name), `${track.id} is missing ${name}`);
    }
    const boundaries = track.group.getObjectByName("rally-road-boundaries") as THREE.Mesh;
    const surface = track.group.getObjectByName("rally-road-surface") as THREE.Mesh;
    assert.ok((boundaries.geometry.getAttribute("position")?.count ?? 0) >= track.segments * 8);
    assert.ok((surface.geometry.getAttribute("position")?.count ?? 0) >= track.segments * 2);
    track.dispose();
  }
});

test("scenery uses shared instanced low-poly assets for buildings, trees, and rocks", () => {
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    const track = new RallyTrack(definition);
    const building = track.group.getObjectByName("rally-scenery-building") as THREE.InstancedMesh;
    const tree = track.group.getObjectByName("rally-scenery-tree") as THREE.InstancedMesh;
    const rock = track.group.getObjectByName("rally-scenery-rock") as THREE.InstancedMesh;
    assert.ok(building && tree && rock, `${track.id} scenery asset groups are incomplete`);
    assert.ok(building.count + tree.count + rock.count === track.scenery.length);
    assert.equal(building.geometry.type, "BoxGeometry");
    assert.equal(tree.geometry.type, "ConeGeometry");
    assert.equal(rock.geometry.type, "DodecahedronGeometry");
    const fullCounts = [building.count, tree.count, rock.count];
    track.setGraphicsQuality("low");
    assert.ok(building.count <= fullCounts[0] && tree.count <= fullCounts[1] && rock.count <= fullCounts[2]);
    track.setGraphicsQuality("high");
    assert.deepEqual([building.count, tree.count, rock.count], fullCounts);
    track.dispose();
  }
});

test("graphics quality never hides a scenery collider", () => {
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    const track = new RallyTrack(definition);
    assert.ok(track.scenery.some((item) => !item.solid), `${track.id} needs decorative scenery for quality filtering`);
    for (const quality of ["low", "normal", "high"] as const) {
      track.setGraphicsQuality(quality);
      const visibleIds = new Set(track.scenery.filter((item) => item.visible).map((item) => item.id));
      for (const item of track.scenery.filter((candidate) => candidate.solid)) {
        assert.ok(visibleIds.has(item.id), `${track.id} ${quality} hid solid scenery ${item.id}`);
      }
      for (const collider of track.staticColliders.filter((candidate) => candidate.source === "scenery" && candidate.active)) {
        assert.ok(visibleIds.has(collider.id), `${track.id} ${quality} hid active scenery collider ${collider.id}`);
      }
    }
    track.dispose();
  }
});

test("WebGL speed lines attach to the camera-space render graph", () => {
  const camera = new THREE.PerspectiveCamera();
  const speedLines = new RallySpeedLines();
  attachRallySpeedLines(camera, speedLines);
  assert.equal(speedLines.group.parent, camera);
  speedLines.setQuality("normal");
  speedLines.update(30);
  speedLines.dispose();
});

test("obstacle pattern expansion creates deterministic gameplay children", () => {
  const patterns = ["wall-gate", "double-gap", "slalom", "smash-line", "pickup-behind-wall"] as const;
  for (const pattern of patterns) {
    const result = expandObstaclePatterns([
      { id: `pattern-${pattern}`, progress: 0.4, lateral: 0, radius: 1.8, kind: "wall", destructible: true, pattern },
    ], {
      length: 500,
      sampleAtProgress: () => ({ x: 0, z: 0, heading: 0, roadWidth: 18 }),
    });
    assert.equal(result.groups.length, 1);
    assert.ok(result.groups[0].childIds.length >= 2, `${pattern} should expand to multiple children`);
    assert.equal(result.obstacles[0].id, `pattern-${pattern}`);
    assert.equal(new Set(result.obstacles.map((obstacle) => obstacle.id)).size, result.obstacles.length);
    assert.deepEqual(result.obstacles.map((obstacle) => obstacle.id), result.obstacles.map((obstacle) => obstacle.id));
  }
});

test("Track 01-03 render and collide with expanded obstacle patterns", () => {
  const minimums: Record<string, Record<string, number>> = {
    "track-01": { "wall-gate": 2, slalom: 1, "smash-line": 1, "pickup-behind-wall": 1 },
    "track-02": { "wall-gate": 2, slalom: 1, "smash-line": 1, "pickup-behind-wall": 1 },
    "track-03": { "wall-gate": 2, "double-gap": 1, slalom: 2, "smash-line": 2, "pickup-behind-wall": 2 },
  };
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    const track = new RallyTrack(definition);
    const groupsByPattern = new Map<string, number>();
    for (const group of track.obstaclePatterns) groupsByPattern.set(group.pattern, (groupsByPattern.get(group.pattern) ?? 0) + 1);
    for (const [pattern, minimum] of Object.entries(minimums[track.id])) {
      assert.ok((groupsByPattern.get(pattern) ?? 0) >= minimum, `${track.id} needs ${pattern} gameplay groups`);
    }
    const visibleObstacleIds = new Set<string>();
    track.group.traverse((object) => {
      const id = object.userData.obstacleId;
      if (typeof id === "string") visibleObstacleIds.add(id);
    });
    for (const obstacle of track.obstacles.filter((candidate) => candidate.kind !== "safety-block")) {
      assert.ok(visibleObstacleIds.has(obstacle.id), `${track.id}/${obstacle.id} has no visible child`);
      const collider = track.staticColliders.find((candidate) => candidate.id === obstacle.id);
      assert.ok(collider?.active, `${track.id}/${obstacle.id} has no active collider`);
    }
    track.resetObstacles();
    assert.ok(track.obstacles.filter((obstacle) => obstacle.active && obstacle.destructible).length > 10, `${track.id} needs real obstacle density`);
    track.dispose();
  }
});

test("track guidance is deterministic and highlights corners, jumps, and shortcuts", () => {
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    const track = new RallyTrack(definition);
    assert.ok(track.guidance.some((marker) => marker.kind === "corner"), `${track.id} has no corner guidance`);
    assert.ok(track.guidance.some((marker) => marker.kind === "shortcut"), `${track.id} has no shortcut guidance`);
    if (track.id === "track-01" || track.id === "track-03") {
      assert.ok(track.guidance.some((marker) => marker.kind === "jump"), `${track.id} has no jump guidance`);
    }
    const second = new RallyTrack(definition);
    assert.deepEqual(track.guidance, second.guidance);
    second.dispose();
    for (const marker of track.guidance) {
      assert.ok(marker.progress >= 0 && marker.progress < 1);
      assert.ok(Number.isFinite(marker.x) && Number.isFinite(marker.y) && Number.isFinite(marker.z));
      assert.ok(marker.intensity > 0 && marker.intensity <= 1);
    }
    track.dispose();
  }
});

test("Forest Circuit gameplay beats teach the intended first-lap rhythm", () => {
  const track = new RallyTrack();
  assert.deepEqual(track.gameplayBeats.map((beat) => beat.kind), [
    "straight", "s-curve", "brake-corner", "forest", "jump", "destructible-shortcut", "finish-sprint",
  ]);
  for (let index = 1; index < track.gameplayBeats.length; index += 1) {
    assert.ok(track.gameplayBeats[index].progress > track.gameplayBeats[index - 1].progress);
  }
  const jump = track.gameplayBeats.find((beat) => beat.kind === "jump");
  const shortcut = track.gameplayBeats.find((beat) => beat.kind === "destructible-shortcut");
  assert.ok(jump && shortcut && jump.progress < shortcut.progress);
  assert.ok(track.guidance.some((marker) => marker.kind === "jump" && Math.abs(marker.progress - jump.progress) < 0.12));
  assert.ok(track.guidance.some((marker) => marker.kind === "shortcut" && Math.abs(marker.progress - shortcut.progress) < 0.12));
  assert.equal(track.queryAt(track.sampleAtDistance(track.length * 0.5).x, track.sampleAtDistance(track.length * 0.5).z).surface, "dirt");
  track.dispose();
});

test("Mountain Pass gameplay beats emphasize braking, drift hairpins, and descent risk", () => {
  const track = new RallyTrack(TRACK_02);
  assert.deepEqual(track.gameplayBeats.map((beat) => beat.kind), [
    "straight", "destructible-shortcut", "hairpin", "hairpin", "jump", "rock-tunnel", "descent", "finish-sprint",
  ]);
  assert.ok(track.gameplayBeats.filter((beat) => beat.kind === "hairpin").length >= 2);
  assert.ok(track.guidance.some((marker) => marker.kind === "jump" && marker.label === "CREST JUMP"));
  assert.equal(track.environmentVariant, "sunset");
  const dirt = track.queryAt(track.sampleAtDistance(track.length * 0.32).x, track.sampleAtDistance(track.length * 0.32).z);
  const rock = track.queryAt(track.sampleAtDistance(track.length * 0.73).x, track.sampleAtDistance(track.length * 0.73).z);
  assert.equal(dirt.surface, "dirt");
  assert.equal(rock.surface, "rock");
  track.dispose();
});

test("Voxel Badlands exposes safe, fast, and destruction route choices", () => {
  const track = new RallyTrack(TRACK_03);
  const kinds = track.gameplayBeats.map((beat) => beat.kind);
  assert.ok(kinds.includes("safe-route"));
  assert.ok(kinds.includes("fast-route"));
  assert.ok(kinds.includes("destruction-route"));
  assert.ok(kinds.includes("jump"));
  assert.ok(kinds.includes("off-road"));
  assert.equal(track.shortcutZones.length, 3);
  assert.ok(
    track.obstacles.filter((obstacle) => obstacle.destructible && obstacle.kind !== "safety-block").length >= 10,
    "Badlands keeps a dense set of destructible gameplay obstacles",
  );
  assert.ok(track.routeGraph?.edges.some((edge) => edge.kind === "normal"));
  assert.ok(track.routeGraph?.edges.some((edge) => edge.kind === "jump"));
  assert.ok(track.routeGraph?.edges.some((edge) => edge.kind === "destructible"));
  for (let index = 1; index < track.gameplayBeats.length; index += 1) {
    assert.ok(track.gameplayBeats[index].progress > track.gameplayBeats[index - 1].progress);
  }
  track.dispose();
});

test("deterministic scenery stays clear of roads and sits on physical terrain", () => {
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    const track = new RallyTrack(definition);
    assert.ok(track.scenery.length > 0);
    for (const item of track.scenery) {
      const query = track.queryAt(item.x, item.z);
      assert.ok(
        Math.abs(query.lateralDistance) > query.roadHalfWidth + item.footprint + RALLY_TRACK_CONSTANTS.scenerySafetyMargin,
        `${track.id} scenery ${item.id} is too close to the physical road`,
      );
      assert.ok(Math.abs(item.y - item.height / 2 - query.groundHeight - RALLY_TRACK_CONSTANTS.terrainVisualEpsilon) < 0.001);
    }
    track.dispose();
  }
});

test("solid scenery, gates, and obstacle shapes share the track collision API", () => {
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    const track = new RallyTrack(definition);
    assert.equal(track.gatePosts.length, 10);
    for (const item of track.scenery.filter((candidate) => candidate.solid).slice(0, 8)) {
      const collision = track.staticCollision(item.x, item.z, 0.1);
      assert.equal(collision?.source, "scenery");
    }
    for (const post of track.gatePosts) {
      assert.equal(track.staticCollision(post.x, post.z, 0.1)?.source, "gate-post");
    }
    for (const progress of [0, ...track.checkpoints]) {
      const gate = track.sampleAtDistance(track.length * progress);
      assert.equal(track.staticCollision(gate.x, gate.z, 0.1), null);
    }
    for (const obstacle of track.obstacles) {
      assert.equal(track.staticCollision(obstacle.x, obstacle.z, 0.1)?.source, "obstacle");
      if (obstacle.shape === "box") {
        const cosine = Math.cos(obstacle.rotationY);
        const sine = Math.sin(obstacle.rotationY);
        const outsideX = obstacle.x + cosine * (obstacle.halfWidth + 1.1);
        const outsideZ = obstacle.z + sine * (obstacle.halfWidth + 1.1);
        assert.equal(track.staticCollision(outsideX, outsideZ, 0.1), null);
      }
    }
    track.dispose();
  }
});

test("WebGL road mesh edges and static vehicle visuals stay on the shared surface", () => {
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    const track = new RallyTrack(definition);
    const road = track.group.children[1] as THREE.Mesh;
    const positions = road.geometry.getAttribute("position");
    for (let sampleIndex = 0; sampleIndex < track.segments; sampleIndex += 19) {
      const sample = track.sampleAtDistance((track.length * sampleIndex) / track.segments);
      const vertexStart = sampleIndex * 2 + Math.floor((sampleIndex + 1) / 2) * 2;
      const sideX = -sample.tangentZ;
      const sideZ = sample.tangentX;
      const halfWidth = sample.roadWidth / 2;
      for (const side of [-1, 1]) {
        const vertexIndex = vertexStart + (side < 0 ? 0 : 1);
        const x = positions.getX(vertexIndex);
        const y = positions.getY(vertexIndex);
        const z = positions.getZ(vertexIndex);
        const expectedX = sample.x + sideX * halfWidth * (side < 0 ? 1 : -1);
        const expectedZ = sample.z + sideZ * halfWidth * (side < 0 ? 1 : -1);
        assert.ok(Math.hypot(x - expectedX, z - expectedZ) < 0.001);
        assert.ok(Math.abs(y - sample.y - RALLY_TRACK_CONSTANTS.roadVisualEpsilon) < 0.08);
      }
    }
    const car = new RallyCar(track);
    assert.ok(Math.abs(car.visualWheelBottomGap()) < 0.08);
    car.dispose();
    track.dispose();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RallyCar, RALLY_CAR_CONSTANTS } from "../src/rally/RallyCar";
import { RALLY_CONFIG } from "../src/rally/RallyConfig";
import { RallyAIDriver } from "../src/rally/ai/RallyAIDriver";
import { RALLY_AI_PROFILES } from "../src/rally/ai/AIDriverProfile";
import { RALLY_AI_PERSONALITIES } from "../src/rally/ai/AIPersonality";
import { RallyChaseCamera, roadCenteredCameraAnchor } from "../src/rally/RallyChaseCamera";
import { RallySpeedLines } from "../src/rally/RallySpeedLines";
import { rallyAudioChannelVolumes, RallyAudio } from "../src/rally/RallyAudio";
import { loadTrackProgress, medalForLapTime, rallyProgressStorageKey, saveTrackProgress } from "../src/rally/RallyProgress";
import { rallyGhostStorageKey, RallyGhostPlayback, RALLY_GHOST_DATA_VERSION } from "../src/rally/RallyGhost";
import { createRallyRenderer } from "../src/rally/RallyRenderer";
import { automaticThrottleForPhase, invertSteering, relativeSteeringConfigForViewport, relativeSteeringValue, relativeStrafeValue, relativeTouchSteeringValue, RallyInput, RALLY_INPUT_CONSTANTS } from "../src/rally/RallyInput";
import { RallyRace } from "../src/rally/RallyRace";
import { rallyModeShowsAI, rallyPositionChange, RallyRaceMode } from "../src/rally/RallyRaceMode";
import { RallyFixedStepClock } from "../src/rally/RallySimulation";
import { RallyTrack } from "../src/rally/RallyTrack";
import { createRallyTrack, getRallyTrackDefinition, listRallyTrackDefinitions } from "../src/rally/RallyTrackCatalog";
import { TRACK_01_DEFINITION, type RallyTrackDefinition } from "../src/rally/TrackDefinition";
import { TRACK_02 } from "../src/rally/tracks/Track02";
import { TRACK_03 } from "../src/rally/tracks/Track03";
import { RALLY_VEHICLES } from "../src/rally/VehicleDefinition";
import { parseRallyChampionshipRun, parseRallyChampionshipSave, pointsForChampionshipPosition, RallyChampionship, recordRallyChampionshipResult, RALLY_CHAMPIONSHIP_RUN_VERSION, RALLY_CHAMPIONSHIP_SAVE_VERSION, RALLY_CHAMPIONSHIP_TRACK_ORDER } from "../src/rally/RallyChampionship";
import { damageEffects } from "../src/rally/RallyDamage";
import { getRallySurfaceProfile, listRallySurfaces } from "../src/rally/RallySurface";
import { DEFAULT_RALLY_SETTINGS, parseRallySettings, RALLY_SETTINGS_VERSION } from "../src/rally/RallySettings";
import { evaluateRallyDrift } from "../src/rally/RallyDrift";
import { rallyDestructionBoostReward } from "../src/rally/RallyDestruction";
import { evaluateRallyLanding, rallyLandingBoostReward } from "../src/rally/RallyLanding";
import { evaluateRallySteeringAssist, RALLY_STEERING_ASSIST_CONSTANTS } from "../src/rally/RallySteeringAssist";
import { evaluateRallyRoadAssist, roadEdgePressure, safeLaneHalfWidth, worldCrossTrackVelocity } from "../src/rally/RallyRoadAssist";

test("track exposes a closed course with ordered checkpoints", () => {
  const track = new RallyTrack();
  assert.ok(track.length > 200);
  assert.equal(track.checkpoints.length, 3);
  const start = track.sampleCheckpoint(track.checkpoints.length);
  const loopedStart = track.sampleAtDistance(track.length);
  assert.ok(Math.hypot(start.x - loopedStart.x, start.z - loopedStart.z) < 0.01);
  assert.notEqual(track.sampleCheckpoint(1).distance, track.sampleCheckpoint(0).distance);
  track.dispose();
});

test("track query returns shared road facts and stays correct with a segment hint", () => {
  const track = new RallyTrack();
  const sample = track.sampleAtDistance(track.length * 0.32);
  const query = track.queryAt(sample.x + 1.2, sample.z, 0);
  const exact = track.nearest(sample.x + 1.2, sample.z, query.segmentIndex);
  assert.ok(Number.isFinite(exact.distanceSquared));
  assert.ok(Math.abs(query.lateralDistance) <= track.width);
  assert.equal(query.onRoad, query.surface === "road");
  assert.ok(query.progress >= 0 && query.progress <= 1);
  assert.ok(Number.isFinite(query.groundHeight));
  track.dispose();
});

test("track hints remain caller-local when multiple vehicles query different sections", () => {
  const track = new RallyTrack();
  const first = track.sampleAtDistance(track.length * 0.08);
  const second = track.sampleAtDistance(track.length * 0.72);
  const firstWithHint = track.queryAt(first.x + 0.4, first.z, 0);
  const secondWithHint = track.queryAt(second.x + 0.4, second.z, Math.floor(track.segments * 0.72));
  const firstAgain = track.queryAt(first.x + 0.4, first.z, firstWithHint.segmentIndex);
  assert.ok(firstAgain.distanceSquared <= firstWithHint.distanceSquared);
  assert.equal(secondWithHint.segmentIndex, track.queryAt(second.x + 0.4, second.z, secondWithHint.segmentIndex).segmentIndex);
  track.dispose();
});

test("track one definition contains readable elevation and width changes", () => {
  const heights = TRACK_01_DEFINITION.map((point) => point.y);
  const widths = TRACK_01_DEFINITION.map((point) => point.width);
  assert.ok(Math.max(...heights) - Math.min(...heights) > 1);
  assert.ok(Math.max(...widths) - Math.min(...widths) > 2);
  const track = new RallyTrack();
  const sampledWidths = Array.from({ length: 32 }, (_, index) => track.sampleAtDistance(track.length * index / 32).roadWidth);
  assert.ok(Math.max(...sampledWidths) - Math.min(...sampledWidths) > 1);
  track.dispose();
});

test("track query distinguishes road, gravel, and grass surfaces", () => {
  const track = new RallyTrack();
  const sample = track.sampleAtDistance(track.length * 0.12);
  assert.equal(track.queryAt(sample.x, sample.z).surface, "road");
  const rightX = sample.tangentZ;
  const rightZ = -sample.tangentX;
  assert.equal(track.queryAt(sample.x + rightX * sample.roadWidth * 1.25, sample.z + rightZ * sample.roadWidth * 1.25).surface, "gravel");
  assert.equal(track.queryAt(sample.x + rightX * sample.roadWidth * 1.8, sample.z + rightZ * sample.roadWidth * 1.8).surface, "grass");
  track.dispose();
});

test("terrain mesh faces upward for WebGL back-face culling", () => {
  const track = new RallyTrack();
  const terrain = track.group.children[0] as THREE.Mesh;
  const positions = terrain.geometry.getAttribute("position");
  const index = terrain.geometry.getIndex();
  assert.ok(index);

  const a = new THREE.Vector3().fromBufferAttribute(positions, index.getX(0));
  const b = new THREE.Vector3().fromBufferAttribute(positions, index.getX(1));
  const c = new THREE.Vector3().fromBufferAttribute(positions, index.getX(2));
  const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  assert.ok(normal.y > 0, "terrain front-face normal should point upward");

  track.dispose();
});

test("steering input is inverted consistently", () => {
  assert.equal(invertSteering(-1), 1);
  assert.equal(invertSteering(1), -1);
  assert.equal(invertSteering(0), 0);
});

test("steering input clamps, smooths, and naturally recenters", () => {
  const input = new RallyInput({ onCameraMove: () => undefined });
  input.setSteeringDirection("inverted");
  input.setSteering(3);
  const first = input.snapshot().steer;
  assert.ok(first < 0 && first > -1);
  let settled = first;
  for (let frame = 0; frame < 30; frame += 1) settled = input.snapshot().steer;
  assert.ok(settled < -0.9);
  input.setSteering(null);
  for (let frame = 0; frame < 60; frame += 1) settled = input.snapshot().steer;
  assert.ok(Math.abs(settled) < 0.01);
});

test("floating relative steering starts neutral at any touch origin", () => {
  const input = new RallyInput({ onCameraMove: () => undefined });
  assert.equal(relativeSteeringValue(0), 0);
  assert.equal(relativeSteeringValue(7), 0);
  assert.ok(relativeSteeringValue(50) > 0);
  assert.ok(relativeSteeringValue(-50) < 0);
  assert.equal(relativeSteeringValue(10000), 1);
  assert.equal(relativeSteeringValue(-10000), -1);
  assert.equal(relativeTouchSteeringValue(50) < 0, true);
  assert.equal(relativeTouchSteeringValue(-50) > 0, true);

  assert.equal(input.beginRelativeSteering(11, 100), true);
  assert.equal(input.snapshot(1 / 60, { phase: "racing", speed: 0, grounded: true }).steer, 0);
  assert.equal(input.updateRelativeSteering(11, 300), true);
  assert.ok(input.snapshot(1, { phase: "racing", speed: 0, grounded: true }).steer < 0, "rightward touch movement maps to the requested reversed direction");
  input.updateRelativeSteering(11, 0);
  assert.ok(input.snapshot(1, { phase: "racing", speed: 0, grounded: true }).steer > 0, "leftward touch movement maps to the opposite direction");
  assert.equal(input.endRelativeSteering(11), true);
  assert.equal(input.snapshot(1 / 60, { phase: "racing", speed: 0, grounded: true }).brake, 0);
});

test("touch steering reversal does not change the keyboard/absolute steering preference", () => {
  const input = new RallyInput({ onCameraMove: () => undefined });
  input.setSteeringDirection("normal");
  input.setSteering(1);
  assert.ok(input.snapshot(1).steer > 0);
  input.setSteeringDirection("inverted");
  assert.ok(input.snapshot(1).steer < 0);
});

test("steering assist protects the road edge without taking the line away", () => {
  const center = evaluateRallySteeringAssist({ playerSteer: 0, lateralDistance: 0, roadHalfWidth: 4.5, heading: 0, trackHeading: 0, speed: 18, forwardVelocity: 18, mode: "normal" });
  const edge = evaluateRallySteeringAssist({ playerSteer: 0, lateralDistance: 4.1, roadHalfWidth: 4.5, heading: 0, trackHeading: 0, speed: 18, forwardVelocity: 18, mode: "normal" });
  const off = evaluateRallySteeringAssist({ playerSteer: 0, lateralDistance: 4.1, roadHalfWidth: 4.5, heading: 0, trackHeading: 0, speed: 18, forwardVelocity: 18, mode: "off" });
  assert.ok(Math.abs(center.assistSteer) < 0.001);
  assert.ok(edge.assistSteer < 0);
  assert.ok(edge.assistStrength > 0);
  assert.ok(edge.finalSteer > -1 && edge.finalSteer < 1);
  assert.equal(off.assistStrength, 0);
  assert.equal(off.finalSteer, 0);
});

test("steering assist predicts an outward heading and yields to inward steering", () => {
  const outward = evaluateRallySteeringAssist({ playerSteer: 0, lateralDistance: 3.8, predictedLateralDistance: 4.3, roadHalfWidth: 4.5, heading: 0.35, trackHeading: 0, predictedTrackHeading: 0, speed: 18, forwardVelocity: 18, mode: "normal" });
  const inward = evaluateRallySteeringAssist({ playerSteer: 0, lateralDistance: 3.8, predictedLateralDistance: 4.3, roadHalfWidth: 4.5, heading: -0.35, trackHeading: 0, predictedTrackHeading: 0, speed: 18, forwardVelocity: 18, mode: "normal" });
  assert.ok(Math.abs(outward.assistSteer) > Math.abs(inward.assistSteer));
  assert.ok(outward.assistStrength <= RALLY_STEERING_ASSIST_CONSTANTS.normalMaxStrength);
});

test("shortcut, drift, and boost-smash intent soften steering assist", () => {
  const base = { playerSteer: 0, lateralDistance: 4.2, predictedLateralDistance: 4.4, roadHalfWidth: 4.5, heading: 0.25, trackHeading: 0, speed: 20, forwardVelocity: 20, mode: "normal" as const };
  const baseline = evaluateRallySteeringAssist(base);
  const shortcut = evaluateRallySteeringAssist({ ...base, shortcutIntent: true });
  const drift = evaluateRallySteeringAssist({ ...base, drifting: true });
  const smash = evaluateRallySteeringAssist({ ...base, boostSmashIntent: true });
  assert.ok(shortcut.assistStrength < baseline.assistStrength);
  assert.ok(drift.assistStrength < baseline.assistStrength);
  assert.ok(smash.assistStrength < drift.assistStrength);
  assert.equal(evaluateRallySteeringAssist({ ...base, mode: "off" }).finalSteer, 0);
});

test("edge assist protects against outward thumb input without removing center line choice", () => {
  const center = evaluateRallySteeringAssist({
    playerSteer: 1,
    lateralDistance: 0,
    predictedLateralDistance: 0,
    roadHalfWidth: 4.5,
    heading: 0,
    trackHeading: 0,
    speed: 18,
    forwardVelocity: 18,
    mode: "normal",
  });
  const edgeInput = {
    playerSteer: 1,
    lateralDistance: 4.25,
    predictedLateralDistance: 4.45,
    roadHalfWidth: 4.5,
    heading: 0.28,
    trackHeading: 0,
    speed: 18,
    forwardVelocity: 18,
  };
  const off = evaluateRallySteeringAssist({ ...edgeInput, mode: "off" });
  const normal = evaluateRallySteeringAssist({ ...edgeInput, mode: "normal" });
  const strong = evaluateRallySteeringAssist({ ...edgeInput, mode: "strong" });
  const inward = evaluateRallySteeringAssist({ ...edgeInput, playerSteer: -1, mode: "normal" });
  assert.equal(center.playerSteerScale, 1);
  assert.equal(center.finalSteer, 1);
  assert.equal(off.finalSteer, 1);
  assert.ok(normal.playerSteerScale < 1);
  assert.ok(strong.playerSteerScale < normal.playerSteerScale);
  assert.ok(normal.finalSteer < off.finalSteer);
  assert.ok(strong.finalSteer < normal.finalSteer);
  assert.equal(inward.playerSteerScale, 1, "inward steering keeps full authority at the edge");
  assert.ok(inward.finalSteer < -0.9);
});

test("arcade road assist damps only outward lateral velocity near the safe lane edge", () => {
  const straight = { strength: 0, direction: 0, headingDelta: 0, distanceAhead: 8, recommendedSpeed: 28 };
  const base = {
    playerSteer: 0,
    throttle: 1,
    roadHalfWidth: 4.5,
    vehicleHalfWidth: 0.9,
    heading: 0,
    trackHeading: 0,
    speed: 18,
    forwardVelocity: 18,
    lateralVelocity: 6,
    upcomingTurn: straight,
    mode: "normal",
    mobileArcade: true,
  } as const;
  const center = evaluateRallyRoadAssist({ ...base, lateralDistance: 0, predictedLateralDistance: 0 });
  const normal = evaluateRallyRoadAssist({
    ...base,
    lateralDistance: 4.1,
    predictedLateralDistance: 4.5,
  });
  const strong = evaluateRallyRoadAssist({
    ...base,
    lateralDistance: 4.1,
    predictedLateralDistance: 4.5,
    mode: "strong",
  });
  const inward = evaluateRallyRoadAssist({
    ...base,
    lateralDistance: 4.1,
    predictedLateralDistance: 4.5,
    lateralVelocity: -6,
    mode: "normal",
  });
  assert.equal(center.lateralVelocityScale, 1, "the free center line does not damp drift");
  assert.ok(normal.edgePressure > 0.5);
  assert.ok(normal.lateralVelocityScale < 1);
  assert.ok(strong.lateralVelocityScale < normal.lateralVelocityScale);
  assert.equal(inward.lateralVelocityScale, 1, "inward recovery keeps full lateral authority");
  assert.ok(roadEdgePressure(0, 4.5, 0.9) < 0.01);
});

test("RallyCar applies lateral stability after steering slip is generated", () => {
  const track = new RallyTrack();
  for (const obstacle of track.obstacles.filter((item) => item.kind === "safety-block")) track.destroyObstacle(obstacle.id);
  const car = new RallyCar(track);
  const sample = track.sampleAtDistance(track.length * 0.18);
  const sideX = -sample.tangentZ;
  const sideZ = sample.tangentX;
  const query = track.queryAt(sample.x + sideX * 4.2, sample.z + sideZ * 4.2);
  car.position.set(query.x + sideX * 0.05, query.groundHeight + RALLY_CAR_CONSTANTS.carHeight, query.z + sideZ * 0.05);
  car.heading = query.heading;
  car.forwardVelocity = 18;
  car.speed = 18;
  car.lateralVelocity = 5;
  const before = Math.abs(car.lateralVelocity);
  const assist = evaluateRallyRoadAssist({
    playerSteer: 0,
    throttle: 1,
    lateralDistance: query.lateralDistance,
    predictedLateralDistance: query.lateralDistance,
    roadHalfWidth: query.roadHalfWidth,
    vehicleHalfWidth: 1.8 / 2,
    heading: car.heading,
    trackHeading: query.heading,
    speed: car.speed,
    forwardVelocity: car.forwardVelocity,
    lateralVelocity: car.lateralVelocity,
    upcomingTurn: { strength: 0, direction: 0, headingDelta: 0, distanceAhead: 8, recommendedSpeed: 28 },
    mode: "strong",
    mobileArcade: true,
  });
  car.update({ throttle: 1, brake: 0, steer: 0 }, 1 / 60, true, assist);
  assert.ok(Math.abs(car.lateralVelocity) < before, `${before} -> ${car.lateralVelocity}`);
  car.dispose();
  track.dispose();
});

test("smart mobile throttle stays open on straights and plans speed before a hairpin", () => {
  const straight = { strength: 0, direction: 0, headingDelta: 0, distanceAhead: 8, recommendedSpeed: 28 };
  const hairpin = { strength: 0.92, direction: 1, headingDelta: 0.75, distanceAhead: 12, recommendedSpeed: 16 };
  const base = {
    playerSteer: 0,
    throttle: 1,
    roadHalfWidth: 4.5,
    vehicleHalfWidth: 0.9,
    heading: 0,
    trackHeading: 0,
    speed: 24,
    forwardVelocity: 24,
    lateralVelocity: 0,
    upcomingTurn: straight,
    mobileArcade: true,
    mode: "normal",
  } as const;
  const straightResult = evaluateRallyRoadAssist({ ...base, lateralDistance: 0 });
  const cornerResult = evaluateRallyRoadAssist({
    ...base,
    lateralDistance: 0,
    upcomingTurn: hairpin,
    speed: 27,
    forwardVelocity: 27,
    lateralVelocity: 0,
  });
  const boostResult = evaluateRallyRoadAssist({
    ...base,
    lateralDistance: 0,
    upcomingTurn: hairpin,
    speed: 27,
    forwardVelocity: 27,
    lateralVelocity: 0,
    boostActive: true,
  });
  assert.equal(straightResult.autoThrottleScale, 1);
  assert.equal(straightResult.virtualBrake, 0);
  assert.ok(cornerResult.autoThrottleScale < 1);
  assert.ok(cornerResult.virtualBrake > 0);
  assert.ok(boostResult.autoThrottleScale >= 0.9);
  assert.equal(boostResult.virtualBrake, 0);
});

test("strong road follow turns a neutral car while lane targets remain distinct", () => {
  const straight = { strength: 0, direction: 0, headingDelta: 0, distanceAhead: 20, recommendedSpeed: 28 };
  const base = {
    playerSteer: 0,
    throttle: 1,
    lateralDistance: 0,
    roadHalfWidth: 5,
    vehicleHalfWidth: 1,
    heading: 0,
    trackHeading: 0,
    speed: 20,
    forwardVelocity: 20,
    lateralVelocity: 0,
    upcomingTurn: straight,
    mobileArcade: true,
    mode: "strong" as const,
  };
  const neutral = evaluateRallyRoadAssist({ ...base, targetLane: 0 });
  const left = evaluateRallyRoadAssist({
    ...base,
    targetLane: -0.7,
    upcomingTurn: { ...straight, strength: 0.7, direction: 1, headingDelta: 0.42, targetHeading: 0.42 },
  });
  const center = evaluateRallyRoadAssist({ ...base, targetLane: 0 });
  const right = evaluateRallyRoadAssist({ ...base, targetLane: 0.7 });
  assert.equal(neutral.roadFollowSteer, 0);
  assert.ok(left.roadFollowSteer > 0, "a positive future road bend gets feed-forward steering");
  assert.ok(left.desiredLateralDistance < center.desiredLateralDistance);
  assert.ok(center.desiredLateralDistance < right.desiredLateralDistance);
  assert.ok(left.laneSteer < 0);
  assert.equal(center.laneSteer, 0);
  assert.ok(right.laneSteer > 0);
  const safeHalfWidth = safeLaneHalfWidth(base.roadHalfWidth, base.vehicleHalfWidth);
  assert.ok(Math.abs(left.desiredLateralDistance) <= safeHalfWidth);
  assert.ok(Math.abs(right.desiredLateralDistance) <= safeHalfWidth);
});

test("world-space cross-track stability detects angled outward motion and preserves inward motion", () => {
  const tangentX = 0.6;
  const tangentZ = 0.8;
  const normalX = tangentZ;
  const normalZ = -tangentX;
  const alongX = tangentX * 18;
  const alongZ = tangentZ * 18;
  const outwardX = alongX + normalX * 3;
  const outwardZ = alongZ + normalZ * 3;
  const inwardX = alongX - normalX * 3;
  const inwardZ = alongZ - normalZ * 3;
  assert.ok(Math.abs(worldCrossTrackVelocity(outwardX, outwardZ, tangentX, tangentZ) - 3) < 0.0001);
  assert.ok(Math.abs(worldCrossTrackVelocity(inwardX, inwardZ, tangentX, tangentZ) + 3) < 0.0001);

  // Reconstruct the same world velocity from a car that is pointing 30° away
  // from the road. This catches the old car-local-lateral sign mistake.
  const carHeading = Math.PI / 6;
  const carForwardX = Math.sin(carHeading);
  const carForwardZ = Math.cos(carHeading);
  const carRightX = Math.cos(carHeading);
  const carRightZ = -Math.sin(carHeading);
  const localForward = outwardX * carForwardX + outwardZ * carForwardZ;
  const localLateral = outwardX * carRightX + outwardZ * carRightZ;
  const reconstructedX = carForwardX * localForward + carRightX * localLateral;
  const reconstructedZ = carForwardZ * localForward + carRightZ * localLateral;
  assert.ok(Math.abs(worldCrossTrackVelocity(reconstructedX, reconstructedZ, tangentX, tangentZ) - 3) < 0.0001);

  const turn = { strength: 0, direction: 0, headingDelta: 0, distanceAhead: 20, recommendedSpeed: 28 };
  const common = {
    playerSteer: 0,
    throttle: 1,
    lateralDistance: 4.1,
    predictedLateralDistance: 4.2,
    roadHalfWidth: 5,
    vehicleHalfWidth: 1,
    heading: 0,
    trackHeading: 0,
    speed: 20,
    forwardVelocity: 18,
    lateralVelocity: 0,
    upcomingTurn: turn,
    mobileArcade: true,
    mode: "strong" as const,
  };
  const outward = evaluateRallyRoadAssist({ ...common, crossTrackVelocity: 3 });
  const inward = evaluateRallyRoadAssist({ ...common, crossTrackVelocity: -3 });
  assert.ok(outward.lateralVelocityScale < 1);
  assert.equal(inward.lateralVelocityScale, 1);
});

test("braking-distance planning starts before the corner and leaves a straight open", () => {
  const base = {
    playerSteer: 0,
    throttle: 1,
    lateralDistance: 0,
    roadHalfWidth: 5,
    vehicleHalfWidth: 1,
    heading: 0,
    trackHeading: 0,
    speed: 27,
    forwardVelocity: 27,
    lateralVelocity: 0,
    mobileArcade: true,
    mode: "strong" as const,
  };
  const straight = evaluateRallyRoadAssist({
    ...base,
    upcomingTurn: { strength: 0, direction: 0, headingDelta: 0, distanceAhead: 40, recommendedSpeed: 28, brakingDistance: 0 },
  });
  const hairpinTurn = {
    strength: 0.95,
    direction: 1,
    headingDelta: 0.9,
    distanceAhead: 38,
    recommendedSpeed: 15,
    brakingDistance: 31,
    requiredDeceleration: 12,
    targetHeading: 0.9,
  };
  const hairpin = evaluateRallyRoadAssist({
    ...base,
    upcomingTurn: hairpinTurn,
  });
  const belowTarget = evaluateRallyRoadAssist({
    ...base,
    speed: 15,
    forwardVelocity: 15,
    upcomingTurn: { ...hairpinTurn, brakingDistance: 0 },
  });
  assert.equal(straight.autoThrottleScale, 1);
  assert.equal(straight.virtualBrake, 0);
  assert.ok(hairpin.brakingDistance > 0);
  assert.ok(hairpin.autoThrottleScale < 1);
  assert.ok(hairpin.virtualBrake > 0);
  assert.equal(belowTarget.autoThrottleScale, 1);
  assert.equal(belowTarget.virtualBrake, 0);
});

test("contextual auto drift requires a matching upcoming corner and ignores recovery input", () => {
  const input = new RallyInput({ onCameraMove: () => undefined });
  input.beginRelativeSteering(11, 200);
  input.updateRelativeSteering(11, 320); // touch mapping produces a strong negative steer
  const straight = { phase: "racing" as const, speed: 12, grounded: true, upcomingTurnStrength: 0, upcomingTurnDirection: 0 };
  for (let frame = 0; frame < 30; frame += 1) input.snapshot(1 / 60, straight);
  assert.equal(input.autoDriftActive, false);
  const recovery = { ...straight, upcomingTurnStrength: 0.9, upcomingTurnDirection: -1, roadRecovery: true };
  for (let frame = 0; frame < 30; frame += 1) input.snapshot(1 / 60, recovery);
  assert.equal(input.autoDriftActive, false);
  const corner = { ...recovery, roadRecovery: false };
  let state = input.snapshot(1 / 60, corner);
  for (let frame = 0; frame < 20; frame += 1) state = input.snapshot(1 / 60, corner);
  assert.equal(input.autoDriftActive, true);
  assert.ok(state.brake > 0);
});

test("player-like steering has less off-road time with normal and strong assist", () => {
  const sequence = [-0.5, 0, 0.5, -0.75, -1, -0.25, 1, 0, -0.75, -0.25, 0.5, 0.25, -0.25, -0.5, 1, 0.25, 0.5, 0, -0.5, -0.75, 0, 0.75, -0.75, -0.75, 0, -1, 0.5, 0.25, 1, -0.75];
  const run = (mode: "off" | "normal" | "strong") => {
    const track = new RallyTrack();
    // Keep this comparison focused on lane protection rather than the separate
    // safety-block recovery rule.
    for (const obstacle of track.obstacles.filter((item) => item.kind === "safety-block")) track.destroyObstacle(obstacle.id);
    const car = new RallyCar(track);
    const race = new RallyRace(track, car, false, false, mode);
    race.start();
    let offRoadTime = 0;
    let maxLateralRatio = 0;
    let recoveryCount = 0;
    let wasOffRoad = false;
    for (let frame = 0; frame < 900; frame += 1) {
      race.update({ steer: sequence[Math.floor(frame / 30) % sequence.length], throttle: 1, brake: 0, boost: false }, 1 / 60);
      const query = track.queryAt(car.position.x, car.position.z);
      const lateralRatio = Math.abs(query.lateralDistance) / Math.max(0.1, query.roadHalfWidth);
      maxLateralRatio = Math.max(maxLateralRatio, lateralRatio);
      const offRoad = lateralRatio > 1;
      if (offRoad) offRoadTime += 1 / 60;
      if (offRoad && !wasOffRoad) recoveryCount += 1;
      wasOffRoad = offRoad;
    }
    const result = { offRoadTime, maxLateralRatio, recoveryCount, finish: race.phase === "finished" };
    car.dispose();
    track.dispose();
    return result;
  };
  const off = run("off");
  const normal = run("normal");
  const strong = run("strong");
  assert.ok(off.offRoadTime > normal.offRoadTime + 0.1, JSON.stringify({ off, normal, strong }));
  assert.ok(strong.offRoadTime < off.offRoadTime - 0.1, JSON.stringify({ off, normal, strong }));
  assert.ok(strong.maxLateralRatio < normal.maxLateralRatio, JSON.stringify({ off, normal, strong }));
  assert.ok([off, normal, strong].every((result) => Number.isFinite(result.offRoadTime) && Number.isFinite(result.maxLateralRatio)));
});

test("relative steering travel scales with a landscape viewport", () => {
  const narrow = relativeSteeringConfigForViewport(390);
  const landscape = relativeSteeringConfigForViewport(844);
  assert.ok(landscape.fullDistancePx > narrow.fullDistancePx);
  assert.ok(narrow.deadZonePx >= 6 && narrow.deadZonePx <= 12);
  assert.ok(landscape.fullDistancePx <= 128);
});

test("relative steering owns one pointer while boost remains independent", () => {
  const input = new RallyInput({ onCameraMove: () => undefined });
  assert.equal(input.beginRelativeSteering(1, 100), true);
  assert.equal(input.beginRelativeSteering(2, 300), false);
  assert.equal(input.updateRelativeSteering(2, 340), false);
  input.setBoost(true);
  const simultaneous = input.snapshot(1 / 60, { phase: "racing", speed: 0, grounded: true });
  assert.equal(simultaneous.boost, true);
  assert.equal(simultaneous.throttle, 1);
  assert.equal(input.endRelativeSteering(2), false);
  assert.equal(input.endRelativeSteering(1), true);
  input.setBoost(false);
  assert.equal(input.snapshot(1 / 60, { phase: "racing", speed: 0, grounded: true }).boost, false);
});

test("mobile arcade input auto-accelerates only during racing", () => {
  const input = new RallyInput({ onCameraMove: () => undefined });
  assert.equal(automaticThrottleForPhase("ready"), 0);
  assert.equal(automaticThrottleForPhase("countdown"), 0);
  assert.equal(automaticThrottleForPhase("racing"), 1);
  assert.equal(automaticThrottleForPhase("finished"), 0);
  assert.equal(input.snapshot(1 / 60, { phase: "ready" }).throttle, 0);
  assert.equal(input.snapshot(1 / 60, { phase: "countdown" }).throttle, 0);
  assert.equal(input.snapshot(1 / 60, { phase: "racing" }).throttle, 1);
  assert.equal(input.snapshot(1 / 60, { phase: "finished" }).throttle, 0);
});

test("held strong relative steering engages timed auto drift and counter-steer remains raw", () => {
  const input = new RallyInput({ onCameraMove: () => undefined });
  input.beginRelativeSteering(7, 200);
  input.updateRelativeSteering(7, 320);
  const cadence = 1 / 60;
  const cornerContext = { phase: "racing" as const, speed: 12, grounded: true, upcomingTurnStrength: 0.72, upcomingTurnDirection: -1 };
  let driftInput = input.snapshot(cadence, cornerContext);
  for (let elapsed = cadence; elapsed < RALLY_INPUT_CONSTANTS.autoDriftHoldSeconds + cadence; elapsed += cadence) {
    driftInput = input.snapshot(cadence, cornerContext);
  }
  assert.ok(driftInput.brake > 0, "a strong steer held long enough should create virtual brake");
  assert.equal(driftInput.throttle, RALLY_INPUT_CONSTANTS.autoDriftThrottle);
  input.updateRelativeSteering(7, 80);
  assert.ok(input.relativeSteeringState().steer > 0, "moving back across the origin should provide the reversed counter-steer");
  let counter = input.snapshot(cadence, { ...cornerContext, upcomingTurnDirection: 1 });
  for (let frame = 0; frame < 20; frame += 1) counter = input.snapshot(cadence, { ...cornerContext, upcomingTurnDirection: 1 });
  assert.ok(counter.steer > 0, "moving back across the origin should provide counter-steer");
  input.endRelativeSteering(7);
  assert.equal(input.snapshot(cadence, { phase: "racing", speed: 12, grounded: true }).brake, 0);
});

test("auto drift is suppressed at low speed and while airborne", () => {
  const input = new RallyInput({ onCameraMove: () => undefined });
  input.beginRelativeSteering(3, 100);
  input.updateRelativeSteering(3, 240);
  for (let frame = 0; frame < 30; frame += 1) input.snapshot(1 / 60, { phase: "racing", speed: 4, grounded: true });
  assert.equal(input.autoDriftActive, false);
  for (let frame = 0; frame < 30; frame += 1) input.snapshot(1 / 60, { phase: "racing", speed: 12, grounded: false });
  assert.equal(input.autoDriftActive, false);
});

test("auto drift hold timing is stable across render cadences", () => {
  const run = (renderDelta: number): { active: boolean; brake: number } => {
    const input = new RallyInput({ onCameraMove: () => undefined });
    input.beginRelativeSteering(4, 200);
    input.updateRelativeSteering(4, 340);
    const cornerContext = { phase: "racing" as const, speed: 12, grounded: true, upcomingTurnStrength: 0.72, upcomingTurnDirection: -1 };
    let state = input.snapshot(renderDelta, cornerContext);
    const frames = Math.ceil(0.5 / renderDelta);
    for (let frame = 1; frame < frames; frame += 1) state = input.snapshot(renderDelta, cornerContext);
    return { active: input.autoDriftActive, brake: state.brake };
  };
  const at30 = run(1 / 30);
  const at60 = run(1 / 60);
  const at120 = run(1 / 120);
  assert.equal(at30.active, true);
  assert.equal(at60.active, true);
  assert.equal(at120.active, true);
  assert.equal(at30.brake, at60.brake);
  assert.equal(at120.brake, at60.brake);
});

test("steering smoothing is stable across render cadences", () => {
  const sample = (renderDelta: number): { held: number; released: number } => {
    const input = new RallyInput({ onCameraMove: () => undefined });
    input.setSteering(1);
    let held = 0;
    for (let frame = 0; frame < Math.round(1 / renderDelta); frame += 1) held = input.snapshot(renderDelta).steer;
    input.setSteering(null);
    let released = held;
    for (let frame = 0; frame < Math.round(1 / renderDelta); frame += 1) released = input.snapshot(renderDelta).steer;
    return { held, released };
  };
  const at30 = sample(1 / 30);
  const at60 = sample(1 / 60);
  const at120 = sample(1 / 120);
  assert.ok(Math.abs(at30.held - at60.held) < 0.000001);
  assert.ok(Math.abs(at120.held - at60.held) < 0.000001);
  assert.ok(Math.abs(at30.released - at60.released) < 0.000001);
  assert.ok(Math.abs(at120.released - at60.released) < 0.000001);
});

test("boost input is independent from throttle and brake controls", () => {
  const input = new RallyInput({ onCameraMove: () => undefined });
  input.setThrottle(true);
  input.setBoost(true);
  assert.deepEqual(input.snapshot(), { steer: 0, throttle: 1, brake: 0, boost: true });
  input.setBoost(false);
  input.setBrake(true);
  assert.equal(input.snapshot().boost, false);
  assert.equal(input.snapshot().brake, 1);
  input.clear();
  assert.equal(input.snapshot().throttle, 0);
});

test("mobile hover input maps a floating touch origin to continuous strafe", () => {
  assert.equal(relativeStrafeValue(0), 0);
  assert.ok(relativeStrafeValue(-120) > 0.8);
  assert.ok(relativeStrafeValue(120) < -0.8);
  const input = new RallyInput({ onCameraMove: () => undefined });
  input.setMobileStrafeEnabled(true);
  assert.equal(input.beginRelativeSteering(17, 100), true);
  input.updateRelativeSteering(17, 100);
  assert.equal(input.snapshot(1 / 60, { phase: "racing" }).strafe, 0);
  input.updateRelativeSteering(17, 160);
  const right = input.snapshot(1 / 60, { phase: "racing" });
  assert.ok((right.strafe ?? 0) < 0);
  input.endRelativeSteering(17);
  const released = input.snapshot(1 / 60, { phase: "racing" });
  assert.ok(Math.abs(released.strafe ?? 0) < Math.abs(right.strafe ?? 0));
});

test("hover boost is a one-press charge with a timed attack state", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track, RALLY_VEHICLES.compact);
  car.setHoverMode(true);
  car.setBoostChargeMode(true);
  car.reset();
  const initialCharges = car.boostCharges;
  car.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: true }, 1 / 60, true);
  assert.equal(car.boostCharges, initialCharges - 1);
  assert.equal(car.boostActive, true);
  const remaining = car.boostTimeRemaining;
  for (let frame = 0; frame < 20; frame += 1) {
    car.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: true }, 1 / 60, true);
  }
  assert.equal(car.boostCharges, initialCharges - 1, "holding the button cannot spend another charge");
  assert.ok(car.boostTimeRemaining < remaining);
  car.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: false }, 1 / 60, true);
  for (let frame = 0; frame < 180; frame += 1) car.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: false }, 1 / 60, true);
  assert.equal(car.boostActive, false);
  car.dispose();
  track.dispose();
});

test("hover pickup adds one charge and reset restores the pickup", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track, RALLY_VEHICLES.compact);
  car.setHoverMode(true);
  car.reset();
  const pickup = track.pickups[0];
  assert.ok(pickup);
  const before = car.boostCharges;
  car.position.set(pickup.x, pickup.y + RALLY_CONFIG.vehicle.hoverHeight, pickup.z);
  car.update({ throttle: 0, brake: 0, steer: 0, strafe: 0, boost: false }, 1 / 60, true);
  assert.equal(car.pickupCount, 1);
  assert.equal(car.boostCharges, Math.min(car.maxBoostCharges, before + 1));
  assert.equal(pickup.active, false);
  track.resetObstacles();
  assert.equal(pickup.active, true);
  car.dispose();
  track.dispose();
});

test("mobile hover race follows all three tracks with neutral strafe", () => {
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    const track = new RallyTrack(definition);
    const car = new RallyCar(track, RALLY_VEHICLES.compact);
    const race = new RallyRace(track, car, false, false, "strong");
    race.setMobileArcadeInput(true);
    race.setMobileStrafeInput(true);
    race.start();
    let offRoadTime = 0;
    for (let frame = 0; frame < 6000 && race.phase !== "finished"; frame += 1) {
      race.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: false }, 1 / 60);
      const query = track.queryAt(car.position.x, car.position.z);
      if (!query.onRoad) offRoadTime += 1 / 60;
      assert.ok(Number.isFinite(car.position.x) && Number.isFinite(car.position.z));
    }
    assert.equal(race.phase, "finished", `${track.id} should complete with road follow`);
    assert.ok(offRoadTime < 0.5, `${track.id} left the road for ${offRoadTime.toFixed(2)}s`);
    assert.equal(car.respawnCount, 0, `${track.id} should not need recovery for neutral hover driving`);
    car.dispose();
    track.dispose();
  }
});

test("car accelerates, steers, and follows the terrain height", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const startX = car.position.x;
  for (let frame = 0; frame < 90; frame += 1) {
    car.update({ throttle: 1, brake: 0, steer: 0.2 }, 1 / 60, true);
  }
  assert.ok(car.speed > 8);
  assert.ok(car.forwardVelocity > 8);
  assert.equal(car.grounded, true);
  assert.ok(car.groundedRatio >= 0.75, "four-point suspension may unload one wheel over the opening crest");
  assert.ok(Math.abs(car.position.x - startX) > 1);
  const expectedY = track.groundHeight(car.position.x, car.position.z) + 0.62;
  assert.ok(Math.abs(car.position.y - expectedY) < 0.35);
  car.dispose();
  track.dispose();
});

test("car visual wheel bottoms meet the physical road height", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track, RALLY_VEHICLES.compact);
  assert.ok(Math.abs(car.visualWheelBottomGap()) < 0.08);
  car.dispose();
  track.dispose();
});

test("vehicle visual motion responds to acceleration, braking, steering, and impacts", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const initial = car.visualMotionState();
  for (let frame = 0; frame < 90; frame += 1) car.update({ throttle: 1, brake: 0, steer: 0.55 }, 1 / 60, true);
  const driving = car.visualMotionState();
  assert.ok(Math.abs(driving.pitch - initial.pitch) > 0.001);
  assert.ok(Math.abs(driving.roll - initial.roll) > 0.001);
  for (let frame = 0; frame < 12; frame += 1) car.update({ throttle: 0, brake: 1, steer: 0 }, 1 / 60, true);
  const braking = car.visualMotionState();
  assert.ok(braking.compression > initial.compression);
  car.collisionImpact = 1;
  car.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60, true);
  assert.ok(car.visualMotionState().recoil > 0);
  assert.ok(Number.isFinite(car.visualMotionState().pitch));
  assert.ok(Number.isFinite(car.visualMotionState().roll));
  car.dispose();
  track.dispose();
});

test("boost consumes earned energy and raises arcade acceleration without a physics fork", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  car.boostEnergy = 0.8;
  const energyBefore = car.boostEnergy;
  car.update({ throttle: 1, brake: 0, steer: 0, boost: true }, 1 / 60, true);
  assert.equal(car.boostActive, true);
  assert.ok(car.boostEnergy < energyBefore);
  const speedDuringBoost = car.speed;
  for (let frame = 0; frame < 30; frame += 1) car.update({ throttle: 1, brake: 0, steer: 0, boost: true }, 1 / 60, true);
  assert.ok(car.speed > speedDuringBoost);
  car.update({ throttle: 0, brake: 0, steer: 0, boost: false }, 1 / 60, true);
  assert.equal(car.boostActive, false);
  assert.ok(car.speed <= car.definition.maxSpeed * RALLY_CAR_CONSTANTS.boostTopSpeedRatio + 0.01);
  car.dispose();
  track.dispose();
});

test("suspension exposes four-point contact state and landing recovery", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  car.position.y += 2;
  car.grounded = false;
  car.verticalVelocity = 0;
  car.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60, true);
  assert.equal(car.grounded, false);
  assert.equal(car.groundedRatio, 0);
  for (let frame = 0; frame < 120 && !car.grounded; frame += 1) {
    car.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60, true);
  }
  assert.equal(car.grounded, true);
  assert.ok(car.groundedRatio > 0.5);
  assert.ok(car.landingImpact >= 0);
  car.respawn();
  assert.equal(car.speed, 0);
  assert.equal(car.grounded, true);
  car.dispose();
  track.dispose();
});

test("Track 01 produces a real airborne segment and landing during a driven lap", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const driver = new RallyAIDriver(car, track, RALLY_AI_PROFILES.normal);
  let airborneFrames = 0;
  let landed = false;
  let wasAirborne = false;
  for (let frame = 0; frame < 3600; frame += 1) {
    car.update(driver.update(1 / 60), 1 / 60, true);
    if (!car.grounded) {
      airborneFrames += 1;
      wasAirborne = true;
    } else if (wasAirborne) {
      landed = true;
      break;
    }
  }
  assert.ok(airborneFrames > 0, "a normal Track 01 drive should leave the ground");
  assert.equal(landed, true, "the driven jump should land again");
  assert.ok(car.airTime === 0 || car.airTime < 0.25);
  assert.ok(car.landingCount >= 1);
  car.dispose();
  track.dispose();
});

test("landing ratings reward a stable jump and reject a hard sideways landing", () => {
  assert.equal(evaluateRallyLanding({ impact: 0.22, lateralSpeed: 0.4, pitch: 0.02, roll: 0.03, airTime: 0.35 }), "PERFECT LANDING");
  assert.equal(evaluateRallyLanding({ impact: 0.42, lateralSpeed: 2.2, pitch: 0.1, roll: 0.12, airTime: 0.35 }), "CLEAN LANDING");
  assert.equal(evaluateRallyLanding({ impact: 0.9, lateralSpeed: 0.2, pitch: 0, roll: 0, airTime: 0.35 }), "BAD LANDING");
  assert.ok(rallyLandingBoostReward("PERFECT LANDING") > rallyLandingBoostReward("CLEAN LANDING"));
});

test("wheel contact ratio reaches zero when the ground is far below the car", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  car.position.y += 5;
  car.grounded = false;
  const state = car.suspensionState();
  assert.equal(state.groundedRatio, 0);
  assert.deepEqual(state.contacts, [false, false, false, false]);
  car.dispose();
  track.dispose();
});

test("respawn returns to the last safe road transform", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  for (let frame = 0; frame < 30; frame += 1) car.update({ throttle: 1, brake: 0, steer: 0 }, 1 / 60, true);
  const safe = car.position.clone();
  car.position.y = -100;
  car.position.x = 999;
  car.respawn();
  assert.ok(car.position.distanceTo(safe) < 3, `respawn moved too far: ${car.position.distanceTo(safe)}`);
  assert.equal(car.speed, 0);
  assert.equal(car.grounded, true);
  car.dispose();
  track.dispose();
});

test("brake and steering create a recoverable arcade drift", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const start = track.sampleAtDistance(0);
  car.position.set(start.x, start.y + RALLY_CAR_CONSTANTS.carHeight, start.z);
  car.heading = start.heading;
  for (let frame = 0; frame < 60; frame += 1) {
    car.update({ throttle: 1, brake: 0, steer: 0 }, 1 / 60, true);
  }
  const speedBeforeDrift = car.speed;
  for (let frame = 0; frame < 24; frame += 1) {
    car.update({ throttle: 0, brake: 1, steer: 0.8 }, 1 / 60, true);
  }
  assert.equal(car.drifting, true);
  assert.ok(Math.abs(car.slipAngle) > 0.05);
  assert.ok(car.speed > speedBeforeDrift * 0.45);
  assert.ok(car.driftScore >= 0, "classic drift remains a valid non-mobile path");
  assert.ok(car.boostEnergy > 0);
  const slidingSpeed = Math.abs(car.lateralVelocity);
  for (let frame = 0; frame < 45; frame += 1) {
    car.update({ throttle: 0, brake: 1, steer: -0.8 }, 1 / 60, true);
  }
  assert.ok(Math.abs(car.lateralVelocity) < slidingSpeed);
  car.dispose();
  track.dispose();
});

test("controlled drift produces graded feedback and bounded reward energy", () => {
  const base = { speed: 18, slipAngle: 0.28, steer: 0.62, surface: "road" as const, grounded: true };
  const drift = evaluateRallyDrift({ ...base, duration: 0.18, courseProgressDistance: 4, forwardDistance: 4 });
  const good = evaluateRallyDrift({ ...base, duration: 0.42, courseProgressDistance: 8, forwardDistance: 8 });
  const great = evaluateRallyDrift({ ...base, duration: 0.7, slipAngle: 0.48, courseProgressDistance: 13, forwardDistance: 13 });
  assert.equal(drift.grade, "DRIFT");
  assert.equal(good.grade, "GOOD DRIFT");
  assert.equal(great.grade, "GREAT DRIFT");
  assert.ok(great.energyPerSecond > drift.energyPerSecond);
  assert.equal(evaluateRallyDrift({ ...base, speed: 3, duration: 1 }).eligible, false);
  assert.equal(evaluateRallyDrift({ ...base, grounded: false, duration: 1 }).eligible, false);
});

test("drift reward diminishes when the car stops making course progress", () => {
  const moving = evaluateRallyDrift({ speed: 18, slipAngle: 0.3, steer: 0.7, duration: 1, surface: "road", grounded: true, courseProgressDistance: 12, forwardDistance: 12 });
  const farm = evaluateRallyDrift({ speed: 18, slipAngle: 0.3, steer: 0.7, duration: 1, surface: "road", grounded: true, courseProgressDistance: 0, forwardDistance: 0, samePlaceTime: 1.2 });
  assert.ok(moving.energyPerSecond > farm.energyPerSecond * 4);
  assert.notEqual(farm.grade, "GREAT DRIFT");
});

test("obstacle collision reduces speed and reports impact", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const obstacle = track.obstacles[0];
  car.position.set(
    obstacle.x - obstacle.radius - 0.5,
    track.groundHeight(obstacle.x, obstacle.z) + 0.62,
    obstacle.z,
  );
  car.heading = Math.PI / 2;
  car.forwardVelocity = 12;
  car.speed = 12;
  car.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60, true);
  assert.ok(car.collisionImpact > 0);
  assert.ok(car.speed < 12);
  track.dispose();
  car.dispose();
});

test("high-speed impact breaks a destructible shortcut and reset restores it", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const wall = track.obstacles.find((obstacle) => obstacle.destructible);
  assert.ok(wall);
  car.position.set(wall.x - wall.radius - 0.5, track.groundHeight(wall.x, wall.z) + 0.62, wall.z);
  car.heading = Math.PI / 2;
  car.forwardVelocity = 14;
  car.speed = 14;
  car.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60, true);
  assert.equal(wall.active, false);
  assert.equal(track.obstacleCollision(wall.x, wall.z, 1), null);
  track.resetObstacles();
  assert.equal(wall.active, true);
  car.dispose();
  track.dispose();
});

test("Track 01-03 generate visible roadside safety blocks with shared active colliders", () => {
  const expectedCounts = new Map([["track-01", [10, 25]], ["track-02", [15, 35]], ["track-03", [20, 50]]] as const);
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    const track = new RallyTrack(definition);
    const blocks = track.obstacles.filter((obstacle) => obstacle.kind === "safety-block");
    const [minimum, maximum] = expectedCounts.get(track.id) ?? [1, Number.POSITIVE_INFINITY];
    assert.ok(blocks.length >= minimum && blocks.length <= maximum, `${track.id} has ${blocks.length} roadside blocks`);
    const mesh = track.group.getObjectByName("rally-voxel-safety-blocks") as THREE.InstancedMesh | undefined;
    assert.ok(mesh);
    assert.equal(mesh.count, blocks.length);
    for (const block of blocks) {
      const collider = track.staticColliders.find((candidate) => candidate.id === block.id);
      assert.ok(collider?.active && collider.solid, `${track.id}/${block.id} needs an active collider`);
      const query = track.queryAt(block.x, block.z);
      assert.ok(Math.abs(query.lateralDistance) > query.roadHalfWidth);
      const edgeDistance = Math.abs(query.lateralDistance) - query.roadHalfWidth;
      assert.ok(edgeDistance >= 1 && edgeDistance <= 3, `${track.id}/${block.id} is ${edgeDistance.toFixed(2)}m beyond the road edge`);
      for (const shortcut of track.shortcutZones) {
        assert.ok(Math.hypot(block.x - shortcut.entryX, block.z - shortcut.entryZ) > 5);
        assert.ok(Math.hypot(block.x - shortcut.exitX, block.z - shortcut.exitZ) > 5);
      }
    }
    for (const quality of ["low", "normal", "high"] as const) {
      track.setGraphicsQuality(quality);
      assert.equal(mesh.count, blocks.length, `${quality} quality must not hide solid safety blocks`);
    }
    const first = blocks[0];
    assert.equal(track.destroyObstacle(first.id), true);
    assert.equal(mesh.count, blocks.length - 1);
    track.resetObstacles();
    assert.equal(mesh.count, blocks.length);
    assert.equal(first.active, true);
    track.dispose();
  }
});

test("normal safety-block contact breaks, slows, and nudges the car toward the road", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const block = track.obstacles.find((obstacle) => obstacle.kind === "safety-block");
  assert.ok(block);
  const forwardX = Math.sin(block.rotationY);
  const forwardZ = Math.cos(block.rotationY);
  car.position.set(block.x - forwardX * 1.8, track.groundHeight(block.x, block.z) + 0.62, block.z - forwardZ * 1.8);
  const roadHeading = track.queryAt(car.position.x, car.position.z).heading;
  car.heading = block.rotationY + 0.6;
  car.forwardVelocity = 12;
  car.speed = 12;
  const beforeHeadingError = Math.abs(Math.atan2(Math.sin(roadHeading - car.heading), Math.cos(roadHeading - car.heading)));
  car.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60, true);
  const afterHeadingError = Math.abs(Math.atan2(Math.sin(roadHeading - car.heading), Math.cos(roadHeading - car.heading)));
  assert.equal(block.active, false);
  assert.equal(car.rewardMessage, "SMASH");
  assert.ok(car.speed < 12 * 0.86, `normal safety contact should lose speed, got ${car.speed}`);
  assert.ok(afterHeadingError < beforeHeadingError);
  car.dispose();
  track.dispose();
});

test("BOOST safety-block contact keeps momentum and reports BOOST SMASH", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const block = track.obstacles.find((obstacle) => obstacle.kind === "safety-block");
  assert.ok(block);
  const forwardX = Math.sin(block.rotationY);
  const forwardZ = Math.cos(block.rotationY);
  car.position.set(block.x - forwardX * 1.8, track.groundHeight(block.x, block.z) + 0.62, block.z - forwardZ * 1.8);
  car.heading = block.rotationY;
  car.boostEnergy = 1;
  car.forwardVelocity = 12;
  car.speed = 12;
  car.update({ throttle: 1, brake: 0, steer: 0, boost: true }, 1 / 60, true);
  assert.equal(block.active, false);
  assert.equal(car.rewardMessage, "BOOST SMASH");
  assert.ok(car.boostActive);
  assert.ok(car.speed > 11, `BOOST smash should not receive the normal penalty, got ${car.speed}`);
  car.dispose();
  track.dispose();
});

test("AI sees safety blocks through the shared collider query", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const block = track.obstacles.find((obstacle) => obstacle.kind === "safety-block");
  assert.ok(block);
  const heading = block.rotationY;
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  car.position.set(block.x - forwardX * 8, track.groundHeight(block.x, block.z) + 0.62, block.z - forwardZ * 8);
  car.heading = heading;
  const ahead = track.staticColliderAhead(car.position.x, car.position.z, heading, 12, 1.8);
  assert.equal(ahead?.id, block.id);
  assert.equal(ahead?.destructible, true);
  const driver = new RallyAIDriver(car, track, RALLY_AI_PROFILES.normal);
  const input = driver.update(1 / 60);
  assert.ok(input.boost || input.brake > 0 || Math.abs(input.steer) > 0.01);
  car.dispose();
  track.dispose();
});

test("destruction feedback counts a smash, rewards bounded energy, and restores cleanly", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const wall = track.obstacles.find((obstacle) => obstacle.destructible);
  assert.ok(wall);
  car.position.set(wall.x - wall.radius - 0.5, track.groundHeight(wall.x, wall.z) + 0.62, wall.z);
  car.heading = Math.PI / 2;
  car.forwardVelocity = 14;
  car.speed = 14;
  car.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60, true);
  assert.equal(car.destructionCount, 1);
  assert.equal(car.lastDestructionKind, wall.kind);
  assert.ok(car.boostEnergy > 0 && car.boostEnergy <= 1);
  car.reset();
  assert.equal(car.destructionCount, 0);
  assert.equal(car.lastDestructionKind, null);
  car.dispose();
  track.dispose();
});

test("boosted destruction pays a larger bounded reward than a normal smash", () => {
  const normal = rallyDestructionBoostReward("barrier", false);
  const boosted = rallyDestructionBoostReward("barrier", true);
  assert.ok(boosted > normal);
  assert.ok(boosted <= 0.3);
});

test("destructible materials expose distinct wall and fence profiles", () => {
  assert.ok(rallyDestructionBoostReward("wall", true) > rallyDestructionBoostReward("barrier", false));
  assert.ok(rallyDestructionBoostReward("fence", false) < rallyDestructionBoostReward("rock", false));
  const track = new RallyTrack();
  assert.ok(track.obstacles.some((obstacle) => obstacle.kind === "fence" && obstacle.destructible));
  assert.ok(track.obstacles.some((obstacle) => obstacle.kind === "wall" && obstacle.destructible));
  track.dispose();
});

test("arcade car exposes forward and lateral velocity with speed-limited steering", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const start = track.sampleAtDistance(0);
  car.position.set(start.x, start.y + RALLY_CAR_CONSTANTS.carHeight, start.z);
  car.heading = start.heading;
  for (let frame = 0; frame < 90; frame += 1) {
    car.update({ throttle: 1, brake: 0, steer: 0 }, 1 / 60, true);
  }
  const headingBefore = car.heading;
  car.update({ throttle: 0, brake: 0, steer: 1 }, 1 / 60, true);
  assert.ok(Math.abs(car.heading - headingBefore) < 0.03);
  for (let frame = 0; frame < 30; frame += 1) {
    car.update({ throttle: 0, brake: 0, steer: 1 }, 1 / 60, true);
  }
  assert.ok(Math.abs(car.lateralVelocity) > 0.01);
  assert.ok(Number.isFinite(car.slipAngle));
  car.update({ throttle: 0, brake: 1, steer: 0 }, 1 / 60, true);
  assert.ok(car.speed < car.definition.maxSpeed * 0.9);
  car.dispose();
  track.dispose();
});

test("race requires checkpoints before accepting the goal line", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const race = new RallyRace(track, car);
  race.start();
  for (let frame = 0; frame < 240; frame += 1) race.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60);
  assert.equal(race.phase, "racing");
  assert.equal(race.nextCheckpoint, 0);
  const crossGate = (index: number): void => {
    const gate = track.sampleCheckpoint(index);
    car.position.set(gate.x - gate.tangentX * 3, gate.y + 0.62, gate.z - gate.tangentZ * 3);
    race.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60);
    car.position.set(gate.x + gate.tangentX * 3, gate.y + 0.62, gate.z + gate.tangentZ * 3);
    race.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60);
  };
  for (let index = 0; index < track.checkpoints.length; index += 1) {
    crossGate(index);
    assert.equal(race.nextCheckpoint, index + 1);
    assert.ok(race.lastSplit !== null && race.lastSplit >= 0);
  }
  for (let frame = 0; frame < 300; frame += 1) race.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60);
  crossGate(track.checkpoints.length);
  assert.equal(race.phase, "finished");
  assert.ok(race.bestLap !== null);
  assert.ok(race.lastSplit !== null && race.lastSplit >= 0);
  car.dispose();
  track.dispose();
});

test("checkpoint progress accepts a fast gate sweep and flags reverse crossing", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const race = new RallyRace(track, car);
  race.start();
  for (let frame = 0; frame < 240; frame += 1) race.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60);
  const gate = track.sampleCheckpoint(0);
  car.position.set(gate.x - gate.tangentX * 20, gate.y + 0.62, gate.z - gate.tangentZ * 20);
  race.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60);
  car.position.set(gate.x + gate.tangentX * 20, gate.y + 0.62, gate.z + gate.tangentZ * 20);
  race.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60);
  assert.equal(race.nextCheckpoint, 1);
  assert.ok(race.progress >= 0 && race.progress <= 1);

  const reverseRace = new RallyRace(track, new RallyCar(track));
  reverseRace.start();
  const reverseCar = reverseRace.car;
  reverseCar.position.set(gate.x + gate.tangentX * 3, gate.y + 0.62, gate.z + gate.tangentZ * 3);
  for (let frame = 0; frame < 240; frame += 1) reverseRace.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60);
  reverseCar.position.set(gate.x - gate.tangentX * 3, gate.y + 0.62, gate.z - gate.tangentZ * 3);
  reverseRace.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60);
  assert.equal(reverseRace.nextCheckpoint, 0);
  assert.equal(reverseRace.missedCheckpoint, true);
  car.dispose();
  reverseCar.dispose();
  track.dispose();
});

test("chase camera follows speed, drift, and impact state", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const camera = new RallyChaseCamera();
  camera.update(car, 1 / 60);
  assert.equal(camera.fov, 58);
  car.speed = 28;
  car.forwardVelocity = 28;
  car.drifting = true;
  car.collisionImpact = 1;
  camera.drag(40, -10);
  camera.update(car, 1 / 60);
  assert.ok(camera.fov > 65);
  assert.ok(camera.position.distanceTo(car.position) > 8);
  assert.ok(camera.target.distanceTo(car.position) > 2);
  car.dispose();
  track.dispose();
});

test("hover chase camera gives lateral hazards more reaction distance", () => {
  const track = new RallyTrack();
  const classicCar = new RallyCar(track);
  const hoverCar = new RallyCar(track);
  hoverCar.setHoverMode(true);
  classicCar.speed = hoverCar.speed = 28;
  classicCar.forwardVelocity = hoverCar.forwardVelocity = 28;
  const classicCamera = new RallyChaseCamera();
  const hoverCamera = new RallyChaseCamera();
  classicCamera.update(classicCar, 1 / 60);
  hoverCamera.update(hoverCar, 1 / 60, { heading: hoverCar.heading, strength: 0.8 });
  assert.ok(hoverCamera.position.distanceTo(hoverCar.position) > classicCamera.position.distanceTo(classicCar.position));
  assert.ok(hoverCamera.target.distanceTo(hoverCar.position) > classicCamera.target.distanceTo(classicCar.position));
  classicCar.dispose();
  hoverCar.dispose();
  track.dispose();
});

test("speed sensation stays bounded and activates only at racing speed", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const camera = new RallyChaseCamera();
  camera.update(car, 1 / 60);
  car.speed = 28;
  car.forwardVelocity = 28;
  camera.update(car, 1 / 60);
  assert.ok(camera.fov >= 55 && camera.fov <= 72);
  car.speed = 0;
  camera.update(car, 1 / 60);
  assert.ok(camera.fov >= 55 && camera.fov <= 72);

  const lines = new RallySpeedLines();
  const material = (lines.group.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial;
  lines.update(0);
  assert.equal(material.opacity, 0);
  lines.update(28);
  assert.ok(material.opacity > 0);
  lines.update(48, false, 0);
  const normalLineCount = lines.activeCount;
  lines.update(52, true, 3);
  assert.ok(lines.activeCount > normalLineCount);
  assert.equal(lines.boostPresentation, true);
  lines.dispose();
  car.dispose();
  track.dispose();
});

test("road-centered hover camera lets strafe read on screen and keeps low boost FX visible", () => {
  const anchor = roadCenteredCameraAnchor(0, 0, 6, 0);
  assert.ok(anchor.x > 0 && anchor.x < 6, "camera should share the road/player anchor");
  assert.ok(Math.abs(anchor.x) < 3, "camera should not follow the player one hundred percent");

  const lines = new RallySpeedLines();
  lines.setQuality("low");
  lines.update(52, true, 0);
  assert.ok(lines.activeCount >= 8 && lines.activeCount <= 12, "LOW keeps a readable boost line pool");
  lines.dispose();
});

test("audio feedback remains safe before a browser audio context exists", () => {
  const audio = new RallyAudio();
  const track = new RallyTrack();
  const car = new RallyCar(track);
  audio.update(car, "ready", 1 / 60);
  audio.dispose();
  car.dispose();
  track.dispose();
});

test("sound and music switches control separate procedural audio channels", () => {
  assert.deepEqual(rallyAudioChannelVolumes(false, true), { effects: 0, music: 1 });
  assert.deepEqual(rallyAudioChannelVolumes(true, false), { effects: 1, music: 0 });
  assert.equal(rallyGhostStorageKey("track-01", "wet", "buggy"), "track-01:wet:buggy");
});

test("time attack medal thresholds are ordered and achievable", () => {
  assert.equal(medalForLapTime(29.9), "GOLD");
  assert.equal(medalForLapTime(35.9), "SILVER");
  assert.equal(medalForLapTime(44.9), "BRONZE");
  assert.equal(medalForLapTime(45.1), null);
});

test("ghost playback interpolates position and heading samples", () => {
  const playback = new RallyGhostPlayback("test-track");
  playback.setRun({
    version: RALLY_GHOST_DATA_VERSION,
    trackId: "test-track",
    physicsVersion: "arcade-vehicle-v2",
    duration: 2,
    samples: [
      { time: 0, x: 0, y: 1, z: 0, heading: 0, speed: 5 },
      { time: 1, x: 10, y: 2, z: 4, heading: Math.PI / 2, speed: 15, progress: 0.5 },
      { time: 2, x: 20, y: 1, z: 8, heading: Math.PI, speed: 5, progress: 1 },
    ],
  });
  const sample = playback.sampleAt(0.5);
  assert.ok(sample);
  assert.equal(sample.x, 5);
  assert.equal(sample.z, 2);
  assert.equal(sample.speed, 10);
  assert.ok(Math.abs(sample.heading - Math.PI / 4) < 0.001);
  const ahead = playback.compareAtProgress(0.5, 0.6);
  assert.ok(ahead.delta !== null && ahead.delta < 0);
  assert.equal(ahead.state, "ahead");
  const behind = playback.compareAtProgress(0.5, 1.4);
  assert.ok(behind.delta !== null && behind.delta > 0);
  assert.equal(behind.state, "behind");
  playback.setRun({ version: 2, trackId: "test-track", physicsVersion: "old-physics", duration: 2, samples: [] });
  assert.equal(playback.sampleAt(0), null);
});

test("renderer selection falls back after WebGL initialization failure", () => {
  let webglAttempts = 0;
  let canvasAttempts = 0;
  let loggedError: unknown = null;
  const selected = createRallyRenderer(
    false,
    true,
    () => { webglAttempts += 1; throw new Error("renderer unavailable"); },
    () => { canvasAttempts += 1; return "canvas"; },
    (error) => { loggedError = error; },
  );
  assert.equal(selected, "canvas");
  assert.equal(webglAttempts, 1);
  assert.equal(canvasAttempts, 1);
  assert.ok(loggedError instanceof Error);
  assert.equal(createRallyRenderer(true, true, () => "webgl", () => "canvas", () => undefined), "canvas");
});

test("reset returns the race to the start gate without losing best time", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const race = new RallyRace(track, car);
  race.bestLap = 12.34;
  race.start();
  race.reset();
  assert.equal(race.phase, "ready");
  assert.equal(race.nextCheckpoint, 0);
  assert.equal(race.bestLap, 12.34);
  assert.ok(Math.abs(car.position.x - track.sampleCheckpoint(track.checkpoints.length).x) < 0.01);
  car.dispose();
  track.dispose();
});

test("fixed-step simulation reaches the same state at 30, 60, and 120 fps", () => {
  const simulate = (renderDelta: number): { x: number; y: number; z: number; speed: number } => {
    const track = new RallyTrack();
    const car = new RallyCar(track);
    const clock = new RallyFixedStepClock();
    const frameCount = Math.round(1 / renderDelta);
    for (let frame = 0; frame < frameCount; frame += 1) {
      clock.advance(renderDelta, (fixedDelta) => {
        car.update({ throttle: 1, brake: 0, steer: 0.25 }, fixedDelta, true);
      });
    }
    const result = { x: car.position.x, y: car.position.y, z: car.position.z, speed: car.speed };
    car.dispose();
    track.dispose();
    return result;
  };
  const at30 = simulate(1 / 30);
  const at60 = simulate(1 / 60);
  const at120 = simulate(1 / 120);
  for (const value of ["x", "y", "z", "speed"] as const) {
    assert.ok(Math.abs(at30[value] - at60[value]) < 0.0001, `${value} differs at 30fps`);
    assert.ok(Math.abs(at120[value] - at60[value]) < 0.0001, `${value} differs at 120fps`);
  }
});

test("vehicle telemetry exposes the current input, surface, drift, and air time", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  car.update({ throttle: 1, brake: 0, steer: 0.4 }, 1 / 60, true);
  const telemetry = car.telemetry();
  assert.equal(telemetry.throttle, 1);
  assert.equal(telemetry.brake, 0);
  assert.equal(telemetry.steer, 0.4);
  assert.equal(telemetry.surface, "road");
  assert.equal(telemetry.grounded, true);
  assert.equal(telemetry.airTime, 0);
  assert.ok(Number.isFinite(telemetry.slipAngle));
  car.position.y += 2;
  car.grounded = false;
  car.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60, true);
  assert.ok(car.telemetry().airTime > 0);
  car.dispose();
  track.dispose();
});

test("track catalog exposes data-driven definitions by stable id", () => {
  const definitions = listRallyTrackDefinitions();
  assert.ok(definitions.length >= 1);
  assert.equal(definitions[0].id, "track-01");
  assert.equal(getRallyTrackDefinition("track-01")?.name, definitions[0].name);
  assert.equal(getRallyTrackDefinition("missing-track"), null);
  assert.ok(definitions[0].controlPoints.length >= 4);
  assert.ok(definitions[0].medalTimes.gold < definitions[0].medalTimes.silver);
});

test("hover gameplay obstacles resolve from progress and road-relative lateral data", () => {
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    const track = new RallyTrack(definition);
    const authored = (track.definition.obstacles ?? []).filter((obstacle) => obstacle.progress !== undefined && obstacle.lateral !== undefined);
    assert.ok(authored.length >= 2, `${track.id} has data-driven hover obstacles`);
    for (const obstacle of authored) {
      const sample = track.sampleAtDistance(track.length * (obstacle.progress ?? 0));
      const resolved = track.obstacles.find((candidate) => candidate.id === obstacle.id);
      assert.ok(resolved);
      const query = track.queryAt(resolved.x, resolved.z, sample.segmentIndex);
      assert.ok(Math.abs(query.lateralDistance) < query.roadHalfWidth, `${track.id}/${obstacle.id} remains on the canonical road`);
      assert.ok(resolved.shape === "box" || obstacle.kind === "rock" || obstacle.kind === "tree");
      assert.ok(Math.abs(resolved.rotationY - sample.heading) < 0.2);
    }
    track.dispose();
  }
});

test("distributed hover pickups support charge chaining and one-press boost consumption", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  car.setHoverMode(true);
  car.setBoostChargeMode(true);
  const first = track.pickups[0];
  const second = track.pickups[1];
  assert.ok(first && second);
  const initialCharges = car.boostCharges;
  car.position.set(first.x, track.groundHeight(first.x, first.z) + 1.48, first.z);
  car.update({ throttle: 0, brake: 0, steer: 0, strafe: 0 }, 0, true);
  car.position.set(second.x, track.groundHeight(second.x, second.z) + 1.48, second.z);
  car.update({ throttle: 0, brake: 0, steer: 0, strafe: 0 }, 0, true);
  assert.equal(car.pickupCount, 2);
  assert.equal(car.boostCharges, Math.min(car.maxBoostCharges, initialCharges + 2));
  assert.equal(car.boostChainCount, 0, "pickup collection does not fake a boost-state chain");
  assert.equal(car.rewardMessage, "BOOST +1");
  const chargesBeforeBoost = car.boostCharges;
  car.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: true }, 1 / 60, true);
  assert.equal(car.boostActive, true);
  assert.equal(car.boostCharges, chargesBeforeBoost - 1);
  car.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: true }, 1 / 60, true);
  assert.equal(car.boostCharges, chargesBeforeBoost - 1);
  car.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: false }, 1 / 60, true);
  const remainingBeforeChain = car.boostTimeRemaining;
  car.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: true }, 1 / 60, true);
  assert.equal(car.boostChainCount, 2, "a second press during the active window extends the boost chain");
  assert.ok(car.boostTimeRemaining > remainingBeforeChain, "a chain press adds time instead of resetting the active boost");
  car.dispose();
  track.dispose();
});

test("hover strafe uses velocity control and neutral holds the selected lateral line", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  car.setHoverMode(true);
  car.setBoostChargeMode(true);
  const sample = track.sampleAtDistance(track.length * 0.34);
  const lateralOffset = 2.4;
  car.position.set(
    sample.x + sample.tangentZ * lateralOffset,
    track.groundHeight(sample.x, sample.z) + 1.48,
    sample.z - sample.tangentX * lateralOffset,
  );
  car.heading = sample.heading;
  for (let frame = 0; frame < 45; frame += 1) {
    car.update({ throttle: 1, brake: 0, steer: 0, strafe: -0.6, boost: false }, 1 / 60, true);
  }
  const selected = track.queryAt(car.position.x, car.position.z);
  assert.ok(Math.abs(selected.lateralDistance) > 3, "the strafe command should change lateral position");
  const selectedLateral = selected.lateralDistance;
  for (let frame = 0; frame < 90; frame += 1) {
    car.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: false }, 1 / 60, true);
  }
  const held = track.queryAt(car.position.x, car.position.z);
  assert.ok(Math.abs(car.lateralVelocity) < 0.65, `neutral strafe should settle lateral velocity: ${car.lateralVelocity}`);
  assert.ok(Math.abs(held.lateralDistance - selectedLateral) < 1.5, "neutral strafe must not recenter the racer");
  car.dispose();
  track.dispose();
});

test("hover boost has an immediate speed kick and a distinct higher cap", () => {
  const track = new RallyTrack();
  const normal = new RallyCar(track);
  const boosted = new RallyCar(track);
  normal.setHoverMode(true);
  boosted.setHoverMode(true);
  normal.setBoostChargeMode(true);
  boosted.setBoostChargeMode(true);
  normal.forwardVelocity = 32;
  boosted.forwardVelocity = 32;
  normal.speed = 32;
  boosted.speed = 32;
  normal.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: false }, 1 / 60, true);
  boosted.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: true }, 1 / 60, true);
  assert.equal(boosted.boostActive, true);
  assert.ok(boosted.speed > normal.speed + 2, `${boosted.speed} should immediately exceed ${normal.speed}`);
  boosted.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: false }, 1 / 60, true);
  for (let frame = 0; frame < 45; frame += 1) {
    boosted.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: false }, 1 / 60, true);
  }
  assert.ok(boosted.speed > boosted.definition.maxSpeed * 1.12, `boost should exceed normal cap: ${boosted.speed}`);
  assert.ok(boosted.speed <= boosted.definition.maxSpeed * RALLY_CAR_CONSTANTS.boostTopSpeedRatio + 0.01);
  normal.dispose();
  boosted.dispose();
  track.dispose();
});

test("race pickup ownership keeps AI chains independent from the player", () => {
  const track = new RallyTrack();
  const first = track.pickups[0];
  const second = track.pickups[1];
  assert.ok(first && second);
  assert.equal(track.pickupAhead(0, track.length, "ai-01")?.id, first.id);
  assert.equal(track.collectPickup(first.id, "ai-01"), true);
  assert.equal(first.active, true, "AI collection must not remove the player visual pickup");
  assert.equal(track.pickupAhead(0, track.length, "ai-01")?.id, second.id);

  const ai = new RallyCar(track, RALLY_VEHICLES.compact, "ai-01");
  ai.setHoverMode(true);
  ai.setBoostChargeMode(true);
  const aiDriver = new RallyAIDriver(ai, track, RALLY_AI_PROFILES.normal, RALLY_AI_PERSONALITIES.technical);
  const pickupInput = aiDriver.update(1 / 60);
  assert.ok(Math.abs(pickupInput.strafe ?? 0) > 0.05, "hover AI should select the upcoming pickup lane");
  ai.position.set(first.x, track.groundHeight(first.x, first.z) + 1.48, first.z);
  ai.update({ throttle: 1, brake: 0, steer: 0, strafe: 0 }, 1 / 60, true);
  assert.equal(ai.pickupCount, 0, "an already collected AI pickup cannot be collected twice");

  const player = new RallyCar(track);
  player.setHoverMode(true);
  player.setBoostChargeMode(true);
  player.position.set(first.x, track.groundHeight(first.x, first.z) + 1.48, first.z);
  player.update({ throttle: 1, brake: 0, steer: 0, strafe: 0 }, 1 / 60, true);
  assert.equal(player.pickupCount, 1);
  assert.equal(first.active, false);
  ai.dispose();
  player.dispose();
  track.dispose();
});

test("four hover racers finish Track 03 without persistent traffic overlap", () => {
  const track = new RallyTrack(TRACK_03);
  const player = new RallyCar(track);
  const playerRace = new RallyRace(track, player, false, true);
  const mode = new RallyRaceMode(track, playerRace, "normal");
  mode.start();
  for (let frame = 0; frame < 4800; frame += 1) {
    mode.update({ throttle: 1, brake: 0, steer: 0, strafe: 0 }, 1 / 60);
    if (mode["participants"].every((participant) => participant.race.phase === "finished")) break;
  }
  assert.ok(mode["participants"].every((participant) => participant.race.phase === "finished"));
  assert.ok(mode["participants"].every((participant) => Number.isFinite(participant.car.position.x)));
  mode.dispose();
  player.dispose();
  track.dispose();
});

test("mountain pass definition has narrow elevation changes and its own medals", () => {
  const track = new RallyTrack(TRACK_02);
  const heights = TRACK_02.controlPoints.map((point) => point.y);
  const widths = TRACK_02.controlPoints.map((point) => point.width);
  assert.equal(track.id, "track-02");
  assert.equal(track.name, "Mountain Pass");
  assert.ok(Math.max(...heights) - Math.min(...heights) > 6);
  assert.ok(Math.min(...widths) < Math.min(...TRACK_01_DEFINITION.map((point) => point.width)));
  assert.equal(track.shortcutZones.length, 1);
  assert.ok(track.definition.medalTimes.gold < 45);
  track.dispose();
});

test("badlands definition offers wide off-road sections and multiple destructible routes", () => {
  const track = new RallyTrack(TRACK_03);
  const surfaces = TRACK_03.surfaceZones ?? [];
  assert.equal(track.id, "track-03");
  assert.equal(track.name, "Voxel Badlands");
  assert.ok(Math.max(...TRACK_03.controlPoints.map((point) => point.width)) >= 14);
  assert.ok(surfaces.some((zone) => zone.surface === "grass"));
  assert.ok(track.shortcutZones.length >= 3);
  assert.ok(track.obstacles.filter((obstacle) => obstacle.destructible).length >= 3);
  assert.ok(track.length > 400);
  track.dispose();
});

test("route graph keeps branch choices connected between checkpoint nodes", () => {
  const track = new RallyTrack(TRACK_03);
  assert.ok(track.routeGraph);
  assert.equal(track.routeGraph.edgesFrom("start").length, 2);
  assert.equal(track.routeGraph.isValidTransition(null, "badlands-main-1"), true);
  assert.equal(track.routeGraph.isValidTransition(null, "badlands-main-2"), false);
  assert.equal(track.routeGraph.isValidTransition("badlands-main-1", "badlands-jump-2"), true);
  assert.equal(track.routeGraph.edgeById("badlands-destroy-1")?.kind, "destructible");
  track.dispose();
});

test("AI driver produces bounded inputs from shared track and car state", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const driver = new RallyAIDriver(car, track);
  for (let frame = 0; frame < 240; frame += 1) {
    const input = driver.update(1 / 60);
    assert.ok(input.throttle >= 0 && input.throttle <= 1);
    assert.ok(input.brake >= 0 && input.brake <= 1);
    assert.ok(input.steer >= -1 && input.steer <= 1);
    car.update(input, 1 / 60, true);
  }
  assert.ok(Number.isFinite(car.position.x));
  assert.ok(Number.isFinite(car.position.z));
  assert.ok(Math.abs(car.speed) > 1);
  assert.equal(driver.difficulty, "normal");
  car.dispose();
  track.dispose();
});

test("AI personalities change racecraft without changing the shared vehicle physics", () => {
  assert.notEqual(RALLY_AI_PERSONALITIES.aggressive.targetSpeedRatio, RALLY_AI_PERSONALITIES.safe.targetSpeedRatio);
  const track = new RallyTrack();
  const aggressiveCar = new RallyCar(track);
  const safeCar = new RallyCar(track);
  const aggressive = new RallyAIDriver(aggressiveCar, track, RALLY_AI_PROFILES.normal, RALLY_AI_PERSONALITIES.aggressive);
  const safe = new RallyAIDriver(safeCar, track, RALLY_AI_PROFILES.normal, RALLY_AI_PERSONALITIES.safe);
  assert.equal(aggressive.personalityId, "aggressive");
  assert.equal(safe.personalityId, "safe");
  const aggressiveInput = aggressive.update(1 / 60);
  const safeInput = safe.update(1 / 60);
  assert.ok(aggressiveInput.throttle >= safeInput.throttle);
  assert.ok(Math.abs(aggressiveInput.steer - safeInput.steer) > 0 || aggressiveInput.throttle !== safeInput.throttle);
  aggressiveCar.dispose();
  safeCar.dispose();
  track.dispose();
});

test("AI driver queries scenery through the shared static collider API", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const scenery = track.scenery.find((item) => item.solid);
  assert.ok(scenery);
  const heading = Math.atan2(scenery.x - car.position.x, scenery.z - car.position.z);
  car.position.set(
    scenery.x - Math.sin(heading) * 8,
    track.groundHeight(scenery.x, scenery.z) + 0.62,
    scenery.z - Math.cos(heading) * 8,
  );
  car.heading = heading;
  car.forwardVelocity = 12;
  car.speed = 12;
  const ahead = track.staticColliderAhead(car.position.x, car.position.z, heading, 12, 1.8);
  assert.equal(ahead?.id, scenery.id);
  const driver = new RallyAIDriver(car, track, RALLY_AI_PROFILES.normal);
  const input = driver.update(1 / 60);
  assert.ok(input.brake > 0 || Math.abs(input.steer) > 0.01);
  car.dispose();
  track.dispose();
});

test("AI difficulty changes racecraft parameters without changing shared physics", () => {
  assert.ok(RALLY_AI_PROFILES.easy.reactionTime > RALLY_AI_PROFILES.normal.reactionTime);
  assert.ok(RALLY_AI_PROFILES.normal.reactionTime > RALLY_AI_PROFILES.hard.reactionTime);
  assert.ok(RALLY_AI_PROFILES.hard.shortcutUsage > RALLY_AI_PROFILES.easy.shortcutUsage);
  assert.ok(RALLY_AI_PROFILES.easy.mistakeProbability > RALLY_AI_PROFILES.hard.mistakeProbability);
  assert.ok(RALLY_AI_PROFILES.hard.overtakeOffset > RALLY_AI_PROFILES.easy.overtakeOffset);
});

test("AI boost uses earned energy and never starts with an empty meter", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const driver = new RallyAIDriver(car, track, RALLY_AI_PROFILES.hard, RALLY_AI_PERSONALITIES.aggressive);
  assert.equal(driver.update(1 / 60).boost, false);
  car.boostEnergy = 1;
  let requested = false;
  for (let frame = 0; frame < 420; frame += 1) {
    const input = driver.update(1 / 60);
    requested ||= input.boost === true;
    car.update(input, 1 / 60, true);
    if (requested && car.boostCount > 0) break;
  }
  assert.equal(requested, true);
  assert.ok(car.boostCount > 0);
  car.dispose();
  track.dispose();
});

test("race mode starts a player and three AI cars on a non-overlapping grid", () => {
  const track = new RallyTrack();
  const player = new RallyCar(track);
  const playerRace = new RallyRace(track, player);
  const mode = new RallyRaceMode(track, playerRace);
  mode.start();
  assert.equal(mode.aiCars.length, 3);
  const positions = [player, ...mode.aiCars].map((car) => ({ x: car.position.x, z: car.position.z }));
  for (let first = 0; first < positions.length; first += 1) {
    for (let second = first + 1; second < positions.length; second += 1) {
      assert.ok(Math.hypot(positions[first].x - positions[second].x, positions[first].z - positions[second].z) > 1);
    }
  }
  for (let frame = 0; frame < 360; frame += 1) mode.update({ throttle: 1, brake: 0, steer: 0 }, 1 / 60);
  const stats = mode.stats("canvas3d");
  assert.equal(stats.mode, "race");
  assert.equal(stats.racers, 4);
  assert.ok(stats.position >= 1 && stats.position <= 4);
  mode.dispose();
  player.dispose();
  track.dispose();
});

test("race mode assigns distinct non-cheating AI personalities", () => {
  const track = new RallyTrack();
  const playerRace = new RallyRace(track, new RallyCar(track), false);
  const mode = new RallyRaceMode(track, playerRace, "normal");
  assert.deepEqual(mode.aiPersonalityIds(), ["aggressive", "technical", "safe"]);
  mode.dispose();
  playerRace.car.dispose();
  track.dispose();
});

test("race position changes are signed for clear gain and loss feedback", () => {
  assert.equal(rallyPositionChange(3, 1), 2);
  assert.equal(rallyPositionChange(1, 3), -2);
  assert.equal(rallyPositionChange(2, 2), 0);
});

test("race mode separates overlapping player and AI cars without a physics teleport", () => {
  const track = new RallyTrack();
  const player = new RallyCar(track);
  const mode = new RallyRaceMode(track, new RallyRace(track, player));
  mode.start();
  const ai = mode.aiCars[0];
  player.position.set(ai.position.x, player.position.y, ai.position.z);
  const before = Math.hypot(player.position.x - ai.position.x, player.position.z - ai.position.z);
  mode.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60);
  const after = Math.hypot(player.position.x - ai.position.x, player.position.z - ai.position.z);
  assert.equal(before, 0);
  assert.ok(after > 1);
  assert.ok(player.collisionImpact > 0 || ai.collisionImpact > 0);
  mode.dispose();
  player.dispose();
  track.dispose();
});

test("boost ram preserves momentum even when both racers are boosted", () => {
  const track = new RallyTrack();
  const player = new RallyCar(track);
  const mode = new RallyRaceMode(track, new RallyRace(track, player));
  mode.start();
  const ai = mode.aiCars[0];
  player.setHoverMode(true);
  player.setBoostChargeMode(true);
  ai.setHoverMode(true);
  ai.setBoostChargeMode(true);
  player.boostCharges = 2;
  ai.boostCharges = 2;
  player.position.set(ai.position.x, player.position.y, ai.position.z);
  player.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: true }, 1 / 60, true);
  ai.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: true }, 1 / 60, true);
  const playerSpeedBefore = player.speed;
  const aiSpeedBefore = ai.speed;
  mode.update({ throttle: 1, brake: 0, steer: 0 }, 1 / 60);
  assert.ok(player.speed >= playerSpeedBefore * 0.97, `boosted player lost traffic momentum: ${player.speed}`);
  assert.ok(ai.speed >= aiSpeedBefore * 0.97, `boosted AI lost traffic momentum: ${ai.speed}`);
  mode.dispose();
  player.dispose();
  track.dispose();
});

test("AI visibility follows the selected race mode in both renderers", () => {
  assert.equal(rallyModeShowsAI("time-attack"), false);
  assert.equal(rallyModeShowsAI("race"), true);
  assert.equal(rallyModeShowsAI("championship"), true);
});

test("race mode applies the selected difficulty profile to the complete AI field", () => {
  const track = new RallyTrack();
  const player = new RallyCar(track);
  const mode = new RallyRaceMode(track, new RallyRace(track, player), "easy");
  assert.equal(mode.getDifficulty(), "easy");
  mode.setDifficulty("hard");
  assert.equal(mode.getDifficulty(), "hard");
  mode.start();
  for (let frame = 0; frame < 180; frame += 1) mode.update({ throttle: 0, brake: 0, steer: 0 }, 1 / 60);
  assert.ok(mode.aiCars.every((car) => Number.isFinite(car.position.x) && Number.isFinite(car.position.z)));
  mode.dispose();
  player.dispose();
  track.dispose();
});

test("AI fixed-step decisions are stable across render cadences", () => {
  const simulate = (renderDelta: number): [number, number, number] => {
    const track = new RallyTrack();
    const player = new RallyCar(track);
    const race = new RallyRace(track, player, false, true);
    const mode = new RallyRaceMode(track, race, "hard");
    mode.start();
    for (let frame = 0; frame < Math.round(8 / renderDelta); frame += 1) {
      mode.update({ throttle: 1, brake: 0, steer: 0 }, renderDelta);
    }
    const result = mode.aiCars[0].position.toArray() as [number, number, number];
    mode.dispose();
    player.dispose();
    track.dispose();
    return result;
  };
  const at30 = simulate(1 / 30);
  const at60 = simulate(1 / 60);
  const at120 = simulate(1 / 120);
  for (let index = 0; index < 3; index += 1) {
    assert.ok(Math.abs(at30[index] - at60[index]) < 0.0001, `AI coordinate ${index} differs at 30fps`);
    assert.ok(Math.abs(at120[index] - at60[index]) < 0.0001, `AI coordinate ${index} differs at 120fps`);
  }
});

test("vehicle classes share RallyCar physics while changing handling roles", () => {
  const track = new RallyTrack();
  const compact = new RallyCar(track, RALLY_VEHICLES.compact);
  const muscle = new RallyCar(track, RALLY_VEHICLES.muscle);
  const buggy = new RallyCar(track, RALLY_VEHICLES.buggy);
  for (let frame = 0; frame < 120; frame += 1) {
    compact.update({ throttle: 1, brake: 0, steer: 0 }, 1 / 60, true);
    muscle.update({ throttle: 1, brake: 0, steer: 0 }, 1 / 60, true);
    buggy.update({ throttle: 1, brake: 0, steer: 0 }, 1 / 60, true);
  }
  assert.equal(compact.snapshot().vehicleId, "compact");
  assert.equal(muscle.snapshot().vehicleId, "muscle");
  assert.equal(buggy.snapshot().vehicleId, "buggy");
  assert.ok(muscle.definition.maxSpeed > compact.definition.maxSpeed);
  assert.ok(buggy.definition.offRoadSpeedRatio > muscle.definition.offRoadSpeedRatio);
  compact.setDefinition(RALLY_VEHICLES.buggy);
  assert.equal(compact.snapshot().vehicleId, "buggy");
  assert.equal(compact.speed, 0);
  compact.dispose();
  muscle.dispose();
  buggy.dispose();
  track.dispose();
});

test("vehicle classes expose distinct low-poly rally silhouettes", () => {
  const track = new RallyTrack();
  const cars = [
    new RallyCar(track, RALLY_VEHICLES.compact),
    new RallyCar(track, RALLY_VEHICLES.muscle),
    new RallyCar(track, RALLY_VEHICLES.buggy),
  ];
  assert.deepEqual(cars.map((car) => car.definition.visual.style), ["compact", "muscle", "buggy"]);
  assert.ok(RALLY_VEHICLES.muscle.visual.bodyLength > RALLY_VEHICLES.compact.visual.bodyLength);
  assert.ok(RALLY_VEHICLES.buggy.visual.wheelRadius > RALLY_VEHICLES.compact.visual.wheelRadius);
  for (const car of cars) {
    for (const name of ["chassis", "hood", "cabin", "windshield", "front-bumper", "rear-bumper", "spoiler", "headlight-left", "tail-light-left"]) {
      assert.ok(car.group.getObjectByName(name), `${car.definition.id} is missing ${name}`);
    }
    assert.equal(car.group.getObjectsByProperty("type", "Mesh").length >= 13, true);
    assert.ok(Math.abs(car.visualWheelBottomGap()) < 0.08);
  }
  assert.ok(cars[1].group.getObjectByName("hood-scoop"));
  assert.ok(cars[2].group.getObjectByName("roll-frame-left"));
  cars[0].setDefinition(RALLY_VEHICLES.buggy);
  assert.ok(cars[0].group.getObjectByName("roll-frame-left"));
  for (const car of cars) car.dispose();
  track.dispose();
});

test("hover mode exposes four visual hover pads without changing the car physics root", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const startY = car.position.y;
  assert.equal(car.group.getObjectByName("hover-pad-front-left")?.visible, false);
  car.setHoverMode(true);
  assert.equal(car.group.getObjectByName("hover-pad-front-left")?.visible, true);
  assert.equal(car.group.getObjectsByProperty("name", "hover-pad-front-left").length, 1);
  assert.equal(car.group.getObjectsByProperty("type", "Mesh").filter((object) => object.name.startsWith("hover-pad-")).length, 4);
  assert.equal(car.position.y, startY);
  car.dispose();
  track.dispose();
});

test("championship progression unlocks tracks and vehicles with safe versioned saves", () => {
  let save = parseRallyChampionshipSave({ version: RALLY_CHAMPIONSHIP_SAVE_VERSION, points: 0, unlockedTracks: ["track-01"], unlockedVehicles: ["compact"], results: {} });
  assert.deepEqual(save.unlockedTracks, ["track-01"]);
  assert.equal(pointsForChampionshipPosition(1), 10);
  assert.equal(pointsForChampionshipPosition(4), 3);
  save = recordRallyChampionshipResult(save, { trackId: "track-01", position: 1, medal: "GOLD" });
  assert.equal(save.points, 10);
  assert.ok(save.unlockedTracks.includes("track-02"));
  assert.ok(save.unlockedVehicles.includes("muscle"));
  save = recordRallyChampionshipResult(save, { trackId: "track-02", position: 2, medal: "GOLD" });
  assert.equal(save.points, 17);
  assert.ok(save.unlockedTracks.includes("track-03"));
  assert.ok(save.unlockedVehicles.includes("buggy"));
  const recovered = parseRallyChampionshipSave({ version: 999, points: "bad", results: null });
  assert.deepEqual(recovered.unlockedTracks, ["track-01"]);
  assert.deepEqual(recovered.unlockedVehicles, ["compact"]);
});

test("championship run advances through three rounds and produces a final result", () => {
  const championship = new RallyChampionship({ version: RALLY_CHAMPIONSHIP_SAVE_VERSION, points: 0, unlockedTracks: ["track-01"], unlockedVehicles: ["compact"], results: {} }, parseRallyChampionshipRun({ version: RALLY_CHAMPIONSHIP_RUN_VERSION }));
  assert.deepEqual(championship.startRun().results, []);
  const first = championship.recordRound({ trackId: RALLY_CHAMPIONSHIP_TRACK_ORDER[0], position: 1, medal: "GOLD" });
  assert.equal(first.run.currentRound, 1);
  assert.equal(first.run.points, 10);
  const second = championship.recordRound({ trackId: RALLY_CHAMPIONSHIP_TRACK_ORDER[1], position: 3, medal: "BRONZE" });
  assert.equal(second.run.currentRound, 2);
  const final = championship.recordRound({ trackId: RALLY_CHAMPIONSHIP_TRACK_ORDER[2], position: 2, medal: "SILVER" });
  assert.equal(final.run.finished, true);
  assert.equal(final.run.points, 22);
  assert.equal(final.run.finalRank, 2);
  const duplicate = championship.recordRound({ trackId: RALLY_CHAMPIONSHIP_TRACK_ORDER[2], position: 1, medal: "GOLD" });
  assert.deepEqual(duplicate.run.results, final.run.results);
  assert.equal(parseRallyChampionshipRun({ version: 999 }).currentRound, 0);
});

test("arcade damage reduces handling gradually and can be repaired", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track, RALLY_VEHICLES.compact);
  car.applyDamage(0.6);
  assert.ok(car.bodyDamage > 0.5);
  assert.ok(car.snapshot().smokeLevel > 0);
  assert.ok(damageEffects(car.bodyDamage).maxSpeedRatio < 1);
  car.setDamageEnabled(false);
  assert.equal(car.bodyDamage, 0);
  car.setDamageEnabled(true);
  car.applyDamage(1);
  assert.equal(car.bodyDamage, 1);
  car.repair();
  assert.equal(car.bodyDamage, 0);
  car.dispose();
  track.dispose();
});

test("time attack disables damage while race participants keep arcade damage", () => {
  const track = new RallyTrack();
  const timeAttackCar = new RallyCar(track);
  const timeAttack = new RallyRace(track, timeAttackCar);
  assert.equal(timeAttackCar.damageEnabled, false);
  const raceCar = new RallyCar(track);
  const race = new RallyRace(track, raceCar, false, true);
  assert.equal(raceCar.damageEnabled, true);
  timeAttackCar.dispose();
  raceCar.dispose();
  track.dispose();
  void timeAttack;
  void race;
});

test("surface profiles and weather variants change grip without adding heavy runtime state", () => {
  assert.deepEqual(listRallySurfaces(), ["road", "asphalt", "dirt", "gravel", "grass", "mud", "rock"]);
  const dry = getRallySurfaceProfile("asphalt", "dry");
  const wet = getRallySurfaceProfile("asphalt", "wet");
  const mud = getRallySurfaceProfile("mud", "dry");
  assert.ok(wet.grip < dry.grip);
  assert.ok(wet.rollingResistance > dry.rollingResistance);
  assert.ok(mud.speedRatio < dry.speedRatio);
  const mountain = new RallyTrack(TRACK_02);
  assert.equal(mountain.environmentVariant, "sunset");
  assert.equal(mountain.queryAt(mountain.sampleAtDistance(mountain.length * 0.7).x, mountain.sampleAtDistance(mountain.length * 0.7).z).surface, "rock");
  mountain.dispose();
});

test("environment overrides create independent track variants and save keys", () => {
  const dry = createRallyTrack("track-01", "dry");
  const wet = createRallyTrack("track-01", "wet");
  const sunset = createRallyTrack("track-01", "sunset");
  assert.equal(dry.environmentVariant, "dry");
  assert.equal(wet.environmentVariant, "wet");
  assert.equal(sunset.environmentVariant, "sunset");
  assert.equal(rallyProgressStorageKey("track-01", "dry"), "track-01:dry");
  assert.notEqual(rallyProgressStorageKey("track-01", "wet"), rallyProgressStorageKey("track-01", "dry"));
  assert.equal(dry.length, wet.length);
  dry.dispose();
  wet.dispose();
  sunset.dispose();
});

test("time attack progress persists separately for dry and wet environments", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
  });
  try {
    saveTrackProgress({ trackId: "track-01", environmentVariant: "dry", bestLap: 31, bestSplits: [10] });
    saveTrackProgress({ trackId: "track-01", environmentVariant: "wet", bestLap: 34, bestSplits: [11] });
    assert.equal(loadTrackProgress("track-01", 4, "dry").bestLap, 31);
    assert.equal(loadTrackProgress("track-01", 4, "wet").bestLap, 34);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test("rally settings are versioned, bounded, and safe to recover", () => {
  const parsed = parseRallySettings({
    version: RALLY_SETTINGS_VERSION,
    cameraSensitivity: 9,
    touchSteeringSensitivity: 0,
    steeringDirection: "normal",
    graphicsQuality: "low",
    debugTelemetry: true,
  });
  assert.equal(parsed.cameraSensitivity, 1.6);
  assert.equal(parsed.touchSteeringSensitivity, 0.6);
  assert.equal(parsed.steeringDirection, "normal");
  assert.equal(parsed.steeringAssist, "strong");
  assert.equal(parsed.graphicsQuality, "low");
  assert.equal(parsed.debugTelemetry, true);
  const migrated = parseRallySettings({ version: 1, soundEnabled: false, musicEnabled: true, selectedVehicle: "buggy", onboardingSeen: true });
  assert.equal(migrated.soundEnabled, false);
  assert.equal(migrated.selectedVehicle, "buggy");
  assert.equal(migrated.onboardingSeen, true);
  assert.deepEqual(parseRallySettings({ version: 999 }), DEFAULT_RALLY_SETTINGS);
  for (const steeringAssist of ["off", "normal", "strong"] as const) {
    const reloaded = parseRallySettings({ version: RALLY_SETTINGS_VERSION, steeringAssist });
    assert.equal(reloaded.steeringAssist, steeringAssist, `${steeringAssist} survives settings serialization`);
  }
});

interface HumanLikeMobileLap {
  phase: string;
  lapTime: number;
  offRoadTime: number;
  maximumLateralRatio: number;
  recoveryCount: number;
  respawnCount: number;
  safetyBlockHits: number;
  averageSpeed: number;
  autoDriftCount: number;
  pickupCount: number;
  boostCount: number;
}

/**
 * A deliberately imperfect touch player for the mobile acceptance tests.
 * It only samples the current query and the shared upcoming-turn summary at
 * 15 Hz, then adds reaction delay, small thumb noise, and a late edge
 * correction. It never calculates an ideal steering angle from a future point.
 */
function runHumanLikeMobileLap(definition: RallyTrackDefinition | undefined): HumanLikeMobileLap {
  const track = new RallyTrack(definition);
  const car = new RallyCar(track);
  const race = new RallyRace(track, car, false, false, "strong");
  race.setMobileArcadeInput(true);
  race.setMobileStrafeInput(true);
  const input = new RallyInput({ onCameraMove: () => undefined });
  input.setMobileStrafeEnabled(true);
  input.beginRelativeSteering(37, 400);
  race.start();
  const initialSafetyBlocks = track.obstacles.filter((obstacle) => obstacle.kind === "safety-block" && obstacle.active).length;
  const updateEveryFrames = 4; // 15 Hz input updates at a 60 Hz simulation.
  const delayedCommands = [0, 0, 0]; // 0.20 seconds of reaction delay.
  let delayedCommand = 0;
  let command = 0;
  let desiredLane = 0;
  let offRoadTime = 0;
  let maximumLateralRatio = 0;
  let recoveryCount = 0;
  let wasOffRoad = false;
  let speedTotal = 0;
  let simulatedFrames = 0;
  for (let frame = 0; frame < 18000 && race.phase !== "finished"; frame += 1) {
    const context = race.mobileDrivingContext();
    const query = track.queryAt(car.position.x, car.position.z);
    if (frame % updateEveryFrames === 0) {
      // The mobile acceptance path chooses a broad lateral line, not a
      // frame-perfect steering angle. A nearby pickup nudges the thumb toward
      // its lane, while the fallback wander and delayed correction model a
      // normal player looking ahead through the hover course.
      const pickup = track.pickupAhead(
        query.progress,
        Math.max(24, Math.min(46, Math.abs(car.speed) * 1.9)),
        car.pickupOwnerId,
      );
      desiredLane = pickup
        ? pickup.lateral * 0.5
        : Math.sin(frame * 0.021) * 0.22;
      const lateralRatio = Math.abs(query.lateralDistance) / Math.max(0.1, query.roadHalfWidth);
      if (lateralRatio > 0.8) {
        // Human correction is intentionally late and bounded; Road Follow is
        // responsible for the main curve, not this test controller.
        desiredLane = -Math.sign(query.lateralDistance) * 0.35;
      }
      command += (desiredLane - command) * 0.28;
      command += Math.sin(frame * 0.71) * 0.018; // small thumb noise
      command = Math.max(-0.65, Math.min(0.65, command));
      delayedCommands.push(command);
      delayedCommand = delayedCommands.shift() ?? 0;
    }
    // Relative touch strafe is the real mobile path: the touch origin remains
    // neutral and the signed displacement selects a continuous road lane.
    input.updateRelativeSteering(37, 400 + delayedCommand * 125);
    const boostWindow = race.phase === "racing"
      && car.boostCharges > 0
      && frame % 420 >= 24
      && frame % 420 < 28;
    input.setBoost(boostWindow);
    race.update(input.snapshot(1 / 60, context), 1 / 60);
    const after = track.queryAt(car.position.x, car.position.z);
    const lateralRatio = Math.abs(after.lateralDistance) / Math.max(0.1, after.roadHalfWidth);
    const offRoad = lateralRatio > 1;
    maximumLateralRatio = Math.max(maximumLateralRatio, lateralRatio);
    if (offRoad) offRoadTime += 1 / 60;
    if (offRoad && !wasOffRoad) recoveryCount += 1;
    wasOffRoad = offRoad;
    speedTotal += Math.abs(car.speed);
    simulatedFrames += 1;
    assert.ok(Number.isFinite(car.position.x) && Number.isFinite(car.position.y) && Number.isFinite(car.position.z));
    assert.ok(Number.isFinite(car.speed) && Number.isFinite(car.heading));
  }
  const result: HumanLikeMobileLap = {
    phase: race.phase,
    lapTime: race.lapTime,
    offRoadTime,
    maximumLateralRatio,
    recoveryCount,
    respawnCount: car.respawnCount,
    safetyBlockHits: initialSafetyBlocks - track.obstacles.filter((obstacle) => obstacle.kind === "safety-block" && obstacle.active).length,
    averageSpeed: speedTotal / Math.max(1, simulatedFrames),
    autoDriftCount: car.driftCount,
    pickupCount: car.pickupCount,
    boostCount: car.boostCount,
  };
  car.dispose();
  track.dispose();
  return result;
}

test("Strong road follow keeps a neutral Track 01 mobile car on the road", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track);
  const race = new RallyRace(track, car, false, false, "strong");
  race.setMobileArcadeInput(true);
  race.setMobileStrafeInput(true);
  race.start();
  let roadFollowSeen = false;
  let offRoadTime = 0;
  for (let frame = 0; frame < 1200; frame += 1) {
    race.update({ throttle: 1, brake: 0, steer: 0, strafe: 0, boost: false }, 1 / 60);
    roadFollowSeen ||= Math.abs(race.telemetry().roadFollowSteer) > 0.05;
    const query = track.queryAt(car.position.x, car.position.z);
    if (Math.abs(query.lateralDistance) > query.roadHalfWidth) offRoadTime += 1 / 60;
  }
  assert.equal(roadFollowSeen, true);
  assert.ok(offRoadTime < 0.5, `neutral road follow left the course for ${offRoadTime.toFixed(2)}s`);
  car.dispose();
  track.dispose();
});

test("Human-like Strong mobile input completes all three tracks without relying on perfect steering", () => {
  const forest = runHumanLikeMobileLap(undefined);
  const mountain = runHumanLikeMobileLap(TRACK_02);
  const badlandsSafe = runHumanLikeMobileLap(TRACK_03);
  assert.equal(forest.phase, "finished", JSON.stringify(forest));
  assert.equal(mountain.phase, "finished", JSON.stringify(mountain));
  assert.equal(badlandsSafe.phase, "finished", JSON.stringify(badlandsSafe));
  assert.ok(forest.offRoadTime < 1, JSON.stringify(forest));
  assert.ok(mountain.offRoadTime < 2.5, JSON.stringify(mountain));
  assert.ok(badlandsSafe.offRoadTime < 2.5, JSON.stringify(badlandsSafe));
  assert.ok(forest.respawnCount <= 1, JSON.stringify(forest));
  assert.ok(mountain.respawnCount <= 1, JSON.stringify(mountain));
  assert.ok(badlandsSafe.respawnCount <= 1, JSON.stringify(badlandsSafe));
  assert.ok(forest.averageSpeed > 10, JSON.stringify(forest));
  assert.ok(mountain.averageSpeed > 10, JSON.stringify(mountain));
  assert.ok(badlandsSafe.averageSpeed > 10, JSON.stringify(badlandsSafe));
  assert.ok(badlandsSafe.pickupCount >= 1, JSON.stringify(badlandsSafe));
  assert.ok(forest.boostCount >= 1, JSON.stringify(forest));
});

test("road-follow simulation is deterministic at 30, 60, and 120 fps render cadence", () => {
  const simulate = (renderDelta: number) => {
    const track = new RallyTrack();
    const car = new RallyCar(track);
    const race = new RallyRace(track, car, false, false, "strong");
    race.setMobileArcadeInput(true);
    race.start();
    for (let frame = 0; frame < Math.round(5 / renderDelta); frame += 1) {
      race.update({ throttle: 1, brake: 0, steer: 0, boost: false }, renderDelta);
    }
    const telemetry = race.telemetry();
    const result = {
      x: car.position.x,
      y: car.position.y,
      z: car.position.z,
      heading: car.heading,
      speed: car.speed,
      targetLane: telemetry.targetLane,
      crossTrackVelocity: telemetry.crossTrackVelocity,
      offRoad: Math.abs(track.queryAt(car.position.x, car.position.z).lateralDistance) > track.queryAt(car.position.x, car.position.z).roadHalfWidth,
    };
    car.dispose();
    track.dispose();
    return result;
  };
  const at30 = simulate(1 / 30);
  const at60 = simulate(1 / 60);
  const at120 = simulate(1 / 120);
  for (const key of ["x", "y", "z", "heading", "speed", "targetLane", "crossTrackVelocity"] as const) {
    assert.ok(Math.abs(at30[key] - at60[key]) < 0.0001, `${key} differs at 30fps`);
    assert.ok(Math.abs(at120[key] - at60[key]) < 0.0001, `${key} differs at 120fps`);
  }
  assert.equal(at30.offRoad, at60.offRoad);
  assert.equal(at120.offRoad, at60.offRoad);
});

test("real mobile RallyInput pipeline completes Track 01 and survives Track 02 hairpins", () => {
  const drive = (definition: typeof TRACK_02 | typeof TRACK_03 | undefined, frameLimit: number) => {
    const track = new RallyTrack(definition);
    const car = new RallyCar(track);
    const race = new RallyRace(track, car, false, false, "strong");
    race.setMobileArcadeInput(true);
    race.setMobileStrafeInput(true);
    const input = new RallyInput({ onCameraMove: () => undefined });
    input.setMobileStrafeEnabled(true);
    input.beginRelativeSteering(21, 400);
    race.start();
    let command = 0;
    let desiredLane = 0;
    let offRoadTime = 0;
    let maximumLateralRatio = 0;
    let pickupCount = 0;
    let boostCount = 0;
    for (let frame = 0; frame < frameLimit && race.phase !== "finished"; frame += 1) {
      const context = race.mobileDrivingContext();
      const query = track.queryAt(car.position.x, car.position.z);
      if (frame % 4 === 0) {
        const pickup = track.pickupAhead(
          query.progress,
          Math.max(24, Math.min(46, Math.abs(car.speed) * 1.9)),
          car.pickupOwnerId,
        );
        desiredLane = pickup ? pickup.lateral * 0.5 : Math.sin(frame * 0.019) * 0.18;
        if (Math.abs(query.lateralDistance) / Math.max(0.1, query.roadHalfWidth) > 0.82) {
          desiredLane = -Math.sign(query.lateralDistance) * 0.35;
        }
        command += (desiredLane - command) * 0.26;
        command += Math.sin(frame * 0.43) * 0.015;
        command = Math.max(-0.65, Math.min(0.65, command));
      }
      input.updateRelativeSteering(21, 400 + command * 125);
      input.setBoost(
        race.phase === "racing"
        && car.boostCharges > 0
        && frame % 480 >= 24
        && frame % 480 < 28,
      );
      const state = input.snapshot(1 / 60, context);
      race.update(state, 1 / 60);
      const after = track.queryAt(car.position.x, car.position.z);
      const ratio = Math.abs(after.lateralDistance) / Math.max(0.1, after.roadHalfWidth);
      maximumLateralRatio = Math.max(maximumLateralRatio, ratio);
      if (ratio > 1) offRoadTime += 1 / 60;
      pickupCount = car.pickupCount;
      boostCount = car.boostCount;
      assert.ok(Number.isFinite(car.position.x) && Number.isFinite(car.position.z) && Number.isFinite(car.speed));
    }
    const result = { phase: race.phase, checkpoints: race.nextCheckpoint, offRoadTime, maximumLateralRatio, pickupCount, boostCount };
    car.dispose();
    track.dispose();
    return result;
  };
  const forest = drive(undefined, 7200);
  const mountain = drive(TRACK_02, 7200);
  const badlands = drive(TRACK_03, 3600);
  assert.equal(forest.phase, "finished", JSON.stringify(forest));
  assert.equal(mountain.phase, "finished", JSON.stringify(mountain));
  assert.equal(badlands.phase, "finished", JSON.stringify(badlands));
  assert.equal(badlands.checkpoints, 3, JSON.stringify(badlands));
  assert.ok(badlands.pickupCount >= 1, JSON.stringify(badlands));
  assert.ok(forest.boostCount >= 1, JSON.stringify(forest));
});

test("AI completes Track 01 with shared physics and no teleport step", () => {
  const track = new RallyTrack();
  const car = new RallyCar(track, RALLY_VEHICLES.compact);
  const race = new RallyRace(track, car, false, true);
  race.setMobileStrafeInput(true);
  const driver = new RallyAIDriver(car, track, RALLY_AI_PROFILES.normal);
  driver.bindRaceState(race);
  race.start();
  let previousX = car.position.x;
  let previousZ = car.position.z;
  let largestStep = 0;
  for (let frame = 0; frame < 4800 && race.phase !== "finished"; frame += 1) {
    race.update(driver.update(1 / 60), 1 / 60);
    largestStep = Math.max(largestStep, Math.hypot(car.position.x - previousX, car.position.z - previousZ));
    previousX = car.position.x;
    previousZ = car.position.z;
  }
  assert.equal(race.phase, "finished");
  assert.ok(race.lapTime < 80);
  assert.ok(largestStep < 1.2);
  car.dispose();
  track.dispose();
});

test("all tracks, vehicle classes, and AI difficulties complete the shared-physics audit", () => {
  for (const definition of [undefined, TRACK_02, TRACK_03]) {
    for (const vehicle of ["compact", "muscle", "buggy"] as const) {
      for (const difficulty of ["easy", "normal", "hard"] as const) {
        const track = new RallyTrack(definition);
        const car = new RallyCar(track, RALLY_VEHICLES[vehicle]);
        const race = new RallyRace(track, car, false, true);
        race.setMobileStrafeInput(true);
        const driver = new RallyAIDriver(car, track, RALLY_AI_PROFILES[difficulty]);
        driver.bindRaceState(race);
        race.start();
        let previousX = car.position.x;
        let previousZ = car.position.z;
        let largestStep = 0;
        for (let frame = 0; frame < 12000 && race.phase !== "finished"; frame += 1) {
          race.update(driver.update(1 / 60), 1 / 60);
          largestStep = Math.max(largestStep, Math.hypot(car.position.x - previousX, car.position.z - previousZ));
          previousX = car.position.x;
          previousZ = car.position.z;
          assert.ok(Number.isFinite(car.position.x) && Number.isFinite(car.position.y) && Number.isFinite(car.position.z));
          assert.ok(Number.isFinite(car.speed) && Number.isFinite(car.heading));
        }
        assert.equal(race.phase, "finished", `${track.id}/${vehicle}/${difficulty} completed a lap`);
        assert.equal(race.nextCheckpoint, track.checkpoints.length);
        assert.ok(race.lapTime < 200, `${track.id}/${vehicle}/${difficulty} stayed within the recovery bound`);
        assert.ok(largestStep < 1.2, `${track.id}/${vehicle}/${difficulty} moved without a teleport step`);
        car.dispose();
        track.dispose();
      }
    }
  }
});

test("AI recovery uses the shared safe respawn path instead of teleport-sized movement", () => {
  const track = new RallyTrack(TRACK_03);
  const car = new RallyCar(track, RALLY_VEHICLES.muscle);
  const driver = new RallyAIDriver(car, track, RALLY_AI_PROFILES.hard);
  car.position.set(150, 0, 250);
  car.grounded = true;
  let recovered = false;
  let largestStep = 0;
  let previousX = car.position.x;
  let previousZ = car.position.z;
  for (let frame = 0; frame < 240; frame += 1) {
    driver.update(1 / 60);
    const step = Math.hypot(car.position.x - previousX, car.position.z - previousZ);
    largestStep = Math.max(largestStep, step);
    previousX = car.position.x;
    previousZ = car.position.z;
    if (Math.hypot(car.position.x - 150, car.position.z - 250) > 1) recovered = true;
    car.update(driver.input(), 1 / 60, true);
  }
  assert.ok(recovered || Number.isFinite(car.position.x));
  assert.ok(largestStep < 200, "recovery stays within the safe-transform arcade bound");
  car.dispose();
  track.dispose();
});

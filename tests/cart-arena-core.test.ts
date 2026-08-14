import assert from "node:assert/strict";
import test from "node:test";
import { RallyTrack } from "../src/rally/RallyTrack";
import { CART_ARENA_TRACK } from "../src/cart/CartArenaTrack";
import { CartArenaSession } from "../src/cart/CartArenaSession";
import {
  CART_WORLD_GRAPH,
  cartWorldNodeById,
  locateCartWorldNode,
  validateCartWorldGraph,
} from "../src/cart/CartWorldGraph";

const DRIVE = { throttle: 1, brake: 0, steer: 0, boost: false } as const;

test("Cart world graph is a reachable arena -> corridor -> arena -> corridor -> boss run", () => {
  assert.deepEqual(validateCartWorldGraph(), []);
  assert.equal(CART_WORLD_GRAPH.startNodeId, "arena-01");
  assert.deepEqual(CART_WORLD_GRAPH.nodes.map((node) => node.kind), ["arena", "corridor", "arena", "corridor", "boss"]);
  assert.deepEqual(cartWorldNodeById("arena-01")?.next, ["corridor-01"]);
  assert.deepEqual(cartWorldNodeById("corridor-01")?.next, ["arena-02"]);
  assert.deepEqual(cartWorldNodeById("arena-02")?.next, ["corridor-02"]);
  assert.deepEqual(cartWorldNodeById("corridor-02")?.next, ["boss-01"]);
  assert.deepEqual(cartWorldNodeById("boss-01")?.next, []);
});

test("authored playable bounds distinguish broad battle plazas from narrow passages", () => {
  const first = locateCartWorldNode(22, 28);
  const passage = locateCartWorldNode(5.5, 72);
  const second = locateCartWorldNode(-24, 116);
  const boss = locateCartWorldNode(30, 210);
  assert.equal(first?.node.id, "arena-01");
  assert.equal(passage?.node.id, "corridor-01");
  assert.equal(second?.node.id, "arena-02");
  assert.equal(boss?.node.id, "boss-01");
  assert.equal(locateCartWorldNode(18, 72), null, "corridor should not behave like another wide race track");
});

test("legacy RallyTrack adapter exposes wide arena surfaces and a narrow central corridor", () => {
  const track = new RallyTrack(CART_ARENA_TRACK);
  try {
    const arenaA = track.queryAt(0, 28);
    const corridor = track.queryAt(0, 72);
    const arenaB = track.queryAt(0, 116);
    const boss = track.queryAt(0, 210);
    assert.ok(arenaA.roadHalfWidth > 20);
    assert.ok(corridor.roadHalfWidth < 10);
    assert.ok(arenaB.roadHalfWidth > 20);
    assert.ok(boss.roadHalfWidth > 20);
  } finally {
    track.dispose();
  }
});

test("CartArenaSession starts in the first combat arena with charge-based turbo", () => {
  const session = new CartArenaSession();
  try {
    const state = session.snapshot();
    assert.equal(state.nodeId, "arena-01");
    assert.equal(state.encounter, "combat");
    assert.equal(state.boostCharges, 2);
    session.step({ ...DRIVE, boost: true });
    assert.equal(session.snapshot().boostCharges, 1);
    assert.equal(session.snapshot().boostActive, true);
  } finally {
    session.dispose();
  }
});

test("arena driving keeps inherited fixed-step behavior stable across render cadences", () => {
  const run = (fps: number) => {
    const session = new CartArenaSession();
    try {
      for (let frame = 0; frame < fps * 2; frame += 1) session.advance(1 / fps, DRIVE);
      const state = session.snapshot();
      return { x: state.x, z: state.z, speed: state.speed, nodeId: state.nodeId };
    } finally {
      session.dispose();
    }
  };
  const at30 = run(30);
  const at60 = run(60);
  const at120 = run(120);
  assert.ok(Math.abs(at30.x - at60.x) < 1e-6);
  assert.ok(Math.abs(at30.z - at60.z) < 1e-6);
  assert.ok(Math.abs(at30.speed - at60.speed) < 1e-6);
  assert.ok(Math.abs(at120.x - at60.x) < 1e-6);
  assert.ok(Math.abs(at120.z - at60.z) < 1e-6);
  assert.ok(Math.abs(at120.speed - at60.speed) < 1e-6);
  assert.equal(at30.nodeId, at60.nodeId);
  assert.equal(at120.nodeId, at60.nodeId);
});

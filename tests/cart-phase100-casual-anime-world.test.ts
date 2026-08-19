import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import {
  CART_CASUAL_ANIME_BOSS,
  CART_CASUAL_ANIME_ENEMY,
  CART_CASUAL_ANIME_FOG,
  CART_CASUAL_ANIME_PLAYER,
  CART_CASUAL_ANIME_PLAYER_ACCENT,
  CART_CASUAL_ANIME_SKY,
  CART_CASUAL_ANIME_THEME,
  cartCasualAnimeColor,
} from "../src/cart/CartRoguePhase100CasualAnimeWorld";

const phase100Source = readFileSync(new URL("../src/cart/CartRoguePhase100CasualAnimeWorld.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/cart/CartRogueRuntime.ts", import.meta.url), "utf8");

function saturation(hex: number): number {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return hsl.s;
}

test("Phase100 remaps the legacy diorama palette into a brighter casual anime palette", () => {
  assert.equal(cartCasualAnimeColor(0x42bdb7), CART_CASUAL_ANIME_PLAYER);
  assert.equal(cartCasualAnimeColor(0x73e0d5), CART_CASUAL_ANIME_PLAYER_ACCENT);
  assert.equal(cartCasualAnimeColor(0xe0d95d), CART_CASUAL_ANIME_ENEMY);
  assert.equal(cartCasualAnimeColor(0x34313a), CART_CASUAL_ANIME_BOSS);
  assert.equal(cartCasualAnimeColor(0xf1cd94), 0xf6b85e);
});

test("core palette roles remain visually separated and saturated", () => {
  const roles = [
    CART_CASUAL_ANIME_SKY,
    CART_CASUAL_ANIME_PLAYER,
    CART_CASUAL_ANIME_PLAYER_ACCENT,
    CART_CASUAL_ANIME_ENEMY,
    CART_CASUAL_ANIME_BOSS,
  ];
  assert.equal(new Set(roles).size, roles.length);
  assert.ok(saturation(CART_CASUAL_ANIME_SKY) > 0.55);
  assert.ok(saturation(CART_CASUAL_ANIME_PLAYER) > 0.55);
  assert.ok(saturation(CART_CASUAL_ANIME_PLAYER_ACCENT) > 0.55);
  assert.notEqual(CART_CASUAL_ANIME_SKY, CART_CASUAL_ANIME_FOG);
});

test("Phase100 uses a lightweight material and lighting pass instead of AAA post processing", () => {
  assert.match(phase100Source, /flatShading = true/);
  assert.match(phase100Source, /roughness = Math\.max/);
  assert.match(phase100Source, /metalness = Math\.min/);
  assert.match(phase100Source, /HemisphereLight/);
  assert.match(phase100Source, /DirectionalLight/);
  assert.match(phase100Source, /reuse-existing-geometry-and-pools/);
  assert.doesNotMatch(phase100Source, /TextureLoader|EffectComposer|OutlinePass|SSAOPass|UnrealBloomPass|new THREE\.InstancedMesh/);
});

test("player, enemies, Titan, obstacles and Phase99 resources all receive the shared visual language", () => {
  assert.match(phase100Source, /HERO_TOY_MECHA/);
  assert.match(phase100Source, /TITAN_TOY_MECHA/);
  assert.match(phase100Source, /ENEMY_/);
  assert.match(phase100Source, /CHUNKY_DESTRUCTIBLE/);
  assert.match(phase100Source, /LIFE_RECOVERY/);
  assert.match(phase100Source, /TURBO_PICKUP/);
  assert.match(phase100Source, new RegExp(CART_CASUAL_ANIME_THEME));
});

test("Phase100 installs after Phase99 without rewriting historical gameplay phase ordering", () => {
  const phase99Import = runtimeSource.indexOf('import "./CartRoguePhase99ResourceReadability";');
  const phase100Import = runtimeSource.indexOf('import "./CartRoguePhase100CasualAnimeWorld";');
  const auditImport = runtimeSource.indexOf('import "./CartGameplayAuditRuntime";');
  assert.ok(phase99Import >= 0);
  assert.ok(phase100Import > phase99Import);
  assert.ok(auditImport > phase100Import);
  assert.match(runtimeSource, /"CartRoguePhase94EscapeRhythmDirector2",\n\] as const;/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RALLY_SETTINGS,
  RALLY_SETTINGS_VERSION,
  parseRallySettings,
} from "../src/rally/RallySettings";

test("settings schema is version 4 and enables vibration by default", () => {
  assert.equal(RALLY_SETTINGS_VERSION, 4);
  assert.equal(DEFAULT_RALLY_SETTINGS.vibrationEnabled, true);
});

test("v3 saves migrate forward with vibration enabled", () => {
  const migrated = parseRallySettings({
    version: 3,
    soundEnabled: false,
    musicEnabled: false,
    cameraShake: false,
    graphicsQuality: "high",
    selectedVehicle: "muscle",
  });
  assert.equal(migrated.soundEnabled, false);
  assert.equal(migrated.musicEnabled, false);
  assert.equal(migrated.cameraShake, false);
  assert.equal(migrated.graphicsQuality, "high");
  assert.equal(migrated.selectedVehicle, "muscle");
  assert.equal(migrated.vibrationEnabled, true);
});

test("v4 saves preserve an explicit vibration preference", () => {
  const parsed = parseRallySettings({ version: 4, vibrationEnabled: false });
  assert.equal(parsed.vibrationEnabled, false);
});

test("unknown settings versions fail safely to defaults", () => {
  const parsed = parseRallySettings({ version: 999, vibrationEnabled: false, graphicsQuality: "high" });
  assert.deepEqual(parsed, DEFAULT_RALLY_SETTINGS);
});

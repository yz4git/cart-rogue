import { RallyCar } from "./RallyCar";
import { RallyRace } from "./RallyRace";
import { RallyRaceMode } from "./RallyRaceMode";
import { createRallyTrack } from "./RallyTrackCatalog";
import { getRallyVehicleDefinition, type RallyVehicleId } from "./VehicleDefinition";
import type { RallyEnvironmentVariant } from "./RallySurface";

/**
 * Shared gameplay construction for WebGL and Canvas adapters. Renderers own
 * visuals, camera and effects; this factory owns the session object graph so
 * they cannot silently drift into different race rules.
 */
export interface RallySessionRuntime {
  track: ReturnType<typeof createRallyTrack>;
  car: RallyCar;
  race: RallyRace;
  raceMode: RallyRaceMode;
}

export function createRallySessionRuntime(trackId: string, vehicleId: RallyVehicleId = "compact", environmentVariant?: RallyEnvironmentVariant): RallySessionRuntime {
  const track = createRallyTrack(trackId, environmentVariant);
  const car = new RallyCar(track, getRallyVehicleDefinition(vehicleId));
  const race = new RallyRace(track, car);
  race.setSteeringAssistMode("strong");
  race.setMobileArcadeInput(true);
  race.setMobileStrafeInput(true);
  const raceMode = new RallyRaceMode(track, race);
  raceMode.setMode("time-attack");
  return { track, car, race, raceMode };
}

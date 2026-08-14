import { RallyTrack } from "./RallyTrack";
import { TRACK_01 } from "./tracks/Track01";
import { TRACK_02 } from "./tracks/Track02";
import { TRACK_03 } from "./tracks/Track03";
import type { RallyTrackDefinition } from "./tracks/TrackDefinition";
import type { RallyEnvironmentVariant } from "./RallySurface";

const TRACK_DEFINITIONS: readonly RallyTrackDefinition[] = [TRACK_01, TRACK_02, TRACK_03];

export function listRallyTrackDefinitions(): readonly RallyTrackDefinition[] {
  return TRACK_DEFINITIONS;
}

export function getRallyTrackDefinition(trackId: string): RallyTrackDefinition | null {
  return TRACK_DEFINITIONS.find((definition) => definition.id === trackId) ?? null;
}

export function createRallyTrack(trackId = TRACK_01.id, environmentVariant?: RallyEnvironmentVariant): RallyTrack {
  const definition = getRallyTrackDefinition(trackId) ?? TRACK_01;
  if (!environmentVariant || definition.environmentVariant === environmentVariant) return new RallyTrack(definition);
  return new RallyTrack({ ...definition, environmentVariant });
}

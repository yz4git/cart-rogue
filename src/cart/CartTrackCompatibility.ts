import type { RallyTrack } from "../rally/RallyTrack";

const initializedTracks = new WeakSet<object>();

/**
 * Cart Rogue reuses RallyTrack for low-level driving queries, but owns its own
 * arena gates and progression. Rally's START / CHECKPOINT / GOAL gate posts are
 * therefore legacy physics in this mode and must never block the authored run.
 */
export function disableCartLegacyRallyGatePosts(track: RallyTrack): number {
  let disabled = 0;
  for (const collider of track.staticColliders) {
    if (!collider.active || collider.source !== "gate-post") continue;
    collider.active = false;
    disabled += 1;
  }
  return disabled;
}

export function ensureCartTrackCompatibility(track: RallyTrack): number {
  const key = track as unknown as object;
  if (initializedTracks.has(key)) return 0;
  initializedTracks.add(key);
  return disableCartLegacyRallyGatePosts(track);
}

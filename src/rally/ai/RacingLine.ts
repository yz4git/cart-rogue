import type { RallyTrack } from "../RallyTrack";

export interface RacingTarget {
  x: number;
  z: number;
  heading: number;
  progress: number;
  curvature: number;
}

function angleDifference(a: number, b: number): number {
  return ((a - b + Math.PI) % (Math.PI * 2)) - Math.PI;
}

export function sampleRacingTarget(track: RallyTrack, distance: number, lookAhead: number): RacingTarget {
  const target = track.sampleAtDistance(distance + lookAhead);
  const before = track.sampleAtDistance(distance + lookAhead - 5);
  const after = track.sampleAtDistance(distance + lookAhead + 5);
  const curvature = Math.abs(angleDifference(after.heading, before.heading)) / 10;
  return {
    x: target.x,
    z: target.z,
    heading: target.heading,
    progress: target.distance / track.length,
    curvature,
  };
}

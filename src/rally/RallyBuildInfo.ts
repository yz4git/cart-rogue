declare const __VOXEL_RALLY_BUILD_ID__: string;

/** Build identity shown only in the opt-in debug telemetry panel. */
export const RALLY_BUILD_ID = typeof __VOXEL_RALLY_BUILD_ID__ === "string"
  ? __VOXEL_RALLY_BUILD_ID__
  : "local";

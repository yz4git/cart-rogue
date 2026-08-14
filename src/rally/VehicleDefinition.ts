export type RallyVehicleId = "compact" | "muscle" | "buggy";

export interface RallyVehicleVisualProfile {
  style: "compact" | "muscle" | "buggy";
  bodyWidth: number;
  bodyLength: number;
  chassisHeight: number;
  hoodWidth: number;
  hoodLength: number;
  hoodHeight: number;
  hoodZ: number;
  cabinWidth: number;
  cabinLength: number;
  cabinHeight: number;
  cabinY: number;
  cabinZ: number;
  wheelRadius: number;
  wheelWidth: number;
  wheelTrack: number;
  frontWheelZ: number;
  rearWheelZ: number;
  bumperWidth: number;
  spoilerWidth: number;
  spoilerY: number;
  fenderHeight: number;
  frame: boolean;
}

export interface RallyVehicleDefinition {
  id: RallyVehicleId;
  name: string;
  accelerationRatio: number;
  maxSpeed: number;
  handling: number;
  offRoadSpeedRatio: number;
  jumpControl: number;
  weight: number;
  collisionBreakPower: number;
  bodyColor: number;
  accentColor: number;
  glassColor: number;
  visual: RallyVehicleVisualProfile;
}

export const RALLY_VEHICLES: Readonly<Record<RallyVehicleId, RallyVehicleDefinition>> = {
  compact: {
    id: "compact",
    name: "Rally Compact",
    accelerationRatio: 1.08,
    maxSpeed: 40,
    handling: 1.05,
    offRoadSpeedRatio: 0.65,
    jumpControl: 1,
    weight: 0.9,
    collisionBreakPower: 0.86,
    bodyColor: 0xe85d4a,
    accentColor: 0xffcf57,
    glassColor: 0x79d9e6,
    visual: {
      style: "compact", bodyWidth: 1.82, bodyLength: 3.2, chassisHeight: 0.46,
      hoodWidth: 1.58, hoodLength: 1.1, hoodHeight: 0.2, hoodZ: 0.84,
      cabinWidth: 1.34, cabinLength: 1.28, cabinHeight: 0.66, cabinY: 1.05, cabinZ: -0.32,
      wheelRadius: 0.37, wheelWidth: 0.28, wheelTrack: 1.82, frontWheelZ: 1.05, rearWheelZ: -1.05,
      bumperWidth: 1.94, spoilerWidth: 1.58, spoilerY: 1.15, fenderHeight: 0.16, frame: false,
    },
  },
  muscle: {
    id: "muscle",
    name: "Rally Muscle",
    accelerationRatio: 0.95,
    maxSpeed: 42,
    handling: 0.82,
    offRoadSpeedRatio: 0.56,
    jumpControl: 0.86,
    weight: 1.35,
    collisionBreakPower: 1.38,
    bodyColor: 0x7866e8,
    accentColor: 0xff9c62,
    glassColor: 0xb5a9ff,
    visual: {
      style: "muscle", bodyWidth: 2.04, bodyLength: 3.72, chassisHeight: 0.52,
      hoodWidth: 1.84, hoodLength: 1.48, hoodHeight: 0.24, hoodZ: 1.0,
      cabinWidth: 1.52, cabinLength: 1.38, cabinHeight: 0.72, cabinY: 1.22, cabinZ: -0.46,
      wheelRadius: 0.42, wheelWidth: 0.31, wheelTrack: 2.02, frontWheelZ: 1.28, rearWheelZ: -1.2,
      bumperWidth: 2.12, spoilerWidth: 1.76, spoilerY: 1.34, fenderHeight: 0.2, frame: false,
    },
  },
  buggy: {
    id: "buggy",
    name: "Rally Buggy",
    accelerationRatio: 1,
    maxSpeed: 40.5,
    handling: 0.94,
    offRoadSpeedRatio: 0.88,
    jumpControl: 1.24,
    weight: 0.75,
    collisionBreakPower: 0.76,
    bodyColor: 0x36b98b,
    accentColor: 0xffe070,
    glassColor: 0x9bf5db,
    visual: {
      style: "buggy", bodyWidth: 1.96, bodyLength: 3.18, chassisHeight: 0.38,
      hoodWidth: 1.44, hoodLength: 0.84, hoodHeight: 0.18, hoodZ: 0.94,
      cabinWidth: 1.32, cabinLength: 1.08, cabinHeight: 0.48, cabinY: 1.04, cabinZ: -0.22,
      wheelRadius: 0.48, wheelWidth: 0.34, wheelTrack: 2.02, frontWheelZ: 1.08, rearWheelZ: -1.02,
      bumperWidth: 2.02, spoilerWidth: 1.7, spoilerY: 1.4, fenderHeight: 0.14, frame: true,
    },
  },
};

export function getRallyVehicleDefinition(id: string): RallyVehicleDefinition {
  return RALLY_VEHICLES[id as RallyVehicleId] ?? RALLY_VEHICLES.compact;
}

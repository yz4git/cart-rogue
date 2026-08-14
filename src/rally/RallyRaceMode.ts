import { RALLY_CONFIG } from "./RallyConfig";
import { RALLY_AI_PROFILES, type AIDriverProfile } from "./ai/AIDriverProfile";
import { RALLY_AI_PERSONALITIES, type AIPersonalityId } from "./ai/AIPersonality";
import { RallyAIDriver } from "./ai/RallyAIDriver";
import { RallyCar } from "./RallyCar";
import { RallyRace } from "./RallyRace";
import { RallyTrack } from "./RallyTrack";
import { RALLY_VEHICLES } from "./VehicleDefinition";
import { RallyFixedStepClock } from "./RallySimulation";
import type { RallyInputState, RallyMode, RallyStats } from "./RallyTypes";

export function rallyModeShowsAI(mode: RallyMode): boolean {
  return mode !== "time-attack";
}

export function rallyPositionChange(previousPosition: number, currentPosition: number): number {
  return previousPosition - currentPosition;
}

interface RaceParticipant {
  id: string;
  car: RallyCar;
  race: RallyRace;
  driver: RallyAIDriver | null;
  finishTime: number | null;
  position: number;
  personality: AIPersonalityId | null;
}

export class RallyRaceMode {
  readonly aiCars: readonly RallyCar[];
  private readonly participants: RaceParticipant[];
  private readonly orderedParticipants: RaceParticipant[] = [];
  private mode: RallyMode = "race";
  private difficulty: AIDriverProfile["id"];
  private readonly simulationClock = new RallyFixedStepClock();
  private previousPlayerPosition = 1;
  private playerPositionChange = 0;
  private playerPositionChangeTimer = 0;
  private readonly trafficCollisionCooldowns = new Map<string, number>();

  constructor(
    readonly track: RallyTrack,
    readonly playerRace: RallyRace,
    difficulty: AIDriverProfile["id"] = "normal",
  ) {
    this.difficulty = difficulty;
    const profile = RALLY_AI_PROFILES[difficulty];
    const personalities: AIPersonalityId[] = ["aggressive", "technical", "safe"];
    const ai = ["ai-01", "ai-02", "ai-03"].map((id, index) => {
      const car = new RallyCar(track, index === 0 ? RALLY_VEHICLES.compact : index === 1 ? RALLY_VEHICLES.buggy : RALLY_VEHICLES.muscle, id);
      const race = new RallyRace(track, car, false, true, "off");
      race.setMobileArcadeInput(true);
      race.setMobileStrafeInput(true);
      const personality = personalities[index] ?? "safe";
      const driver = new RallyAIDriver(car, track, profile, RALLY_AI_PERSONALITIES[personality]);
      return { id, car, race, driver, finishTime: null, position: index + 2, personality };
    });
    this.aiCars = ai.map((participant) => participant.car);
    this.participants = [
      { id: "player", car: playerRace.car, race: playerRace, driver: null, finishTime: null, position: 1, personality: null },
      ...ai,
    ];
    const traffic = this.participants.map((participant) => participant.car);
    this.participants.forEach((participant) => {
      participant.driver?.setTraffic(traffic);
      participant.driver?.bindRaceState(participant.race);
    });
  }

  setMode(mode: RallyMode): void {
    this.mode = mode;
    this.playerRace.car.setDamageEnabled(mode !== "time-attack");
  }

  setDifficulty(difficulty: AIDriverProfile["id"]): void {
    this.difficulty = difficulty;
    const profile = RALLY_AI_PROFILES[difficulty];
    this.participants.forEach((participant) => participant.driver?.setProfile(profile));
  }

  getDifficulty(): AIDriverProfile["id"] {
    return this.difficulty;
  }

  aiPersonalityIds(): readonly AIPersonalityId[] {
    return this.participants.slice(1).map((participant) => participant.personality as AIPersonalityId);
  }

  start(): void {
    this.simulationClock.reset();
    this.trafficCollisionCooldowns.clear();
    this.participants.forEach((participant) => {
      participant.finishTime = null;
      participant.position = 1;
      participant.race.start();
    });
    this.previousPlayerPosition = 1;
    this.playerPositionChange = 0;
    this.playerPositionChangeTimer = 0;
    const start = this.track.sampleCheckpoint(this.track.checkpoints.length);
    const startQuery = this.track.queryAt(start.x, start.z);
    const sideX = -startQuery.tangentZ;
    const sideZ = startQuery.tangentX;
    this.participants.forEach((participant, index) => {
      if (index === 0) return;
      const lane = index % 2 === 0 ? -1.5 : 1.5;
      const distanceBack = 3.8 * Math.ceil(index / 2);
      participant.car.position.set(
        start.x - startQuery.tangentX * distanceBack + sideX * lane,
        start.y + 0.62 + RALLY_CONFIG.vehicle.hoverHeight,
        start.z - startQuery.tangentZ * distanceBack + sideZ * lane,
      );
      participant.car.heading = startQuery.heading;
    });
    this.updatePositions();
  }

  reset(): void {
    this.simulationClock.reset();
    this.trafficCollisionCooldowns.clear();
    this.participants.forEach((participant) => {
      participant.finishTime = null;
      participant.race.reset();
    });
    this.previousPlayerPosition = 1;
    this.playerPositionChange = 0;
    this.playerPositionChangeTimer = 0;
    this.updatePositions();
  }

  update(playerInput: RallyInputState, deltaSeconds: number): void {
    this.playerPositionChangeTimer = Math.max(0, this.playerPositionChangeTimer - Math.max(0, deltaSeconds));
    if (this.playerPositionChangeTimer <= 0) this.playerPositionChange = 0;
    this.simulationClock.advance(deltaSeconds, (fixedDelta) => {
      // Advance every participant in one shared fixed step. This prevents a
      // 30 Hz render frame from updating the player twice before the AI sees
      // the first of those positions, which otherwise changes traffic and
      // overtake decisions at different render cadences.
      for (const [key, remaining] of this.trafficCollisionCooldowns) {
        if (remaining <= fixedDelta) this.trafficCollisionCooldowns.delete(key);
        else this.trafficCollisionCooldowns.set(key, remaining - fixedDelta);
      }
      this.participants[0].race.updateFixed(playerInput, fixedDelta);
      for (let index = 1; index < this.participants.length; index += 1) {
        const participant = this.participants[index];
        const input = participant.driver?.update(fixedDelta) ?? { throttle: 0, brake: 0, steer: 0 };
        participant.race.updateFixed(input, fixedDelta);
      }
      if (this.mode !== "time-attack") this.resolveVehicleCollisions();
      this.participants.forEach((participant) => {
        if (participant.finishTime === null && participant.race.phase === "finished") {
          participant.finishTime = participant.race.lapTime;
        }
      });
    });
    this.updatePositions();
  }

  stats(renderer: "webgl" | "canvas3d"): RallyStats {
    const player = this.participants[0];
    return {
      ...player.race.stats(renderer),
      mode: this.mode,
      position: player.position,
      positionChange: this.playerPositionChange,
      racers: this.participants.length,
    };
  }

  dispose(): void {
    for (const participant of this.participants.slice(1)) participant.car.dispose();
  }

  private updatePositions(): void {
    this.orderedParticipants.length = 0;
    this.orderedParticipants.push(...this.participants);
    this.orderedParticipants.sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      const checkpointDifference = b.race.nextCheckpoint - a.race.nextCheckpoint;
      if (checkpointDifference !== 0) return checkpointDifference;
      return b.race.progress - a.race.progress;
    });
    this.orderedParticipants.forEach((participant, index) => { participant.position = index + 1; });
    const currentPlayerPosition = this.participants[0].position;
    const positionChange = rallyPositionChange(this.previousPlayerPosition, currentPlayerPosition);
    if (positionChange !== 0) {
      this.playerPositionChange = positionChange;
      this.playerPositionChangeTimer = 1.1;
    }
    this.previousPlayerPosition = currentPlayerPosition;
  }

  private resolveVehicleCollisions(): void {
    const collisionRadius = RALLY_CONFIG.vehicle.bodyWidth * 0.6;
    const minimumDistance = collisionRadius * 2;
    for (let firstIndex = 0; firstIndex < this.participants.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < this.participants.length; secondIndex += 1) {
        const first = this.participants[firstIndex].car;
        const second = this.participants[secondIndex].car;
        const pairKey = `${firstIndex}:${secondIndex}`;
        if ((this.trafficCollisionCooldowns.get(pairKey) ?? 0) > 0) continue;
        const dx = second.position.x - first.position.x;
        const dz = second.position.z - first.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance >= minimumDistance) continue;
        const normalX = distance > 0.0001 ? dx / distance : Math.sin(first.heading);
        const normalZ = distance > 0.0001 ? dz / distance : Math.cos(first.heading);
        const separation = minimumDistance - distance;
        // A boosted racer keeps its momentum even when it meets another
        // boosted racer.  The collision still separates both cars, but a
        // boost-vs-boost contact must not silently apply the normal traffic
        // speed penalty to the player.
        const firstBoostRam = first.boostActive;
        const secondBoostRam = second.boostActive;
        first.applyTrafficSeparation(-normalX * separation * 0.5, -normalZ * separation * 0.5, firstBoostRam);
        second.applyTrafficSeparation(normalX * separation * 0.5, normalZ * separation * 0.5, secondBoostRam);
        this.trafficCollisionCooldowns.set(pairKey, 0.08);
      }
    }
  }
}

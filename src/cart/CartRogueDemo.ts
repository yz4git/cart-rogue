import type { CartArenaSessionSnapshot } from "./CartArenaSession";

export interface CartRogueDemoHandle {
  setSteering(value: number): void;
  setBoost(active: boolean): void;
  setBrake(active: boolean): void;
  pause(): void;
  resume(): void;
  getSnapshot(): CartArenaSessionSnapshot;
  dispose(): void;
}

export type CartRogueSnapshotHandler = (snapshot: CartArenaSessionSnapshot) => void;

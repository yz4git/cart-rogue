export type CartRunDifficulty = "normal" | "hard";
export type CartHardGameOverReason = "HULL" | "GAS" | null;

export interface CartHardModeSnapshot {
  difficulty: CartRunDifficulty;
  hardMode: boolean;
  integrity: number;
  maxIntegrity: number;
  gameOver: boolean;
  gameOverReason: CartHardGameOverReason;
  raidHits: number;
  perfectDodges: number;
  pressureSerial: number;
}

export const CART_RUN_DIFFICULTY_EVENT = "cart-run-difficulty";
export const CART_HARD_MODE_SNAPSHOT_EVENT = "cart-hard-mode-snapshot";

let selectedDifficulty: CartRunDifficulty = "normal";

export function setCartRunDifficulty(difficulty: CartRunDifficulty): void {
  selectedDifficulty = difficulty;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CartRunDifficulty>(CART_RUN_DIFFICULTY_EVENT, { detail: difficulty }));
  }
}

export function getCartRunDifficulty(): CartRunDifficulty {
  return selectedDifficulty;
}

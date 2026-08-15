import { configureCartRunMap } from "./CartWorldGraph";

export type CartRunUpgradeId =
  | "reinforced-ram"
  | "titan-breaker"
  | "redline-core"
  | "quick-rack"
  | "demolition-kit"
  | "execution-drive"
  | "pursuit-jammer"
  | "scrap-magnet"
  | "hunter-array"
  | "kill-switch"
  | "launch-control"
  | "overcharge-coil"
  | "signal-scrambler"
  | "salvage-bond";

export type CartUpgradeRarity = "COMMON" | "RARE" | "EPIC";

export interface CartRunUpgradeDefinition {
  id: CartRunUpgradeId;
  name: string;
  shortName: string;
  description: string;
  rarity: CartUpgradeRarity;
  maxRank: number;
}

export interface CartRunUpgradeState extends CartRunUpgradeDefinition {
  rank: number;
}

export interface CartRunModifiers {
  ramDamageMultiplier: number;
  heavyDamageMultiplier: number;
  bossDamageMultiplier: number;
  mobileDamageMultiplier: number;
  redlineDamageMultiplier: number;
  redlineSpeed: number;
  executionThreshold: number;
  executionDamageMultiplier: number;
  steeringSensitivity: number;
  rockSmashSpeedMultiplier: number;
  enemySpeedMultiplier: number;
  scrapMultiplier: number;
  scrapFlatBonus: number;
}

export const CART_RUN_UPGRADES: readonly CartRunUpgradeDefinition[] = [
  {
    id: "reinforced-ram",
    name: "REINFORCED RAM",
    shortName: "RAM+",
    description: "+22% RAM damage per rank.",
    rarity: "COMMON",
    maxRank: 3,
  },
  {
    id: "titan-breaker",
    name: "TITAN BREAKER",
    shortName: "TITAN",
    description: "+28% damage to Heavy and Boss targets per rank.",
    rarity: "RARE",
    maxRank: 3,
  },
  {
    id: "redline-core",
    name: "REDLINE CORE",
    shortName: "REDLINE",
    description: "+20% RAM damage above combat redline speed per rank.",
    rarity: "RARE",
    maxRank: 3,
  },
  {
    id: "quick-rack",
    name: "QUICK RACK",
    shortName: "TURN+",
    description: "+18% touch steering response per rank.",
    rarity: "COMMON",
    maxRank: 3,
  },
  {
    id: "demolition-kit",
    name: "DEMOLITION KIT",
    shortName: "SMASH+",
    description: "Rock-smash speed requirement -18% per rank.",
    rarity: "COMMON",
    maxRank: 3,
  },
  {
    id: "execution-drive",
    name: "EXECUTION DRIVE",
    shortName: "EXECUTE",
    description: "+35% damage to low-HP targets per rank.",
    rarity: "EPIC",
    maxRank: 2,
  },
  {
    id: "pursuit-jammer",
    name: "PURSUIT JAMMER",
    shortName: "JAMMER",
    description: "Enemy movement speed -12% per rank.",
    rarity: "RARE",
    maxRank: 3,
  },
  {
    id: "scrap-magnet",
    name: "SCRAP MAGNET",
    shortName: "SCRAP+",
    description: "+40% SCRAP earned from destroys per rank.",
    rarity: "COMMON",
    maxRank: 3,
  },
  {
    id: "hunter-array",
    name: "HUNTER ARRAY",
    shortName: "HUNTER",
    description: "+24% RAM damage to Chaser, Striker and Orbiter targets per rank.",
    rarity: "RARE",
    maxRank: 3,
  },
  {
    id: "kill-switch",
    name: "KILL SWITCH",
    shortName: "FINISH+",
    description: "Execution Drive activates 7% earlier per rank.",
    rarity: "EPIC",
    maxRank: 2,
  },
  {
    id: "launch-control",
    name: "LAUNCH CONTROL",
    shortName: "REDLINE-",
    description: "Redline damage activates 1.5 speed earlier per rank.",
    rarity: "COMMON",
    maxRank: 3,
  },
  {
    id: "overcharge-coil",
    name: "OVERCHARGE COIL",
    shortName: "VOLT",
    description: "+16% additional redline RAM damage per rank.",
    rarity: "EPIC",
    maxRank: 2,
  },
  {
    id: "signal-scrambler",
    name: "SIGNAL SCRAMBLER",
    shortName: "SLOW+",
    description: "Enemy pursuit speed -8% per rank, stacking with Jammer.",
    rarity: "RARE",
    maxRank: 2,
  },
  {
    id: "salvage-bond",
    name: "SALVAGE BOND",
    shortName: "BONUS¥",
    description: "+2 flat SCRAP for every scored destroy per rank.",
    rarity: "COMMON",
    maxRank: 3,
  },
] as const;

const ranks = new Map<CartRunUpgradeId, number>();
let runResetSerial = 0;

export function resetCartRunProgression(seed?: number): void {
  ranks.clear();
  runResetSerial += 1;
  const generatedSeed = seed ?? (((Date.now() & 0x7fffffff) ^ Math.imul(runResetSerial, 0x45d9f3b)) | 0);
  configureCartRunMap(generatedSeed);
}

export function cartRunUpgradeRank(id: CartRunUpgradeId): number {
  return ranks.get(id) ?? 0;
}

export function applyCartRunUpgrade(id: CartRunUpgradeId): CartRunUpgradeState {
  const definition = cartRunUpgradeById(id);
  const nextRank = Math.min(definition.maxRank, cartRunUpgradeRank(id) + 1);
  ranks.set(id, nextRank);
  return { ...definition, rank: nextRank };
}

export function cartRunUpgradeById(id: CartRunUpgradeId): CartRunUpgradeDefinition {
  const definition = CART_RUN_UPGRADES.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Unknown Cart Rogue upgrade: ${id}`);
  return definition;
}

export function getAppliedCartRunUpgrades(): CartRunUpgradeState[] {
  return CART_RUN_UPGRADES
    .map((definition) => ({ ...definition, rank: cartRunUpgradeRank(definition.id) }))
    .filter((upgrade) => upgrade.rank > 0);
}

export function getCartRunModifiers(): CartRunModifiers {
  const ram = cartRunUpgradeRank("reinforced-ram");
  const titan = cartRunUpgradeRank("titan-breaker");
  const redline = cartRunUpgradeRank("redline-core");
  const steering = cartRunUpgradeRank("quick-rack");
  const demolition = cartRunUpgradeRank("demolition-kit");
  const execution = cartRunUpgradeRank("execution-drive");
  const jammer = cartRunUpgradeRank("pursuit-jammer");
  const scrap = cartRunUpgradeRank("scrap-magnet");
  const hunter = cartRunUpgradeRank("hunter-array");
  const killSwitch = cartRunUpgradeRank("kill-switch");
  const launch = cartRunUpgradeRank("launch-control");
  const overcharge = cartRunUpgradeRank("overcharge-coil");
  const scrambler = cartRunUpgradeRank("signal-scrambler");
  const salvageBond = cartRunUpgradeRank("salvage-bond");
  return {
    ramDamageMultiplier: 1 + ram * 0.22,
    heavyDamageMultiplier: 1 + titan * 0.28,
    bossDamageMultiplier: 1 + titan * 0.28,
    mobileDamageMultiplier: 1 + hunter * 0.24,
    redlineDamageMultiplier: 1 + redline * 0.2 + overcharge * 0.16,
    redlineSpeed: Math.max(12.5, 18 - launch * 1.5),
    executionThreshold: Math.min(0.55, 0.35 + killSwitch * 0.07),
    executionDamageMultiplier: 1 + execution * 0.35,
    steeringSensitivity: 1 + steering * 0.18,
    rockSmashSpeedMultiplier: Math.pow(0.82, demolition),
    enemySpeedMultiplier: Math.max(0.48, 1 - jammer * 0.12 - scrambler * 0.08),
    scrapMultiplier: 1 + scrap * 0.4,
    scrapFlatBonus: salvageBond * 2,
  };
}

export function rollCartRunUpgradeChoices(seed: number, offerIndex: number, rerollIndex = 0, count = 3): CartRunUpgradeDefinition[] {
  const candidates = CART_RUN_UPGRADES.filter((upgrade) => cartRunUpgradeRank(upgrade.id) < upgrade.maxRank);
  if (candidates.length <= count) return candidates.slice();
  let state = mixSeed(seed, offerIndex, rerollIndex);
  const pool = candidates.slice();
  const choices: CartRunUpgradeDefinition[] = [];
  while (choices.length < count && pool.length > 0) {
    state = xorshift32(state);
    const index = Math.abs(state) % pool.length;
    choices.push(pool.splice(index, 1)[0]);
  }
  return choices;
}

export function cartScrapReward(baseAmount: number): number {
  if (baseAmount <= 0) return 0;
  const modifiers = getCartRunModifiers();
  return Math.max(0, Math.round(baseAmount * modifiers.scrapMultiplier + modifiers.scrapFlatBonus));
}

function mixSeed(seed: number, offerIndex: number, rerollIndex: number): number {
  let value = (seed | 0) ^ Math.imul((offerIndex + 1) | 0, 0x45d9f3b) ^ Math.imul((rerollIndex + 11) | 0, 0x27d4eb2d);
  value ^= value >>> 16;
  return value || 0x6d2b79f5;
}

function xorshift32(value: number): number {
  let x = value | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x | 0;
}

export type CartRunUpgradeId =
  | "reinforced-ram"
  | "titan-breaker"
  | "redline-core"
  | "quick-rack"
  | "demolition-kit"
  | "execution-drive"
  | "pursuit-jammer"
  | "scrap-magnet";

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
  redlineDamageMultiplier: number;
  redlineSpeed: number;
  executionThreshold: number;
  executionDamageMultiplier: number;
  steeringSensitivity: number;
  rockSmashSpeedMultiplier: number;
  enemySpeedMultiplier: number;
  scrapMultiplier: number;
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
    description: "+35% damage to targets below 35% HP per rank.",
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
] as const;

const ranks = new Map<CartRunUpgradeId, number>();

export function resetCartRunProgression(): void {
  ranks.clear();
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
  return {
    ramDamageMultiplier: 1 + ram * 0.22,
    heavyDamageMultiplier: 1 + titan * 0.28,
    bossDamageMultiplier: 1 + titan * 0.28,
    redlineDamageMultiplier: 1 + redline * 0.2,
    redlineSpeed: 18,
    executionThreshold: 0.35,
    executionDamageMultiplier: 1 + execution * 0.35,
    steeringSensitivity: 1 + steering * 0.18,
    rockSmashSpeedMultiplier: Math.pow(0.82, demolition),
    enemySpeedMultiplier: Math.max(0.58, 1 - jammer * 0.12),
    scrapMultiplier: 1 + scrap * 0.4,
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
  return Math.max(0, Math.round(baseAmount * getCartRunModifiers().scrapMultiplier));
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

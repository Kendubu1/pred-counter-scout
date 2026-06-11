import { z } from 'zod';

export const DamageEntry = z.object({
  values: z.array(z.number()),
  scaling: z.number().default(0),
  damageType: z.enum(['physical', 'magical', 'true', 'adaptive']).catch('physical'),
});

export type DamageEntryT = z.infer<typeof DamageEntry>;

export interface AbilityDef {
  key: 'PRIMARY' | 'SECONDARY' | 'ALTERNATE' | 'ULTIMATE';
  name: string;
  damagePerRank: number[];      // best damage entry per rank
  scalingPct: number;            // ratio applied to bonus power, in percent
  damageType: 'physical' | 'magical' | 'true';
  cooldowns: number[];           // per rank, seconds
  costs: number[];               // mana per rank
  maxRank: number;
}

export interface BaseStats {
  max_health: number[];
  physical_armor: number[];
  magical_armor: number[];
  max_mana?: number[];           // absent on rage/resourceless heroes (e.g. Eden)
  attack_speed: number[];        // attacks per second, per level
  physical_power: number[];      // base AD per level == basic-attack damage line
  attack_range: number[];
  basic_attack_time: number[];
}

export interface HeroKit {
  slug: string;
  name: string;
  attackType: 'ranged' | 'melee';
  damageType: 'physical' | 'magical' | 'hybrid';
  roles: string[];
  resource: 'mana' | 'other';    // rage/charge heroes have no budgetable pool
  basicScalingPct: number;       // basic-attack ratio on bonus power, percent
  baseStats: BaseStats;
  abilities: AbilityDef[];       // damaging, castable abilities only
  // omeda = all numbers current-patch; mixed = some slots fell back to
  // stale owned data (see LoadedData.staleFallbacks).
  abilitySource: 'omeda' | 'mixed';
}

export interface ItemStats {
  physical_power: number;
  magical_power: number;
  attack_speed: number;
  critical_chance: number;
  physical_penetration: number;
  magical_penetration: number;
  ability_haste: number;
  health: number;
  physical_armor: number;
  magical_armor: number;
  max_mana: number;
  lifesteal: number;
  omnivamp: number;
}

export interface Item {
  slug: string;
  name: string;
  gameId: number | null;         // maps to match inventory_data
  totalPrice: number;
  rarity: string;
  slotType: string;
  stats: ItemStats;
  family: string | null;         // e.g. 'Tainted' (anti-heal); one per build
  antiHeal: boolean;
  heroClass: string | null;      // omeda aggression/class restriction if any
}

export interface DefenseProfile {
  health: number;
  physicalArmor: number;
  magicalArmor: number;
}

export interface SimResult {
  burstCombo: number;            // one cast of each ability + 2 basics, mitigated
  rotation: Record<number, number>; // window seconds -> mitigated damage
  autoDps: number;               // sustained basic-attack DPS, mitigated
  manaSpent10s: number;
  manaPool: number;
  manaFeasible: boolean;
  ehpPhysical: number;
  ehpMagical: number;
}

export interface BuildEval {
  items: string[];               // item names, purchase order
  gold: number;
  objectives: {
    burstVsSquishy: number;
    rot10VsSquishy: number;
    rot20VsBruiser: number;
    autoDps10VsSquishy: number;
    ehpPhysical: number;
    ehpMagical: number;
  };
  manaFeasible: boolean;
}

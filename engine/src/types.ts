import { z } from 'zod';

export const DamageEntry = z.object({
  values: z.array(z.number()),
  scaling: z.number().default(0),
  damageType: z.enum(['physical', 'magical', 'true', 'adaptive']).catch('physical'),
});

export type DamageEntryT = z.infer<typeof DamageEntry>;

/**
 * Heal or shield applied by one cast, parsed from ability text the same
 * way damage is. Multi-tick effects ("X every 0.5s for 3s") are folded
 * into per-cast totals at parse time. Output convention: one beneficiary,
 * even for AoE heals (documented in sim.ts).
 */
export interface HealEntry {
  kind: 'heal' | 'shield';
  valuesPerRank: number[];       // total per cast, per rank
  scalingPct: number;            // total per cast, on bonus power, percent
  powerType: 'physical' | 'magical';
}

export interface AbilityDef {
  key: 'PRIMARY' | 'SECONDARY' | 'ALTERNATE' | 'ULTIMATE';
  name: string;
  damagePerRank: number[];      // best damage entry per rank
  scalingPct: number;            // ratio applied to bonus power, in percent
  pctMaxHealth?: number;         // bonus damage as % of target max health
  // Bonus damage scaled on target CURRENT or MISSING health (the execute pattern,
  // e.g. Lt. Belica's missing-HP ult), per rank. Credited with a health-state
  // factor: current at the assumed live-HP fraction, missing as its complement.
  targetHealthPct?: { pct: number[]; basis: 'current' | 'missing' }[];
  damageType: 'physical' | 'magical' | 'true';
  healing?: HealEntry[];         // heal/shield output per cast (may be the only payload)
  // Self attack-speed steroid per rank (e.g. Sparrow's Heightened Senses,
  // Murdock's Hot Pursuit): a temporary AS buff with no damage line. Carries max
  // these early for the auto-attack spike, so it must feed auto DPS.
  selfAttackSpeedPctPerRank?: number[];
  buffDurationSec?: number;      // approx active duration of the AS buff, for uptime
  // Permanent self stat gains from a leveled ability ("Passive: Gain X physical
  // power" — Feng Mao's Safeguard, Wraith's Surprise Surprise), credited at full
  // uptime. Distinct from the temporary AS steroid above.
  selfStatBuffs?: { stat: keyof ItemStats; perRank: number[] }[];
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
  // Field's recommended max-priority of the basic abilities (kit keys,
  // strongest-maxed-first) from pred.gg recommendedSkills; the sim levels
  // abilities this way instead of guessing. Undefined => heuristic order.
  recommendedMaxOrder?: string[];
  // Full per-level recommended path (kit keys, one per level, the V2 ability
  // chart): the sim tallies ability ranks at a level straight from this when
  // present, so early/mid stages reflect exactly which abilities are online and
  // at what rank. Undefined => fall back to the ult-timing + max-order heuristic.
  recommendedSequence?: string[];
  // A self-shield passive as a fraction of max health (Steel's Cybernetic Shell,
  // 7%): pure effective HP. The Passive slot isn't built into abilities[], so this
  // is the one passive component the EHP model credits; conditional/proc passives
  // (Riktor's lockdown, Gideon's tether) stay unmodeled.
  passiveSelfShieldPctMaxHealth?: number;
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
  heal_shield_increase: number;  // % amp on outgoing heals/shields
  gold_per_second: number;       // support-crest income (crests are 0-price)
  tenacity: number;              // % CC-duration reduction
  movement_speed: number;        // % move speed
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
  healShield10s: number;         // heal+shield output over 10s, one beneficiary
  sustain10s: number;            // self-heal from lifesteal/omnivamp over a 10s fight
  manaSpent10s: number;
  manaPool: number;
  manaFeasible: boolean;
  ehpPhysical: number;
  ehpMagical: number;
  notes?: { applied: string[]; unmodeled: string[]; provisional: boolean };
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
    healShield10s: number;       // support output objective
    utility: number;             // movement_speed + tenacity points in the build
    sustain10s: number;          // drain-tank objective (design doc component C)
  };
  manaFeasible: boolean;
}

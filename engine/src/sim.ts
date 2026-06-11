// Combat simulator: closed-form kit math (docs/v5-engine-design.md,
// component B). Every formula constant comes from fixtures/calibration.json
// and carries a verified flag; nothing here reads winrates.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { AbilityDef, BuildEval, DefenseProfile, HeroKit, Item, ItemStats, SimResult } from './types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface Calibration {
  patch: string;
  constants: Record<string, { value?: unknown; formula?: string; verified: boolean; source: string }>;
  checkpoints: { verified: boolean; table: { minute: number; level: number; gold: Record<string, number> }[] };
  referenceProfiles: Record<string, DefenseProfile>;
}

export function loadCalibration(): Calibration {
  return JSON.parse(readFileSync(path.join(ROOT, 'engine/fixtures/calibration.json'), 'utf8')) as Calibration;
}

export function unverifiedConstants(cal: Calibration): string[] {
  return Object.entries(cal.constants).filter(([, c]) => !c.verified).map(([k]) => k);
}

// ── Item aggregation ──

export function itemTotals(items: Item[]): ItemStats {
  const t: ItemStats = {
    physical_power: 0, magical_power: 0, attack_speed: 0, critical_chance: 0,
    physical_penetration: 0, magical_penetration: 0, ability_haste: 0,
    health: 0, physical_armor: 0, magical_armor: 0, max_mana: 0, lifesteal: 0, omnivamp: 0,
  };
  for (const i of items) {
    for (const k of Object.keys(t) as (keyof ItemStats)[]) t[k] += i.stats[k];
  }
  // Crit chance caps at 100%.
  t.critical_chance = Math.min(t.critical_chance, 100);
  return t;
}

// ── Skill ranks ──

const ULT_LEVELS = [6, 11, 16];

/** Damage growth per rank divided by mid-rank cooldown: the max-first heuristic. */
export function skillPriority(kit: HeroKit): AbilityDef[] {
  const basics = kit.abilities.filter((a) => a.key !== 'ULTIMATE');
  return [...basics].sort((a, b) => {
    const growth = (x: AbilityDef) =>
      ((x.damagePerRank[x.damagePerRank.length - 1] ?? 0) - (x.damagePerRank[0] ?? 0)) /
      Math.max(x.cooldowns[Math.floor(x.cooldowns.length / 2)] ?? 10, 3);
    return growth(b) - growth(a);
  });
}

/**
 * Rank of each ability at a given hero level. Points go one each into the
 * three basics at levels 1-3, then follow max-first priority; ult ranks at
 * 6/11/16 (fixture, unverified).
 */
export function ranksAtLevel(kit: HeroKit, level: number): Map<string, number> {
  const prio = skillPriority(kit);
  const ranks = new Map<string, number>(kit.abilities.map((a) => [a.key, 0]));
  let points = 0;
  for (let lv = 1; lv <= level; lv++) {
    if (ULT_LEVELS.includes(lv) && kit.abilities.some((a) => a.key === 'ULTIMATE')) {
      ranks.set('ULTIMATE', (ranks.get('ULTIMATE') ?? 0) + 1);
      continue;
    }
    if (points < prio.length) {
      const ab = prio[points]!;
      ranks.set(ab.key, (ranks.get(ab.key) ?? 0) + 1);
      points++;
      continue;
    }
    const next = prio.find((a) => (ranks.get(a.key) ?? 0) < a.maxRank);
    if (next) ranks.set(next.key, (ranks.get(next.key) ?? 0) + 1);
  }
  return ranks;
}

// ── Core math ──

export interface SimOptions {
  level: number;
  ranks?: Map<string, number>;     // override ranksAtLevel
  profile?: DefenseProfile | null; // null disables mitigation
  burstBasics?: number;            // basics woven into the burst combo
}

function bonusPowerFor(type: AbilityDef['damageType'], t: ItemStats): number {
  return type === 'magical' ? t.magical_power : t.physical_power;
}

function mitigate(raw: number, type: AbilityDef['damageType'], profile: DefenseProfile | null, t: ItemStats): number {
  if (!profile || type === 'true') return raw;
  const armor = type === 'magical' ? profile.magicalArmor : profile.physicalArmor;
  const flatPen = type === 'magical' ? t.magical_penetration : t.physical_penetration;
  const effective = Math.max(0, armor - flatPen);
  return raw * (100 / (100 + effective));
}

function hastedCooldown(cd: number, haste: number): number {
  return (cd * 100) / (100 + haste);
}

export function abilityHit(ab: AbilityDef, rank: number, t: ItemStats): number {
  if (rank <= 0) return 0;
  const base = ab.damagePerRank[Math.min(rank, ab.damagePerRank.length) - 1] ?? 0;
  return base + (ab.scalingPct / 100) * bonusPowerFor(ab.damageType, t);
}

export function basicHit(kit: HeroKit, level: number, t: ItemStats, critMultiplier: number): number {
  const base = kit.baseStats.physical_power[level - 1] ?? 0;
  const raw = base + (kit.basicScalingPct / 100) * t.physical_power;
  const critAvg = 1 + (t.critical_chance / 100) * (critMultiplier - 1);
  return raw * critAvg;
}

export function attacksPerSecond(kit: HeroKit, level: number, t: ItemStats): number {
  const base = kit.baseStats.attack_speed[level - 1] ?? 1;
  return base * (1 + t.attack_speed / 100);
}

/** Ability-only rotation damage over a window: 1 cast up front + recasts off cooldown. */
export function rotationDamage(kit: HeroKit, opts: SimOptions, t: ItemStats, windowSec: number): number {
  const ranks = opts.ranks ?? ranksAtLevel(kit, opts.level);
  let total = 0;
  for (const ab of kit.abilities) {
    const rank = ranks.get(ab.key) ?? 0;
    if (rank <= 0 || !ab.damagePerRank.length) continue;
    const cd = hastedCooldown(ab.cooldowns[Math.min(rank, ab.cooldowns.length) - 1] ?? 10, t.ability_haste);
    const casts = 1 + Math.floor(windowSec / cd);
    total += mitigate(abilityHit(ab, rank, t), ab.damageType, opts.profile ?? null, t) * casts;
  }
  return total;
}

export function simulate(kit: HeroKit, items: Item[], opts: SimOptions, cal: Calibration): SimResult {
  const t = itemTotals(items);
  const ranks = opts.ranks ?? ranksAtLevel(kit, opts.level);
  const profile = opts.profile ?? null;
  const critMult = (cal.constants.critMultiplier?.value as number) ?? 1.75;
  const lvl = opts.level;

  // Burst: every ability once plus woven basics.
  let burst = 0;
  let manaCombo = 0;
  for (const ab of kit.abilities) {
    const rank = ranks.get(ab.key) ?? 0;
    if (rank <= 0) continue;
    burst += mitigate(abilityHit(ab, rank, t), ab.damageType, profile, t);
    manaCombo += ab.costs[Math.min(rank, ab.costs.length) - 1] ?? 0;
  }
  const basics = opts.burstBasics ?? 2;
  burst += mitigate(basicHit(kit, lvl, t, critMult), 'physical', profile, t) * basics;

  const rotation: Record<number, number> = {};
  for (const w of [3, 6, 10, 20]) rotation[w] = rotationDamage(kit, { ...opts, ranks }, t, w);

  // Sustained auto DPS.
  const autoDps = mitigate(basicHit(kit, lvl, t, critMult), 'physical', profile, t) * attacksPerSecond(kit, lvl, t);

  // Mana over a 10s rotation. Rage/resourceless heroes have no pool to budget.
  let manaSpent10s = 0;
  for (const ab of kit.abilities) {
    const rank = ranks.get(ab.key) ?? 0;
    if (rank <= 0) continue;
    const cd = hastedCooldown(ab.cooldowns[Math.min(rank, ab.cooldowns.length) - 1] ?? 10, t.ability_haste);
    manaSpent10s += (ab.costs[Math.min(rank, ab.costs.length) - 1] ?? 0) * (1 + Math.floor(10 / cd));
  }
  const manaPool = kit.resource === 'mana'
    ? (kit.baseStats.max_mana?.[lvl - 1] ?? 0) + t.max_mana
    : Number.POSITIVE_INFINITY;

  // Own effective HP under the fixture mitigation model.
  const hp = (kit.baseStats.max_health[lvl - 1] ?? 0) + t.health;
  const pArmor = (kit.baseStats.physical_armor[lvl - 1] ?? 0) + t.physical_armor;
  const mArmor = (kit.baseStats.magical_armor[lvl - 1] ?? 0) + t.magical_armor;

  return {
    burstCombo: burst,
    rotation,
    autoDps,
    manaSpent10s,
    manaPool,
    manaFeasible: manaSpent10s <= manaPool,
    ehpPhysical: hp * ((100 + pArmor) / 100),
    ehpMagical: hp * ((100 + mArmor) / 100),
  };
}

// ── Build evaluation against the standard objective vector ──

export function evaluateBuild(kit: HeroKit, items: Item[], level: number, cal: Calibration): BuildEval {
  const squishy = cal.referenceProfiles.squishy!;
  const bruiser = cal.referenceProfiles.bruiser!;
  const vsSquishy = simulate(kit, items, { level, profile: squishy }, cal);
  const vsBruiser = simulate(kit, items, { level, profile: bruiser }, cal);
  return {
    items: items.map((i) => i.name),
    gold: items.reduce((s, i) => s + i.totalPrice, 0),
    objectives: {
      burstVsSquishy: vsSquishy.burstCombo,
      rot10VsSquishy: vsSquishy.rotation[10] ?? 0,
      rot20VsBruiser: vsBruiser.rotation[20] ?? 0,
      autoDps10VsSquishy: vsSquishy.autoDps,
      ehpPhysical: vsSquishy.ehpPhysical,
      ehpMagical: vsSquishy.ehpMagical,
    },
    manaFeasible: vsSquishy.manaFeasible,
  };
}

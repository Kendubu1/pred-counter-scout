// Effect schema and resolver: turns curated effect entries (item passives,
// Eternal blessings, hero augments) into numbers the simulator consumes.
// Design doc component A. Curation rules:
//  - only stated numbers are encoded; nothing is invented
//  - effects whose value depends on unobservable context (stack cadence,
//    positioning, RNG distributions) are kind:"unmodeled" with a note
//  - source vintage is recorded; stale sources mark output provisional
//
// Modeling conventions (simulator semantics, not game constants):
//  - ramped effects credit linearly until rampSeconds, fully after
//  - "current health" procs use 1.0x target max health in burst,
//    0.8x in sustained windows (targets degrade over a fight)
//  - DoT-delivered damage credits in windows >= its duration, and in the
//    burst combo only if the DoT runs 3s or less
//  - "every Nth hit" procs credit 1/N per hit (assumes maintained cadence)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import type { Item, ItemStats } from './types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const StatKey = z.enum([
  'physical_power', 'magical_power', 'attack_speed', 'critical_chance',
  'physical_penetration', 'magical_penetration', 'ability_haste',
  'health', 'physical_armor', 'magical_armor', 'max_mana', 'lifesteal', 'omnivamp',
  'heal_shield_increase', 'gold_per_second', 'tenacity', 'movement_speed',
]);

const DmgType = z.enum(['physical', 'magical', 'true']);

// Ability-scoped effects (hero augments) target the kit slot, not the
// display name: names drift between sources (and stale fallbacks), keys
// do not. The name->key mapping is resolved once, at curation time.
const AbilityKey = z.enum(['PRIMARY', 'SECONDARY', 'ALTERNATE', 'ULTIMATE']);
export type AbilityKeyT = z.infer<typeof AbilityKey>;

const Primitive = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stat_multiplier'), stat: StatKey, pct: z.number() }),
  z.object({ kind: z.literal('stat_flat'), stat: StatKey, base: z.number(), perLevel: z.number().optional(), perMinute: z.number().optional() }),
  z.object({ kind: z.literal('stat_conversion'), from: StatKey, to: StatKey, pct: z.number(), consumesSource: z.boolean().optional() }),
  z.object({
    kind: z.literal('damage_amp'), pct: z.number(), perLevelPct: z.number().optional(), perMinutePct: z.number().optional(),
    scope: z.enum(['all', 'abilities', 'basics', 'ultimate']),
    dotSeconds: z.number().optional(),
    appliesWhen: z.enum(['always', 'window_only', 'burst_only', 'target_armor_gt_125', 'level_gte_10', 'target_below_40', 'target_full_health']).default('always'),
  }),
  z.object({ kind: z.literal('damage_amp_from_crit'), minPct: z.number(), maxPct: z.number(), scope: z.enum(['abilities', 'all']) }),
  z.object({ kind: z.literal('crit_damage_amp'), pct: z.number() }), // critical strikes deal X% more (multiplies the crit multiplier)
  z.object({ kind: z.literal('item_proc_amp'), pct: z.number() }),
  z.object({
    kind: z.literal('on_hit'), flat: z.number().optional(), perLevelFlat: z.number().optional(),
    scalingPct: z.number().optional(), scaleStat: StatKey.optional(),
    pctTargetHealth: z.number().optional(), pctTargetHealthRanged: z.number().optional(),
    healthBasis: z.enum(['max', 'current']).optional(), minDamage: z.number().optional(),
    perLevelPctTargetHealth: z.number().optional(),
    damageType: DmgType, icdSeconds: z.number().optional(), everyN: z.number().optional(),
  }),
  z.object({
    kind: z.literal('on_ability_hit'), flat: z.number().optional(), perLevelFlat: z.number().optional(),
    scalingPct: z.number().optional(), scaleStat: StatKey.optional(),
    pctTargetHealth: z.number().optional(), healthBasis: z.enum(['max', 'current']).optional(),
    damageType: DmgType, icdSeconds: z.number().optional(), rampSeconds: z.number().optional(),
  }),
  z.object({ kind: z.literal('haste'), amount: z.number(), scope: z.enum(['ultimate', 'all']) }),
  // bonus is a FRACTION (Timewarp's "1s every 8s" = 0.125), consumed as
  // cd /= 1 + bonus. Capped at 0.9 so a mis-scaled value (e.g. 12 for "12%")
  // can never collapse a cooldown to the floor and inflate rotation damage.
  z.object({ kind: z.literal('cooldown_rate'), bonus: z.number().min(0).max(0.9), scope: z.literal('non_ultimate') }),
  z.object({ kind: z.literal('percent_pen'), pct: z.number(), damageType: z.enum(['physical', 'magical', 'both']), perItemPct: z.number().optional() }),
  z.object({ kind: z.literal('flat_pen'), amount: z.number(), damageType: z.enum(['physical', 'magical']), rampSeconds: z.number().optional() }),
  z.object({ kind: z.literal('armor_shred'), pct: z.number().optional(), flat: z.number().optional(), damageType: z.enum(['physical', 'magical']), rampSeconds: z.number().optional() }),
  z.object({ kind: z.literal('health_multiplier'), pct: z.number(), perLevelPct: z.number().optional(), perMinutePct: z.number().optional() }),
  z.object({ kind: z.literal('armor_multiplier'), pct: z.number() }),
  z.object({ kind: z.literal('damage_reduction'), pct: z.number(), damageType: z.enum(['physical', 'magical', 'all']) }),
  z.object({ kind: z.literal('shield_per_fight'), base: z.number(), maxAtLevel18: z.number().optional() }),
  z.object({ kind: z.literal('anti_heal'), pct: z.number() }),
  z.object({ kind: z.literal('as_ramp'), pctPerSecond: z.number() }),
  // Raises the attacks/sec cap (Cursed Ring's Broken Chains: "from 3 to 4").
  z.object({ kind: z.literal('attack_speed_cap'), cap: z.number() }),
  // A stat that stacks up over a fight (Plasma Blade: +4% crit/stack to 5).
  // Credited at a mean in-fight uptime fraction (a fight spends part of its
  // time ramping), so it is a fair average rather than the max.
  z.object({ kind: z.literal('ramp_to_stat'), stat: StatKey, perStack: z.number(), maxStacks: z.number(), meanUptime: z.number().optional() }),
  // Execute below a health threshold: the bottom thresholdPct% of the
  // target's HP costs nothing once you reach it, so it is credited as
  // bonus burst equal to thresholdPct% of the target's max health.
  z.object({ kind: z.literal('execute'), thresholdPct: z.number() }),
  // ── ability-scoped primitives (hero augments) ──
  z.object({ kind: z.literal('ability_damage_amp'), abilityKey: AbilityKey, pct: z.number() }),
  z.object({ kind: z.literal('ability_cooldown'), abilityKey: AbilityKey, pct: z.number().optional(), flatSeconds: z.number().optional() }),
  z.object({
    kind: z.literal('ability_bonus_damage'), abilityKey: AbilityKey,
    flat: z.number().optional(), perLevelFlat: z.number().optional(), valuesPerRank: z.array(z.number()).optional(),
    scalingPct: z.number().optional(), scaleStat: StatKey.optional(),
    pctTargetHealth: z.number().optional(), damageType: DmgType,
  }),
  z.object({
    kind: z.literal('ability_heal'), abilityKey: AbilityKey, healKind: z.enum(['heal', 'shield']),
    valuesPerRank: z.array(z.number()).optional(), flat: z.number().optional(),
    scalingPct: z.number().optional(), scaleStat: StatKey.optional(),
  }),
  z.object({ kind: z.literal('shield_on_cast'), flat: z.number(), scalingPct: z.number().optional(), scaleStat: StatKey.optional() }),
  z.object({ kind: z.literal('unmodeled'), note: z.string() }),
]);

const Entry = z.object({
  name: z.string(),
  sourceText: z.string(),
  source: z.string(),          // e.g. "omeda items.json 1.14.4"
  provisional: z.boolean().default(false), // stale/unverified source vintage
  effects: z.array(Primitive),
});

const Registry = z.object({
  _readme: z.string().optional(),
  targets: z.record(z.string(), Entry), // keys: item:<slug> | eternal:<id>:major | eternal:<id>:<minor-slug> | augment:<hero>:<slug>
});

export type EffectEntry = z.infer<typeof Entry>;
export type EffectRegistry = z.infer<typeof Registry>;

let cached: EffectRegistry | null = null;

/** Items/Eternals live in effects.json; the hero-augment catalog encoding
 *  lives in augments.json (keyed augment:<hero>:<catalog-id> so field
 *  evidence joins directly). Both share the schema and one registry. */
export function loadEffects(): EffectRegistry {
  if (!cached) {
    const base = Registry.parse(JSON.parse(readFileSync(path.join(ROOT, 'engine/fixtures/effects.json'), 'utf8')));
    const augments = Registry.parse(JSON.parse(readFileSync(path.join(ROOT, 'engine/fixtures/augments.json'), 'utf8')));
    for (const [k, v] of Object.entries(augments.targets)) {
      if (base.targets[k]) throw new Error(`effect registry key collision: ${k}`);
      base.targets[k] = v;
    }
    cached = base;
  }
  return cached;
}

// ── Resolution: entries + context -> aggregate numbers for the simulator ──

export interface ProcSpec {
  flat: number;
  scalingPct: number;
  scaleStat: keyof ItemStats | null;
  pctTargetHealth: number;
  pctTargetHealthRanged: number;
  healthBasis: 'max' | 'current';
  minDamage: number;
  damageType: 'physical' | 'magical' | 'true';
  icdSeconds: number;
  everyN: number;
  rampSeconds: number;
  fromItem: boolean;   // Demiurge's item-effect amp applies only to these
}

export interface ResolvedEffects {
  statFlat: Partial<Record<keyof ItemStats, number>>;
  statMultipliers: Partial<Record<keyof ItemStats, number>>; // multiplicative factors
  conversions: { from: keyof ItemStats; to: keyof ItemStats; pct: number; consumesSource: boolean }[];
  ampAllPct: number;            // basics + abilities, unconditional
  ampAllWindowPct: number;      // window objectives only (mark-style uptime)
  ampAbilitiesPct: number;
  ampAbilitiesBurstPct: number; // burst-only (e.g. vs full-health targets)
  ampUltPct: number;
  ampAbilitiesFromCrit: { minPct: number; maxPct: number } | null;
  critDamageAmpPct: number;     // multiplies the crit multiplier's bonus portion's base
  ampVsArmorGt125Pct: number;
  itemProcAmpPct: number;
  ultHaste: number;
  cooldownRateNonUlt: number;
  pctPen: { physical: number; magical: number };
  flatPen: { physical: number; magical: number; rampSeconds: number };
  shredPct: { physical: number; magical: number; rampSeconds: number };
  onHitProcs: ProcSpec[];
  onAbilityProcs: ProcSpec[];
  healthMultiplier: number;
  armorMultiplier: number;
  // Incoming-damage-taken multipliers (Stonewall's "mitigate 5% of physical
  // damage"): <1 means less damage taken, i.e. more effective HP. Distinct from
  // armor, which only shifts the armor curve.
  dmgTakenMult: { physical: number; magical: number };
  shieldFlat: number;
  shieldScaling: { stat: keyof ItemStats; pct: number }[]; // shields that scale with build stats
  antiHealPct: number;
  asRampPctPerSecond: number;
  attackSpeedCapOverride: number; // 0 = use the calibration default cap
  executeThresholdPct: number;
  // ── ability-scoped (hero augments) ──
  abilityAmpPct: Partial<Record<AbilityKeyT, number>>;
  abilityCooldownMods: Partial<Record<AbilityKeyT, { pct: number; flatSeconds: number }>>;
  abilityBonuses: {
    abilityKey: AbilityKeyT; flat: number; valuesPerRank: number[];
    scalingPct: number; scaleStat: keyof ItemStats | null;
    pctTargetHealth: number; damageType: 'physical' | 'magical' | 'true';
  }[];
  abilityHeals: {
    abilityKey: AbilityKeyT; healKind: 'heal' | 'shield'; valuesPerRank: number[];
    flat: number; scalingPct: number; scaleStat: keyof ItemStats | null;
  }[];
  provisional: boolean;
  applied: string[];
  unmodeled: string[];
}

export function emptyEffects(): ResolvedEffects {
  return {
    statFlat: {}, statMultipliers: {}, conversions: [],
    ampAllPct: 0, ampAllWindowPct: 0, ampAbilitiesPct: 0, ampAbilitiesBurstPct: 0, ampUltPct: 0,
    ampAbilitiesFromCrit: null, critDamageAmpPct: 0, ampVsArmorGt125Pct: 0, itemProcAmpPct: 0,
    ultHaste: 0, cooldownRateNonUlt: 0,
    pctPen: { physical: 0, magical: 0 },
    flatPen: { physical: 0, magical: 0, rampSeconds: 0 },
    shredPct: { physical: 0, magical: 0, rampSeconds: 0 },
    onHitProcs: [], onAbilityProcs: [],
    healthMultiplier: 1, armorMultiplier: 1, dmgTakenMult: { physical: 1, magical: 1 }, shieldFlat: 0, shieldScaling: [], antiHealPct: 0,
    asRampPctPerSecond: 0, attackSpeedCapOverride: 0, executeThresholdPct: 0,
    abilityAmpPct: {}, abilityCooldownMods: {}, abilityBonuses: [], abilityHeals: [],
    provisional: false, applied: [], unmodeled: [],
  };
}

export interface ResolveCtx {
  level: number;
  minute?: number;      // omitted -> time-scaling effects use base value
  itemCount?: number;   // for per-item scalings (Diamond Tip)
}

export function resolveEntries(keys: string[], ctx: ResolveCtx, registry: EffectRegistry = loadEffects()): ResolvedEffects {
  const out = emptyEffects();
  const lvl = ctx.level;
  const minute = ctx.minute ?? 0;
  const items = ctx.itemCount ?? 0;

  for (const key of keys) {
    const entry = registry.targets[key];
    if (!entry) continue;
    if (entry.provisional) out.provisional = true;
    let modeledAny = false;
    for (const fx of entry.effects) {
      switch (fx.kind) {
        case 'unmodeled':
          out.unmodeled.push(`${entry.name}: ${fx.note}`);
          continue;
        case 'stat_multiplier':
          out.statMultipliers[fx.stat] = (out.statMultipliers[fx.stat] ?? 1) * (1 + fx.pct / 100);
          break;
        case 'stat_flat':
          out.statFlat[fx.stat] = (out.statFlat[fx.stat] ?? 0) + fx.base + (fx.perLevel ?? 0) * lvl + (fx.perMinute ?? 0) * minute;
          break;
        case 'stat_conversion':
          out.conversions.push({ from: fx.from, to: fx.to, pct: fx.pct, consumesSource: fx.consumesSource ?? false });
          break;
        case 'ramp_to_stat':
          // mean of (ramping → capped) over a fight; default 0.6 uptime
          out.statFlat[fx.stat] = (out.statFlat[fx.stat] ?? 0) + fx.perStack * fx.maxStacks * (fx.meanUptime ?? 0.6);
          break;
        case 'execute':
          out.executeThresholdPct += fx.thresholdPct;
          break;
        case 'damage_amp': {
          if (fx.appliesWhen === 'level_gte_10' && lvl < 10) break;
          const pct = fx.pct + (fx.perLevelPct ?? 0) * lvl + (fx.perMinutePct ?? 0) * minute;
          if (fx.appliesWhen === 'target_armor_gt_125') out.ampVsArmorGt125Pct += pct;
          else if (fx.appliesWhen === 'burst_only' || fx.appliesWhen === 'target_full_health') out.ampAbilitiesBurstPct += pct;
          else if (fx.appliesWhen === 'window_only') out.ampAllWindowPct += pct;
          // target-below-40% amps land late in a fight: credit at ~40% uptime
          else if (fx.appliesWhen === 'target_below_40') out.ampAllWindowPct += pct * 0.4;
          else if (fx.scope === 'ultimate') out.ampUltPct += pct;
          else if (fx.scope === 'abilities') out.ampAbilitiesPct += pct;
          else out.ampAllPct += pct;
          break;
        }
        case 'damage_amp_from_crit':
          out.ampAbilitiesFromCrit = { minPct: fx.minPct, maxPct: fx.maxPct };
          break;
        case 'crit_damage_amp':
          out.critDamageAmpPct += fx.pct;
          break;
        case 'item_proc_amp':
          out.itemProcAmpPct += fx.pct;
          break;
        case 'on_hit':
        case 'on_ability_hit': {
          const proc: ProcSpec = {
            flat: (fx.flat ?? 0) + ((fx as { perLevelFlat?: number }).perLevelFlat ?? 0) * lvl,
            scalingPct: fx.scalingPct ?? 0,
            scaleStat: fx.scaleStat ?? null,
            pctTargetHealth: (fx.pctTargetHealth ?? 0) + ((fx as { perLevelPctTargetHealth?: number }).perLevelPctTargetHealth ?? 0) * lvl,
            pctTargetHealthRanged: (fx as { pctTargetHealthRanged?: number }).pctTargetHealthRanged ?? fx.pctTargetHealth ?? 0,
            healthBasis: fx.healthBasis ?? 'max',
            minDamage: (fx as { minDamage?: number }).minDamage ?? 0,
            damageType: fx.damageType,
            icdSeconds: fx.icdSeconds ?? 0,
            everyN: (fx as { everyN?: number }).everyN ?? 1,
            rampSeconds: (fx as { rampSeconds?: number }).rampSeconds ?? 0,
            fromItem: key.startsWith('item:'),
          };
          (fx.kind === 'on_hit' ? out.onHitProcs : out.onAbilityProcs).push(proc);
          break;
        }
        case 'haste':
          if (fx.scope === 'ultimate') out.ultHaste += fx.amount;
          else out.statFlat.ability_haste = (out.statFlat.ability_haste ?? 0) + fx.amount;
          break;
        case 'cooldown_rate':
          out.cooldownRateNonUlt += fx.bonus;
          break;
        case 'percent_pen': {
          const pct = fx.pct + (fx.perItemPct ?? 0) * items;
          // 1.14: percent pen stacks multiplicatively (verified fixture).
          if (fx.damageType === 'both' || fx.damageType === 'physical') {
            out.pctPen.physical = (1 - (1 - out.pctPen.physical / 100) * (1 - pct / 100)) * 100;
          }
          if (fx.damageType === 'both' || fx.damageType === 'magical') {
            out.pctPen.magical = (1 - (1 - out.pctPen.magical / 100) * (1 - pct / 100)) * 100;
          }
          break;
        }
        case 'flat_pen':
          out.flatPen[fx.damageType] += fx.amount;
          out.flatPen.rampSeconds = Math.max(out.flatPen.rampSeconds, fx.rampSeconds ?? 0);
          break;
        case 'armor_shred':
          if (fx.pct) out.shredPct[fx.damageType] += fx.pct;
          if (fx.flat) out.flatPen[fx.damageType] += fx.flat; // same math as flat pen vs one target
          out.shredPct.rampSeconds = Math.max(out.shredPct.rampSeconds, fx.rampSeconds ?? 0);
          break;
        case 'health_multiplier':
          out.healthMultiplier *= 1 + (fx.pct + (fx.perLevelPct ?? 0) * lvl + (fx.perMinutePct ?? 0) * minute) / 100;
          break;
        case 'armor_multiplier':
          out.armorMultiplier *= 1 + fx.pct / 100;
          break;
        case 'damage_reduction': {
          const f = 1 - fx.pct / 100;
          if (fx.damageType !== 'magical') out.dmgTakenMult.physical *= f;
          if (fx.damageType !== 'physical') out.dmgTakenMult.magical *= f;
        }
          break;
        case 'shield_per_fight':
          out.shieldFlat += fx.maxAtLevel18 != null
            ? fx.base + (fx.maxAtLevel18 - fx.base) * ((lvl - 1) / 17)
            : fx.base;
          break;
        case 'anti_heal':
          out.antiHealPct = Math.max(out.antiHealPct, fx.pct);
          break;
        case 'as_ramp':
          out.asRampPctPerSecond += fx.pctPerSecond;
          break;
        case 'attack_speed_cap':
          out.attackSpeedCapOverride = Math.max(out.attackSpeedCapOverride, fx.cap);
          break;
        case 'ability_damage_amp':
          out.abilityAmpPct[fx.abilityKey] = (out.abilityAmpPct[fx.abilityKey] ?? 0) + fx.pct;
          break;
        case 'ability_cooldown': {
          const mod = out.abilityCooldownMods[fx.abilityKey] ?? { pct: 0, flatSeconds: 0 };
          mod.pct += fx.pct ?? 0;
          mod.flatSeconds += fx.flatSeconds ?? 0;
          out.abilityCooldownMods[fx.abilityKey] = mod;
          break;
        }
        case 'ability_bonus_damage':
          out.abilityBonuses.push({
            abilityKey: fx.abilityKey,
            flat: (fx.flat ?? 0) + (fx.perLevelFlat ?? 0) * lvl,
            valuesPerRank: fx.valuesPerRank ?? [],
            scalingPct: fx.scalingPct ?? 0,
            scaleStat: fx.scaleStat ?? null,
            pctTargetHealth: fx.pctTargetHealth ?? 0,
            damageType: fx.damageType,
          });
          break;
        case 'ability_heal':
          out.abilityHeals.push({
            abilityKey: fx.abilityKey, healKind: fx.healKind,
            valuesPerRank: fx.valuesPerRank ?? [],
            flat: fx.flat ?? 0,
            scalingPct: fx.scalingPct ?? 0,
            scaleStat: fx.scaleStat ?? null,
          });
          break;
        case 'shield_on_cast':
          out.shieldFlat += fx.flat;
          if (fx.scalingPct && fx.scaleStat) out.shieldScaling.push({ stat: fx.scaleStat, pct: fx.scalingPct });
          break;
      }
      modeledAny = true;
    }
    if (modeledAny) out.applied.push(entry.name);
  }
  return out;
}

export function resolveItemEffects(itemsInBuild: Item[], ctx: ResolveCtx, registry: EffectRegistry = loadEffects()): ResolvedEffects {
  return resolveEntries(itemsInBuild.map((i) => `item:${i.slug}`), { ...ctx, itemCount: itemsInBuild.length }, registry);
}

export function mergeEffects(a: ResolvedEffects, b: ResolvedEffects): ResolvedEffects {
  const out = emptyEffects();
  for (const e of [a, b]) {
    for (const [k, v] of Object.entries(e.statFlat)) out.statFlat[k as keyof ItemStats] = (out.statFlat[k as keyof ItemStats] ?? 0) + v;
    for (const [k, v] of Object.entries(e.statMultipliers)) out.statMultipliers[k as keyof ItemStats] = (out.statMultipliers[k as keyof ItemStats] ?? 1) * v;
    out.conversions.push(...e.conversions);
    out.ampAllPct += e.ampAllPct; out.ampAllWindowPct += e.ampAllWindowPct;
    out.ampAbilitiesPct += e.ampAbilitiesPct; out.ampAbilitiesBurstPct += e.ampAbilitiesBurstPct;
    out.ampUltPct += e.ampUltPct;
    out.ampAbilitiesFromCrit = e.ampAbilitiesFromCrit ?? out.ampAbilitiesFromCrit;
    out.critDamageAmpPct += e.critDamageAmpPct;
    out.ampVsArmorGt125Pct += e.ampVsArmorGt125Pct;
    out.itemProcAmpPct += e.itemProcAmpPct;
    out.ultHaste += e.ultHaste; out.cooldownRateNonUlt += e.cooldownRateNonUlt;
    out.pctPen.physical = (1 - (1 - out.pctPen.physical / 100) * (1 - e.pctPen.physical / 100)) * 100;
    out.pctPen.magical = (1 - (1 - out.pctPen.magical / 100) * (1 - e.pctPen.magical / 100)) * 100;
    out.flatPen.physical += e.flatPen.physical; out.flatPen.magical += e.flatPen.magical;
    out.flatPen.rampSeconds = Math.max(out.flatPen.rampSeconds, e.flatPen.rampSeconds);
    out.shredPct.physical += e.shredPct.physical; out.shredPct.magical += e.shredPct.magical;
    out.shredPct.rampSeconds = Math.max(out.shredPct.rampSeconds, e.shredPct.rampSeconds);
    out.onHitProcs.push(...e.onHitProcs); out.onAbilityProcs.push(...e.onAbilityProcs);
    out.healthMultiplier *= e.healthMultiplier; out.armorMultiplier *= e.armorMultiplier;
    out.dmgTakenMult.physical *= e.dmgTakenMult.physical; out.dmgTakenMult.magical *= e.dmgTakenMult.magical;
    out.shieldFlat += e.shieldFlat;
    out.shieldScaling.push(...e.shieldScaling);
    out.antiHealPct = Math.max(out.antiHealPct, e.antiHealPct);
    out.asRampPctPerSecond += e.asRampPctPerSecond;
    out.attackSpeedCapOverride = Math.max(out.attackSpeedCapOverride, e.attackSpeedCapOverride);
    for (const [k, v] of Object.entries(e.abilityAmpPct)) {
      out.abilityAmpPct[k as AbilityKeyT] = (out.abilityAmpPct[k as AbilityKeyT] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(e.abilityCooldownMods)) {
      const mod = out.abilityCooldownMods[k as AbilityKeyT] ?? { pct: 0, flatSeconds: 0 };
      mod.pct += v.pct; mod.flatSeconds += v.flatSeconds;
      out.abilityCooldownMods[k as AbilityKeyT] = mod;
    }
    out.abilityBonuses.push(...e.abilityBonuses);
    out.abilityHeals.push(...e.abilityHeals);
    out.provisional = out.provisional || e.provisional;
    out.applied.push(...e.applied); out.unmodeled.push(...e.unmodeled);
  }
  return out;
}

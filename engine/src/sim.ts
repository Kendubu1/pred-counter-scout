// Combat simulator: closed-form kit math (docs/v5-engine-design.md,
// component B). Every formula constant comes from fixtures/calibration.json
// and carries a verified flag; nothing here reads winrates.
//
// Effects (item passives, Eternals, augments) arrive pre-resolved via
// opts.effects (see effects.ts for the modeling conventions). Without
// effects the simulator is pure stat math, as in v0.1.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { AbilityDef, BuildEval, DefenseProfile, HeroKit, Item, ItemStats, SimResult } from './types.js';
import { emptyEffects, resolveItemEffects, type ProcSpec, type ResolvedEffects } from './effects.js';

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
    heal_shield_increase: 0, gold_per_second: 0, tenacity: 0, movement_speed: 0,
  };
  for (const i of items) {
    for (const k of Object.keys(t) as (keyof ItemStats)[]) t[k] += i.stats[k];
  }
  t.critical_chance = Math.min(t.critical_chance, 100);
  return t;
}

/**
 * Item totals with effects applied. Order: item stats, then stat
 * multipliers (Demiurge/Eradicate scale item-granted stats), then flat
 * bonuses from blessings, then conversions (Onslaught, Cursed Corrupted).
 */
export function effectiveTotals(items: Item[], eff: ResolvedEffects): ItemStats {
  const t = itemTotals(items);
  for (const [k, factor] of Object.entries(eff.statMultipliers)) {
    t[k as keyof ItemStats] *= factor;
  }
  for (const [k, add] of Object.entries(eff.statFlat)) {
    t[k as keyof ItemStats] += add;
  }
  for (const c of eff.conversions) {
    t[c.to] += t[c.from] * (c.pct / 100);
    if (c.consumesSource) t[c.from] = 0;
  }
  t.critical_chance = Math.min(t.critical_chance, 100);
  return t;
}

// ── Skill ranks ──

const ULT_LEVELS = [6, 11, 16];

/** Damage-or-heal growth per rank divided by mid-rank cooldown: the
 *  max-first heuristic. Heal/shield growth counts so a support's bread
 *  ability is not ranked last just because it deals no damage. */
export function skillPriority(kit: HeroKit): AbilityDef[] {
  const basics = kit.abilities.filter((a) => a.key !== 'ULTIMATE');
  return [...basics].sort((a, b) => {
    const growth = (x: AbilityDef) => {
      const span = (vals: number[]) => (vals[vals.length - 1] ?? 0) - (vals[0] ?? 0);
      const payload = span(x.damagePerRank) + (x.healing ?? []).reduce((s, h) => s + span(h.valuesPerRank), 0);
      return payload / Math.max(x.cooldowns[Math.floor(x.cooldowns.length / 2)] ?? 10, 3);
    };
    return growth(b) - growth(a);
  });
}

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
  ranks?: Map<string, number>;
  profile?: DefenseProfile | null;  // null disables mitigation
  burstBasics?: number;
  effects?: ResolvedEffects;
}

// Modeling conventions (documented in effects.ts):
const BURST_WINDOW = 2;             // seconds; ramps barely engage in a burst
const CURRENT_HP_FACTOR_WINDOW = 0.8;
const AUTO_DPS_WINDOW = 10;

function bonusPowerFor(type: AbilityDef['damageType'], t: ItemStats): number {
  return type === 'magical' ? t.magical_power : t.physical_power;
}

function rampFactor(windowSec: number, rampSeconds: number): number {
  if (rampSeconds <= 0) return 1;
  return Math.min(1, windowSec / rampSeconds);
}

function mitigate(
  raw: number, type: AbilityDef['damageType'], profile: DefenseProfile | null,
  t: ItemStats, eff: ResolvedEffects, windowSec: number,
): number {
  if (!profile || type === 'true') return raw;
  const armor = type === 'magical' ? profile.magicalArmor : profile.physicalArmor;
  const shred = (type === 'magical' ? eff.shredPct.magical : eff.shredPct.physical) * rampFactor(windowSec, eff.shredPct.rampSeconds);
  const pctPen = type === 'magical' ? eff.pctPen.magical : eff.pctPen.physical;
  const flatPenBase = type === 'magical' ? t.magical_penetration : t.physical_penetration;
  const flatPenFx = (type === 'magical' ? eff.flatPen.magical : eff.flatPen.physical) * rampFactor(windowSec, eff.flatPen.rampSeconds);
  // Order: shred reduces target armor, percent pen ignores a share of the
  // rest (multiplicative per 1.14), flat pen subtracts last.
  const effective = Math.max(0, armor * (1 - shred / 100) * (1 - pctPen / 100) - flatPenBase - flatPenFx);
  return raw * (100 / (100 + effective));
}

function ampFactorAbilities(eff: ResolvedEffects, ab: AbilityDef, isBurst: boolean, profile: DefenseProfile | null, t: ItemStats): number {
  let pct = eff.ampAbilitiesPct + eff.ampAllPct;
  if (!isBurst) pct += eff.ampAllWindowPct;
  if (isBurst) pct += eff.ampAbilitiesBurstPct;
  if (ab.key === 'ULTIMATE') pct += eff.ampUltPct;
  pct += eff.abilityAmpPct[ab.key] ?? 0;
  if (eff.ampAbilitiesFromCrit) {
    const { minPct, maxPct } = eff.ampAbilitiesFromCrit;
    pct += minPct + (maxPct - minPct) * (t.critical_chance / 100);
  }
  if (profile && profile.physicalArmor > 125) pct += eff.ampVsArmorGt125Pct;
  return 1 + pct / 100;
}

/** Per-cast bonus damage from ability-scoped effects (augments). */
function abilityBonusDamage(eff: ResolvedEffects, ab: AbilityDef, rank: number, t: ItemStats, profile: DefenseProfile | null): { raw: number; damageType: 'physical' | 'magical' | 'true' }[] {
  const out: { raw: number; damageType: 'physical' | 'magical' | 'true' }[] = [];
  for (const b of eff.abilityBonuses) {
    if (b.abilityKey !== ab.key) continue;
    let raw = b.flat + (b.valuesPerRank[Math.min(rank, b.valuesPerRank.length) - 1] ?? 0);
    if (b.scaleStat && b.scalingPct) raw += (b.scalingPct / 100) * t[b.scaleStat];
    if (b.pctTargetHealth && profile) raw += (b.pctTargetHealth / 100) * profile.health;
    if (raw > 0) out.push({ raw, damageType: b.damageType });
  }
  return out;
}

/** Shields that scale with build stats (e.g. Abyssal Mantle's +75% MP). */
export function resolvedShieldFlat(eff: ResolvedEffects, t: ItemStats): number {
  return eff.shieldFlat + eff.shieldScaling.reduce((s, e) => s + (e.pct / 100) * t[e.stat], 0);
}

function ampFactorBasics(eff: ResolvedEffects, isBurst: boolean, profile: DefenseProfile | null): number {
  let pct = eff.ampAllPct;
  if (!isBurst) pct += eff.ampAllWindowPct;
  if (profile && profile.physicalArmor > 125) pct += eff.ampVsArmorGt125Pct;
  return 1 + pct / 100;
}

function procDamage(p: ProcSpec, t: ItemStats, profile: DefenseProfile | null, kit: HeroKit, isBurst: boolean, eff: ResolvedEffects): number {
  let dmg = p.flat;
  if (p.scaleStat && p.scalingPct) dmg += (p.scalingPct / 100) * t[p.scaleStat];
  const pctHealth = kit.attackType === 'ranged' && p.pctTargetHealthRanged ? p.pctTargetHealthRanged : p.pctTargetHealth;
  if (pctHealth && profile) {
    const basisFactor = p.healthBasis === 'current' && !isBurst ? CURRENT_HP_FACTOR_WINDOW : 1;
    dmg += Math.max((pctHealth / 100) * profile.health * basisFactor, p.minDamage);
  } else if (pctHealth && !profile) {
    dmg += p.minDamage; // no target model without a profile; floor only
  }
  if (p.fromItem) dmg *= 1 + eff.itemProcAmpPct / 100;
  return dmg;
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

function hastedCooldown(cd: number, haste: number): number {
  return (cd * 100) / (100 + haste);
}

function abilityCooldown(ab: AbilityDef, rank: number, t: ItemStats, eff: ResolvedEffects): number {
  const base = ab.cooldowns[Math.min(rank, ab.cooldowns.length) - 1] ?? 10;
  const haste = t.ability_haste + (ab.key === 'ULTIMATE' ? eff.ultHaste : 0);
  let cd = hastedCooldown(base, haste);
  if (ab.key !== 'ULTIMATE' && eff.cooldownRateNonUlt > 0) cd /= 1 + eff.cooldownRateNonUlt;
  const mod = eff.abilityCooldownMods[ab.key];
  if (mod) cd = cd * (1 - mod.pct / 100) - mod.flatSeconds;
  return Math.max(cd, 0.5);
}

function procCount(casts: number, windowSec: number, icdSeconds: number): number {
  if (icdSeconds <= 0) return casts;
  return Math.min(casts, 1 + Math.floor(windowSec / icdSeconds));
}

/** Ability-only rotation damage over a window: 1 cast up front + recasts off cooldown. */
export function rotationDamage(kit: HeroKit, opts: SimOptions, t: ItemStats, windowSec: number): number {
  const eff = opts.effects ?? emptyEffects();
  const ranks = opts.ranks ?? ranksAtLevel(kit, opts.level);
  const profile = opts.profile ?? null;
  const isBurst = windowSec <= BURST_WINDOW;
  let total = 0;
  let totalCasts = 0;
  for (const ab of kit.abilities) {
    const rank = ranks.get(ab.key) ?? 0;
    if (rank <= 0 || !ab.damagePerRank.length) continue;
    const cd = abilityCooldown(ab, rank, t, eff);
    const casts = 1 + Math.floor(windowSec / cd);
    totalCasts += casts;
    const amp = ampFactorAbilities(eff, ab, isBurst, profile, t);
    const maxHpBonus = ab.pctMaxHealth && profile ? (ab.pctMaxHealth / 100) * profile.health : 0;
    total += mitigate((abilityHit(ab, rank, t) + maxHpBonus) * amp, ab.damageType, profile, t, eff, windowSec) * casts;
    for (const b of abilityBonusDamage(eff, ab, rank, t, profile)) {
      total += mitigate(b.raw, b.damageType, profile, t, eff, windowSec) * casts;
    }
  }
  // Item ICDs are global, not per-ability: crediting procs inside the
  // ability loop let a 4-ability kit collect 4x the procs an 8s ICD
  // allows (the Noxia audit finding, 2026-06-12).
  for (const p of eff.onAbilityProcs) {
    const procs = procCount(totalCasts, windowSec, p.icdSeconds) * rampFactor(windowSec, p.rampSeconds);
    total += mitigate(procDamage(p, t, profile, kit, isBurst, eff), p.damageType, profile, t, eff, windowSec) * procs;
  }
  return total;
}

/**
 * Heal + shield output over a window: 1 cast up front + recasts off
 * cooldown, amount = per-cast total + ratio on bonus power, amplified by
 * heal_shield_increase. Output convention (support model v0): one
 * beneficiary even for AoE heals, no overheal model, target-side
 * received-healing amps not counted.
 */
export function healShieldOutput(kit: HeroKit, opts: SimOptions, t: ItemStats, windowSec: number): number {
  const eff = opts.effects ?? emptyEffects();
  const ranks = opts.ranks ?? ranksAtLevel(kit, opts.level);
  let total = 0;
  for (const ab of kit.abilities) {
    const rank = ranks.get(ab.key) ?? 0;
    const augHeals = eff.abilityHeals.filter((h) => h.abilityKey === ab.key);
    if (rank <= 0 || (!ab.healing?.length && !augHeals.length)) continue;
    const cd = abilityCooldown(ab, rank, t, eff);
    const casts = 1 + Math.floor(windowSec / cd);
    for (const h of ab.healing ?? []) {
      const base = h.valuesPerRank[Math.min(rank, h.valuesPerRank.length) - 1] ?? 0;
      const power = h.powerType === 'magical' ? t.magical_power : t.physical_power;
      total += (base + (h.scalingPct / 100) * power) * casts;
    }
    for (const h of augHeals) {
      let amount = h.flat + (h.valuesPerRank[Math.min(rank, h.valuesPerRank.length) - 1] ?? 0);
      if (h.scaleStat && h.scalingPct) amount += (h.scalingPct / 100) * t[h.scaleStat];
      total += amount * casts;
    }
  }
  return total * (1 + t.heal_shield_increase / 100);
}

/**
 * Total mitigated damage over a short engagement window: ability rotation
 * plus basic attacks. The matchup engine's kill-window numerator.
 */
export function combatDamage(kit: HeroKit, items: Item[], opts: SimOptions, cal: Calibration, windowSec: number): number {
  const eff = opts.effects ?? emptyEffects();
  const t = effectiveTotals(items, eff);
  const profile = opts.profile ?? null;
  const critMult = (((cal.constants.critMultiplier?.value as number) ?? 1.75)) * (1 + eff.critDamageAmpPct / 100);
  const isBurst = windowSec <= BURST_WINDOW;
  let total = rotationDamage(kit, opts, t, windowSec);
  const aps = attacksPerSecond(kit, opts.level, t);
  const hits = aps * windowSec;
  const amp = ampFactorBasics(eff, isBurst, profile);
  total += mitigate(basicHit(kit, opts.level, t, critMult) * amp, 'physical', profile, t, eff, windowSec) * hits;
  for (const p of eff.onHitProcs) {
    const procs = Math.min(hits / p.everyN, p.icdSeconds > 0 ? windowSec / p.icdSeconds : hits / p.everyN);
    total += mitigate(procDamage(p, t, profile, kit, isBurst, eff), p.damageType, profile, t, eff, windowSec) * procs;
  }
  return total;
}

export function simulate(kit: HeroKit, items: Item[], opts: SimOptions, cal: Calibration): SimResult {
  const eff = opts.effects ?? emptyEffects();
  const t = effectiveTotals(items, eff);
  const ranks = opts.ranks ?? ranksAtLevel(kit, opts.level);
  const profile = opts.profile ?? null;
  // Imperator-style effects multiply the (unverified) crit multiplier.
  const critMult = (((cal.constants.critMultiplier?.value as number) ?? 1.75)) * (1 + eff.critDamageAmpPct / 100);
  const lvl = opts.level;

  // Burst: every ability once plus woven basics, burst-window semantics.
  let burst = 0;
  let burstCasts = 0;
  for (const ab of kit.abilities) {
    const rank = ranks.get(ab.key) ?? 0;
    if (rank <= 0 || !ab.damagePerRank.length) continue;
    burstCasts++;
    const amp = ampFactorAbilities(eff, ab, true, profile, t);
    const maxHpBonus = ab.pctMaxHealth && profile ? (ab.pctMaxHealth / 100) * profile.health : 0;
    burst += mitigate((abilityHit(ab, rank, t) + maxHpBonus) * amp, ab.damageType, profile, t, eff, BURST_WINDOW);
    for (const b of abilityBonusDamage(eff, ab, rank, t, profile)) {
      burst += mitigate(b.raw, b.damageType, profile, t, eff, BURST_WINDOW);
    }
  }
  // Global item ICDs: one proc budget for the whole combo, not one per
  // ability (see rotationDamage).
  for (const p of eff.onAbilityProcs) {
    const procs = procCount(burstCasts, BURST_WINDOW, p.icdSeconds) * rampFactor(BURST_WINDOW, p.rampSeconds);
    burst += mitigate(procDamage(p, t, profile, kit, true, eff), p.damageType, profile, t, eff, BURST_WINDOW) * procs;
  }
  const basics = opts.burstBasics ?? 2;
  const basicAmpBurst = ampFactorBasics(eff, true, profile);
  burst += mitigate(basicHit(kit, lvl, t, critMult) * basicAmpBurst, 'physical', profile, t, eff, BURST_WINDOW) * basics;
  for (const p of eff.onHitProcs) {
    const procs = Math.min(basics / p.everyN, p.icdSeconds > 0 ? 1 : basics);
    burst += mitigate(procDamage(p, t, profile, kit, true, eff), p.damageType, profile, t, eff, BURST_WINDOW) * procs;
  }

  const rotation: Record<number, number> = {};
  for (const w of [3, 6, 10, 20]) rotation[w] = rotationDamage(kit, { ...opts, ranks, effects: eff }, t, w);

  // Sustained auto DPS over a 10s engagement: AS ramps credit their mean.
  const apsBase = attacksPerSecond(kit, lvl, t);
  const aps = apsBase * (1 + (eff.asRampPctPerSecond * (AUTO_DPS_WINDOW / 2)) / 100);
  const basicAmp = ampFactorBasics(eff, false, profile);
  let autoDps = mitigate(basicHit(kit, lvl, t, critMult) * basicAmp, 'physical', profile, t, eff, AUTO_DPS_WINDOW) * aps;
  for (const p of eff.onHitProcs) {
    const rate = Math.min(aps / p.everyN, p.icdSeconds > 0 ? 1 / p.icdSeconds : aps / p.everyN);
    autoDps += mitigate(procDamage(p, t, profile, kit, false, eff), p.damageType, profile, t, eff, AUTO_DPS_WINDOW) * rate;
  }

  // Mana over a 10s rotation. Rage/resourceless heroes have no pool to budget.
  let manaSpent10s = 0;
  for (const ab of kit.abilities) {
    const rank = ranks.get(ab.key) ?? 0;
    if (rank <= 0) continue;
    const cd = abilityCooldown(ab, rank, t, eff);
    manaSpent10s += (ab.costs[Math.min(rank, ab.costs.length) - 1] ?? 0) * (1 + Math.floor(10 / cd));
  }
  const manaPool = kit.resource === 'mana'
    ? (kit.baseStats.max_mana?.[lvl - 1] ?? 0) + t.max_mana
    : Number.POSITIVE_INFINITY;

  // Own effective HP under the fixture mitigation model.
  const hp = ((kit.baseStats.max_health[lvl - 1] ?? 0) + t.health) * eff.healthMultiplier + resolvedShieldFlat(eff, t);
  const pArmor = ((kit.baseStats.physical_armor[lvl - 1] ?? 0) + t.physical_armor) * eff.armorMultiplier;
  const mArmor = ((kit.baseStats.magical_armor[lvl - 1] ?? 0) + t.magical_armor) * eff.armorMultiplier;

  // Sustain (component C's drain objective): self-heal from lifesteal on
  // basics and omnivamp on everything, over the 10s engagement. Heals
  // credit off mitigated damage dealt; proc lifesteal interactions are
  // not modeled.
  const sustain10s = (t.lifesteal / 100) * autoDps * 10
    + (t.omnivamp / 100) * (autoDps * 10 + (rotation[10] ?? 0));

  return {
    burstCombo: burst,
    rotation,
    autoDps,
    healShield10s: healShieldOutput(kit, { ...opts, ranks, effects: eff }, t, 10),
    sustain10s,
    manaSpent10s,
    manaPool,
    manaFeasible: manaSpent10s <= manaPool,
    ehpPhysical: hp * ((100 + pArmor) / 100),
    ehpMagical: hp * ((100 + mArmor) / 100),
    notes: { applied: eff.applied, unmodeled: eff.unmodeled, provisional: eff.provisional },
  };
}

// ── Build evaluation against the standard objective vector ──

export function evaluateBuild(kit: HeroKit, items: Item[], level: number, cal: Calibration, effects?: ResolvedEffects): BuildEval {
  const eff = effects ?? resolveItemEffects(items, { level });
  const squishy = cal.referenceProfiles.squishy!;
  const bruiser = cal.referenceProfiles.bruiser!;
  const vsSquishy = simulate(kit, items, { level, profile: squishy, effects: eff }, cal);
  const vsBruiser = simulate(kit, items, { level, profile: bruiser, effects: eff }, cal);
  const totals = effectiveTotals(items, eff);
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
      healShield10s: vsSquishy.healShield10s,
      utility: totals.movement_speed + totals.tenacity,
      sustain10s: vsBruiser.sustain10s, // drain value shows in longer fights
    },
    manaFeasible: vsSquishy.manaFeasible,
  };
}

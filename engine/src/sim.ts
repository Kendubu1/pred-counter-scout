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
  // range/crossCheck support Option-A uncertainty: a constant may carry a
  // plausible [lo,hi] range (swept for robustness) and a crossCheck note when a
  // second source disagrees with the shipped value (e.g. the AS-cap finding).
  constants: Record<string, { value?: unknown; formula?: string; verified: boolean; source: string; range?: number[]; crossCheck?: string }>;
  checkpoints: { verified: boolean; table: { minute: number; level: number; gold: Record<string, number> }[] };
  referenceProfiles: Record<string, DefenseProfile>;
  neutralObjectives?: Record<string, any>;   // jungle objective profiles (Fangtooth, etc.)
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
  const growth = (x: AbilityDef) => {
    const span = (vals: number[]) => (vals[vals.length - 1] ?? 0) - (vals[0] ?? 0);
    const payload = span(x.damagePerRank) + (x.healing ?? []).reduce((s, h) => s + span(h.valuesPerRank), 0);
    return payload / Math.max(x.cooldowns[Math.floor(x.cooldowns.length / 2)] ?? 10, 3);
  };
  // Prefer the field's recommended max order (what players actually level
  // first); abilities outside it fall back to the damage-growth heuristic.
  const rank = kit.recommendedMaxOrder;
  if (rank?.length) {
    return [...basics].sort((a, b) => {
      const ia = rank.indexOf(a.key), ib = rank.indexOf(b.key);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return growth(b) - growth(a);
    });
  }
  return [...basics].sort((a, b) => growth(b) - growth(a));
}

/** Where a kit's ABILITY payload lives. Most casters are tagged 'hybrid' (their
 *  basic scales on physical power while abilities deal magical damage, e.g.
 *  Gideon, Zinx), so kit.damageType alone misclassifies them. We read the majority
 *  damage type of the damaging abilities — what an ability-power build, an on-hit
 *  item choice, and a power-type-aware item pool should all align to. */
export function kitPowerType(kit: HeroKit): 'magical' | 'physical' {
  if (kit.damageType === 'magical') return 'magical';
  if (kit.damageType === 'physical') return 'physical';
  const mag = kit.abilities.filter((a) => a.damageType === 'magical' && a.damagePerRank.length).length;
  const phys = kit.abilities.filter((a) => a.damageType === 'physical' && a.damagePerRank.length).length;
  return mag >= phys && mag > 0 ? 'magical' : 'physical';
}

export function ranksAtLevel(kit: HeroKit, level: number): Map<string, number> {
  const ranks = new Map<string, number>(kit.abilities.map((a) => [a.key, 0]));
  const maxRankOf = new Map<string, number>(kit.abilities.map((a) => [a.key, a.maxRank]));

  // Preferred: tally the real recommended path (the V2 ability chart) point by
  // point up to this level. This is exact about WHICH abilities are online and at
  // what rank at each stage — the ultimate appears only from the level it is
  // actually taken, and basics ramp on the recommended cadence, not a heuristic.
  const seq = kit.recommendedSequence;
  if (seq?.length) {
    for (let lv = 1; lv <= Math.min(level, seq.length); lv++) {
      const key = seq[lv - 1]!;
      const cur = ranks.get(key) ?? 0;
      if (cur < (maxRankOf.get(key) ?? 0)) ranks.set(key, cur + 1);
    }
    return ranks;
  }

  // Fallback (no recommended path): ult at its fixed levels, basics by max-order.
  const prio = skillPriority(kit);
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
  // Mitigation constant K in damage*K/(K+armor). Defaults to 100 (the shipped,
  // behaviour-preserving value); the robustness sweep varies it to test whether
  // a recommendation survives the calibration's "K may be >100" warning.
  mitigationK?: number;
}

// Modeling conventions (documented in effects.ts):
const BURST_WINDOW = 2;             // seconds; ramps barely engage in a burst
const CURRENT_HP_FACTOR_WINDOW = 0.8;
const AUTO_DPS_WINDOW = 10;
const AOE_TARGETS = 2.5;            // assumed enemies an AoE ability hits in a teamfight

function bonusPowerFor(type: AbilityDef['damageType'], t: ItemStats): number {
  return type === 'magical' ? t.magical_power : t.physical_power;
}

/** Bonus damage from current/missing-health scaling (the execute pattern). Current
 *  health is credited at the assumed live-HP fraction (full in a burst, 80% over a
 *  sustained window); missing health as its complement, so a missing-HP finisher is
 *  ~0 against a full target and grows as it's hurt. */
function targetHealthBonus(ab: AbilityDef, rank: number, profile: DefenseProfile | null, isBurst: boolean): number {
  if (!profile || !ab.targetHealthPct?.length) return 0;
  const liveFactor = isBurst ? 1 : CURRENT_HP_FACTOR_WINDOW;
  let bonus = 0;
  for (const th of ab.targetHealthPct) {
    const pct = th.pct[Math.min(rank, th.pct.length) - 1] ?? 0;
    bonus += (pct / 100) * profile.health * (th.basis === 'current' ? liveFactor : 1 - liveFactor);
  }
  return bonus;
}

function rampFactor(windowSec: number, rampSeconds: number): number {
  if (rampSeconds <= 0) return 1;
  return Math.min(1, windowSec / rampSeconds);
}

function mitigate(
  raw: number, type: AbilityDef['damageType'], profile: DefenseProfile | null,
  t: ItemStats, eff: ResolvedEffects, windowSec: number, k = 100,
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
  return raw * (k / (k + effective));
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

export function attacksPerSecond(kit: HeroKit, level: number, t: ItemStats, cap?: number, extraAsPct = 0): number {
  const base = kit.baseStats.attack_speed[level - 1] ?? 1;
  // extraAsPct: attack speed from sources outside item stats (a hero's own
  // steroid ability, uptime-weighted — see selfAttackSpeedPct).
  const aps = base * (1 + (t.attack_speed + extraAsPct) / 100);
  // Predecessor caps attacks/sec (Cursed Ring's tooltip: "from 3 to 4", so the
  // default cap is 3.0). Without it, pen/AS-stacked builds reach 3.5+ and the
  // sim over-credits sustained DPS. Cap value comes from calibration.
  return cap && cap > 0 ? Math.min(aps, cap) : aps;
}

/** Fold permanent self stat gains from leveled abilities (Feng Mao's Safeguard,
 *  Wraith's Surprise Surprise) into the effective item totals — always-on, so they
 *  feed every damage window like an item stat. Mutates and returns t. */
function applySelfStatBuffs(t: ItemStats, kit: HeroKit, ranks: Map<string, number>): ItemStats {
  for (const ab of kit.abilities) {
    if (!ab.selfStatBuffs?.length) continue;
    const rank = ranks.get(ab.key) ?? 0;
    if (rank <= 0) continue;
    for (const b of ab.selfStatBuffs) t[b.stat] += b.perRank[Math.min(rank, b.perRank.length) - 1] ?? 0;
  }
  return t;
}

/** Attack speed from a hero's own steroid abilities (Sparrow's Heightened Senses,
 *  Murdock's Hot Pursuit), uptime-weighted: full in a burst window (you pop it),
 *  buffDuration/cooldown across a sustained window. These have no damage line, so
 *  without this their auto-attack spike is invisible to the sim. */
function selfAttackSpeedPct(kit: HeroKit, ranks: Map<string, number>, t: ItemStats, eff: ResolvedEffects, windowSec: number): number {
  let pct = 0;
  for (const ab of kit.abilities) {
    const perRank = ab.selfAttackSpeedPctPerRank;
    if (!perRank?.length) continue;
    const rank = ranks.get(ab.key) ?? 0;
    if (rank <= 0) continue;
    const val = perRank[Math.min(rank, perRank.length) - 1] ?? 0;
    const uptime = windowSec <= BURST_WINDOW ? 1 : Math.min(1, (ab.buffDurationSec ?? 4) / Math.max(abilityCooldown(ab, rank, t, eff), 1));
    pct += val * uptime;
  }
  return pct;
}

/** The attacks/sec cap for THIS build: the calibration default (3.0), raised
 *  if the build carries a cap-raising effect (Cursed Ring's Broken Chains -> 4). */
function effectiveAsCap(eff: ResolvedEffects, cal: Calibration): number | undefined {
  const base = cal.constants.attackSpeedCap?.value as number | undefined;
  if (eff.attackSpeedCapOverride > 0) return Math.max(eff.attackSpeedCapOverride, base ?? 0);
  return base;
}

/** The mitigation constant K in damage*K/(K+armor). An explicit opts.mitigationK
 *  (set by the robustness sweep) wins; otherwise the calibration value; otherwise
 *  the shipped default of 100. */
function mitigationConstant(opts: SimOptions, cal: Calibration): number {
  return opts.mitigationK ?? (cal.constants.mitigation?.value as number) ?? 100;
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
  const k = opts.mitigationK ?? 100;
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
    const maxHpBonus = (ab.pctMaxHealth && profile ? (ab.pctMaxHealth / 100) * profile.health : 0) + targetHealthBonus(ab, rank, profile, isBurst);
    total += mitigate((abilityHit(ab, rank, t) + maxHpBonus) * amp, ab.damageType, profile, t, eff, windowSec, k) * casts;
    for (const b of abilityBonusDamage(eff, ab, rank, t, profile)) {
      total += mitigate(b.raw, b.damageType, profile, t, eff, windowSec, k) * casts;
    }
  }
  // Item ICDs are global, not per-ability: crediting procs inside the
  // ability loop let a 4-ability kit collect 4x the procs an 8s ICD
  // allows (the Noxia audit finding, 2026-06-12).
  for (const p of eff.onAbilityProcs) {
    const procs = procCount(totalCasts, windowSec, p.icdSeconds) * rampFactor(windowSec, p.rampSeconds);
    total += mitigate(procDamage(p, t, profile, kit, isBurst, eff), p.damageType, profile, t, eff, windowSec, k) * procs;
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
  const ranks = opts.ranks ?? ranksAtLevel(kit, opts.level);
  const t = applySelfStatBuffs(effectiveTotals(items, eff), kit, ranks);
  const profile = opts.profile ?? null;
  const critMult = (((cal.constants.critMultiplier?.value as number) ?? 1.75)) * (1 + eff.critDamageAmpPct / 100);
  const k = mitigationConstant(opts, cal);
  const isBurst = windowSec <= BURST_WINDOW;
  let total = rotationDamage(kit, { ...opts, ranks, mitigationK: k }, t, windowSec);
  const aps = attacksPerSecond(kit, opts.level, t, effectiveAsCap(eff, cal), selfAttackSpeedPct(kit, ranks, t, eff, windowSec));
  const hits = aps * windowSec;
  const amp = ampFactorBasics(eff, isBurst, profile);
  total += mitigate(basicHit(kit, opts.level, t, critMult) * amp, 'physical', profile, t, eff, windowSec, k) * hits;
  for (const p of eff.onHitProcs) {
    const procs = Math.min(hits / p.everyN, p.icdSeconds > 0 ? windowSec / p.icdSeconds : hits / p.everyN);
    total += mitigate(procDamage(p, t, profile, kit, isBurst, eff), p.damageType, profile, t, eff, windowSec, k) * procs;
  }
  return total;
}

export function simulate(kit: HeroKit, items: Item[], opts: SimOptions, cal: Calibration): SimResult {
  const eff = opts.effects ?? emptyEffects();
  const ranks = opts.ranks ?? ranksAtLevel(kit, opts.level);
  const t = applySelfStatBuffs(effectiveTotals(items, eff), kit, ranks);
  const profile = opts.profile ?? null;
  // Imperator-style effects multiply the (unverified) crit multiplier.
  const critMult = (((cal.constants.critMultiplier?.value as number) ?? 1.75)) * (1 + eff.critDamageAmpPct / 100);
  const k = mitigationConstant(opts, cal);
  const lvl = opts.level;

  // Burst: every ability once plus woven basics, burst-window semantics.
  // teamfightBurst mirrors burst but weights AoE abilities by the targets they hit,
  // so a multi-target kit/build is valued for teamfight reach. Single-target parts
  // (basics, single-target procs, execute) count once toward both.
  let burst = 0;
  let teamfightBurst = 0;
  let burstCasts = 0;
  for (const ab of kit.abilities) {
    const rank = ranks.get(ab.key) ?? 0;
    if (rank <= 0 || !ab.damagePerRank.length) continue;
    burstCasts++;
    const amp = ampFactorAbilities(eff, ab, true, profile, t);
    const maxHpBonus = (ab.pctMaxHealth && profile ? (ab.pctMaxHealth / 100) * profile.health : 0) + targetHealthBonus(ab, rank, profile, true);
    let abDmg = mitigate((abilityHit(ab, rank, t) + maxHpBonus) * amp, ab.damageType, profile, t, eff, BURST_WINDOW, k);
    for (const b of abilityBonusDamage(eff, ab, rank, t, profile)) {
      abDmg += mitigate(b.raw, b.damageType, profile, t, eff, BURST_WINDOW, k);
    }
    burst += abDmg;
    teamfightBurst += abDmg * (ab.aoe ? AOE_TARGETS : 1);
  }
  // Global item ICDs: one proc budget for the whole combo, not one per
  // ability (see rotationDamage).
  for (const p of eff.onAbilityProcs) {
    const procs = procCount(burstCasts, BURST_WINDOW, p.icdSeconds) * rampFactor(BURST_WINDOW, p.rampSeconds);
    const d = mitigate(procDamage(p, t, profile, kit, true, eff), p.damageType, profile, t, eff, BURST_WINDOW, k) * procs;
    burst += d; teamfightBurst += d;
  }
  const basics = opts.burstBasics ?? 2;
  const basicAmpBurst = ampFactorBasics(eff, true, profile);
  const basicDmg = mitigate(basicHit(kit, lvl, t, critMult) * basicAmpBurst, 'physical', profile, t, eff, BURST_WINDOW, k) * basics;
  burst += basicDmg; teamfightBurst += basicDmg;
  for (const p of eff.onHitProcs) {
    const procs = Math.min(basics / p.everyN, p.icdSeconds > 0 ? 1 : basics);
    const d = mitigate(procDamage(p, t, profile, kit, true, eff), p.damageType, profile, t, eff, BURST_WINDOW, k) * procs;
    burst += d; teamfightBurst += d;
  }

  // Execute: the bottom thresholdPct% of the target's HP is a free kill once
  // your burst brings them there — credited as bonus burst (only meaningful
  // against a killable target, so it rides the burst objective).
  if (eff.executeThresholdPct > 0 && profile) {
    const ex = (eff.executeThresholdPct / 100) * profile.health;
    burst += ex; teamfightBurst += ex;
  }

  const rotation: Record<number, number> = {};
  for (const w of [3, 6, 10, 20]) rotation[w] = rotationDamage(kit, { ...opts, ranks, effects: eff, mitigationK: k }, t, w);

  // Sustained auto DPS over a 10s engagement: AS ramps credit their mean.
  const asCap = effectiveAsCap(eff, cal);
  const apsBase = attacksPerSecond(kit, lvl, t, asCap, selfAttackSpeedPct(kit, ranks, t, eff, AUTO_DPS_WINDOW));
  const apsRamped = apsBase * (1 + (eff.asRampPctPerSecond * (AUTO_DPS_WINDOW / 2)) / 100);
  const aps = asCap && asCap > 0 ? Math.min(apsRamped, asCap) : apsRamped;
  const basicAmp = ampFactorBasics(eff, false, profile);
  let autoDps = mitigate(basicHit(kit, lvl, t, critMult) * basicAmp, 'physical', profile, t, eff, AUTO_DPS_WINDOW, k) * aps;
  for (const p of eff.onHitProcs) {
    const rate = Math.min(aps / p.everyN, p.icdSeconds > 0 ? 1 / p.icdSeconds : aps / p.everyN);
    autoDps += mitigate(procDamage(p, t, profile, kit, false, eff), p.damageType, profile, t, eff, AUTO_DPS_WINDOW, k) * rate;
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
  const maxHp = ((kit.baseStats.max_health[lvl - 1] ?? 0) + t.health) * eff.healthMultiplier;
  // A self-shield passive (Steel's 7% of max health) is effectively always up out
  // of combat, so it counts as extra effective HP on top of flat item shields.
  const hp = maxHp + resolvedShieldFlat(eff, t) + ((kit.passiveSelfShieldPctMaxHealth ?? 0) / 100) * maxHp;
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
    teamfightBurst,
    rotation,
    autoDps,
    healShield10s: healShieldOutput(kit, { ...opts, ranks, effects: eff }, t, 10),
    sustain10s,
    manaSpent10s,
    manaPool,
    manaFeasible: manaSpent10s <= manaPool,
    // Flat damage-reduction (Stonewall) divides damage taken, i.e. multiplies EHP.
    ehpPhysical: hp * ((k + pArmor) / k) / eff.dmgTakenMult.physical,
    ehpMagical: hp * ((k + mArmor) / k) / eff.dmgTakenMult.magical,
    notes: { applied: eff.applied, unmodeled: eff.unmodeled, provisional: eff.provisional },
  };
}

// ── Mana adequacy (burst-cadence, level- and item-timing-aware) ──
// Mana pressure is a BURST/combo property, not a sustained-DPS one: over a 10s
// rotation cooldowns space casts out and no kit runs dry, but in a skirmish a hero
// dumps several full combos back to back. "Combos before dry" = mana pool / one-
// combo cost is what separates a starved kit (Zinx ~1.9 combos at L9) from a mana-
// rich one (Gideon ~2.9), and a mana item raises it (Zinx + Azure Core -> 3.3). We
// target sustaining ~3 combos before regen; pool and combo cost are both level-
// aware (base mana[level], ranks at level) and item-aware (item mana).
const TARGET_COMBOS = 3;

export function manaSustain(kit: HeroKit, items: Item[], level: number): { pool: number; comboCost: number; combosBeforeDry: number; adequacy: number } {
  if (kit.resource !== 'mana') return { pool: Number.POSITIVE_INFINITY, comboCost: 0, combosBeforeDry: Number.POSITIVE_INFINITY, adequacy: 1 };
  const t = effectiveTotals(items, resolveItemEffects(items, { level }));
  const ranks = ranksAtLevel(kit, level);
  let comboCost = 0;
  for (const ab of kit.abilities) {
    const rank = ranks.get(ab.key) ?? 0;
    if (rank > 0) comboCost += ab.costs[Math.min(rank, ab.costs.length) - 1] ?? 0;
  }
  const pool = (kit.baseStats.max_mana?.[level - 1] ?? 0) + t.max_mana;
  const combosBeforeDry = comboCost > 0 ? pool / comboCost : Number.POSITIVE_INFINITY;
  return { pool, comboCost, combosBeforeDry, adequacy: Math.min(1, combosBeforeDry / TARGET_COMBOS) };
}

// Levels a hero is typically at when their 1st/2nd/3rd completed item comes
// online (laning into early-mid). Mana stops being the binding constraint once
// items and level scale past this, so later stages are not checked.
const MANA_STAGES = [{ count: 1, level: 9 }, { count: 2, level: 12 }, { count: 3, level: 14 }];

/** Worst mana adequacy across the build's early item-timing stages (1 = always
 *  sustainable / resourceless). Drives the search to bring mana online in time. */
export function stagedManaAdequacy(kit: HeroKit, items: Item[]): number {
  if (kit.resource !== 'mana' || !items.length) return 1;
  let worst = 1;
  for (const s of MANA_STAGES) {
    if (items.length < s.count) break;
    worst = Math.min(worst, manaSustain(kit, items.slice(0, s.count), s.level).adequacy);
  }
  return worst;
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
      teamfightVsSquishy: vsSquishy.teamfightBurst,
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

// Loaders. Source priority is patch-correctness driven:
//
//   numbers (ability damage, cooldowns, costs, item stats) -> omeda snapshot,
//     because it tracks the live game. The owned hero-abilities.json was
//     found to carry pre-1.14 values (validated against data/patches/1.14.4
//     digest: Void Breach 95-235 and the 1.14 global cooldown increase are
//     present in omeda, absent in owned). See npm run drift.
//   curated facts (attackType, damageType, names) -> owned hero-profiles.json,
//     derived from omeda text for heroes the owned data lacks.
//
// All joins are by slug.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { AbilityDef, BaseStats, HealEntry, HeroKit, Item, ItemStats } from './types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8')) as T;
}

// Name-prefix families where stacking is pointless or blocked (anti-heal
// line plus shared-passive lines carried over from the v2 engine).
const FAMILY_PREFIXES = ['Tainted', 'Ashenblade', 'Hexbound'];

interface OwnedAbility {
  name: string;
  key: string;
  cooldowns?: number[];
  costs?: number[];
  damage?: { values: number[]; scaling?: number; damageType?: string }[];
}

interface OwnedProfile {
  slug: string;
  name: string;
  attackType: 'ranged' | 'melee';
  damageType: 'physical' | 'magical' | 'hybrid';
  roles?: string[];
}

interface OmedaAbility {
  key?: string;
  display_name?: string;
  game_description?: string;
  menu_description?: string;
  cooldown?: number[];
  cost?: number[];
}

interface OmedaHero {
  slug: string;
  display_name: string;
  roles?: string[];
  base_stats: Record<string, number[]>;
  abilities?: OmedaAbility[];
}

const OMEDA_KEY_MAP: Record<string, AbilityDef['key']> = {
  RMB: 'ALTERNATE', Q: 'PRIMARY', E: 'SECONDARY', R: 'ULTIMATE',
};

// Parse ability damage from text. Pattern A: "dealing 60/85/110/135/160
// <AttackDamageText>(+75%" (power ratio adjacent to a stat tag). Pattern B
// covers ults like Countess: "deals 135/185/235 (+5% ... of the target's
// maximum health) magical damage" (percent-max-health scaling; any inner
// power ratio on the percentage itself is conservatively dropped).
// Per-rank scaling arrays ("+110/115/.../130%") use the mean.
function parseDamage(md: string): { values: number[]; scaling: number; pctMaxHealth?: number; damageType: 'physical' | 'magical' } | null {
  const a = md.match(/deal(?:ing|s)?\s+([\d][\d./]*)\s*<(AttackDamageText|AbilityPowerText)>\(\+([\d./]+)%/);
  if (a) {
    const values = a[1]!.split('/').map(Number).filter((n) => !Number.isNaN(n));
    const scalingParts = a[3]!.split('/').map(Number).filter((n) => !Number.isNaN(n));
    if (!values.length || !scalingParts.length) return null;
    return {
      values,
      scaling: scalingParts.reduce((s, n) => s + n, 0) / scalingParts.length,
      damageType: a[2] === 'AbilityPowerText' ? 'magical' : 'physical',
    };
  }
  const b = md.match(/deal(?:ing|s)?\s+([\d][\d./]*)\s*\(\+([\d.]+)%/);
  if (!b) return null;
  const values = b[1]!.split('/').map(Number).filter((n) => !Number.isNaN(n));
  if (!values.length) return null;
  const tail = md.slice(b.index! + b[0].length, b.index! + b[0].length + 250);
  const typeMatch = tail.match(/(magical|physical)\s+damage/i);
  const damageType = typeMatch ? (typeMatch[1]!.toLowerCase() as 'physical' | 'magical') : 'physical';
  if (/maximum health/i.test(tail.slice(0, 150))) {
    return { values, scaling: 0, pctMaxHealth: Number(b[2]), damageType };
  }
  return { values, scaling: Number(b[2]), damageType };
}

// Parse heal/shield output the way damage is parsed: find every
// "<values> <PowerTag>(+<ratio>%" group, classify by context (a
// restore/heal verb before it, or "Shield" right after it), and fold
// tick cadences ("every 0.5s for 3s") into per-cast totals. Only
// power-tagged amounts are encoded; HealthText-scaled shields and
// passives are skipped (conservative), never guessed.
function parseHealing(md: string): HealEntry[] {
  const out: HealEntry[] = [];
  const re = /([\d][\d./]*)\s*<(AttackDamageText|AbilityPowerText)>\(\+([\d./]+)%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const before = md.slice(Math.max(0, m.index - 60), m.index);
    const afterPlain = md
      .slice(m.index + m[0].length, m.index + m[0].length + 200)
      .replace(/<[^>]*>/g, '')
      .trimStart();
    let kind: HealEntry['kind'] | null = null;
    if (/(?:restor\w*|heal\w*)[^.]{0,30}$/i.test(before)) kind = 'heal';
    else if (/^\)?\s*shield/i.test(afterPlain)) kind = 'shield';
    else if (/^\)?\s*health\b/i.test(afterPlain) && /restor|heal|regen/i.test(before)) kind = 'heal';
    if (!kind) continue;
    const values = m[1]!.split('/').map(Number).filter((n) => !Number.isNaN(n));
    const ratios = m[3]!.split('/').map(Number).filter((n) => !Number.isNaN(n));
    if (!values.length || !ratios.length) continue;
    const tick = afterPlain.match(/every\s+([\d.]+)s\s+(?:for|over)\s+([\d.]+)s/i);
    const ticks = tick ? Math.max(1, Math.floor(Number(tick[2]) / Number(tick[1]))) : 1;
    out.push({
      kind,
      valuesPerRank: values.map((v) => v * ticks),
      scalingPct: (ratios.reduce((s, n) => s + n, 0) / ratios.length) * ticks,
      powerType: m[2] === 'AbilityPowerText' ? 'magical' : 'physical',
    });
  }
  return out;
}

function bestOwnedDamage(ab: OwnedAbility) {
  let best: { values: number[]; scaling?: number; damageType?: string } | null = null;
  for (const d of ab.damage ?? []) {
    if (!d.values?.length) continue;
    if (!best || (d.values[d.values.length - 1] ?? 0) > (best.values[best.values.length - 1] ?? 0)) best = d;
  }
  return best;
}

export interface LoadedData {
  kits: Map<string, HeroKit>;
  items: Map<string, Item>;        // by display name
  itemsBySlug: Map<string, Item>;
  derivedProfiles: string[];       // heroes with no owned profile (derived from omeda)
  staleFallbacks: { slug: string; key: string }[]; // ability numbers taken from stale owned data
}

export function loadData(): LoadedData {
  const ownedAbilities = loadJson<Record<string, { abilities: OwnedAbility[] }>>('data/game-data/hero-abilities.json');
  const profiles = loadJson<OwnedProfile[]>('data/game-data/hero-profiles.json');
  const omedaHeroes = loadJson<OmedaHero[]>('data/omeda/heroes.json');
  const omedaItems = loadJson<{
    game_id: number | null; display_name: string; slug: string; total_price: number | null;
    rarity: string | null; slot_type: string | null; hero_class: string | null;
    stats: Record<string, number> | null;
  }[]>('data/omeda/items.json');

  const profMap = new Map(profiles.map((p) => [p.slug, p]));
  const kits = new Map<string, HeroKit>();
  const derivedProfiles: string[] = [];
  const staleFallbacks: { slug: string; key: string }[] = [];

  for (const om of omedaHeroes) {
    const bs = om.base_stats;
    const need = ['max_health', 'physical_armor', 'magical_armor', 'attack_speed', 'physical_power', 'attack_range', 'basic_attack_time'];
    if (need.some((k) => !bs[k]?.length)) continue;

    const omAbs = new Map<AbilityDef['key'] | 'BASIC', OmedaAbility>();
    for (const ab of om.abilities ?? []) {
      if (ab.key === 'LMB') omAbs.set('BASIC', ab);
      const key = OMEDA_KEY_MAP[ab.key ?? ''];
      if (key) omAbs.set(key, ab);
    }
    const ownedByKey = new Map((ownedAbilities[om.slug]?.abilities ?? []).map((a) => [a.key, a]));

    // Abilities: omeda numbers first, stale owned values only when the
    // current text does not parse (cooldowns/costs still come from omeda).
    const defs: AbilityDef[] = [];
    const damageTypeVotes = { physical: 0, magical: 0 };
    for (const key of ['ALTERNATE', 'PRIMARY', 'SECONDARY', 'ULTIMATE'] as const) {
      const omAb = omAbs.get(key);
      const owned = ownedByKey.get(key);
      const parsed = omAb?.menu_description ? parseDamage(omAb.menu_description) : null;
      const healing = omAb?.menu_description ? parseHealing(omAb.menu_description) : [];
      const ownedDmg = owned ? bestOwnedDamage(owned) : null;
      const cooldowns = omAb?.cooldown?.length ? omAb.cooldown : owned?.cooldowns ?? [];
      const costs = omAb?.cost?.length ? omAb.cost : owned?.costs ?? [];
      if (parsed) {
        defs.push({
          key,
          name: omAb?.display_name ?? owned?.name ?? key,
          damagePerRank: parsed.values,
          scalingPct: parsed.scaling,
          pctMaxHealth: parsed.pctMaxHealth,
          damageType: parsed.damageType,
          healing: healing.length ? healing : undefined,
          cooldowns, costs,
          maxRank: key === 'ULTIMATE' ? 3 : 5,
        });
        damageTypeVotes[parsed.damageType]++;
      } else if (ownedDmg) {
        staleFallbacks.push({ slug: om.slug, key });
        defs.push({
          key,
          name: owned!.name,
          damagePerRank: ownedDmg.values,
          scalingPct: ownedDmg.scaling ?? 0,
          damageType: ownedDmg.damageType === 'magical' ? 'magical' : ownedDmg.damageType === 'true' ? 'true' : 'physical',
          healing: healing.length ? healing : undefined,
          cooldowns, costs,
          maxRank: key === 'ULTIMATE' ? 3 : 5,
        });
      } else if (healing.length) {
        // Pure heal/shield ability (e.g. Muriel's Alacrity): no damage to
        // parse, but it is the support model's whole point.
        defs.push({
          key,
          name: omAb?.display_name ?? owned?.name ?? key,
          damagePerRank: [],
          scalingPct: 0,
          damageType: healing[0]!.powerType,
          healing,
          cooldowns, costs,
          maxRank: key === 'ULTIMATE' ? 3 : 5,
        });
      }
    }
    if (!defs.length) continue;

    // Basic attack: ratio from current text, attack type from its header.
    const basicAb = omAbs.get('BASIC');
    const basicParsed = basicAb?.menu_description?.match(/\(\+([\d.]+)%/);
    const ownedBasic = ownedByKey.get('BASIC');
    const basicScalingPct = basicParsed ? Number(basicParsed[1]) : bestOwnedDamage(ownedBasic ?? { name: '', key: 'BASIC' })?.scaling ?? 100;

    const prof = profMap.get(om.slug);
    if (!prof) derivedProfiles.push(om.slug);
    const attackType: 'ranged' | 'melee' = prof?.attackType
      ?? (/Ranged Basic/i.test(basicAb?.game_description ?? '') ? 'ranged' : 'melee');
    const damageType: HeroKit['damageType'] = prof?.damageType
      ?? (damageTypeVotes.physical && damageTypeVotes.magical ? 'hybrid'
        : damageTypeVotes.magical ? 'magical' : 'physical');

    kits.set(om.slug, {
      slug: om.slug,
      name: prof?.name ?? om.display_name,
      attackType,
      damageType,
      roles: (prof?.roles ?? om.roles ?? []).map((r) => r.toLowerCase()),
      resource: bs.max_mana?.length ? 'mana' : 'other',
      basicScalingPct,
      baseStats: bs as unknown as BaseStats,
      abilities: defs,
      abilitySource: defs.length && staleFallbacks.some((s) => s.slug === om.slug) ? 'mixed' : 'omeda',
    });
  }

  // Items: omeda only. Current-patch stats, direct snake_case keys.
  // Still-unmodeled keys (mana/health regeneration, magical_lifesteal)
  // are dropped; the support stats entered the model with backlog item 7.
  const items = new Map<string, Item>();
  const itemsBySlug = new Map<string, Item>();
  for (const raw of omedaItems) {
    if (!raw.display_name) continue;
    const s = raw.stats ?? {};
    const stats: ItemStats = {
      physical_power: s.physical_power ?? 0,
      magical_power: s.magical_power ?? 0,
      attack_speed: s.attack_speed ?? 0,
      critical_chance: s.critical_chance ?? 0,
      physical_penetration: s.physical_penetration ?? 0,
      magical_penetration: s.magical_penetration ?? 0,
      ability_haste: s.ability_haste ?? 0,
      health: s.max_health ?? 0,
      physical_armor: s.physical_armor ?? 0,
      magical_armor: s.magical_armor ?? 0,
      max_mana: s.max_mana ?? 0,
      lifesteal: s.lifesteal ?? 0,
      omnivamp: s.omnivamp ?? 0,
      heal_shield_increase: s.heal_shield_increase ?? 0,
      gold_per_second: s.gold_per_second ?? 0,
      tenacity: s.tenacity ?? 0,
      movement_speed: s.movement_speed ?? 0,
    };
    const item: Item = {
      slug: raw.slug,
      name: raw.display_name,
      gameId: raw.game_id,
      totalPrice: raw.total_price ?? 0,
      rarity: (raw.rarity ?? '').toUpperCase(),
      slotType: (raw.slot_type ?? '').toUpperCase(),
      stats,
      family: FAMILY_PREFIXES.find((f) => raw.display_name.startsWith(`${f} `)) ?? null,
      antiHeal: raw.display_name.startsWith('Tainted '),
      heroClass: raw.hero_class,
    };
    items.set(item.name, item);
    itemsBySlug.set(item.slug, item);
  }

  return { kits, items, itemsBySlug, derivedProfiles: derivedProfiles.sort(), staleFallbacks };
}

export function completedItems(data: LoadedData): Item[] {
  return [...data.items.values()].filter((i) => {
    if (!(i.rarity === 'EPIC' || i.rarity === 'LEGENDARY')) return false;
    if (!(i.slotType === 'PASSIVE' || i.slotType === 'ACTIVE')) return false;
    if (i.totalPrice <= 0) return false;
    // Statless cheap actives (Divine Potion, 250g) are inventory slots,
    // not build slots: with no stats and no curated effects they carry
    // zero sim value but used to dilute the popular-build baseline.
    const hasStats = Object.values(i.stats).some((v) => v !== 0);
    if (!hasStats && i.totalPrice < 1000) return false;
    return true;
  });
}

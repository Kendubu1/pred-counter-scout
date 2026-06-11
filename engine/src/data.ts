// Loaders that join the owned game data (per-rank ability numbers, curated
// profiles) with the omeda.city snapshot (18-level base stat arrays, item
// game IDs). Owned data is primary for ability and item numbers; the
// snapshot fills what owned data lacks. All joins are by slug.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { AbilityDef, BaseStats, HeroKit, Item, ItemStats } from './types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8')) as T;
}

const ABILITY_KEYS = new Set(['PRIMARY', 'SECONDARY', 'ALTERNATE', 'ULTIMATE']);

// Name-prefix families where stacking is pointless or blocked (anti-heal
// line plus shared-passive lines carried over from the v2 engine).
const FAMILY_PREFIXES = ['Tainted', 'Ashenblade', 'Hexbound'];

interface OwnedAbility {
  name: string;
  key: string;
  type: string;
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

interface OmedaHero {
  slug: string;
  display_name: string;
  base_stats: Record<string, number[]>;
  abilities?: { key?: string; display_name?: string; menu_description?: string; cooldown?: number[]; cost?: number[] }[];
}

// Fallback for kits whose owned damage entries are empty (e.g. Crunch):
// parse "dealing 60/85/110/135/160 <AttackDamageText>(+75%" from omeda
// ability text. Per-rank scaling arrays ("+110/115/.../130%") use the mean.
const OMEDA_KEY_MAP: Record<string, AbilityDef['key']> = {
  RMB: 'ALTERNATE', Q: 'PRIMARY', E: 'SECONDARY', R: 'ULTIMATE',
};

function parseOmedaAbilities(om: OmedaHero): AbilityDef[] {
  const defs: AbilityDef[] = [];
  for (const ab of om.abilities ?? []) {
    const key = OMEDA_KEY_MAP[ab.key ?? ''];
    const md = ab.menu_description ?? '';
    if (!key) continue;
    const m = md.match(/deal(?:ing|s)?\s+([\d][\d./]*)\s*<(AttackDamageText|AbilityPowerText)>\(\+([\d./]+)%/);
    if (!m) continue;
    const values = m[1]!.split('/').map(Number).filter((n) => !Number.isNaN(n));
    const scalingParts = m[3]!.split('/').map(Number).filter((n) => !Number.isNaN(n));
    const scaling = scalingParts.reduce((s, n) => s + n, 0) / Math.max(scalingParts.length, 1);
    if (!values.length) continue;
    defs.push({
      key,
      name: ab.display_name ?? key,
      damagePerRank: values,
      scalingPct: scaling,
      damageType: m[2] === 'AbilityPowerText' ? 'magical' : 'physical',
      cooldowns: ab.cooldown ?? [],
      costs: ab.cost ?? [],
      maxRank: key === 'ULTIMATE' ? 3 : 5,
    });
  }
  return defs;
}

function bestDamageEntry(ab: OwnedAbility) {
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
  missingFromOwned: string[];      // omeda heroes with no owned kit yet
}

export function loadData(): LoadedData {
  const abilities = loadJson<Record<string, { abilities: OwnedAbility[] }>>('data/game-data/hero-abilities.json');
  const profiles = loadJson<OwnedProfile[]>('data/game-data/hero-profiles.json');
  const omedaHeroes = loadJson<OmedaHero[]>('data/omeda/heroes.json');
  const ownedItemsRaw = loadJson<{ items?: unknown[] } | unknown[]>('data/game-data/items.json');
  const omedaItems = loadJson<{ game_id: number | null; display_name: string; slug: string; hero_class: string | null; stats: Record<string, number> }[]>('data/omeda/items.json');

  const profMap = new Map(profiles.map((p) => [p.slug, p]));
  const omedaMap = new Map(omedaHeroes.map((h) => [h.slug, h]));

  const kits = new Map<string, HeroKit>();
  for (const [slug, h] of Object.entries(abilities)) {
    const prof = profMap.get(slug);
    const om = omedaMap.get(slug);
    if (!prof || !om) continue;

    const defs: AbilityDef[] = [];
    let basicScalingPct = 100;
    for (const ab of h.abilities ?? []) {
      const dmg = bestDamageEntry(ab);
      if (ab.key === 'BASIC') {
        if (dmg?.scaling != null) basicScalingPct = dmg.scaling;
        continue;
      }
      if (!ABILITY_KEYS.has(ab.key) || !dmg) continue;
      defs.push({
        key: ab.key as AbilityDef['key'],
        name: ab.name,
        damagePerRank: dmg.values,
        scalingPct: dmg.scaling ?? 0,
        damageType: (dmg.damageType === 'magical' ? 'magical' : dmg.damageType === 'true' ? 'true' : 'physical'),
        cooldowns: ab.cooldowns ?? [],
        costs: ab.costs ?? [],
        maxRank: ab.key === 'ULTIMATE' ? 3 : 5,
      });
    }

    const bs = om.base_stats;
    const need = ['max_health', 'physical_armor', 'magical_armor', 'attack_speed', 'physical_power', 'attack_range', 'basic_attack_time'];
    if (need.some((k) => !bs[k]?.length)) continue;

    // Per-ability merge: owned structured data first, omeda text parse for
    // any castable slot owned data has no damage entry for. 33/49 heroes
    // have at least one such slot (some legitimately: pure mobility skills).
    const ownedKeys = new Set(defs.map((d) => d.key));
    const fromText = parseOmedaAbilities(om).filter((d) => !ownedKeys.has(d.key));
    const finalDefs = [...defs, ...fromText];

    kits.set(slug, {
      slug,
      name: prof.name,
      attackType: prof.attackType,
      damageType: prof.damageType,
      roles: (prof.roles ?? []).map((r) => r.toLowerCase()),
      resource: bs.max_mana?.length ? 'mana' : 'other',
      basicScalingPct,
      baseStats: bs as unknown as BaseStats,
      abilities: finalDefs,
      abilitySource: defs.length === 0 ? 'omeda-text' : fromText.length ? 'merged' : 'owned',
    });
  }

  // Items: owned numbers are primary; omeda supplies game_id for match joins.
  const STAT_MAP: Record<string, keyof ItemStats> = {
    PHYSICAL_POWER: 'physical_power', MAGICAL_POWER: 'magical_power',
    ATTACK_SPEED: 'attack_speed', CRITICAL_CHANCE: 'critical_chance',
    PHYSICAL_PENETRATION: 'physical_penetration', MAGICAL_PENETRATION: 'magical_penetration',
    ABILITY_HASTE: 'ability_haste', HEALTH: 'health',
    PHYSICAL_ARMOR: 'physical_armor', MAGICAL_ARMOR: 'magical_armor',
    MANA: 'max_mana', LIFESTEAL: 'lifesteal', OMNIVAMP: 'omnivamp',
  };
  const emptyStats = (): ItemStats => ({
    physical_power: 0, magical_power: 0, attack_speed: 0, critical_chance: 0,
    physical_penetration: 0, magical_penetration: 0, ability_haste: 0,
    health: 0, physical_armor: 0, magical_armor: 0, max_mana: 0, lifesteal: 0, omnivamp: 0,
  });

  const omedaByName = new Map(omedaItems.map((i) => [i.display_name, i]));
  const rawItems = (Array.isArray(ownedItemsRaw) ? ownedItemsRaw : ownedItemsRaw.items ?? []) as {
    slug: string; data?: { displayName: string; totalPrice?: number; rarity?: string; slotType?: string; stats?: { stat: string; value: number }[] };
  }[];

  const items = new Map<string, Item>();
  const itemsBySlug = new Map<string, Item>();
  for (const raw of rawItems) {
    const d = raw.data;
    if (!d?.displayName) continue;
    const stats = emptyStats();
    for (const s of d.stats ?? []) {
      const key = STAT_MAP[s.stat];
      if (key) stats[key] += s.value;
    }
    const family = FAMILY_PREFIXES.find((f) => d.displayName.startsWith(`${f} `)) ?? null;
    const om = omedaByName.get(d.displayName);
    const item: Item = {
      slug: raw.slug,
      name: d.displayName,
      gameId: om?.game_id ?? null,
      totalPrice: d.totalPrice ?? 0,
      rarity: d.rarity ?? '',
      slotType: d.slotType ?? '',
      stats,
      family,
      antiHeal: d.displayName.startsWith('Tainted '),
      heroClass: om?.hero_class ?? null,
    };
    items.set(item.name, item);
    itemsBySlug.set(item.slug, item);
  }

  const missingFromOwned = omedaHeroes.map((h) => h.slug).filter((s) => !kits.has(s)).sort();
  return { kits, items, itemsBySlug, missingFromOwned };
}

export function completedItems(data: LoadedData): Item[] {
  return [...data.items.values()].filter(
    (i) => (i.rarity === 'EPIC' || i.rarity === 'LEGENDARY') && i.slotType !== 'CREST' && i.totalPrice > 0,
  );
}

// Game catalog snapshot from pred.gg: every hero (kit text, per-rank cooldowns
// and costs, 18-level base stats) and every item (stats, effects, prices,
// build tree) for the CURRENT patch, written to data/catalog/.
//
//   PREDGG_CLIENT_ID=... PREDGG_CLIENT_SECRET=... npm run catalog
//
// WHY THIS EXISTS: data/omeda/ was a snapshot of omeda.city's catalog, and
// omeda stopped publishing on 2026-08-28 (lessons.md 2026-09-21). Every patch
// since then (1.17, 1.17.2) and every hero since then (Baron Valmont) was
// invisible to the engine. pred.gg serves the same catalog from the same game
// files, version-tagged, so this replaces the omeda snapshot outright.
//
// The output keeps the omeda file SHAPE exactly (snake_case keys, omeda enum
// spellings, cumulative per-level stat arrays, closed-tag markup), so every
// consumer only changes its path. The mapping was verified field by field
// against the frozen omeda payload on 2026-10-14: ability keys, stat order,
// ability icons, item game_ids and slugs agree on all 54 shared heroes and
// 270 items; every text that differs differs only by a balance change.
//
// Numeric `id`s are carried forward from the previous catalog (first seeded
// from the retired omeda snapshot's ids) because committed postgame facts and the
// pred.gg match adapter key heroes by them. A hero new to the catalog gets
// the next free id; `predgg_id` records pred.gg's own id.
//
// Three sequential requests (heroes, items, versions), identified UA,
// retry/backoff via gql(). Content-hashed like the old snapshot, so
// contentChangedAt only moves when the payload actually changes.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';
import { catalogBaseStat, catalogItemStat } from '../catalog-stats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'data/catalog');

type PgAbility = {
  key: string; displayName: string; cooldown: number[] | null; cost: number[] | null;
  menuDescription: string | null; gameDescription: string | null; icon: string | null;
};
type PgHero = {
  id: string; slug: string;
  data: {
    name: string; displayName: string; icon: string | null; roles: string[]; classes: string[];
    mainAttributes: { abilityPower: number; attackPower: number; durability: number; mobility: number } | null;
    attributes: { stat: string; values: number[] }[];
    abilities: PgAbility[];
    version: { id: string; name: string; releaseDate: string } | null;
  } | null;
};
type PgItem = {
  id: string; slug: string | null;
  data: {
    gameId: number | null; name: string; displayName: string; icon: string | null;
    price: number | null; totalPrice: number | null; slotType: string | null; rarity: string | null;
    aggressionType: string | null; class: string | null;
    stats: { stat: string; value: number }[];
    effects: { name: string; active: boolean; condition: string | null; cooldown: string | null; text: string | null }[];
    buildsFrom: { name: string }[] | null; buildsInto: { name: string }[] | null;
    version: { id: string; name: string; releaseDate: string } | null;
  } | null;
};

const ABILITY_KEY: Record<string, string> = {
  BASIC: 'LMB', ALTERNATE: 'RMB', PRIMARY: 'Q', SECONDARY: 'E', ULTIMATE: 'R', PASSIVE: 'Passive',
};

// pred.gg hero attribute -> omeda base_stats key. Values arrive as
// [level-1 base, +growth at 2, +growth at 3, ...]; omeda stored the running
// total per level, collapsed to one value when it never changes.
const BASE_STAT: Record<string, string> = {
  MAX_HEALTH: 'max_health', DAMAGE: 'physical_power', ATTACK_SPEED: 'attack_speed',
  MAX_MANA: 'max_mana', MANA_REGEN: 'base_mana_regeneration', HEALTH_REGEN: 'base_health_regeneration',
  BASIC_ARMOR: 'physical_armor', ABILITY_ARMOR: 'magical_armor', MOVEMENT_SPEED: 'base_movement_speed',
  BASIC_ATTACK_TIME: 'basic_attack_time', CLEAVE: 'cleave', ATTACK_RANGE: 'attack_range',
  MAX_RAGE: 'max_rage', ENERGY: 'energy', ENERGY_REGEN: 'energy_regen', MAX_ENERGY: 'max_energy',
};

const ITEM_STAT: Record<string, string> = {
  PHYSICAL_POWER: 'physical_power', MAGICAL_POWER: 'magical_power', ATTACK_SPEED: 'attack_speed',
  PHYSICAL_ARMOR: 'physical_armor', MAGICAL_ARMOR: 'magical_armor', HEALTH: 'max_health', MANA: 'max_mana',
  ABILITY_HASTE: 'ability_haste', PHYSICAL_PENETRATION: 'physical_penetration',
  MAGICAL_PENETRATION: 'magical_penetration', BASE_MANA_REGENERATION: 'mana_regeneration',
  BASE_HEALTH_REGENERATION: 'health_regeneration', GOLD_PER_SECOND: 'gold_per_second',
  MOVEMENT_SPEED: 'movement_speed', LIFESTEAL: 'lifesteal', MAGICAL_LIFESTEAL: 'magical_lifesteal',
  HEAL_AND_SHIELD_POWER: 'heal_shield_increase', CRITICAL_CHANCE: 'critical_chance',
  OMNIVAMP: 'omnivamp', TENACITY: 'tenacity',
};

// MAGE -> Mage, ANTI_HEAL -> AntiHeal (omeda's enum spelling).
const pascal = (s: string | null): string | null =>
  s == null ? null : s.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');

// pred.gg closes markup with a bare `</>` and breaks lines with '\n'; omeda
// wrote the named close tag and `<br>`. Copy passes and parsers read the
// omeda form, so convert: a stack of open tag names resolves each `</>`.
export function omedaMarkup(text: string | null, lineBreak: string): string | null {
  if (text == null) return null;
  const stack: string[] = [];
  const closed = text.replace(/<(\/?)([A-Za-z]\w*)?([^<>]*)>/g, (m, close: string, name: string | undefined, rest: string) => {
    if (close) {
      if (name) { if (stack[stack.length - 1] === name) stack.pop(); return `</${name}>`; }
      return `</${stack.pop() ?? ''}>`;
    }
    if (name && !rest.endsWith('/')) stack.push(name);
    return m;
  });
  return closed.replace(/\n/g, lineBreak);
}

const asset = (hash: string | null) => (hash ? `/assets/${hash}.webp` : null);

function loadPrev(file: string): { id: number; slug: string }[] {
  const p = path.join(OUT, file);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
}

// Keep each slug's previous id; hand new slugs the next free small number
// (omeda gave Yurei 10000000001, an outlier the counter skips past).
function idAssigner(prev: { id: number; slug: string }[]): (slug: string) => number {
  const bySlug = new Map(prev.map((p) => [p.slug, p.id]));
  const used = new Set(bySlug.values());
  let next = Math.max(0, ...prev.map((p) => p.id).filter((id) => id < 1e6)) + 1;
  while (used.has(next)) next++;
  return (slug) => {
    let id = bySlug.get(slug);
    if (id == null) { id = next++; bySlug.set(slug, id); }
    return id;
  };
}

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  mkdirSync(OUT, { recursive: true });

  const { heroes: pgHeroes } = await gql<{ heroes: PgHero[] }>(`{ heroes { id slug data {
    name displayName icon roles classes
    mainAttributes { abilityPower attackPower durability mobility }
    attributes { stat values }
    abilities { key displayName cooldown cost menuDescription gameDescription icon }
    version { id name releaseDate } } } }`);
  await new Promise((r) => setTimeout(r, 500));
  const { items: pgItems } = await gql<{ items: PgItem[] }>(`{ items { id slug data {
    gameId name displayName icon price totalPrice slotType rarity aggressionType class
    stats { stat value } effects { name active condition cooldown text }
    buildsFrom { name } buildsInto { name } version { id name releaseDate } } } }`);
  await new Promise((r) => setTimeout(r, 500));
  const { versions: allVersions } = await gql<{ versions: { id: string; name: string | null; releaseDate: string | null }[] }>('{ versions { id name releaseDate } }');

  const heroId = idAssigner(loadPrev('heroes.json'));
  const unknownStats = new Set<string>();
  const heroes = pgHeroes
    .filter((h) => h.slug && h.data)
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((h) => {
      const d = h.data!;
      const m = d.mainAttributes;
      const base_stats: Record<string, number[]> = {};
      for (const a of d.attributes) {
        const key = BASE_STAT[a.stat];
        if (key) base_stats[key] = catalogBaseStat(key, a.values);
      }
      return {
        id: heroId(h.slug),
        predgg_id: Number(h.id),
        game_id: null,
        name: d.name,
        display_name: d.displayName,
        slug: h.slug,
        image: asset(d.icon),
        // omeda's order: ability power, durability, attack power, mobility.
        stats: m ? [m.abilityPower, m.durability, m.attackPower, m.mobility] : [],
        classes: d.classes.map(pascal),
        roles: d.roles.map(pascal),
        abilities: d.abilities.map((a) => ({
          display_name: a.displayName,
          image: asset(a.icon),
          game_description: omedaMarkup(a.gameDescription, '<br>\n'),
          menu_description: omedaMarkup(a.menuDescription, '<br>\n'),
          cooldown: a.cooldown ?? [],
          cost: a.cost ?? [],
          key: ABILITY_KEY[a.key] ?? a.key,
        })),
        base_stats,
      };
    });

  const itemId = idAssigner(loadPrev('items.json'));
  const items = pgItems
    // No current data = removed from the game; hidden ones (evolved crests,
    // upgraded legendaries) are real in-match items, so they stay.
    .filter((i) => i.slug && i.data)
    .sort((a, b) => a.slug!.localeCompare(b.slug!))
    .map((i) => {
      const d = i.data!;
      const stats: Record<string, number> = {};
      for (const s of d.stats) {
        const key = ITEM_STAT[s.stat];
        if (key) stats[key] = catalogItemStat(key, s.value); else unknownStats.add(s.stat);
      }
      return {
        id: itemId(i.slug!),
        predgg_id: Number(i.id),
        game_id: d.gameId,
        name: d.name,
        display_name: d.displayName,
        slug: i.slug,
        image: asset(d.icon),
        price: d.price,
        total_price: d.totalPrice,
        slot_type: pascal(d.slotType),
        rarity: pascal(d.rarity),
        aggression_type: pascal(d.aggressionType),
        hero_class: pascal(d.class),
        required_level: null,
        stats,
        effects: d.effects.map((e) => ({
          name: e.name,
          active: e.active,
          condition: omedaMarkup(e.condition, '<br>'),
          cooldown: e.cooldown,
          menu_description: omedaMarkup(e.text, '<br>'),
        })),
        requirements: (d.buildsFrom ?? []).map((x) => x.name),
        build_paths: (d.buildsInto ?? []).map((x) => x.name),
      };
    });

  if (unknownStats.size) {
    // A stat the map does not know would vanish silently from the engine.
    console.error(`unmapped pred.gg item stats: ${[...unknownStats].join(', ')} — add them to ITEM_STAT`);
    process.exit(1);
  }

  const versions = new Map<string, { id: string; name: string; releaseDate: string }>();
  for (const v of [...pgHeroes.map((h) => h.data?.version), ...pgItems.map((i) => i.data?.version)]) if (v) versions.set(v.id, v);
  const latest = [...versions.values()].sort((a, b) => Date.parse(b.releaseDate) - Date.parse(a.releaseDate))[0];
  // The patch FAMILY (1.17 = 1.17, 1.17.1, 1.17.2 ...) is the window the lane
  // and measured stats already use; match samples that need more than a day
  // or two of games (head-to-head lanes) partition by it too.
  const family = latest?.name.split('.').slice(0, 2).join('.') ?? null;
  const familyVersions = family
    ? allVersions.filter((v) => v.name && v.releaseDate && (v.name === family || v.name.startsWith(`${family}.`))).sort((a, b) => Date.parse(a.releaseDate!) - Date.parse(b.releaseDate!))
    : [];

  writeFileSync(path.join(OUT, 'heroes.json'), JSON.stringify(heroes, null, 1));
  writeFileSync(path.join(OUT, 'items.json'), JSON.stringify(items, null, 1));

  const contentHash = createHash('sha256').update(JSON.stringify(heroes)).update(JSON.stringify(items)).digest('hex').slice(0, 16);
  const metaPath = path.join(OUT, 'META.json');
  let contentChangedAt = new Date().toISOString();
  if (existsSync(metaPath)) {
    const prev = JSON.parse(readFileSync(metaPath, 'utf8')) as { contentHash?: string; contentChangedAt?: string };
    if (prev.contentHash === contentHash && prev.contentChangedAt) contentChangedAt = prev.contentChangedAt;
  }
  writeFileSync(metaPath, JSON.stringify({
    source: 'https://pred.gg (GraphQL catalog: heroes, items)',
    attribution: 'Game data via pred.gg',
    patch: latest?.name ?? null,
    patchVersionId: latest ? Number(latest.id) : null,
    patchReleasedAt: latest?.releaseDate ?? null,
    patchFamily: family,
    patchFamilyReleasedAt: familyVersions[0]?.releaseDate ?? null,
    patchFamilyVersionIds: familyVersions.map((v) => Number(v.id)),
    fetchedAt: new Date().toISOString(),
    contentHash,
    contentChangedAt,
    contentAgeDays: Math.floor((Date.now() - Date.parse(contentChangedAt)) / 86400000),
    contentNote: 'fetchedAt is when we asked; contentChangedAt is when the payload last actually differed. Surfaces that describe data freshness must use contentChangedAt.',
    shapeNote: 'Same shape as the retired data/omeda snapshot (see engine/src/ingest/catalog.ts), plus predgg_id.',
    files: {
      'heroes.json': `${heroes.length} heroes with 18-level base_stats arrays`,
      'items.json': `${items.length} items with structured stats and game_id (maps match inventory data)`,
    },
  }, null, 2));
  console.log(`Catalog written to ${path.relative(ROOT, OUT)}: ${heroes.length} heroes, ${items.length} items, patch ${latest?.name ?? '?'}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

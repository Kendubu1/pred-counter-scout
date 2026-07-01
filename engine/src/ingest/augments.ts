// Hero augment (HERO_SPECIFIC_1 perk) + Eternal evidence per hero per
// role, from pred.gg's simpleBuild statistics. This is the data source
// backlog item 9 was waiting for: the catalog carries mechanical
// descriptions (engine modeling still open), the stats carry per-role
// win evidence — a damage-augment Zinx and a support-augment Zinx are
// different builds, so the hero page leads with this choice.
//
// Queried roles per hero = roles with >=300 field games in our own
// aggregates (typically 1-3), keeping the batch polite.
//
//   PREDGG_CLIENT_ID=... PREDGG_CLIENT_SECRET=... npm run augments

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';
import { loadAggregates } from '../aggregates.js';
import { loadData } from '../data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// RANKED_ONLY=1 restricts the perk/crest stats to ranked (default RANKED+STANDARD).
const GAME_MODES = process.env.RANKED_ONLY ? 'RANKED' : 'RANKED, STANDARD';

interface PerkRow { matchesPlayed: number; matchesWon: number; perk: { id: string; data: { displayName: string } | null } | null }
interface CrestRow { matchesPlayed: number; matchesWon: number; item: { data: { displayName: string } | null } | null }

async function crestStats(slug: string, role: string): Promise<CrestRow[]> {
  const d = await gql<{ hero: { simpleBuild: { items: CrestRow[] } } }>(
    `{ hero(by: { slug: "${slug}" }) {
      simpleBuild(filter: { roles: [${role}], gameModes: [${GAME_MODES}] }) {
        items(slot: CREST, limit: 4) { matchesPlayed matchesWon item { data { displayName } } }
      } } }`);
  return d.hero.simpleBuild.items.filter((r) => r.item?.data?.displayName);
}

async function slotStats(slug: string, role: string, slot: string): Promise<PerkRow[]> {
  const d = await gql<{ hero: { simpleBuild: { perks: PerkRow[] } } }>(
    `{ hero(by: { slug: "${slug}" }) {
      simpleBuild(filter: { roles: [${role}], gameModes: [${GAME_MODES}] }) {
        perks(slot: ${slot}) { matchesPlayed matchesWon perk { id data { displayName } } }
      } } }`);
  return d.hero.simpleBuild.perks.filter((p) => p.perk?.data?.displayName);
}

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  const agg = loadAggregates();
  if (!agg) { console.error('no aggregates loaded'); process.exit(1); }
  const data = loadData();

  // augment catalog: names + mechanical descriptions, keyed by perk id
  const cat = await gql<{ perks: { id: string; data: { slot: string; displayName: string; description: string; icon: string | null; hero: { slug: string } | null } | null }[] }>(
    '{ perks { id data { slot displayName description icon hero { slug } } } }');
  const catalog: Record<string, { name: string; description: string; hero: string | null }> = {};
  const icons: Record<string, string> = {};
  for (const p of cat.perks) {
    if (p.data?.slot === 'HERO_SPECIFIC_1') {
      catalog[p.id] = { name: p.data.displayName, description: p.data.description, hero: p.data.hero?.slug ?? null };
      if (p.data.icon) icons[p.id] = p.data.icon;
    }
  }

  // one-time icon snapshot (same pattern as hero/item portraits): the
  // catalog's icon hashes resolve at https://pred.gg/assets/<hash>.webp
  const iconDir = path.join(ROOT, 'ui/img/augments');
  mkdirSync(iconDir, { recursive: true });
  let fetched = 0;
  for (const [id, hash] of Object.entries(icons)) {
    const dest = path.join(iconDir, `${id}.webp`);
    if (existsSync(dest)) continue;
    const res = await fetch(`https://pred.gg/assets/${hash}.webp`, { headers: { 'User-Agent': 'pred-counter-scout (github.com/Kendubu1/pred-counter-scout)' } });
    if (res.ok) { writeFileSync(dest, Buffer.from(await res.arrayBuffer())); fetched++; }
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`icons: ${fetched} fetched -> ui/img/augments/`);

  const heroes: Record<string, Record<string, { augments: { id: string; name: string; n: number; w: number }[]; eternals: { name: string; n: number; w: number }[]; crests: { name: string; n: number; w: number }[] }>> = {};
  let calls = 0;
  for (const slug of [...data.kits.keys()].sort()) {
    const byRole = agg.heroes[slug]?.byRole ?? {};
    // every role the site can link to must have a cell: byRole >=100 field
    // games (the meta board's tail sits above this) plus the hero's primary
    // role as a floor so no hero ships with zero augment evidence
    const roles = Object.entries(byRole).filter(([, v]) => (v as { n: number }).n >= 100).map(([r]) => r);
    const primary = data.kits.get(slug)?.roles[0]?.toLowerCase();
    if (primary && !roles.includes(primary)) roles.push(primary);
    if (!roles.length) continue;
    heroes[slug] = {};
    for (const role of roles) {
      const aug = await slotStats(slug, role.toUpperCase(), 'HERO_SPECIFIC_1');
      const et = await slotStats(slug, role.toUpperCase(), 'ETERNAL_1');
      const cr = await crestStats(slug, role.toUpperCase());
      calls += 3;
      heroes[slug][role] = {
        augments: aug.map((p) => ({ id: p.perk!.id, name: p.perk!.data!.displayName, n: p.matchesPlayed, w: p.matchesWon }))
          .sort((a, b) => b.n - a.n),
        eternals: et.map((p) => ({ name: p.perk!.data!.displayName, n: p.matchesPlayed, w: p.matchesWon }))
          .sort((a, b) => b.n - a.n).slice(0, 5),
        crests: cr.map((r) => ({ name: r.item!.data!.displayName, n: r.matchesPlayed, w: r.matchesWon }))
          .sort((a, b) => b.n - a.n).slice(0, 4),
      };
      await new Promise((r) => setTimeout(r, 120));
    }
    process.stdout.write('.');
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: `pred.gg simpleBuild perk statistics (gameModes ${GAME_MODES}), per hero-role with 100+ field games in our aggregates, plus every hero’s primary role`,
    note: 'augment = the hero-specific perk locked in the first ~20s; winrates are observational evidence, not engine math; augment mechanical modeling is still open (priorities item 9)',
    catalog,
    heroes,
  };
  writeFileSync(path.join(ROOT, 'data/aggregates/predgg-augments.json'), JSON.stringify(out, null, 1));
  console.log(`\n${calls} stat calls -> data/aggregates/predgg-augments.json (${Object.keys(heroes).length} heroes)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

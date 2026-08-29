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
import { gql, hasCredentials, currentVersion, rankBands } from './predgg.js';
import { loadAggregates } from '../aggregates.js';
import { loadData } from '../data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// RANKED_ONLY=1 restricts the perk/crest stats to ranked (default RANKED+STANDARD).
const GAME_MODES = process.env.RANKED_ONLY ? "RANKED" : "RANKED, STANDARD";
// Version pin (current patch), resolved in main() when RANKED_ONLY is set.
let VERSION_FILTER = "";
let SCOPE_NOTE = "";
// Rank bands (low/mid/high), resolved in main() when RANKED_ONLY is set —
// simpleBuild's filter takes ranks: [id] (schema-verified 2026-08-29), same
// as the lanestats generalStatistic filter. Banded rows ride as aliases in
// the SAME per-cell requests (data policy: batch and alias, never re-pull).
let BANDS: { key: string; label: string; rankIds: string[] }[] = [];

interface PerkRow { matchesPlayed: number; matchesWon: number; perk: { id: string; data: { displayName: string } | null } | null }
interface CrestRow { matchesPlayed: number; matchesWon: number; item: { data: { displayName: string } | null } | null }

// When RANKED_ONLY is set, each call ALIASES a second simpleBuild scoped to
// RANKED+STANDARD in the same request (data policy: batch and alias queries
// rather than pulling twice). The primary rows become the artifact; the wider
// rows feed the one-time ranked/standard split report backlog item 12 asked
// for before switching scope.
type SplitRows<T> = { primary: T[]; both: T[] | null; bands: Record<string, T[]> };

const bandFilter = (role: string, b: { rankIds: string[] }) =>
  `filter: { roles: [${role}], gameModes: [RANKED], ranks: [${b.rankIds.map((i) => `"${i}"`).join(', ')}]${VERSION_FILTER} }`;

async function crestStats(slug: string, role: string): Promise<SplitRows<CrestRow>> {
  const body = 'items(slot: CREST, limit: 4) { matchesPlayed matchesWon item { data { displayName } } }';
  const alias = process.env.RANKED_ONLY
    ? ` both: simpleBuild(filter: { roles: [${role}], gameModes: [RANKED, STANDARD]${VERSION_FILTER} }) { ${body} }`
      + BANDS.map((b) => ` ${b.key}: simpleBuild(${bandFilter(role, b)}) { ${body} }`).join('')
    : '';
  const d = await gql<{ hero: Record<string, { items: CrestRow[] } | undefined> & { simpleBuild: { items: CrestRow[] } } }>(
    `{ hero(by: { slug: "${slug}" }) {
      simpleBuild(filter: { roles: [${role}], gameModes: [${GAME_MODES}]${VERSION_FILTER} }) { ${body} }${alias} } }`);
  const keep = (rows?: CrestRow[]) => (rows ?? []).filter((r) => r.item?.data?.displayName);
  const bands: Record<string, CrestRow[]> = {};
  for (const b of BANDS) if (d.hero[b.key]) bands[b.key] = keep(d.hero[b.key]!.items);
  return { primary: keep(d.hero.simpleBuild.items), both: d.hero.both ? keep(d.hero.both.items) : null, bands };
}

async function slotStats(slug: string, role: string, slot: string): Promise<SplitRows<PerkRow>> {
  const body = `perks(slot: ${slot}) { matchesPlayed matchesWon perk { id data { displayName } } }`;
  const alias = process.env.RANKED_ONLY
    ? ` both: simpleBuild(filter: { roles: [${role}], gameModes: [RANKED, STANDARD]${VERSION_FILTER} }) { ${body} }`
      + BANDS.map((b) => ` ${b.key}: simpleBuild(${bandFilter(role, b)}) { ${body} }`).join('')
    : '';
  const d = await gql<{ hero: Record<string, { perks: PerkRow[] } | undefined> & { simpleBuild: { perks: PerkRow[] } } }>(
    `{ hero(by: { slug: "${slug}" }) {
      simpleBuild(filter: { roles: [${role}], gameModes: [${GAME_MODES}]${VERSION_FILTER} }) { ${body} }${alias} } }`);
  const keep = (rows?: PerkRow[]) => (rows ?? []).filter((p) => p.perk?.data?.displayName);
  const bands: Record<string, PerkRow[]> = {};
  for (const b of BANDS) if (d.hero[b.key]) bands[b.key] = keep(d.hero[b.key]!.perks);
  return { primary: keep(d.hero.simpleBuild.perks), both: d.hero.both ? keep(d.hero.both.perks) : null, bands };
}

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  const agg = loadAggregates();
  if (!agg) { console.error('no aggregates loaded'); process.exit(1); }
  const data = loadData();

  if (process.env.RANKED_ONLY) {
    const v = await currentVersion();
    VERSION_FILTER = `, versions: [${v.ids.map((i) => `"${i}"`).join(', ')}]`;
    SCOPE_NOTE = `, patch ${v.name} only`;
    BANDS = await rankBands();
    console.log(`scope: RANKED only, patch ${v.name} (pred.gg version ids ${v.ids.join('+')}); rank bands ${BANDS.map((b) => b.key).join('/')}`);
  }

  // pred.gg names some Eternals by internal codename (as with heroes:
  // Weaver=N3ON); map to in-game display names so evidence and icons join
  // data/game-data/eternals.json. Verified by identical minor sets.
  const ETERNAL_DISPLAY: Record<string, string> = { Knell: 'Rust' };

  // perk catalog: names + mechanical descriptions, keyed by perk id.
  // minorBlessings is the Eternal → minor linkage (each Eternal offers 3
  // minors per blessing slot = the 6 sub-cards on the in-game pick screen).
  interface MinorData { id: string; slot: string; displayName: string; description: string; icon: string | null }
  const cat = await gql<{ perks: { id: string; data: { slot: string; displayName: string; description: string; icon: string | null; hero: { slug: string } | null; minorBlessings: MinorData[] | null } | null }[] }>(
    '{ perks { id data { slot displayName description icon hero { slug } minorBlessings { id slot displayName description icon } } } }');
  const catalog: Record<string, { name: string; description: string; hero: string | null }> = {};
  const icons: Record<string, string> = {};       // augment perk id -> icon hash
  const eternalIcons: Record<string, string> = {}; // eternal/minor perk id -> icon hash
  const eternalCatalog: Record<string, { name: string; description: string; minors: { id: string; slot: 1 | 2; name: string; description: string }[] }> = {};
  for (const p of cat.perks) {
    if (!p.data) continue;
    if (p.data.slot === 'HERO_SPECIFIC_1') {
      catalog[p.id] = { name: p.data.displayName, description: p.data.description, hero: p.data.hero?.slug ?? null };
      if (p.data.icon) icons[p.id] = p.data.icon;
    } else if (p.data.slot === 'ETERNAL_1') {
      const minors = (p.data.minorBlessings ?? []).map((m) => ({
        id: m.id,
        slot: (m.slot === 'BLESSING_MINOR_2' ? 2 : 1) as 1 | 2,
        name: m.displayName,
        description: m.description,
      })).sort((a, b) => a.slot - b.slot || a.name.localeCompare(b.name));
      eternalCatalog[p.id] = { name: ETERNAL_DISPLAY[p.data.displayName] ?? p.data.displayName, description: p.data.description, minors };
      if (p.data.icon) eternalIcons[p.id] = p.data.icon;
      for (const m of p.data.minorBlessings ?? []) if (m.icon) eternalIcons[m.id] = m.icon;
    }
  }

  // one-time icon snapshot (same pattern as hero/item portraits): the
  // catalog's icon hashes resolve at https://pred.gg/assets/<hash>.webp.
  // Augments keep their original home; Eternals + minors go to ui/img/eternals/.
  const fetchIcons = async (dir: string, hashes: Record<string, string>) => {
    mkdirSync(dir, { recursive: true });
    let fetched = 0;
    for (const [id, hash] of Object.entries(hashes)) {
      const dest = path.join(dir, `${id}.webp`);
      if (existsSync(dest)) continue;
      const res = await fetch(`https://pred.gg/assets/${hash}.webp`, { headers: { 'User-Agent': 'pred-counter-scout (github.com/Kendubu1/pred-counter-scout)' } });
      if (res.ok) { writeFileSync(dest, Buffer.from(await res.arrayBuffer())); fetched++; }
      await new Promise((r) => setTimeout(r, 100));
    }
    return fetched;
  };
  console.log(`icons: ${await fetchIcons(path.join(ROOT, 'ui/img/augments'), icons)} fetched -> ui/img/augments/`);
  console.log(`icons: ${await fetchIcons(path.join(ROOT, 'ui/img/eternals'), eternalIcons)} fetched -> ui/img/eternals/ (${Object.keys(eternalCatalog).length} eternals + minors)`);
  // majors also land under their lowercased display name — the UI's
  // historical filename scheme (ui/img/eternals/lotus.webp etc.), so new
  // Eternals light up without a UI-side id map for the big portraits.
  const majorByName: Record<string, string> = {};
  for (const [id, e] of Object.entries(eternalCatalog)) if (eternalIcons[id]) majorByName[e.name.toLowerCase()] = eternalIcons[id];
  await fetchIcons(path.join(ROOT, 'ui/img/eternals'), majorByName);

  // The Eternal catalog is its own artifact: pure game-catalog data (names,
  // descriptions, major → 6-minor linkage, icon ids), no winrate evidence —
  // so it regenerates fine even on limited-scope credentials that cannot
  // read simpleBuild statistics.
  writeFileSync(path.join(ROOT, 'data/aggregates/eternals-catalog.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'pred.gg perk catalog (perks query); icons snapshotted to ui/img/eternals/<id>.webp and ui/img/eternals/<name>.webp for majors',
    note: 'each Eternal major offers 3 minors per blessing slot — the 6 sub-cards on the in-game pick screen',
    eternals: eternalCatalog,
  }, null, 1));
  console.log(`catalog: ${Object.keys(eternalCatalog).length} eternals (6 minors each) -> data/aggregates/eternals-catalog.json`);
  if (process.env.CATALOG_ONLY) { console.log('CATALOG_ONLY set — skipping simpleBuild statistics'); return; }

  type AugRow = { id: string; name: string; n: number; w: number };
  type NameRow = { name: string; n: number; w: number };
  type EternalRow = { id: string; name: string; n: number; w: number };
  type Cell = { augments: AugRow[]; eternals: EternalRow[]; crests: NameRow[]; byRank?: Record<string, { augments: AugRow[]; eternals: EternalRow[]; crests: NameRow[] }> };
  const heroes: Record<string, Record<string, Cell>> = {};
  type SplitPick = { name: string; n: number; w: number };
  const splitCells: { slug: string; role: string; ranked: Record<string, SplitPick[]>; both: Record<string, SplitPick[]> }[] = [];
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
      const augRows = (rows: PerkRow[]) => rows.map((p) => ({ id: p.perk!.id, name: p.perk!.data!.displayName, n: p.matchesPlayed, w: p.matchesWon }))
        .sort((a, b) => b.n - a.n);
      const etRows = (rows: PerkRow[]) => rows.map((p) => ({ id: p.perk!.id, name: ETERNAL_DISPLAY[p.perk!.data!.displayName] ?? p.perk!.data!.displayName, n: p.matchesPlayed, w: p.matchesWon }))
        .sort((a, b) => b.n - a.n).slice(0, 5);
      const crRows = (rows: CrestRow[]) => rows.map((r) => ({ name: r.item!.data!.displayName, n: r.matchesPlayed, w: r.matchesWon }))
        .sort((a, b) => b.n - a.n).slice(0, 4);
      heroes[slug][role] = { augments: augRows(aug.primary), eternals: etRows(et.primary), crests: crRows(cr.primary) };
      if (BANDS.length) {
        const byRank: NonNullable<Cell['byRank']> = {};
        for (const b of BANDS) {
          byRank[b.key] = { augments: augRows(aug.bands[b.key] ?? []), eternals: etRows(et.bands[b.key] ?? []), crests: crRows(cr.bands[b.key] ?? []) };
        }
        heroes[slug][role].byRank = byRank;
      }
      if (aug.both || et.both || cr.both) {
        const pair = (rows: { matchesPlayed: number; matchesWon: number }[], name: (r: any) => string) =>
          rows.map((r) => ({ name: name(r), n: r.matchesPlayed, w: r.matchesWon }));
        splitCells.push({
          slug, role,
          ranked: {
            augments: pair(aug.primary, (r) => r.perk.data.displayName),
            eternals: pair(et.primary, (r) => r.perk.data.displayName),
            crests: pair(cr.primary, (r) => r.item.data.displayName),
          },
          both: {
            augments: pair(aug.both ?? [], (r) => r.perk.data.displayName),
            eternals: pair(et.both ?? [], (r) => r.perk.data.displayName),
            crests: pair(cr.both ?? [], (r) => r.item.data.displayName),
          },
        });
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    process.stdout.write('.');
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: `pred.gg simpleBuild perk statistics (gameModes ${GAME_MODES}${SCOPE_NOTE}), per hero-role with 100+ field games in our aggregates, plus every hero’s primary role`,
    note: 'augment = the hero-specific perk locked in the first ~20s; winrates are observational evidence, not engine math; augment mechanical modeling is still open (priorities item 9)',
    rankBands: BANDS.length ? BANDS.map((b) => ({ key: b.key, label: b.label })) : null,
    catalog,
    // Eternal majors keyed by perk id: name, description, and the 6 minors
    // (3 per blessing slot) shown on the in-game pick screen. Icons for every
    // id here (majors and minors) live at ui/img/eternals/<id>.webp.
    eternals: eternalCatalog,
    heroes,
  };
  writeFileSync(path.join(ROOT, 'data/aggregates/predgg-augments.json'), JSON.stringify(out, null, 1));
  console.log(`\n${calls} stat calls -> data/aggregates/predgg-augments.json (${Object.keys(heroes).length} heroes)`);

  // Ranked/standard split report (backlog item 12): what switching the evidence
  // to ranked-only costs in sample, per pick and in aggregate, and how many
  // Eternal/crest picks drop below the hero page's 300-game floor.
  if (splitCells.length) {
    let rankedN = 0, bothN = 0;
    const floorImpact = { eternals: { before: 0, after: 0 }, crests: { before: 0, after: 0 } };
    for (const c of splitCells) {
      for (const kind of ['augments', 'eternals', 'crests'] as const) {
        const rankedByName = new Map(c.ranked[kind]!.map((p) => [p.name, p]));
        for (const b of c.both[kind]!) {
          bothN += b.n;
          rankedN += rankedByName.get(b.name)?.n ?? 0;
        }
        if (kind !== 'augments') {
          floorImpact[kind].before += c.both[kind]!.filter((p) => p.n >= 300).length;
          floorImpact[kind].after += c.ranked[kind]!.filter((p) => p.n >= 300).length;
        }
      }
    }
    const report = {
      generatedAt: new Date().toISOString(),
      note: 'One-time scope-switch analysis (priorities item 12): both scopes pulled in the SAME aliased queries, so the pairs are sampled at the same instant. standard share is (both - ranked) / both across every pick in every cell.',
      scope: SCOPE_NOTE.replace(/^, /, ''),
      cells: splitCells.length,
      totals: {
        rankedGames: rankedN,
        rankedPlusStandardGames: bothN,
        standardSharePct: bothN ? Math.round(((bothN - rankedN) / bothN) * 1000) / 10 : null,
      },
      floor300: floorImpact,
      perCell: splitCells.map((c) => ({
        slug: c.slug, role: c.role,
        rankedGames: Object.values(c.ranked).flat().reduce((t, p) => t + p.n, 0),
        bothGames: Object.values(c.both).flat().reduce((t, p) => t + p.n, 0),
      })),
    };
    writeFileSync(path.join(ROOT, 'data/aggregates/ranked-standard-split.json'), JSON.stringify(report, null, 1));
    console.log(`split: ranked ${rankedN.toLocaleString()} of ${bothN.toLocaleString()} pick-games (${report.totals.standardSharePct}% standard); Eternal picks >=300 games ${floorImpact.eternals.before} -> ${floorImpact.eternals.after}, crests ${floorImpact.crests.before} -> ${floorImpact.crests.after} -> data/aggregates/ranked-standard-split.json`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

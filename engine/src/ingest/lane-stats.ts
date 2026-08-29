// Per-(hero, role) ranked lane statistics for the CURRENT patch, from pred.gg's
// generalStatistic endpoint — the meta board's data source when the omeda match
// feed is unusable or behind.
//
//   npm run lanestats        (needs PREDGG_CLIENT_ID/SECRET)
//
// WHY THIS EXISTS: the lane boards were built from a 36-hour omeda feed window,
// and the public feed runs days behind live — every board shipped through the
// 1.16 era was measured on pre-1.16 games, and when the feed started returning
// 503 there was no path to a current board at all. generalStatistic is readable
// at the current app tier, version-pinnable, and role-filterable, which is
// exactly the (hero, role) n/w matrix the board needs. RANKED only — that also
// answers the maintainer's item-12 preference for ranked evidence.
//
// RANK BANDS (added 2026-08-29): the filter also takes ranks: [ID], verified by
// schema introspection, so each (hero, role) cell now carries three rank-band
// sub-cells alongside the unfiltered numbers. Bands are derived from the open
// split's rank ladder by tierIdx — low = Bronze+Silver (tiers 0-1),
// mid = Gold+Platinum (2-3), high = Diamond+Paragon (4-5) — so a reshuffled
// ladder next split changes the ids without changing this code. The bands sum
// BELOW the unfiltered cell (~4-5% observed): games by players without a placed
// rank only appear unfiltered. The all-ranks numbers stay canonical.
//
// Queries are ALIASED (data policy): each request carries HEROES_PER_CALL
// heroes x 5 roles x 4 variants (all + 3 bands), so the full 54-hero matrix
// costs ~18 requests.
//
// matchesBanned is NOT read here — it partitions per role and sums 5x high
// (lessons.md 2026-08-14); genstats owns the corrected ban counts.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials, currentVersion } from './predgg.js';
import { loadData } from '../data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROLES = ['carry', 'midlane', 'offlane', 'jungle', 'support'];
const ROLE_ENUM: Record<string, string> = { carry: 'CARRY', midlane: 'MIDLANE', offlane: 'OFFLANE', jungle: 'JUNGLE', support: 'SUPPORT' };
const HEROES_PER_CALL = 3;

const BAND_DEFS: { key: string; label: string; tiers: number[] }[] = [
  { key: 'low', label: 'Bronze–Silver', tiers: [0, 1] },
  { key: 'mid', label: 'Gold–Platinum', tiers: [2, 3] },
  { key: 'high', label: 'Diamond+', tiers: [4, 5] },
];

interface Cell { matchesPlayed: number; matchesWon: number }
interface NW { n: number; w: number }

/** Rank-id lists per band, read from the OPEN ranked split's ladder. */
async function rankBands(): Promise<{ key: string; label: string; rankIds: string[] }[]> {
  const d = await gql<{ ratings: { endTime: string | null; startTime: string; ranks: { id: string; name: string; tierIdx: number }[] }[] }>(
    '{ ratings { startTime endTime ranks { id name tierIdx } } }',
  );
  const open = d.ratings.filter((r) => !r.endTime).sort((a, b) => b.startTime.localeCompare(a.startTime))[0];
  if (!open?.ranks?.length) throw new Error('pred.gg: no open split / rank ladder');
  return BAND_DEFS.map((b) => {
    const rankIds = open.ranks.filter((r) => b.tiers.includes(r.tierIdx)).map((r) => r.id);
    if (!rankIds.length) throw new Error(`pred.gg: no ranks for band ${b.key} (tiers ${b.tiers.join(',')})`);
    return { key: b.key, label: b.label, rankIds };
  });
}

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  const data = loadData();
  const v = await currentVersion();
  const vfilter = v.ids.map((i) => `"${i}"`).join(', ');
  const bands = await rankBands();
  const slugs = [...data.kits.keys()].sort();

  const heroes: Record<string, { byRole: Record<string, NW & { bands?: Record<string, NW> }> }> = {};
  let calls = 0;
  for (let b = 0; b < slugs.length; b += HEROES_PER_CALL) {
    const batch = slugs.slice(b, b + HEROES_PER_CALL);
    const cellQ = (r: string, ranks: string[] | null) =>
      `generalStatistic(filter: { roles: [${ROLE_ENUM[r]}], gameModes: [RANKED], versions: [${vfilter}]${ranks ? `, ranks: [${ranks.map((i) => `"${i}"`).join(', ')}]` : ''} }) { result { matchesPlayed matchesWon } }`;
    const q = `{ ${batch.map((slug, hi) => `h${hi}: hero(by: { slug: "${slug}" }) { ${ROLES.map((r) =>
      `${r}: ${cellQ(r, null)} ${bands.map((bd) => `${r}_${bd.key}: ${cellQ(r, bd.rankIds)}`).join(' ')}`,
    ).join(' ')} }`).join(' ')} }`;
    const d = await gql<Record<string, Record<string, { result: Cell | null } | null> | null>>(q);
    calls++;
    batch.forEach((slug, hi) => {
      const h = d[`h${hi}`];
      if (!h) return;
      const byRole: Record<string, NW & { bands?: Record<string, NW> }> = {};
      for (const r of ROLES) {
        const c = h[r]?.result;
        if (!c || c.matchesPlayed <= 0) continue;
        const cell: NW & { bands?: Record<string, NW> } = { n: c.matchesPlayed, w: c.matchesWon };
        const bandCells: Record<string, NW> = {};
        for (const bd of bands) {
          const bc = h[`${r}_${bd.key}`]?.result;
          if (bc && bc.matchesPlayed > 0) bandCells[bd.key] = { n: bc.matchesPlayed, w: bc.matchesWon };
        }
        if (Object.keys(bandCells).length) cell.bands = bandCells;
        byRole[r] = cell;
      }
      if (Object.keys(byRole).length) heroes[slug] = { byRole };
    });
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 150));
  }

  // Every match contributes 10 (hero, role) rows — one per player — so the
  // total across the whole matrix over 10 approximates the match count.
  const rows = (pick: (c: NW & { bands?: Record<string, NW> }) => number) =>
    Object.values(heroes).reduce((t, h) => t + Object.values(h.byRole).reduce((s, c) => s + pick(c), 0), 0);
  const matchesApproxByBand = Object.fromEntries(
    bands.map((bd) => [bd.key, Math.round(rows((c) => c.bands?.[bd.key]?.n ?? 0) / 10)]),
  );
  const out = {
    generatedAt: new Date().toISOString(),
    source: `pred.gg generalStatistic per (hero, role), RANKED only, patch ${v.name} (version ids ${v.ids.join('+')})`,
    patch: v.name,
    versionIds: v.ids,
    scopeLabel: 'ranked',
    matchesApprox: Math.round(rows((c) => c.n) / 10),
    rankBands: bands,
    matchesApproxByBand,
    bandNote: 'Each cell\'s bands partition by the player\'s rank at the open split (low Bronze+Silver, mid Gold+Platinum, high Diamond+Paragon). Bands sum below the unfiltered n: games by players without a placed rank only count unfiltered. The unfiltered numbers stay canonical.',
    note: 'Lane-board evidence source. n/w are role-filtered ranked games for the pinned patch. Approximate match count = all cell games / 10 (each match contributes ten player-rows). Bans deliberately absent: matchesBanned partitions per role and reads 5x high — genstats owns the corrected counts.',
    heroes,
  };
  writeFileSync(path.join(ROOT, 'data/aggregates/predgg-lane-stats.json'), JSON.stringify(out, null, 1));
  console.log(`\n${calls} calls -> data/aggregates/predgg-lane-stats.json (${Object.keys(heroes).length} heroes, ~${out.matchesApprox.toLocaleString()} ranked matches, patch ${v.name}; bands ${bands.map((bd) => `${bd.key}~${matchesApproxByBand[bd.key]?.toLocaleString()}`).join(', ')})`);
}

main().catch((e) => { console.error(e); process.exit(1); });

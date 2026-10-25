// Per-hero RANKED ban counts for the CURRENT patch, all ranks and per rank
// band, from pred.gg's generalStatistic — the "Most banned" board's source.
//
//   npm run bans             (needs PREDGG_CLIENT_ID/SECRET; runs after lanestats)
//
// WHY A SEPARATE PULL: genstats owns the corrected all-ranks ban counts but has
// no rank bands, and lanestats deliberately skips matchesBanned. This reads the
// same version ids and rank bands lanestats committed, so the board's ban rates
// divide by the very match counts the meta board shows.
//
// HOW BANS PARTITION (verified 2026-10-24, adele/kira/zinx):
// - Unfiltered by rank, a role-filtered matchesBanned is the TRUE count and is
//   identical across all five roles (the unfiltered-by-role field sums the five
//   partitions and reads 5x high — lessons.md 2026-08-14). We read MIDLANE.
// - Rank-filtered, the count follows the rank of the player in the filtered
//   role slot, so it differs by ~1-3% between roles. We take the MEAN over the
//   five roles per band. Bands sum ~3% below all ranks (unplaced players only
//   count unfiltered), same as the lane cells.
//
// Aliased: HEROES_PER_CALL heroes x 5 roles x 3 bands + 1 all-ranks cell per
// request, so the full roster costs ~14 requests.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROLES = ['CARRY', 'MIDLANE', 'OFFLANE', 'JUNGLE', 'SUPPORT'];
const HEROES_PER_CALL = 4;

interface LaneStats {
  patch: string; versionIds: string[]; matchesApprox: number;
  rankBands: { key: string; label: string; rankIds: string[] }[];
  matchesApproxByBand: Record<string, number>;
  heroes: Record<string, { byRole: Record<string, { n: number; w: number; bands?: Record<string, { n: number; w: number }> }> }>;
}

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  const lane = JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/predgg-lane-stats.json'), 'utf8')) as LaneStats;
  const heroes = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/heroes.json'), 'utf8')) as { slug: string; name: string }[];
  const vfilter = lane.versionIds.map((i) => `"${i}"`).join(', ');
  const cellQ = (role: string, ranks: string[] | null) =>
    `generalStatistic(filter: { roles: [${role}], gameModes: [RANKED], versions: [${vfilter}]${ranks ? `, ranks: [${ranks.map((i) => `"${i}"`).join(', ')}]` : ''} }) { result { matchesBanned } }`;

  const out: Record<string, { bans: number; bands: Record<string, number> }> = {};
  let calls = 0;
  for (let b = 0; b < heroes.length; b += HEROES_PER_CALL) {
    const batch = heroes.slice(b, b + HEROES_PER_CALL);
    const q = `{ ${batch.map((h, hi) => `h${hi}: hero(by: { slug: "${h.slug}" }) { all: ${cellQ('MIDLANE', null)} ${lane.rankBands.map((bd) =>
      ROLES.map((r) => `${bd.key}_${r}: ${cellQ(r, bd.rankIds)}`).join(' ')).join(' ')} }`).join(' ')} }`;
    const d = await gql<Record<string, Record<string, { result: { matchesBanned: number } | null } | null> | null>>(q);
    calls++;
    batch.forEach((h, hi) => {
      const c = d[`h${hi}`];
      const all = c?.all?.result?.matchesBanned;
      if (!c || all == null) return;
      const bands: Record<string, number> = {};
      for (const bd of lane.rankBands) {
        const vals = ROLES.map((r) => c[`${bd.key}_${r}`]?.result?.matchesBanned).filter((v): v is number => v != null);
        if (vals.length) bands[bd.key] = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
      }
      out[h.slug] = { bans: all, bands };
    });
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 250));
  }

  // Sanity: a 4-ban draft puts league bans per match near 4 (3.87 measured
  // 2026-08-14). Far off means the field's partitioning changed — say so.
  const perMatch = (pick: (h: { bans: number; bands: Record<string, number> }) => number, matches: number) =>
    matches ? +(Object.values(out).reduce((s, h) => s + pick(h), 0) / matches).toFixed(2) : null;
  const bansPerMatch = {
    all: perMatch((h) => h.bans, lane.matchesApprox),
    ...Object.fromEntries(lane.rankBands.map((bd) => [bd.key, perMatch((h) => h.bands[bd.key] ?? 0, lane.matchesApproxByBand[bd.key] ?? 0)])),
  };
  for (const [k, v] of Object.entries(bansPerMatch)) {
    if (v != null && (v < 3 || v > 5)) console.warn(`\n  ! ${k}: ${v} bans per match, expected ~4 — pred.gg may have changed the field`);
  }

  writeFileSync(path.join(ROOT, 'data/aggregates/predgg-bans.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: `pred.gg generalStatistic matchesBanned, RANKED only, patch ${lane.patch} (version ids ${lane.versionIds.join('+')})`,
    patch: lane.patch,
    versionIds: lane.versionIds,
    rankBands: lane.rankBands.map((b) => ({ key: b.key, label: b.label })),
    matchesApprox: lane.matchesApprox,
    matchesApproxByBand: lane.matchesApproxByBand,
    bansPerMatch,
    note: 'bans = true all-ranks count (role-filtered, identical across roles). bands = mean over the five role-filtered counts per rank band (a banded count follows the rank of the player in the filtered role slot). Match counts come from the same lanestats snapshot.',
    heroes: out,
  }, null, 1) + '\n');
  console.log(`\n${calls} calls -> data/aggregates/predgg-bans.json (${Object.keys(out).length} heroes; bans/match ${Object.entries(bansPerMatch).map(([k, v]) => `${k} ${v}`).join(', ')})`);
}

main().catch((e) => { console.error(e); process.exit(1); });

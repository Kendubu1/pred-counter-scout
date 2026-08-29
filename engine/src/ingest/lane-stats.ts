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
// Queries are ALIASED (data policy): each request carries HEROES_PER_CALL
// heroes x 5 roles = 20 cells, so the full 54-hero matrix costs ~14 requests.
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
const HEROES_PER_CALL = 4;

interface Cell { matchesPlayed: number; matchesWon: number }

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  const data = loadData();
  const v = await currentVersion();
  const vfilter = v.ids.map((i) => `"${i}"`).join(', ');
  const slugs = [...data.kits.keys()].sort();

  const heroes: Record<string, { byRole: Record<string, { n: number; w: number }> }> = {};
  let calls = 0;
  for (let b = 0; b < slugs.length; b += HEROES_PER_CALL) {
    const batch = slugs.slice(b, b + HEROES_PER_CALL);
    const q = `{ ${batch.map((slug, hi) => `h${hi}: hero(by: { slug: "${slug}" }) { ${ROLES.map((r) =>
      `${r}: generalStatistic(filter: { roles: [${ROLE_ENUM[r]}], gameModes: [RANKED], versions: [${vfilter}] }) { result { matchesPlayed matchesWon } }`
    ).join(' ')} }`).join(' ')} }`;
    const d = await gql<Record<string, Record<string, { result: Cell | null } | null> | null>>(q);
    calls++;
    batch.forEach((slug, hi) => {
      const h = d[`h${hi}`];
      if (!h) return;
      const byRole: Record<string, { n: number; w: number }> = {};
      for (const r of ROLES) {
        const c = h[r]?.result;
        if (c && c.matchesPlayed > 0) byRole[r] = { n: c.matchesPlayed, w: c.matchesWon };
      }
      if (Object.keys(byRole).length) heroes[slug] = { byRole };
    });
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 150));
  }

  // Every match contributes 10 (hero, role) rows — one per player — so the
  // total across the whole matrix over 10 approximates the match count.
  const totalRows = Object.values(heroes).reduce((t, h) => t + Object.values(h.byRole).reduce((s, c) => s + c.n, 0), 0);
  const out = {
    generatedAt: new Date().toISOString(),
    source: `pred.gg generalStatistic per (hero, role), RANKED only, patch ${v.name} (version ids ${v.ids.join('+')})`,
    patch: v.name,
    versionIds: v.ids,
    scopeLabel: 'ranked',
    matchesApprox: Math.round(totalRows / 10),
    note: 'Lane-board evidence source. n/w are role-filtered ranked games for the pinned patch. Approximate match count = all cell games / 10 (each match contributes ten player-rows). Bans deliberately absent: matchesBanned partitions per role and reads 5x high — genstats owns the corrected counts.',
    heroes,
  };
  writeFileSync(path.join(ROOT, 'data/aggregates/predgg-lane-stats.json'), JSON.stringify(out, null, 1));
  console.log(`\n${calls} calls -> data/aggregates/predgg-lane-stats.json (${Object.keys(heroes).length} heroes, ~${out.matchesApprox.toLocaleString()} ranked matches, patch ${v.name})`);
}

main().catch((e) => { console.error(e); process.exit(1); });

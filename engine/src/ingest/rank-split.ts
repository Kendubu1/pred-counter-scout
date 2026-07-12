// Rank-split hero winrates from the omeda.city ranked feed, PER TIER —
// Bronze / Silver / Gold / Platinum / Diamond+ — how the meta shifts with ELO.
//
//   npm run ranksplit            # 36h window, ranked rows only
//
// Bucketing is PER PLAYER ROW by the row's own `rank` field (two-digit code:
// tens = tier 1 Bronze … 5+ pooled as diamond+, units = division), so a
// mixed-tier match contributes each player to their own tier. Rows with no
// rank (placements/private) are dropped. Same polite fetching as aggregate.ts.
//
// Output: data/aggregates/rank-split-<date>.json — per hero slug,
// tiers: { bronze|silver|gold|platinum|diamond+: {n, w} } + byRole per tier.
// Coarser buckets (e.g. Plat+) derive by summing tiers — never re-pull for them.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const UA = { 'User-Agent': 'pred-counter-scout (github.com/Kendubu1/pred-counter-scout)' };
const ROLES = new Set(['carry', 'midlane', 'offlane', 'jungle', 'support']);
const WINDOW_H = 36, MAX_PAGES = 120;
// tens digit of the row's rank code = tier; 5+ pooled as diamond+ (thin)
const TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond+'] as const;
const tierOf = (rank: number) => TIERS[Math.min(Math.floor(rank / 10), 5) - 1]!;
// Feed/catalog id mismatches — keep in sync with aggregate.ts FEED_ID_ALIASES
// (not imported: aggregate.ts runs its pull on import).
const FEED_ID_ALIASES: Record<number, string> = { 75: 'legion', 76: 'ikra' };

interface Cell { n: number; w: number }
type TierCells = Record<string, Cell>;
interface HeroCells { tiers: TierCells; byRole: Record<string, TierCells> }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fetchPage(url: string): Promise<any> {
  for (let a = 0; a < 4; a++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return await res.json();
    } catch { /* retry */ }
    await sleep(1500 * (a + 1));
  }
  throw new Error(`feed fetch failed: ${url}`);
}

async function main() {
  const startTs = Math.floor(Date.now() / 1000) - WINDOW_H * 3600;
  const omedaHeroes = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8'));
  const arr = Array.isArray(omedaHeroes) ? omedaHeroes : Object.values(omedaHeroes);
  const idToSlug = new Map<number, string>(arr.map((h: any) => [h.id, h.slug]));
  for (const [id, slug] of Object.entries(FEED_ID_ALIASES)) if (!idToSlug.has(Number(id))) idToSlug.set(Number(id), slug);

  const heroes = new Map<string, HeroCells>();
  let url: string | null = `https://omeda.city/matches.json?per_page=100&timestamp=${startTs}`;
  let pages = 0, matches = 0, rows = 0, unranked = 0;
  while (url && pages < MAX_PAGES) {
    const page = await fetchPage(url);
    pages++;
    for (const m of page.matches ?? []) {
      if (m.game_mode !== 'ranked') continue;
      matches++;
      for (const p of m.players ?? []) {
        const role = p.role && ROLES.has(p.role) ? p.role : null;
        if (!role || !p.hero_id) continue;
        if (p.rank == null || p.rank < 10) { unranked++; continue; }
        const slug = idToSlug.get(p.hero_id) ?? `hero_id:${p.hero_id}`;
        const tier = tierOf(p.rank);
        let h = heroes.get(slug);
        if (!h) { h = { tiers: {}, byRole: {} }; heroes.set(slug, h); }
        const won = p.team === m.winning_team;
        const tc = (h.tiers[tier] ??= { n: 0, w: 0 });
        tc.n++; if (won) tc.w++;
        const rc = ((h.byRole[role] ??= {})[tier] ??= { n: 0, w: 0 });
        rc.n++; if (won) rc.w++;
        rows++;
      }
    }
    url = page.cursor ? `https://omeda.city/matches.json?per_page=100&timestamp=${startTs}&cursor=${encodeURIComponent(page.cursor)}` : null;
    if (pages % 20 === 0) console.log(`  page ${pages}: ${matches} ranked matches, ${rows} bucketed rows`);
    await sleep(150);
  }

  const date = new Date().toISOString().slice(0, 10);
  const out = path.join(ROOT, `data/aggregates/rank-split-${date}.json`);
  const tierRows: Record<string, number> = {};
  for (const h of heroes.values()) for (const [t, c] of Object.entries(h.tiers)) tierRows[t] = (tierRows[t] ?? 0) + c.n;
  writeFileSync(out, JSON.stringify({
    meta: {
      source: 'omeda.city matches.json (official Omeda public API), ranked rows only',
      generatedAt: new Date().toISOString(),
      windowHours: WINDOW_H, pages, matches,
      tiers: Object.fromEntries(TIERS.map((t) => [t, { playerRows: tierRows[t] ?? 0 }])),
      note: 'per PLAYER ROW by that player’s own rank code (tens digit = tier; 5+ pooled as diamond+); a mixed-tier match feeds each player’s own tier; rows with no rank dropped. Coarser buckets (e.g. Plat+) derive by summing tiers.',
    },
    heroes: Object.fromEntries([...heroes.entries()].sort()),
  }, null, 1));
  console.log(`${matches} ranked matches -> ${rows} rows (${Object.entries(tierRows).map(([t, n]) => `${t} ${n}`).join(', ')}; ${unranked} unranked dropped) -> ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

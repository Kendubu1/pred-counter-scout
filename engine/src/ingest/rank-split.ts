// Rank-split hero winrates from the omeda.city ranked feed: Bronze–Gold vs
// Platinum+ — how differently does the meta play at high ELO?
//
//   npm run ranksplit            # 36h window, ranked rows only
//
// Bucketing is PER PLAYER ROW by the row's own `rank` field (two-digit code:
// tens = tier 1 Bronze … 5+ Diamond+, units = division), so a mixed-tier match
// contributes each player to their own bucket. low = rank < 40 (Bronze/Silver/
// Gold), high = rank >= 40 (Platinum and up — also the 900-VP Platinum III
// line the coach reports use). Rows with no rank (placements/private) are
// dropped. Same polite fetching as aggregate.ts: sequential, delay, cursor.
//
// Output: data/aggregates/rank-split-<date>.json — per hero slug,
// { low: {n, w}, high: {n, w} }, plus byRole per bucket for the lane view.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const UA = { 'User-Agent': 'pred-counter-scout (github.com/Kendubu1/pred-counter-scout)' };
const ROLES = new Set(['carry', 'midlane', 'offlane', 'jungle', 'support']);
const WINDOW_H = 36, MAX_PAGES = 120;
const HIGH_MIN_RANK = 40; // tens digit 4 = Platinum
// Feed/catalog id mismatches — keep in sync with aggregate.ts FEED_ID_ALIASES
// (not imported: aggregate.ts runs its pull on import).
const FEED_ID_ALIASES: Record<number, string> = { 75: 'legion', 76: 'ikra' };

interface Cell { n: number; w: number }
interface HeroCells { low: Cell; high: Cell; byRole: Record<string, { low: Cell; high: Cell }> }

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
        const bucket: 'low' | 'high' = p.rank >= HIGH_MIN_RANK ? 'high' : 'low';
        let h = heroes.get(slug);
        if (!h) { h = { low: { n: 0, w: 0 }, high: { n: 0, w: 0 }, byRole: {} }; heroes.set(slug, h); }
        const won = p.team === m.winning_team;
        h[bucket].n++; if (won) h[bucket].w++;
        const rc = (h.byRole[role] ??= { low: { n: 0, w: 0 }, high: { n: 0, w: 0 } });
        rc[bucket].n++; if (won) rc[bucket].w++;
        rows++;
      }
    }
    url = page.cursor ? `https://omeda.city/matches.json?per_page=100&timestamp=${startTs}&cursor=${encodeURIComponent(page.cursor)}` : null;
    if (pages % 20 === 0) console.log(`  page ${pages}: ${matches} ranked matches, ${rows} bucketed rows`);
    await sleep(150);
  }

  const date = new Date().toISOString().slice(0, 10);
  const out = path.join(ROOT, `data/aggregates/rank-split-${date}.json`);
  const lowN = [...heroes.values()].reduce((s, h) => s + h.low.n, 0);
  const highN = [...heroes.values()].reduce((s, h) => s + h.high.n, 0);
  writeFileSync(out, JSON.stringify({
    meta: {
      source: 'omeda.city matches.json (official Omeda public API), ranked rows only',
      generatedAt: new Date().toISOString(),
      windowHours: WINDOW_H, pages, matches,
      buckets: {
        low: { label: 'Bronze–Gold', rule: 'row rank 10–39', playerRows: lowN },
        high: { label: 'Platinum+', rule: 'row rank >= 40', playerRows: highN },
      },
      note: 'bucketed per PLAYER ROW by that player’s own rank (a mixed-tier match feeds both buckets); rows with no rank dropped',
    },
    heroes: Object.fromEntries([...heroes.entries()].sort()),
  }, null, 1));
  console.log(`${matches} ranked matches -> ${rows} rows (${lowN} Bronze–Gold / ${highN} Platinum+, ${unranked} unranked dropped) -> ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

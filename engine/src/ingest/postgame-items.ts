// Item-timeline enrichment for the post-game reviews: estimate WHEN each of a
// player's completed items came online, so the fight breakdown can say what was
// actually purchased by the time a fight happened (and what wasn't — e.g. the
// anti-heal that was still ~3 minutes away).
//
// Model (THEORY, stated in the UI): walk the player's end-game inventory in
// slot order (≈ purchase order; neither API exposes purchase timestamps),
// accumulate each item's total_price, and mark an item online at the first
// minute the role's MEASURED median gold curve (data/aggregates, ranked match
// feed) covers the cumulative cost. Consumables/wards/crests are skipped —
// same filter the coach UI applies to the build rows.
//
//   npm run postgame:items            # fill itemTimeline on reviews missing it
//   npm run postgame:items -- --all   # recompute on every review
//
// Pure local join — no API calls. Re-run after a data refresh (the gold curve
// moves a little each aggregate).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAggregates, goldAt } from '../aggregates.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'data/postgame');
const SKIP = /Potion|Ward|Crest/i;

function main() {
  const agg = loadAggregates();
  if (!agg) { console.error('no aggregate snapshot in data/aggregates/'); process.exit(1); }
  const omeda = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/items.json'), 'utf8')) as { slug: string; total_price: number | null }[];
  const priceOf = new Map(omeda.map((i) => [i.slug, i.total_price ?? null]));

  // sorted minute keys per role, so estimates walk the measured curve only
  const minutesOf = new Map<string, number[]>();
  for (const role of ['carry', 'midlane', 'offlane', 'jungle', 'support']) {
    const m = Object.keys(agg.goldByMinute[role] ?? {}).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
    minutesOf.set(role, m);
  }
  const estMinute = (role: string, cumGold: number): number | null => {
    for (const m of minutesOf.get(role) ?? []) {
      const g = goldAt(role, m, agg);
      if (g != null && g >= cumGold) return m;
    }
    return null; // beyond the measured curve — very late
  };

  const all = process.argv.includes('--all');
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
  let updated = 0;
  for (const file of files) {
    const p = path.join(DIR, file);
    const j = JSON.parse(readFileSync(p, 'utf8'));
    if (!Array.isArray(j.players)) continue;
    if (!all && j.players.every((pl: any) => pl.itemTimeline)) continue;
    for (const pl of j.players) {
      const role = ['carry', 'midlane', 'offlane', 'jungle', 'support'].includes(pl.role) ? pl.role : 'midlane';
      let cum = 0;
      pl.itemTimeline = (pl.items ?? []).filter((i: any) => !SKIP.test(i.name ?? '')).map((i: any) => {
        const price = priceOf.get(i.slug);
        if (price) cum += price;
        return { slug: i.slug, name: i.name, estMin: price ? estMinute(role, cum) : null };
      });
    }
    j.itemTimelineNote = 'estMin = first minute the role\'s measured median gold curve covers the cumulative inventory cost (slot order ≈ purchase order) — THEORY, no purchase timestamps in either API';
    writeFileSync(p, JSON.stringify(j, null, 1));
    updated++;
  }
  console.log(`${updated} review(s) enriched with itemTimeline (${files.length} total)`);
}

main();

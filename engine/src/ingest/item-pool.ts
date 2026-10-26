// Writes data/aggregates/item-pool.json: per hero, the items players build
// beyond the three-item core (finished-inventory shares from the daily match
// samples + first-three core shares per role from build-matchups.json).
// Zero-API. Run after `npm run aggregate` and `npm run perks` (it is in the
// refresh chain).
//
//   npm run itempool

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { itemPool, pickWindows, type CatalogItem, type CoreCell, type DailyAggregate } from '../item-pool.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = <T>(p: string): T => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8')) as T;

const bm = read<{ patch: string; window?: { matches?: number }; heroes: Record<string, { all: CoreCell }> }>('data/aggregates/build-matchups.json');
const catalog = read<CatalogItem[]>('data/catalog/items.json');
const files = readdirSync(path.join(ROOT, 'data/aggregates')).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
const dailies = new Map<string, DailyAggregate>();
// Older samples carry no window or per-match versions; they are never on the current patch.
const windows = files.flatMap((f) => {
  const d = read<DailyAggregate>(`data/aggregates/${f}`);
  if (!d.meta?.window?.from || !d.meta.versions) return [];
  dailies.set(f, d);
  return [{ file: f, from: d.meta.window.from, to: d.meta.window.to, versions: d.meta.versions }];
});
const kept = pickWindows(windows, bm.patch);
const heroes = itemPool(kept.map((w) => dailies.get(w.file)!), bm.heroes, catalog);

writeFileSync(path.join(ROOT, 'data/aggregates/item-pool.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  patch: bm.patch,
  source: `finished items: pred.gg match samples (npm run aggregate), patch ${bm.patch}, non-overlapping windows ${kept.map((w) => w.file.slice(0, 10)).sort().join(', ')}; core shares: build-matchups.json (ranked match stream, ${bm.window?.matches ?? '?'} matches)`,
  note: 'n/w = end-of-game inventories holding the item and their wins (hero-wide, all ranks and modes in the sample). share = n / hero games. core[role] / corePlat[role] = share of that hero-role\'s players (all ranks / Plat+ at match time) with the item among their first three completed items. tag = the enemy threat the item answers, from its catalog aggression type. Finished-item win rates lean toward longer games: a team that is ahead finishes more items.',
  windows: kept.map((w) => ({ from: w.from, to: w.to })),
  heroes,
}, null, 1));
console.log(`item-pool: ${Object.keys(heroes).length} heroes from ${kept.length} windows -> data/aggregates/item-pool.json`);

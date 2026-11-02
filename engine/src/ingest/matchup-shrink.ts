// Zero-API: recompute the shrunk head-to-head rates in
// data/aggregates/feed-matchups.json from its committed raw `cells` and the
// current index roleWr (src/matchup-edge.ts). npm run matchups:feed does this
// itself; rerun this after `npm run artifacts` changes the lane win rates.
//
//   npm run matchups:shrink

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { roleWrOf, shrinkPairs, SHRINK_NOTE, MATCHUP_MIN_GAMES } from '../matchup-edge.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'data/aggregates/feed-matchups.json');
const feed = JSON.parse(readFileSync(OUT, 'utf8'));
if (!feed.cells) { console.error('feed-matchups.json has no raw cells; run npm run matchups:feed'); process.exit(1); }
const index = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/index.json'), 'utf8'));
const { pairs, k } = shrinkPairs(feed.cells, roleWrOf(index), MATCHUP_MIN_GAMES);
// keep key order: everything as committed, pairs/shrink replaced in place
const out: Record<string, unknown> = {};
for (const [key, v] of Object.entries(feed)) {
  if (key === 'pairs') { out.shrink = { k, note: SHRINK_NOTE }; out.pairs = pairs; }
  else if (key !== 'shrink') out[key] = v;
}
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`${Object.keys(pairs).length} pairs shrunk (k = ${k} games) -> ${OUT}`);

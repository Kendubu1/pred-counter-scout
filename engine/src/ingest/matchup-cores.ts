// npm run matchups:cores (zero-API): the best 3-item cores INTO A LANE OPPONENT, counted from
// the current patch's ranked lineups (data/aggregates/team-comps/<patch>/, full purchase order
// per player since team-comps/v2). Core = the first three distinct Epic passive items in
// purchase order, the same definition as perk-stream's cores; cores are pooled across purchase
// order (keyed as a set) and shown in their most common order.
//
// Out: data/aggregates/matchup-cores.json
//   pairs["<hero>|<role>|<lane opponent>"] = { n, w, cores: [{ coreSlugs, n, w }] }
//   kept when the pair has MIN_PAIR+ games; cores with MIN_CORE+ games, best 5 by count.
// Read by src/build-notes.ts as the review's "Best core vs <opponent>" (shrunk toward the
// pair's own win rate, 50 games of prior, like the overall core). Rerun daily after perks.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchDir, readRows } from './team-comps.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MIN_PAIR = 60, MIN_CORE = 15;
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

const meta = read('data/catalog/META.json');
const corePiece = new Set((read('data/catalog/items.json') as any[]).filter((i) => i.rarity === 'Epic' && i.slot_type === 'Passive').map((i) => i.slug));
const rows = readRows(patchDir(meta.patch));
type Cell = { n: number; w: number; cores: Map<string, { n: number; w: number; orders: Map<string, number> }> };
const pairs = new Map<string, Cell>();
let sides = 0;
for (const r of rows) {
  for (const t of [0, 1] as const) {
    const won = r.win === t;
    for (const s of r.teams[t]) {
      const opp = r.teams[1 - t]!.find((o) => o[1] === s[1]);
      if (!opp) continue;
      sides++;
      const key = `${s[0]}|${s[1]}|${opp[0]}`;
      const c = pairs.get(key) ?? { n: 0, w: 0, cores: new Map() };
      c.n++; if (won) c.w++;
      const core = (s[3] ?? []).filter((x) => corePiece.has(x)).slice(0, 3);
      if (core.length === 3) {
        const k = [...core].sort().join('|');
        const cc = c.cores.get(k) ?? { n: 0, w: 0, orders: new Map() };
        cc.n++; if (won) cc.w++;
        cc.orders.set(core.join('|'), (cc.orders.get(core.join('|')) ?? 0) + 1);
        c.cores.set(k, cc);
      }
      pairs.set(key, c);
    }
  }
}
const out: Record<string, { n: number; w: number; cores: { coreSlugs: string[]; n: number; w: number }[] }> = {};
for (const [k, c] of pairs) {
  if (c.n < MIN_PAIR) continue;
  const cores = [...c.cores.values()].filter((x) => x.n >= MIN_CORE).sort((a, b) => b.n - a.n).slice(0, 5)
    .map((x) => ({ coreSlugs: [...x.orders].sort((a, b) => b[1] - a[1])[0]![0].split('|'), n: x.n, w: x.w }));
  if (cores.length) out[k] = { n: c.n, w: c.w, cores };
}
writeFileSync(path.join(ROOT, 'data/aggregates/matchup-cores.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), patch: meta.patch, source: `ranked lineups in data/aggregates/team-comps/${meta.patch}/ (${rows.length} matches)`,
  note: `Lane pairs with ${MIN_PAIR}+ games; cores (first three Epic passive items, any order, shown in the most common order) with ${MIN_CORE}+ games. Win rates are raw; readers shrink them.`,
  minPair: MIN_PAIR, minCore: MIN_CORE, pairs: out,
}));
console.log(`matchup cores ${meta.patch}: ${rows.length} matches, ${sides} lane sides; ${Object.keys(out).length} of ${pairs.size} lane pairs kept (${MIN_PAIR}+ games with a ${MIN_CORE}+ game core)`);

// npm run loadouts (zero-API): the augment-led loadout, data/artifacts/loadouts/<hero>.json.
//
// WHY AUGMENT FIRST (maintainer, 2026-11-10): in a ranked draft the augment and the Eternal are
// locked before the first item is bought, and they differ for every hero and lane, while matchup
// and item advice applies anywhere. So the hero page starts from the augment and everything
// hero-specific follows it: per hero-role, per augment with MIN_AUGMENT+ players,
//   eternals / crests  ranked INSIDE that augment by the site's edge rule (the augment is treated
//                      like a rank band: each option shrunk toward its own lane-wide rate plus the
//                      augment's gap), with what players run beside it
//   builds             the ordered three-item cores its players open with, ranked the same way
//                      against the lane's cores (among players who finished three items)
//   openers            the first item its players buy
// Measured the same day: with the augment fixed, opening on a different first item than most of
// its players costs about 1.8 points of win rate (+- 0.8, 51 augments); a different Eternal than
// most run costs nothing on average, because the most-run Eternal is often not the best one.
// Counted from the patch's ranked lineups; loadout names from data/aggregates/perk-catalog.json.
// Rules reuse src/build-picks.ts readList. Rerun daily after `npm run perks` (in `npm run refresh`).
//
//   npm run loadouts            write the artifacts
//   npm run loadouts -- zinx    also print that hero's read
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchDir, readRows } from './team-comps.js';
import { readList, type Opt, type PickRead } from '../build-picks.js';
import { bandPrior, rankByEdge } from '../field-pick.js';
import { PLAT_TIER } from './build-matchups.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'data/artifacts/loadouts');
export const MIN_AUGMENT = 60, MIN_LANE = 150;
/** Plat+ view: the lane needs this many Plat+ games, an augment tab this many (thin by nature; every
 *  Plat+ list borrows the all-ranks evidence as its prior, the site's Plat+ rule). */
export const MIN_PLAT_LANE = 60, MIN_PLAT_AUGMENT = 20;
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const meta = read('data/catalog/META.json');
const catalog = read('data/catalog/items.json') as { slug: string; display_name: string; rarity: string; slot_type: string }[];
const buildItem = new Set(catalog.filter((i) => i.rarity === 'Epic' && i.slot_type === 'Passive').map((i) => i.slug));
const crestName = new Map(catalog.filter((i) => i.slot_type === 'Crest' && !i.slug.endsWith('-crest')).map((i) => [i.slug, i.display_name]));
const perks = read('data/aggregates/perk-catalog.json').perks as Record<string, { id: string; name: string; slot: string }>;

interface Slice { games: number; wins: number; eternals: Opt[]; crests: Opt[]; cores: Opt[]; coreGames: number; coreWins: number; openers: Record<string, number>; anyItem: number }
const slice = (): Slice => ({ games: 0, wins: 0, eternals: [], crests: [], cores: [], coreGames: 0, coreWins: 0, openers: {}, anyItem: 0 });
const bump = (xs: Opt[], id: string | undefined, name: string, won: boolean) => {
  let o = xs.find((x) => (id ? x.id === id : x.name === name));
  if (!o) xs.push((o = { ...(id ? { id } : {}), name, n: 0, w: 0 }));
  o.n++; if (won) o.w++;
};
function count(c: Slice, et: string | null, crest: string | null, items: string[], won: boolean) {
  c.games++; if (won) c.wins++;
  if (et) bump(c.eternals, undefined, et, won);
  if (crest) bump(c.crests, undefined, crest, won);
  if (items.length) { c.anyItem++; c.openers[items[0]!] = (c.openers[items[0]!] ?? 0) + 1; }
  if (items.length >= 3) { c.coreGames++; if (won) c.coreWins++; bump(c.cores, undefined, items.slice(0, 3).join('>'), won); }
}

const rows = readRows(patchDir(meta.patch));
interface Band { lane: Slice; augs: Opt[]; byAug: Map<string, Slice> }
const band = (): Band => ({ lane: slice(), augs: [], byAug: new Map() });
const lanes = new Map<string, { all: Band; plat: Band }>();
for (const r of rows) for (const t of [0, 1] as const) for (const s of r.teams[t]) {
  if (!s[3] || !s[6]) continue;
  let aug: { id: string; name: string } | null = null, et: string | null = null;
  for (const x of s[6]) { const p = perks[x]; if (p?.slot === 'HERO_SPECIFIC_1') aug = { id: p.id, name: p.name }; else if (p?.slot === 'ETERNAL_1') et = p.name; }
  if (!aug) continue;
  const won = r.win === t, k = `${s[0]}|${s[1]}`;
  const hr = lanes.get(k) ?? { all: band(), plat: band() };
  lanes.set(k, hr);
  const crestSlug = [...s[3]].reverse().find((x) => crestName.has(x));
  const crest = crestSlug ? crestName.get(crestSlug)! : null;
  const items = [...new Set(s[3].filter((x) => buildItem.has(x)))];
  // Plat+ = the rank the player held IN THAT GAME (match-rank.ts), never the ladder.
  for (const b of s[2] != null && s[2] >= PLAT_TIER ? [hr.all, hr.plat] : [hr.all]) {
    count(b.lane, et, crest, items, won);
    bump(b.augs, aug.id, aug.name, won);
    count(b.byAug.get(aug.id) ?? b.byAug.set(aug.id, slice()).get(aug.id)!, et, crest, items, won);
  }
}

interface AugRead {
  id: string; name: string; n: number; w: number; sharePct: number; shrunk: number; few: boolean;
  eternals: PickRead; crests: PickRead;
  /** ordered cores (items "a>b>c" in rows[].name), ranked among this augment's players who finished three items */
  builds: PickRead; coreGames: number;
  openers: { item: string; pct: number }[];
}
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.json')) unlinkSync(path.join(OUT, f));
interface View { games: number; wins: number; augmentLabel: string; augments: AugRead[] }
const byHero = new Map<string, Record<string, View & { plat?: View }>>();
const tally: Record<string, number> = {};
let nAug = 0, etPairs = 0, etChanges = 0, buildPairs = 0, platLanes = 0, platAugs = 0;
const labelOf = (ar: { thin: boolean; confidence: string | null }) => (ar.thin ? 'By games' : ar.confidence === 'clear' ? 'Best' : ar.confidence === 'slight' ? 'Leans' : ar.confidence === 'toss-up' ? 'Toss-up' : 'Most played');
const openersOf = (sl: Slice) => Object.entries(sl.openers).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([item, v]) => ({ item, pct: Math.round((100 * v) / sl.anyItem) })).filter((x) => x.pct >= 8);
for (const [k, hr] of lanes) {
  const all = hr.all;
  if (all.lane.games < MIN_LANE) continue;
  const [hero, role] = k.split('|') as [string, string];
  // Lane-wide augment order: the same edge rule the Opening Picks card uses.
  const ar = rankByEdge(all.augs, all.lane.games);
  const augments: AugRead[] = [];
  for (const a of [...ar.ranked, ...ar.below]) {
    const sl = all.byAug.get(String(a.id));
    if (!sl || sl.games < MIN_AUGMENT) continue;
    const laneCore = { games: all.lane.coreGames, wins: all.lane.coreWins }, augCore = { games: sl.coreGames, wins: sl.coreWins };
    const rd: AugRead = {
      id: String(a.id), name: a.name, n: a.n, w: a.w, sharePct: Math.round((100 * a.n) / all.lane.games), shrunk: Math.round(a.shrunk * 1000) / 10, few: a.few,
      eternals: readList(all.lane.eternals, all.lane, sl.eternals, sl), crests: readList(all.lane.crests, all.lane, sl.crests, sl),
      builds: readList(all.lane.cores, laneCore, sl.cores, augCore), coreGames: sl.coreGames, openers: openersOf(sl),
    };
    augments.push(rd); nAug++;
    tally[rd.eternals.label] = (tally[rd.eternals.label] ?? 0) + 1;
    if (rd.eternals.pairs) etPairs++; if (rd.eternals.changes) etChanges++; if (rd.builds.pairs) buildPairs++;
  }
  if (!augments.length) continue;
  const view: View & { plat?: View } = { games: all.lane.games, wins: all.lane.wins, augmentLabel: labelOf(ar), augments };
  // Plat+ view (the page's rank filter). Thin by nature, so each list is ranked with the ALL-RANKS
  // numbers as its prior, one level down: the augments against the lane's all-ranks augments, and
  // each list inside an augment against the same augment's all-ranks list (both shifted by the
  // Plat+ win-rate gap). A Plat+ sample moves a pick only as far as its games can carry it.
  const pl = hr.plat;
  if (pl.lane.games >= MIN_PLAT_LANE) {
    const pr = rankByEdge(pl.augs, pl.lane.games, { prior: bandPrior(all.augs, all.lane, pl.lane) });
    const pAugs: AugRead[] = [];
    for (const a of pr.ranked) {
      const sl = pl.byAug.get(String(a.id)), base = all.byAug.get(String(a.id));
      if (!sl || !base || sl.games < MIN_PLAT_AUGMENT) continue;
      const plain = (r: PickRead): PickRead => ({ ...r, changes: false, pairs: false }); // those flags compare with the lane, not with all ranks
      pAugs.push({
        id: String(a.id), name: a.name, n: a.n, w: a.w, sharePct: Math.round((100 * a.n) / pl.lane.games), shrunk: Math.round(a.shrunk * 1000) / 10, few: a.few,
        eternals: plain(readList(base.eternals, base, sl.eternals, sl)), crests: plain(readList(base.crests, base, sl.crests, sl)),
        builds: plain(readList(base.cores, { games: base.coreGames, wins: base.coreWins }, sl.cores, { games: sl.coreGames, wins: sl.coreWins })), coreGames: sl.coreGames, openers: openersOf(sl),
      });
    }
    if (pAugs.length) { view.plat = { games: pl.lane.games, wins: pl.lane.wins, augmentLabel: labelOf(pr), augments: pAugs }; platLanes++; platAugs += pAugs.length; }
  }
  (byHero.get(hero) ?? byHero.set(hero, {}).get(hero)!)[role] = view;
}
const window = { patch: meta.patch, matches: rows.length };
const note = 'Per hero-role: augments in the lane\'s edge order (augmentLabel says how sure the first one is; shrunk = shrunk win rate, sharePct = share of the lane running it). Per augment with 60+ players: eternals / crests / builds = PickRead lists ranked inside that augment against the lane (label Best / Leans / Toss-up / Most played / By games; rows = games, wins, shrunk win rate, few; mostRun = what its players run; pairs = most of them run something the lane does not lead with; changes = the lead differs from the lane\'s on a clear edge). builds rows name an ordered core "a>b>c" among players who finished three items (coreGames). openers = first item bought. roles[role].plat = the same view for Plat+ players (rank in that game; lane 60+ and augment 20+ Plat+ games), each list ranked with the all-ranks numbers as its prior.';
for (const [hero, roles] of byHero) writeFileSync(path.join(OUT, `${hero}.json`), JSON.stringify({ hero, ...window, generatedAt: new Date().toISOString(), roles }));
writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ...window, source: `ranked lineups in data/aggregates/team-comps/${meta.patch}/`, note, minAugment: MIN_AUGMENT, minPlatLane: MIN_PLAT_LANE, minPlatAugment: MIN_PLAT_AUGMENT, augments: nAug, platLanes, platAugments: platAugs, eternalLabels: tally, eternalPairs: etPairs, eternalChanges: etChanges, buildPairs, heroes: Object.fromEntries([...byHero].map(([h, r]) => [h, Object.keys(r)])) }));
console.log(`loadouts: ${rows.length} ranked matches, ${byHero.size} heroes, ${nAug} augments with ${MIN_AUGMENT}+ players; Plat+ view for ${platLanes} lanes (${platAugs} augments)`);
console.log(`  Eternal inside the augment: ${Object.entries(tally).map(([l, v]) => `${l} ${v}`).join(', ')}; leads with a different Eternal than the lane on a clear edge: ${etChanges}; most players run a different Eternal than the lane: ${etPairs}; most open a different core than the lane: ${buildPairs}`);

const want = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (want && byHero.has(want)) {
  const nm = new Map(catalog.map((i) => [i.slug, i.display_name]));
  const core = (s: string) => s.split('>').map((x) => nm.get(x)).join(' > ');
  for (const [role, rd0] of Object.entries(byHero.get(want)!)) for (const [tag, rd] of [['all ranks', rd0], ['PLAT+', rd0.plat]] as const) {
    if (!rd) continue;
    console.log(`\n${want} ${role} ${tag} (${rd.games} games) augment: ${rd.augmentLabel}`);
    for (const a of rd.augments) {
      console.log(`  ${a.name} · ${a.sharePct}% run it · ${a.shrunk}%${a.few ? ' (few)' : ''}`);
      console.log(`     Eternal ${a.eternals.label}: ${a.eternals.rows.map((x) => `${x.name} ${x.n}g ${x.shrunk}%`).join(' | ')}  most run ${a.eternals.mostRun?.name} ${a.eternals.mostRun?.pct}%${a.eternals.changes ? ' CHANGES' : ''}`);
      console.log(`     Crest   ${a.crests.label}: ${a.crests.rows.map((x) => `${x.name} ${x.n}g ${x.shrunk}%`).join(' | ')}`);
      console.log(`     Build   ${a.builds.label}: ${a.builds.rows.map((x) => `${core(x.name)} ${x.n}g ${x.shrunk}%`).join(' | ')}${a.builds.pairs ? ' PAIRS' : ''}`);
      console.log(`     Opens   ${a.openers.map((o) => `${nm.get(o.item)} ${o.pct}%`).join(', ')}`);
    }
  }
}

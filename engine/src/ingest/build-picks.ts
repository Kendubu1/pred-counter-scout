// npm run buildpicks (zero-API): picks by build, data/artifacts/build-picks/<hero>.json. For each
// hero-role and each opening three-item set with MIN_BUILD+ players: the augment, Eternal and crest
// those players ran, ranked by the site's edge rule against the lane's own picks, and what they
// bought fourth, fifth and sixth. Rules in src/build-picks.ts. Counted from the patch's ranked
// lineups (data/aggregates/team-comps/<patch>/); loadout names decoded with the committed
// data/aggregates/perk-catalog.json. Rerun daily after `npm run perks` (it is in `npm run refresh`).
//
//   npm run buildpicks                 write the artifacts
//   npm run buildpicks -- lt-belica    also print that hero's read
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchDir, readRows } from './team-comps.js';
import { MIN_BUILD, readBuild, type BuildCells, type BuildRead, type Opt, type PickCell } from '../build-picks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'data/artifacts/build-picks');
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const meta = read('data/catalog/META.json');
const catalog = read('data/catalog/items.json') as { slug: string; display_name: string; rarity: string; slot_type: string }[];
const buildItem = new Set(catalog.filter((i) => i.rarity === 'Epic' && i.slot_type === 'Passive').map((i) => i.slug));
// An evolved crest only: the starting crest every role is handed is not a choice.
const crestName = new Map(catalog.filter((i) => i.slot_type === 'Crest' && !i.slug.endsWith('-crest')).map((i) => [i.slug, i.display_name]));
const perks = read('data/aggregates/perk-catalog.json').perks as Record<string, { id: string; name: string; slot: string }>;

const cell = (): PickCell => ({ games: 0, wins: 0, augments: [], eternals: [], crests: [] });
const bump = (xs: Opt[], id: string | undefined, name: string, won: boolean) => {
  let o = xs.find((x) => (id ? x.id === id : x.name === name));
  if (!o) xs.push((o = { ...(id ? { id } : {}), name, n: 0, w: 0 }));
  o.n++; if (won) o.w++;
};
function count(c: PickCell, raw: string[], build: string[], won: boolean) {
  c.games++; if (won) c.wins++;
  for (const r of raw) {
    const p = perks[r];
    if (p?.slot === 'HERO_SPECIFIC_1') bump(c.augments, p.id, p.name, won);
    else if (p?.slot === 'ETERNAL_1') bump(c.eternals, undefined, p.name, won);
  }
  const crest = [...build].reverse().find((x) => crestName.has(x));
  if (crest) bump(c.crests, undefined, crestName.get(crest)!, won);
}

const rows = readRows(patchDir(meta.patch));
const lanes = new Map<string, { lane: PickCell; builds: Map<string, BuildCells> }>();
let unknown = 0, slots = 0;
for (const r of rows) for (const t of [0, 1] as const) for (const s of r.teams[t]) {
  if (!s[3] || !s[6]) continue; // v1 rows carry no build or loadout
  slots++;
  if (s[6].some((x) => !perks[x])) unknown++;
  const won = r.win === t, k = `${s[0]}|${s[1]}`;
  const hr = lanes.get(k) ?? { lane: cell(), builds: new Map() };
  lanes.set(k, hr);
  count(hr.lane, s[6], s[3], won);
  const items = [...new Set(s[3].filter((x) => buildItem.has(x)))];
  if (items.length < 3) continue;
  // Counted twice: as the exact purchase order ("a>b>c", what a build tab shows) and as the set
  // ("a|b|c", any order), the fallback when one order alone is too thin.
  for (const ck of [items.slice(0, 3).join('>'), items.slice(0, 3).sort().join('|')]) {
    let b = hr.builds.get(ck);
    if (!b) hr.builds.set(ck, (b = { cell: cell(), slots: [{}, {}, {}], reach: [0, 0, 0] }));
    count(b.cell, s[6], s[3], won);
    for (let i = 3; i < Math.min(6, items.length); i++) { b.reach[i - 3]!++; b.slots[i - 3]![items[i]!] = (b.slots[i - 3]![items[i]!] ?? 0) + 1; }
  }
}

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.json')) unlinkSync(path.join(OUT, f));
const byHero = new Map<string, Record<string, { games: number; wins: number; builds: BuildRead[] }>>();
let nBuilds = 0, changing = 0, pairing = 0;
const tally: Record<string, number> = {};
for (const [k, hr] of lanes) {
  const [hero, role] = k.split('|') as [string, string];
  const keep = (ordered: boolean) => [...hr.builds].filter(([ck, b]) => ck.includes('>') === ordered && b.cell.games >= MIN_BUILD).sort((a, b) => b[1].cell.games - a[1].cell.games).slice(0, 8)
    .map(([ck, b]) => readBuild(ck.split(ordered ? '>' : '|'), hr.lane, b, ordered));
  const builds = [...keep(true), ...keep(false)];
  if (!builds.length) continue;
  (byHero.get(hero) ?? byHero.set(hero, {}).get(hero)!)[role] = { games: hr.lane.games, wins: hr.lane.wins, builds };
  for (const b of builds) { nBuilds++; for (const kind of ['augments', 'eternals', 'crests'] as const) { tally[b[kind].label] = (tally[b[kind].label] ?? 0) + 1; if (b[kind].changes) changing++; if (b[kind].pairs) pairing++; } }
}
const window = { patch: meta.patch, matches: rows.length };
const note = 'Per hero-role, per opening three items with 60+ players, both as the exact purchase order (ordered: true, core in order) and as the set in any order (ordered: false, core sorted): mostRun / laneMostRun / pairs = what players on the build run, and whether most of them run a different pick than the lane (a choice, not a win claim); n / w = players and wins; augments / eternals / crests = the picks those players ran, ranked by the edge rule with each option shrunk toward its own lane-wide rate plus the build gap (label Best / Leans / Toss-up / Most played / By games; rows carry games, wins and the shrunk win rate; few = too few games to lead); laneLead = the lane-wide lead; changes = this build\'s lead is a different pick with a clear (90%+) edge. next = the most bought fourth, fifth and sixth items among players who bought one in that slot (counts only).';
for (const [hero, roles] of byHero) writeFileSync(path.join(OUT, `${hero}.json`), JSON.stringify({ hero, ...window, generatedAt: new Date().toISOString(), roles }));
writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ...window, source: `ranked lineups in data/aggregates/team-comps/${meta.patch}/`, note, minBuild: MIN_BUILD, builds: nBuilds, picksChanging: changing, picksPairing: pairing, labels: tally, heroes: Object.fromEntries([...byHero].map(([h, r]) => [h, Object.keys(r)])) }));
console.log(`build-picks: ${rows.length} ranked matches, ${byHero.size} heroes, ${nBuilds} builds with ${MIN_BUILD}+ players; ${unknown} of ${slots} loadouts had a perk name not in the catalog`);
console.log(`  pick labels over ${nBuilds * 3} lists: ${Object.entries(tally).map(([l, v]) => `${l} ${v}`).join(', ')}; ${changing} lists lead with a different pick than the lane on a clear edge; in ${pairing} most players on the build run a different pick than the lane`);

const want = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (want && byHero.has(want)) {
  const nm = new Map(catalog.map((i) => [i.slug, i.display_name]));
  for (const [role, rd] of Object.entries(byHero.get(want)!)) for (const b of rd.builds) {
    console.log(`\n${want} ${role}: ${b.core.map((s) => nm.get(s)).join(b.ordered ? ' > ' : ' + ')} (${b.n} players, ${(100 * b.w / b.n).toFixed(1)}%)`);
    for (const kind of ['augments', 'eternals', 'crests'] as const) console.log(`  ${kind.padEnd(9)} ${b[kind].label.padEnd(11)} ${b[kind].rows.map((x) => `${x.name} ${x.n}g ${x.shrunk}%${x.few ? ' (few)' : ''}`).join(' | ')}  [lane: ${b[kind].laneLead}${b[kind].changes ? ' -> CHANGES' : ''}] most run: ${b[kind].mostRun?.name} ${b[kind].mostRun?.pct}%${b[kind].pairs ? ' -> PAIRS (lane runs ' + b[kind].laneMostRun + ')' : ''}`);
    console.log(`  then      ${b.next.map((n) => `#${n.slot} ${n.top.map((x) => `${nm.get(x.item)} ${x.pct}%`).join(', ')} (n=${n.n})`).join(' | ')}`);
  }
}

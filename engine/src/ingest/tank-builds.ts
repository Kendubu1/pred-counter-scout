// npm run tanks (zero-API): data/aggregates/tank-builds.json, the "Tankiest winning builds" page
// (ui/v6/tanks.html): per lane (offlane, jungle, support) the hero + Eternal groups that soak the most
// damage per death and still win. Rules in src/tank-builds.ts. Counted from the patch's ranked
// lineups (output totals, build and loadout per player). Rerun daily after `npm run perks`.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchDir, readRows, STAT_KEYS } from './team-comps.js';
import { BOARD, MIN_DURATION, MIN_GAMES, WIN_K, WIN_MIN, addGame, eternalEffects, rankTanks, tankAgg, tankStats, type TankAgg } from '../tank-builds.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const meta = read('data/catalog/META.json');
const catalog = read('data/catalog/items.json') as { slug: string; display_name: string; rarity: string; slot_type: string }[];
const heroName = new Map((read('data/catalog/heroes.json') as { slug: string; display_name: string }[]).map((h) => [h.slug, h.display_name]));
const buildItem = new Set(catalog.filter((i) => i.rarity === 'Epic' && i.slot_type === 'Passive').map((i) => i.slug));
const crestName = new Map(catalog.filter((i) => i.slot_type === 'Crest' && !i.slug.endsWith('-crest')).map((i) => [i.slug, i.display_name]));
const perks = read('data/aggregates/perk-catalog.json').perks as Record<string, { id: string; name: string; slot: string }>;
const LANES = ['offlane', 'jungle', 'support'] as const;
const I = { mit: STAT_KEYS.indexOf('mitigated'), taken: STAT_KEYS.indexOf('takenHeroes'), deaths: STAT_KEYS.indexOf('deaths') };

interface Group { hero: string; lane: string; eternal: string; agg: TankAgg; augs: Map<string, { name: string; n: number }>; crests: Map<string, number>; cores: Map<string, number>; coreN: number; late: Map<string, number>; lateN: number }
const groups = new Map<string, Group>(), heroLane = new Map<string, TankAgg>(), laneAll = new Map<string, TankAgg>();
const rows = readRows(patchDir(meta.patch));
const bumpN = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
for (const r of rows) {
  if (r.dur < MIN_DURATION) continue;
  for (const t of [0, 1] as const) for (const s of r.teams[t]) {
    const st = s[5];
    if (!st || !s[3] || !s[6] || !(LANES as readonly string[]).includes(s[1]) || st[I.mit]! < 0 || st[I.taken]! < 0 || st[I.deaths]! < 0) continue;
    let et = '', aug: { id: string; name: string } | null = null;
    for (const x of s[6]) { const p = perks[x]; if (p?.slot === 'ETERNAL_1') et = p.name; else if (p?.slot === 'HERO_SPECIFIC_1') aug = { id: p.id, name: p.name }; }
    if (!et) continue;
    const won = r.win === t, args = [st[I.mit]!, st[I.taken]!, st[I.deaths]!, r.dur, won] as const;
    addGame(heroLane.get(`${s[0]}|${s[1]}`) ?? heroLane.set(`${s[0]}|${s[1]}`, tankAgg()).get(`${s[0]}|${s[1]}`)!, ...args);
    addGame(laneAll.get(s[1]) ?? laneAll.set(s[1], tankAgg()).get(s[1])!, ...args);
    const k = `${s[0]}|${s[1]}|${et}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { hero: s[0], lane: s[1], eternal: et, agg: tankAgg(), augs: new Map(), crests: new Map(), cores: new Map(), coreN: 0, late: new Map(), lateN: 0 }));
    addGame(g.agg, ...args);
    if (aug) { const a = g.augs.get(aug.id) ?? { name: aug.name, n: 0 }; a.n++; g.augs.set(aug.id, a); }
    const crest = [...s[3]].reverse().find((x) => crestName.has(x));
    if (crest) bumpN(g.crests, crest);
    const items = [...new Set(s[3].filter((x) => buildItem.has(x)))];
    if (items.length >= 3) { g.coreN++; bumpN(g.cores, items.slice(0, 3).join('>')); }
    if (items.length >= 4) { g.lateN++; for (const it of items.slice(3, 6)) bumpN(g.late, it); }
  }
}
const top = <K>(m: Map<K, number>) => [...m].sort((a, b) => b[1] - a[1])[0] ?? null;
const lanes: Record<string, unknown> = {};
for (const lane of LANES) {
  const board = rankTanks([...groups.values()].filter((g) => g.lane === lane), BOARD);
  // Per hero in this lane: everyone, and by Eternal, for the "which Eternal" comparison.
  const heroes = new Map<string, TankAgg>(), byEt = new Map<string, Map<string, TankAgg>>();
  for (const [k, a] of heroLane) if (k.endsWith(`|${lane}`)) heroes.set(k.split('|')[0]!, a);
  for (const g of groups.values()) if (g.lane === lane) (byEt.get(g.hero) ?? byEt.set(g.hero, new Map()).get(g.hero)!).set(g.eternal, g.agg);
  const avg = tankStats(laneAll.get(lane)!);
  lanes[lane] = {
    laneAverage: avg,
    eternals: eternalEffects(heroes, byEt, avg.soakPerDeath),
    board: board.map((g) => {
      const aug = [...g.augs].sort((a, b) => b[1].n - a[1].n)[0], crest = top(g.crests), core = top(g.cores);
      const hl = heroLane.get(`${g.hero}|${g.lane}`)!;
      const others: TankAgg = { n: hl.n - g.agg.n, w: hl.w - g.agg.w, min: hl.min - g.agg.min, mit: hl.mit - g.agg.mit, takenH: hl.takenH - g.agg.takenH, deaths: hl.deaths - g.agg.deaths };
      return {
        hero: g.hero, heroName: heroName.get(g.hero) ?? g.hero, eternal: g.eternal, ...tankStats(g.agg),
        otherEternals: others.n >= 100 ? tankStats(others) : null,
        augment: aug ? { id: aug[0], name: aug[1].name, pct: Math.round((100 * aug[1].n) / g.agg.n) } : null,
        crest: crest ? { slug: crest[0], name: crestName.get(crest[0])!, pct: Math.round((100 * crest[1]) / g.agg.n) } : null,
        // the opening three its players buy most, in order, when 10+ of them did
        core: core && core[1] >= 10 ? { items: core[0].split('>'), n: core[1], of: g.coreN } : null,
        later: [...g.late].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([item, v]) => ({ item, pct: Math.round((100 * v) / g.lateN) })).filter((x) => x.pct >= 10),
      };
    }),
  };
}
writeFileSync(path.join(ROOT, 'data/aggregates/tank-builds.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), patch: meta.patch, matches: rows.length,
  source: `ranked lineups in data/aggregates/team-comps/${meta.patch}/ (games of ten minutes or more)`,
  note: `Per lane: hero + Eternal groups with ${MIN_GAMES}+ games whose win rate, pulled ${WIN_K} games toward 50%, is ${WIN_MIN * 100}% or better, ranked by soakPerDeath = (damage mitigated + hero damage taken) / deaths. deathsPer10 = deaths per ten minutes. otherEternals = the same hero and lane on every other Eternal. augment / crest / core / later = what the group's players run most (core = opening three in purchase order; later = items bought fourth to sixth, share of players who bought a fourth). laneAverage = every player in that lane. eternals = each Eternal against the same tank hero on every other Eternal, pooled over the lane's tank heroes: winDelta in points with its 95% margin, soakPct and deathsPct changes, verdict only when the whole margin is on one side of zero.`,
  minGames: MIN_GAMES, lanes,
}));
for (const lane of LANES) { const l = lanes[lane] as any; console.log(`  ${lane} Eternals: ${l.eternals.map((e: any) => `${e.eternal} ${e.winDelta >= 0 ? '+' : ''}${e.winDelta}±${e.margin} [${e.verdict}]`).join(', ')}`); console.log(`${lane} (lane average soak per death ${l.laneAverage.soakPerDeath}): ${l.board.map((b: any) => `${b.heroName}+${b.eternal} ${b.soakPerDeath} (${b.winPct}%, ${b.games}g)`).join(' | ')}`); }

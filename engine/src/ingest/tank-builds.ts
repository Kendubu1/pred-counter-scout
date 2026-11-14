// npm run tanks (zero-API): data/aggregates/top-builds.json, the "Top builds by job" page
// (ui/v6/tanks.html): per rank band and per job (tankiest, healing, shielding, magic damage, carry
// damage) the hero + Eternal groups that lead the job and still win, with the Eternal comparison
// for that job. Rules in src/output-boards.ts and src/tank-builds.ts. Counted from the patch's
// ranked lineups (output totals, build and loadout per player). Rerun daily after `npm run perks`.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchDir, readRows, STAT_KEYS } from './team-comps.js';
import { BANDS, MIN_DURATION, WIN_K, WIN_MIN, inBand } from '../tank-builds.js';
import { ALL_LANES, BOARDS, addOut, eternalReads, minus, outAgg, rankBoard, type OutAgg, type OutGame } from '../output-boards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const meta = read('data/catalog/META.json');
const catalog = read('data/catalog/items.json') as { slug: string; display_name: string; rarity: string; slot_type: string }[];
const heroName = new Map((read('data/catalog/heroes.json') as { slug: string; display_name: string }[]).map((h) => [h.slug, h.display_name]));
const buildItem = new Set(catalog.filter((i) => i.rarity === 'Epic' && i.slot_type === 'Passive').map((i) => i.slug));
const crestName = new Map(catalog.filter((i) => i.slot_type === 'Crest' && !i.slug.endsWith('-crest')).map((i) => [i.slug, i.display_name]));
const perks = read('data/aggregates/perk-catalog.json').perks as Record<string, { id: string; name: string; slot: string }>;
const ix = (k: (typeof STAT_KEYS)[number]) => STAT_KEYS.indexOf(k);
const I = { mit: ix('mitigated'), taken: ix('takenHeroes'), deaths: ix('deaths'), dmg: ix('dmgHeroes'), mag: ix('magHeroes'), heal: ix('healing'), shield: ix('shieldsReceived') };
const pos = (v: number | undefined) => (v != null && v > 0 ? v : 0);

interface Group { hero: string; lane: string; eternal: string; agg: OutAgg; augs: Map<string, { name: string; n: number }>; crests: Map<string, number>; cores: Map<string, number>; coreN: number; late: Map<string, number>; lateN: number }
interface Counts { groups: Map<string, Group>; heroLane: Map<string, OutAgg>; rows: number }
const counts = new Map<string, Counts>(BANDS.map((b) => [b.key, { groups: new Map(), heroLane: new Map(), rows: 0 }]));
const rows = readRows(patchDir(meta.patch));
const bumpN = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
for (const r of rows) {
  if (r.dur < MIN_DURATION) continue;
  for (const t of [0, 1] as const) {
    const team = r.teams[t];
    for (const s of team) {
      const st = s[5];
      if (!st || !s[3] || !s[6] || !(ALL_LANES as readonly string[]).includes(s[1]) || st[I.mit]! < 0 || st[I.taken]! < 0 || st[I.deaths]! < 0 || st[I.dmg]! < 0) continue;
      let et = '', aug: { id: string; name: string } | null = null;
      for (const x of s[6]) { const p = perks[x]; if (p?.slot === 'ETERNAL_1') et = p.name; else if (p?.slot === 'HERO_SPECIFIC_1') aug = { id: p.id, name: p.name }; }
      if (!et) continue;
      const game: OutGame = {
        mitigated: st[I.mit]!, takenFromHeroes: st[I.taken]!, deaths: st[I.deaths]!, damage: st[I.dmg]!, magic: pos(st[I.mag]), healing: pos(st[I.heal]),
        teamShield: team.reduce((q, x) => (x === s ? q : q + pos(x[5]?.[I.shield])), 0), durSec: r.dur, won: r.win === t,
      };
      const crest = [...s[3]].reverse().find((x) => crestName.has(x));
      const items = [...new Set(s[3].filter((x) => buildItem.has(x)))];
      for (const band of BANDS) {
        if (!inBand(band, s[2])) continue;
        const c = counts.get(band.key)!;
        c.rows++;
        const hl = `${s[0]}|${s[1]}`;
        addOut(c.heroLane.get(hl) ?? c.heroLane.set(hl, outAgg()).get(hl)!, game);
        const k = `${hl}|${et}`;
        let g = c.groups.get(k);
        if (!g) c.groups.set(k, (g = { hero: s[0], lane: s[1], eternal: et, agg: outAgg(), augs: new Map(), crests: new Map(), cores: new Map(), coreN: 0, late: new Map(), lateN: 0 }));
        addOut(g.agg, game);
        if (aug) { const a = g.augs.get(aug.id) ?? { name: aug.name, n: 0 }; a.n++; g.augs.set(aug.id, a); }
        if (crest) bumpN(g.crests, crest);
        if (items.length >= 3) { g.coreN++; bumpN(g.cores, items.slice(0, 3).join('>')); }
        if (items.length >= 4) { g.lateN++; for (const it of items.slice(3, 6)) bumpN(g.late, it); }
      }
    }
  }
}
const top = <K>(m: Map<K, number>) => [...m].sort((a, b) => b[1] - a[1])[0] ?? null;
const r1 = (n: number) => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10);
const sum = (as: OutAgg[]) => { const o = outAgg(); for (const a of as) { o.n += a.n; o.w += a.w; o.min += a.min; o.mit += a.mit; o.takenH += a.takenH; o.deaths += a.deaths; o.dmg += a.dmg; o.mag += a.mag; o.heal += a.heal; o.teamShield += a.teamShield; } return o; };
const bands: Record<string, unknown> = {};
for (const band of BANDS) {
  const { groups, heroLane, rows: bandRows } = counts.get(band.key)!;
  const boards: Record<string, unknown> = {};
  for (const def of BOARDS) {
    boards[def.key] = { sections: def.sections.map((sec) => {
      const inSec = (lane: string) => sec.lanes.includes(lane);
      const heroLanes = new Map([...heroLane].filter(([k]) => inSec(k.split('|')[1]!)));
      const avgAgg = sum([...heroLanes.values()]);
      const average = avgAgg.n ? def.value(avgAgg) : 0;
      const secGroups = [...groups.values()].filter((g) => inSec(g.lane));
      const byEt = new Map<string, Map<string, OutAgg>>();
      for (const g of secGroups) { const hl = `${g.hero}|${g.lane}`; (byEt.get(hl) ?? byEt.set(hl, new Map()).get(hl)!).set(g.eternal, g.agg); }
      const board = rankBoard(secGroups, def, band.minGames);
      return {
        key: sec.key, label: sec.label, average: r1(average),
        eternals: average ? eternalReads(heroLanes, byEt, average, def, band) : [],
        rows: board.map(({ lead: g, alts }) => {
          const aug = [...g.augs].sort((a, b) => b[1].n - a[1].n)[0], crest = top(g.crests), core = top(g.cores);
          const others = minus(heroLane.get(`${g.hero}|${g.lane}`)!, g.agg);
          return {
            hero: g.hero, heroName: heroName.get(g.hero) ?? g.hero, lane: g.lane, eternal: g.eternal,
            games: g.agg.n, winPct: Math.round((1000 * g.agg.w) / g.agg.n) / 10, shrunkWinPct: Math.round((1000 * (g.agg.w + WIN_K * 0.5)) / (g.agg.n + WIN_K)) / 10,
            value: r1(def.value(g.agg)), deathsPer10: Math.round((1000 * g.agg.deaths) / g.agg.min) / 100,
            mitigatedPerMin: Math.round(g.agg.mit / g.agg.min), damagePerMin: Math.round(g.agg.dmg / g.agg.min),
            alts: alts.map((x) => ({ eternal: x.eternal, value: r1(def.value(x.agg)), winPct: Math.round((1000 * x.agg.w) / x.agg.n) / 10, games: x.agg.n })),
            others: others.n >= band.othersMin ? { games: others.n, winPct: Math.round((1000 * others.w) / others.n) / 10, value: r1(def.value(others)) } : null,
            augment: aug ? { id: aug[0], name: aug[1].name, pct: Math.round((100 * aug[1].n) / g.agg.n) } : null,
            crest: crest ? { slug: crest[0], name: crestName.get(crest[0])!, pct: Math.round((100 * crest[1]) / g.agg.n) } : null,
            // the opening three its players buy most, in order, when 10+ of them did
            core: core && core[1] >= 10 ? { items: core[0].split('>'), n: core[1], of: g.coreN } : null,
            later: g.lateN >= 20 ? [...g.late].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([item, v]) => ({ item, pct: Math.round((100 * v) / g.lateN) })).filter((x) => x.pct >= 10) : [],
          };
        }),
      };
    }) };
  }
  bands[band.key] = { label: band.label, minGames: band.minGames, playerRows: bandRows, boards };
}
const old = path.join(ROOT, 'data/aggregates/tank-builds.json');
if (existsSync(old)) unlinkSync(old); // replaced by top-builds.json
writeFileSync(path.join(ROOT, 'data/aggregates/top-builds.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), patch: meta.patch, matches: rows.length,
  source: `ranked lineups in data/aggregates/team-comps/${meta.patch}/ (games of ten minutes or more)`,
  note: `bands[key] = one rank band (rank held in that game, that rank and above; unplaced players only under all): minGames = games a hero + Eternal group needs there, playerRows = player-games in the band. bands[key].boards[job].sections[] = one lane group of a job: average = the job's stat over every player in those lanes; rows = groups whose win rate, pulled ${WIN_K} games toward 50%, is ${WIN_MIN * 100}% or better, highest value first (value = the job's stat, see boards[].unit); one row per hero and lane, on its best qualifying Eternal, with its other qualifying Eternals in alts; others = the same hero and lane on every other Eternal; augment / crest / core / later = what the group's players run most (core = opening three in purchase order; later = items bought fourth to sixth, share of players who bought a fourth); eternals = each Eternal against the same hero on every other Eternal over the heroes good at the job: winDelta in points with its 95% margin, valuePct = change in the job's stat, verdict only when the margin clears zero.`,
  bandOrder: BANDS.map((b) => b.key),
  boards: BOARDS.map((d) => ({ key: d.key, label: d.label, title: d.title, unit: d.unit, blurb: d.blurb })),
  bands,
}));
for (const band of BANDS) { const bd = bands[band.key] as any; console.log(`\n${band.label} (${bd.playerRows} player-games, ${band.minGames}+ per row)`);
  for (const def of BOARDS) for (const sec of bd.boards[def.key].sections) console.log(`  ${def.key}/${sec.key} (avg ${sec.average}): ${sec.rows.slice(0, 3).map((b: any) => `${b.heroName}+${b.eternal} ${b.value} (${b.winPct}%, ${b.games}g)`).join(' | ') || 'no row qualifies'}   · Eternals: ${sec.eternals.filter((e: any) => e.verdict !== 'no clear change').map((e: any) => `${e.eternal} ${e.winDelta >= 0 ? '+' : ''}${e.winDelta}`).join(', ') || 'none clear'}`); }

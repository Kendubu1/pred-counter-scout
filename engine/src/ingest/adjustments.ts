// npm run adjustments (zero-API): matchup build adjustments per hero, counted from the current
// patch's ranked lineups (data/aggregates/team-comps/<patch>/). Rules in src/adjustments.ts.
//
// Out: data/artifacts/adjustments/<hero>.json (one per hero, loaded by the hero page on demand)
//      data/artifacts/adjustments/index.json  (window, bars, comp labels, per-hero-role totals)
// Rerun daily after `npm run perks` (it is in `npm run refresh`).
//
//   npm run adjustments              write the artifacts
//   npm run adjustments -- khaimera  also print that hero's read
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchDir, readRows } from './team-comps.js';
import { PLAT_TIER } from './build-matchups.js';
import { tagHero, type KitProfile } from '../team-comp.js';
import { BARS, COMP_LABELS, bandCell, countPlayer, countTiming, emptyHeroRole, needsVs, readHeroRole, readTiming, type EnemyTraits, type HeroKit, type HeroRoleCells, type HeroRoleRead, type TimingCells } from '../adjustments.js';
import { tagItems, type Answer, type CatalogItem } from '../item-tags.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'data/artifacts/adjustments');
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

const meta = read('data/catalog/META.json');
const catalog = read('data/catalog/items.json') as { slug: string; display_name: string; rarity: string; slot_type: string }[];
const buildItem = new Set(catalog.filter((i) => i.rarity === 'Epic' && i.slot_type === 'Passive').map((i) => i.slug));
const heroes = read('data/catalog/heroes.json') as { slug: string; display_name: string; classes: string[] }[];
const profiles = (read('data/game-data/kit-profiles.json').heroes ?? {}) as Record<string, KitProfile>;
const kit = read('data/game-data/kit-index.json').heroes as Record<string, { hardCount?: number; abilities: { heal?: boolean; shield?: boolean }[] }>;
const power = new Map<string, string>(((read('data/aggregates/classifications.json').heroes ?? []) as { hero: string; powerType?: string }[]).map((c) => [c.hero, c.powerType ?? '']));
const tags = new Map(heroes.map((h) => [h.slug, tagHero(h, profiles[h.slug])]));

function traits(team: string[]): EnemyTraits {
  const t: EnemyTraits = { tanks: 0, frontline: 0, magical: 0, physical: 0, healers: 0, hardCc: 0, divers: 0 };
  for (const h of team) {
    const g = tags.get(h);
    if (g) { if (g.cls === 'TANK') t.tanks++; if (g.frontline) t.frontline++; if (g.diver) t.divers++; }
    if (power.get(h) === 'magical') t.magical++; else if (power.get(h) === 'physical') t.physical++;
    if (kit[h]?.abilities.some((a) => a.heal)) t.healers++;
    t.hardCc += kit[h]?.hardCount ?? 0;
  }
  return t;
}

// What each hero's kit asks of an enemy build (kit facts: healing, shields, hard crowd control, class, damage type).
const heroNeeds = Object.fromEntries(heroes.map((h) => {
  const g = tags.get(h.slug)!, k = kit[h.slug], pw = power.get(h.slug);
  const hk: HeroKit = { name: h.display_name, power: pw === 'magical' || pw === 'physical' ? pw : null, cls: g.cls, heals: !!k?.abilities.some((a) => a.heal), shields: !!k?.abilities.some((a) => a.shield), hardCc: k?.hardCount ?? 0, diver: g.diver };
  return [h.slug, needsVs(hk)];
}));
const itemTags = tagItems(catalog as unknown as CatalogItem[]);
const ANSWERS: Answer[] = ['healing', 'tanks', 'shields', 'magic', 'physical', 'cc', 'burst'];
const answersIt = Object.fromEntries(ANSWERS.map((a) => [a, (slug: string) => !!itemTags[slug]?.answers.includes(a)])) as Record<Answer, (s: string) => boolean>;
const asks = (hero: string, a: Answer) => (heroNeeds[hero] ?? []).some((n) => n.answer === a);
// Answer timing (src/adjustments.ts), pooled over all heroes: by lane opponent's kit, and by enemy team shape.
const timingLane = new Map<Answer, TimingCells>(ANSWERS.map((a) => [a, new Map()]));
const timingComp = new Map<string, TimingCells>(COMP_LABELS.map((l) => [l.key, new Map()]));

const rows = readRows(patchDir(meta.patch));
let sides = 0, firstEnd = '', lastEnd = '';
const compGames: Record<string, number> = {};
/** Count every player-row. shuffle = pair each team with a random other match's enemy team (the null:
 *  builds and heroes stay real, only who they faced is scrambled). */
function count(shuffle: boolean): Map<string, HeroRoleCells> {
  const cells = new Map<string, HeroRoleCells>();
  let seed = 20261110;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (const r of rows) {
    if (!shuffle) { if (!firstEnd || r.end < firstEnd) firstEnd = r.end; if (r.end > lastEnd) lastEnd = r.end; }
    for (const t of [0, 1] as const) {
      const enemy = shuffle ? rows[Math.floor(rnd() * rows.length)]!.teams[rnd() < 0.5 ? 0 : 1]! : r.teams[1 - t]!;
      const labels = COMP_LABELS.filter((l) => l.test(traits(enemy.map((e) => e[0])))).map((l) => l.key);
      if (!shuffle) { sides++; for (const k of labels) compGames[k] = (compGames[k] ?? 0) + 1; }
      for (const s of r.teams[t]) {
        if (!s[3]) continue; // v1 rows carry no build
        const items = [...new Set(s[3].filter((x) => buildItem.has(x)))];
        const key = `${s[0]}|${s[1]}`;
        const hr = cells.get(key) ?? emptyHeroRole();
        cells.set(key, hr);
        const plat = s[2] != null && s[2] >= PLAT_TIER, won = r.win === t;
        countPlayer(hr.all, items, plat, won);
        if (!shuffle) {
          const opp = enemy.find((e) => e[1] === s[1]);
          if (opp) for (const a of ANSWERS) countTiming(timingLane.get(a)!, key, items, answersIt[a], asks(opp[0], a));
          for (const l of COMP_LABELS) countTiming(timingComp.get(l.key)!, key, items, answersIt[l.needs], labels.includes(l.key));
        }
        for (const e of enemy) {
          if (e[0] === s[0]) continue; // only under the shuffle: a hero never faces itself
          if (e[1] === s[1]) countPlayer((hr.lane[e[0]] ??= bandCell()), items, plat, won);
          countPlayer((hr.team[e[0]] ??= bandCell()), items, plat, won);
        }
        for (const k of labels) countPlayer((hr.comp[k] ??= bandCell()), items, plat, won);
      }
    }
  }
  return cells;
}
const cells = count(false);
if (process.argv.includes('--tune')) {
  // Bar tuning aid: real vs shuffled shown rows per scope and layer, over a grid of bars.
  const nul = count(true);
  const tally = (m: Map<string, HeroRoleCells>, b: typeof BARS) => {
    const t: Record<string, number> = {};
    for (const hr of m.values()) { if (hr.all.core.n < b.minN * 4) continue; const rd = readHeroRole(hr, b);
      for (const sc of ['lane', 'team', 'comp'] as const) for (const mm of Object.values(rd[sc])) for (const ly of ['core', 'late'] as const) t[`${sc}/${ly}`] = (t[`${sc}/${ly}`] ?? 0) + mm[ly].rises.length + mm[ly].drops.length; }
    return t;
  };
  for (const zMin of [3, 3.5, 4, 4.5]) for (const minPts of [4, 5, 6]) for (const minHas of [8, 12]) {
    const b = { ...BARS, zMin, minPts, minHas }, r = tally(cells, b), n = tally(nul, b);
    console.log(`z${zMin} pts${minPts} has${minHas}: ${Object.keys(r).map((k) => `${k} ${r[k]}/${n[k] ?? 0}`).join('  ')}`);
  }
  process.exit(0);
}
// The luck check: the same rules on scrambled matchups. Whatever they still "find" is noise.
const shownUnderShuffle = { core: 0, late: 0 };
for (const hr of count(true).values()) if (hr.all.core.n >= BARS.minN * 4) { const sh = readHeroRole(hr).shown; shownUnderShuffle.core += sh.core; shownUnderShuffle.late += sh.late; }

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.json')) unlinkSync(path.join(OUT, f));
const window = { patch: meta.patch, matches: rows.length, from: firstEnd, to: lastEnd };
const byHero = new Map<string, Record<string, HeroRoleRead>>();
const index: Record<string, Record<string, { players: number; latePlayers: number; shown: number }>> = {};
let tested = 0;
const shown = { core: 0, late: 0 };
for (const [key, hr] of cells) {
  const [hero, role] = key.split('|') as [string, string];
  if (hr.all.core.n < BARS.minN * 4) continue; // a lane this thin has no matchup with 30 players
  const rd = readHeroRole(hr);
  (byHero.get(hero) ?? byHero.set(hero, {}).get(hero)!)[role] = rd;
  (index[hero] ??= {})[role] = { players: rd.players.core, latePlayers: rd.players.late, shown: rd.shown.core + rd.shown.late };
  tested += rd.tested; shown.core += rd.shown.core; shown.late += rd.shown.late;
}
const note = 'Per hero-role: where the build changes by matchup. core = items 1-3 (players who finished 3+), late = items 4-6 (players who finished 4+, compared within the same number of finished items). lane[opp] = into that lane opponent, team[enemy] = with that hero anywhere on the other team, comp[key] = against that enemy team shape. record = every game and win in the matchup and outside it (raw); slots = the common buys at each purchase slot, among players who bought a k-th item. per100 / usual100 = players per 100 holding the item in the matchup / the same hero-role outside it; pos = typical purchase slot; platAgrees = Plat+ players lean the same way (null = too few). pool = every item the hero-role builds often enough to suggest. shownUnderShuffle = rows the same rules show when matchups are scrambled (the size of the list luck makes). What players do, not proof the change wins.';
for (const [hero, roles] of byHero) writeFileSync(path.join(OUT, `${hero}.json`), JSON.stringify({ hero, ...window, generatedAt: new Date().toISOString(), roles }));
writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), ...window,
  source: `ranked lineups in data/aggregates/team-comps/${meta.patch}/ (pred.gg public match stream, counted by npm run perks)`,
  note, bars: BARS, tested, shown, shownUnderShuffle,
  compLabels: COMP_LABELS.map((l) => ({ key: l.key, label: l.label, needs: l.needs, sharePct: Math.round((1000 * (compGames[l.key] ?? 0)) / sides) / 10 })),
  heroNeeds,
  // How to play into each hero when the build has nothing to say: the kit profile's counterplay line and
  // power curve (data/game-data/kit-profiles.json) and the hard crowd control to dodge (kit-index.json).
  heroTips: Object.fromEntries(heroes.map((h) => {
    const pf = profiles[h.slug] as (KitProfile & { playAgainst?: string; powerSpike?: string; scaling?: string }) | undefined;
    const cc = ((kit[h.slug]?.abilities ?? []) as { name: string; hard?: string[]; hardSec?: number | null }[]).filter((a) => a.hard?.length)
      .map((a) => ({ ability: a.name, types: a.hard!, sec: a.hardSec ?? null }));
    return [h.slug, { playAgainst: pf?.playAgainst ?? null, powerSpike: pf?.powerSpike ?? null, scaling: pf?.scaling ?? null, cc }];
  })),
  // Per slot 1-6: of 100 players buying a k-th item with no such answer yet, how many buy one there when the
  // enemy asks for it (needy100) and when it does not (other100), same hero-role, all heroes pooled.
  answerTiming: {
    lane: Object.fromEntries(ANSWERS.map((x) => [x, readTiming(timingLane.get(x)!)])),
    comp: Object.fromEntries(COMP_LABELS.map((l) => [l.key, readTiming(timingComp.get(l.key)!)])),
  },
  heroes: index,
}));
console.log(`adjustments: ${rows.length} ranked matches (${firstEnd.slice(0, 10)} to ${lastEnd.slice(0, 10)}), ${byHero.size} heroes, ${Object.values(index).reduce((t, r) => t + Object.keys(r).length, 0)} hero-roles`);
console.log(`  ${tested} item rates tested. Core (items 1-3): ${shown.core} shown, ${shownUnderShuffle.core} under shuffled matchups. Late (items 4-6): ${shown.late} shown, ${shownUnderShuffle.late} under the shuffle.`);
for (const l of COMP_LABELS) console.log(`  answer timing vs ${l.key}: ${readTiming(timingComp.get(l.key)!).map((r) => `item ${r.slot} ${r.needy100} vs ${r.other100}`).join(' | ')}`);
console.log(`  enemy shapes (share of team-sides): ${COMP_LABELS.map((l) => `${l.key} ${Math.round((1000 * (compGames[l.key] ?? 0)) / sides) / 10}%`).join(', ')}`);

const want = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (want && byHero.has(want)) {
  const nm = new Map(catalog.map((i) => [i.slug, i.display_name]));
  for (const [role, rd] of Object.entries(byHero.get(want)!)) {
    console.log(`\n${want} ${role}: ${rd.players.core} with a core, ${rd.players.late} past it; pool ${rd.pool.length}; usually after the core: ${rd.usualLate.slice(0, 6).map((u) => `${nm.get(u.item)} ${u.per100}%`).join(', ')}`);
    for (const sc of ['lane', 'team', 'comp'] as const) for (const [k, m] of Object.entries(rd[sc])) for (const ly of ['core', 'late'] as const) {
      const f = (x: { item: string; per100: number; usual100: number; pos: number | null; platAgrees: boolean | null }) => `${nm.get(x.item)} ${x.per100} (usually ${x.usual100}${x.pos ? `, slot ${x.pos}` : ''}${x.platAgrees ? ', Plat+ agree' : ''})`;
      if (m[ly].rises.length || m[ly].drops.length) console.log(`  ${sc} ${k} [${ly}, ${m[ly].n}]  + ${m[ly].rises.map(f).join('; ') || '-'}  |  - ${m[ly].drops.map(f).join('; ') || '-'}`);
    }
  }
}

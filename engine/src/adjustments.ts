// Matchup build adjustments (pure): where a hero-role's build CHANGES by matchup,
// counted from the patch's ranked lineups (full purchase order per player,
// data/aggregates/team-comps/<patch>/, team-comps/v2+). Evidence of what players
// do, never a generator input and never a claim that the change wins.
//
// Two layers per player, by purchase order of completed Epic passive items:
//   core  items 1-3 (players who finished 3+): does the opening change?
//   late  items 4-6 (players who finished 4+): where the build adapts after the core
// and three matchup scopes: lane[opp] (lane opponent), team[enemy] (that hero
// anywhere on the other team), comp[label] (the enemy team's shape, COMP_LABELS).
//
// A row is the share of matchup players holding the item against the SAME
// hero-role's players outside the matchup. The late layer is stratified by how
// many items the player finished (4, 5, 6+): a longer game finishes more items,
// so an unstratified share would read "long games" as "matchup". Shifts are
// judged like matchup-builds.ts: z = (observed - expected) / sd, plus a floor on
// real points and players, and every hero-role reports how many rows luck alone
// would put past the bar.
import type { Answer } from './item-tags.js';

export const CORE_DEPTH = 3, LATE_MAX = 6;
/** an item is in a hero-role's pool at 2% of its core or late builds and 15+ players */
export const POOL_MIN_PCT = 2, POOL_MIN_GAMES = 15;
/** n players; i = players holding the item in this layer; ps = sum of its 1-based purchase position */
export interface Layer { n: number; i: Record<string, number>; ps: Record<string, number> }
export interface Cell { core: Layer; late: Record<string, Layer> }
export interface BandCell extends Cell { plat: Cell }
export interface HeroRoleCells { all: BandCell; lane: Record<string, BandCell>; team: Record<string, BandCell>; comp: Record<string, BandCell> }

const layer = (): Layer => ({ n: 0, i: {}, ps: {} });
const cell = (): Cell => ({ core: layer(), late: {} });
export const bandCell = (): BandCell => ({ ...cell(), plat: cell() });
export const emptyHeroRole = (): HeroRoleCells => ({ all: bandCell(), lane: {}, team: {}, comp: {} });

function add(c: Cell, items: string[]) {
  if (items.length < CORE_DEPTH) return;
  c.core.n++;
  items.slice(0, CORE_DEPTH).forEach((s, k) => { c.core.i[s] = (c.core.i[s] ?? 0) + 1; c.core.ps[s] = (c.core.ps[s] ?? 0) + k + 1; });
  if (items.length <= CORE_DEPTH) return;
  const d = Math.min(items.length, LATE_MAX);
  const l = (c.late[d] ??= layer());
  l.n++;
  for (let k = CORE_DEPTH; k < d; k++) { const s = items[k]!; l.i[s] = (l.i[s] ?? 0) + 1; l.ps[s] = (l.ps[s] ?? 0) + k + 1; }
}
/** Count one player (their distinct completed items in purchase order) into a cell. */
export function countPlayer(c: BandCell, items: string[], plat: boolean) { add(c, items); if (plat) add(c.plat, items); }

export interface Shift { item: string; n: number; has: number; per100: number; usual100: number; z: number; pos: number | null }
/** Strata of (everyone, matchup) layers -> per item observed vs the rest of the hero-role. */
export function shifts(strata: [all: Layer | undefined, cell: Layer | undefined][], minN: number, minItem: number): Shift[] {
  const use = strata.filter((s): s is [Layer, Layer] => !!s[0] && !!s[1] && s[1].n > 0 && s[0].n - s[1].n > 0);
  const n = use.reduce((t, [, c]) => t + c.n, 0), base = use.reduce((t, [a, c]) => t + a.n - c.n, 0);
  if (n < minN || base < minN) return [];
  const items = new Map<string, number>();
  for (const [a] of use) for (const [s, v] of Object.entries(a.i)) items.set(s, (items.get(s) ?? 0) + v);
  const out: Shift[] = [];
  for (const [item, total] of items) {
    if (total < minItem) continue;
    let has = 0, exp = 0, v = 0, ps = 0;
    for (const [a, c] of use) {
      const h = c.i[item] ?? 0, b = a.n - c.n, u = ((a.i[item] ?? 0) - h) / b;
      has += h; ps += c.ps[item] ?? 0; exp += c.n * u; v += c.n * u * (1 - u) * (1 + c.n / b);
    }
    if (v === 0) continue;
    out.push({ item, n, has, per100: (has / n) * 100, usual100: (exp / n) * 100, z: (has - exp) / Math.sqrt(v), pos: has ? ps / has : null });
  }
  return out;
}
export const coreStrata = (all: Cell, c: Cell): [Layer, Layer][] => [[all.core, c.core]];
export const lateStrata = (all: Cell, c: Cell): [Layer | undefined, Layer | undefined][] => Object.keys(all.late).map((d) => [all.late[d], c.late[d]]);
export const lateN = (c: Cell) => Object.values(c.late).reduce((t, l) => t + l.n, 0);

export interface Row { item: string; per100: number; usual100: number; pos: number | null; has: number; platAgrees: boolean | null }
export interface LayerRead { n: number; rises: Row[]; drops: Row[] }
export interface MatchupRead { core: LayerRead; late: LayerRead }
export interface Bars { minN: number; minItem: number; zMin: number; minPts: number; minHas: number; platMinN: number; lateZMin: number; lateMinPts: number }
// Set against the shuffled-matchup null (npm run adjustments -- --tune, 29k matches, 2026-11-10): at
// these bars the core list is 5% (lane), 13% (team) and 9% (enemy shape) the size luck makes. The late
// layer needs a higher bar and still finds almost nothing: after the core, builds barely follow the matchup.
export const BARS: Bars = { minN: 30, minItem: 10, zMin: 3.5, minPts: 4, minHas: 12, platMinN: 20, lateZMin: 4, lateMinPts: 5 };

/** One matchup cell against the hero-role: shown rises and drops per layer, and how many rates were tested. */
export function readMatchup(all: BandCell, c: BandCell, b: Bars = BARS): { read: MatchupRead; tested: number } {
  let tested = 0;
  const one = (strataOf: (a: Cell, x: Cell) => [Layer | undefined, Layer | undefined][], n: number, zMin: number, minPts: number): LayerRead => {
    const rows = shifts(strataOf(all, c), b.minN, b.minItem);
    tested += rows.length;
    // Plat+ never decides a row (too thin, fork doc 14b); it only says whether those players lean the same way.
    const plat = new Map(shifts(strataOf(all.plat, c.plat), b.platMinN, 1).map((s) => [s.item, s]));
    const shown = (r: Shift) => Math.abs(r.z) >= zMin && Math.abs(r.per100 - r.usual100) >= minPts && Math.max(r.has, (r.usual100 / 100) * r.n) >= b.minHas;
    const row = (r: Shift): Row => {
      const p = plat.get(r.item), up = r.per100 > r.usual100;
      return { item: r.item, per100: Math.round(r.per100), usual100: Math.round(r.usual100), pos: r.pos == null ? null : Math.round(r.pos * 10) / 10, has: r.has,
        platAgrees: p ? (p.per100 > p.usual100) === up : null };
    };
    const ok = rows.filter(shown);
    return {
      n,
      rises: ok.filter((r) => r.z > 0).sort((x, y) => y.per100 - y.usual100 - (x.per100 - x.usual100)).map(row),
      drops: ok.filter((r) => r.z < 0).sort((x, y) => x.per100 - x.usual100 - (y.per100 - y.usual100)).map(row),
    };
  };
  return { read: { core: one(coreStrata, c.core.n, b.zMin, b.minPts), late: one(lateStrata, lateN(c), b.lateZMin, b.lateMinPts) }, tested };
}

export interface ScopeRead { [key: string]: MatchupRead }
export interface HeroRoleRead {
  players: { core: number; late: number };
  /** what this hero-role usually finishes after the core: share of 4+ item players, typical slot */
  usualLate: { item: string; per100: number; pos: number }[];
  /** every item this hero-role builds often enough to suggest: share in the core, share after it, typical slot */
  pool: { item: string; core100: number; late100: number; pos: number }[];
  tested: number; shown: { core: number; late: number };
  lane: ScopeRead; team: ScopeRead; comp: ScopeRead;
}
/** Every matchup of one hero-role. A matchup with enough players but no shown row is kept (empty): "no change" is an answer. */
export function readHeroRole(hr: HeroRoleCells, b: Bars = BARS): HeroRoleRead {
  let tested = 0;
  const shown = { core: 0, late: 0 };
  const scope = (cells: Record<string, BandCell>): ScopeRead => {
    const out: ScopeRead = {};
    for (const [k, c] of Object.entries(cells)) {
      if (c.core.n < b.minN) continue;
      const r = readMatchup(hr.all, c, b);
      tested += r.tested; shown.core += r.read.core.rises.length + r.read.core.drops.length; shown.late += r.read.late.rises.length + r.read.late.drops.length;
      out[k] = r.read;
    }
    return out;
  };
  const lane = scope(hr.lane), team = scope(hr.team), comp = scope(hr.comp);
  const ln = lateN(hr.all), agg = new Map<string, { has: number; ps: number }>();
  for (const l of Object.values(hr.all.late)) for (const [s, v] of Object.entries(l.i)) { const a = agg.get(s) ?? { has: 0, ps: 0 }; a.has += v; a.ps += l.ps[s] ?? 0; agg.set(s, a); }
  const usualLate = ln ? [...agg].map(([item, a]) => ({ item, per100: Math.round((a.has / ln) * 100), pos: Math.round((a.ps / a.has) * 10) / 10 })).filter((x) => x.per100 >= 5).sort((x, y) => y.per100 - x.per100).slice(0, 10) : [];
  const pool = [...new Set([...Object.keys(hr.all.core.i), ...agg.keys()])].map((item) => {
    const c = hr.all.core.i[item] ?? 0, l = agg.get(item)?.has ?? 0;
    return { item, core100: Math.round((c / Math.max(1, hr.all.core.n)) * 100), late100: ln ? Math.round((l / ln) * 100) : 0, pos: Math.round((((hr.all.core.ps[item] ?? 0) + (agg.get(item)?.ps ?? 0)) / Math.max(1, c + l)) * 10) / 10, k: c + l };
  }).filter((x) => x.k >= POOL_MIN_GAMES && (x.core100 >= POOL_MIN_PCT || x.late100 >= POOL_MIN_PCT)).sort((x, y) => y.k - x.k).map(({ k: _k, ...x }) => x);
  return { players: { core: hr.all.core.n, late: ln }, usualLate, pool, tested, shown, lane, team, comp };
}

// Enemy-team shapes a player can see on the loading screen. Each is a count over
// the five enemy heroes from committed hero data (team-comp.ts classes, the kit
// index's hard crowd control and self-healing, each hero's damage type). `needs`
// is the item answer (item-tags.ts) that shape asks for.
export interface EnemyTraits { tanks: number; frontline: number; magical: number; physical: number; healers: number; hardCc: number; divers: number }
export const COMP_LABELS: { key: string; label: string; needs: Answer; test: (t: EnemyTraits) => boolean }[] = [
  { key: 'tanks', label: 'Two or more tanks', needs: 'tanks', test: (t) => t.tanks >= 2 },
  { key: 'frontline', label: 'Three or more frontliners', needs: 'tanks', test: (t) => t.frontline >= 3 },
  { key: 'magic', label: 'Mostly magic damage', needs: 'magic', test: (t) => t.magical >= 3 },
  { key: 'physical', label: 'Mostly physical damage', needs: 'physical', test: (t) => t.physical >= 4 },
  { key: 'healing', label: 'Three or more healing kits', needs: 'healing', test: (t) => t.healers >= 3 },
  { key: 'cc', label: 'Heavy crowd control', needs: 'cc', test: (t) => t.hardCc >= CC_HEAVY },
  { key: 'dive', label: 'Three or more divers', needs: 'burst', test: (t) => t.divers >= 3 },
];
export const CC_HEAVY = 10;

/** What one enemy hero's kit asks of your build, strongest reason first (kit facts only, no win claim). */
export interface HeroKit { name: string; power: 'physical' | 'magical' | null; cls: string; heals: boolean; shields: boolean; hardCc: number; diver: boolean }
export interface Need { answer: Answer; why: string }
export function needsVs(h: HeroKit): Need[] {
  const out: Need[] = [];
  if (h.heals) out.push({ answer: 'healing', why: `${h.name} heals from the kit` });
  if (h.hardCc >= 2) out.push({ answer: 'cc', why: `${h.name} has ${h.hardCc} hard crowd-control abilities` });
  if (h.cls === 'TANK') out.push({ answer: 'tanks', why: `${h.name} is a tank` });
  if (h.shields) out.push({ answer: 'shields', why: `${h.name} shields from the kit` });
  if (h.power) out.push({ answer: h.power === 'magical' ? 'magic' : 'physical', why: `${h.name} deals ${h.power} damage` });
  if (h.cls === 'ASSASSIN' || h.diver) out.push({ answer: 'burst', why: `${h.name} dives and bursts` });
  return out;
}

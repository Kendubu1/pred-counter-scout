// Top builds by job (pure): which hero + Eternal leads a lane at ONE job and still wins. The tank
// board (src/tank-builds.ts) generalised to healing, shielding and damage, one rule for all:
//
//   a group    one hero in one lane on one Eternal, with the rank band's minimum ranked games of
//              ten minutes or more (BANDS in tank-builds.ts)
//   winning    win rate pulled WIN_K games toward 50% must be WIN_MIN or better (tank-builds.ts)
//   ranked by  the board's own stat, summed over the group's games:
//                tank       (damage mitigated + hero damage taken) / deaths
//                healing    healing done per minute (includes healing yourself)
//                shielding  shields RECEIVED by the four teammates per minute: the match data has
//                           no "shields given", so this is the shielding a team with this support got
//                magic      magical damage to heroes per minute
//                carry      damage to heroes per minute, carry lane
// Each board section also compares every Eternal against the same hero on every other Eternal
// (win-rate gap with its margin, and the change in the board's stat), over the heroes that are
// actually good at the job (eligibleX times the section average). The augment, crest and items
// shown with a row are what that group's players run most: a description, not ranked picks.
import { WIN_K, WIN_MIN, type BandRule } from './tank-builds.js';

export interface OutAgg { n: number; w: number; min: number; mit: number; takenH: number; deaths: number; dmg: number; mag: number; heal: number; teamShield: number }
export const outAgg = (): OutAgg => ({ n: 0, w: 0, min: 0, mit: 0, takenH: 0, deaths: 0, dmg: 0, mag: 0, heal: 0, teamShield: 0 });
export interface OutGame { mitigated: number; takenFromHeroes: number; deaths: number; damage: number; magic: number; healing: number; teamShield: number; durSec: number; won: boolean }
export function addOut(a: OutAgg, g: OutGame) {
  a.n++; if (g.won) a.w++; a.min += g.durSec / 60; a.mit += g.mitigated; a.takenH += g.takenFromHeroes; a.deaths += g.deaths;
  a.dmg += g.damage; a.mag += g.magic; a.heal += g.healing; a.teamShield += g.teamShield;
}
export const minus = (a: OutAgg, b: OutAgg): OutAgg => ({ n: a.n - b.n, w: a.w - b.w, min: a.min - b.min, mit: a.mit - b.mit, takenH: a.takenH - b.takenH, deaths: a.deaths - b.deaths, dmg: a.dmg - b.dmg, mag: a.mag - b.mag, heal: a.heal - b.heal, teamShield: a.teamShield - b.teamShield });

export const ALL_LANES = ['carry', 'midlane', 'offlane', 'jungle', 'support'] as const;
export interface BoardDef {
  key: string; label: string; title: string; unit: string; blurb: string;
  sections: { key: string; label: string; lanes: readonly string[] }[];
  value: (a: OutAgg) => number;
  /** heroes count for the Eternal comparison when their own value is this many times the section average */
  eligibleX: number; rows: number;
}
const perMin = (f: (a: OutAgg) => number) => (a: OutAgg) => (a.min ? f(a) / a.min : 0);
export const BOARDS: BoardDef[] = [
  { key: 'tank', label: 'Tankiest', title: 'Hardest to kill', unit: 'soaked per death', blurb: 'Damage mitigated plus damage taken from heroes, per death: how much the enemy spends to kill you once.',
    sections: [{ key: 'offlane', label: 'Offlane', lanes: ['offlane'] }, { key: 'jungle', label: 'Jungle', lanes: ['jungle'] }, { key: 'support', label: 'Support', lanes: ['support'] }],
    value: (a) => (a.mit + a.takenH) / Math.max(1, a.deaths), eligibleX: 1.2, rows: 8 },
  { key: 'healing', label: 'Healing', title: 'Most healing', unit: 'healing per min', blurb: 'Healing done per minute as a support. It includes healing yourself.',
    sections: [{ key: 'support', label: 'Support', lanes: ['support'] }], value: perMin((a) => a.heal), eligibleX: 1.2, rows: 8 },
  { key: 'shielding', label: 'Shielding', title: 'Most shielding', unit: 'team shields per min', blurb: 'Shields the four teammates received per minute with this support. The match data records shields received, not who gave them.',
    sections: [{ key: 'support', label: 'Support', lanes: ['support'] }], value: perMin((a) => a.teamShield), eligibleX: 1.0, rows: 8 },
  { key: 'magic', label: 'Magic damage', title: 'Most magic damage', unit: 'magic damage per min', blurb: 'Magical damage dealt to heroes per minute, in any lane.',
    sections: [{ key: 'all', label: 'Any lane', lanes: ALL_LANES }], value: perMin((a) => a.mag), eligibleX: 1.2, rows: 10 },
  { key: 'carry', label: 'Carry damage', title: 'Most damage as a carry', unit: 'damage per min', blurb: 'Damage dealt to heroes per minute in the carry lane.',
    sections: [{ key: 'carry', label: 'Carry', lanes: ['carry'] }], value: perMin((a) => a.dmg), eligibleX: 0.95, rows: 8 },
];

export const winning = (a: OutAgg, minGames: number) => a.n >= minGames && (a.w + WIN_K * 0.5) / (a.n + WIN_K) >= WIN_MIN;
/** A board section: qualifying groups, highest value first, ONE ROW PER HERO-LANE (its best qualifying
 *  Eternal), so a board is a list of heroes and not one hero on five Eternals. The same hero's other
 *  qualifying Eternals ride along as `alts`. */
export function rankBoard<T extends { hero: string; lane: string; agg: OutAgg }>(groups: T[], def: BoardDef, minGames: number): { lead: T; alts: T[] }[] {
  const ok = groups.filter((g) => winning(g.agg, minGames) && def.value(g.agg) > 0).sort((x, y) => def.value(y.agg) - def.value(x.agg));
  const out: { lead: T; alts: T[] }[] = [], at = new Map<string, { lead: T; alts: T[] }>();
  for (const g of ok) {
    const k = `${g.hero}|${g.lane}`, row = at.get(k);
    if (row) { if (row.alts.length < 3) row.alts.push(g); continue; }
    const r = { lead: g, alts: [] as T[] };
    at.set(k, r); out.push(r);
  }
  return out.slice(0, def.rows);
}

export interface EternalRead { eternal: string; games: number; heroes: number; winDelta: number; margin: number; valuePct: number; deathsPct: number; verdict: 'wins more' | 'wins less' | 'no clear change' }
/** Each Eternal against the same hero-lane on every other Eternal, pooled over the section's eligible
 *  hero-lanes. winDelta = inverse-variance weighted win-rate gap in points, margin = its 95% margin;
 *  valuePct = game-weighted change in the board's stat. A verdict only when the margin clears zero. */
export function eternalReads(heroLanes: Map<string, OutAgg>, byEternal: Map<string, Map<string, OutAgg>>, sectionAvg: number, def: BoardDef, band: BandRule): EternalRead[] {
  const acc = new Map<string, { n: number; heroes: number; d: number; w: number; val: number; deaths: number }>();
  for (const [hl, all] of heroLanes) {
    if (all.n < band.tankMin || def.value(all) < def.eligibleX * sectionAvg) continue;
    for (const [et, a] of byEternal.get(hl) ?? []) {
      const o = minus(all, a);
      if (a.n < band.etMin || o.n < band.othersMin || def.value(o) <= 0 || !o.deaths) continue;
      const v = 0.25 / a.n + 0.25 / o.n, e = acc.get(et) ?? { n: 0, heroes: 0, d: 0, w: 0, val: 0, deaths: 0 };
      e.n += a.n; e.heroes++; e.d += (a.w / a.n - o.w / o.n) / v; e.w += 1 / v;
      e.val += a.n * (def.value(a) / def.value(o) - 1); e.deaths += a.n * (a.deaths / a.min / (o.deaths / o.min) - 1);
      acc.set(et, e);
    }
  }
  return [...acc].filter(([, e]) => e.n >= band.etShow).map(([eternal, e]) => {
    const winDelta = Math.round((1000 * e.d) / e.w) / 10, margin = Math.round(1960 * Math.sqrt(1 / e.w)) / 10;
    return { eternal, games: e.n, heroes: e.heroes, winDelta, margin, valuePct: Math.round((100 * e.val) / e.n), deathsPct: Math.round((100 * e.deaths) / e.n),
      verdict: (winDelta - margin > 0 ? 'wins more' : winDelta + margin < 0 ? 'wins less' : 'no clear change') as EternalRead['verdict'] };
  }).sort((x, y) => y.winDelta - x.winDelta);
}

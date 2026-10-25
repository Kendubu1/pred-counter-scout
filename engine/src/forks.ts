// Fork in the Road (docs/fork-in-the-road.md): observed value of the item a
// player picks at slot k, in a context (who they are countering), adjusted for
// the game state at the moment the choice is made.
//
// Pure functions over compact match rows (see ingest/fork-poc-pull.ts). No
// I/O here so the harness can test the math on fixtures.
//
// Method (PoC):
//   fork      = (hero, role, slot k, context); options = item bought at slot k,
//               among players who reached slot k. Options are compared to each
//               other, never to "didn't buy it".
//   decision  = completion time of slot k-1 (slot 1: minute 4, before any core).
//   strata    = team gold diff quintile x lane gold diff tercile at decision
//               time. Cut points are quantiles of THIS data, per slot.
//   adjusted  = each option's win rate standardized to the cell's stratum mix
//               (option-stratum rates smoothed toward the cell-stratum rate),
//               so an item gets no credit for being bought by players already
//               ahead. delta = adjusted option rate - cell rate.
//   shrinkage = normal-normal empirical Bayes toward the same option's delta
//               one context level down (opponent -> opponent type -> all -> 0);
//               prior variance estimated from the deltas themselves.
//   swing     = (kills - deaths) in SWING_S after the item completes minus the
//               same window before it, standardized the same way. The phase-2
//               "K/D after the spike" signal from the design doc.

export interface ForkPlayer {
  pid: string; team: number; hero: string; role: string;
  gold: number[]; cores: [string, number][];
  kills: number[]; deaths: number[];
  dmg: [number, number, number]; heal: number;
}
export interface ForkMatch { id: string; version: string; dur: number; winner: number; players: ForkPlayer[] }

export type NW = { n: number; w: number };

export const SLOT1_DECISION_S = 240;
export const SWING_S = 300;
/** Smoothing of an option's per-stratum rate toward the cell's stratum rate. */
export const STRATUM_K = 10;
/** 80% two-sided normal interval. */
export const Z80 = 1.2816;

/** Cumulative gold at game time t. Index = minute + 3 (three pre-game entries; probed 2026-10-25). */
export function goldAt(p: { gold: number[] }, t: number): number {
  if (!p.gold.length) return 0;
  const i = Math.min(p.gold.length - 1, Math.max(0, Math.floor(t / 60) + 3));
  return p.gold[i]!;
}

export function countIn(times: number[], from: number, to: number): number {
  let c = 0;
  for (const t of times) if (t >= from && t < to) c++;
  return c;
}

/** Quantile cut points (k-1 of them) splitting xs into k equal-count groups. */
export function quantileCuts(xs: number[], k: number): number[] {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return [];
  const cuts: number[] = [];
  for (let i = 1; i < k; i++) cuts.push(s[Math.min(s.length - 1, Math.floor((i * s.length) / k))]!);
  return cuts;
}
export const bucketOf = (x: number, cuts: number[]) => { let b = 0; while (b < cuts.length && x >= cuts[b]!) b++; return b; };

// ── enemy labels, learned from what heroes actually dealt in THIS data ──

export type DamageType = 'magical' | 'physical' | 'mixed';
export interface Labels {
  /** hero|role -> share of hero damage that is magical (of physical+magical) */
  magicShare: Map<string, number>;
  type: Map<string, DamageType>;
  /** cut points of enemy-team healing per minute (terciles) */
  healCuts: number[];
}
/** Magical share >= 0.6 reads magical, <= 0.4 physical, else mixed. */
export const TYPE_CUT = 0.6;

export function learnLabels(matches: ForkMatch[]): Labels {
  const acc = new Map<string, { p: number; m: number }>();
  const teamHeal: number[] = [];
  for (const m of matches) {
    const mins = Math.max(1, m.dur / 60);
    for (const team of [0, 1]) teamHeal.push(m.players.filter((p) => p.team === team).reduce((s, p) => s + p.heal, 0) / mins);
    for (const p of m.players) {
      const a = acc.get(`${p.hero}|${p.role}`) ?? { p: 0, m: 0 };
      a.p += p.dmg[0]; a.m += p.dmg[1];
      acc.set(`${p.hero}|${p.role}`, a);
    }
  }
  const magicShare = new Map<string, number>(), type = new Map<string, DamageType>();
  for (const [k, a] of acc) {
    const share = a.p + a.m > 0 ? a.m / (a.p + a.m) : 0.5;
    magicShare.set(k, share);
    type.set(k, share >= TYPE_CUT ? 'magical' : share <= 1 - TYPE_CUT ? 'physical' : 'mixed');
  }
  return { magicShare, type, healCuts: quantileCuts(teamHeal, 3) };
}

// ── rows: one per (player, slot) that reached the slot ──

export interface ForkRow {
  /** match id + player id: links one player's rows across slots */
  key: string;
  hero: string; role: string; slot: number; item: string; won: boolean;
  /** stratum id (team-gold quintile * 3 + lane-gold tercile) */
  stratum: number;
  /** context keys this row belongs to, e.g. "all", "oppType:magical", "opp:gideon", "enemyHeal:high" */
  ctx: string[];
  /** (K-D) after completion minus before; null when the window runs past the game */
  swing: number | null;
  /** raw state, kept for the order fork and diagnostics */
  teamDiff: number; laneDiff: number;
}

export function buildRows(matches: ForkMatch[], labels: Labels, maxSlot = 3): ForkRow[] {
  type Pre = Omit<ForkRow, 'stratum'>;
  const pre: Pre[] = [];
  for (const m of matches) {
    const mins = Math.max(1, m.dur / 60);
    const healOf = (team: number) => m.players.filter((p) => p.team === team).reduce((s, p) => s + p.heal, 0) / mins;
    for (const p of m.players) {
      const opp = m.players.filter((o) => o.team !== p.team && o.role === p.role);
      if (opp.length !== 1) continue;
      const o = opp[0]!;
      const allies = m.players.filter((x) => x.team === p.team), enemies = m.players.filter((x) => x.team !== p.team);
      const oppType = labels.type.get(`${o.hero}|${o.role}`) ?? 'mixed';
      const heal = healOf(o.team);
      const enemyHeal = bucketOf(heal, labels.healCuts) === 2 ? 'high' : bucketOf(heal, labels.healCuts) === 0 ? 'low' : 'mid';
      const ctx = ['all', `oppType:${oppType}`, `opp:${o.hero}`, `enemyHeal:${enemyHeal}`];
      for (let k = 1; k <= Math.min(maxSlot, p.cores.length); k++) {
        const [item, done] = p.cores[k - 1]!;
        const tDec = k === 1 ? SLOT1_DECISION_S : p.cores[k - 2]![1];
        const teamDiff = allies.reduce((s, x) => s + goldAt(x, tDec), 0) - enemies.reduce((s, x) => s + goldAt(x, tDec), 0);
        const laneDiff = goldAt(p, tDec) - goldAt(o, tDec);
        const swing = done + SWING_S <= m.dur && done - SWING_S >= 0
          ? (countIn(p.kills, done, done + SWING_S) - countIn(p.deaths, done, done + SWING_S))
            - (countIn(p.kills, done - SWING_S, done) - countIn(p.deaths, done - SWING_S, done))
          : null;
        pre.push({ key: `${m.id}|${p.pid}`, hero: p.hero, role: p.role, slot: k, item, won: p.team === m.winner, ctx, swing, teamDiff, laneDiff });
      }
    }
  }
  // strata cut points per slot (state scale grows with time, so cut per slot)
  const cuts = new Map<number, { team: number[]; lane: number[] }>();
  for (let k = 1; k <= maxSlot; k++) {
    const s = pre.filter((r) => r.slot === k);
    cuts.set(k, { team: quantileCuts(s.map((r) => r.teamDiff), 5), lane: quantileCuts(s.map((r) => r.laneDiff), 3) });
  }
  return pre.map((r) => {
    const c = cuts.get(r.slot)!;
    return { ...r, stratum: bucketOf(r.teamDiff, c.team) * 3 + bucketOf(r.laneDiff, c.lane) };
  });
}

// ── standardization ──

/** Win rate of `rs` standardized to the cell's stratum mix; per-stratum rates smoothed toward the cell's. */
function stdRate(rs: ForkRow[], strata: Map<number, NW>, n: number): { p: number; v: number } {
  const per = new Map<number, NW>();
  for (const r of rs) { const s = per.get(r.stratum) ?? { n: 0, w: 0 }; s.n++; if (r.won) s.w++; per.set(r.stratum, s); }
  let p = 0, v = 0;
  for (const [sid, cs] of strata) {
    const ws = cs.n / n, pc = cs.w / cs.n, o = per.get(sid) ?? { n: 0, w: 0 };
    const ps = (o.w + STRATUM_K * pc) / (o.n + STRATUM_K);
    p += ws * ps;
    // variance of the smoothed rate: the prior part is shared with the comparison side, so only the data part counts
    v += ws * ws * o.n * (ps * (1 - ps)) / (o.n + STRATUM_K) ** 2;
  }
  return { p, v };
}

export interface OptionStat {
  item: string; n: number; w: number; share: number;
  /** raw win rate minus the cell's raw win rate */
  naive: number;
  /** state-adjusted delta (standardized to the cell's stratum mix) */
  adjusted: number; se: number;
  /** adjusted delta after shrinkage toward the parent context */
  shrunk: number; shrunkSe: number; lo: number; hi: number;
  confidence: 'strong' | 'likely' | 'noise';
  /** standardized mean fight swing minus the cell's; null if too few windows */
  swing: number | null; swingN: number;
  /** share of this option's rows bought from the bottom two team-gold quintiles */
  fromBehind: number;
}
export interface ForkCell { hero: string; role: string; slot: number; ctx: string; n: number; w: number; options: OptionStat[] }

export function standardize(rows: ForkRow[], minOption: number): ForkCell['options'] {
  const n = rows.length;
  if (!n) return [];
  const cellRate = rows.filter((r) => r.won).length / n;
  const strata = new Map<number, NW>();
  for (const r of rows) { const s = strata.get(r.stratum) ?? { n: 0, w: 0 }; s.n++; if (r.won) s.w++; strata.set(r.stratum, s); }
  const swingRows = rows.filter((r) => r.swing != null);
  const cellSwing = swingRows.length ? swingRows.reduce((s, r) => s + r.swing!, 0) / swingRows.length : 0;
  const swingByStratum = new Map<number, { n: number; sum: number }>();
  for (const r of swingRows) { const s = swingByStratum.get(r.stratum) ?? { n: 0, sum: 0 }; s.n++; s.sum += r.swing!; swingByStratum.set(r.stratum, s); }

  const byItem = new Map<string, ForkRow[]>();
  for (const r of rows) (byItem.get(r.item) ?? byItem.set(r.item, []).get(r.item)!).push(r);
  const out: OptionStat[] = [];
  for (const [item, rs] of byItem) {
    if (rs.length < minOption) continue;
    // The option vs the REST of the cell, both standardized to the cell's
    // stratum mix. delta vs the cell = (1 - share) * (option - rest); its
    // variance counts both sides (the cell average contains the option, so
    // comparing to it directly would overstate the noise).
    const share = rs.length / n;
    const opt = stdRate(rs, strata, n), rest = stdRate(rows.filter((r) => r.item !== item), strata, n);
    const adjDelta = (1 - share) * (opt.p - rest.p);
    const seDelta = (1 - share) * Math.sqrt(opt.v + rest.v);
    // swing, standardized the same way (stratum means smoothed toward the cell's)
    const sw = rs.filter((r) => r.swing != null);
    let swing: number | null = null;
    if (sw.length >= minOption / 2 && swingRows.length) {
      const perS = new Map<number, { n: number; sum: number }>();
      for (const r of sw) { const s = perS.get(r.stratum) ?? { n: 0, sum: 0 }; s.n++; s.sum += r.swing!; perS.set(r.stratum, s); }
      let acc = 0;
      for (const [sid, cs] of swingByStratum) {
        const ws = cs.n / swingRows.length, mc = cs.sum / cs.n;
        const o = perS.get(sid) ?? { n: 0, sum: 0 };
        acc += ws * (o.sum + STRATUM_K * mc) / (o.n + STRATUM_K);
      }
      swing = acc - cellSwing;
    }
    const w = rs.filter((r) => r.won).length;
    out.push({
      item, n: rs.length, w, share,
      naive: w / rs.length - cellRate,
      adjusted: adjDelta, se: seDelta,
      shrunk: adjDelta, shrunkSe: seDelta, lo: 0, hi: 0, confidence: 'noise',
      swing, swingN: sw.length,
      fromBehind: rs.filter((r) => r.stratum < 6).length / rs.length,
    });
  }
  return out.sort((a, b) => b.n - a.n);
}

/** Prior variance of true deltas: observed variance minus mean sampling variance (method of moments). */
export function priorVariance(stats: { adjusted: number; se: number }[]): number {
  if (stats.length < 5) return 0.03 ** 2;
  const mean = stats.reduce((s, x) => s + x.adjusted, 0) / stats.length;
  const v = stats.reduce((s, x) => s + (x.adjusted - mean) ** 2, 0) / stats.length;
  const noise = stats.reduce((s, x) => s + x.se ** 2, 0) / stats.length;
  return Math.max(v - noise, 1e-5);
}

export function shrinkToward(o: { adjusted: number; se: number }, prior: number, tau2: number) {
  const prec = 1 / (o.se ** 2) + 1 / tau2;
  const mean = (o.adjusted / (o.se ** 2) + prior / tau2) / prec;
  return { mean, se: Math.sqrt(1 / prec) };
}

export function confidenceOf(lo: number, hi: number, mean: number): OptionStat['confidence'] {
  if (lo > 0 || hi < 0) return Math.abs(mean) >= 0.02 ? 'strong' : 'likely';
  return 'noise';
}

/** Parent context for shrinkage: opp:<hero> -> oppType:<its type>; anything else -> all; all -> 0. */
export function parentCtx(ctx: string, row: ForkRow): string | null {
  if (ctx === 'all') return null;
  if (ctx.startsWith('opp:')) return row.ctx.find((c) => c.startsWith('oppType:'))!;
  return 'all';
}

export interface ForkOptions { minOption: number; minOptionOpp: number; contexts?: (ctx: string) => boolean }

export function computeForks(rows: ForkRow[], opts: ForkOptions): ForkCell[] {
  const groups = new Map<string, ForkRow[]>();
  for (const r of rows) for (const c of r.ctx) {
    if (opts.contexts && !opts.contexts(c)) continue;
    const key = `${r.hero}|${r.role}|${r.slot}|${c}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const cells: ForkCell[] = [];
  for (const [key, rs] of groups) {
    const [hero, role, slot, ctx] = key.split('|') as [string, string, string, string];
    const min = ctx.startsWith('opp:') ? opts.minOptionOpp : opts.minOption;
    const options = standardize(rs, min);
    if (options.length < 2) continue;
    cells.push({ hero, role, slot: Number(slot), ctx, n: rs.length, w: rs.filter((r) => r.won).length, options });
  }
  // shrink level by level: all first, then children toward their parent
  const index = new Map(cells.map((c) => [`${c.hero}|${c.role}|${c.slot}|${c.ctx}`, c]));
  const level = (c: ForkCell) => (c.ctx === 'all' ? 0 : c.ctx.startsWith('opp:') ? 2 : 1);
  for (const lv of [0, 1, 2]) {
    const at = cells.filter((c) => level(c) === lv);
    const tau2 = priorVariance(at.flatMap((c) => c.options));
    for (const c of at) {
      const sample = rows.find((r) => r.hero === c.hero && r.role === c.role && r.slot === c.slot && r.ctx.includes(c.ctx))!;
      const pk = parentCtx(c.ctx, sample);
      const parent = pk ? index.get(`${c.hero}|${c.role}|${c.slot}|${pk}`) : undefined;
      for (const o of c.options) {
        const prior = parent?.options.find((x) => x.item === o.item)?.shrunk ?? 0;
        const s = shrinkToward(o, prior, tau2);
        o.shrunk = s.mean; o.shrunkSe = s.se;
        o.lo = s.mean - Z80 * s.se; o.hi = s.mean + Z80 * s.se;
        o.confidence = confidenceOf(o.lo, o.hi, s.mean);
      }
    }
  }
  return cells;
}

// ── order fork: item X at slot j vs slot j+1 ──

export interface OrderFork { hero: string; role: string; ctx: string; item: string; early: NW; late: NW; adjusted: number; se: number; shrunk: number; lo: number; hi: number; confidence: OptionStat['confidence'] }

/**
 * For each hero-role-item bought in slot 1 or 2: was it 1st or 2nd? Both
 * positions are compared at the SAME decision state, the player's minute-4
 * stratum (their slot-1 row), since buying it 1st is decided before then.
 */
export function orderForks(rows: ForkRow[], minEach: number, ctxFilter: (c: string) => boolean): OrderFork[] {
  const s1 = new Map(rows.filter((r) => r.slot === 1).map((r) => [r.key, r.stratum]));
  const groups = new Map<string, { early: ForkRow[]; late: ForkRow[] }>();
  for (const r of rows) {
    if (r.slot > 2) continue;
    const stratum = s1.get(r.key);
    if (stratum == null) continue;
    const row = { ...r, stratum };
    for (const c of r.ctx) {
      if (!ctxFilter(c)) continue;
      const key = `${r.hero}|${r.role}|${c}|${r.item}`;
      const g = groups.get(key) ?? { early: [], late: [] };
      (r.slot === 1 ? g.early : g.late).push(row);
      groups.set(key, g);
    }
  }
  const out: OrderFork[] = [];
  for (const [key, g] of groups) {
    if (g.early.length < minEach || g.late.length < minEach) continue;
    const [hero, role, ctx, item] = key.split('|') as [string, string, string, string];
    const both = [...g.early, ...g.late];
    const strata = new Map<number, NW>();
    for (const r of both) { const s = strata.get(r.stratum) ?? { n: 0, w: 0 }; s.n++; if (r.won) s.w++; strata.set(r.stratum, s); }
    const std = (rs: ForkRow[]) => {
      const per = new Map<number, NW>();
      for (const r of rs) { const s = per.get(r.stratum) ?? { n: 0, w: 0 }; s.n++; if (r.won) s.w++; per.set(r.stratum, s); }
      let m = 0, v = 0;
      for (const [sid, cs] of strata) {
        const ws = cs.n / both.length, pc = cs.w / cs.n, o = per.get(sid) ?? { n: 0, w: 0 };
        const p = (o.w + STRATUM_K * pc) / (o.n + STRATUM_K);
        m += ws * p; v += ws * ws * o.n * p * (1 - p) / (o.n + STRATUM_K) ** 2;
      }
      return { m, v };
    };
    const e = std(g.early), l = std(g.late);
    const adjusted = e.m - l.m, se = Math.sqrt(e.v + l.v);
    out.push({
      hero, role, ctx, item,
      early: { n: g.early.length, w: g.early.filter((r) => r.won).length },
      late: { n: g.late.length, w: g.late.filter((r) => r.won).length },
      adjusted, se, shrunk: adjusted, lo: 0, hi: 0, confidence: 'noise',
    });
  }
  // same rule as item forks: shrink toward 0 with a prior learned from the order forks themselves
  const tau2 = priorVariance(out);
  for (const f of out) {
    const s = shrinkToward(f, 0, tau2);
    f.shrunk = s.mean; f.lo = s.mean - Z80 * s.se; f.hi = s.mean + Z80 * s.se;
    f.confidence = confidenceOf(f.lo, f.hi, s.mean);
  }
  return out;
}

// ── validation ──

/**
 * Known-answer interaction: for every hero-role-slot where an item appears in
 * both the magical- and physical-opponent cells, d(item | magical opp) -
 * d(item | physical opp), inverse-variance pooled over items in `group`.
 * Magical-armor items should come out > 0; physical-armor items < 0.
 */
export function interaction(cells: ForkCell[], group: Set<string>, a: string, b: string): { estimate: number; se: number; pairs: number } {
  const key = (c: ForkCell) => `${c.hero}|${c.role}|${c.slot}`;
  const A = new Map(cells.filter((c) => c.ctx === a).map((c) => [key(c), c]));
  let num = 0, den = 0, pairs = 0;
  for (const cb of cells.filter((c) => c.ctx === b)) {
    const ca = A.get(key(cb));
    if (!ca) continue;
    for (const oa of ca.options) {
      if (!group.has(oa.item)) continue;
      const ob = cb.options.find((x) => x.item === oa.item);
      if (!ob) continue;
      const d = oa.adjusted - ob.adjusted, v = oa.se ** 2 + ob.se ** 2;
      num += d / v; den += 1 / v; pairs++;
    }
  }
  return den ? { estimate: num / den, se: Math.sqrt(1 / den), pairs } : { estimate: 0, se: Infinity, pairs: 0 };
}

/** Collapse every item in `group` into one option `label`, so a validation check pools e.g. all magical-armor items. */
export function groupItems(rows: ForkRow[], group: Set<string>, label: string): ForkRow[] {
  return rows.map((r) => (group.has(r.item) ? { ...r, item: label } : r));
}

/** Deterministic PRNG for the placebo shuffle (mulberry32). */
export function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Placebo: shuffle the oppType context across rows within each hero-role-slot. */
export function shuffleOppType(rows: ForkRow[], seed: number): ForkRow[] {
  const rand = rng(seed);
  const by = new Map<string, number[]>();
  rows.forEach((r, i) => { const k = `${r.hero}|${r.role}|${r.slot}`; (by.get(k) ?? by.set(k, []).get(k)!).push(i); });
  const out = rows.map((r) => ({ ...r, ctx: [...r.ctx] }));
  for (const idx of by.values()) {
    const types = idx.map((i) => rows[i]!.ctx.find((c) => c.startsWith('oppType:'))!);
    for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [types[i], types[j]] = [types[j]!, types[i]!]; }
    idx.forEach((i, n) => { const r = out[i]!; r.ctx = r.ctx.map((c) => (c.startsWith('oppType:') ? types[n]! : c)); });
  }
  return out;
}

import { describe, it, expect } from 'vitest';
import {
  goldAt, quantileCuts, bucketOf, countIn, learnLabels, buildRows, standardize, shrinkToward,
  computeForks, orderForks, interaction, shuffleOppType, rng, priorVariance,
  type ForkMatch, type ForkPlayer, type ForkRow,
} from '../src/forks.js';


function player(team: number, role: string, hero: string, o: Partial<ForkPlayer> = {}): ForkPlayer {
  return {
    pid: `${team}-${role}`, team, hero, role,
    gold: Array.from({ length: 33 }, (_, i) => (i < 3 ? 0 : 350 + (i - 3) * 400)),
    cores: [], kills: [], deaths: [], dmg: [1000, 0, 0], heal: 0, ...o,
  };
}

function match(id: string, winner: number, players: ForkPlayer[], dur = 1800): ForkMatch {
  return { id, version: 'v', dur, winner, players };
}

function row(p: Partial<ForkRow>): ForkRow {
  return { key: 'k', hero: 'h', role: 'carry', slot: 2, item: 'a', won: false, stratum: 0, ctx: ['all'], swing: null, teamDiff: 0, laneDiff: 0, ...p };
}

describe('fork helpers', () => {
  it('reads gold at game time with the 3-entry pregame offset', () => {
    const p = { gold: [0, 0, 0, 350, 700, 1100] };
    expect(goldAt(p, 0)).toBe(350);
    expect(goldAt(p, 61)).toBe(700);
    expect(goldAt(p, 9999)).toBe(1100);
    expect(goldAt({ gold: [] }, 10)).toBe(0);
  });

  it('quantile cuts split into equal groups', () => {
    const xs = Array.from({ length: 100 }, (_, i) => i);
    const cuts = quantileCuts(xs, 5);
    expect(cuts).toEqual([20, 40, 60, 80]);
    expect(bucketOf(-5, cuts)).toBe(0);
    expect(bucketOf(20, cuts)).toBe(1);
    expect(bucketOf(99, cuts)).toBe(4);
  });

  it('counts events in a half-open window', () => {
    expect(countIn([10, 20, 30], 10, 30)).toBe(2);
  });
});

describe('labels', () => {
  it('learns damage type from dealt damage and heal terciles from team totals', () => {
    const ms = [match('m', 0, [player(0, 'midlane', 'gideon', { dmg: [100, 900, 0] }), player(1, 'midlane', 'grux', { dmg: [900, 50, 0] }), player(1, 'carry', 'x', { dmg: [500, 500, 0] })])];
    const l = learnLabels(ms);
    expect(l.type.get('gideon|midlane')).toBe('magical');
    expect(l.type.get('grux|midlane')).toBe('physical');
    expect(l.type.get('x|carry')).toBe('mixed');
  });
});

describe('rows', () => {
  it('builds one row per reached slot with opponent contexts and a decision-time state', () => {
    const me = player(0, 'offlane', 'scarlett', { cores: [['tainted-blade', 600], ['vanquisher', 1000]], kills: [700, 800], deaths: [500] });
    const opp = player(1, 'offlane', 'terra', { dmg: [800, 100, 0], gold: Array.from({ length: 33 }, (_, i) => (i < 3 ? 0 : 350 + (i - 3) * 300)) });
    const ms = [match('m', 0, [me, opp])];
    const rows = buildRows(ms, learnLabels(ms));
    const mine = rows.filter((r) => r.hero === 'scarlett');
    expect(mine.map((r) => [r.slot, r.item])).toEqual([[1, 'tainted-blade'], [2, 'vanquisher']]);
    expect(mine[0]!.ctx).toContain('opp:terra');
    expect(mine[0]!.ctx).toContain('oppType:physical');
    // slot 2 decided when slot 1 completed (600s = minute 10): lead 10 * 100 gold
    expect(mine[1]!.laneDiff).toBe(1000);
    // swing around slot 1 (600s): after [600,900) 2 kills, before [300,600) 1 death -> 2 - (-1) = 3
    expect(mine[0]!.swing).toBe(3);
    expect(mine[0]!.won).toBe(true);
  });

  it('skips players without exactly one lane opponent', () => {
    const ms = [match('m', 0, [player(0, 'carry', 'a', { cores: [['x', 600]] }), player(1, 'midlane', 'b')])];
    expect(buildRows(ms, learnLabels(ms))).toHaveLength(0);
  });
});

describe('standardization removes the "bought by players already ahead" bias', () => {
  // Two items with NO true effect: win rate depends only on stratum.
  // Item "ahead" is bought mostly in the winning stratum, "behind" mostly in the losing one.
  const rows: ForkRow[] = [];
  const add = (item: string, stratum: number, n: number, rate: number) => {
    for (let i = 0; i < n; i++) rows.push(row({ item, stratum, won: i < Math.round(n * rate) }));
  };
  add('ahead', 14, 400, 0.7); add('ahead', 0, 100, 0.3);
  add('behind', 14, 100, 0.7); add('behind', 0, 400, 0.3);
  const opts = standardize(rows, 10);
  const a = opts.find((o) => o.item === 'ahead')!, b = opts.find((o) => o.item === 'behind')!;

  it('naive deltas are badly confounded', () => {
    expect(a.naive).toBeGreaterThan(0.1);
    expect(b.naive).toBeLessThan(-0.1);
  });
  it('adjusted deltas are ~0 for both', () => {
    expect(Math.abs(a.adjusted)).toBeLessThan(0.01);
    expect(Math.abs(b.adjusted)).toBeLessThan(0.01);
  });
  it('flags the defensive-looking option as bought from behind', () => {
    expect(b.fromBehind).toBeGreaterThan(0.7);
    expect(a.fromBehind).toBeLessThan(0.3);
  });
  it('still finds a real effect inside strata', () => {
    const r2: ForkRow[] = [];
    for (const s of [0, 14]) for (const [item, rate] of [['good', 0.6], ['bad', 0.4]] as const) for (let i = 0; i < 300; i++) r2.push(row({ item, stratum: s, won: i < 300 * rate }));
    const o = standardize(r2, 10);
    expect(o.find((x) => x.item === 'good')!.adjusted).toBeCloseTo(0.1, 1);
  });
});

describe('shrinkage', () => {
  it('pulls noisy estimates toward the prior, keeps precise ones', () => {
    expect(shrinkToward({ adjusted: 0.1, se: 0.1 }, 0, 0.01 ** 2).mean).toBeLessThan(0.01);
    expect(shrinkToward({ adjusted: 0.1, se: 0.001 }, 0, 0.05 ** 2).mean).toBeCloseTo(0.1, 2);
  });
  it('prior variance subtracts sampling noise', () => {
    const pure = Array.from({ length: 10 }, (_, i) => ({ adjusted: (i % 2 ? 1 : -1) * 0.05, se: 0.05 }));
    expect(priorVariance(pure)).toBeLessThan(1e-4);
  });
});

describe('computeForks + validation tools', () => {
  // synthetic world: armor item "mr" helps only vs magical opponents
  const ms: ForkMatch[] = [];
  const rand = rng(7);
  for (let i = 0; i < 1600; i++) {
    const magical = i % 2 === 0;
    const buyMr = rand() < 0.5;
    const pWin = 0.5 + (buyMr && magical ? 0.12 : 0) - (buyMr && !magical ? 0.04 : 0);
    const won = rand() < pWin;
    const me = player(0, 'carry', 'hero', { cores: [['first', 500], [buyMr ? 'mr' : 'dmg', 900]] });
    const opp = player(1, 'carry', magical ? 'mage' : 'brawler', { dmg: magical ? [50, 950, 0] : [950, 50, 0] });
    ms.push(match(`m${i}`, won ? 0 : 1, [me, opp]));
  }
  const labels = learnLabels(ms);
  const rows = buildRows(ms, labels).filter((r) => r.hero === 'hero');
  const cells = computeForks(rows, { minOption: 30, minOptionOpp: 30 });

  it('finds the context fork and the interaction', () => {
    const vsMage = cells.find((c) => c.slot === 2 && c.ctx === 'oppType:magical')!;
    const mr = vsMage.options.find((o) => o.item === 'mr')!;
    expect(mr.shrunk).toBeGreaterThan(0.02);
    expect(mr.confidence).not.toBe('noise');
    const it2 = interaction(cells, new Set(['mr']), 'oppType:magical', 'oppType:physical');
    expect(it2.estimate).toBeGreaterThan(0.05);
  });

  it('placebo shuffle keeps row counts and kills the interaction', () => {
    const shuffled = shuffleOppType(rows, 3);
    expect(shuffled).toHaveLength(rows.length);
    const est = interaction(computeForks(shuffled, { minOption: 30, minOptionOpp: Infinity }), new Set(['mr']), 'oppType:magical', 'oppType:physical').estimate;
    expect(Math.abs(est)).toBeLessThan(0.05);
  });

  it('order fork compares 1st vs 2nd at the same minute-4 state', () => {
    const om: ForkMatch[] = [];
    for (let i = 0; i < 400; i++) {
      const early = i % 2 === 0;
      const won = i % 10 < (early ? 7 : 4);
      const me = player(0, 'offlane', 'scarlett', { cores: early ? [['tb', 500], ['x', 900]] : [['x', 500], ['tb', 900]] });
      om.push(match(`o${i}`, won ? 0 : 1, [me, player(1, 'offlane', 'terra')]));
    }
    const r = buildRows(om, learnLabels(om));
    const f = orderForks(r, 20, (c) => c === 'all').find((x) => x.item === 'tb' && x.hero === 'scarlett')!;
    expect(f.early.n).toBe(200);
    expect(f.adjusted).toBeCloseTo(0.4, 1); // 80% vs 40% wins, minus smoothing
  });

});

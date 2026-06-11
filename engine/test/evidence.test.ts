import { describe, it, expect, beforeAll } from 'vitest';
import { loadAggregates, type AggregateSnapshot } from '../src/aggregates.js';
import { momPriorStrength, heroWinRate, itemWinDelta } from '../src/evidence.js';
import { loadData, type LoadedData } from '../src/data.js';

let agg: AggregateSnapshot;
let data: LoadedData;

beforeAll(() => {
  agg = loadAggregates()!;
  data = loadData();
});

describe('empirical Bayes shrinkage (evidence layer v0)', () => {
  it('snapshot now carries win counts per hero-item cell', () => {
    const g = agg.heroes['gideon']!;
    const cells = Object.values(g.items);
    expect(cells.length).toBeGreaterThan(10);
    for (const c of cells.slice(0, 20)) {
      expect(c.w).toBeGreaterThanOrEqual(0);
      expect(c.w).toBeLessThanOrEqual(c.n);
    }
  });

  it('method-of-moments prior strength is data-driven and bounded', () => {
    const k = momPriorStrength(Object.values(agg.heroes).map((h) => ({ n: h.games, w: h.wins })), 0.5);
    expect(k).toBeGreaterThanOrEqual(10);
    expect(k).toBeLessThanOrEqual(500);
  });

  it('shrinkage pulls toward the prior, harder for small samples', () => {
    const big = heroWinRate('gideon', agg)!;     // >1500 games
    expect(Math.abs(big.shrunk - 0.5)).toBeLessThanOrEqual(Math.abs(big.raw - 0.5) + 1e-9);
    // synthetic small cell: 8/10 wins should not stay at 80%
    const k = big.priorStrength;
    const smallShrunk = (8 + k * 0.5) / (10 + k);
    expect(smallShrunk).toBeLessThan(0.65);
  });

  it('item deltas exist for common items, are bounded, and carry the bias label', () => {
    const crown = data.items.get('Oblivion Crown')!;
    const ev = itemWinDelta('gideon', crown.gameId, agg);
    expect(ev).not.toBeNull();
    expect(Math.abs(ev!.delta)).toBeLessThan(0.15); // shrinkage forbids wild deltas
    expect(ev!.biased).toBe('finished-inventory survivorship');
    expect(ev!.n).toBeGreaterThan(10);
  });

  it('rare items return null instead of noise', () => {
    // an item with <10 appearances on the hero must not produce a delta
    const g = agg.heroes['gideon']!;
    const rare = Object.entries(g.items).find(([, c]) => c.n > 0 && c.n < 10);
    if (!rare) return; // nothing rare in this snapshot; fine
    const ev = itemWinDelta('gideon', Number(rare[0]), agg);
    expect(ev).toBeNull();
  });
});

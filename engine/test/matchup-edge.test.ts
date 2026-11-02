import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitK, pairLane, pairPrior, shrinkPairs, roleWrOf, K_MAX, K_MIN, type RoleWr } from '../src/matchup-edge.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const roleWr: RoleWr = {
  strong: { midlane: { wr: 0.54, n: 5000 }, support: { wr: 0.5, n: 100 } },
  weak: { midlane: { wr: 0.47, n: 4000 } },
  avg: { midlane: { wr: 0.5, n: 3000 } },
  flex: { support: { wr: 0.53, n: 9000 }, midlane: { wr: 0.48, n: 200 } },
  sup: { support: { wr: 0.47, n: 8000 }, midlane: { wr: 0.5, n: 50 } },
};

describe('matchup edge (empirical-Bayes counter records)', () => {
  it('prior = 0.5 + both heroes\' lane edges, in the lane they share most', () => {
    expect(pairPrior('strong', 'weak', roleWr)).toBeCloseTo(0.57, 6);
    expect(pairPrior('weak', 'strong', roleWr)).toBeCloseTo(0.43, 6);
    expect(pairLane('flex', 'sup', roleWr)).toBe('support');
    expect(pairPrior('flex', 'sup', roleWr)).toBeCloseTo(0.56, 6);
    expect(pairPrior('strong', 'nobody', roleWr)).toBe(0.5);
  });

  it('a thin lucky record no longer outranks a big solid one', () => {
    const cells = { 'avg|weak': { n: 24, w: 15 }, 'strong|weak': { n: 818, w: 460 } };
    const { pairs } = shrinkPairs(cells, roleWr, 20);
    expect(pairs['avg|weak']!.wr).toBe(62.5);
    expect(pairs['avg|weak']!.shrunkWr).toBeLessThan(pairs['strong|weak']!.shrunkWr);
  });

  it('keeps the 20-game gate and the raw rate', () => {
    const { pairs } = shrinkPairs({ 'avg|weak': { n: 19, w: 19 }, 'strong|weak': { n: 40, w: 20 } }, roleWr, 20);
    expect(Object.keys(pairs)).toEqual(['strong|weak']);
    expect(pairs['strong|weak']).toMatchObject({ wr: 50, n: 40, towerDiff: null, prior: 57, lane: 'midlane' });
  });

  it('k: noise-only spread hits the cap, real spread lowers it, few pairs use the default', () => {
    const noiseOnly = Array.from({ length: 50 }, (_, i) => ({ n: 400, w: 200 + (i % 2 ? 5 : -5), p: 0.5 }));
    expect(fitK(noiseOnly)).toBe(K_MAX);
    const spread = Array.from({ length: 50 }, (_, i) => ({ n: 2000, w: i % 2 ? 1200 : 800, p: 0.5 }));
    const k = fitK(spread);
    expect(k).toBeGreaterThanOrEqual(K_MIN);
    expect(k).toBeLessThan(50);
    expect(fitK(noiseOnly.slice(0, 3))).toBe(100);
  });

  it('the committed feed carries shrunk rates fitted from its own cells', () => {
    const feed = JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/feed-matchups.json'), 'utf8'));
    const index = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/index.json'), 'utf8'));
    const { pairs, k } = shrinkPairs(feed.cells, roleWrOf(index));
    expect(feed.shrink.k).toBe(k);
    expect(feed.pairs).toEqual(pairs);
  });
});

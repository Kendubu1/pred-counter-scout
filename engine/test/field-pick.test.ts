import { describe, it, expect } from 'vitest';
import { bestAugment, bestCrest, bestMinors, fieldPickOf, rankedEternals, sampleFloor } from '../src/field-pick.js';

describe('field pick: the clear winner leads, never the most-played or the sim', () => {
  it('scales the sample floor with the cell, clamped 30..300', () => {
    expect(sampleFloor(100)).toBe(30);
    expect(sampleFloor(1500)).toBe(150);
    expect(sampleFloor(20000)).toBe(300);
  });

  it('takes the best-winning augment over the most-played one (Revenant 1.17.2 shape)', () => {
    const cell = { games: 13266, augments: [
      { id: '99', name: 'Hellfire Blast', n: 6003, w: 2901 },
      { id: '98', name: 'Quickdraw', n: 4638, w: 2480 },
      { id: '97', name: 'Fluke', n: 40, w: 30 },            // under the 300 floor
    ] };
    expect(bestAugment(cell)?.name).toBe('Quickdraw');
  });

  it('ranks Eternals by shrunk win rate so a thin lucky pick cannot lead', () => {
    const cell = { games: 10000, eternals: [
      { name: 'Vermis', n: 3000, w: 1400 },
      { name: 'Weald', n: 5000, w: 2600 },
      { name: 'Lotus', n: 310, w: 180 },
      { name: 'Tiny', n: 20, w: 18 },
      { name: 'Krix', n: 1000, w: 500 },
      { name: 'Thraex', n: 700, w: 360 },
    ] };
    const ranked = rankedEternals(cell).map((e) => e.name);
    expect(ranked).not.toContain('Tiny');
    expect(ranked[ranked.length - 1]).toBe('Vermis');
    expect(fieldPickOf(cell)?.eternal?.name).not.toBe('Vermis');
  });

  it('picks the best-winning minor PAIR, falling back to most-picked per slot', () => {
    const aion = { name: 'Aion', n: 872, w: 450, pairs: [
      { minor1: 'Sacrifice', minor2: 'Runic Focus', n: 393, w: 184 },
      { minor1: 'Bottomless Vial', minor2: 'Runic Focus', n: 375, w: 204 },
      { minor1: 'Odd', minor2: 'Pair', n: 20, w: 18 },       // under the floor
    ] };
    expect(bestMinors(aion)).toMatchObject({ minor1: 'Bottomless Vial', minor2: 'Runic Focus', basis: 'best-pair' });
    const thin = { name: 'X', n: 100, w: 50, pairs: [], minor1: [{ name: 'A', n: 60, w: 30 }], minor2: [{ name: 'B', n: 55, w: 28 }] };
    expect(bestMinors(thin)).toMatchObject({ minor1: 'A', minor2: 'B', basis: 'most-picked' });
  });

  it('only names a crest that clears the floor', () => {
    expect(bestCrest({ games: 5000, crests: [{ name: 'Rare', n: 50, w: 40 }] })).toBeNull();
    expect(bestCrest({ games: 5000, crests: [{ name: 'Pacifier', n: 3000, w: 1540 }, { name: 'Liberator', n: 900, w: 470 }] })?.name).toBe('Liberator');
  });
});

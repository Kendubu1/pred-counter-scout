import { describe, it, expect } from 'vitest';
import { bestAugment, bestCrest, bestMinors, fieldPickOf, leadFloor, phi, rankBand, rankByEdge, rankedEternals, sampleFloor } from '../src/field-pick.js';

describe('field pick: the best statistical edge leads, never the sim', () => {
  it('scales the sample floor with the cell, clamped 30..300', () => {
    expect(sampleFloor(100)).toBe(30);
    expect(sampleFloor(1500)).toBe(150);
    expect(sampleFloor(20000)).toBe(300);
  });

  it('takes the best-winning augment over the most-played one (Revenant 1.17.2 shape)', () => {
    const cell = { games: 13266, augments: [
      { id: '99', name: 'Hellfire Blast', n: 6003, w: 2901 },
      { id: '98', name: 'Quickdraw', n: 4638, w: 2480 },
      { id: '97', name: 'Fluke', n: 25, w: 22 },            // under the 30-game junk floor
    ] };
    expect(bestAugment(cell)).toMatchObject({ name: 'Quickdraw', confidence: 'clear' });
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

  it('only names a crest with at least 30 games', () => {
    expect(bestCrest({ games: 5000, crests: [{ name: 'Rare', n: 20, w: 18 }] })).toBeNull();
    expect(bestCrest({ games: 5000, crests: [{ name: 'Pacifier', n: 3000, w: 1540 }, { name: 'Liberator', n: 900, w: 470 }] })).toMatchObject({ name: 'Liberator', confidence: 'toss-up' });
    expect(bestCrest({ games: 5000, crests: [{ name: 'Pacifier', n: 3000, w: 1500 }, { name: 'Liberator', n: 1500, w: 840 }] })).toMatchObject({ name: 'Liberator', confidence: 'clear' });
  });

  it('phi is the standard normal CDF', () => {
    expect(phi(0)).toBeCloseTo(0.5, 6);
    expect(phi(1.96)).toBeCloseTo(0.975, 3);
    expect(phi(-1.2816)).toBeCloseTo(0.1, 3);
  });

  it('calls a coin-flip lead a toss-up, leads with the best odds and names the tied options (Aurora jungle 2026-10-26)', () => {
    const ets = [
      { name: 'Krix', n: 3248, w: 1747 }, { name: 'Lotus', n: 1647, w: 922 }, { name: 'Vesh', n: 1436, w: 785 },
      { name: 'Idrisil', n: 720, w: 387 }, { name: 'Xyris', n: 525, w: 297 }, { name: 'Nihil', n: 305, w: 175 },
      { name: 'Weald', n: 257, w: 130 }, { name: 'Knell', n: 240, w: 133 },
    ];
    const r = rankByEdge(ets, 9019);
    expect(r.confidence).toBe('toss-up');
    // Best odds among options with >= 300 games (the lead floor's cap), never the most-played Krix.
    const best = r.ranked.filter((e) => !e.few).sort((a, b) => b.shrunk - a.shrunk)[0]!;
    expect(r.ranked[0]).toBe(best);
    expect(r.ranked[0]!.name).not.toBe('Krix');
    expect(r.contenders.map((e) => e.name)).toEqual(expect.arrayContaining(['Nihil', 'Xyris', 'Lotus']));
    expect(r.contenders.map((e) => e.name)).not.toContain('Krix');
    expect(fieldPickOf({ games: 9019, eternals: ets })?.eternal).toMatchObject({ name: best.name, confidence: 'toss-up', pBeat: null });
  });

  it('an option under the lead floor can be listed but never lead', () => {
    expect(leadFloor(38)).toBe(10);
    expect(leadFloor(142)).toBe(14);
    expect(leadFloor(9019)).toBe(300);
    const r = rankByEdge([{ name: 'Big', n: 900, w: 450 }, { name: 'Lucky', n: 60, w: 45 }], 960);
    expect(r.ranked[0]!.name).toBe('Big');
    expect(r.ranked[1]).toMatchObject({ name: 'Lucky', few: true });
    expect(r.confidence).toBeNull();   // the only option that could lead: no edge claimed
  });

  it('a thin Plat+ cell borrows each option\'s all-ranks rate (Argus support 2026-10-27)', () => {
    const all = { games: 6116, wins: 2862, eternals: [
      { name: 'Vesh', n: 3901, w: 1857 }, { name: 'Aion', n: 1154, w: 523 }, { name: 'Lotus', n: 271, w: 126 },
      { name: 'Demiurge', n: 226, w: 101 }, { name: 'Knell', n: 131, w: 69 },
    ] };
    const plat = { games: 38, wins: 16, eternals: [{ name: 'Vesh', n: 22, w: 8 }, { name: 'Aion', n: 12, w: 8 }, { name: 'Lotus', n: 3, w: 0 }] };
    const r = rankBand(all, plat, 'eternals');
    expect(r.thin).toBe(false);
    expect(r.ranked[0]!.name).toBe('Aion');   // 8-4 beats 8-14 once both lean on their all-ranks record
    expect(r.confidence).toBe('toss-up');
  });

  it('a big sample with a real gap is a clear edge, a small gap a slight one', () => {
    const clear = rankByEdge([{ name: 'A', n: 4000, w: 2200 }, { name: 'B', n: 4000, w: 2000 }], 8000);
    expect(clear).toMatchObject({ confidence: 'clear' });
    expect(clear.ranked[0]!.name).toBe('A');
    const slight = rankByEdge([{ name: 'A', n: 2000, w: 1050 }, { name: 'B', n: 2000, w: 1030 }], 4000);
    expect(slight.confidence).toBe('slight');
    expect(slight.edgePts!).toBeGreaterThan(0);
  });

  it('a thin lucky pick ranks below a well-sampled one at the same raw rate', () => {
    const r = rankByEdge([{ name: 'Big', n: 3000, w: 1800 }, { name: 'Small', n: 40, w: 24 }, { name: 'Mid', n: 3000, w: 1500 }], 6040);
    const big = r.ranked.find((x) => x.name === 'Big')!, small = r.ranked.find((x) => x.name === 'Small')!;
    expect(big.shrunk).toBeGreaterThan(small.shrunk);
    expect(small.pickRate).toBeCloseTo(40 / 6040, 6);
  });

  it('with nothing at the lead floor, lists by games and claims no edge', () => {
    const r = rankByEdge([{ name: 'Lucky', n: 6, w: 6 }, { name: 'Common', n: 8, w: 4 }], 14);
    expect(r).toMatchObject({ thin: true, confidence: null });
    expect(r.ranked[0]!.name).toBe('Common');
  });
});

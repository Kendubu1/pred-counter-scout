import { describe, expect, it } from 'vitest';
import { bandOfRankCode, countMatchPairs, emptyBands, gatePairs, type Cells } from '../src/matchup-pairs.js';

const P = (team: string, hero: string, role: string | null, rank: number | null = null) => ({ team, hero_slug: hero, role, rank });

describe('matchup pair counting (counter list, rank bands from 1.18)', () => {
  it('maps sampler rank codes to the board bands; unplaced is no band', () => {
    expect(bandOfRankCode(null)).toBeNull();
    expect(bandOfRankCode(0)).toBeNull();
    expect(bandOfRankCode(11)).toBe('low');  // Bronze
    expect(bandOfRankCode(25)).toBe('low');  // Silver
    expect(bandOfRankCode(31)).toBe('mid');  // Gold
    expect(bandOfRankCode(43)).toBe('mid');  // Platinum
    expect(bandOfRankCode(51)).toBe('high'); // Diamond
    expect(bandOfRankCode(61)).toBe('high'); // Master (1.18) / Paragon
    expect(bandOfRankCode(71)).toBe('high');
  });

  it('counts each lane both ways, and each direction in THAT player\'s band', () => {
    const cells: Cells = new Map();
    const bands = emptyBands();
    const lanes = countMatchPairs({
      winning_team: 'dusk',
      players: [
        P('dusk', 'gideon', 'midlane', 52), P('dawn', 'renna', 'midlane', 33),
        P('dusk', 'kira', 'carry', null), P('dawn', 'murdock', 'carry', 14),
        P('dusk', 'zinx', 'support', 21), P('dawn', 'zinx', 'support', 21), // mirror: skipped
        P('dusk', 'grux', null, 30),                                           // no role: ignored
      ],
    }, cells, bands);
    expect(lanes).toBe(2);
    expect(cells.get('gideon|renna')).toEqual({ n: 1, w: 1 });
    expect(cells.get('renna|gideon')).toEqual({ n: 1, w: 0 });
    expect(cells.get('kira|murdock')).toEqual({ n: 1, w: 1 });
    expect(cells.has('zinx|zinx')).toBe(false);
    expect(bands.high.get('gideon|renna')).toEqual({ n: 1, w: 1 });  // Gideon's player was Diamond
    expect(bands.mid.get('renna|gideon')).toEqual({ n: 1, w: 0 });   // Renna's player was Gold
    expect(bands.low.get('murdock|kira')).toEqual({ n: 1, w: 0 });   // Murdock's player was Bronze
    // Kira's player was unplaced: all ranks only
    for (const b of Object.values(bands)) expect(b.has('kira|murdock')).toBe(false);
  });

  it('skips matches without a winner or without exactly two teams; keeps the first duplicate-role row', () => {
    const cells: Cells = new Map();
    const bands = emptyBands();
    expect(countMatchPairs({ winning_team: null, players: [P('a', 'x', 'carry'), P('b', 'y', 'carry')] }, cells, bands)).toBe(0);
    expect(countMatchPairs({ winning_team: 'a', players: [P('a', 'x', 'carry'), P('a', 'y', 'midlane')] }, cells, bands)).toBe(0);
    countMatchPairs({ winning_team: 'b', players: [P('a', 'x', 'carry'), P('a', 'z', 'carry'), P('b', 'y', 'carry')] }, cells, bands);
    expect(cells.get('x|y')).toEqual({ n: 1, w: 0 });
    expect(cells.has('z|y')).toBe(false);
  });

  it('gates pairs at the minimum games and reports win % to one decimal', () => {
    const cells: Cells = new Map([['a|b', { n: 20, w: 13 }], ['b|a', { n: 19, w: 6 }]]);
    expect(gatePairs(cells, 20)).toEqual({ 'a|b': { wr: 65, n: 20, towerDiff: null } });
  });
});

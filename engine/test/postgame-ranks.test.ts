// Rank and VP after the game for every player of a reviewed film
// (npm run postgame:ranks). pred.gg reports the entry rank and VP before and
// after; the after-rank is derived from the ladder's VP bands.

import { describe, it, expect } from 'vitest';
import { rankVpOf } from '../src/ingest/postgame-ranks.js';

const r = (name: string, tierIdx: number, divisionIdx: number, ratingMin: number, ratingMax: number) => ({ name, tierIdx, divisionIdx, ratingMin, ratingMax });
const LADDER = [
  r('Paragon', 5, 0, 1400, 666666),
  r('Silver I', 1, 2, 500, 600), r('Gold III', 2, 0, 600, 700), r('Gold II', 2, 1, 700, 800),
  r('Diamond II', 4, 1, 1300, 1400), r('Diamond I', 4, 2, 1400, 1500),
];
const rating = (rank: ReturnType<typeof r>, points: number, newPoints: number, isRankup = false) => ({ points, newPoints, isRankup, rank, rating: { ranks: LADDER } });

describe('rankVpOf', () => {
  it('keeps the entry rank while the new VP stays in its band', () => {
    const v = rankVpOf(rating(LADDER[2]!, 622, 644))!;
    expect(v.before).toEqual({ rank: 'Gold III', tierIdx: 2, vp: 622 });
    expect(v.after).toEqual({ rank: 'Gold III', tierIdx: 2, vp: 644 });
    expect(v.change).toBe(22);
  });
  it('moves to the division whose band holds the new VP on a rank-up', () => {
    const v = rankVpOf(rating(LADDER[2]!, 687, 710, true))!;
    expect(v.after.rank).toBe('Gold II');
    expect(v.rankUp).toBe(true);
  });
  it('follows the VP band down after a loss across a division line', () => {
    expect(rankVpOf(rating(LADDER[2]!, 600, 575))!.after.rank).toBe('Silver I');
  });
  it('reads 1400+ VP as Diamond I unless the player entered as Paragon', () => {
    expect(rankVpOf(rating(LADDER[4]!, 1390, 1410, true))!.after.rank).toBe('Diamond I');
    expect(rankVpOf(rating(LADDER[0]!, 1450, 1430))!.after.rank).toBe('Paragon');
  });
  it('returns null for an unranked player', () => {
    expect(rankVpOf(null)).toBeNull();
    expect(rankVpOf({ points: null, newPoints: null, isRankup: null, rank: null, rating: null })).toBeNull();
  });
});

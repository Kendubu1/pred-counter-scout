import { describe, expect, it } from 'vitest';
import { reviewStack, ROLES, type MemberScores, type Role, type StackMemberGame } from '../src/stack-review.js';

const scores = (uuid: string, name: string, wr: Partial<Record<Role, number>>): MemberScores => ({
  uuid, name,
  scores: Object.fromEntries(ROLES.map((r) => [r, { score: wr[r] ?? 0.48, wr: wr[r] ?? 0.48, games: 100 }])) as MemberScores['scores'],
});
const game = (uuid: string, name: string, role: Role, score: number | null = 0): StackMemberGame =>
  ({ uuid, name, role, heroSlug: 'h', heroName: 'Hero', kills: 1, deaths: 6, assists: 2, score, z: { deathsPer10: -2, kp: -0.5 } });

const A = scores('a', 'Ann Lee', { carry: 0.56, midlane: 0.49 });
const B = scores('b', 'Bo', { support: 0.55, carry: 0.5 });

describe('stack review', () => {
  it('suggests the best seats after a loss in off lanes', () => {
    const r = reviewStack({ matchId: 'm', result: 'loss', stackSize: 2 }, [game('a', 'Ann Lee', 'midlane'), game('b', 'Bo', 'carry')], [A, B], {})!;
    expect(r.lanesWereBest).toBe(false);
    expect(r.recommend?.kind).toBe('swap');
    expect(r.recommend?.moves).toEqual([{ name: 'Ann Lee', from: 'midlane', to: 'carry' }, { name: 'Bo', from: 'carry', to: 'support' }]);
    expect(r.gapPer100).toBeCloseTo(6, 1);
  });
  it('says nothing about lanes after a win, even in off lanes', () => {
    const r = reviewStack({ matchId: 'm', result: 'win', stackSize: 2 }, [game('a', 'Ann Lee', 'midlane'), game('b', 'Bo', 'carry')], [A, B], {})!;
    expect(r.recommend).toBeNull();
    expect(r.members.map((m) => m.name)).toEqual(['Ann Lee', 'Bo']);
  });
  it('keeps the lane when a rough game was already in the best seat', () => {
    const r = reviewStack({ matchId: 'm', result: 'loss', stackSize: 2 }, [game('a', 'Ann Lee', 'carry', -1.4), game('b', 'Bo', 'support')], [A, B], {})!;
    expect(r.lanesWereBest).toBe(true);
    expect(r.recommend?.kind).toBe('keep');
    expect(r.members[0]!.rough).toBe(true);
    expect(r.members[0]!.weakest).toBe('deaths');
    expect(r.recommend?.reasons[0]).toMatch(/keep the lane/);
  });
  it('no suggestion after a loss in the best seats with no rough game', () => {
    const r = reviewStack({ matchId: 'm', result: 'loss', stackSize: 2 }, [game('a', 'Ann Lee', 'carry', -0.5), game('b', 'Bo', 'support')], [A, B], {})!;
    expect(r.recommend).toBeNull();
  });
  it('weighs the carry+support duo record like the squad picker', () => {
    // without the duo record Bo's best is support; a losing duo lane pushes them apart
    const r = reviewStack({ matchId: 'm', result: 'loss', stackSize: 2 }, [game('a', 'Ann Lee', 'carry'), game('b', 'Bo', 'support')], [A, B],
      { 'a|b': { shrunkWr: 0.3, games: 40, winrate: 0.25 } })!;
    expect(r.best.seats.map((s) => s.role)).not.toEqual(['carry', 'support']);
  });
  it('needs two known members', () => {
    expect(reviewStack({ matchId: 'm', result: 'loss', stackSize: 2 }, [game('a', 'Ann Lee', 'carry')], [A, B], {})).toBeNull();
  });
});

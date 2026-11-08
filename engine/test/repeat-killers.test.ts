import { describe, it, expect } from 'vitest';
import { repeatKillers, type RkFilm } from '../src/repeat-killers.js';

const film = (i: number, killsByX: number, faceX = true): RkFilm => ({
  matchId: `m${i}`, startTime: `2026-11-0${(i % 9) + 1}T00:00:00Z`, result: 'loss',
  players: [{ pid: 'me', us: true, heroSlug: 'kira', heroName: 'Kira', deaths: 6, role: 'carry' },
    ...['x', 'a', 'b', 'c', 'd'].map((h) => ({ pid: h, us: false, heroSlug: h === 'x' && !faceX ? 'y' : h, heroName: h.toUpperCase(), deaths: 0, role: 'carry' }))],
  kills: [...Array.from({ length: killsByX }, () => ({ killerPid: 'x', killedPid: 'me' })), ...Array.from({ length: 6 - killsByX }, () => ({ killerPid: 'a', killedPid: 'me' }))],
});
describe('repeat killers', () => {
  it('lists a hero faced 3+ times with 5+ deaths at 1.5x the average per enemy', () => {
    const r = repeatKillers({ uuid: 'me', name: 'Me' }, [film(1, 3), film(2, 3), film(3, 2), film(4, 0, false)], () => null, () => 'Hit it first.', () => 'physical armor');
    // 24 deaths over 20 enemy slots = 1.2 baseline; X: 8 deaths in 3 games = 2.67/game (2.2x); A: 16 in 4 = 4/game (3.3x)
    expect(r.baselinePerHero).toBe(1.2);
    expect(r.killers.map((k) => [k.slug, k.deaths, k.games])).toEqual([['a', 16, 4], ['x', 8, 3]]);
    expect(r.killers[1]).toMatchObject({ ratio: 2.2, asHeroes: [{ hero: 'Kira', deaths: 8 }], playAgainst: 'Hit it first.', answer: 'physical armor' });
  });
  it('needs 3 games facing the hero', () => {
    const r = repeatKillers({ uuid: 'me', name: 'Me' }, [film(1, 5), film(2, 5)], () => null, () => null, () => null);
    expect(r.killers.find((k) => k.slug === 'x')).toBeUndefined();
  });
});

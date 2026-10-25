import { describe, it, expect } from 'vitest';
import { metricsOf, scoreRows, coreOf, type StandoutFilm, type StandoutPlayer, type Role } from '../src/standouts.js';

const player = (i: number, team: string, role: Role, hero: string, over: Partial<StandoutPlayer> = {}): StandoutPlayer => ({
  pid: `p${i}`, name: `n${i}`, team, us: team === 'dawn', role, heroSlug: hero, heroName: hero,
  kills: 3, deaths: 3, assists: 5, goldEarned: 12000, damageToHeroes: 15000, damageToObjectives: 3000,
  damageTaken: 15000, mitigated: 5000, healingDone: 1000, wardsPlaced: 6, items: [], ...over,
});
const ROLES: Role[] = ['carry', 'midlane', 'offlane', 'jungle', 'support'];
const film = (id: number, carryOver: Partial<StandoutPlayer> = {}): StandoutFilm => ({
  matchId: `m${id}`, startTime: '2026-10-20T00:00:00Z', durationMin: 30, ourTeam: 'dawn', result: 'win',
  players: ['dawn', 'dusk'].flatMap((t, ti) => ROLES.map((r, ri) => player(id * 10 + ti * 5 + ri, t, r, `${r}-hero`,
    t === 'dawn' && r === 'carry' ? carryOver : { damageToHeroes: 15000 + ((id * 7 + ri) % 5) * 500 }))),
});

describe('standout scoring', () => {
  it('computes per-minute and team-share metrics', () => {
    const f = film(1);
    const m = metricsOf(f.players[0]!, f);
    expect(m.dpm).toBe(500);
    expect(m.deathsPer10).toBe(1);
    expect(m.kp).toBeCloseTo(8 / 15);
  });

  it('flags the game a hero far out-played its own norm, and only that one', () => {
    const films = Array.from({ length: 12 }, (_, i) => film(i, i === 5
      ? { kills: 12, deaths: 0, assists: 6, damageToHeroes: 40000, goldEarned: 18000 }
      : { damageToHeroes: 15000 + (i % 3) * 800 }));
    const rows = films.flatMap((f) => f.players.map((p) => ({ film: f, p, m: metricsOf(p, f) })));
    const s = scoreRows(rows);
    const carryIdx = rows.map((r, i) => [r, i] as const).filter(([r]) => r.p.team === 'dawn' && r.p.role === 'carry');
    const best = carryIdx.reduce((a, b) => (s[b[1]]!.score > s[a[1]]!.score ? b : a));
    expect(best[0].film.matchId).toBe('m5');
    expect(s[best[1]]!.score).toBeGreaterThan(1);
    expect(s[best[1]]!.heroGames).toBe(24);   // both sides field the same carry hero
  });

  it('takes the core from the purchase timeline, not inventory order', () => {
    const p = player(1, 'dawn', 'carry', 'x', {
      items: [{ slug: 'c', name: 'C' }, { slug: 'a', name: 'A' }, { slug: 'b', name: 'B' }, { slug: 'd', name: 'D' }],
      itemTimeline: [{ slug: 'c', name: 'C', estMin: 20 }, { slug: 'a', name: 'A', estMin: 8 }, { slug: 'b', name: 'B', estMin: 14 }, { slug: 'd', name: 'D', estMin: 25 }],
    });
    expect(coreOf(p)).toEqual(['a', 'b', 'c']);
  });
});

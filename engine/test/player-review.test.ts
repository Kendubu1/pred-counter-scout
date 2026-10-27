import { describe, expect, it } from 'vitest';
import { buildReview, hotLanes, lobbyTips, type FilmRow, type Profile } from '../src/player-review.js';

const hero = (name: string, games: number, rawWr: number, edge: number, deathsPerGame = 4) =>
  ({ slug: name.toLowerCase(), name, games, rawWr, shrunkWr: rawWr, edge, deathsPerGame });

const profile = (over: Partial<Profile> = {}): Profile => ({
  player: { uuid: 'u1', name: 'A', career: { games: 1000, winrate: 0.5, deathsPerGame: 4 }, current: { points: 600, rank: 'Silver I' } },
  goal: { tier: 'Platinum III', vp: 900, gapVp: 300, peakAllTime: 700 },
  roles: [
    { role: 'midlane', games: 300, rawWr: 0.55, shrunkWr: 0.54 },
    { role: 'offlane', games: 200, rawWr: 0.46, shrunkWr: 0.48 },
  ],
  pool: [hero('Main', 250, 0.5, -0.002), hero('Star', 120, 0.58, 0.05), hero('Field', 80, 0.46, 0.04)],
  leanInto: [hero('Star', 120, 0.58, 0.05), hero('Field', 80, 0.46, 0.04)],
  poolWidth: { heroesPlayed20Plus: 10, top3Share: 0.45 },
  ...over,
});

const squad = (name: string, caught: number) => ({ [name]: { games: 100, deaths: 400, firstToFall: 100, caughtOut: caught, fightsPresent: 100, fightsPresentWon: 40, fightsAbsent: 100, fightsAbsentWon: 40 } });

describe('player review', () => {
  it('applies the career rules: lane gap, climb heroes beat their own average, comfort trap, pool width', () => {
    const r = buildReview(profile(), [], {}, {}, []);
    const titles = [...r.keep, ...r.fix].map((t) => t.title);
    expect(titles).toContain('Queue mid, avoid offlane');
    expect(titles).toContain('Your climb hero: Star');
    // Field beats the average Field player but loses for this player: not a climb hero.
    expect(titles.join(' ')).not.toContain('Field');
    expect(titles).toContain('Main is your most played, but gives you no edge');
    expect(titles).toContain('Narrow your hero pool');
  });

  it('calls a player lane-flexible only inside a 2-point lane gap', () => {
    const flex = buildReview(profile({ roles: [
      { role: 'midlane', games: 300, rawWr: 0.52, shrunkWr: 0.52 },
      { role: 'carry', games: 300, rawWr: 0.51, shrunkWr: 0.505 },
    ] }), [], {}, {}, []);
    expect(flex.keep.map((t) => t.title)).toContain('Lane barely matters for you');
  });

  it('says "avoid" only for a losing lane; a weakest lane that still wins is a backup', () => {
    const r = buildReview(profile({ roles: [
      { role: 'offlane', games: 150, rawWr: 0.55, shrunkWr: 0.543 },
      { role: 'support', games: 507, rawWr: 0.501, shrunkWr: 0.507 },
    ] }), [], {}, {}, []);
    const lane = r.fix.find((t) => t.area === 'lanes')!;
    expect(lane.title).toBe('Queue offlane first');
    expect(lane.action).toContain('fine backup');
  });

  it('a lane on form in the last 30 days is never called weakest or "avoid"', () => {
    const row = (date: string, win: boolean): FilmRow => ({ squadName: 'A', role: 'offlane', durationMin: 30, deaths: 3, wardsPlaced: 5, damageToHeroes: 15000, goldEarned: 12000, kp: 0.5, date, win, hero: 'Wukong' });
    const rows = [...Array.from({ length: 9 }, (_, i) => row(`2026-10-${10 + i}`, true)), ...Array.from({ length: 3 }, (_, i) => row(`2026-10-${20 + i}`, false))];
    expect(hotLanes('A', rows, profile())[0]).toMatchObject({ role: 'offlane', games: 12, wins: 9, hero: 'Wukong' });
    const r = buildReview(profile(), [], {}, {}, rows);
    const lane = r.fix.find((t) => t.area === 'lanes')!;
    expect(lane.title).toBe('Queue mid first');
    expect(lane.title).not.toContain('avoid');
    expect(r.keep.map((t) => t.title)).toContain('Your offlane is on form lately');
    // The same run spread over months is outside the 30-day window: no override.
    const old = rows.map((x, i) => ({ ...x, date: `2026-0${1 + (i % 9)}-01` }));
    expect(hotLanes('A', old, profile())).toEqual([]);
  });

  it('judges the fights gap against the squad average gap, not against zero', () => {
    const m = (pw: number, aw: number) => ({ games: 100, deaths: 400, firstToFall: 100, caughtOut: 60, fightsPresent: 400, fightsPresentWon: pw, fightsAbsent: 400, fightsAbsentWon: aw });
    // Everyone's fights go 5 points worse with them in; only E is far beyond that.
    const fights = { A: m(160, 180), B: m(160, 180), C: m(160, 180), D: m(160, 180), E: m(130, 190) };
    expect(buildReview(profile(), [], fights, {}, []).fix.map((t) => t.title)).not.toContain('The team wins fewer fights with you in them');
    const e = buildReview(profile({ player: { ...profile().player, name: 'E' } }), [], fights, {}, []);
    expect(e.fix.map((t) => t.title)).toContain('The team wins fewer fights with you in them');
  });

  it('flags squad-relative habits only for the extreme member with a 15% margin', () => {
    const fights = { ...squad('A', 90), ...squad('B', 60), ...squad('C', 55), ...squad('D', 50), ...squad('E', 45) };
    expect(buildReview(profile(), [], fights, {}, []).fix.map((t) => t.title)).toContain('Getting caught alone the most');
    const close = { ...squad('A', 62), ...squad('B', 60), ...squad('C', 58), ...squad('D', 57), ...squad('E', 56) };
    expect(buildReview(profile(), [], close, {}, []).fix.map((t) => t.title)).not.toContain('Getting caught alone the most');
  });

  it('lobby tips need a real gap against same-role players, and one tip per stat', () => {
    const row = (squadName: string | null, role: string, wards: number): FilmRow =>
      ({ squadName, role, durationMin: 30, deaths: 4, wardsPlaced: wards, damageToHeroes: 15000, goldEarned: 12000, kp: 0.5 });
    const lobby = Array.from({ length: 100 }, (_, i) => row(null, 'midlane', 7 + (i % 3)));
    const low = Array.from({ length: 20 }, (_, i) => row('A', 'midlane', 3 + (i % 2)));
    const tips = lobbyTips('A', [...lobby, ...low]);
    expect(tips.filter((t) => t.title.includes('wards')).length).toBe(1);
    expect(tips[0].kind).toBe('fix');
    // Same numbers as the lobby: no tip.
    const same = Array.from({ length: 20 }, (_, i) => row('A', 'midlane', 7 + (i % 3)));
    expect(lobbyTips('A', [...lobby, ...same])).toEqual([]);
  });
});

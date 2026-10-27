// Game flags: the deterministic "what lost / won it" candidates a review cites.
import { describe, it, expect } from 'vitest';
import { gameFlags, placeOf } from '../src/game-flags.js';

const pl = (pid: string, us: boolean, role: string, extra: any = {}) => ({ pid, us, role, heroName: pid.toUpperCase(), heroSlug: pid, name: pid, kills: 0, deaths: 0, assists: 0, goldEarned: 10000, damageToHeroes: 1000, ...extra });
const kill = (t: number, killerSide: 'us' | 'them', killerPid: string, killedPid: string, x = 0, y = 0) =>
  ({ t, min: Math.round(t / 6) / 10, killerSide, killedSide: killerSide === 'us' ? 'them' : 'us', killerPid, killedPid, killerSlug: killerPid, killedSlug: killedPid, x, y });
const ev = (sec: number, type: string, side: 'us' | 'them', kind: 'tower' | 'objective', lane?: string) => ({ sec, type, side, kind, lane });

const base = () => ({
  result: 'loss', durationMin: 38, ourTeam: 'dawn',
  players: [pl('mid', true, 'midlane', { damageToHeroes: 60000 }), pl('adc', true, 'carry', { deaths: 10, diagnostics: { metrics: [{ key: 'deaths', value: 10, avg: 7, deltaPct: 43, flag: 'bad' }] } }), pl('sup', true, 'support'),
    pl('ecarry', false, 'carry', { goldEarned: 12000 }), pl('ejg', false, 'jungle', { goldEarned: 12000 })],
  kills: [] as any[], events: [] as any[], skirmishes: [] as any[],
});

describe('game flags', () => {
  it('flags enemy inhibitors with no finish, naming lanes and the idle objective', () => {
    const f = base();
    f.events = [ev(1727, 'INHIBITOR', 'us', 'tower', 'offlane'), ev(1770, 'PRIMAL_FANGTOOTH', 'us', 'objective'), ev(2091, 'INNER_TOWER', 'us', 'tower', 'duo'), ev(2268, 'CORE', 'them', 'tower', 'jungle')];
    const g = gameFlags(f).find((x) => x.id === 'no-close')!;
    expect(g.tone).toBe('bad');
    expect(g.evidence.join(' ')).toMatch(/offlane \(28\.8m\)/);
    expect(g.evidence.join(' ')).toMatch(/Primal Fangtooth at 29\.5m: next structure we took came at 34\.9m/);
    f.result = 'win'; expect(gameFlags(f).some((x) => x.id === 'no-close')).toBe(false);
  });

  it('flags a major objective bought with three or more allied deaths', () => {
    const f = base();
    f.events = [ev(2200, 'ORB_PRIME', 'us', 'objective'), ev(2250, 'INHIBITOR', 'them', 'tower', 'mid')];
    f.kills = [kill(2190, 'them', 'ecarry', 'mid'), kill(2200, 'them', 'ecarry', 'adc'), kill(2230, 'them', 'ejg', 'sup')];
    const g = gameFlags(f).find((x) => x.kind === 'objective-for-bodies')!;
    expect(g.summary).toBe('Orb Prime cost 3 allied deaths and 1 structures right after');
    expect(g.id).toBe('objective-for-bodies@36.7'); // ids are display-independent: reviews cite them
    f.kills.pop(); expect(gameFlags(f).some((x) => x.kind === 'objective-for-bodies')).toBe(false);
  });

  it('counts late fights that started down, and needs one lost', () => {
    const f = base();
    const s = (startMin: number, result: string, manAdv: number) => ({ startSec: startMin * 60, startMin, result, ourKills: 1, theirKills: 2, macro: { ourAlive: 5 + Math.min(0, manAdv), theirAlive: 5, manAdv, dead: [] } });
    f.skirmishes = [s(20, 'won', 0), s(25, 'lost', -1), s(30, 'won', -1), s(35, 'won', 0)];
    expect(gameFlags(f).find((x) => x.id === 'fought-down')?.summary).toBe('2 of the last 4 fights started with an ally already dead');
    f.skirmishes[1]!.result = 'won'; expect(gameFlags(f).some((x) => x.id === 'fought-down')).toBe(false);
  });

  it('names a struggling player against their own norm, with the repeat killer', () => {
    const f = base();
    f.kills = [1, 2, 3].map((i) => kill(i * 100, 'them', 'ejg', 'adc'));
    const g = gameFlags(f).find((x) => x.kind === 'struggling-player')!;
    expect(g.pid).toBe('adc');
    expect(g.evidence).toContain('3 of them to EJG.');
  });

  it('flags a kill lead with no gold lead, the closing streak and the standout', () => {
    const f = base();
    for (const p of f.players) if (!p.us) p.goldEarned = 20000;
    f.kills = [...[1, 2, 3, 4].map((i) => kill(i * 60, 'us', 'mid', 'ecarry')), ...[5, 6, 7, 8, 9].map((i) => kill(i * 60, 'them', 'ecarry', 'sup'))];
    const ids = gameFlags(f).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['kills-no-gold', 'closing-collapse', 'standout:mid']));
  });

  // The why lines (2026-10-27): causes the kill stream proves, not restated totals.
  it('explains a jungler who ran the map: never answered, and where our jungler was', () => {
    const f = base();
    f.players.push(pl('jg', true, 'jungle', { goldEarned: 9000 }), pl('emid', false, 'midlane'));
    const ejg = f.players.find((p) => p.pid === 'ejg')!; Object.assign(ejg, { kills: 9, deaths: 1, goldEarned: 16000 });
    f.kills = [kill(100, 'us', 'jg', 'ejg', 11639, -4291), kill(200, 'us', 'jg', 'emid', 2592, -2060), kill(260, 'us', 'jg', 'emid', 2592, -2060),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => kill(300 + i * 90, 'them', 'ejg', i % 3 ? 'adc' : 'mid', 11578, 7204))];
    const g = gameFlags(f).find((x) => x.id === 'jungle-run:them')!;
    expect(g.tone).toBe('bad');
    expect(g.why).toContain('EJG was killed once, last at 1.7m; 9 kills came after that with no death.');
    expect(g.why!.join(' ')).toMatch(/EJG's kills by lane: offlane 9, 9 of them in our half/);
    expect(g.why!.join(' ')).toMatch(/JG's kills went elsewhere: EMID on the mid lane 2 and EJG on the offlane 1/);
    expect(g.why).toContain("None of EJG's 9 kills was answered with a kill on EJG within 45s.");
  });

  it('names who fell first in a collapse and whether it was two fights at once', () => {
    const f = base();
    f.players.push(pl('top', true, 'offlane'), pl('jg', true, 'jungle'));
    f.kills = [kill(1500, 'them', 'ejg', 'jg', 11578, 7204), kill(1510, 'them', 'ejg', 'top', 11578, 7204), kill(1520, 'them', 'ecarry', 'adc', -10052, 6416), kill(1530, 'them', 'ecarry', 'sup', -10052, 6416)];
    f.events = [ev(1580, 'INNER_TOWER', 'them', 'tower', 'offlane'), ev(1600, 'FANGTOOTH', 'them', 'objective')];
    const g = gameFlags(f).find((x) => x.kind === 'collapse')!;
    expect(g.id).toBe('collapse@25.0');
    expect(g.why![0]).toBe('JG (jungle) fell first, to EJG on the offlane in our half; 3 more died in the next 30s.');
    expect(g.why![1]).toMatch(/split across the offlane \(2\) and the duo lane \(2\)/);
    expect(g.why).toContain('Then they took the offlane inner tower and Fangtooth.');
    // One more kill of ours in the window and it is a fight, not a collapse.
    f.kills.push(kill(1515, 'us', 'mid', 'ecarry'), kill(1525, 'us', 'mid', 'ejg'));
    expect(gameFlags(f).some((x) => x.kind === 'collapse')).toBe(false);
  });

  it('flags the ally who went down first before repeated losses', () => {
    const f = base();
    f.kills = [kill(1000, 'them', 'ecarry', 'sup'), kill(1010, 'them', 'ecarry', 'adc'), kill(1600, 'them', 'ejg', 'sup')];
    f.events = [ev(1040, 'OUTER_TOWER', 'them', 'tower', 'duo'), ev(1050, 'FANGTOOTH', 'them', 'objective'), ev(1630, 'INNER_TOWER', 'them', 'tower', 'duo'), ev(1650, 'INHIBITOR', 'them', 'tower', 'duo')];
    const g = gameFlags(f).find((x) => x.kind === 'opened-map')!;
    expect(g.id).toBe('opened-map:sup');
    expect(g.summary).toBe('SUP went down first before 4 of the 4 structures and majors we lost');
    expect(g.evidence[0]).toMatch(/then the duo outer tower \(17\.3m\) and Fangtooth \(17\.5m\)/);
  });

  it('says what a kill lead was spent on and who soaked the kills', () => {
    const f = base();
    for (const p of f.players) if (!p.us) p.goldEarned = 20000;
    f.kills = [1, 2, 3, 4].map((i) => kill(i * 60, 'us', 'mid', 'ecarry'));
    f.events = [ev(400, 'FANGTOOTH', 'them', 'objective')];
    const why = gameFlags(f).find((x) => x.id === 'kills-no-gold')!.why!;
    expect(why[0]).toBe('Ahead on kills from 1.0m to the end and the lead bought no structure or major.');
    expect(why[1]).toBe('4 of our 4 kills were on ECARRY, who still out-earned ADC 20.0k to 10.0k: killing the same player again did not slow their gold.');
    expect(why).toContain('Their kills turned into objectives: 1 Fangtooth, plus 0 of our structures.');
  });

  it('places a struggling player\'s deaths: half, lane, right after their own kill', () => {
    const f = base();
    f.kills = [kill(90, 'us', 'adc', 'ecarry', -10052, 6416), kill(100, 'them', 'ejg', 'adc', -9946, -3459), kill(300, 'us', 'adc', 'ecarry', -9946, -3459), kill(320, 'them', 'ejg', 'adc', -9946, -3459), kill(500, 'them', 'ejg', 'adc', -9946, -3459)];
    const why = gameFlags(f).find((x) => x.id === 'struggling:adc')!.why!;
    expect(why).toEqual(expect.arrayContaining(['3 of 3 deaths came in their half of the map, past the river.', 'All of the 3 deaths to EJG came on the duo lane.',
      '2 deaths came within 45s of a kill of their own: each kill was answered before the lead could be spent.']));
  });

  it('labels places by map geometry from our side', () => {
    expect(placeOf(1615, 14500, 'dawn')).toBe('in our base');
    expect(placeOf(6425, 1143, 'dawn')).toBe('at the Prime pit');
    expect(placeOf(11639, -4291, 'dawn')).toBe('on the offlane in their half');
  });
});

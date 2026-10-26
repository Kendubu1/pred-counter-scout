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

  it('labels places by map geometry from our side', () => {
    expect(placeOf(1615, 14500, 'dawn')).toBe('in our base');
    expect(placeOf(6425, 1143, 'dawn')).toBe('at the Prime pit');
    expect(placeOf(11639, -4291, 'dawn')).toBe('on the offlane in their half');
  });
});

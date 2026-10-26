// Lane geometry + rotation read: a laner's kill on another lane is a rotation,
// answered when it avenges an ally who just died there; leaving lane is
// "expected" only once the enemy outer tower on the home lane is down. The
// absent-from-fight note follows the same rule, and a time cluster whose kills
// sit on opposite sides of the map is two plays, not one fight.

import { describe, it, expect } from 'vitest';
import { laneOfPoint, halfOfPoint } from '../src/map-lanes.js';
import { readRotations } from '../src/rotations.js';
import { skirmishMacro, type SkirmishContext } from '../src/skirmishes.js';
import type { FactKill } from '../src/postgame.js';

const k = (t: number, killerSide: 'us' | 'them', killerPid: string, killedPid: string, x: number, y: number): FactKill => ({
  t, min: Math.round((t / 60) * 10) / 10, firstBlood: false, killerSide, killedSide: killerSide === 'us' ? 'them' : 'us',
  killerSlug: killerPid, killedSlug: killedPid, killerPid, killedPid, x, y,
});
const pl = (pid: string, us: boolean, role: string) => ({ pid, us, role, heroSlug: pid, heroName: pid, name: pid, assists: 0 });
const players = [pl('mid', true, 'midlane'), pl('off', true, 'offlane'), pl('adc', true, 'carry'), pl('sevarog', false, 'offlane'), pl('neon', false, 'midlane')];

describe('map lanes', () => {
  it('places measured tower positions on their lanes', () => {
    expect(laneOfPoint(11578, 7204)).toBe('offlane');     // Dawn offlane outer
    expect(laneOfPoint(-9946, -3459)).toBe('duo');        // Dusk duo outer
    expect(laneOfPoint(2592, -2060)).toBe('mid');         // Dusk mid outer
    expect(laneOfPoint(-5000, 2000)).toBe('jungle');      // between duo and mid
    expect(halfOfPoint(10000)).toBe('dawn');
  });
});

describe('rotation read', () => {
  const kills = [
    k(301, 'them', 'sevarog', 'off', 9888, 8023),         // our offlaner dies on the offlane
    k(323, 'us', 'mid', 'sevarog', 9291, 5295),           // our mid answers 22s later, same lane
    k(1168, 'us', 'mid', 'neon', -12259, -268),           // later: mid kills on the duo lane
  ];
  const events = [
    { sec: 1100, type: 'OUTER_TOWER', side: 'us' as const, kind: 'tower' as const, x: 2592, y: -2060 },     // we open mid
    { sec: 1232, type: 'OUTER_TOWER', side: 'us' as const, kind: 'tower' as const, x: -9946, y: -3459 },    // then the duo outer
  ];
  const r = readRotations({ players, kills, events, skirmishes: [] })!;

  it('credits an off-lane kill that avenges an ally as an answered, proactive rotation', () => {
    const c = r.credits.find((x) => x.min === 5.4)!;
    expect(c).toMatchObject({ pid: 'mid', home: 'mid', at: 'offlane', credit: 'kill', expected: false });
    expect(c.answered).toEqual({ ally: 'off', secAfter: 22 });
  });

  it('marks a rotation expected once the home lane is opened, with its payoff', () => {
    const c = r.credits.find((x) => x.min === 19.5)!;
    expect(c.expected).toBe(true);
    expect(c.payoff.map((p) => p.type)).toEqual(['OUTER_TOWER']);
    expect(r.players.find((p) => p.pid === 'mid')).toMatchObject({ rotationKills: 2, beforeOpen: 1, answered: 1, laneOpenedMin: 18.3 });
  });

  it('does not count a death on the home lane as a rotation', () => {
    expect(r.credits.some((c) => c.pid === 'off')).toBe(false);
  });
});

describe('absent read is lane-aware', () => {
  const ctx = (towers: SkirmishContext['towers']): SkirmishContext => ({
    ourPlayers: [{ pid: 'mid', name: 'Mid', heroSlug: 'mid', role: 'midlane' }, { pid: 'adc', name: 'Adc', heroSlug: 'adc', role: 'carry' }, { pid: 'off', name: 'Off', heroSlug: 'off', role: 'offlane' }],
    enemyPids: ['sevarog', 'neon'], lanes: [], towers,
  });
  // a lost 0-2 on the offlane, mid never credited
  const lost = [k(600, 'them', 'sevarog', 'off', 11000, 3000), k(605, 'them', 'neon', 'adc', 11200, 2500)];
  const s = { startSec: 600, endSec: 605, startMin: 10, ourKills: 0, theirKills: 2, net: -2, result: 'lost' as const };

  it('reads a laner holding an unopened lane as the expected play', () => {
    const m = skirmishMacro(s, lost, ctx([{ sec: 2000, type: 'OUTER_TOWER', side: 'us', lane: 'duo' }]));
    expect(m.notes.join(' ')).toMatch(/Mid \(midlane\) was holding the mid lane with both outer towers standing/);
    expect(m.notes.join(' ')).not.toMatch(/never joined/);
  });

  it('reads an open lane as a rotation window', () => {
    const m = skirmishMacro(s, lost, ctx([{ sec: 500, type: 'OUTER_TOWER', side: 'us', lane: 'mid' }]));
    expect(m.notes.join(' ')).toMatch(/Mid \(midlane\) had an open lane .*window to rotate/);
  });

  it('splits kills on opposite sides of the map and drops absence notes', () => {
    const far = [k(824, 'them', 'neon', 'adc', -10831, -360), k(834, 'them', 'sevarog', 'off', 10971, 7502)];
    const m = skirmishMacro({ ...s, startSec: 824, endSec: 834, startMin: 13.7 }, far, ctx([]));
    expect(m.split).toBe(true);
    expect(m.notes[0]).toMatch(/two separate plays, not one fight, so nobody could have been at both/);
    expect(m.notes.join(' ')).not.toMatch(/never joined|expected play/);
  });
});

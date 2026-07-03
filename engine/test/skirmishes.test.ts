// Skirmish detection: cluster a synthetic kill stream into fights and verify the
// two classifications the coach leads with — game-defining teamfights and the
// dumb losing battles — plus won/lost and objective anchoring.

import { describe, it, expect } from 'vitest';
import { detectSkirmishes, keySkirmishes, type ObjEvent, type SkirmishContext } from '../src/skirmishes.js';
import type { FactKill } from '../src/postgame.js';

const kill = (t: number, killerSide: 'us' | 'them', killerSlug: string, killedSlug: string): FactKill => ({
  t, min: Math.round((t / 60) * 10) / 10, firstBlood: false,
  killerSide, killedSide: killerSide === 'us' ? 'them' : 'us',
  killerSlug, killedSlug, killerPid: null, killedPid: null, x: null, y: null,
});

describe('skirmish detection', () => {
  // A lost early scrap with nothing on the line, a lone pick, and a late teamfight
  // we win that takes Prime.
  const kills: FactKill[] = [
    // 8:00 — we lose a 0-for-3 with no objective up (the dumb battle)
    kill(480, 'them', 'grux', 'sparrow'), kill(486, 'them', 'grux', 'feng-mao'), kill(495, 'them', 'murdock', 'phase'),
    // 10:00 — a lone pick (single kill -> not a skirmish)
    kill(600, 'us', 'sparrow', 'murdock'),
    // 18:00 — a 4-for-1 teamfight, then Prime falls to us
    kill(1080, 'us', 'sparrow', 'grux'), kill(1085, 'us', 'feng-mao', 'murdock'),
    kill(1090, 'us', 'sparrow', 'countess'), kill(1096, 'us', 'phase', 'narbash'),
    kill(1101, 'them', 'countess', 'sparrow'),
  ];
  const objEvents: ObjEvent[] = [{ sec: 1110, type: 'PRIME_GUARDIAN', side: 'us', kind: 'objective' }];

  const sk = detectSkirmishes(kills, objEvents, 30);

  it('clusters kills into fights, dropping lone picks', () => {
    expect(sk.length).toBe(2);                 // the lone 10:00 pick is excluded
    expect(sk[0]!.startSec).toBe(480);
    expect(sk[1]!.startSec).toBe(1080);
  });

  it('scores each fight from our side (won/lost/net)', () => {
    expect(sk[0]!.result).toBe('lost');
    expect(sk[0]!.net).toBe(-3);
    expect(sk[1]!.result).toBe('won');
    expect(sk[1]!.net).toBe(3);                // 4 ours - 1 theirs
    expect(sk[1]!.size).toBe(5);
    expect(sk[1]!.kind).toBe('teamfight');
  });

  it('flags the dumb losing battle as a bad trade (lost, nothing on the line)', () => {
    expect(sk[0]!.tag).toBe('bad-trade');
    expect(sk[0]!.nearObjective).toBeNull();
    expect(sk[0]!.place).toBe('open map');
  });

  it('flags the late teamfight as game-defining and anchors it to Prime', () => {
    expect(sk[1]!.tag).toBe('game-defining');
    expect(sk[1]!.nearObjective).toEqual({ type: 'PRIME_GUARDIAN', side: 'us', kind: 'objective' });
    expect(sk[1]!.place).toContain('our');
  });

  it('surfaces both tagged fights, the game-defining one most significant', () => {
    const key = keySkirmishes(sk);
    expect(key.length).toBe(2);
    expect(key[0]!.tag).toBe('game-defining');   // highest significance leads
  });
});

// Macro read: the part that's about the GAME, not the hero matchup. A teamfight we
// lose a body down — the jungler was ganked 29s earlier (still respawning) and the
// mid was alive, ahead in lane, and never rotated — while we trade Fangtooth.
describe('skirmish macro (rotations / numbers / trades)', () => {
  const killP = (t: number, ks: 'us' | 'them', killerSlug: string, killedSlug: string, killerPid: string, killedPid: string): FactKill => ({
    t, min: Math.round((t / 60) * 10) / 10, firstBlood: false,
    killerSide: ks, killedSide: ks === 'us' ? 'them' : 'us',
    killerSlug, killedSlug, killerPid, killedPid, x: null, y: null,
  });
  const kills: FactKill[] = [
    killP(1046, 'them', 'grux', 'khaimera', 'e1', 'u4'),   // jungle ganked 29s before — its own (dropped) cluster
    killP(1075, 'them', 'grux', 'sparrow', 'e2', 'u1'),    // the 1-for-3 teamfight begins
    killP(1081, 'us', 'greystone', 'grux', 'u5', 'e3'),
    killP(1087, 'them', 'grux', 'narbash', 'e2', 'u2'),
    killP(1093, 'them', 'kira', 'greystone', 'e4', 'u5'),
  ];
  const ctx: SkirmishContext = {
    ourPlayers: [
      { pid: 'u1', name: 'Sparrow', heroSlug: 'sparrow', role: 'carry' },
      { pid: 'u2', name: 'Narbash', heroSlug: 'narbash', role: 'support' },
      { pid: 'u3', name: 'Gideon', heroSlug: 'gideon', role: 'midlane' },   // alive, never in the fight
      { pid: 'u4', name: 'Khaimera', heroSlug: 'khaimera', role: 'jungle' }, // dead at the engage
      { pid: 'u5', name: 'Greystone', heroSlug: 'greystone', role: 'offlane' },
    ],
    enemyPids: ['e1', 'e2', 'e3', 'e4', 'e5'],
    lanes: [{ role: 'midlane', verdict: 'yyyyyy' }, { role: 'carry', verdict: 'eeeeee' }],
    majors: [{ minute: 18, type: 'FANGTOOTH', side: 'us' }],
  };
  const sk = detectSkirmishes(kills, [], 30, ctx);

  it('drops the lone gank but reads it as a respawning teammate', () => {
    expect(sk.length).toBe(1);                       // the isolated jungle death isn't a fight
    const m = sk[0]!.macro!;
    expect(m.dead).toHaveLength(1);
    expect(m.dead[0]!.role).toBe('jungle');
    expect(m.dead[0]!.agoSec).toBe(29);
  });

  it('counts the bodies standing at the engage', () => {
    const m = sk[0]!.macro!;
    expect(m.ourAlive).toBe(4);                      // jungler still down
    expect(m.theirAlive).toBe(5);
    expect(m.manAdv).toBe(-1);
    expect(m.outnumbered).toBe(true);
  });

  it('flags the alive, ahead-in-lane teammate who never rotated', () => {
    const m = sk[0]!.macro!;
    const mid = m.absent.find((a) => a.role === 'midlane');
    expect(mid).toBeTruthy();
    expect(mid!.lane).toBe('winning');
    expect(m.absent.some((a) => a.role === 'jungle')).toBe(false);   // the dead jungler isn't "absent"
  });

  it('writes game-level notes: numbers, the dead body, the missed rotation, the trade', () => {
    const notes = sk[0]!.macro!.notes.join(' | ');
    expect(notes).toContain('4v5');
    expect(notes.toLowerCase()).toContain('dead');
    expect(notes.toLowerCase()).toContain('lane');
    expect(notes).toContain('Fangtooth');
  });

  it('omits macro when no squad context is supplied (backfill-safe)', () => {
    const bare = detectSkirmishes(kills, [], 30);
    expect(bare[0]!.macro).toBeUndefined();
  });
});

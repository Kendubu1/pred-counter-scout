import { describe, it, expect } from 'vitest';
import { classifySpan, kitOfAbility } from '../src/kit-index.js';
import { itemAnswer, readKit, type FilmPlayer, type KitHeroLite } from '../src/kit-read.js';

describe('kit index parser', () => {
  it('classifies CC spans and skips durations and self effects', () => {
    expect(classifySpan('Stuns')).toEqual({ hard: 'stun' });
    expect(classifySpan('Knocks Up')).toEqual({ hard: 'knockup' });
    expect(classifySpan('Slows')).toEqual({ soft: 'slow' });
    expect(classifySpan('{StunDuration}s')).toBeNull();
    expect(classifySpan('Unstoppable')).toBeNull();
    expect(classifySpan('Wobbles')).toBe('unknown');
  });
  it('reads one ability: CC, top-rank duration, mobility and unstoppable', () => {
    const k = kitOfAbility({ key: 'Q', display_name: 'Bull Rush', game_description: 'Charge forward. Become <EffectText>Unstoppable</EffectText>. <CC_Text>Stuns</CC_Text> for <CC_Text>{StunDuration}s</CC_Text>.', menu_description: 'Charge forward Stunning them for 0.5/0.75/1s.' }, new Set());
    expect(k).toMatchObject({ hard: ['stun'], hardSec: 1, unstoppable: true, mobility: ['dash'] });
  });
});

const P = (pid: string, us: boolean, heroSlug: string, k = 0, d = 0, extra: Partial<FilmPlayer> = {}): FilmPlayer =>
  ({ pid, us, heroSlug, heroName: heroSlug.toUpperCase(), role: 'carry', kills: k, deaths: d, assists: 0, damageToHeroes: 1000, ...extra });
const A = (name: string, o: Partial<KitHeroLite['abilities'][number]> = {}) => ({ key: name, name, hard: [], mobility: [], unstoppable: false, stealth: false, heal: false, shield: false, hardSec: null, ...o });
const H = (abilities: KitHeroLite['abilities']): KitHeroLite => ({ name: 'x', abilities, hardCount: abilities.filter((a) => a.hard.length).length, unstoppable: false, stealth: false, sustain: false });

describe('kit read', () => {
  const kit: Record<string, KitHeroLite> = {
    a: H([]), b: H([]), c: H([]), d: H([]), e: H([]),
    s: H([A('Snipe', { hard: ['stun'], hardSec: 1 }), A('Drain', { heal: true })]), t: H([A('Grab', { hard: ['pull'] }), A('Slam', { hard: ['stun', 'knockup'], hardSec: 1.5 }), A('Wall', { hard: ['root'] }), A('Bash', { hard: ['stun'] })]),
    u: H([]), v: H([]), w: H([]),
  };
  const meta = new Map<string, any>([['a', { power: 'physical', cls: 'MARKSMAN' }], ['s', { power: 'physical', cls: 'MARKSMAN' }]]);
  const players = [P('1', true, 'a', 1, 6), P('2', true, 'b'), P('3', true, 'c'), P('4', true, 'd'), P('5', true, 'e'),
    P('6', false, 's', 9, 1, { damageToHeroes: 9000 }), P('7', false, 't', 2), P('8', false, 'u'), P('9', false, 'v'), P('10', false, 'w')];
  const kills = [...Array.from({ length: 5 }, () => ({ killerPid: '6', killedPid: '1' })), { killerPid: '7', killedPid: '1' }, ...Array.from({ length: 4 }, () => ({ killerPid: '6', killedPid: '2' }))];
  const r = readKit(players, kills, kit, { s: { playAgainst: 'Dodge Snipe.' } }, meta)!;
  it('counts hard-CC abilities per side and calls a gap of three or more', () => {
    expect(r.cc.them).toHaveLength(5);
    expect(r.cc.us).toHaveLength(0);
    expect(r.cc.note).toContain('They brought 5 hard-CC abilities to our 0');
  });
  it('finds the threat with victims, kit lines and an anti-heal answer for a self-healer', () => {
    expect(r.threat).toMatchObject({ hero: 'S', kda: '9/1/0', topDamage: true, victims: [{ hero: 'A', count: 5 }, { hero: 'B', count: 4 }], playAgainst: 'Dodge Snipe.' });
    expect(r.threat!.answers.join(' ')).toContain('Anti-heal');
  });
  it("flags a nemesis at 3+ deaths and 40% of that player's deaths", () => {
    expect(r.nemeses.map((n) => [n.hero, n.byHero, n.byCount])).toEqual([['A', 'S', 5], ['B', 'S', 4]]);
    expect(r.nemeses[0]!.answer).toBe('Anti-heal: Tainted Rounds.');
  });
  it("names item answers by the player's own damage type and role", () => {
    expect(itemAnswer('tenacity', { power: 'magical', cls: 'MAGE' })).toBe('World Breaker');
    expect(itemAnswer('antiheal', { power: 'physical', cls: 'TANK' })).toBe('Tainted Guard or Tainted Bastion');
  });
});

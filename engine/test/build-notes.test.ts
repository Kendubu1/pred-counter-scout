import { describe, it, expect } from 'vitest';
import { buildNotes } from '../src/build-notes.js';

const P = (pid: string, us: boolean, heroSlug: string, role: string, items: string[] = []) => ({ pid, us, heroSlug, heroName: heroSlug.toUpperCase(), role, items: items.map((slug) => ({ slug, name: slug })) });
describe('build notes', () => {
  const players = [P('1', true, 'a', 'carry', ['tainted-rounds']), P('2', true, 'b', 'offlane'), P('3', true, 'c', 'midlane'), P('4', true, 'd', 'jungle'), P('5', true, 'e', 'support'),
    P('6', false, 'x', 'carry'), P('7', false, 'h1', 'offlane'), P('8', false, 'h2', 'midlane'), P('9', false, 'h3', 'jungle'), P('10', false, 'z', 'support')];
  const heal = { abilities: [{ heal: true }] }, none = { abilities: [{ heal: false }] };
  const kit: any = { a: none, b: none, c: none, d: none, e: none, x: none, h1: heal, h2: heal, h3: heal, z: none };
  const items = new Map<string, any>([['tainted-rounds', { slug: 'tainted-rounds', name: 'Tainted Rounds', stats: {} }], ['vanguardian', { slug: 'vanguardian', name: 'Vanguardian', stats: { tenacity: 25 } }], ['ward', { slug: 'ward', name: 'Ward', stats: { physical_armor: 30 } }]]);
  const meta = new Map<string, any>([['a', { power: 'physical', cls: 'MARKSMAN' }], ['x', { power: 'physical', cls: 'MARKSMAN' }]]);
  const kitRead: any = { cc: { us: [], them: [] }, threat: null, nemeses: [{ pid: '1', bySlug: 'x', byHero: 'X', byCount: 4, deaths: 6, enemyCc: [] }] };
  const bm = { 'a|carry': { all: { n: 100, i: { ward: 10 } }, lane: { x: { n: 40, i: { ward: 20 } } } } };
  const links = { a: { carry: { ward: { n: 200, w: 110 } } } };
  const pairs = { 'a|x': { n: 120, shrunkWr: 47.5 } };
  const notes = buildNotes(players, kitRead, kit, items, meta, pairs, bm, links);
  const a = notes.find((n) => n.pid === '1')!;
  it('reads the lane record and what the field buys more into that opponent', () => {
    expect(a.lane).toEqual({ opp: 'X', oppSlug: 'x', wr: 47.5, n: 120 });
    expect(a.adapt).toEqual([{ slug: 'ward', name: 'Ward', into: 50, usual: 10, wr: 55, n: 200, has: false, vs: 'X' }]);
  });
  it('lists anti-heal against 3+ healing kits and armor against the nemesis, with what was built', () => {
    expect(a.needs).toEqual([
      { why: '3 enemy kits heal themselves (H1, H2, H3)', answer: 'anti-heal (Tainted Rounds)', has: true },
      { why: 'X kept killing A', answer: 'physical armor', has: false },
    ]);
  });
});

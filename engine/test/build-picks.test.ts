import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBuild, readPick, type PickCell } from '../src/build-picks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lane: PickCell = {
  games: 4000, wins: 2000,
  augments: [{ id: '1', name: 'Alpha', n: 2600, w: 1352 }, { id: '2', name: 'Beta', n: 1400, w: 648 }], // 52% vs 46.3%
  eternals: [{ name: 'Vesh', n: 4000, w: 2000 }], crests: [],
};

describe('picks by build', () => {
  it('never lets a handful of games lead: a 7-game 71% stays behind the pick the lane backs', () => {
    const build: PickCell = { games: 120, wins: 66, augments: [{ id: '1', name: 'Alpha', n: 113, w: 61 }, { id: '2', name: 'Beta', n: 7, w: 5 }], eternals: [], crests: [] };
    const r = readPick(lane, build, 'augments');
    expect(r.rows[0]!.name).toBe('Alpha');
    expect(r.changes).toBe(false);
    expect(r.rows.find((x) => x.name === 'Beta')!.few).toBe(true);
  });
  it('flags a pick that changes with the build only on a clear edge', () => {
    // On this build Beta is the one that wins, by a wide margin and with the games to show it.
    const build: PickCell = { games: 1200, wins: 640, augments: [{ id: '1', name: 'Alpha', n: 500, w: 215 }, { id: '2', name: 'Beta', n: 700, w: 425 }], eternals: [], crests: [] };
    const r = readPick(lane, build, 'augments');
    expect(r).toMatchObject({ label: 'Best', laneLead: 'Alpha', changes: true });
    expect(r.rows[0]!.name).toBe('Beta');
    // same lead as the lane: no flag however sure
    const same: PickCell = { games: 1200, wins: 640, augments: [{ id: '1', name: 'Alpha', n: 700, w: 425 }, { id: '2', name: 'Beta', n: 500, w: 215 }], eternals: [], crests: [] };
    expect(readPick(lane, same, 'augments').changes).toBe(false);
  });
  it('says which pick a build pairs with from what its players run, separately from who wins', () => {
    // The lane mostly runs Alpha (65%). Four in five players on this build run Beta, and neither wins more here.
    const build: PickCell = { games: 300, wins: 150, augments: [{ id: '1', name: 'Alpha', n: 60, w: 30 }, { id: '2', name: 'Beta', n: 240, w: 120 }], eternals: [], crests: [] };
    const r = readPick(lane, build, 'augments');
    expect(r).toMatchObject({ mostRun: { name: 'Beta', pct: 80 }, laneMostRun: 'Alpha', pairs: true, changes: false });
    // same most-run as the lane: nothing to say
    const usual: PickCell = { games: 300, wins: 150, augments: [{ id: '1', name: 'Alpha', n: 240, w: 120 }, { id: '2', name: 'Beta', n: 60, w: 30 }], eternals: [], crests: [] };
    expect(readPick(lane, usual, 'augments').pairs).toBe(false);
  });
  it('says most played when one option has the games, and lists later items by slot', () => {
    const build: PickCell = { games: 100, wins: 50, augments: [], eternals: [{ name: 'Vesh', n: 100, w: 50 }], crests: [] };
    const b = readBuild(['a', 'b', 'c'], lane, { cell: build, slots: [{ d: 60, e: 20 }, { e: 25, f: 5 }, { g: 3 }], reach: [80, 30, 3] });
    expect(b.eternals.label).toBe('Most played');
    expect(b.next.map((n) => n.slot)).toEqual([4, 5]); // three players at item 6 is not a read
    expect(b.next[0]!.top).toEqual([{ item: 'd', pct: 75 }, { item: 'e', pct: 25 }]);
  });
  const idx = path.join(ROOT, 'data/artifacts/build-picks/index.json');
  it.skipIf(!existsSync(idx))('committed artifact: every build has the games, and clear changes are the exception', () => {
    const i = JSON.parse(readFileSync(idx, 'utf8'));
    expect(i.builds).toBeGreaterThan(0);
    expect(i.picksChanging / (i.builds * 3)).toBeLessThan(0.1);
    const hero = Object.keys(i.heroes)[0]!;
    const a = JSON.parse(readFileSync(path.join(ROOT, `data/artifacts/build-picks/${hero}.json`), 'utf8'));
    for (const rd of Object.values<any>(a.roles)) for (const b of rd.builds) { expect(b.n).toBeGreaterThanOrEqual(i.minBuild); expect(b.core).toHaveLength(3); expect(typeof b.ordered).toBe('boolean'); }
  });
  const lo = path.join(ROOT, 'data/artifacts/loadouts/index.json');
  it.skipIf(!existsSync(lo))('committed loadouts: augments in the lane order, each with its own Eternal, crest and ordered build', () => {
    const i = JSON.parse(readFileSync(lo, 'utf8'));
    expect(i.augments).toBeGreaterThan(100);
    const hero = Object.keys(i.heroes)[0]!;
    const a = JSON.parse(readFileSync(path.join(ROOT, `data/artifacts/loadouts/${hero}.json`), 'utf8'));
    for (const rd of Object.values<any>(a.roles)) {
      expect(rd.augments.length).toBeGreaterThan(0);
      for (const g of rd.augments) {
        expect(g.n).toBeGreaterThanOrEqual(i.minAugment);
        for (const k of ['eternals', 'crests', 'builds']) expect(['Best', 'Leans', 'Toss-up', 'Most played', 'By games']).toContain(g[k].label);
        for (const r of g.builds.rows) expect(r.name.split('>')).toHaveLength(3);
      }
      if (rd.plat) {
        expect(rd.plat.games).toBeGreaterThanOrEqual(i.minPlatLane);
        expect(rd.plat.games).toBeLessThanOrEqual(rd.games);
        for (const g of rd.plat.augments) { expect(g.n).toBeGreaterThanOrEqual(i.minPlatAugment); expect(g.eternals.changes).toBe(false); }
      }
    }
  });
});

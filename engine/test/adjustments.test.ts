import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BARS, COMP_LABELS, bandCell, countPlayer, emptyHeroRole, needsVs, readHeroRole, readMatchup, shifts, coreStrata, lateStrata, countTiming, readTiming, type TimingCells } from '../src/adjustments.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('adjustments counting', () => {
  it('splits a build into core (1-3) and late (4-6) with purchase positions', () => {
    const c = bandCell();
    countPlayer(c, ['a', 'b', 'c', 'd', 'e'], true);
    countPlayer(c, ['a', 'b'], false);          // no core: not counted
    countPlayer(c, ['a', 'x', 'c'], false);     // core only
    expect(c.core).toMatchObject({ n: 2, i: { a: 2, b: 1, c: 2, x: 1 } });
    expect(c.core.ps.c).toBe(6);
    expect(Object.keys(c.late)).toEqual(['5']);
    expect(c.late['5']).toMatchObject({ n: 1, i: { d: 1, e: 1 }, ps: { d: 4, e: 5 } });
    expect(c.plat.core.n).toBe(1);
  });
  it('caps the late layer at six items', () => {
    const c = bandCell();
    countPlayer(c, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], false);
    expect(c.late['6']!.i).toEqual({ d: 1, e: 1, f: 1 });
  });
});

describe('adjustments shifts', () => {
  const build = (n: number, core: string[], late: string[] = []) => Array.from({ length: n }, () => [...core, ...late]);
  it('finds a core item bought far more into one opponent, and its typical slot', () => {
    const hr = emptyHeroRole();
    const play = (items: string[], opp: string) => { countPlayer(hr.all, items, false); countPlayer((hr.lane[opp] ??= bandCell()), items, false); };
    for (const b of build(900, ['a', 'b', 'c'])) play(b, 'other');
    for (const b of build(100, ['a', 'heal', 'c'])) play(b, 'other');
    for (const b of build(60, ['a', 'heal', 'c'])) play(b, 'healer');
    for (const b of build(40, ['a', 'b', 'c'])) play(b, 'healer');
    const { read } = readMatchup(hr.all, hr.lane.healer!);
    expect(read.core.rises.map((r) => r.item)).toEqual(['heal']);
    expect(read.core.rises[0]).toMatchObject({ per100: 60, usual100: 10, pos: 2, platAgrees: null });
    expect(read.core.drops.map((r) => r.item)).toEqual(['b']);
    expect(readHeroRole(hr).lane.other).toBeDefined(); // a matchup with players but no shown row is still listed
  });
  it('compares late items within the same build length, so longer games are not read as a matchup', () => {
    const hr = emptyHeroRole();
    const play = (items: string[], opp: string) => { countPlayer(hr.all, items, false); countPlayer((hr.lane[opp] ??= bandCell()), items, false); };
    // "late" is bought 6th by everyone who gets there. The long matchup just reaches six items more often.
    for (const b of build(800, ['a', 'b', 'c'], ['d'])) play(b, 'short');
    for (const b of build(200, ['a', 'b', 'c'], ['d', 'e', 'late'])) play(b, 'short');
    for (const b of build(40, ['a', 'b', 'c'], ['d'])) play(b, 'long');
    for (const b of build(160, ['a', 'b', 'c'], ['d', 'e', 'late'])) play(b, 'long');
    const rows = shifts(lateStrata(hr.all, hr.lane.long!), 30, 10);
    expect(rows.every((r) => Math.abs(r.z) < 1e-9 || r.item === 'd')).toBe(true);
    expect(readMatchup(hr.all, hr.lane.long!).read.late.rises).toEqual([]);
    expect(shifts(coreStrata(hr.all, hr.lane.long!), 30, 10).every((r) => r.per100 === 100)).toBe(true);
  });
  it('holds back a matchup under the player floor', () => {
    const hr = emptyHeroRole();
    for (let k = 0; k < 500; k++) countPlayer(hr.all, ['a', 'b', 'c'], false);
    hr.lane.thin = bandCell();
    for (let k = 0; k < BARS.minN - 1; k++) { countPlayer(hr.all, ['a', 'b', 'z'], false); countPlayer(hr.lane.thin, ['a', 'b', 'z'], false); }
    expect(readHeroRole(hr).lane.thin).toBeUndefined();
  });
});

describe('answer timing', () => {
  it('reads each slot among players who bought a k-th item and had no answer yet', () => {
    const t: TimingCells = new Map();
    const ans = (s: string) => s === 'heal';
    // needy: 600 short games (2 items, no answer), 600 that buy the answer 4th
    for (let k = 0; k < 600; k++) countTiming(t, 'h|r', ['a', 'b'], ans, true);
    for (let k = 0; k < 600; k++) countTiming(t, 'h|r', ['a', 'b', 'c', 'heal', 'e'], ans, true);
    // not needy: 900 never buy it, 100 buy it 4th
    for (let k = 0; k < 900; k++) countTiming(t, 'h|r', ['a', 'b', 'c', 'd', 'e'], ans, false);
    for (let k = 0; k < 100; k++) countTiming(t, 'h|r', ['a', 'b', 'c', 'heal', 'e'], ans, false);
    const r = readTiming(t);
    // the 600 games that ended after two items are not in slot 4 at all: 600 of 600 bought it there
    expect(r.find((x) => x.slot === 4)).toMatchObject({ needy100: 100, other100: 10 });
    expect(r.find((x) => x.slot === 2)).toMatchObject({ needy100: 0, other100: 0, n: 1200 });
    // after buying it, a player leaves the pool: slot 5 holds nobody needy, so it is not reported
    expect(r.find((x) => x.slot === 5)).toBeUndefined();
  });
});

describe('enemy kit needs and team shapes', () => {
  it('reads what a kit asks for from kit facts only', () => {
    const n = needsVs({ name: 'Khaimera', power: 'physical', cls: 'BRUISER', heals: true, shields: false, hardCc: 1, diver: true });
    expect(n.map((x) => x.answer)).toEqual(['healing', 'physical', 'burst']);
    expect(n[0]!.why).toBe('Khaimera heals from the kit');
  });
  it('labels a team shape by counts', () => {
    const t = { tanks: 2, frontline: 3, magical: 1, physical: 4, healers: 0, hardCc: 4, divers: 0 };
    expect(COMP_LABELS.filter((l) => l.test(t)).map((l) => l.key)).toEqual(['tanks', 'frontline', 'physical']);
  });
});

describe('committed adjustments artifact', () => {
  const idxPath = path.join(ROOT, 'data/artifacts/adjustments/index.json');
  it.skipIf(!existsSync(idxPath))('clears the luck floor: the core list is at most a fifth the size shuffled matchups make', () => {
    const idx = JSON.parse(readFileSync(idxPath, 'utf8'));
    expect(idx.shown.core).toBeGreaterThan(0);
    expect(idx.shownUnderShuffle.core / idx.shown.core).toBeLessThanOrEqual(0.2);
    const items = JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/item-tags.json'), 'utf8')).items;
    for (const hero of Object.keys(idx.heroes).slice(0, 8)) {
      const a = JSON.parse(readFileSync(path.join(ROOT, `data/artifacts/adjustments/${hero}.json`), 'utf8'));
      for (const rd of Object.values<any>(a.roles)) for (const p of rd.pool) expect(items[p.item], `${p.item} has a tag row`).toBeDefined();
    }
  });
});

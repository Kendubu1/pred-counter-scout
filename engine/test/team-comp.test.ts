import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildReport, heroClass, tagHero, teamTraits, type HeroTags, type Side } from '../src/team-comp.js';
import { TeamCompWriter, addCoverage, isoEnd, readRows, toRow, type Coverage } from '../src/ingest/team-comps.js';

describe('team-comp hero tags', () => {
  it('picks one class bucket in priority order', () => {
    expect(heroClass(['Support', 'Warden'])).toBe('TANK');
    expect(heroClass(['Fighter', 'Assassin'])).toBe('BRUISER');
    expect(heroClass(['Assassin'])).toBe('ASSASSIN');
    expect(heroClass(['Enchanter'])).toBe('SUPPORT');
  });
  it('reads engage and dive from the kit profile, falling back to class', () => {
    expect(tagHero({ slug: 'boris', classes: ['Fighter'] }, { archetype: 'engage jungle tank (pick)', dive: 'high' })).toMatchObject({ engage: true, diver: true, frontline: true });
    expect(tagHero({ slug: 'gideon', classes: ['Mage'] }, { archetype: 'burst control mage', dive: 'low' })).toMatchObject({ engage: false, diver: false });
    expect(tagHero({ slug: 'aurora', classes: ['Tank'] }, { archetype: 'control tank/mage (CC)', dive: 'med' }).engage).toBe(true);
    expect(tagHero({ slug: 'kaelen', classes: ['Tank'] })).toMatchObject({ engage: true, diver: false });
    expect(tagHero({ slug: 'x', classes: ['Assassin'] })).toMatchObject({ engage: false, diver: true });
  });
});

const T = (o: Partial<HeroTags>): HeroTags => ({ cls: 'MAGE', frontline: false, engage: false, diver: false, enchanter: false, ...o });

describe('team traits and report', () => {
  const tags = new Map<string, HeroTags>([
    ['tank', T({ cls: 'TANK', frontline: true, engage: true })],
    ['bru', T({ cls: 'BRUISER', frontline: true, diver: true })],
    ['asn', T({ cls: 'ASSASSIN', diver: true })],
    ['mage', T({})], ['adc', T({ cls: 'MARKSMAN' })], ['ench', T({ cls: 'SUPPORT', enchanter: true })],
  ]);
  it('labels styles in order dive > brawl > engage-peel > mixed', () => {
    expect(teamTraits(['bru', 'asn', 'asn', 'mage', 'adc'], tags)!.style).toBe('dive');
    expect(teamTraits(['tank', 'tank', 'bru', 'mage', 'adc'], tags)!.style).toBe('brawl');
    expect(teamTraits(['tank', 'tank', 'mage', 'adc', 'ench'], tags)!.style).toBe('engage-peel');
    expect(teamTraits(['tank', 'mage', 'mage', 'adc', 'ench'], tags)!.style).toBe('mixed');
    expect(teamTraits(['nope', 'mage', 'mage', 'adc', 'ench'], tags)).toBeNull();
  });
  it('counts win rates by tag count, enemy difference and style', () => {
    const a = teamTraits(['tank', 'tank', 'bru', 'mage', 'adc'], tags)!;
    const b = teamTraits(['bru', 'asn', 'asn', 'mage', 'adc'], tags)!;
    const sides: Side[] = [];
    for (let i = 0; i < 40; i++) {
      const aWon = i < 30;
      sides.push({ matchId: `m${i}`, win: aWon, traits: a, enemy: b, heroes: [{ hero: 'adc', role: 'carry' }, { hero: 'ench', role: 'support' }], plat: false });
      sides.push({ matchId: `m${i}`, win: !aWon, traits: b, enemy: a, heroes: [], plat: false });
    }
    const r = buildReport(sides, 30, 40);
    expect(r.matches).toBe(40);
    expect(r.byCount.frontline!['3']).toMatchObject({ n: 40, w: 30, wr: 75 });
    expect(r.byDiff.frontline!['+2']).toMatchObject({ n: 40, wr: 75 });
    expect(r.byDiff.frontline!['-2']).toMatchObject({ n: 40, wr: 25 });
    expect(r.styleVsStyle.brawl!.dive).toMatchObject({ wr: 75 });
    expect(r.pairs['carry+support']![0]).toMatchObject({ key: 'adc+ench', rate: { n: 40, w: 30 } });
  });
});

describe('team-comp rows', () => {
  it('builds a row per match and rejects anything but two teams', () => {
    const row = toRow({ id: 'a', end: '2026-11-05 14:20:53', dur: 1500, winningTeam: 1 }, [
      { hero: 'grux', role: 'offlane', team: '0', tier: 3 }, { hero: 'steel', role: 'support', team: '1', tier: null },
    ]);
    expect(row).toMatchObject({ win: 1, teams: [[['grux', 'offlane', 3]], [['steel', 'support', null]]] });
    expect(toRow({ id: 'b', end: 'x', dur: 1, winningTeam: 2 }, [{ hero: 'a', role: 'carry', team: '0', tier: null }])).toBeNull();
    expect(isoEnd('2026-11-05 14:20:53')).toBe('2026-11-05T14:20:53Z');
  });
  it('files rows by end day and never writes a match twice', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tc-'));
    const row = toRow({ id: 'a', end: '2026-11-05 23:59:59', dur: 1, winningTeam: 0 }, [
      { hero: 'x', role: 'carry', team: 0, tier: null }, { hero: 'y', role: 'carry', team: 1, tier: null },
    ])!;
    const w1 = new TeamCompWriter(dir);
    expect(w1.add(row)).toBe(true); expect(w1.add(row)).toBe(false); w1.flush();
    const w2 = new TeamCompWriter(dir);
    expect(w2.add(row)).toBe(false); w2.flush();
    expect(readFileSync(path.join(dir, '2026-11-05.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1);
    expect(readRows(dir)[0]!.end).toBe('2026-11-05T23:59:59Z');
  });
  it('extends a contiguous daily coverage stretch, keeps samples separate', () => {
    const c: Coverage = { format: 'v1', patch: '1', patchReleasedAt: 'x', note: '', segments: [] };
    addCoverage(c, { from: 'A', to: 'B', via: 'daily', matches: 2, requests: 1 });
    addCoverage(c, { from: 'B', to: 'C', via: 'daily', matches: 3, requests: 1 });
    addCoverage(c, { from: 'C', to: 'D', via: 'sample', matches: 1 });
    expect(c.segments).toEqual([{ from: 'A', to: 'C', via: 'daily', matches: 5, requests: 2 }, { from: 'C', to: 'D', via: 'sample', matches: 1 }]);
  });
});

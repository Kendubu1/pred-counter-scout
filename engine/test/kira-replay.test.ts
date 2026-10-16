import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { replayKira, type ReplayOptions, type ReplayAction } from '../src/kira-replay.js';

const base: ReplayOptions = { level: 13, duration: 10, health: 10000, armor: 0, maxMana: 1000,
  bonusPower: 100, flatPen: 0, critMultiplier: 2, lifesteal: 0, items: [], isolated: false,
  disabled: ['nevermore', 'vengeance'] };
const hit = (time: number): ReplayAction => ({ time, kind: 'hit', source: 'basic', raw: 100 });

describe('Kira action replay', () => {
  it('distinguishes negative captured armor from penetration crossing zero', () => {
    expect(replayKira([hit(0)], { ...base, armor: -100, flatPen: 500 }).trace[0]?.damage).toBe(150);
    expect(replayKira([hit(0)], { ...base, armor: 100, flatPen: 500 }).trace[0]?.damage).toBe(100);
  });
  it('pins reviewed descriptions and stats to the current catalog', () => {
    const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
    const source = read('../fixtures/kira-mechanics-sources.json').sources;
    expect(read('../../data/catalog/heroes.json').find((h: any) => h.slug === 'kira').abilities).toEqual(source.kira.abilities);
    for (const item of read('../../data/catalog/items.json')) if (source.items[item.slug]) {
      expect({ stats: item.stats, effects: item.effects }).toEqual(source.items[item.slug]);
    }
  });
  it('applies Deathstalker after successful hits and expires the stacks', () => {
    const r = replayKira([hit(0), hit(1), hit(5)], { ...base, armor: 100, items: ['deathstalker'] });
    expect(r.trace.filter(t => t.source === 'basic').map(t => t.damage)).toEqual([50, 10000 / 197, 50]);
  });
  it('requires a cast and consumes Solaris only once; honors expiration and crit healing', () => {
    const actions: ReplayAction[] = [hit(0), { time: 1, kind: 'cast', ability: 'PRIMARY', cooldown: 8 },
      { ...hit(2), critical: true } as ReplayAction, hit(3),
      { time: 9, kind: 'cast', ability: 'PRIMARY', cooldown: 8 }, hit(14)];
    const r = replayKira(actions, { ...base, duration: 14, items: ['solaris'] });
    expect(r.trace.filter(t => t.source === 'Solaris')).toHaveLength(1);
    expect(r.trace.find(t => t.source === 'Solaris')!.damage).toBe(160);
    expect(r.potentialHealing).toBe(80);
  });
  it('Ashbringer repeatedly reduces active non-ultimate cooldowns, with critical enhancement', () => {
    const r = replayKira([{ time: 0, kind: 'cast', ability: 'PRIMARY', cooldown: 10 },
      { time: 0, kind: 'cast', ability: 'ULTIMATE', cooldown: 100 },
      { time: 1, kind: 'hit', source: 'basic', raw: 100, critical: true }, hit(2)], { ...base, items: ['ashbringer'] });
    expect(r.ready.PRIMARY).toBeCloseTo(2 + (1 + 9 * 0.88 - 2) * 0.92);
    expect(r.ready.ULTIMATE).toBe(100);
  });
  it('Solaris cooldown starts on consumption, not the empowering cast', () => {
    const r = replayKira([
      { time: 0, kind: 'cast', ability: 'PRIMARY', cooldown: 0 }, hit(3),
      { time: 3.1, kind: 'cast', ability: 'PRIMARY', cooldown: 0 }, hit(3.2),
      { time: 4.5, kind: 'cast', ability: 'PRIMARY', cooldown: 0 }, hit(4.6),
    ], { ...base, items: ['solaris'] });
    expect(r.trace.filter(t => t.source === 'Solaris').map(t => t.time)).toEqual([3, 4.6]);
  });
  it('Nevermore uses current health and waits for its level-scaled cooldown', () => {
    const r = replayKira([hit(0), hit(1), hit(9)], { ...base, disabled: ['vengeance'] });
    const ravens = r.trace.filter(t => t.source === 'Nevermore');
    expect(ravens).toHaveLength(2);
    expect(ravens[0]!.damage).toBeCloseTo(700);
    expect(ravens[1]!.damage).toBeCloseTo(9100 * 0.07);
  });
  it('Mercy adds three Vengeance stacks; Dusk uses existing stacks, which expire', () => {
    const r = replayKira([{ time: 0, kind: 'cast', ability: 'ALTERNATE', cooldown: 8 },
      { time: 0, kind: 'hit', source: 'mercy', raw: 100 },
      { time: 1, kind: 'cast', ability: 'PRIMARY', cooldown: 1 },
      { time: 1, kind: 'hit', source: 'dusk', raw: 50, duskPerStack: 10 },
      { time: 5, kind: 'cast', ability: 'PRIMARY', cooldown: 1 },
      { time: 5, kind: 'hit', source: 'dusk', raw: 50, duskPerStack: 10 }], { ...base, disabled: ['nevermore'] });
    expect(r.trace.filter(t => t.source === 'dusk').map(t => t.damage)).toEqual([80 * 1.0225]);
    expect(r.trace.some(t => t.source === 'Dusk without afflicted target')).toBe(true);
  });
  it('Ruination cannot drain more mana than remains; refreshed damage is not a new proc', () => {
    const actions: ReplayAction[] = [hit(0), { time: 3, kind: 'cast', ability: 'ALTERNATE', cooldown: 8 },
      { time: 3, kind: 'hit', source: 'mercy', raw: 100 }, hit(5)];
    const r = replayKira(actions, { ...base, items: ['ruination'], duration: 8 });
    expect(r.remainingMana).toBeCloseTo(1000 - 110 / 4 * 7);
    expect(r.trace.filter(t => t.source === 'Ruination bleed').reduce((n, t) => n + t.damage, 0)).toBeCloseTo(154);
    const empty = replayKira([hit(0)], { ...base, maxMana: 0, items: ['ruination'] });
    expect(empty.damage).toBe(100);
  });
  it('blocks attacks during Purge and rejects ability damage without a successful cast', () => {
    const r = replayKira([{ time: 0, kind: 'cast', ability: 'ULTIMATE', cooldown: 100, channel: 2.5 }, hit(1),
      { time: 1, kind: 'hit', source: 'mercy', raw: 100 }, hit(3)], base);
    expect(r.damage).toBe(100);
    expect(replayKira([{ time: 0, kind: 'hit', source: 'mercy', raw: 100 }], base).damage).toBe(0);
  });
  it('accepts explicitly supplied Purge ticks only during the successful channel', () => {
    const r = replayKira([
      { time: 0, kind: 'cast', ability: 'ULTIMATE', cooldown: 100, channel: 2.5 },
      { time: 0.1, kind: 'hit', source: 'purge', raw: 10 },
      { time: 0.266667, kind: 'hit', source: 'purge', raw: 10 },
      { time: 2.5, kind: 'hit', source: 'purge', raw: 10 },
    ], base);
    expect(r.trace.filter(t => t.source === 'purge')).toHaveLength(2);
    expect(r.damage).toBe(20);
  });
  it('rejects unsorted events instead of calculating time backwards', () => {
    expect(() => replayKira([hit(2), hit(1)], base)).toThrow('ordered');
  });
  it.each(['unreviewed-item', 'onixian-quiver', 'scattershot'])('rejects %s rather than silently treating omitted effects as modeled', (item) => {
    expect(() => replayKira([hit(0)], { ...base, items: [item] })).toThrow('coverage');
  });
  it('executes at the inclusive threshold but never after an already lethal hit', () => {
    const run=(raw:number)=>replayKira([{time:0,kind:'hit',source:'basic',raw}],{...base,health:1000,items:['vanquisher']});
    expect(run(950).trace.filter(t=>t.source==='Vanquisher execute').map(t=>t.damage)).toEqual([50]);
    expect(run(949).trace.some(t=>t.source==='Vanquisher execute')).toBe(false);
    expect(run(1000).trace.some(t=>t.source==='Vanquisher execute')).toBe(false);
  });
});

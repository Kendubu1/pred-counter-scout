import { describe, it, expect, beforeAll } from 'vitest';
import { loadData, completedItems, type LoadedData } from '../src/data.js';
import { loadCalibration, type Calibration } from '../src/sim.js';
import { orderBuild, spikeTimeline, levelAtMinute, matchupCheckpoints } from '../src/matchup.js';
import { generateBuilds } from '../src/search.js';
import type { Item } from '../src/types.js';

let data: LoadedData;
let cal: Calibration;

beforeAll(() => {
  data = loadData();
  cal = loadCalibration();
});

const get = (n: string): Item => {
  const i = data.items.get(n);
  if (!i) throw new Error(`missing item ${n}`);
  return i;
};

describe('purchase order and spike timeline', () => {
  it('orderBuild returns a permutation with monotone cumulative gold', () => {
    const kit = data.kits.get('gideon')!;
    const items = ['Oblivion Crown', 'Timewarp', 'Noxia', 'Tainted Scepter'].map(get);
    const ob = orderBuild(kit, items, 13, cal);
    expect(ob.ordered.map((i) => i.name).sort()).toEqual(items.map((i) => i.name).sort());
    for (let i = 1; i < ob.cumulativeGold.length; i++) {
      expect(ob.cumulativeGold[i]!).toBeGreaterThan(ob.cumulativeGold[i - 1]!);
    }
  });

  it('spike minutes come from measured curves, monotone, support slower than carry', () => {
    const kit = data.kits.get('gideon')!;
    const items = ['Oblivion Crown', 'Timewarp', 'Noxia'].map(get);
    const ob = orderBuild(kit, items, 13, cal);
    const carry = spikeTimeline('carry', ob);
    const support = spikeTimeline('support', ob);
    let prev = 0;
    for (const s of carry) {
      if (s.minute == null) continue;
      expect(s.minute).toBeGreaterThanOrEqual(prev);
      prev = s.minute;
    }
    const c0 = carry[0]!.minute, s0 = support[0]!.minute;
    expect(c0).not.toBeNull();
    expect(s0).not.toBeNull();
    expect(s0!).toBeGreaterThanOrEqual(c0!);
    // first completed item lands in a plausible mid-game window, not the
    // fantasy economy the placeholder table implied
    expect(c0!).toBeGreaterThan(6);
    expect(c0!).toBeLessThan(25);
  });

  it('levelAtMinute follows the provisional table and is flagged as such', () => {
    expect(levelAtMinute(10, cal)).toBe(8);
    expect(levelAtMinute(30, cal)).toBe(17);
    expect(cal.checkpoints).toMatchObject({ levelVerified: false });
  });
});

describe('ability parse coverage (pattern B: percent-max-health ults)', () => {
  it('Countess Feast parses with pctMaxHealth and feeds the kill window', () => {
    const ult = data.kits.get('countess')!.abilities.find((a) => a.key === 'ULTIMATE')!;
    expect(ult.damagePerRank).toEqual([135, 185, 235]);
    expect(ult.pctMaxHealth).toBe(5);
    expect(ult.damageType).toBe('magical');
  });

  it('damaging-ult coverage stays at or above 37/52 kits', () => {
    let withUlt = 0;
    for (const k of data.kits.values()) {
      if (k.abilities.some((a) => a.key === 'ULTIMATE')) withUlt++;
    }
    expect(withUlt).toBeGreaterThanOrEqual(37);
  });
});

describe('matchup checkpoints', () => {
  it('produces verdicts with real HP pools and propagates honesty flags', () => {
    const gideon = data.kits.get('gideon')!;
    const riktor = data.kits.get('riktor')!;
    const gBuild = generateBuilds(gideon, completedItems(data), cal, { beamWidth: 6 })[0]!;
    const rBuild = generateBuilds(riktor, completedItems(data), cal, { beamWidth: 6 })[0]!;
    const report = matchupCheckpoints(
      { kit: gideon, build: gBuild.items.map(get), role: 'midlane' },
      { kit: riktor, build: rBuild.items.map(get), role: 'support' },
      cal,
    );
    expect(report.checkpoints.length).toBe(cal.checkpoints.table.length);
    for (const c of report.checkpoints) {
      expect(['you', 'even', 'enemy']).toContain(c.verdict);
      expect(c.you.hp).toBeGreaterThan(500);
      expect(c.enemy.hp).toBeGreaterThan(c.you.hp * 0.5); // tank should not be paper
      expect(c.driver.length).toBeGreaterThan(10);
    }
    expect(report.flags.some((f) => f.includes('THEORY'))).toBe(true);
    expect(report.flags.some((f) => f.includes('provisional'))).toBe(true);
    expect(report.gameplan.length).toBeGreaterThan(20);
  });

  it('kill threat into a tank is lower than into a squishy mirror', () => {
    const gideon = data.kits.get('gideon')!;
    const muriel = data.kits.get('muriel')!;
    const riktor = data.kits.get('riktor')!;
    const gBuild = generateBuilds(gideon, completedItems(data), cal, { beamWidth: 6 })[0]!;
    const build = gBuild.items.map(get);
    const vsSquishy = matchupCheckpoints(
      { kit: gideon, build, role: 'midlane' },
      { kit: muriel, build: [], role: 'support' },
      cal,
    );
    const vsTank = matchupCheckpoints(
      { kit: gideon, build, role: 'midlane' },
      { kit: riktor, build: [], role: 'support' },
      cal,
    );
    const last = (r: typeof vsTank) => r.checkpoints[r.checkpoints.length - 1]!;
    expect(last(vsSquishy).you.killRatio).toBeGreaterThan(last(vsTank).you.killRatio);
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { loadAggregates, goldAt, itemPlayRate, heroGames, type AggregateSnapshot } from '../src/aggregates.js';
import { loadData, type LoadedData } from '../src/data.js';
import { loadCalibration } from '../src/sim.js';

let agg: AggregateSnapshot;
let data: LoadedData;

beforeAll(() => {
  const a = loadAggregates();
  if (!a) throw new Error('no aggregate snapshot in data/aggregates/');
  agg = a;
  data = loadData();
});

describe('aggregate snapshot (match-feed evidence)', () => {
  it('has a meaningful sample', () => {
    expect(agg.meta.matches).toBeGreaterThan(1000);
    expect(Object.keys(agg.heroes).length).toBeGreaterThanOrEqual(50);
  });

  it('gold curves are role-sane and monotone', () => {
    for (const role of ['carry', 'midlane', 'offlane', 'jungle', 'support']) {
      let prev = 0;
      for (const minute of [5, 10, 15, 20, 25]) {
        const g = goldAt(role, minute, agg);
        expect(g, `${role}@${minute}`).not.toBeNull();
        expect(g!, `${role}@${minute} monotone`).toBeGreaterThan(prev);
        prev = g!;
      }
    }
    expect(goldAt('support', 10, agg)!).toBeLessThan(goldAt('carry', 10, agg)!);
  });

  it('checkpoint fixture gold stays bound to its aggregate source', () => {
    // If someone regenerates aggregates without re-deriving the fixture
    // (or edits the fixture by hand), this gate fires.
    const cal = loadCalibration();
    for (const row of cal.checkpoints.table) {
      for (const [role, fixtureGold] of Object.entries(row.gold)) {
        const measured = goldAt(role, row.minute, agg);
        if (measured == null) continue;
        expect(Math.abs(fixtureGold - measured), `${role}@${row.minute}: fixture ${fixtureGold} vs measured ${measured}`).toBeLessThanOrEqual(15);
      }
    }
    expect(cal.checkpoints).toMatchObject({ goldVerified: true, levelVerified: false });
  });

  it('play rates are valid shares and join through item game ids', () => {
    expect(heroGames('gideon', agg)).toBeGreaterThan(30);
    const crown = data.items.get('Oblivion Crown')!;
    const r = itemPlayRate('gideon', crown.gameId, agg);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThanOrEqual(0);
    expect(r!).toBeLessThanOrEqual(1);
  });

  it('hero winrate shares are sane (evidence only, never a generator input)', () => {
    for (const [slug, h] of Object.entries(agg.heroes)) {
      if (h.games < 50) continue;
      const wr = h.wins / h.games;
      expect(wr, slug).toBeGreaterThan(0.25);
      expect(wr, slug).toBeLessThan(0.75);
    }
  });
});

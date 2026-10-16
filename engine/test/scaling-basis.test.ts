import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadData } from '../src/data.js';
import { abilityHit, itemTotals } from '../src/sim.js';
const evidence = JSON.parse(readFileSync(new URL('../fixtures/scaling-basis-audit.json', import.meta.url), 'utf8'));
const data = loadData();
describe('installed-client scaling basis evidence', () => {
  it('agrees with all six catalog armor ratios at every ability rank', () => {
    expect(evidence.entries).toHaveLength(3);
    for (const entry of evidence.entries) {
      const omission = data.unmodeledScalings.find(s => s.slug === entry.hero && s.key === entry.abilityKey)!;
      expect(entry.channels).toHaveLength(2);
      for (const channel of entry.channels) {
        const term = omission.omittedTerms.find(t => t.sourceTag === channel.sourceTag)!;
        for (let rank = 0; rank < 5; rank++) expect(channel.percentByRank[rank]).toBeCloseTo(term.percentByRank[Math.min(rank, term.percentByRank.length - 1)]!, 5);
      }
    }
  });
  it('does not promote name-table clues into executed scaling', () => {
    for (const entry of evidence.entries) {
      expect(entry.status).toBe('basis-unverified');
      expect(entry.captureSource).toBe('unresolved');
      expect(entry.captureCalculationMode).toBe('unresolved');
      const ab = data.kits.get(entry.hero)!.abilities.find(a => a.key === entry.abilityKey)!;
      const flat = itemTotals([]);
      expect(abilityHit(ab, 1, { ...flat, physical_armor: 100, magical_armor: 100 })).toBe(abilityHit(ab, 1, flat));
    }
  });
  it('records the missing DoubleSweep magical coefficient reference explicitly', () => {
    const sweep = evidence.entries.find((e: any) => e.abilityKey === 'PRIMARY');
    expect(sweep.channels.map((c: any) => c.coefficientRowNamedInDamageAsset)).toEqual([true, false]);
    expect(sweep.observedDamageAssetReferences).toContain('PredAttributeSet_Defensive.MagicResist');
    expect(sweep.observedDamageAssetReferences).not.toContain('RuthlessAssault_BonusMagicalArmorScaling');
  });
});

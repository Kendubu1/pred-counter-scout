import { describe, expect, it } from 'vitest';
import { loadData, parseDamageClauseScoped } from '../src/data.js';
import { abilityHit, itemTotals } from '../src/sim.js';

const data = loadData();
const gap = (slug: string, key: string) => data.unmodeledScalings.find(s => s.slug === slug && s.key === key)!;
describe('scaling omission evidence', () => {
  it('reports unresolved health while preserving supported power on mixed-stat damage', () => {
    expect(gap('steel', 'PRIMARY').omittedTerms).toEqual([
      { sourceTag: 'HealthText', percentByRank: [5], reason: 'unsupported-stat' },
    ]);
    expect(gap('sevarog', 'PRIMARY').omittedTerms.map(t => t.percentByRank)).toEqual([[4]]);
  });
  it.each([
    ['riktor', 'SECONDARY', 35], ['sevarog', 'PRIMARY', 40], ['steel', 'PRIMARY', 70],
  ] as const)('restores only the supported power ratio on %s %s', (slug, key, pct) => {
    const ab = data.kits.get(slug)!.abilities.find(a => a.key === key)!;
    const stats = { ...itemTotals([]), magical_power: 100, health: 9999 };
    expect(ab.powerScaling?.magical).toEqual([pct]);
    expect(abilityHit(ab, 1, stats)).toBe(ab.damagePerRank[0]! + pct);
    expect(abilityHit(ab, 5, stats)).toBe(ab.damagePerRank[4]! + pct);
    expect(abilityHit(ab, 0, stats)).toBe(0);
  });
  it('retains both armor channels and excludes charged and shield payloads', () => {
    const omitted = gap('terra', 'ALTERNATE');
    expect(omitted.omittedTerms.map(t => [t.sourceTag, t.percentByRank])).toEqual([
      ['ArmorText', [40]], ['MRText', [40]],
    ]);
    expect(omitted.sourcePayload).not.toContain('120%');
    expect(omitted.sourcePayload).not.toContain('HealthText');
    expect(omitted.sourceText).toContain('120%');
    expect(omitted.sourceText).toContain('shield');
  });
  it('does not attribute a later heal ratio to the damage payload', () => {
    const parsed = parseDamageClauseScoped('Deals 50 <HealthText>(+5%)</HealthText> magical damage and heals 20 <AbilityPowerText>(+90%)</AbilityPowerText> Health.');
    expect(parsed?.omittedTerms?.map(t => t.sourceTag)).toEqual(['HealthText']);
    expect(parsed?.sourcePayload).not.toContain('90%');
  });
  it('keeps Kira stack evidence separate from her untagged base hit', () => {
    const omitted = gap('kira', 'PRIMARY');
    expect(omitted.omittedTerms).toEqual([]);
    expect(omitted.sourcePayload).toContain('45/65/85/105/125 physical damage');
    expect(omitted.sourceText).toContain('per stack');
    expect(omitted.sourceText).toContain('+12%');
  });
  it('preserves rank-specific source ratios without inventing a stat basis', () => {
    const parsed = parseDamageClauseScoped('Deals 10/20 <HealthText>(+2/4%)</HealthText> magical damage.');
    expect(parsed?.omittedTerms?.[0]).toEqual({ sourceTag: 'HealthText', percentByRank: [2, 4], reason: 'unsupported-stat' });
    expect(parsed?.scaling).toBe(0);
    expect(parsed?.powerScaling).toBeUndefined();
  });
});

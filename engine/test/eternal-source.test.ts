import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveEntries } from '../src/effects.js';

const audit = JSON.parse(readFileSync(new URL('../../data/aggregates/eternal-source-audit.json', import.meta.url), 'utf8'));
const curve = (name: string, level = 1) => audit.curves[name].keys.find((k: { x: number }) => k.x === level).value;

describe('Eternal corrections use captured client curves', () => {
  it('retains all 16 text tables, source digests and unresolved evidence', () => {
    expect(Object.keys(audit.strings)).toHaveLength(16);
    expect(Object.keys(audit.curves)).toHaveLength(414);
    expect(audit.assets).toHaveLength(34);
    expect(audit.status).toBe('partial-source-audit');
    for (const correction of audit.corrections) {
      for (const row of correction.curveRows) expect(audit.curves[row], row).toBeDefined();
    }
    expect(audit.unresolved.length).toBeGreaterThan(0);
  });
  it('Vesh base and minute scaling agree with the source independently of UI text', () => {
    const fx = resolveEntries(['eternal:vesh:major'], { level: 13, minute: 20 });
    expect(fx.ampAbilitiesPct).toBeCloseTo(100 * (curve('Vesh_Major_PrimordialMagic_Damage') + 20 * curve('Vesh_Major_PrimordialMagic_Scaling')), 5);
  });
  it('Savage Strikes uses curve endpoints without assuming permanent stacks', () => {
    for (const level of [1, 18]) {
      const fx = resolveEntries(['eternal:thraex:savage-strikes'], { level });
      expect(fx.onHitProcs[0]!.flat).toBeCloseTo(curve('Thraex_Minor_SavageStrikes_Damage', level), 5);
      expect(fx.unmodeled.join(' ')).toMatch(/stacks/);
    }
  });
});

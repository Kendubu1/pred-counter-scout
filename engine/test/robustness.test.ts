import { describe, expect, it, vi } from 'vitest';
import type { Calibration } from '../src/sim.js';
import type { HeroKit } from '../src/types.js';

// Controlled candidates isolate attribution from changing catalog balance.
vi.mock('../src/search.js', () => ({
  generateBuilds: (_kit: unknown, _pool: unknown, cal: Calibration) => [{
    items: Number(cal.constants.mitigation?.value) < 125 ? ['penetration'] : ['power'],
  }],
}));
import { robustnessOf } from '../src/robustness.js';
import { loadCalibration } from '../src/sim.js';

describe('robustness attribution', () => {
  it('attributes a controlled ranking reversal to mitigation alone', () => {
    const cal = structuredClone(loadCalibration());
    cal.constants.mitigation = { value: 100, range: [100, 150], verified: false, source: 'test' };
    const report = robustnessOf({} as HeroKit, [], cal);
    expect(report.stable).toBe(false);
    expect(report.flipConstant).toBe('mitigation');
    expect(report.grid.filter(g => !g.sameAsBaseline)).toHaveLength(2);
  });
});

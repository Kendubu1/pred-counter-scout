// Practice-mode measurements pinned as tests (2026-10-15, patch 1.17.2,
// engine/fixtures/calibration.json carries the raw points). If a refactor
// drifts the sim off what the game was measured doing, this fails.
import { describe, it, expect } from 'vitest';
import { loadData } from '../src/data.js';
import { attacksPerSecond, itemTotals, loadCalibration } from '../src/sim.js';

describe('measured in practice mode', () => {
  const data = loadData();
  const cal = loadCalibration();
  const murdock = data.kits.get('murdock')!;
  // Murdock L1 base attack speed is 1.2 (panel 120%); item attack speed is
  // a percent on top. Panel % = base * (1 + item%/100).
  const apsAtPanel = (panelPct: number) => {
    const t = itemTotals([]);
    t.attack_speed = (panelPct / 120 - 1) * 100;
    return attacksPerSecond(murdock, 1, t);
  };

  it('attacks per second = panel attack speed / basic attack time (Murdock, BAT 1.45)', () => {
    expect(murdock.baseStats.basic_attack_time[0]).toBe(1.45);
    // counted: 17 intervals/20s at 125%, 25 at 180%, 54 at 390%
    expect(apsAtPanel(125)).toBeCloseTo(0.862, 2);
    expect(apsAtPanel(180)).toBeCloseTo(1.241, 2);
    expect(apsAtPanel(390)).toBeCloseTo(2.69, 2);
    expect(Math.abs(apsAtPanel(390) * 20 - 54)).toBeLessThan(1.5);
  });

  it('crit multiplier is the measured 1.65 (43->72, 41->68, 107->177)', () => {
    expect(cal.constants.critMultiplier!.value).toBe(1.65);
  });

  it('heroes with non-standard basic attacks keep the old reading until measured', () => {
    const legion = data.kits.get('legion')!;
    const t = itemTotals([]);
    expect(attacksPerSecond(legion, 1, t)).toBeCloseTo(legion.baseStats.attack_speed[0]!, 5);
  });
});

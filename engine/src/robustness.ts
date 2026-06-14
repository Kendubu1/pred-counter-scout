// Option-A uncertainty: rank builds by ROBUSTNESS to unverified constants.
//
// The sim's crit multiplier and mitigation K (damage*K/(K+armor)) are unverified
// (calibration warns K may be >100). Rather than a single binary THEORY flag, we
// propagate each constant's plausible RANGE through the generator and ask: does
// the #1 recommendation survive the whole range? A build that stays #1 everywhere
// is trustworthy despite the unknowns; one that flips tells us WHICH constant to
// measure first. For a mage (no crit, penetration-sensitive) crit should not move
// the answer while K can — the report makes that per-hero truth explicit.

import { generateBuilds, type ObjKey } from './search.js';
import type { Calibration } from './sim.js';
import type { HeroKit, Item } from './types.js';

export interface RobustnessReport {
  stable: boolean;
  flipConstant?: string;            // which constant, varied alone, changes #1
  baselineTop: string[];            // #1 build under the shipped constants
  swept: { name: string; range: [number, number]; shipped: number }[];
  grid: { crit: number; mitigationK: number; top: string[]; sameAsBaseline: boolean }[];
  note: string;
}

type GenOpts = { level?: number; beamWidth?: number; role?: string; objectiveBias?: ObjKey[]; headlineOverride?: ObjKey };

function withConstants(cal: Calibration, crit: number, k: number): Calibration {
  return {
    ...cal,
    constants: {
      ...cal.constants,
      critMultiplier: { ...(cal.constants.critMultiplier ?? { verified: false, source: '' }), value: crit },
      mitigation: { ...(cal.constants.mitigation ?? { verified: false, source: '' }), value: k },
    },
  };
}

function topItems(kit: HeroKit, pool: Item[], cal: Calibration, opts: GenOpts): string[] {
  return generateBuilds(kit, pool, cal, opts)[0]?.items ?? [];
}

const setEq = (a: string[], b: string[]) => [...a].sort().join('|') === [...b].sort().join('|');

export function robustnessOf(kit: HeroKit, pool: Item[], cal: Calibration, opts: GenOpts = {}): RobustnessReport {
  const critRange = (cal.constants.critMultiplier?.range as [number, number]) ?? [1.6, 1.8];
  const kRange = (cal.constants.mitigation?.range as [number, number]) ?? [100, 150];
  const critVal = (cal.constants.critMultiplier?.value as number) ?? 1.75;
  const kVal = (cal.constants.mitigation?.value as number) ?? 100;

  const run = (crit: number, k: number) => topItems(kit, pool, withConstants(cal, crit, k), opts);
  const baselineTop = run(critVal, kVal);

  // Corner grid over the two ranges; flips are attributed by comparing cells
  // that differ on a single axis (so no extra single-axis runs are needed).
  const grid = critRange.flatMap((crit) => kRange.map((mitigationK) => ({
    crit, mitigationK, top: run(crit, mitigationK), sameAsBaseline: false as boolean,
  })));
  for (const g of grid) g.sameAsBaseline = setEq(g.top, baselineTop);
  const at = (crit: number, k: number) => grid.find((g) => g.crit === crit && g.mitigationK === k)!.top;

  // crit flips if changing only crit (K held) changes the pick; K symmetrically.
  const critFlips = kRange.some((k) => !setEq(at(critRange[0]!, k), at(critRange[1]!, k)));
  const kFlips = critRange.some((c) => !setEq(at(c, kRange[0]!), at(c, kRange[1]!)));
  const stable = grid.every((g) => g.sameAsBaseline);
  const flips = [critFlips && 'critMultiplier', kFlips && 'mitigation'].filter(Boolean) as string[];
  const flipConstant = stable ? undefined : (flips.join(' + ') || 'joint crit×mitigation');

  const note = stable
    ? `#1 build holds across crit ${critRange.join('–')} and mitigation K ${kRange.join('–')} — recommendation is robust to the unverified constants.`
    : `#1 build changes when ${flipConstant} varies in range — measure it before trusting this pick.`;

  return {
    stable,
    flipConstant,
    baselineTop,
    swept: [
      { name: 'critMultiplier', range: critRange, shipped: critVal },
      { name: 'mitigation', range: kRange, shipped: kVal },
    ],
    grid,
    note,
  };
}

// Neutral-objective solo-clear (Fangtooth). Objective stats are unverified
// placeholders, so the clear is provisional (THEORY) — this checks the machinery.

import { describe, it, expect, beforeAll } from 'vitest';
import { loadData, completedItems, type LoadedData } from '../src/data.js';
import { loadCalibration, type Calibration } from '../src/sim.js';
import { soloClear, bestOneItemClear } from '../src/objectives.js';

let data: LoadedData;
let cal: Calibration;
beforeAll(() => { data = loadData(); cal = loadCalibration(); });

describe('neutral-objective solo-clear (who can take the Fangtooth)', () => {
  it('computes a provisional clear and a faster best-one-item clear', () => {
    const kit = data.kits.get('khaimera')!;
    const bare = soloClear(kit, [], 6, cal);
    expect(bare).not.toBeNull();
    expect(bare!.provisional).toBe(true);          // objective stats unverified -> THEORY
    expect(bare!.clearSec).toBeGreaterThan(0);
    expect(typeof bare!.survivable).toBe('boolean');
    const best = bestOneItemClear(kit, completedItems(data), 6, cal);
    expect(best).not.toBeNull();
    expect(best!.clear.clearSec).toBeLessThan(bare!.clearSec);   // an item speeds the clear
  }, 60000);
});

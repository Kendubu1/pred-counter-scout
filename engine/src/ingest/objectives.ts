// Who can solo the Fangtooth, and when? Ranks junglers by their solo-clear of the
// objective at level 4 with no items ("on their own early"), then with the single
// best item online at level 6. Objective stats are UNVERIFIED placeholders, so this
// is THEORY until they're measured in practice mode.

import { loadData, completedItems } from '../data.js';
import { loadCalibration } from '../sim.js';
import { soloClear, bestOneItemClear } from '../objectives.js';

const data = loadData();
const cal = loadCalibration();
const pool = completedItems(data);
const obj = cal.neutralObjectives?.fangtooth;

if (!obj) { console.error('No fangtooth objective in calibration.'); process.exit(1); }
console.log(`Fangtooth solo-clear (THEORY — objective stats unverified): ${obj.health} HP, ${obj.physicalArmor}/${obj.magicalArmor} armor, ${obj.contactDps} contact DPS\n`);

const junglers = [...data.kits.values()].filter((k) => k.roles.includes('jungle'));
const rows = junglers.map((kit) => {
  const early = soloClear(kit, [], 4, cal);                    // bare, level 4
  const oneItem = bestOneItemClear(kit, pool, 6, cal);         // best single item, level 6
  return { kit, early, oneItem };
}).filter((r) => r.early)
  .sort((a, b) => (a.early!.clearSec) - (b.early!.clearSec));

console.log(`${'hero'.padEnd(14)} ${'L4 bare clear'.padEnd(22)} L6 + best item`);
for (const { kit, early, oneItem } of rows) {
  const e = early!;
  const tag = e.feasible ? 'SOLO' : e.survivable ? 'slow' : 'dies';
  const bare = `${e.clearSec === Infinity ? 'never' : e.clearSec.toFixed(0) + 's'} [${tag}]`;
  const oi = oneItem
    ? `${oneItem.clear.clearSec.toFixed(0)}s w/ ${oneItem.item.name}${oneItem.clear.feasible ? ' SOLO' : ''}`
    : 'none survives';
  console.log(`${kit.name.padEnd(14)} ${bare.padEnd(22)} ${oi}`);
}
console.log(`\n${rows.filter((r) => r.early!.feasible).length}/${rows.length} junglers can solo it bare at level 4 (THEORY).`);

// Patch-currency drift report: how far the owned game data (which the live
// v2 site still renders) has drifted from the current patch (the omeda
// snapshot). Run after `npm run snapshot`.
//
// June 11, 2026 finding: owned hero-abilities.json carries pre-1.14 numbers
// (pre-1.14 cooldowns; Void Breach 90-230 where the 1.14.4 digest says
// 95-235). The engine therefore sources numbers from the snapshot; this
// report exists so the v2 site's staleness is visible, not silent.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const load = <T>(rel: string): T => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8')) as T;

const KEYMAP: Record<string, string> = { RMB: 'ALTERNATE', Q: 'PRIMARY', E: 'SECONDARY', R: 'ULTIMATE' };

function parseValues(md: string): number[] | null {
  const m = md.match(/deal(?:ing|s)?\s+([\d][\d./]*)\s*<(?:AttackDamageText|AbilityPowerText)>\(\+/);
  return m ? m[1]!.split('/').map(Number) : null;
}

const owned = load<Record<string, { abilities: { key: string; name: string; cooldowns?: number[]; damage?: { values: number[] }[] }[] }>>('data/game-data/hero-abilities.json');
const omeda = load<{ slug: string; abilities?: { key?: string; menu_description?: string; cooldown?: number[] }[] }[]>('data/omeda/heroes.json');
const omedaMap = new Map(omeda.map((h) => [h.slug, h]));

let compared = 0;
const valueDrift: string[] = [];
const cooldownDrift: string[] = [];
for (const [slug, h] of Object.entries(owned)) {
  const om = omedaMap.get(slug);
  if (!om) continue;
  const omByKey = new Map((om.abilities ?? []).map((a) => [KEYMAP[a.key ?? ''], a]));
  for (const ab of h.abilities) {
    const omAb = omByKey.get(ab.key);
    if (!omAb) continue;
    const ownedVals = ab.damage?.[0]?.values;
    const currentVals = omAb.menu_description ? parseValues(omAb.menu_description) : null;
    if (ownedVals?.length && currentVals?.length) {
      compared++;
      const n = Math.min(ownedVals.length, currentVals.length);
      if (ownedVals.slice(0, n).some((v, i) => Math.abs(v - currentVals[i]!) > 0.5)) {
        valueDrift.push(`${slug}/${ab.name}: ${ownedVals.join('/')} -> ${currentVals.join('/')}`);
      }
    }
    if (ab.cooldowns?.length && omAb.cooldown?.length) {
      const n = Math.min(ab.cooldowns.length, omAb.cooldown.length);
      if (ab.cooldowns.slice(0, n).some((v, i) => Math.abs(v - omAb.cooldown![i]!) > 0.01)) {
        cooldownDrift.push(`${slug}/${ab.name}: cd ${ab.cooldowns.join('/')} -> ${omAb.cooldown!.join('/')}`);
      }
    }
  }
}

console.log(`abilities with comparable damage values: ${compared}`);
console.log(`  value drift:    ${valueDrift.length}`);
console.log(`  cooldown drift: ${cooldownDrift.length}`);
for (const d of [...valueDrift.slice(0, 8), ...cooldownDrift.slice(0, 8)]) console.log('   ', d);
if (valueDrift.length + cooldownDrift.length > 0) {
  console.log('\nOwned data (the live v2 site) is behind the current patch in the entries above.');
}

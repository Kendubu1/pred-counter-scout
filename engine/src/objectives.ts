// Neutral-objective solo-clear: can a hero kill a jungle objective (the Fangtooth)
// alone, and at what level / how many items? Pure kit math — the hero's sustained
// damage against the objective's defenses for time-to-kill, versus its contact
// damage against the hero's effective HP (plus self-heal) for survival. Objective
// stats live in calibration (currently UNVERIFIED placeholders -> output is THEORY).

import { simulate, type Calibration } from './sim.js';
import { resolveItemEffects } from './effects.js';
import type { HeroKit, Item } from './types.js';

export interface SoloClear {
  dps: number;          // sustained damage per second vs the objective's armor
  clearSec: number;     // time to kill it solo
  incoming: number;     // raw contact damage taken over the clear
  effectiveHp: number;  // hero EHP + self-heal sustained during the clear
  survivable: boolean;
  feasible: boolean;    // killed inside a realistic window AND survived
  provisional: boolean; // objective stats are unverified
}

// A solo clear that takes longer than this isn't realistic early (you'd be ganked
// or out-tempo'd); used only to gate "feasible", the raw numbers are still returned.
const MAX_CLEAR_SEC = 25;

export function soloClear(
  kit: HeroKit, items: Item[], level: number, cal: Calibration, objName = 'fangtooth',
): SoloClear | null {
  const obj = cal.neutralObjectives?.[objName];
  if (!obj || typeof obj.health !== 'number') return null;
  const eff = resolveItemEffects(items, { level });
  const profile = { health: obj.health, physicalArmor: obj.physicalArmor, magicalArmor: obj.magicalArmor };
  const r = simulate(kit, items, { level, profile, effects: eff }, cal);
  const dps = r.autoDps + (r.rotation[10] ?? 0) / 10;   // autoDps is per-second; rotation[10] is a 10s total
  const clearSec = dps > 0 ? obj.health / dps : Number.POSITIVE_INFINITY;
  const incoming = (obj.contactDps ?? 0) * clearSec;
  const heal = (r.sustain10s / 10) * clearSec;
  const effectiveHp = r.ehpPhysical + heal;             // raw damage the hero can absorb + lifesteal
  const survivable = effectiveHp > incoming;
  return {
    dps, clearSec, incoming, effectiveHp, survivable,
    feasible: clearSec <= MAX_CLEAR_SEC && survivable,
    provisional: cal.neutralObjectives?.verified !== true,
  };
}

/** The single item that best speeds a survivable solo clear (the "one item online"
 *  question). Returns the item and the resulting clear, or null if none survive. */
export function bestOneItemClear(
  kit: HeroKit, pool: Item[], level: number, cal: Calibration, objName = 'fangtooth',
): { item: Item; clear: SoloClear } | null {
  let best: { item: Item; clear: SoloClear } | null = null;
  for (const it of pool) {
    const c = soloClear(kit, [it], level, cal, objName);
    if (!c || !c.survivable) continue;
    if (!best || c.clearSec < best.clear.clearSec) best = { item: it, clear: c };
  }
  return best;
}

import type { HeroKit, Item } from './types.js';
import { evaluateBuild, type Calibration } from './sim.js';
import { resolveItemEffects } from './effects.js';

/** Respect purchase order: do not skip an unaffordable item to buy a later one.
 * Completed items only; remaining gold is explicit, not invented components. */
export function affordablePrefix(items: Item[], budget: number): Item[] {
  if (!Number.isFinite(budget) || budget < 0) throw new Error('Invalid gold budget');
  const selected: Item[] = [];
  let spent = 0;
  for (const item of items) {
    if (!Number.isFinite(item.totalPrice) || item.totalPrice < 0) throw new Error('Invalid item price');
    if (spent + item.totalPrice > budget) break;
    selected.push(item); spent += item.totalPrice;
  }
  return selected;
}

export function compareBuilds(kit: HeroKit, field: Item[], candidate: Item[], level: number, budget: number, cal: Calibration) {
  if (!Number.isInteger(level) || level < 1 || level > 18) throw new Error('Invalid hero level');
  const run = (items: Item[]) => {
    const bought = affordablePrefix(items, budget);
    const effects = resolveItemEffects(bought, {level});
    const result = evaluateBuild(kit, bought, level, cal, effects);
    return { ...result, remainingGold: budget - result.gold, unmodeled: effects.unmodeled };
  };
  const baseline = run(field), proposed = run(candidate);
  const deltas = Object.fromEntries(Object.entries(baseline.objectives).map(([k, v]) => {
    const next = proposed.objectives[k as keyof typeof proposed.objectives];
    return [k, { field: v, candidate: next, difference: next - v, pct: v !== 0 ? 100 * (next - v) / v : null }];
  }));
  return {level, budget, field: baseline, candidate: proposed, deltas,
    sameSpend: baseline.gold === proposed.gold,
    note:'Same hero, level, gold cap and reference defenses. No Eternals or augments on either side. Completed-item purchase prefixes only; remaining gold buys no components. These combat outputs are not win probabilities.'};
}

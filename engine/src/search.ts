// Build generator: beam search over the completed-item space scored by the
// simulator, Pareto-filtered over the objective vector. Popularity never
// enters the objective (docs/v5-engine-design.md, component C).

import type { BuildEval, HeroKit, Item } from './types.js';
import { evaluateBuild, type Calibration } from './sim.js';

export interface Scenario {
  requireAntiHeal?: boolean;   // enemy comp is sustain-heavy
  goldBudget?: number;         // checkpoint budget; builds must fit
}

export interface GeneratedBuild extends BuildEval {
  archetypes: string[];        // objectives this build sits on the front for
}

const OBJECTIVE_KEYS = [
  'burstVsSquishy', 'rot10VsSquishy', 'rot20VsBruiser',
  'autoDps10VsSquishy', 'ehpPhysical', 'ehpMagical',
] as const;
type ObjKey = (typeof OBJECTIVE_KEYS)[number];

const ARCHETYPE_LABELS: Record<ObjKey, string> = {
  burstVsSquishy: 'burst',
  rot10VsSquishy: 'skirmish uptime',
  rot20VsBruiser: 'extended fights',
  autoDps10VsSquishy: 'sustained DPS',
  ehpPhysical: 'physical survival',
  ehpMagical: 'magical survival',
};

// Corner weight vectors approximate the Pareto front through scalarization.
const WEIGHT_VECTORS: Record<ObjKey, number>[] = [
  { burstVsSquishy: 1, rot10VsSquishy: 0.2, rot20VsBruiser: 0, autoDps10VsSquishy: 0, ehpPhysical: 0, ehpMagical: 0 },
  { burstVsSquishy: 0.2, rot10VsSquishy: 1, rot20VsBruiser: 0.3, autoDps10VsSquishy: 0, ehpPhysical: 0, ehpMagical: 0 },
  { burstVsSquishy: 0, rot10VsSquishy: 0.3, rot20VsBruiser: 1, autoDps10VsSquishy: 0, ehpPhysical: 0.1, ehpMagical: 0.1 },
  { burstVsSquishy: 0, rot10VsSquishy: 0, rot20VsBruiser: 0.2, autoDps10VsSquishy: 1, ehpPhysical: 0, ehpMagical: 0 },
  { burstVsSquishy: 0.3, rot10VsSquishy: 0.3, rot20VsBruiser: 0.3, autoDps10VsSquishy: 0.3, ehpPhysical: 0.5, ehpMagical: 0.5 },
];

function relevantPool(kit: HeroKit, pool: Item[]): Item[] {
  return pool.filter((i) => {
    const offensive = i.stats.physical_power || i.stats.magical_power || i.stats.attack_speed || i.stats.critical_chance;
    if (!offensive) return true; // defensive and utility items always allowed
    if (kit.damageType === 'physical') return i.stats.physical_power > 0 || i.stats.attack_speed > 0 || i.stats.critical_chance > 0;
    if (kit.damageType === 'magical') return i.stats.magical_power > 0;
    return true; // hybrid
  });
}

function violatesConstraints(items: Item[], candidate: Item): boolean {
  if (items.some((i) => i.slug === candidate.slug)) return true;
  if (candidate.family && items.some((i) => i.family === candidate.family)) return true;
  return false;
}

function dominates(a: BuildEval, b: BuildEval): boolean {
  let strictly = false;
  for (const k of OBJECTIVE_KEYS) {
    if (a.objectives[k] < b.objectives[k] - 1e-9) return false;
    if (a.objectives[k] > b.objectives[k] + 1e-9) strictly = true;
  }
  return strictly;
}

export function paretoFront(builds: BuildEval[]): BuildEval[] {
  return builds.filter((b) => !builds.some((other) => other !== b && dominates(other, b)));
}

export function generateBuilds(
  kit: HeroKit,
  pool: Item[],
  cal: Calibration,
  opts: { level?: number; buildSize?: number; beamWidth?: number; scenario?: Scenario } = {},
): GeneratedBuild[] {
  const level = opts.level ?? 13;
  const buildSize = opts.buildSize ?? 6;
  const beamWidth = opts.beamWidth ?? 24;
  const scenario = opts.scenario ?? {};
  const candidates = relevantPool(kit, pool);

  // Normalizers so weight vectors compare across objective scales: the best
  // single-item value per objective.
  const singleEvals = candidates.map((i) => ({ item: i, ev: evaluateBuild(kit, [i], level, cal) }));
  const scale: Record<ObjKey, number> = {} as Record<ObjKey, number>;
  for (const k of OBJECTIVE_KEYS) {
    scale[k] = Math.max(...singleEvals.map((s) => s.ev.objectives[k]), 1);
  }
  const score = (ev: BuildEval, w: Record<ObjKey, number>) =>
    OBJECTIVE_KEYS.reduce((s, k) => s + w[k] * (ev.objectives[k] / scale[k]), 0);

  let beam: { items: Item[]; ev: BuildEval }[] = [{ items: [], ev: evaluateBuild(kit, [], level, cal) }];
  const complete: { items: Item[]; ev: BuildEval }[] = [];

  for (let depth = 0; depth < buildSize; depth++) {
    const next: { items: Item[]; ev: BuildEval }[] = [];
    const seen = new Set<string>();
    for (const state of beam) {
      let expandable = candidates.filter((c) => !violatesConstraints(state.items, c));
      // Sustain-heavy scenario: anti-heal must be in the build by the third slot.
      if (scenario.requireAntiHeal && depth === 2 && !state.items.some((i) => i.antiHeal)) {
        const ah = expandable.filter((c) => c.antiHeal);
        if (ah.length) expandable = ah;
      }
      for (const c of expandable) {
        const items = [...state.items, c];
        if (scenario.goldBudget && items.reduce((s, i) => s + i.totalPrice, 0) > scenario.goldBudget) continue;
        const key = items.map((i) => i.slug).sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ items, ev: evaluateBuild(kit, items, level, cal) });
      }
    }
    // Keep the top of the beam under each corner weighting.
    const kept = new Set<{ items: Item[]; ev: BuildEval }>();
    for (const w of WEIGHT_VECTORS) {
      [...next].sort((a, b) => score(b.ev, w) - score(a.ev, w)).slice(0, beamWidth).forEach((s) => kept.add(s));
    }
    beam = [...kept];
    if (depth === buildSize - 1) complete.push(...beam);
  }

  const front = paretoFront(complete.map((c) => c.ev));
  const headline = headlineObjective(kit);
  return front.map((ev) => {
    const archetypes: string[] = [];
    for (const k of OBJECTIVE_KEYS) {
      const best = Math.max(...front.map((f) => f.objectives[k]));
      if (ev.objectives[k] >= best * 0.98) archetypes.push(ARCHETYPE_LABELS[k]);
    }
    return { ...ev, archetypes };
  }).sort((a, b) => b.objectives[headline] - a.objectives[headline]);
}

/** Which objective leads the presentation for this kit: auto-attackers live
 *  on sustained DPS, casters on rotation uptime. */
export function headlineObjective(kit: HeroKit): ObjKey {
  const carry = kit.roles.includes('carry');
  const physicalAA = kit.damageType !== 'magical' && (carry || kit.basicScalingPct >= 90);
  return physicalAA ? 'autoDps10VsSquishy' : 'rot10VsSquishy';
}

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

const ALL_OBJECTIVE_KEYS = [
  'burstVsSquishy', 'rot10VsSquishy', 'rot20VsBruiser',
  'autoDps10VsSquishy', 'ehpPhysical', 'ehpMagical',
  'healShield10s', 'utility',
] as const;
type ObjKey = (typeof ALL_OBJECTIVE_KEYS)[number];

// Damage roles compete on the combat vector. Support searches swap the
// pure-damage corners (burst, auto DPS) for heal/shield output, survival,
// and utility — keeping rotation damage as poke presence. The split is
// what keeps a crit/lethality core out of every support front: those
// builds win only objectives a support search never scores.
const COMBAT_KEYS: readonly ObjKey[] = [
  'burstVsSquishy', 'rot10VsSquishy', 'rot20VsBruiser',
  'autoDps10VsSquishy', 'ehpPhysical', 'ehpMagical',
];
const SUPPORT_KEYS: readonly ObjKey[] = [
  'rot10VsSquishy', 'ehpPhysical', 'ehpMagical', 'healShield10s', 'utility',
];

const ARCHETYPE_LABELS: Record<ObjKey, string> = {
  burstVsSquishy: 'burst',
  rot10VsSquishy: 'skirmish uptime',
  rot20VsBruiser: 'extended fights',
  autoDps10VsSquishy: 'sustained DPS',
  ehpPhysical: 'physical survival',
  ehpMagical: 'magical survival',
  healShield10s: 'heal/shield output',
  utility: 'utility',
};

type Weights = Partial<Record<ObjKey, number>>;

// Corner weight vectors approximate the Pareto front through scalarization.
const COMBAT_VECTORS: Weights[] = [
  { burstVsSquishy: 1, rot10VsSquishy: 0.2 },
  { burstVsSquishy: 0.2, rot10VsSquishy: 1, rot20VsBruiser: 0.3 },
  { rot10VsSquishy: 0.3, rot20VsBruiser: 1, ehpPhysical: 0.1, ehpMagical: 0.1 },
  { rot20VsBruiser: 0.2, autoDps10VsSquishy: 1 },
  { burstVsSquishy: 0.3, rot10VsSquishy: 0.3, rot20VsBruiser: 0.3, autoDps10VsSquishy: 0.3, ehpPhysical: 0.5, ehpMagical: 0.5 },
];
const SUPPORT_VECTORS: Weights[] = [
  { healShield10s: 1, ehpPhysical: 0.2, ehpMagical: 0.2, rot10VsSquishy: 0.1, utility: 0.1 },
  { ehpPhysical: 1, ehpMagical: 1, healShield10s: 0.2, rot10VsSquishy: 0.1, utility: 0.2 },
  { rot10VsSquishy: 1, healShield10s: 0.2, ehpPhysical: 0.1, ehpMagical: 0.1 },
  { utility: 1, healShield10s: 0.3, ehpPhysical: 0.3, ehpMagical: 0.3 },
  { rot10VsSquishy: 0.4, ehpPhysical: 0.4, ehpMagical: 0.4, healShield10s: 0.4, utility: 0.4 },
];

function relevantPool(kit: HeroKit, pool: Item[], role?: string): Item[] {
  return pool.filter((i) => {
    // Support searches: crit and lethality feed only objectives outside
    // the support vector, so their stat budget is dead gold even when the
    // item carries a support stat (Equinox: 20% crit riding 80 tenacity).
    // This is the design doc's golden rule, enforced as a pool constraint.
    if (role === 'support' && (i.stats.critical_chance > 0 || i.stats.physical_penetration > 0)) return false;
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

function dominates(a: BuildEval, b: BuildEval, keys: readonly ObjKey[]): boolean {
  let strictly = false;
  for (const k of keys) {
    if (a.objectives[k] < b.objectives[k] - 1e-9) return false;
    if (a.objectives[k] > b.objectives[k] + 1e-9) strictly = true;
  }
  return strictly;
}

export function paretoFront(builds: BuildEval[], keys: readonly ObjKey[] = COMBAT_KEYS): BuildEval[] {
  return builds.filter((b) => !builds.some((other) => other !== b && dominates(other, b, keys)));
}

export function generateBuilds(
  kit: HeroKit,
  pool: Item[],
  cal: Calibration,
  opts: { level?: number; buildSize?: number; beamWidth?: number; scenario?: Scenario; role?: string } = {},
): GeneratedBuild[] {
  const level = opts.level ?? 13;
  const buildSize = opts.buildSize ?? 6;
  const beamWidth = opts.beamWidth ?? 24;
  const scenario = opts.scenario ?? {};
  const role = opts.role ?? kit.roles[0] ?? 'midlane';
  const objectiveKeys = role === 'support' ? SUPPORT_KEYS : COMBAT_KEYS;
  const weightVectors = role === 'support' ? SUPPORT_VECTORS : COMBAT_VECTORS;
  const candidates = relevantPool(kit, pool, role);

  // Normalizers so weight vectors compare across objective scales: the best
  // single-item value per objective.
  const singleEvals = candidates.map((i) => ({ item: i, ev: evaluateBuild(kit, [i], level, cal) }));
  const scale: Partial<Record<ObjKey, number>> = {};
  for (const k of objectiveKeys) {
    scale[k] = Math.max(...singleEvals.map((s) => s.ev.objectives[k]), 1);
  }
  const score = (ev: BuildEval, w: Weights) =>
    objectiveKeys.reduce((s, k) => s + (w[k] ?? 0) * (ev.objectives[k] / scale[k]!), 0);

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
    for (const w of weightVectors) {
      [...next].sort((a, b) => score(b.ev, w) - score(a.ev, w)).slice(0, beamWidth).forEach((s) => kept.add(s));
    }
    beam = [...kept];
    if (depth === buildSize - 1) complete.push(...beam);
  }

  const front = paretoFront(complete.map((c) => c.ev), objectiveKeys);
  const headline = headlineObjective(kit, role);
  return front.map((ev) => {
    const archetypes: string[] = [];
    for (const k of objectiveKeys) {
      const best = Math.max(...front.map((f) => f.objectives[k]));
      // best > 0: an objective nobody moves (a heal-less kit's heal
      // output) labels nothing.
      if (best > 0 && ev.objectives[k] >= best * 0.98) archetypes.push(ARCHETYPE_LABELS[k]);
    }
    return { ...ev, archetypes };
  }).sort((a, b) => b.objectives[headline] - a.objectives[headline]);
}

export function kitHeals(kit: HeroKit): boolean {
  return kit.abilities.some((a) => a.healing?.length);
}

/** Which objective leads the presentation for this kit: auto-attackers live
 *  on sustained DPS, casters on rotation uptime, supports on heal/shield
 *  output (or survivability when the kit has no parsed heal). */
export function headlineObjective(kit: HeroKit, role?: string): ObjKey {
  const r = role ?? kit.roles[0] ?? 'midlane';
  if (r === 'support') return kitHeals(kit) ? 'healShield10s' : 'ehpPhysical';
  const carry = kit.roles.includes('carry');
  const physicalAA = kit.damageType !== 'magical' && (carry || kit.basicScalingPct >= 90);
  return physicalAA ? 'autoDps10VsSquishy' : 'rot10VsSquishy';
}

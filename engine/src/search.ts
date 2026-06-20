// Build generator: beam search over the completed-item space scored by the
// simulator, Pareto-filtered over the objective vector. Popularity never
// enters the objective (docs/v5-engine-design.md, component C).

import type { BuildEval, HeroKit, Item } from './types.js';
import { evaluateBuild, kitPowerType, stagedManaAdequacy, type Calibration } from './sim.js';
import { mergeEffects, resolveItemEffects, type ResolvedEffects } from './effects.js';

export interface Scenario {
  requireAntiHeal?: boolean;   // enemy comp is sustain-heavy
  goldBudget?: number;         // checkpoint budget; builds must fit
}

export interface GeneratedBuild extends BuildEval {
  archetypes: string[];        // objectives this build sits on the front for
}

const ALL_OBJECTIVE_KEYS = [
  'burstVsSquishy', 'teamfightVsSquishy', 'rot10VsSquishy', 'rot20VsBruiser',
  'autoDps10VsSquishy', 'ehpPhysical', 'ehpMagical',
  'healShield10s', 'utility', 'sustain10s',
] as const;
export type ObjKey = (typeof ALL_OBJECTIVE_KEYS)[number];

// Damage roles compete on the combat vector. Support searches swap the
// pure-damage corners (burst, auto DPS) for heal/shield output, survival,
// and utility — keeping rotation damage as poke presence. The split is
// what keeps a crit/lethality core out of every support front: those
// builds win only objectives a support search never scores.
const COMBAT_KEYS: readonly ObjKey[] = [
  'burstVsSquishy', 'teamfightVsSquishy', 'rot10VsSquishy', 'rot20VsBruiser',
  'autoDps10VsSquishy', 'ehpPhysical', 'ehpMagical', 'sustain10s',
];
const SUPPORT_KEYS: readonly ObjKey[] = [
  'rot10VsSquishy', 'ehpPhysical', 'ehpMagical', 'healShield10s', 'utility',
];

const ARCHETYPE_LABELS: Record<ObjKey, string> = {
  burstVsSquishy: 'burst',
  teamfightVsSquishy: 'teamfight AoE',
  rot10VsSquishy: 'skirmish uptime',
  rot20VsBruiser: 'extended fights',
  autoDps10VsSquishy: 'sustained DPS',
  ehpPhysical: 'physical survival',
  ehpMagical: 'magical survival',
  healShield10s: 'heal/shield output',
  utility: 'enchant/peel utility',
  sustain10s: 'drain sustain',
};

// The human-readable noun for a build's lead archetype — the word players
// actually use ("a Brawler", "a Burst build"), not the internal objective key.
const ARCHETYPE_NOUN: Record<string, string> = {
  burst: 'Burst',
  'teamfight AoE': 'Teamfight',
  'skirmish uptime': 'Skirmisher',
  'extended fights': 'Brawler',
  'sustained DPS': 'DPS Carry',
  'physical survival': 'Frontline',
  'magical survival': 'Frontline',
  'heal/shield output': 'Enchanter',
  'enchant/peel utility': 'Enchanter',
  'drain sustain': 'Drain',
};

/**
 * A short, human-readable build title in the idiom players search for
 * ("Crit DPS Carry", "AP Burst", "Lethality Skirmisher", "Bruiser Brawler",
 * "Tank Frontline"). Purely deterministic from the build's item stat mix +
 * kit power type + lead archetype — no popularity, no LLM, no estimation.
 * The stat thresholds are presentation heuristics, not sim constants.
 */
export function buildTitle(archetypes: string[], kit: HeroKit, items: Item[]): string {
  const sum = (k: keyof Item['stats']) => items.reduce((s, i) => s + ((i.stats[k] as number) ?? 0), 0);
  const off = sum('physical_power') + sum('magical_power');
  const def = sum('health') / 15 + sum('physical_armor') + sum('magical_armor');
  const crit = sum('critical_chance');
  const lethality = sum('physical_penetration');
  const atkSpeed = sum('attack_speed');
  const drain = sum('lifesteal') + sum('omnivamp');
  const power = kitPowerType(kit);

  // The "style" descriptor — the offensive identity a player shops for.
  let style = '';
  if (crit >= 40) style = 'Crit';
  else if (power === 'magical') style = archetypes.includes('burst') ? 'AP Burst' : 'AP';
  else if (lethality >= 24) style = 'Lethality';
  else if (atkSpeed >= 70) style = 'On-Hit';
  else if (drain >= 25 && off > 0) style = 'Lifesteal';
  else if (off > 0) style = 'AD';

  // The "class" descriptor — how much of the build is survivability.
  let cls = '';
  if (off === 0 && def > 0) cls = 'Tank';
  else if (def > 0 && def >= off * 0.45) cls = 'Bruiser';

  const noun = ARCHETYPE_NOUN[archetypes[0] ?? ''] ?? 'Build';
  // Bruiser/Tank lead with the class; everything else leads with the style.
  const lead = cls || style;
  // Word-level dedupe so "AP Burst" + "Burst" → "AP Burst", not a stutter.
  const seen = new Set<string>();
  const title = [lead, noun]
    .filter(Boolean)
    .join(' ')
    .split(' ')
    .filter((w) => { const k = w.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .join(' ');
  return title || 'Core Build';
}

type Weights = Partial<Record<ObjKey, number>>;

// Corner weight vectors approximate the Pareto front through scalarization.
const COMBAT_VECTORS: Weights[] = [
  { burstVsSquishy: 1, rot10VsSquishy: 0.2 },
  { teamfightVsSquishy: 1, burstVsSquishy: 0.3, rot10VsSquishy: 0.2 },
  { burstVsSquishy: 0.2, rot10VsSquishy: 1, rot20VsBruiser: 0.3 },
  { rot10VsSquishy: 0.3, rot20VsBruiser: 1, ehpPhysical: 0.1, ehpMagical: 0.1 },
  { rot20VsBruiser: 0.2, autoDps10VsSquishy: 1 },
  // The drain corner (component C lists sustain in the objective vector;
  // the audit found field staples like Terminus invisible without it).
  { sustain10s: 1, rot20VsBruiser: 0.4, autoDps10VsSquishy: 0.4 },
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
  const power = kitPowerType(kit);   // real power type, not the omeda 'hybrid' tag
  return pool.filter((i) => {
    const s = i.stats;
    // Support golden rule: crit and lethality feed only objectives outside the
    // support vector, so their stat budget is dead gold (Equinox: 20% crit riding
    // 80 tenacity). Enforced as a pool constraint.
    if (role === 'support' && (s.critical_chance > 0 || s.physical_penetration > 0)) return false;
    const offensive = s.physical_power || s.magical_power || s.attack_speed || s.critical_chance;
    if (!offensive) return true; // defensive and utility items always allowed
    if (power === 'physical') return s.physical_power > 0 || s.attack_speed > 0 || s.critical_chance > 0;
    // Magical kits (incl. hybrid-tagged mages like Zinx): physical power, crit and
    // lethality are wasted gold. Keep magical power, attack speed and ability haste
    // — which power MAGICAL on-hit items (Spectra/Prophecy) and Orion's haste→AS —
    // so an on-hit build resolves to magical on-hit, not physical crit.
    if (s.physical_power > 0 || s.critical_chance > 0 || s.physical_penetration > 0) return false;
    return s.magical_power > 0 || s.attack_speed > 0 || s.ability_haste > 0;
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
  opts: { level?: number; buildSize?: number; beamWidth?: number; scenario?: Scenario; role?: string; extraEffects?: ResolvedEffects; objectiveBias?: ObjKey[]; headlineOverride?: ObjKey } = {},
): GeneratedBuild[] {
  const level = opts.level ?? 13;
  const buildSize = opts.buildSize ?? 6;
  const beamWidth = opts.beamWidth ?? 24;
  const scenario = opts.scenario ?? {};
  const role = opts.role ?? kit.roles[0] ?? 'midlane';
  const objectiveKeys = role === 'support' ? SUPPORT_KEYS : COMBAT_KEYS;
  // A declared playstyle (from a hero's lane augment) steers the search:
  // it adds a corner that emphasises the playstyle's objectives, so builds
  // serving that intent survive the beam even when the augment's own
  // mechanic is unmodeled (the augment is used as a classifier, not math).
  const biasVectors: Weights[] = [];
  if (opts.objectiveBias && opts.objectiveBias.length) {
    const w: Weights = {};
    opts.objectiveBias.forEach((k, i) => { if (objectiveKeys.includes(k)) w[k] = i === 0 ? 1 : 0.5; });
    if (Object.keys(w).length) biasVectors.push(w);
  }
  const weightVectors = [...(role === 'support' ? SUPPORT_VECTORS : COMBAT_VECTORS), ...biasVectors];
  const candidates = relevantPool(kit, pool, role);
  // Non-item effects (an augment under evaluation) merge with each
  // candidate set's own item effects.
  const evalBuild = (items: Item[]) => opts.extraEffects
    ? evaluateBuild(kit, items, level, cal, mergeEffects(resolveItemEffects(items, { level }), opts.extraEffects))
    : evaluateBuild(kit, items, level, cal);

  // Normalizers so weight vectors compare across objective scales: the best
  // single-item value per objective.
  const singleEvals = candidates.map((i) => ({ item: i, ev: evalBuild([i]) }));
  const scale: Partial<Record<ObjKey, number>> = {};
  for (const k of objectiveKeys) {
    scale[k] = Math.max(...singleEvals.map((s) => s.ev.objectives[k]), 1);
  }
  const score = (ev: BuildEval, w: Weights) =>
    objectiveKeys.reduce((s, k) => s + (w[k] ?? 0) * (ev.objectives[k] / scale[k]!), 0);
  // Mana penalty: a build that cannot sustain its rotation through the early
  // item-timing stages loses score (down to MANA_FLOOR), so a mana-starved kit is
  // steered to bring a mana source online in time. Resourceless / mana-rich kits
  // are unaffected (factor 1). See stagedManaAdequacy in sim.ts.
  const MANA_FLOOR = 0.5;
  const manaFactor = (items: Item[]) => MANA_FLOOR + (1 - MANA_FLOOR) * stagedManaAdequacy(kit, items);

  type BeamState = { items: Item[]; ev: BuildEval; mana: number };
  let beam: BeamState[] = [{ items: [], ev: evalBuild([]), mana: 1 }];
  const complete: BeamState[] = [];

  for (let depth = 0; depth < buildSize; depth++) {
    const next: BeamState[] = [];
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
        next.push({ items, ev: evalBuild(items), mana: manaFactor(items) });
      }
    }
    // Keep the top of the beam under each corner weighting, mana-penalized.
    const kept = new Set<BeamState>();
    for (const w of weightVectors) {
      [...next].sort((a, b) => score(b.ev, w) * b.mana - score(a.ev, w) * a.mana).slice(0, beamWidth).forEach((s) => kept.add(s));
    }
    beam = [...kept];
    if (depth === buildSize - 1) complete.push(...beam);
  }

  const manaByEv = new Map(complete.map((c) => [c.ev, c.mana]));
  const headline = (opts.headlineOverride && objectiveKeys.includes(opts.headlineOverride))
    ? opts.headlineOverride : headlineObjective(kit, role);
  return paretoFront(complete.map((c) => c.ev), objectiveKeys)
    .sort((a, b) => b.objectives[headline] * (manaByEv.get(b) ?? 1) - a.objectives[headline] * (manaByEv.get(a) ?? 1))
    .map((ev, _i, front) => {
      const archetypes: string[] = [];
      for (const k of objectiveKeys) {
        const best = Math.max(...front.map((f) => f.objectives[k]));
        // best > 0: an objective nobody moves (a heal-less kit's heal output)
        // labels nothing.
        if (best > 0 && ev.objectives[k] >= best * 0.98) archetypes.push(ARCHETYPE_LABELS[k]);
      }
      return { ...ev, archetypes };
    });
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

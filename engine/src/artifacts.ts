// Per-hero artifact generation (Concept A's `engine` stage): everything
// the hero page's Answer zone needs, precomputed to JSON. All numbers come
// from the simulator, aggregates, and evidence layer; the coach line is a
// template over computed values (the LLM copy pass is backlog item 7).

import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { completedItems, type LoadedData } from './data.js';
import { archetypeLabel, buildTitle, generateBuilds, headlineObjective, type ObjKey } from './search.js';
import { classifyAugment, kitPlaystyle, laneTopAugment, lanesFor, playstyleObjectives } from './playstyle.js';
import { combatDamage, evaluateBuild, itemTotals, loadCalibration, unverifiedConstants, type Calibration } from './sim.js';
import { allEternalMinors, rankAugments, rankBlessings, selectEternalLoadout } from './eternals.js';
import { heroGames, itemPlayRate, loadAggregates } from './aggregates.js';
import { itemWinDelta, momPriorStrength } from './evidence.js';
import { defenseOf, matchupCheckpoints, orderBuild, spikeTimeline, levelAtMinute, type OrderedBuild } from './matchup.js';
import { resolveEntries, resolveItemEffects } from './effects.js';
import type { HeroKit, Item } from './types.js';

const ARTIFACTS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

interface PredggBuilds {
  heroes: Record<string, { core: string[]; coreSlugs: (string | null)[]; n: number; w: number }[]>;
  byRole?: Record<string, Record<string, { core: string[]; coreSlugs: (string | null)[]; n: number; w: number }[]>>;
}
let predggBuildsCache: PredggBuilds | null | undefined;
function loadPredggBuilds(): PredggBuilds | null {
  if (predggBuildsCache !== undefined) return predggBuildsCache;
  const p = path.join(ARTIFACTS_ROOT, 'data/aggregates/predgg-builds.json');
  predggBuildsCache = existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as PredggBuilds) : null;
  return predggBuildsCache;
}

interface PredggAugments {
  heroes: Record<string, Record<string, { augments: { id: string; name: string; n: number; w: number }[] }>>;
}
let predggAugmentsCache: PredggAugments | null | undefined;
function loadPredggAugments(): PredggAugments | null {
  if (predggAugmentsCache !== undefined) return predggAugmentsCache;
  const p = path.join(ARTIFACTS_ROOT, 'data/aggregates/predgg-augments.json');
  predggAugmentsCache = existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as PredggAugments) : null;
  return predggAugmentsCache;
}

// Optimizer-vs-field-core agreement (npm run agreement). Per-hero rows carry
// coreRecall + the field-core items the sim never builds. Computed every run
// but historically never surfaced; we read it here so a low-agreement hero can
// say so on the page instead of presenting a divergent build silently.
interface AgreementAudit {
  rows: { hero: string; lane: string; coreRecall: number; missed: string[] }[];
}
let agreementCache: AgreementAudit | null | undefined;
function loadAgreementAudit(): AgreementAudit | null {
  if (agreementCache !== undefined) return agreementCache;
  const p = path.join(ARTIFACTS_ROOT, 'data/aggregates/agreement-audit.json');
  agreementCache = existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as AgreementAudit) : null;
  return agreementCache;
}

// A RoleView is the full optimized build for ONE role: a flex hero (Zinx
// support vs mid) gets a distinct view per lane it plays — its own build,
// stage timeline, eternals, augments, meta cores, and matchups — because the
// right items, spikes, and counters change completely with the role.
const RoleView = z.object({
  role: z.string(),
  // Honest limitation surfaced on the page (e.g. supports: the model has
  // no heal/shield/aura objectives yet, so the build is max-damage only).
  roleCaveat: z.string().nullable(),
  confidence: z.object({
    level: z.literal('THEORY'),
    unverifiedConstants: z.array(z.string()),
    notes: z.array(z.string()),
  }),
  build: z.object({
    // Human-readable build title in the idiom players search for
    // ("Crit DPS Carry", "AP Burst") — deterministic from the item mix + kit.
    title: z.string(),
    items: z.array(z.object({
      name: z.string(),
      slug: z.string(),
      spikeMinute: z.number().nullable(),
      playRatePct: z.number().nullable(),
      evidenceDeltaWr: z.number().nullable(),
      evidenceN: z.number().nullable(),
    })),
    gold: z.number(),
    archetypes: z.array(z.string()),
    objectives: z.record(z.string(), z.number()),
    manaFeasible: z.boolean(),
  }),
  coachLine: z.string(),
  eternals: z.object({
    top: z.array(z.object({
      name: z.string(),
      id: z.string(),
      headlinePct: z.number(),
      burstPct: z.number(),
      rot20Pct: z.number(),
      ehpPct: z.number(),
    })),
    unmodeled: z.array(z.string()),
    // every ranked Eternal: modeled ones carry sim deltas, unmodeled ones
    // carry the registry's specific reason — so the page never says a
    // generic "not in our math" when a precise why exists
    all: z.array(z.object({
      name: z.string(),
      modeled: z.boolean(),
      headlinePct: z.number().nullable(),
      burstPct: z.number().nullable(),
      rot20Pct: z.number().nullable(),
      ehpPct: z.number().nullable(),
      note: z.string().nullable(),
    })),
    // when set, the Eternal deltas were computed WITH this augment's
    // modeled mechanics merged in (the augment-blind caveat is off)
    augmentAware: z.string().nullable(),
    // The recommended full loadout: the major PLUS a pick for each of the two
    // minor slots (Predecessor Eternals are 1 major + 2×(1-of-3) minors).
    // Each minor's value is the sim's marginal gain on top of the chosen major,
    // or the curated recommendation when the minor's mechanic isn't modeled.
    // Computed by selectEternalLoadout; null when no Eternal fits.
    loadout: z.object({
      major: z.object({ name: z.string(), modeled: z.boolean() }),
      minor1: z.object({ name: z.string(), modeled: z.boolean(), deltaPct: z.number().nullable(), note: z.string() }),
      minor2: z.object({ name: z.string(), modeled: z.boolean(), deltaPct: z.number().nullable(), note: z.string() }),
      note: z.string(),
    }).nullable(),
    // Conditioned minor pair for EVERY eternal, keyed by lowercased name, so the
    // page can show sub-options + reasoning under each top choice (not just the
    // single recommended loadout). Each minor: its marginal sim delta on top of
    // that major, or the curated pick when the mechanic is unmodeled.
    minorsByName: z.record(z.string(), z.object({
      minor1: z.object({ name: z.string(), modeled: z.boolean(), deltaPct: z.number().nullable(), note: z.string() }),
      minor2: z.object({ name: z.string(), modeled: z.boolean(), deltaPct: z.number().nullable(), note: z.string() }),
    })),
  }),
  augments: z.array(z.object({
    id: z.string(),
    name: z.string(),
    modeled: z.boolean(),
    provisional: z.boolean(),
    headlinePct: z.number().nullable(),
    burstPct: z.number().nullable(),
    rot20Pct: z.number().nullable(),
    ehpPct: z.number().nullable(),
    healShieldPct: z.number().nullable(),
    healShieldAbs: z.number().nullable(), // HP/10s, for kits with zero baseline heal
    note: z.string().nullable(),       // why unmodeled / modeling caveat
    buildShift: z.object({ in: z.array(z.string()), out: z.array(z.string()) }).nullable(),
  })),
  offMeta: z.object({
    candidates: z.array(z.object({
      item: z.string(),
      playRatePct: z.number(),
      bestObjective: z.string(),
      edgeVsPopularPct: z.number(),
    })),
    honestAbsence: z.string().nullable(),
  }),
  metaBuilds: z.array(z.object({
    title: z.string(),
    items: z.array(z.object({ name: z.string(), slug: z.string().nullable() })),
    n: z.number(),
    shrunkWr: z.number(),
    coreGold: z.number().nullable(),
    spikeMinute: z.number().nullable(),
    bestObjective: z.string().nullable(),
    whyLine: z.string(),
    optimizer: z.string().nullable(),
  })),
  // The build is not one fixed thing across the game: its prefix is evaluated
  // at early / mid / late stages (2 / 3 / 6 items, each at the level it
  // completes by from the gold curves). betterEarly flags when a stronger
  // stage build diverges from the eventual core — the right build by stage.
  stages: z.array(z.object({
    label: z.string(),            // early | mid | late
    itemCount: z.number(),
    minute: z.number().nullable(),
    level: z.number(),
    core: z.array(z.object({ name: z.string(), slug: z.string() })),
    headline: z.string(),
    headlineValue: z.number(),
    objectives: z.record(z.string(), z.number()),
    betterEarly: z.object({ inItem: z.string(), inSlug: z.string(), outItem: z.string(), edgePct: z.number() }).nullable(),
  })),
  matchups: z.array(z.object({
    enemy: z.string(),
    enemySlug: z.string(),
    gameplan: z.string(),
    checkpoints: z.array(z.object({ minute: z.number(), verdict: z.enum(['you', 'even', 'enemy']) })),
    counterSwap: z.object({
      out: z.string(),
      in: z.string(),
      inSlug: z.string(),
      survivalGainPct: z.number(),
      offenseLossPct: z.number(),
      line: z.string(),
    }).nullable(),
  })),
  // The augment the field commits to in THIS lane declares a playstyle the sim
  // can't read from the kit. We surface it next to the role's pure-optimum build:
  // which augment, what playstyle, whether the sim models it, and how steering
  // toward it would shift the build (shiftIn/shiftOut vs the optimum). Null when
  // the lane has no usable augment evidence. Replaces the old standalone
  // "Playstyle by lane" section — the per-role build now lives under the toggle.
  laneSteer: z.object({
    augment: z.object({ id: z.string(), name: z.string() }),
    playstyle: z.string(),
    modeled: z.boolean(),
    wr: z.number().nullable(),
    n: z.number().nullable(),
    shiftIn: z.array(z.string()),   // items the augment-steer adds vs the pure optimum
    shiftOut: z.array(z.string()),  // items it drops
    provenance: z.string(),
  }).nullable(),
});

export type RoleViewT = z.infer<typeof RoleView>;

export const HeroArtifact = RoleView.extend({
  slug: z.string(),
  name: z.string(),
  patch: z.string(),
  generatedAt: z.string(),
  damageType: z.string(),
  attackType: z.string(),
  // Playstyle-by-lane: the augment the field runs in each lane DECLARES a
  // playstyle the sim is otherwise blind to. We steer the build toward that
  // playstyle's objective corner and expose whether the augment's mechanic is
  // actually modeled or we are leaning on the declared intent + field evidence.
  laneFlex: z.array(z.object({
    lane: z.string(),
    augment: z.object({ id: z.string(), name: z.string() }),
    playstyle: z.string(),
    modeled: z.boolean(),         // does the sim compute the augment's effect?
    wr: z.number().nullable(),    // field winrate of that augment in that lane
    n: z.number().nullable(),
    core: z.array(z.object({ name: z.string(), slug: z.string() })), // steered build core
    headline: z.string(),         // the objective it is steered toward
    provenance: z.string(),       // the honest one-liner the page shows
  })),
  // Every role this hero flexes to, each a full RoleView. The top-level fields
  // above mirror the primary role's view for backward compatibility; the UI
  // toggles among `roles` to show a complete build per flex role.
  roles: z.array(RoleView),
  flags: z.array(z.string()),
});

export type HeroArtifactT = z.infer<typeof HeroArtifact>;

const OBJECTIVE_LABELS: Record<string, string> = {
  burstVsSquishy: 'burst vs squishies',
  rot10VsSquishy: '10s rotation vs squishies',
  rot20VsBruiser: '20s fight vs bruisers',
  autoDps10VsSquishy: 'sustained auto DPS',
  ehpPhysical: 'physical survivability',
  ehpMagical: 'magical survivability',
  sustain10s: 'lifesteal sustain',
};
// Support pages additionally explain builds through heal/shield output.
// (utility stays out of the label maps: "12 utility" is not a sentence.)
const SUPPORT_OBJECTIVE_LABELS: Record<string, string> = {
  ...OBJECTIVE_LABELS,
  healShield10s: 'heal/shield output',
};

/**
 * Quick counter swap: the single defensive substitution (3rd purchase)
 * that most blunts THIS enemy's 3-second all-in at the two-item stage,
 * sim-verified, with the offense cost stated. Null when nothing clears
 * a 10% survival gain.
 */
function counterSwap(kit: HeroKit, items: Item[], enemy: HeroKit, enemyItems: Item[], pool: Item[], cal: Calibration) {
  const level = 13;
  const prefix = items.slice(0, 3);
  const enemyPrefix = enemyItems.slice(0, 3);
  const stat: 'physical_armor' | 'magical_armor' | 'health' =
    enemy.damageType === 'physical' ? 'physical_armor' : enemy.damageType === 'magical' ? 'magical_armor' : 'health';
  const candidates = pool
    .filter((i) => i.stats[stat] > 0 && !prefix.some((p) => p.slug === i.slug))
    .sort((a, b) => b.stats[stat] - a.stats[stat])
    .slice(0, 3);
  if (!candidates.length || prefix.length < 3) return null;

  const enemyFx = resolveItemEffects(enemyPrefix, { level });
  const threat = (defenders: Item[]) =>
    combatDamage(enemy, enemyPrefix, { level, profile: defenseOf(kit, defenders, level), effects: enemyFx }, cal, 3) /
    defenseOf(kit, defenders, level).health;
  const myDamage = (own: Item[]) =>
    combatDamage(kit, own, { level, profile: defenseOf(enemy, enemyPrefix, level), effects: resolveItemEffects(own, { level }) }, cal, 3);

  const before = threat(prefix);
  const myBefore = myDamage(prefix);
  let best: { item: Item; gain: number; loss: number } | null = null;
  for (const cand of candidates) {
    const swapped = [prefix[0]!, prefix[1]!, cand];
    const gain = (before - threat(swapped)) / Math.max(before, 1e-9);
    const loss = (myBefore - myDamage(swapped)) / Math.max(myBefore, 1e-9);
    if (gain >= 0.1 && (!best || gain - loss * 0.5 > best.gain - best.loss * 0.5)) best = { item: cand, gain, loss };
  }
  if (!best) return null;
  return {
    out: prefix[2]!.name,
    in: best.item.name,
    inSlug: best.item.slug,
    survivalGainPct: Math.round(best.gain * 100),
    offenseLossPct: Math.round(best.loss * 100),
    line: `Losing lane? Third item ${best.item.name} instead of ${prefix[2]!.name}: their 3s all-in loses ${Math.round(best.gain * 100)}% of its bite, at the cost of ${Math.round(best.loss * 100)}% of this kit's damage.`,
  };
}

const headlineBuildCache = new Map<string, ReturnType<typeof generateBuilds>[number]>();

export function headlineBuild(kit: HeroKit, pool: Item[], cal: Calibration, beamWidth: number, role?: string) {
  const r = role ?? kit.roles[0] ?? 'midlane';
  const key = `${kit.slug}:${r}`;
  let b = headlineBuildCache.get(key);
  if (!b) {
    b = generateBuilds(kit, pool, cal, { beamWidth, role: r })[0]!;
    headlineBuildCache.set(key, b);
  }
  return b;
}

/** The most-played completed items on this hero that fit its damage profile. */
function popularBuild(kit: HeroKit, pool: Item[]): Item[] {
  const usable = pool.filter((i) => {
    const offensive = i.stats.physical_power || i.stats.magical_power || i.stats.attack_speed || i.stats.critical_chance;
    if (!offensive) return true;
    if (kit.damageType === 'physical') return i.stats.physical_power > 0 || i.stats.attack_speed > 0 || i.stats.critical_chance > 0;
    if (kit.damageType === 'magical') return i.stats.magical_power > 0;
    return true;
  });
  return usable
    .map((i) => ({ i, r: itemPlayRate(kit.slug, i.gameId) ?? 0 }))
    .sort((a, b) => b.r - a.r)
    .slice(0, 6)
    .map((x) => x.i);
}

/** Playstyle-by-lane: for each lane the hero has augment evidence in, the
 *  augment the field commits to declares a playstyle; steer the build toward
 *  it and expose whether the sim actually models that augment. This surfaces
 *  the flex (e.g. Zinx support-enchant vs mid on-hit) the single-role build
 *  can't show. */
/** The augment-steer for ONE lane, with the build-shift vs a base (pure-optimum)
 *  build. Drives the per-role "field runs X here" banner. */
function laneSteerFor(
  kit: HeroKit, role: string, pool: Item[], cal: Calibration, baseItems: string[],
): RoleViewT['laneSteer'] {
  const aug = laneTopAugment(kit.slug, role);
  if (!aug) return null;
  const cls = classifyAugment(`augment:${kit.slug}:${aug.id}`);
  if (!cls.playstyle) return null;
  const bias = playstyleObjectives(cls.playstyle, kit);
  const steered = generateBuilds(kit, pool, cal, { role, objectiveBias: bias as ObjKey[], headlineOverride: bias[0], beamWidth: 8 })[0];
  if (!steered) return null;
  const baseSet = new Set(baseItems);
  const steerSet = new Set(steered.items);
  const shiftIn = steered.items.filter((n) => !baseSet.has(n));
  const shiftOut = baseItems.filter((n) => !steerSet.has(n));
  const ev = ` — field ${role} ${(aug.wr * 100).toFixed(1)}% over ${aug.n.toLocaleString()} games`;
  const provenance = cls.modeled
    ? `“${aug.name}” ⇒ ${cls.playstyle}; the sim models this augment${ev}.`
    : `“${aug.name}” ⇒ ${cls.playstyle}; the sim can’t model this augment — steered by the declared playstyle + field evidence${ev}, magnitude not simulated.`;
  return {
    augment: { id: aug.id, name: aug.name }, playstyle: cls.playstyle, modeled: cls.modeled,
    wr: Math.round(aug.wr * 1000) / 10, n: aug.n, shiftIn, shiftOut, provenance,
  };
}

function computeLaneFlex(kit: HeroKit, pool: Item[], cal: Calibration): HeroArtifactT['laneFlex'] {
  const out: HeroArtifactT['laneFlex'] = [];
  const slugOf = new Map(pool.map((i) => [i.name, i.slug]));
  for (const lane of lanesFor(kit.slug).slice(0, 4)) {
    const aug = laneTopAugment(kit.slug, lane);
    if (!aug) continue;
    const cls = classifyAugment(`augment:${kit.slug}:${aug.id}`);
    if (!cls.playstyle) continue;
    const bias = playstyleObjectives(cls.playstyle, kit);
    const steered = generateBuilds(kit, pool, cal, { role: lane, objectiveBias: bias as ObjKey[], headlineOverride: bias[0], beamWidth: 8 })[0];
    if (!steered) continue;
    const ev = ` — field ${lane} ${(aug.wr * 100).toFixed(1)}% over ${aug.n.toLocaleString()} games`;
    const provenance = cls.modeled
      ? `“${aug.name}” ⇒ ${cls.playstyle}; the sim models this augment${ev}.`
      : `“${aug.name}” ⇒ ${cls.playstyle}; the sim can’t model this augment — steered by the declared playstyle + field evidence${ev}, magnitude not simulated.`;
    out.push({
      lane, augment: { id: aug.id, name: aug.name }, playstyle: cls.playstyle, modeled: cls.modeled,
      wr: Math.round(aug.wr * 1000) / 10, n: aug.n,
      core: steered.items.map((n) => ({ name: n, slug: slugOf.get(n) ?? '' })),
      headline: steered.archetypes[0] ?? cls.playstyle, provenance,
    });
  }
  return out;
}

/** Early / mid / late evaluation: the purchase-ordered build's prefix at the
 *  level it completes by, plus a check of whether a stronger STANDALONE build at
 *  that stage diverges from the eventual core (the right build differs by
 *  stage). Reuses the gold-curve completion minutes and the level table. */
function computeStages(
  kit: HeroKit, ordered: OrderedBuild, spikes: { minute: number | null }[],
  role: string, pool: Item[], cal: Calibration,
): HeroArtifactT['stages'] {
  const slugOf = new Map(pool.map((i) => [i.name, i.slug]));
  const fullSet = new Set(ordered.ordered.map((i) => i.slug));
  const headline = headlineObjective(kit, role);
  const defaultLevels: Record<string, number> = { early: 8, mid: 11, late: 15 };
  const plan: { label: string; count: number }[] = [
    { label: 'early', count: 2 }, { label: 'mid', count: 3 }, { label: 'late', count: Math.min(6, ordered.ordered.length) },
  ];
  return plan.map(({ label, count }) => {
    const prefix = ordered.ordered.slice(0, count);
    const minute = spikes[count - 1]?.minute ?? null;
    const level = minute != null ? levelAtMinute(minute, cal) : (defaultLevels[label] ?? 11);
    const ev = evaluateBuild(kit, prefix, level, cal);
    // Does a stronger standalone build at this stage use an item that is NOT in
    // the eventual core? Only meaningful before the build is complete.
    let betterEarly: HeroArtifactT['stages'][number]['betterEarly'] = null;
    if (count < ordered.ordered.length) {
      const optimal = generateBuilds(kit, pool, cal, { buildSize: count, level, role, beamWidth: 6 })[0];
      if (optimal) {
        const ours = (ev.objectives as Record<string, number>)[headline] ?? 0;
        const theirs = (optimal.objectives as Record<string, number>)[headline] ?? 0;
        const newItems = optimal.items.filter((n) => { const s = slugOf.get(n); return s && !fullSet.has(s); });
        if (newItems.length && ours > 0 && (theirs - ours) / ours > 0.1) {
          const inName = newItems[0]!;
          const outName = prefix.find((i) => !optimal.items.includes(i.name))?.name ?? '';
          betterEarly = { inItem: inName, inSlug: slugOf.get(inName) ?? '', outItem: outName, edgePct: Math.round(((theirs - ours) / ours) * 1000) / 10 };
        }
      }
    }
    return {
      label, itemCount: count, minute, level,
      core: prefix.map((i) => ({ name: i.name, slug: i.slug })),
      headline, headlineValue: Math.round((ev.objectives as Record<string, number>)[headline] ?? 0),
      objectives: ev.objectives as unknown as Record<string, number>,
      betterEarly,
    };
  });
}

/** The full optimized build + analysis for ONE role. A flex hero gets one of
 *  these per lane it plays; buildHeroArtifact assembles them into the artifact. */
function buildRoleView(
  kit: HeroKit, role: string, data: LoadedData, cal: Calibration, pool: Item[],
  opts: { beamWidth?: number; matchupEnemies?: number } = {},
): RoleViewT {
  const top = headlineBuild(kit, pool, cal, opts.beamWidth ?? 16, role);
  const items = top.items.map((n) => data.items.get(n)!);
  const ordered = orderBuild(kit, items, 13, cal);
  const spikes = spikeTimeline(role, ordered);

  const buildItems = ordered.ordered.map((item, idx) => {
    const r = itemPlayRate(kit.slug, item.gameId);
    const ev = itemWinDelta(kit.slug, item.gameId);
    return {
      name: item.name,
      slug: item.slug,
      spikeMinute: spikes[idx]!.minute,
      playRatePct: r == null ? null : Math.round(r * 1000) / 10,
      evidenceDeltaWr: ev ? Math.round(ev.delta * 1000) / 10 : null,
      evidenceN: ev ? ev.n : null,
    };
  });

  const objectiveLabels = role === 'support' ? SUPPORT_OBJECTIVE_LABELS : OBJECTIVE_LABELS;

  // Off-meta: underexplored items in the sim build, with the named
  // objective where the sim build beats the popularity build.
  const popular = popularBuild(kit, pool);
  const popularEval = popular.length >= 4 ? evaluateBuild(kit, popular, 13, cal) : null;
  const candidates: HeroArtifactT['offMeta']['candidates'] = [];
  if (popularEval) {
    for (const bi of buildItems) {
      if (bi.playRatePct == null || bi.playRatePct >= 2) continue;
      // Evidence gate (design doc, off-meta promotion): a candidate is
      // promoted only if the evidence layer does not contradict it. A
      // negative shrunk delta on a real sample means the field tried it
      // and lost — that is a sim blind-spot flag, not a find
      // (Deathstalker's uncapped-AS valuation was caught exactly here).
      if (bi.evidenceDeltaWr != null && bi.evidenceDeltaWr < 0 && (bi.evidenceN ?? 0) >= 20) continue;
      let bestObjective = '';
      let bestEdge = 0;
      for (const [key, label] of Object.entries(objectiveLabels)) {
        const ours = top.objectives[key as keyof typeof top.objectives];
        const theirs = popularEval.objectives[key as keyof typeof popularEval.objectives];
        if (theirs > 0) {
          const edge = ((ours - theirs) / theirs) * 100;
          if (edge > bestEdge) { bestEdge = edge; bestObjective = label; }
        }
      }
      if (bestEdge >= 8) {
        candidates.push({
          item: bi.name,
          playRatePct: bi.playRatePct,
          bestObjective,
          edgeVsPopularPct: Math.round(bestEdge * 10) / 10,
        });
      }
    }
  }

  // Hero augments: marginal sim deltas on the headline build, plus the
  // build the optimizer would switch to with the augment locked in.
  const r1 = (x: number | undefined) => Math.round((x ?? 0) * 10) / 10;
  const augRankings = rankAugments(kit, items, 13, cal, { minute: 15 });
  const baseTop8 = augRankings.some((r) => r.modeled)
    ? generateBuilds(kit, pool, cal, { beamWidth: 8, role })[0] ?? null
    : null;
  const augments = augRankings.map((r) => {
    const id = r.id.split(':')[1] ?? r.id; // r.id = '<hero>:<catalog-id>'
    let buildShift: { in: string[]; out: string[] } | null = null;
    if (r.modeled && baseTop8) {
      const fx = resolveEntries([`augment:${kit.slug}:${id}`], { level: 13, minute: 15 });
      const augTop = generateBuilds(kit, pool, cal, { beamWidth: 8, role, extraEffects: fx })[0];
      if (augTop) {
        const baseSet = new Set(baseTop8.items);
        const augSet = new Set(augTop.items);
        const swapIn = augTop.items.filter((n) => !baseSet.has(n));
        const swapOut = baseTop8.items.filter((n) => !augSet.has(n));
        if (swapIn.length) buildShift = { in: swapIn, out: swapOut };
      }
    }
    return {
      id,
      name: r.name.includes(' / ') ? r.name.split(' / ').slice(1).join(' / ') : r.name,
      modeled: r.modeled,
      provisional: r.provisional,
      headlinePct: r.modeled ? r1(r.headlinePct) : null,
      burstPct: r.modeled ? r1(r.deltas?.burstPct) : null,
      rot20Pct: r.modeled ? r1(r.deltas?.rot20Pct) : null,
      ehpPct: r.modeled ? r1(r.deltas?.ehpPct) : null,
      healShieldPct: r.modeled ? r1(r.deltas?.healShieldPct) : null,
      healShieldAbs: r.modeled ? Math.round(r.deltas?.healShieldAbs ?? 0) : null,
      note: r.unmodeledNotes[0]?.replace(/^[^:]+: /, '') ?? null,
      buildShift,
    };
  });

  // Eternals on the headline build — computed WITH the field's most-played
  // augment for this role whenever its mechanics are modeled, so the
  // sim-vs-field comparison is no longer augment-blind.
  const fieldAug = loadPredggAugments()?.heroes[kit.slug]?.[role]?.augments?.[0] ?? null;
  const fieldAugFx = fieldAug ? resolveEntries([`augment:${kit.slug}:${fieldAug.id}`], { level: 13, minute: 15 }) : null;
  const augmentAware = fieldAugFx?.applied.length ? fieldAug!.name : null;
  const blessings = rankBlessings(kit, items, 13, cal, { minute: 15, extraEffects: augmentAware ? fieldAugFx! : undefined });
  // The full recommended loadout (major + both minor slots), conditioned on the
  // kit. selectEternalLoadout already computes each minor's marginal sim gain on
  // top of the chosen major (or the curated pick when unmodeled); we just surface
  // it — previously it was computed only for the CLI and dropped before the page.
  const lo = selectEternalLoadout(kit, items, 13, cal, kitPlaystyle(kit, role), { minute: 15, role });
  const minorView = (m: { name: string; modeled: boolean; deltaPct?: number; note: string }) =>
    ({ name: m.name, modeled: m.modeled, deltaPct: m.deltaPct != null ? r1(m.deltaPct) : null, note: m.note });
  const loadout = lo
    ? {
        major: { name: lo.major.name.replace(' (Major)', ''), modeled: lo.major.modeled },
        minor1: minorView(lo.minor1),
        minor2: minorView(lo.minor2),
        note: lo.note,
      }
    : null;
  // Minor pair for every eternal (keyed by lowercased name) so each top choice
  // the page shows — not just the recommended loadout — carries its sub-options.
  const minorsRaw = allEternalMinors(kit, items, 13, cal, { minute: 15, role });
  const minorsByName: Record<string, { minor1: ReturnType<typeof minorView>; minor2: ReturnType<typeof minorView> }> = {};
  for (const [k, v] of Object.entries(minorsRaw)) minorsByName[k] = { minor1: minorView(v.minor1), minor2: minorView(v.minor2) };
  const eternals = {
    top: blessings.filter((r) => r.modeled).slice(0, 3).map((r) => ({
      name: r.name.replace(' (Major)', ''),
      id: r.id.split(':')[0] ?? r.id,
      headlinePct: r1(r.headlinePct),
      burstPct: r1(r.deltas?.burstPct),
      rot20Pct: r1(r.deltas?.rot20Pct),
      ehpPct: r1(r.deltas?.ehpPct),
    })),
    unmodeled: blessings.filter((r) => !r.modeled).map((r) => r.name.replace(' (Major)', '')),
    all: blessings.map((r) => ({
      name: r.name.replace(' (Major)', ''),
      modeled: r.modeled,
      headlinePct: r.modeled ? r1(r.headlinePct) : null,
      burstPct: r.modeled ? r1(r.deltas?.burstPct) : null,
      rot20Pct: r.modeled ? r1(r.deltas?.rot20Pct) : null,
      ehpPct: r.modeled ? r1(r.deltas?.ehpPct) : null,
      note: r.modeled ? null : (r.unmodeledNotes[0] ?? null),
    })),
    augmentAware,
    loadout,
    minorsByName,
  };

  // Matchups: most-played same-role heroes as default enemies.
  const agg = loadAggregates();
  const enemies = [...data.kits.values()]
    .filter((k) => k.slug !== kit.slug && (k.roles[0] ?? '') === role && heroGames(k.slug, agg) > 100)
    .sort((a, b) => heroGames(b.slug, agg) - heroGames(a.slug, agg))
    .slice(0, opts.matchupEnemies ?? 2);
  const matchups = enemies.map((enemy) => {
    const enemyItems = headlineBuild(enemy, pool, cal, 8).items.map((n) => data.items.get(n)!);
    const report = matchupCheckpoints(
      { kit, build: items, role },
      { kit: enemy, build: enemyItems, role: enemy.roles[0] ?? role },
      cal,
    );
    return {
      enemy: enemy.name,
      enemySlug: enemy.slug,
      gameplan: report.gameplan,
      checkpoints: report.checkpoints.map((c) => ({ minute: c.minute, verdict: c.verdict })),
      counterSwap: counterSwap(kit, items, enemy, enemyItems, pool, cal),
    };
  });

  // Meta builds, explained: pred.gg's most-played cores run through the
  // simulator so the page can say WHY each one wins and whether the
  // optimizer sees an upgrade.
  // Prefer this lane's own field cores (so a flex hero shows the build for the
  // role you're viewing, e.g. support Argus gets tank-support cores, not his
  // midlane mage cores); fall back to hero-wide evidence when a role has none.
  const pgBuilds = loadPredggBuilds();
  const evidence = pgBuilds?.byRole?.[kit.slug]?.[role] ?? pgBuilds?.heroes[kit.slug] ?? [];
  const cores = evidence.slice(0, 5);
  const coreCells = cores.map((c) => ({ n: c.n, w: c.w }));
  const coreMean = coreCells.reduce((s, c) => s + c.w, 0) / Math.max(coreCells.reduce((s, c) => s + c.n, 0), 1);
  const kCore = momPriorStrength(coreCells, coreMean || 0.5);
  const OBJ_LABELS: Record<string, string> = {
    burstVsSquishy: 'one-combo burst', rot10VsSquishy: '10s rotation damage',
    rot20VsBruiser: 'extended fights vs bruisers', autoDps10VsSquishy: 'sustained auto DPS',
    ehpPhysical: 'physical survivability', ehpMagical: 'magical survivability',
    sustain10s: 'lifesteal sustain',
    ...(role === 'support' ? { healShield10s: 'heal/shield output' } : {}),
  };
  const evaluated = cores.map((c) => {
    const coreItems = c.coreSlugs.every(Boolean) ? c.coreSlugs.map((s) => data.itemsBySlug.get(s!)).filter((x): x is Item => !!x) : null;
    const ev = coreItems && coreItems.length === 3 ? evaluateBuild(kit, coreItems, 13, cal) : null;
    const gold = coreItems ? coreItems.reduce((s, i) => s + i.totalPrice, 0) : null;
    let spikeMinute: number | null = null;
    if (coreItems) {
      const cum = coreItems.map((_, i) => coreItems.slice(0, i + 1).reduce((s, x) => s + x.totalPrice, 0));
      spikeMinute = spikeTimeline(role, { ordered: coreItems, cumulativeGold: cum })[2]?.minute ?? null;
    }
    return { c, ev, gold, spikeMinute, coreItems };
  });
  // An objective only explains a core if it separates the meta cores at
  // all (>=5% spread); otherwise every core would claim it on a tie.
  const objMax: Record<string, number> = {};
  const objDiscriminates: Record<string, boolean> = {};
  for (const key of Object.keys(OBJ_LABELS)) {
    const vals = evaluated.map((e) => e.ev?.objectives[key as keyof typeof e.ev.objectives] ?? 0).filter((v) => v > 0);
    objMax[key] = Math.max(...vals, 1e-9);
    objDiscriminates[key] = vals.length >= 2 && Math.max(...vals) / Math.max(Math.min(...vals), 1e-9) >= 1.05;
  }
  const headlineKey = headlineObjective(kit, role);
  const ourCoreEval = evaluateBuild(kit, ordered.ordered.slice(0, 3), 13, cal);
  const metaBuilds = evaluated.slice(0, 3).map(({ c, ev, gold, spikeMinute, coreItems }) => {
    const shrunkWr = (c.w + kCore * (coreMean || 0.5)) / (c.n + kCore);
    let bestObjective: string | null = null;
    let whyLine: string;
    let optimizer: string | null = null;
    let bestKey = '';
    if (ev) {
      let bestRel = -1;
      for (const key of Object.keys(OBJ_LABELS)) {
        if (!objDiscriminates[key]) continue;
        const rel = (ev.objectives[key as keyof typeof ev.objectives] ?? 0) / objMax[key]!;
        if (rel > bestRel) { bestRel = rel; bestKey = key; }
      }
      if (!bestKey) bestKey = headlineKey;
      bestObjective = OBJ_LABELS[bestKey]!;
      const OBJ_UNITS: Record<string, string> = {
        burstVsSquishy: 'damage in one combo', rot10VsSquishy: 'damage over a 10s rotation',
        rot20VsBruiser: 'damage over a 20s fight', autoDps10VsSquishy: 'auto-attack DPS',
        ehpPhysical: 'effective HP vs physical', ehpMagical: 'effective HP vs magical',
        healShield10s: 'HP healed or shielded over 10s',
        sustain10s: 'HP drained back over a 10s fight',
      };
      whyLine = `Strongest meta core for ${bestObjective}${spikeMinute ? `, online around minute ${spikeMinute}` : ''} — about ${Math.round(ev.objectives[bestKey as keyof typeof ev.objectives] ?? 0).toLocaleString('en-US')} ${OBJ_UNITS[bestKey] ?? ''} in the sim.`;
      const ours = ourCoreEval.objectives[bestKey as keyof typeof ourCoreEval.objectives] ?? 0;
      const theirs = ev.objectives[bestKey as keyof typeof ev.objectives] ?? 0;
      const edge = theirs > 0 ? ((ours - theirs) / theirs) * 100 : 0;
      const diffIdx = c.coreSlugs.findIndex((s, i) => s !== (ordered.ordered[i]?.slug ?? null));
      if (edge >= 8 && diffIdx >= 0) {
        const overName = (c.coreSlugs[diffIdx] && data.itemsBySlug.get(c.coreSlugs[diffIdx]!)?.name)
          ?? c.core[diffIdx]!.replace(/([a-z])([A-Z])/g, '$1 $2');
        const gain = edge >= 100 ? `${(edge / 100 + 1).toFixed(1)}× the` : `+${edge.toFixed(0)}% more`;
        optimizer = `Optimizer sees ${gain} ${bestObjective}: try ${ordered.ordered[diffIdx]!.name} over ${overName} (sim-only — the popular pick may carry utility the sim can't see; test it).`;
      } else if (Math.abs(edge) < 8) {
        optimizer = `Optimizer agrees: within ${Math.abs(edge).toFixed(0)}% of our best core on ${bestObjective}. The winrate is earned, not luck.`;
      }
    } else {
      whyLine = 'Evidence-only: one item in this core is not in our mechanics data yet, so the sim cannot decompose it.';
    }
    const title = coreItems && coreItems.length
      ? buildTitle(bestKey ? [archetypeLabel(bestKey)] : [], kit, coreItems)
      : 'Meta Core';
    return {
      title,
      items: c.core.map((name, i) => ({ name, slug: c.coreSlugs[i] ?? null })),
      n: c.n,
      shrunkWr: Math.round(shrunkWr * 1000) / 1000,
      coreGold: gold,
      spikeMinute,
      bestObjective,
      whyLine,
      optimizer,
    };
  });

  const firstSpike = spikes.find((s) => s.minute != null);
  const headline = objectiveLabels[headlineKey] ?? 'damage';
  const archList = top.archetypes.length > 2
    ? `${top.archetypes.slice(0, -1).join(', ')} and ${top.archetypes[top.archetypes.length - 1]}`
    : top.archetypes.join(' and ');
  const e0 = eternals.top[0];
  // Eternal deltas are damage/EHP math; on a support page "headline
  // output" would read as heal/shield, which Eternals do not touch.
  const e0headlineLabel = role === 'support' ? 'the damage rotation' : 'this kit’s main output';
  const e0best = e0
    ? ([[e0.headlinePct, e0headlineLabel], [e0.burstPct, 'the burst combo'], [e0.rot20Pct, '20-second fights'], [e0.ehpPct, 'effective HP']] as [number, string][])
        .sort((x, y) => y[0] - x[0])[0]!
    : null;
  const coachLine =
    `Sim-optimal for ${top.archetypes.length ? archList : headline}: ` +
    `first spike ${firstSpike ? `lands around minute ${firstSpike.minute} (${firstSpike.item})` : 'is late'}, ` +
    `third item by ${spikes[2]?.minute != null ? `minute ${spikes[2]!.minute}` : 'the 30+ minute mark'}.` +
    (e0 && e0best ? (e0best[0] > 0
      ? ` Take ${e0.name}: +${e0best[0]}% on ${e0best[1]} at minute 15.`
      : ` No modeled Eternal moves this kit's numbers much — check the field's pick on the page.`) : '');

  // D1 — disclose when the sim's first item diverges from the field. The
  // off-meta promoter already gates on a negative evidence delta; the headline
  // build did not, so one niche opener could lead a hero with no flag. Mirror
  // that gate here as a disclosure (we surface it, we don't silently reorder).
  const opener = buildItems[0];
  const openerNote = opener
    ? (opener.evidenceDeltaWr != null && opener.evidenceDeltaWr < 0 && (opener.evidenceN ?? 0) >= 20
        ? `the sim opens on ${opener.name}, which the field has tried and lost with (${opener.evidenceDeltaWr}% winrate over ${opener.evidenceN} games) — treat this opener as a sim blind-spot and weight the field`
        : opener.playRatePct != null && opener.playRatePct < 3
          ? `the sim opens on ${opener.name}, which the field rarely builds (${opener.playRatePct}% pick) — a sim-only call; compare the meta cores below`
          : null)
    : null;

  // D2 — disclose low optimizer-vs-field-core agreement (npm run agreement). The
  // audit is computed every run; surfacing it here means a hero whose sim build
  // shares little with what wins says so, instead of presenting it confidently.
  const audit = loadAgreementAudit()?.rows.find((r) => r.hero === kit.name && r.lane === role);
  const agreementNote = audit && audit.coreRecall < 0.5
    ? `the sim build reproduces only ${Math.round(audit.coreRecall * 100)}% of the field's core for ${kit.name}${audit.missed.length ? ` (it never builds ${audit.missed.join(', ')})` : ''} — some of those items ride mechanics the sim doesn't model yet`
    : null;

  // The max-damage-only caveat came off with the support output model
  // (backlog item 7): support builds now optimize heal/shield output,
  // survivability, poke, and utility. Remaining limits ride in
  // confidence.notes instead of a page-level warning.
  const roleCaveat = null;

  return RoleView.parse({
    role,
    roleCaveat,
    confidence: {
      level: 'THEORY',
      unverifiedConstants: unverifiedConstants(cal),
      notes: [
        'all combat numbers are simulator output on unverified constants',
        'checkpoint levels are provisional (no level timeline in the match feed)',
        'evidence deltas carry finished-inventory survivorship bias',
        ...(role === 'support'
          ? ['support model counts one beneficiary and active-ability heals/shields only (passive heals, CC, and damage-reduction utility are not scored)']
          : []),
        ...(itemTotals(items).attack_speed > 100
          ? ['this build stacks over +100% attack speed; the sim now caps attacks/sec at the stated 3.0 (Cursed Ring tooltip), so sustained-DPS is no longer uncapped — the exact cap interaction still merits a practice-mode check']
          : []),
        ...(openerNote ? [openerNote] : []),
        ...(agreementNote ? [agreementNote] : []),
      ],
    },
    build: {
      title: buildTitle(top.archetypes, kit, items),
      items: buildItems,
      gold: top.gold,
      archetypes: top.archetypes,
      objectives: top.objectives as unknown as Record<string, number>,
      manaFeasible: top.manaFeasible,
    },
    coachLine,
    eternals,
    augments,
    offMeta: {
      candidates,
      honestAbsence: candidates.length ? null : 'no defensible off-meta option this patch (no underexplored item clears the 8% objective edge vs the popular build)',
    },
    metaBuilds,
    stages: computeStages(kit, ordered, spikes, role, pool, cal),
    matchups,
    laneSteer: laneSteerFor(kit, role, pool, cal, top.items),
  });
}

/** Which roles a hero gets a full build for: its declared roles plus any lane it
 *  has real augment evidence in (the flex the field actually plays), primary
 *  first, deduped and capped so we don't generate builds for noise lanes. */
function flexRolesFor(kit: HeroKit): string[] {
  const primary = kit.roles[0] ?? 'midlane';
  const ordered = [primary, ...kit.roles, ...lanesFor(kit.slug)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of ordered) {
    if (!r || seen.has(r)) continue;
    seen.add(r);
    out.push(r);
  }
  return out.slice(0, 3);
}

export function buildHeroArtifact(
  kit: HeroKit, data: LoadedData, cal: Calibration = loadCalibration(),
  opts: { beamWidth?: number; matchupEnemies?: number } = {},
): HeroArtifactT {
  const pool = completedItems(data);
  const primary = kit.roles[0] ?? 'midlane';
  const roles = flexRolesFor(kit);
  const views = roles.map((role) => buildRoleView(kit, role, data, cal, pool, opts));
  const primaryView = views.find((v) => v.role === primary) ?? views[0]!;

  // Top-level fields mirror the primary role's view (backward compatibility with
  // the index, tests, and any reader that ignores `roles`); `roles` carries the
  // full build for every flex lane so the UI can toggle among them.
  return HeroArtifact.parse({
    ...primaryView,
    slug: kit.slug,
    name: kit.name,
    patch: cal.patch,
    generatedAt: new Date().toISOString(),
    damageType: kit.damageType,
    attackType: kit.attackType,
    laneFlex: computeLaneFlex(kit, pool, cal),
    roles: views,
    flags: [
      'THEORY: see engine/fixtures/CALIBRATION-CHECKLIST.md',
      'crests and consumables not yet in the build model; augments with tractable mechanics are simulated, the rest are listed unmodeled',
    ],
  });
}

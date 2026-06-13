// Per-hero artifact generation (Concept A's `engine` stage): everything
// the hero page's Answer zone needs, precomputed to JSON. All numbers come
// from the simulator, aggregates, and evidence layer; the coach line is a
// template over computed values (the LLM copy pass is backlog item 7).

import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { completedItems, type LoadedData } from './data.js';
import { generateBuilds, headlineObjective } from './search.js';
import { combatDamage, evaluateBuild, itemTotals, loadCalibration, unverifiedConstants, type Calibration } from './sim.js';
import { rankAugments, rankBlessings } from './eternals.js';
import { heroGames, itemPlayRate, loadAggregates } from './aggregates.js';
import { itemWinDelta, momPriorStrength } from './evidence.js';
import { defenseOf, matchupCheckpoints, orderBuild, spikeTimeline } from './matchup.js';
import { resolveEntries, resolveItemEffects } from './effects.js';
import type { HeroKit, Item } from './types.js';

const ARTIFACTS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

interface PredggBuilds {
  heroes: Record<string, { core: string[]; coreSlugs: (string | null)[]; n: number; w: number }[]>;
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

export const HeroArtifact = z.object({
  slug: z.string(),
  name: z.string(),
  patch: z.string(),
  generatedAt: z.string(),
  role: z.string(),
  damageType: z.string(),
  attackType: z.string(),
  // Honest limitation surfaced on the page (e.g. supports: the model has
  // no heal/shield/aura objectives yet, so the build is max-damage only).
  roleCaveat: z.string().nullable(),
  confidence: z.object({
    level: z.literal('THEORY'),
    unverifiedConstants: z.array(z.string()),
    notes: z.array(z.string()),
  }),
  build: z.object({
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
    items: z.array(z.object({ name: z.string(), slug: z.string().nullable() })),
    n: z.number(),
    shrunkWr: z.number(),
    coreGold: z.number().nullable(),
    spikeMinute: z.number().nullable(),
    bestObjective: z.string().nullable(),
    whyLine: z.string(),
    optimizer: z.string().nullable(),
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
    line: `Losing lane? Third item ${best.item.name} instead of ${prefix[2]!.name}: their 3s all-in loses ${Math.round(best.gain * 100)}% of its bite; you give up ${Math.round(best.loss * 100)}% of your damage.`,
  };
}

const headlineBuildCache = new Map<string, ReturnType<typeof generateBuilds>[number]>();

export function headlineBuild(kit: HeroKit, pool: Item[], cal: Calibration, beamWidth: number) {
  let b = headlineBuildCache.get(kit.slug);
  if (!b) {
    b = generateBuilds(kit, pool, cal, { beamWidth })[0]!;
    headlineBuildCache.set(kit.slug, b);
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

export function buildHeroArtifact(
  kit: HeroKit, data: LoadedData, cal: Calibration = loadCalibration(),
  opts: { beamWidth?: number; matchupEnemies?: number } = {},
): HeroArtifactT {
  const pool = completedItems(data);
  const role = kit.roles[0] ?? 'midlane';
  const top = headlineBuild(kit, pool, cal, opts.beamWidth ?? 16);
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
  const evidence = loadPredggBuilds()?.heroes[kit.slug] ?? [];
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
    return { c, ev, gold, spikeMinute };
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
  const metaBuilds = evaluated.slice(0, 3).map(({ c, ev, gold, spikeMinute }) => {
    const shrunkWr = (c.w + kCore * (coreMean || 0.5)) / (c.n + kCore);
    let bestObjective: string | null = null;
    let whyLine: string;
    let optimizer: string | null = null;
    if (ev) {
      let bestKey = '';
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
    return {
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
  const e0headlineLabel = role === 'support' ? 'your damage rotation' : 'your headline output';
  const e0best = e0
    ? ([[e0.headlinePct, e0headlineLabel], [e0.burstPct, 'your burst combo'], [e0.rot20Pct, '20-second fights'], [e0.ehpPct, 'your effective HP']] as [number, string][])
        .sort((x, y) => y[0] - x[0])[0]!
    : null;
  const coachLine =
    `Sim-optimal for ${top.archetypes.length ? archList : headline}: ` +
    `first spike ${firstSpike ? `lands around minute ${firstSpike.minute} (${firstSpike.item})` : 'is late'}, ` +
    `third item by ${spikes[2]?.minute != null ? `minute ${spikes[2]!.minute}` : 'the 30+ minute mark'}.` +
    (e0 && e0best ? (e0best[0] > 0
      ? ` Take ${e0.name}: +${e0best[0]}% on ${e0best[1]} at minute 15.`
      : ` No modeled Eternal moves this kit's numbers much — check the field's pick on the page.`) : '');

  // The max-damage-only caveat came off with the support output model
  // (backlog item 7): support builds now optimize heal/shield output,
  // survivability, poke, and utility. Remaining limits ride in
  // confidence.notes instead of a page-level warning.
  const roleCaveat = null;

  return HeroArtifact.parse({
    slug: kit.slug,
    name: kit.name,
    patch: cal.patch,
    generatedAt: new Date().toISOString(),
    role,
    damageType: kit.damageType,
    attackType: kit.attackType,
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
          ? ['this build stacks over +100% attack speed and the sim has NO measured attack-speed cap (calibration checklist 7) — sustained-DPS numbers are optimistic until the cap is measured']
          : []),
      ],
    },
    build: {
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
    matchups,
    flags: [
      'THEORY: see engine/fixtures/CALIBRATION-CHECKLIST.md',
      'crests and consumables not yet in the build model; augments with tractable mechanics are simulated, the rest are listed unmodeled',
    ],
  });
}

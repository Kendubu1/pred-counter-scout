// Per-hero artifact generation (Concept A's `engine` stage): everything
// the hero page's Answer zone needs, precomputed to JSON. All numbers come
// from the simulator, aggregates, and evidence layer; the coach line is a
// template over computed values (the LLM copy pass is backlog item 7).

import { z } from 'zod';
import { completedItems, type LoadedData } from './data.js';
import { generateBuilds, headlineObjective } from './search.js';
import { evaluateBuild, loadCalibration, unverifiedConstants, type Calibration } from './sim.js';
import { rankBlessings } from './eternals.js';
import { heroGames, itemPlayRate, loadAggregates } from './aggregates.js';
import { itemWinDelta } from './evidence.js';
import { matchupCheckpoints, orderBuild, spikeTimeline } from './matchup.js';
import type { HeroKit, Item } from './types.js';

export const HeroArtifact = z.object({
  slug: z.string(),
  name: z.string(),
  patch: z.string(),
  generatedAt: z.string(),
  role: z.string(),
  damageType: z.string(),
  attackType: z.string(),
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
  }),
  offMeta: z.object({
    candidates: z.array(z.object({
      item: z.string(),
      playRatePct: z.number(),
      bestObjective: z.string(),
      edgeVsPopularPct: z.number(),
    })),
    honestAbsence: z.string().nullable(),
  }),
  matchups: z.array(z.object({
    enemy: z.string(),
    enemySlug: z.string(),
    gameplan: z.string(),
    checkpoints: z.array(z.object({ minute: z.number(), verdict: z.enum(['you', 'even', 'enemy']) })),
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
};

const headlineBuildCache = new Map<string, ReturnType<typeof generateBuilds>[number]>();

function headlineBuild(kit: HeroKit, pool: Item[], cal: Calibration, beamWidth: number) {
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

  // Off-meta: underexplored items in the sim build, with the named
  // objective where the sim build beats the popularity build.
  const popular = popularBuild(kit, pool);
  const popularEval = popular.length >= 4 ? evaluateBuild(kit, popular, 13, cal) : null;
  const candidates: HeroArtifactT['offMeta']['candidates'] = [];
  if (popularEval) {
    for (const bi of buildItems) {
      if (bi.playRatePct == null || bi.playRatePct >= 2) continue;
      let bestObjective = '';
      let bestEdge = 0;
      for (const [key, label] of Object.entries(OBJECTIVE_LABELS)) {
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

  // Eternals on the headline build.
  const blessings = rankBlessings(kit, items, 13, cal, { minute: 15 });
  const eternals = {
    top: blessings.filter((r) => r.modeled).slice(0, 3).map((r) => ({
      name: r.name.replace(' (Major)', ''),
      id: r.id.split(':')[0] ?? r.id,
      headlinePct: Math.round((r.headlinePct ?? 0) * 10) / 10,
      burstPct: Math.round((r.deltas?.burstPct ?? 0) * 10) / 10,
      rot20Pct: Math.round((r.deltas?.rot20Pct ?? 0) * 10) / 10,
      ehpPct: Math.round((r.deltas?.ehpPct ?? 0) * 10) / 10,
    })),
    unmodeled: blessings.filter((r) => !r.modeled).map((r) => r.name.replace(' (Major)', '')),
  };

  // Matchups: most-played same-role heroes as default enemies.
  const agg = loadAggregates();
  const enemies = [...data.kits.values()]
    .filter((k) => k.slug !== kit.slug && (k.roles[0] ?? '') === role && heroGames(k.slug, agg) > 100)
    .sort((a, b) => heroGames(b.slug, agg) - heroGames(a.slug, agg))
    .slice(0, opts.matchupEnemies ?? 2);
  const matchups = enemies.map((enemy) => {
    const eTop = headlineBuild(enemy, pool, cal, 8);
    const report = matchupCheckpoints(
      { kit, build: items, role },
      { kit: enemy, build: eTop.items.map((n) => data.items.get(n)!), role: enemy.roles[0] ?? role },
      cal,
    );
    return {
      enemy: enemy.name,
      enemySlug: enemy.slug,
      gameplan: report.gameplan,
      checkpoints: report.checkpoints.map((c) => ({ minute: c.minute, verdict: c.verdict })),
    };
  });

  const firstSpike = spikes.find((s) => s.minute != null);
  const headline = OBJECTIVE_LABELS[headlineObjective(kit)] ?? 'damage';
  const coachLine =
    `Sim-optimal for ${top.archetypes.length ? top.archetypes.join(' and ') : headline}: ` +
    `first spike ${firstSpike ? `lands around minute ${firstSpike.minute} (${firstSpike.item})` : 'is late'}, ` +
    `third item by ${spikes[2]?.minute != null ? `minute ${spikes[2]!.minute}` : 'the 30+ minute mark'}.` +
    (eternals.top[0] ? ` Take ${eternals.top[0].name}: +${eternals.top[0].headlinePct}% on your headline output at minute 15.` : '');

  return HeroArtifact.parse({
    slug: kit.slug,
    name: kit.name,
    patch: cal.patch,
    generatedAt: new Date().toISOString(),
    role,
    damageType: kit.damageType,
    attackType: kit.attackType,
    confidence: {
      level: 'THEORY',
      unverifiedConstants: unverifiedConstants(cal),
      notes: [
        'all combat numbers are simulator output on unverified constants',
        'checkpoint levels are provisional (no level timeline in the match feed)',
        'evidence deltas carry finished-inventory survivorship bias',
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
    offMeta: {
      candidates,
      honestAbsence: candidates.length ? null : 'no defensible off-meta option this patch (no underexplored item clears the 8% objective edge vs the popular build)',
    },
    matchups,
    flags: [
      'THEORY: see engine/fixtures/CALIBRATION-CHECKLIST.md',
      'crest, augments, and consumables not yet in the build model',
    ],
  });
}

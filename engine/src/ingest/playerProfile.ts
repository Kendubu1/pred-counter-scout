// Shared player-profile pull + analysis for coach.ts and squad.ts.
// One API call per player; shrinkage and baseline logic identical for
// every report so numbers agree across pages.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql } from './predgg.js';
import { loadAggregates } from '../aggregates.js';
import { momPriorStrength } from '../evidence.js';
import { loadData, type LoadedData } from '../data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface RawProfile {
  name: string | null; favRole: string | null; lastPlayedAt: string;
  ratings: { rating: { id: string; name: string }; points: number; ranking: number; percentile: number | null; rank: { name: string } | null; peakPoints: number }[];
  generalStatistic: { result: { matchesPlayed: number; matchesWon: number; mostPlayedRole: string | null; totalKills: number; totalDeaths: number; totalAssists: number } };
  roleStatistics: { results: { role: string; matchesPlayed: number; matchesWon: number }[] };
  heroStatistics: { results: { hero: { slug: string; name: string }; matchesPlayed: number; matchesWon: number; totalKills: number; totalDeaths: number; totalAssists: number; totalHeroDamage: number }[] };
}

export async function pullProfile(uuid: string): Promise<RawProfile> {
  const d = await gql<{ player: RawProfile }>(`{ player(by: { uuid: "${uuid}" }) {
    name favRole lastPlayedAt
    ratings { rating { id name } points ranking percentile rank { name } peakPoints }
    generalStatistic { result { matchesPlayed matchesWon mostPlayedRole totalKills totalDeaths totalAssists } }
    roleStatistics { results { role matchesPlayed matchesWon } }
    heroStatistics { results { hero { slug name } matchesPlayed matchesWon totalKills totalDeaths totalAssists totalHeroDamage } }
  } }`);
  return d.player;
}

// Maintainer-supplied display names for API-private profiles (the API
// returns null for their name; the stats are unaffected).
export const NAME_OVERRIDES: Record<string, string> = {
  'a0c393cc-1437-4bdc-8168-64676ce2166c': 'Cuban Noobster',
};

export const shrink = (w: number, n: number, prior: number, k: number) => (w + k * prior) / (n + k);

export const PLATINUM_VP = 900; // Platinum III ratingMin, pred.gg rank table, Season 1 Split 4

/**
 * Data-derived player archetype: a crisp identity with its receipt.
 * Deterministic rules, first match wins; every label cites numbers.
 */
export function archetype(a: AnalyzedPlayer): { label: string; receipt: string } {
  const deep = a.roles.filter((r) => r.games >= 100);
  const totalRoleGames = a.roles.reduce((s, r) => s + r.games, 0) || 1;
  const topShare = (a.roles.slice().sort((x, y) => y.games - x.games)[0]?.games ?? 0) / totalRoleGames;
  const top3Share = a.pool.slice(0, 3).reduce((s, h) => s + h.games, 0) / Math.max(a.career.games, 1);
  const spread = deep.length ? Math.max(...deep.map((r) => r.shrunkWr)) - Math.min(...deep.map((r) => r.shrunkWr)) : 0;

  // 4 points of SHRUNK spread is large; shrinkage compresses raw gaps.
  if (deep.length >= 4 && spread >= 0.04) {
    return { label: 'The Flex With A Secret', receipt: `${deep.length} roles at 100+ games, but a ${(spread * 100).toFixed(1)}-point winrate gap between best and worst — versatility is hiding a specialty.` };
  }
  if (deep.length >= 4) {
    return { label: 'The True Flex', receipt: `${deep.length} roles at 100+ games within ${(spread * 100).toFixed(1)} points of each other — genuinely fill-proof.` };
  }
  if (topShare >= 0.5 && top3Share >= 0.5) {
    return { label: 'The Specialist', receipt: `${(topShare * 100).toFixed(0)}% of games in one role, ${(top3Share * 100).toFixed(0)}% on three heroes — a sharpened edge.` };
  }
  if (top3Share < 0.4) {
    return { label: 'The Wanderer', receipt: `top three heroes are only ${(top3Share * 100).toFixed(0)}% of ${a.career.games} games — breadth tax in every queue.` };
  }
  return { label: 'The Grinder', receipt: `${a.career.games} games of steady volume at ${(a.career.winrate * 100).toFixed(1)}% — the climb is about where the games go, not how many.` };
}

/**
 * The ledger: every recommendation priced in wins per 100 games, with its
 * receipt. Entries are not independent and say so.
 */
export function buildLedger(a: AnalyzedPlayer) {
  const entries: { change: string; winsPer100: number; receipt: string }[] = [];
  const overall = a.career.winrate;
  const best = a.roles.filter((r) => r.games >= 100)[0];
  const worst = [...a.roles].filter((r) => r.games >= 100).sort((x, y) => x.shrunkWr - y.shrunkWr)[0];
  if (best && best.shrunkWr > overall + 0.005) {
    entries.push({
      change: `Queue ${best.role} instead of your average mix`,
      winsPer100: Math.round((best.shrunkWr - overall) * 1000) / 10,
      receipt: `${(best.shrunkWr * 100).toFixed(1)}% there vs ${(overall * 100).toFixed(1)}% overall, ${best.games} games of evidence`,
    });
  }
  if (worst && best && worst.role !== best.role && worst.shrunkWr < overall - 0.01) {
    entries.push({
      change: `Move your ${worst.role} games to ${best.role}`,
      winsPer100: Math.round((best.shrunkWr - worst.shrunkWr) * 1000) / 10,
      receipt: `${(worst.shrunkWr * 100).toFixed(1)}% vs ${(best.shrunkWr * 100).toFixed(1)}%, per 100 games shifted`,
    });
  }
  const hero = a.pool.filter((h) => h.games >= 75 && h.shrunkWr > overall + 0.01).sort((x, y) => y.shrunkWr - x.shrunkWr)[0];
  if (hero) {
    entries.push({
      change: `Spend marginal games on ${hero.name}`,
      winsPer100: Math.round((hero.shrunkWr - overall) * 1000) / 10,
      receipt: `${(hero.shrunkWr * 100).toFixed(1)}% on ${hero.name} (${hero.games}g) vs ${(overall * 100).toFixed(1)}% overall`,
    });
  }
  return {
    entries: entries.sort((x, y) => y.winsPer100 - x.winsPer100),
    note: 'wins per 100 games spent on each change; entries overlap and do not sum',
  };
}

/** The full coach-report object rendered by ui/v6/coach.html. Shared so
 *  the lead's coach.json and every squad member's report agree. */
export function buildCoachReport(a: AnalyzedPlayer, lastPlayedAt: string) {
  const overallWr = a.career.winrate;
  const leanInto = a.pool
    .filter((h) => h.games >= 75 && h.edge != null && h.edge >= 0.02 && h.shrunkWr >= 0.52)
    .sort((x, y) => (y.edge! * Math.log(y.games)) - (x.edge! * Math.log(x.games)))
    .slice(0, 4);
  const park = a.pool.filter((h) => h.games >= 30 && h.shrunkWr <= 0.47).slice(0, 4);
  const bestRole = a.roles.filter((r) => r.games >= 100)[0] ?? a.roles[0];
  const worstRole = [...a.roles].filter((r) => r.games >= 100).sort((x, y) => x.shrunkWr - y.shrunkWr)[0] ?? null;
  const top3Share = a.pool.slice(0, 3).reduce((s, h) => s + h.games, 0) / Math.max(a.career.games, 1);
  const current = a.current ?? { points: 0, rank: null, split: 'unranked' };

  const plan: string[] = [];
  if (bestRole) {
    plan.push(`Queue ${bestRole.role} as primary. It is your best role at ${(bestRole.shrunkWr * 100).toFixed(1)}% over ${bestRole.games} games (your overall is ${(overallWr * 100).toFixed(1)}%). Set ${a.favRole?.toLowerCase() ?? 'your current fav'} as secondary, not the other way around.`);
  }
  if (worstRole && worstRole.shrunkWr < overallWr - 0.02) {
    plan.push(`Stop queueing ${worstRole.role}: ${(worstRole.rawWr * 100).toFixed(1)}% over ${worstRole.games} games is costing real VP. When auto-filled there, play your safest comfort pick, not a learning pick.`);
  }
  if (leanInto.length) {
    plan.push(`Two-hero rule for the climb: ${leanInto.slice(0, 2).map((h) => h.name).join(' and ')}. You beat the field on them by ${leanInto.slice(0, 2).map((h) => `+${((h.edge ?? 0) * 100).toFixed(1)}`).join(' and ')} points of winrate.`);
  }
  plan.push(`Your champion pool is ${a.pool.length}+ heroes wide and your top three are only ${(top3Share * 100).toFixed(0)}% of your games. Gold-to-Platinum climbs are almost always pool-narrowing stories: aim for 70%+ of games on your top three.`);
  if (park.length) {
    plan.push(`Park ${park.map((h) => h.name).join(', ')} for ranked: ${park.map((h) => `${(h.rawWr * 100).toFixed(0)}% over ${h.games}`).join('; ')}. Keep them for normals.`);
  }
  plan.push(`The math: you are at ${current.points} VP; Platinum III starts at ${PLATINUM_VP}. Your all-time peak is ${a.peakAllTime}${a.peakAllTime >= PLATINUM_VP ? ' — you have already touched Platinum-level rating once; this is a consistency problem, not a ceiling problem' : ''}.`);

  return {
    generatedAt: new Date().toISOString(),
    source: 'pred.gg public profile + own aggregate baselines',
    archetype: archetype(a),
    ledger: buildLedger(a),
    player: {
      name: a.name, uuid: a.uuid, favRole: a.favRole, lastPlayedAt,
      career: a.career,
      ratings: a.ratings.map((r) => ({ ...r, percentile: null as number | null })),
      current,
    },
    goal: { tier: 'Platinum III', vp: PLATINUM_VP, gapVp: Math.max(0, PLATINUM_VP - current.points), peakAllTime: a.peakAllTime },
    roles: a.roles,
    pool: a.pool,
    leanInto,
    park,
    poolWidth: { heroesPlayed20Plus: a.pool.length, top3Share },
    plan,
    honesty: [
      'personal winrates are shrunk toward your own average (small heater samples do not count as mains)',
      'field baselines are all-ranks aggregates from our current-patch match sample, not Gold-bracket-specific yet',
      'winrate edges are observational; they say where you win, not why',
    ],
  };
}

export interface AnalyzedPlayer {
  uuid: string;
  name: string;            // 'Private player' when hidden
  isPrivate: boolean;
  favRole: string | null;
  career: { games: number; winrate: number; kda: number; deathsPerGame: number };
  current: { points: number; rank: string | null; split: string } | null;
  peakAllTime: number;
  ratings: { split: string; points: number; peak: number; rank: string | null }[];
  roles: { role: string; games: number; rawWr: number; shrunkWr: number }[];
  pool: {
    slug: string; name: string; games: number; rawWr: number; shrunkWr: number;
    kda: number; deathsPerGame: number; fieldWr: number | null; edge: number | null;
    primaryRole: string | null; engineEternal: string | null; engineCoachLine: string | null;
  }[];
}

export function analyzeProfile(uuid: string, p: RawProfile, data: LoadedData = loadData()): AnalyzedPlayer {
  const g = p.generalStatistic.result;
  const overallWr = g.matchesWon / Math.max(g.matchesPlayed, 1);
  const agg = loadAggregates();

  const kHero = momPriorStrength(p.heroStatistics.results.map((h) => ({ n: h.matchesPlayed, w: h.matchesWon })), overallWr);
  const fieldCells = agg ? Object.values(agg.heroes).map((x) => ({ n: x.games, w: x.wins })) : [];
  const kField = fieldCells.length ? momPriorStrength(fieldCells, 0.5) : 50;

  const pool = p.heroStatistics.results
    .filter((h) => h.matchesPlayed >= 20)
    .map((h) => {
      const sh = shrink(h.matchesWon, h.matchesPlayed, overallWr, kHero);
      const fh = agg?.heroes[h.hero.slug];
      const fieldWr = fh ? shrink(fh.wins, fh.games, 0.5, kField) : null;
      const art = path.join(ROOT, 'data/artifacts', `${h.hero.slug}.json`);
      const artifact = existsSync(art) ? JSON.parse(readFileSync(art, 'utf8')) : null;
      return {
        slug: h.hero.slug,
        name: data.kits.get(h.hero.slug)?.name ?? h.hero.name,
        games: h.matchesPlayed,
        rawWr: h.matchesWon / h.matchesPlayed,
        shrunkWr: sh,
        kda: (h.totalKills + h.totalAssists) / Math.max(h.totalDeaths, 1),
        deathsPerGame: h.totalDeaths / h.matchesPlayed,
        fieldWr,
        edge: fieldWr != null ? sh - fieldWr : null,
        primaryRole: fh ? Object.entries(fh.byRole ?? {}).sort((a, b) => b[1].n - a[1].n)[0]?.[0] ?? null : data.kits.get(h.hero.slug)?.roles[0] ?? null,
        engineEternal: artifact?.eternals?.top?.[0]?.name ?? null,
        engineCoachLine: artifact?.coachLine ?? null,
      };
    })
    .sort((a, b) => b.games - a.games);

  const kRole = momPriorStrength(p.roleStatistics.results.map((r) => ({ n: r.matchesPlayed, w: r.matchesWon })), overallWr);
  const roles = p.roleStatistics.results
    .map((r) => ({
      role: r.role.toLowerCase(),
      games: r.matchesPlayed,
      rawWr: r.matchesWon / Math.max(r.matchesPlayed, 1),
      shrunkWr: shrink(r.matchesWon, r.matchesPlayed, overallWr, kRole),
    }))
    .sort((a, b) => b.shrunkWr - a.shrunkWr);

  const current = p.ratings.length ? p.ratings[p.ratings.length - 1]! : null;
  return {
    uuid,
    name: p.name ?? NAME_OVERRIDES[uuid] ?? 'Private player',
    isPrivate: !p.name,
    favRole: p.favRole,
    career: {
      games: g.matchesPlayed,
      winrate: overallWr,
      kda: (g.totalKills + g.totalAssists) / Math.max(g.totalDeaths, 1),
      deathsPerGame: g.totalDeaths / Math.max(g.matchesPlayed, 1),
    },
    current: current ? { points: current.points, rank: current.rank?.name ?? null, split: current.rating.name } : null,
    peakAllTime: p.ratings.length ? Math.max(...p.ratings.map((r) => r.peakPoints)) : 0,
    ratings: p.ratings.map((r) => ({ split: r.rating.name, points: r.points, peak: r.peakPoints, rank: r.rank?.name ?? null })),
    roles,
    pool,
  };
}

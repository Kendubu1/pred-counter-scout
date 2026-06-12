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

export const shrink = (w: number, n: number, prior: number, k: number) => (w + k * prior) / (n + k);

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
    name: p.name ?? 'Private player',
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

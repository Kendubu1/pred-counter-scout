// Personal coach report: pulls one player's pred.gg profile (2 API calls),
// joins it against our own evidence baselines, and writes a transparent,
// numbers-first improvement plan to data/artifacts/coach.json.
//
//   npm run coach -- <player-uuid>
//
// Every verdict carries the numbers that justify it. Personal winrates are
// EB-shrunk (prior = the player's own overall winrate) so a 30-game heater
// does not read as a main. Baselines are our all-ranks aggregate shrunk
// winrates; noted honestly on the page.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';
import { loadAggregates } from '../aggregates.js';
import { momPriorStrength } from '../evidence.js';
import { loadData } from '../data.js';
import { readFileSync, existsSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PLATINUM_VP = 900; // Platinum III ratingMin, pred.gg rank table, Season 1 Split 4

interface HeroStat { hero: { slug: string; name: string }; matchesPlayed: number; matchesWon: number; totalKills: number; totalDeaths: number; totalAssists: number; totalHeroDamage: number }

async function main() {
  const uuid = process.argv[2];
  if (!uuid) { console.error('usage: npm run coach -- <player-uuid>'); process.exit(1); }
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }

  const d = await gql<{
    player: {
      name: string; favRole: string | null; lastPlayedAt: string;
      ratings: { rating: { id: string; name: string }; points: number; ranking: number; percentile: number | null; rank: { name: string } | null; peakPoints: number }[];
      generalStatistic: { result: { matchesPlayed: number; matchesWon: number; mostPlayedRole: string | null; totalKills: number; totalDeaths: number; totalAssists: number } };
      roleStatistics: { results: { role: string; matchesPlayed: number; matchesWon: number }[] };
      heroStatistics: { results: HeroStat[] };
    };
  }>(`{ player(by: { uuid: "${uuid}" }) {
      name favRole lastPlayedAt
      ratings { rating { id name } points ranking percentile rank { name } peakPoints }
      generalStatistic { result { matchesPlayed matchesWon mostPlayedRole totalKills totalDeaths totalAssists } }
      roleStatistics { results { role matchesPlayed matchesWon } }
      heroStatistics { results { hero { slug name } matchesPlayed matchesWon totalKills totalDeaths totalAssists totalHeroDamage } }
    } }`);
  const p = d.player;
  const g = p.generalStatistic.result;
  const overallWr = g.matchesWon / Math.max(g.matchesPlayed, 1);

  // Personal shrinkage: prior = own overall winrate.
  const heroCells = p.heroStatistics.results.map((h) => ({ n: h.matchesPlayed, w: h.matchesWon }));
  const kHero = momPriorStrength(heroCells, overallWr);
  const shrink = (w: number, n: number, prior: number, k: number) => (w + k * prior) / (n + k);

  // Baselines: our own aggregate evidence (all ranks, current patch window).
  const agg = loadAggregates();
  const data = loadData();
  const baseline = (slug: string): { wr: number; role: string } | null => {
    const h = agg?.heroes[slug];
    if (!h) return null;
    const roles = Object.entries(h.byRole ?? {}).sort((a, b) => b[1].n - a[1].n);
    if (!roles.length) return null;
    const cells = Object.values(agg!.heroes).map((x) => ({ n: x.games, w: x.wins }));
    const k = momPriorStrength(cells, 0.5);
    return { wr: (h.wins + k * 0.5) / (h.games + k), role: roles[0]![0] };
  };

  const pool = p.heroStatistics.results
    .filter((h) => h.matchesPlayed >= 20)
    .map((h) => {
      const sh = shrink(h.matchesWon, h.matchesPlayed, overallWr, kHero);
      const base = baseline(h.hero.slug);
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
        fieldWr: base?.wr ?? null,
        edge: base ? sh - base.wr : null,
        primaryRole: base?.role ?? data.kits.get(h.hero.slug)?.roles[0] ?? null,
        engineCoachLine: artifact?.coachLine ?? null,
        engineEternal: artifact?.eternals?.top?.[0]?.name ?? null,
      };
    })
    .sort((a, b) => b.games - a.games);

  const leanInto = pool
    .filter((h) => h.games >= 75 && h.edge != null && h.edge >= 0.02 && h.shrunkWr >= 0.52)
    .sort((a, b) => (b.edge! * Math.log(b.games)) - (a.edge! * Math.log(a.games)))
    .slice(0, 4);
  const park = pool.filter((h) => h.games >= 30 && h.shrunkWr <= 0.47).slice(0, 4);

  const roles = p.roleStatistics.results
    .map((r) => {
      const cells = p.roleStatistics.results.map((x) => ({ n: x.matchesPlayed, w: x.matchesWon }));
      const k = momPriorStrength(cells, overallWr);
      return { role: r.role.toLowerCase(), games: r.matchesPlayed, rawWr: r.matchesWon / Math.max(r.matchesPlayed, 1), shrunkWr: shrink(r.matchesWon, r.matchesPlayed, overallWr, k) };
    })
    .sort((a, b) => b.shrunkWr - a.shrunkWr);
  const bestRole = roles.filter((r) => r.games >= 100)[0] ?? roles[0]!;
  const worstRole = [...roles].filter((r) => r.games >= 100).sort((a, b) => a.shrunkWr - b.shrunkWr)[0] ?? null;

  const current = p.ratings[p.ratings.length - 1]!;
  const peakAllTime = Math.max(...p.ratings.map((r) => r.peakPoints));
  const top3Share = pool.slice(0, 3).reduce((s, h) => s + h.games, 0) / Math.max(g.matchesPlayed, 1);

  const plan: string[] = [];
  plan.push(`Queue ${bestRole.role} as primary. It is your best role at ${(bestRole.shrunkWr * 100).toFixed(1)}% over ${bestRole.games} games (your overall is ${(overallWr * 100).toFixed(1)}%). Set ${p.favRole?.toLowerCase() ?? 'your current fav'} as secondary, not the other way around.`);
  if (worstRole && worstRole.shrunkWr < overallWr - 0.02) {
    plan.push(`Stop queueing ${worstRole.role}: ${(worstRole.rawWr * 100).toFixed(1)}% over ${worstRole.games} games is costing real VP. When auto-filled there, play your safest comfort pick, not a learning pick.`);
  }
  if (leanInto.length) {
    plan.push(`Two-hero rule for the climb: ${leanInto.slice(0, 2).map((h) => h.name).join(' and ')}. You beat the field on them by ${leanInto.slice(0, 2).map((h) => `+${((h.edge ?? 0) * 100).toFixed(1)}`).join(' and ')} points of winrate.`);
  }
  plan.push(`Your champion pool is ${pool.length}+ heroes wide and your top three are only ${(top3Share * 100).toFixed(0)}% of your games. Gold-to-Platinum climbs are almost always pool-narrowing stories: aim for 70%+ of games on your top three.`);
  if (park.length) {
    plan.push(`Park ${park.map((h) => h.name).join(', ')} for ranked: ${park.map((h) => `${(h.rawWr * 100).toFixed(0)}% over ${h.games}`).join('; ')}. Keep them for normals.`);
  }
  plan.push(`The math: you are at ${current.points} VP; Platinum III starts at ${PLATINUM_VP}. Your all-time peak is ${peakAllTime}${peakAllTime >= PLATINUM_VP ? ' — you have already touched Platinum-level rating once; this is a consistency problem, not a ceiling problem' : ''}.`);

  const out = {
    generatedAt: new Date().toISOString(),
    source: 'pred.gg public profile + own aggregate baselines',
    player: {
      name: p.name, uuid, favRole: p.favRole, lastPlayedAt: p.lastPlayedAt,
      career: { games: g.matchesPlayed, winrate: overallWr, kda: (g.totalKills + g.totalAssists) / Math.max(g.totalDeaths, 1), deathsPerGame: g.totalDeaths / Math.max(g.matchesPlayed, 1) },
      ratings: p.ratings.map((r) => ({ split: r.rating.name, points: r.points, peak: r.peakPoints, rank: r.rank?.name ?? null, percentile: r.percentile })),
      current: { points: current.points, rank: current.rank?.name ?? null, split: current.rating.name },
    },
    goal: { tier: 'Platinum III', vp: PLATINUM_VP, gapVp: Math.max(0, PLATINUM_VP - current.points), peakAllTime },
    roles,
    pool,
    leanInto,
    park,
    poolWidth: { heroesPlayed20Plus: pool.length, top3Share },
    plan,
    honesty: [
      'personal winrates are shrunk toward your own average (small heater samples do not count as mains)',
      'field baselines are all-ranks aggregates from our current-patch match sample, not Gold-bracket-specific yet',
      'winrate edges are observational; they say where you win, not why',
    ],
  };
  const file = path.join(ROOT, 'data/artifacts/coach.json');
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`coach report for ${p.name} -> ${file}`);
  console.log(`  best role: ${bestRole.role} ${(bestRole.shrunkWr * 100).toFixed(1)}% | lean into: ${leanInto.map((h) => h.name).join(', ') || 'none cleared the bar'}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

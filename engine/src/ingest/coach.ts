// Personal coach report: one player's pred.gg profile joined against our
// own evidence baselines, written as a transparent, numbers-first
// improvement plan (data/artifacts/coach.json, rendered by ui/v6/coach.html).
//
//   npm run coach -- <player-uuid>
//
// Pull + shrinkage live in playerProfile.ts (shared with squad.ts) so the
// numbers agree across pages. Every verdict carries its justification.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasCredentials } from './predgg.js';
import { analyzeProfile, pullProfile } from './playerProfile.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PLATINUM_VP = 900; // Platinum III ratingMin, pred.gg rank table, Season 1 Split 4

async function main() {
  const uuid = process.argv[2];
  if (!uuid) { console.error('usage: npm run coach -- <player-uuid>'); process.exit(1); }
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }

  const raw = await pullProfile(uuid);
  const a = analyzeProfile(uuid, raw);
  const overallWr = a.career.winrate;

  const leanInto = a.pool
    .filter((h) => h.games >= 75 && h.edge != null && h.edge >= 0.02 && h.shrunkWr >= 0.52)
    .sort((x, y) => (y.edge! * Math.log(y.games)) - (x.edge! * Math.log(x.games)))
    .slice(0, 4);
  const park = a.pool.filter((h) => h.games >= 30 && h.shrunkWr <= 0.47).slice(0, 4);

  const bestRole = a.roles.filter((r) => r.games >= 100)[0] ?? a.roles[0]!;
  const worstRole = [...a.roles].filter((r) => r.games >= 100).sort((x, y) => x.shrunkWr - y.shrunkWr)[0] ?? null;
  const top3Share = a.pool.slice(0, 3).reduce((s, h) => s + h.games, 0) / Math.max(a.career.games, 1);
  const current = a.current!;

  const plan: string[] = [];
  plan.push(`Queue ${bestRole.role} as primary. It is your best role at ${(bestRole.shrunkWr * 100).toFixed(1)}% over ${bestRole.games} games (your overall is ${(overallWr * 100).toFixed(1)}%). Set ${a.favRole?.toLowerCase() ?? 'your current fav'} as secondary, not the other way around.`);
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

  const out = {
    generatedAt: new Date().toISOString(),
    source: 'pred.gg public profile + own aggregate baselines',
    player: {
      name: a.name, uuid, favRole: a.favRole, lastPlayedAt: raw.lastPlayedAt,
      career: a.career,
      ratings: a.ratings.map((r) => ({ ...r, percentile: null })),
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
  const file = path.join(ROOT, 'data/artifacts/coach.json');
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`coach report for ${a.name} -> ${file}`);
  console.log(`  best role: ${bestRole.role} ${(bestRole.shrunkWr * 100).toFixed(1)}% | lean into: ${leanInto.map((h) => h.name).join(', ') || 'none cleared the bar'}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

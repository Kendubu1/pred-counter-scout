// Five-stack squad report: discovers the lead player's most-frequent
// ranked teammates, pulls every member's profile, and solves the optimal
// role assignment for the stack (brute force over 5! lineups, scored by
// confidence-weighted shrunk role winrates). Writes squad.json.
//
//   npm run squad -- <lead-player-uuid>

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';
import { analyzeProfile, pullProfile, type AnalyzedPlayer } from './playerProfile.js';
import { loadData } from '../data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROLES = ['carry', 'midlane', 'offlane', 'jungle', 'support'];
const MIN_GAMES_TOGETHER = 50;

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/** Confidence-weighted role score: shrunk winrate pulled toward the
 *  player's overall rate when the role sample is thin. */
function roleScore(p: AnalyzedPlayer, role: string): { score: number; games: number; wr: number } {
  const r = p.roles.find((x) => x.role === role);
  if (!r) return { score: p.career.winrate - 0.01, games: 0, wr: p.career.winrate };
  const conf = r.games / (r.games + 50);
  return { score: p.career.winrate + (r.shrunkWr - p.career.winrate) * conf, games: r.games, wr: r.shrunkWr };
}

async function main() {
  const lead = process.argv[2];
  if (!lead) { console.error('usage: npm run squad -- <lead-player-uuid>'); process.exit(1); }
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }

  const d = await gql<{ player: { commonPlayers: { results: { matchesPlayed: number; matchesWon: number; player: { uuid: string } }[] } } }>(
    `{ player(by: { uuid: "${lead}" }) { commonPlayers(isAlly: true, limit: 8, filter: { gameModes: [RANKED] }) {
      results { matchesPlayed matchesWon player { uuid } } } } }`);
  const mates = d.player.commonPlayers.results
    .filter((c) => c.matchesPlayed >= MIN_GAMES_TOGETHER)
    .slice(0, 4);

  const data = loadData();
  const members: (AnalyzedPlayer & { together?: { games: number; winrate: number } })[] = [];
  for (const uuid of [lead, ...mates.map((m) => m.player.uuid)]) {
    const profile = analyzeProfile(uuid, await pullProfile(uuid), data);
    const t = mates.find((m) => m.player.uuid === uuid);
    members.push({ ...profile, together: t ? { games: t.matchesPlayed, winrate: t.matchesWon / t.matchesPlayed } : undefined });
    await new Promise((r) => setTimeout(r, 200));
  }

  // Optimal lineup: assign each member a distinct role, maximize total score.
  let best: { order: string[]; total: number } | null = null;
  for (const order of permutations(ROLES)) {
    const total = order.reduce((s, role, i) => s + roleScore(members[i]!, role).score, 0);
    if (!best || total > best.total) best = { order, total };
  }
  const assignment = best!.order.map((role, i) => {
    const m = members[i]!;
    const rs = roleScore(m, role);
    return {
      uuid: m.uuid, name: m.name, role,
      roleWr: rs.wr, roleGames: rs.games,
      favRole: m.favRole?.toLowerCase() ?? null,
      isMove: (m.favRole?.toLowerCase() ?? null) !== role,
      heroPicks: m.pool
        .filter((h) => h.primaryRole === role && h.games >= 30)
        .sort((a, b) => (b.edge ?? -1) - (a.edge ?? -1))
        .slice(0, 2)
        .map((h) => ({ slug: h.slug, name: h.name, shrunkWr: h.shrunkWr, games: h.games, edge: h.edge })),
    };
  });

  const notes: string[] = [];
  const leadM = members[0]!;
  for (const a of assignment) {
    if (a.isMove && a.roleGames >= 100) {
      notes.push(`${a.name} moves to ${a.role}: ${(a.roleWr * 100).toFixed(1)}% over ${a.roleGames} games beats their queue habit (${a.favRole ?? 'none'}).`);
    }
  }
  const avgTogether = members.slice(1).reduce((s, m) => s + (m.together?.winrate ?? 0), 0) / Math.max(members.length - 1, 1);
  notes.push(`Stack synergy: you average ${(avgTogether * 100).toFixed(0)}% together vs ${(leadM.career.winrate * 100).toFixed(0)}% solo-ish baseline — ${avgTogether > leadM.career.winrate + 0.01 ? 'the stack is worth real VP, queue together' : 'no measurable stack bonus yet; the lineup below is where it comes from'}.`);

  const out = {
    generatedAt: new Date().toISOString(),
    source: 'pred.gg public profiles (ranked common teammates) + own aggregate baselines',
    lead: leadM.uuid,
    members: members.map((m) => ({
      uuid: m.uuid, name: m.name, isPrivate: m.isPrivate, favRole: m.favRole,
      current: m.current, peakAllTime: m.peakAllTime,
      career: m.career,
      together: m.together ?? null,
      roles: m.roles,
      topHeroes: m.pool.slice(0, 6),
    })),
    assignment,
    assignmentNote: 'optimal lineup by confidence-weighted shrunk role winrates, all 120 permutations scored',
    notes,
    honesty: [
      'role winrates are career-wide and shrunk toward each player’s own average',
      'together-winrate counts ranked games with the lead player only',
      'hero suggestions require 30+ games on the hero in its primary role',
    ],
  };
  const file = path.join(ROOT, 'data/artifacts/squad.json');
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`squad report (${members.length} members) -> ${file}`);
  for (const a of assignment) console.log(`  ${a.role.padEnd(8)} ${a.name}${a.isMove ? ' (move)' : ''} ${(a.roleWr * 100).toFixed(1)}%/${a.roleGames}g picks: ${a.heroPicks.map((h) => h.name).join(', ') || '-'}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

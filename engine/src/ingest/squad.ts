// Five-stack squad report: discovers the lead's most-frequent ranked
// teammates, pulls every member's profile and common-teammate records,
// solves the optimal full-stack role assignment, computes the pairwise
// synergy matrix, emits per-member coach reports, and precomputes
// per-member role scores so the page's partial-stack planner (pick who's
// queueing tonight) runs entirely client-side.
//
//   npm run squad -- <lead-player-uuid>

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';
import { analyzeProfile, archetype, buildCoachReport, pullProfile, pullRecentMatches, type AnalyzedPlayer, type RawProfile, type RecentMatch } from './playerProfile.js';
import { computeInsights, squadBaselines, type DeepMember } from './insights.js';
import { loadData } from '../data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROLES = ['carry', 'midlane', 'offlane', 'jungle', 'support'];
const MIN_GAMES_TOGETHER = 50;
const PAIR_MIN_GAMES = 20;

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

interface CommonRow { matchesPlayed: number; matchesWon: number; player: { uuid: string } }

async function commonAllies(uuid: string): Promise<CommonRow[]> {
  const d = await gql<{ player: { commonPlayers: { results: CommonRow[] } } }>(
    `{ player(by: { uuid: "${uuid}" }) { commonPlayers(isAlly: true, limit: 12, filter: { gameModes: [RANKED] }) {
      results { matchesPlayed matchesWon player { uuid } } } } }`);
  return d.player.commonPlayers.results;
}

async function main() {
  const lead = process.argv[2];
  if (!lead) { console.error('usage: npm run squad -- <lead-player-uuid>'); process.exit(1); }
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }

  const leadCommon = await commonAllies(lead);
  const mates = leadCommon.filter((c) => c.matchesPlayed >= MIN_GAMES_TOGETHER).slice(0, 4);
  const uuids = [lead, ...mates.map((m) => m.player.uuid)];

  const data = loadData();
  const playersDir = path.join(ROOT, 'data/artifacts/players');
  mkdirSync(playersDir, { recursive: true });

  const members: (AnalyzedPlayer & { together?: { games: number; winrate: number } })[] = [];
  const commonByMember = new Map<string, CommonRow[]>([[lead, leadCommon]]);
  const deep: DeepMember[] = [];
  const rawByUuid = new Map<string, { raw: RawProfile; matches: RecentMatch[] }>();
  for (const uuid of uuids) {
    const raw = await pullProfile(uuid);
    const matches = await pullRecentMatches(uuid, 40);
    const profile = analyzeProfile(uuid, raw, data);
    const t = mates.find((m) => m.player.uuid === uuid);
    members.push({ ...profile, together: t ? { games: t.matchesPlayed, winrate: t.matchesWon / t.matchesPlayed } : undefined });
    deep.push({ analyzed: profile, raw, matches });
    rawByUuid.set(uuid, { raw, matches });
    if (uuid !== lead) commonByMember.set(uuid, await commonAllies(uuid));
    await new Promise((r) => setTimeout(r, 200));
  }

  // Pairwise synergy matrix among stack members (both directions agree by
  // construction; take the row from the lower-indexed member).
  const inStack = new Set(uuids);
  const pairs: { a: string; b: string; aName: string; bName: string; games: number; winrate: number }[] = [];
  for (let i = 0; i < uuids.length; i++) {
    for (let j = i + 1; j < uuids.length; j++) {
      const row = (commonByMember.get(uuids[i]!) ?? []).find((c) => c.player.uuid === uuids[j]!);
      if (row && row.matchesPlayed >= PAIR_MIN_GAMES && inStack.has(uuids[j]!)) {
        pairs.push({
          a: uuids[i]!, b: uuids[j]!,
          aName: members[i]!.name, bName: members[j]!.name,
          games: row.matchesPlayed, winrate: row.matchesWon / row.matchesPlayed,
        });
      }
    }
  }
  pairs.sort((x, y) => y.winrate - x.winrate);

  // The film room: per-member insights vs squad-relative baselines, each
  // member fed their strongest pairing from the matrix.
  const base = squadBaselines(deep);
  const insightsByUuid = new Map(deep.map((d) => {
    const mine = pairs.filter((p) => (p.a === d.analyzed.uuid || p.b === d.analyzed.uuid) && p.games >= 100);
    const bp = mine.sort((x, y) => y.winrate - x.winrate)[0];
    const bestPair = bp ? { partner: bp.a === d.analyzed.uuid ? bp.bName : bp.aName, games: bp.games, winrate: bp.winrate } : null;
    return [d.analyzed.uuid, computeInsights(d, base, bestPair)] as const;
  }));
  for (const uuid of uuids) {
    const { raw } = rawByUuid.get(uuid)!;
    const profile = deep.find((d) => d.analyzed.uuid === uuid)!.analyzed;
    const report = { ...buildCoachReport(profile, raw.lastPlayedAt), insights: insightsByUuid.get(uuid) ?? [] };
    writeFileSync(path.join(playersDir, `${uuid}.json`), JSON.stringify(report, null, 1));
    // the lead's standalone coach.json gets the same insight-bearing report
    if (uuid === lead) writeFileSync(path.join(ROOT, 'data/artifacts/coach.json'), JSON.stringify(report, null, 1));
  }

  // Full-stack optimal lineup.
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

  // Per-member, per-role scores for the client-side partial-stack planner.
  const roleScores = members.map((m) => ({
    uuid: m.uuid, name: m.name,
    scores: Object.fromEntries(ROLES.map((role) => {
      const rs = roleScore(m, role);
      const picks = m.pool
        .filter((h) => h.primaryRole === role && h.games >= 30)
        .sort((a, b) => (b.edge ?? -1) - (a.edge ?? -1))
        .slice(0, 2)
        .map((h) => ({ slug: h.slug, name: h.name, shrunkWr: h.shrunkWr }));
      return [role, { score: rs.score, wr: rs.wr, games: rs.games, picks }];
    })),
  }));

  // The lineup's worth, priced in the ledger currency: optimal assignment
  // vs everyone queueing their habitual favRole.
  const favTotal = members.reduce((s, m) => s + roleScore(m, m.favRole?.toLowerCase() ?? ROLES[0]!).score, 0);
  const lineupGainPer100 = Math.round(((best!.total - favTotal) / members.length) * 1000) / 10;

  const notes: string[] = [];
  const leadM = members[0]!;
  if (lineupGainPer100 >= 0.5) {
    notes.unshift(`The lineup above is worth about +${lineupGainPer100} wins per 100 team games versus everyone queueing their usual role.`);
  }
  for (const a of assignment) {
    if (a.isMove && a.roleGames >= 100) {
      notes.push(`${a.name} moves to ${a.role}: ${(a.roleWr * 100).toFixed(1)}% over ${a.roleGames} games beats their queue habit (${a.favRole ?? 'none'}).`);
    }
  }
  if (pairs.length) {
    const top = pairs[0]!;
    notes.push(`Strongest duo: ${top.aName} + ${top.bName} at ${(top.winrate * 100).toFixed(0)}% over ${top.games} ranked games. When only two queue, prefer this pair.`);
  }
  const avgTogether = members.slice(1).reduce((s, m) => s + (m.together?.winrate ?? 0), 0) / Math.max(members.length - 1, 1);
  notes.push(`Stack synergy: you average ${(avgTogether * 100).toFixed(0)}% together vs ${(leadM.career.winrate * 100).toFixed(0)}% solo-ish baseline — ${avgTogether > leadM.career.winrate + 0.01 ? 'the stack is worth real VP, queue together' : 'no measurable stack bonus yet; the lineup below is where it comes from'}.`);

  const out = {
    generatedAt: new Date().toISOString(),
    source: 'pred.gg public profiles (ranked common teammates) + own aggregate baselines',
    lead: leadM.uuid,
    members: members.map((m) => ({
      uuid: m.uuid, name: m.name, isPrivate: m.isPrivate, favRole: m.favRole,
      archetype: archetype(m),
      topInsight: (insightsByUuid.get(m.uuid) ?? [])[0] ?? null,
      current: m.current, peakAllTime: m.peakAllTime,
      career: m.career,
      together: m.together ?? null,
      roles: m.roles,
      topHeroes: m.pool.slice(0, 6),
    })),
    assignment,
    assignmentNote: 'optimal lineup by confidence-weighted shrunk role winrates, all 120 permutations scored',
    lineupGainPer100,
    pairs,
    roleScores,
    notes,
    honesty: [
      'role winrates are career-wide and shrunk toward each player’s own average',
      'pair winrates count ranked games where both were allies; they include games with randoms filling the rest',
      'hero suggestions require 30+ games on the hero in its primary role',
    ],
  };
  writeFileSync(path.join(ROOT, 'data/artifacts/squad.json'), JSON.stringify(out, null, 1));
  console.log(`squad report (${members.length} members, ${pairs.length} pairs) -> data/artifacts/squad.json + players/`);
  for (const a of assignment) console.log(`  ${a.role.padEnd(8)} ${a.name}${a.isMove ? ' (move)' : ''} ${(a.roleWr * 100).toFixed(1)}%/${a.roleGames}g`);
  for (const p of pairs) console.log(`  pair ${p.aName} + ${p.bName}: ${(p.winrate * 100).toFixed(0)}% / ${p.games}g`);
}

main().catch((e) => { console.error(e); process.exit(1); });

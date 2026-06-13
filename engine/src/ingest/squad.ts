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
import { analyzeProfile, assignDistinctArchetypes, buildCoachReport, pullHeroRoleStats, pullProfile, pullRecentMatches, shrink, type AnalyzedPlayer, type HeroRoleCell, type RawProfile, type RecentMatch } from './playerProfile.js';
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

interface RosterRow {
  match: { uuid: string; winningTeam: string; startTime: string; matchPlayers: { team: string; player: { uuid: string } | null }[] };
}

/** Last page (50) of a member's ranked matches with full rosters; the
 *  union across all five members is the trio-record sample window. */
async function recentRankedRosters(uuid: string): Promise<RosterRow[]> {
  const d = await gql<{ player: { matchesPaginated: { results: RosterRow[] } } }>(
    `{ player(by: { uuid: "${uuid}" }) { matchesPaginated(limit: 50, filter: { gameModes: [RANKED] }) {
      results { match { uuid winningTeam startTime matchPlayers { team player { uuid } } } } } } }`);
  return d.player.matchesPaginated.results;
}

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
  const heroRolesByUuid = new Map<string, HeroRoleCell[]>();
  for (const uuid of uuids) {
    const raw = await pullProfile(uuid);
    const matches = await pullRecentMatches(uuid, 50);
    const heroRoles = await pullHeroRoleStats(uuid);
    heroRolesByUuid.set(uuid, heroRoles);
    const profile = analyzeProfile(uuid, raw, data, heroRoles);
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

  // Trio records mined from actual shared matches (the API's commonPlayers
  // is pairwise-only). Union of every member's last 50 ranked rosters,
  // deduped by match; a trio counts when all three were on the same team.
  const matchMap = new Map<string, { winningTeam: string; startTime: string; byTeam: Map<string, Set<string>> }>();
  for (const uuid of uuids) {
    for (const r of await recentRankedRosters(uuid)) {
      let m = matchMap.get(r.match.uuid);
      if (!m) {
        m = { winningTeam: r.match.winningTeam, startTime: r.match.startTime, byTeam: new Map() };
        matchMap.set(r.match.uuid, m);
      }
      for (const mp of r.match.matchPlayers) {
        if (!mp.player || !inStack.has(mp.player.uuid)) continue;
        if (!m.byTeam.has(mp.team)) m.byTeam.set(mp.team, new Set());
        m.byTeam.get(mp.team)!.add(mp.player.uuid);
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const trioCount = new Map<string, { games: number; wins: number }>();
  let trioWindowStart: string | null = null;
  for (const m of matchMap.values()) {
    if (!trioWindowStart || m.startTime < trioWindowStart) trioWindowStart = m.startTime;
    for (const [team, set] of m.byTeam) {
      const arr = [...set].sort();
      if (arr.length < 3) continue;
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) for (let k = j + 1; k < arr.length; k++) {
        const key = `${arr[i]}|${arr[j]}|${arr[k]}`;
        const t = trioCount.get(key) ?? { games: 0, wins: 0 };
        t.games++;
        if (team === m.winningTeam) t.wins++;
        trioCount.set(key, t);
      }
    }
  }
  const nameOf = new Map(members.map((m) => [m.uuid, m.name]));
  const trios = [...trioCount.entries()]
    .map(([key, v]) => ({
      members: key.split('|'),
      names: key.split('|').map((u) => nameOf.get(u) ?? 'unknown'),
      games: v.games,
      winrate: v.wins / v.games,
    }))
    .filter((t) => t.games >= 5)
    .sort((x, y) => y.winrate - x.winrate);
  console.log(`  trios: ${trios.length} combos with 5+ shared games (sample: ${matchMap.size} matches since ${trioWindowStart?.slice(0, 10)})`);

  // The film room: per-member insights vs squad-relative baselines, each
  // member fed their strongest pairing from the matrix.
  const base = squadBaselines(deep);
  const insightsByUuid = new Map(deep.map((d) => {
    const mine = pairs.filter((p) => (p.a === d.analyzed.uuid || p.b === d.analyzed.uuid) && p.games >= 100);
    const bp = mine.sort((x, y) => y.winrate - x.winrate)[0];
    const bestPair = bp ? { partner: bp.a === d.analyzed.uuid ? bp.bName : bp.aName, games: bp.games, winrate: bp.winrate } : null;
    return [d.analyzed.uuid, computeInsights(d, base, bestPair)] as const;
  }));
  // One identity per member: strongest claims pick first, no two members
  // lead with the same archetype kind (each candidate is independently true).
  const archetypeByUuid = assignDistinctArchetypes(deep.map((d) => d.analyzed));
  for (const uuid of uuids) {
    const { raw } = rawByUuid.get(uuid)!;
    const profile = deep.find((d) => d.analyzed.uuid === uuid)!.analyzed;
    const report = {
      ...buildCoachReport(profile, raw.lastPlayedAt),
      archetype: archetypeByUuid.get(uuid) ?? null,
      insights: insightsByUuid.get(uuid) ?? [],
    };
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
  // Seat picks come from the player's OWN record on the hero in that exact
  // role (≥20 role-tracked games), not from the field's primary role for
  // the hero. This credits a 58%-support Zinx to support, not to wherever
  // the field plays Zinx — and it surfaces honest off-meta flexes (a carry
  // hero a player genuinely wins with in offlane qualifies for offlane).
  function ownRolePicks(uuid: string, m: AnalyzedPlayer, role: string) {
    // floor of 10 role-tracked games; the UI shows the count under 20 so
    // thin samples read as thin instead of hiding the role entirely
    return (heroRolesByUuid.get(uuid) ?? [])
      .filter((c) => c.role === role && c.n >= 10)
      .map((c) => ({
        slug: c.slug,
        name: data.kits.get(c.slug)?.name ?? c.slug,
        shrunkWr: shrink(c.w, c.n, m.career.winrate, 25),
        games: c.n,
      }))
      .sort((a, b) => b.shrunkWr - a.shrunkWr)
      .slice(0, 2);
  }

  const assignment = best!.order.map((role, i) => {
    const m = members[i]!;
    const rs = roleScore(m, role);
    return {
      uuid: m.uuid, name: m.name, role,
      roleWr: rs.wr, roleGames: rs.games,
      favRole: m.favRole?.toLowerCase() ?? null,
      isMove: (m.favRole?.toLowerCase() ?? null) !== role,
      heroPicks: ownRolePicks(m.uuid, m, role),
    };
  });

  // Per-member, per-role scores for the client-side partial-stack planner.
  const roleScores = members.map((m) => ({
    uuid: m.uuid, name: m.name,
    scores: Object.fromEntries(ROLES.map((role) => {
      const rs = roleScore(m, role);
      const picks = ownRolePicks(m.uuid, m, role).map((h) => ({ slug: h.slug, name: h.name, shrunkWr: h.shrunkWr, games: h.games }));
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
  notes.push(`Stack synergy: queued together the stack averages ${(avgTogether * 100).toFixed(0)}%, against a ${(leadM.career.winrate * 100).toFixed(0)}% career baseline — ${avgTogether > leadM.career.winrate + 0.01 ? 'queueing as a stack is worth real wins' : 'no measurable stack bonus yet; the lineup above is where the edge comes from'}.`);

  const out = {
    generatedAt: new Date().toISOString(),
    source: 'pred.gg public profiles (ranked common teammates) + own aggregate baselines',
    lead: leadM.uuid,
    members: members.map((m) => ({
      uuid: m.uuid, name: m.name, isPrivate: m.isPrivate, favRole: m.favRole,
      archetype: archetypeByUuid.get(m.uuid) ?? null,
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
    trios,
    triosNote: `from each member's last 50 ranked matches (${matchMap.size} distinct matches since ${trioWindowStart?.slice(0, 10) ?? 'n/a'}); older trio games are outside this window — duos are all-time`,
    roleScores,
    notes,
    honesty: [
      'role winrates are career-wide, adjusted toward each player’s own average so thin samples don’t overclaim',
      'pair winrates count ranked games where both were allies; they include games with randoms filling the rest',
      'trio records come from a recent-match window, not all-time history',
      'hero suggestions require 10+ of the player’s own games on the hero in that exact role (real 5v5s only); samples under 20 games show their count',
    ],
  };
  writeFileSync(path.join(ROOT, 'data/artifacts/squad.json'), JSON.stringify(out, null, 1));
  console.log(`squad report (${members.length} members, ${pairs.length} pairs) -> data/artifacts/squad.json + players/`);
  for (const a of assignment) console.log(`  ${a.role.padEnd(8)} ${a.name}${a.isMove ? ' (move)' : ''} ${(a.roleWr * 100).toFixed(1)}%/${a.roleGames}g`);
  for (const p of pairs) console.log(`  pair ${p.aName} + ${p.bName}: ${(p.winrate * 100).toFixed(0)}% / ${p.games}g`);
}

main().catch((e) => { console.error(e); process.exit(1); });

// Stack review: for a 2-, 3- or 4-stack film, who from the squad queued, how
// each one played against that hero-role's norm, and (after a loss) whether the
// group should queue different lanes next time.
//
// Two separate questions, never blended:
//  1. Lanes: the same set scoring as the squad picker (squad.json roleScores,
//     shrunk career role win rates, plus the carry+support duo-lane bonus). The
//     lanes they played are priced against the best seats for THESE players.
//  2. This game: the standouts score (src/standouts.ts scoreRows), a role-weighted
//     z against the hero-role norm across our reviewed films. A score at or
//     below -ROUGH_Z is a rough game for that lane.
// A lane suggestion only appears after a loss, and only when the best seats beat
// the played seats by LANE_GAP_PER100 or someone had a rough game; a rough game
// in the player's best seat says so instead of moving them.

import type { Metric } from './standouts.js';

export const ROLES = ['carry', 'midlane', 'offlane', 'jungle', 'support'] as const;
export type Role = typeof ROLES[number];

/** Mirror of the standout bar: one role standard deviation below the norm. */
export const ROUGH_Z = 1.0;
/** Minimum best-vs-played gap, in wins per 100 games per seat, to suggest a lane
 *  swap. Judgement, not measured: the squad page's 0.5 pricing bar fired on 60 of
 *  64 partial-stack losses, mostly on sub-1-point gaps between shrunk role rates,
 *  so a swap has to be worth 2+ wins per 100 to be worth saying after a loss. */
export const LANE_GAP_PER100 = 2;

export interface RoleScore { score: number; wr: number; games: number; picks?: { slug: string; name: string; shrunkWr: number; games: number }[] }
export interface MemberScores { uuid: string; name: string; scores: Record<Role, RoleScore> }
export interface DuoRec { shrunkWr: number; games: number; winrate?: number }

export interface StackMemberGame {
  uuid: string; name: string; role: Role; heroSlug: string; heroName: string;
  kills: number; deaths: number; assists: number;
  /** standouts composite score for this game; null when not scored */
  score: number | null;
  z?: Partial<Record<Metric, number>>;
}

export interface StackSeat { uuid: string; name: string; role: Role; wr: number; games: number }

export interface StackReview {
  matchId: string; result: string; stackSize: number;
  members: (StackMemberGame & { roleWr: number | null; roleGames: number; rough: boolean; weakest: string | null; bestSeat: Role | null })[];
  played: { avgWr: number; total: number };
  best: { avgWr: number; total: number; seats: StackSeat[] };
  /** best minus played, wins per 100 games per seat (rounded to 0.1) */
  gapPer100: number;
  lanesWereBest: boolean;
  recommend: null | {
    kind: 'swap' | 'keep';
    seats: StackSeat[];
    moves: { name: string; from: Role; to: Role }[];
    reasons: string[];
  };
}

const METRIC_WORDS: Record<string, string> = {
  dpm: 'damage per minute', dmgShare: 'share of team damage', kp: 'kill participation',
  deathsPer10: 'deaths', gpm: 'gold per minute', objpm: 'objective damage', tankpm: 'damage soaked',
  healpm: 'healing', wardsPer10: 'wards',
};

const duoKey = (a: string, b: string) => [a, b].sort().join('|');
const perms = <T>(arr: readonly T[], k: number): T[][] => k === 0 ? [[]] :
  arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)], k - 1).map((rest) => [x, ...rest]));

/** Same formula as the squad optimizer (src/ingest/squad.ts) and the squad page. */
export function seatTotal(ms: MemberScores[], order: Role[], duoLane: Record<string, DuoRec>): number {
  let total = order.reduce((s, role, i) => s + ms[i]!.scores[role].score, 0);
  const ci = order.indexOf('carry'), si = order.indexOf('support');
  if (ci !== -1 && si !== -1) {
    const rec = duoLane[duoKey(ms[ci]!.uuid, ms[si]!.uuid)];
    if (rec) total += (rec.shrunkWr - 0.5) * 0.6;
  }
  return total;
}

export function bestSeats(ms: MemberScores[], duoLane: Record<string, DuoRec>): { order: Role[]; total: number } {
  let best: { order: Role[]; total: number } | null = null;
  for (const order of perms(ROLES, ms.length)) {
    const total = seatTotal(ms, order, duoLane);
    if (!best || total > best.total) best = { order, total };
  }
  return best!;
}

const first = (n: string) => n.split(' ')[0]!;
const pct = (x: number) => (x * 100).toFixed(1);

export function reviewStack(
  film: { matchId: string; result: string; stackSize: number },
  games: StackMemberGame[],
  roleScores: MemberScores[],
  duoLane: Record<string, DuoRec>,
): StackReview | null {
  const byUuid = new Map(roleScores.map((r) => [r.uuid, r]));
  const known = games.filter((g) => byUuid.has(g.uuid) && (ROLES as readonly string[]).includes(g.role));
  if (known.length < 2) return null;
  const ms = known.map((g) => byUuid.get(g.uuid)!);
  const playedOrder = known.map((g) => g.role);
  const playedTotal = seatTotal(ms, playedOrder, duoLane);
  const best = bestSeats(ms, duoLane);
  const n = known.length;
  const gapPer100 = Math.round(((best.total - playedTotal) / n) * 1000) / 10;
  const lanesWereBest = gapPer100 < LANE_GAP_PER100;
  const avgOf = (order: Role[]) => order.reduce((a, role, i) => a + ms[i]!.scores[role].wr, 0) / n;
  const playedAvg = avgOf(playedOrder), bestAvg = avgOf(best.order);
  const seats: StackSeat[] = best.order.map((role, i) => ({
    uuid: ms[i]!.uuid, name: ms[i]!.name, role, wr: ms[i]!.scores[role].wr, games: ms[i]!.scores[role].games,
  }));

  const members = known.map((g, i) => {
    const rs = ms[i]!.scores[g.role];
    const rough = g.score != null && g.score <= -ROUGH_Z;
    const worst = Object.entries(g.z ?? {}).sort((a, b) => a[1]! - b[1]!)[0];
    return {
      ...g, roleWr: rs?.wr ?? null, roleGames: rs?.games ?? 0, rough,
      weakest: rough && worst && worst[1]! < 0 ? (METRIC_WORDS[worst[0]] ?? worst[0]) : null,
      bestSeat: best.order[i] ?? null,
    };
  });

  let recommend: StackReview['recommend'] = null;
  const roughOnes = members.filter((m) => m.rough);
  if (film.result === 'loss' && (!lanesWereBest || roughOnes.length)) {
    const moves = lanesWereBest ? [] : members.filter((m) => m.bestSeat && m.bestSeat !== m.role)
      .map((m) => ({ name: m.name, from: m.role, to: m.bestSeat! }));
    const reasons: string[] = [];
    if (!lanesWereBest) {
      const ci = best.order.indexOf('carry'), si = best.order.indexOf('support');
      const duo = ci !== -1 && si !== -1 ? duoLane[duoKey(ms[ci]!.uuid, ms[si]!.uuid)] : undefined;
      const duoNote = duo && duo.games >= 10 && (duo.winrate ?? duo.shrunkWr) >= 0.5
        ? `, and ${first(ms[ci]!.name)} + ${first(ms[si]!.name)} have won ${Math.round((duo.winrate ?? duo.shrunkWr) * 100)}% of ${duo.games} games laning together` : '';
      reasons.push(`Your career records in these lanes average ${pct(playedAvg)}%; the seats below average ${pct(bestAvg)}%${duoNote}: about ${gapPer100} more wins per 100 games.`);
    }
    for (const m of roughOnes) {
      const tail = m.weakest ? `, weakest on ${m.weakest}` : '';
      if (lanesWereBest || m.bestSeat === m.role) {
        reasons.push(`${first(m.name)} had a rough game on ${m.heroName} (${m.kills}/${m.deaths}/${m.assists}${tail}), but ${m.role} is still their best seat in this group: keep the lane, not the game.`);
      } else {
        reasons.push(`${first(m.name)} had a rough game on ${m.heroName} in ${m.role} (${m.kills}/${m.deaths}/${m.assists}${tail}) and wins more in ${m.bestSeat}.`);
      }
    }
    recommend = { kind: moves.length ? 'swap' : 'keep', seats, moves, reasons };
  }

  return {
    matchId: film.matchId, result: film.result, stackSize: film.stackSize, members,
    played: { avgWr: Math.round(playedAvg * 1000) / 1000, total: playedTotal },
    best: { avgWr: Math.round(bestAvg * 1000) / 1000, total: best.total, seats },
    gapPer100, lanesWereBest, recommend,
  };
}

// Rank AT MATCH TIME for the public match stream's rows.
//
// Stream rows carry no rank, but their matchId and playerId are the pred.gg
// uuids, and GraphQL match(by: { id }) returns each player's rating for THAT
// game (points before / after, and the rank they held). Probed 2026-10-25:
// 24/24 stream matches found, 50/50 player ids joined, 48/50 rows ranked (the
// rest unplaced), ~0.23s a match when aliased in batches. Unlike the ranked
// ladder (a player's CURRENT rank, which reads high because winners climb),
// this band holds the game's own rank, so Gold+ win rates compare directly
// with all-rank ones.

import { gql } from './predgg.js';

/** Rank tier index: 0 Bronze, 1 Silver, 2 Gold, 3 Platinum, 4 Diamond, 5 Paragon. */
export const GOLD_TIER = 2;
export const RANK_BATCH = 12;

type Gql = <T>(query: string) => Promise<T>;
type MatchRanks = { matchPlayers: { player: { uuid: string | null } | null; rating: { rank: { tierIdx: number | null } | null } | null }[] } | null;

const FIELDS = 'matchPlayers { player { uuid } rating { rank { tierIdx } } }';

/**
 * matchId -> (playerId -> tierIdx, null = unplaced) for every match pred.gg
 * resolves. A match it cannot resolve is left out, so its rows stay out of
 * the band instead of being guessed. A batch that errors is retried one match
 * at a time, so one bad id does not drop its neighbours.
 */
export async function matchTimeRanks(ids: string[], query: Gql = gql): Promise<Map<string, Map<string, number | null>>> {
  const out = new Map<string, Map<string, number | null>>();
  const take = (id: string, m: MatchRanks) => {
    if (!m?.matchPlayers?.length) return;
    const players = new Map<string, number | null>();
    for (const p of m.matchPlayers) if (p?.player?.uuid) players.set(p.player.uuid, p.rating?.rank?.tierIdx ?? null);
    out.set(id, players);
  };
  for (let i = 0; i < ids.length; i += RANK_BATCH) {
    const batch = ids.slice(i, i + RANK_BATCH);
    try {
      const d = await query<Record<string, MatchRanks>>(`{ ${batch.map((id, k) => `m${k}: match(by: { id: "${id}" }) { ${FIELDS} }`).join(' ')} }`);
      batch.forEach((id, k) => take(id, d[`m${k}`] ?? null));
    } catch {
      for (const id of batch) {
        try { take(id, (await query<{ m: MatchRanks }>(`{ m: match(by: { id: "${id}" }) { ${FIELDS} } }`)).m); } catch { /* unresolved */ }
      }
    }
  }
  return out;
}

/** Gold or higher in that game. Unplaced (null) and unresolved (undefined) are not. */
export const isGoldPlus = (tierIdx: number | null | undefined) => tierIdx != null && tierIdx >= GOLD_TIER;

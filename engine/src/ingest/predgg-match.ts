// pred.gg match adapter for the post-game review. omeda's public feed stalls a
// few days behind; pred.gg carries the squad's latest ranked games AND an event
// stream (objective + structure timeline) omeda lacks. This fetches the lead's
// recent ranked matches with full per-player detail and maps each to the same
// OmedaMatch shape computeMatchFacts already consumes, plus the timeline events.
//
// Needs PREDGG_CLIENT_ID / PREDGG_CLIENT_SECRET (never committed).

import { gql, hasCredentials } from './predgg.js';
import type { OmedaMatch, OmedaPlayer, MatchEvent } from '../postgame.js';

export interface PredggGame {
  match: OmedaMatch; ourTeam: string; members: string[];
  objectiveEvents: MatchEvent[]; structureEvents: MatchEvent[];
}

const MATCH_FIELDS = `
  uuid startTime duration gameMode winningTeam
  objectiveKills { gameTime killedEntityType killerTeam }
  structureDestructions { gameTime structureEntityType structureTeam }
  matchPlayers {
    team role kills deaths assists gold
    heroDamage physicalDamageDealtToHeroes magicalDamageDealtToHeroes
    totalDamageDealtToObjectives totalDamageTaken totalDamageMitigated
    totalHealingDone totalShieldingReceived wardsPlaced wardsDestroyed
    hero { slug name }
    player { uuid name }
    rating { points newPoints rank { name } }
    inventoryItemData { gameId name }
  }`;

function mapPlayer(p: any, idx: number, slugToId: Map<string, number>): OmedaPlayer {
  const rating = p.rating;
  return {
    id: p.player?.uuid ?? `predgg-${idx}`,
    display_name: p.player?.name ?? '🎮 private',
    team: String(p.team).toLowerCase(),
    hero_id: slugToId.get(p.hero?.slug) ?? -1,
    role: p.role && p.role !== 'NONE' && p.role !== 'FILL' ? String(p.role).toLowerCase() : null,
    kills: p.kills ?? 0, deaths: p.deaths ?? 0, assists: p.assists ?? 0,
    performance_score: 0, performance_title: '',   // pred.gg has no performance score
    gold_earned: p.gold ?? 0,
    total_damage_dealt_to_heroes: p.heroDamage ?? 0,
    physical_damage_dealt_to_heroes: p.physicalDamageDealtToHeroes ?? 0,
    magical_damage_dealt_to_heroes: p.magicalDamageDealtToHeroes ?? 0,
    total_damage_dealt_to_objectives: p.totalDamageDealtToObjectives ?? 0,
    total_damage_taken: p.totalDamageTaken ?? 0,
    total_damage_mitigated: p.totalDamageMitigated ?? 0,
    total_healing_done: p.totalHealingDone ?? 0,
    total_shielding_received: p.totalShieldingReceived ?? 0,
    wards_placed: p.wardsPlaced ?? 0, wards_destroyed: p.wardsDestroyed ?? 0,
    objective_kills: 0,                              // timeline is used instead
    inventory_data: (p.inventoryItemData ?? []).filter((i: any) => i && i.gameId != null).map((i: any) => i.gameId),
    rank: null,
    vp_change: rating ? Math.round((rating.newPoints ?? 0) - (rating.points ?? 0)) : null,
  };
}

function mapMatch(m: any, slugToId: Map<string, number>): { match: OmedaMatch; objectiveEvents: MatchEvent[]; structureEvents: MatchEvent[] } {
  const players = (m.matchPlayers ?? []).map((p: any, i: number) => mapPlayer(p, i, slugToId));
  const match: OmedaMatch = {
    id: m.uuid, start_time: m.startTime, end_time: '', game_duration: m.duration ?? 0,
    game_mode: String(m.gameMode).toLowerCase(), winning_team: String(m.winningTeam).toLowerCase(), players,
  };
  const objectiveEvents: MatchEvent[] = (m.objectiveKills ?? []).map((o: any) => ({ gameTime: o.gameTime, type: o.killedEntityType, team: String(o.killerTeam).toLowerCase() }));
  const structureEvents: MatchEvent[] = (m.structureDestructions ?? []).map((s: any) => ({ gameTime: s.gameTime, type: s.structureEntityType, team: String(s.structureTeam).toLowerCase() }));
  return { match, objectiveEvents, structureEvents };
}

/** The lead's recent ranked games that are full/near-full squad stacks, newest
 *  first, fully mapped + timeline-equipped. omedaHeroes provides slug -> id. */
export async function predggSquadMatches(
  leadUuid: string, memberUuids: Set<string>, nameByUuid: Map<string, string>,
  omedaHeroes: { id: number; slug: string }[], minStack: number, limit = 14,
): Promise<PredggGame[]> {
  if (!hasCredentials()) throw new Error('pred.gg credentials required (PREDGG_CLIENT_ID / PREDGG_CLIENT_SECRET)');
  const slugToId = new Map(omedaHeroes.map((h) => [h.slug, h.id]));
  const d = await gql<any>(`{ player(by: { uuid: "${leadUuid}" }) { matchesPaginated(limit: ${limit}, offset: 0, filter: { gameModes: [RANKED] }) { results { match { ${MATCH_FIELDS} } } } } }`);
  const rows = d.player?.matchesPaginated?.results ?? [];
  const out: PredggGame[] = [];
  for (const r of rows) {
    const { match, objectiveEvents, structureEvents } = mapMatch(r.match, slugToId);
    const leadP = match.players.find((p) => p.id === leadUuid);
    if (!leadP) continue;
    const members = match.players.filter((p) => p.team === leadP.team && memberUuids.has(p.id)).map((p) => nameByUuid.get(p.id)!);
    if (members.length >= minStack) out.push({ match, ourTeam: leadP.team, members, objectiveEvents, structureEvents });
  }
  return out;
}

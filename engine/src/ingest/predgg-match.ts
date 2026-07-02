// pred.gg match adapter for the post-game review. omeda's public feed stalls a
// few days behind; pred.gg carries the squad's latest ranked games AND an event
// stream (objective + structure timeline) omeda lacks. This fetches the lead's
// recent ranked matches with full per-player detail and maps each to the same
// OmedaMatch shape computeMatchFacts already consumes, plus the timeline events.
//
// Needs PREDGG_CLIENT_ID / PREDGG_CLIENT_SECRET (never committed).

import { gql, hasCredentials } from './predgg.js';
import type { OmedaMatch, OmedaPlayer, MatchEvent, KillEvent } from '../postgame.js';

export interface PredggGame {
  match: OmedaMatch; ourTeam: string; members: string[];
  objectiveEvents: MatchEvent[]; structureEvents: MatchEvent[]; killEvents: KillEvent[];
}

const MATCH_FIELDS = `
  uuid startTime duration gameMode winningTeam
  objectiveKills { gameTime killedEntityType killerTeam }
  structureDestructions { gameTime structureEntityType structureTeam }
  heroKills { gameTime isFirstBlood killerTeam killedTeam killerEntityType
    killerHero { slug } killedHero { slug } killerPlayer { uuid } killedPlayer { uuid } location { x y } }
  matchPlayers {
    team role kills deaths assists gold minionsKilled
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
    // Keep the pred.gg slug when the omeda snapshot doesn't know this hero yet
    // (e.g. a day-one hero like Ikra) so reviews name the hero, not hero_id:-1.
    hero_slug: p.hero?.slug ?? undefined,
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
    wards_placed: p.wardsPlaced ?? 0, wards_destroyed: p.wardsDestroyed ?? 0, minions_killed: p.minionsKilled ?? 0,
    objective_kills: 0,                              // timeline is used instead
    inventory_data: (p.inventoryItemData ?? []).filter((i: any) => i && i.gameId != null).map((i: any) => i.gameId),
    rank: null,
    vp_change: rating ? Math.round((rating.newPoints ?? 0) - (rating.points ?? 0)) : null,
  };
}

function mapMatch(m: any, slugToId: Map<string, number>): { match: OmedaMatch; objectiveEvents: MatchEvent[]; structureEvents: MatchEvent[]; killEvents: KillEvent[] } {
  const players = (m.matchPlayers ?? []).map((p: any, i: number) => mapPlayer(p, i, slugToId));
  const match: OmedaMatch = {
    id: m.uuid, start_time: m.startTime, end_time: '', game_duration: m.duration ?? 0,
    game_mode: String(m.gameMode).toLowerCase(), winning_team: String(m.winningTeam).toLowerCase(), players,
  };
  const objectiveEvents: MatchEvent[] = (m.objectiveKills ?? []).map((o: any) => ({ gameTime: o.gameTime, type: o.killedEntityType, team: String(o.killerTeam).toLowerCase() }));
  const structureEvents: MatchEvent[] = (m.structureDestructions ?? []).map((s: any) => ({ gameTime: s.gameTime, type: s.structureEntityType, team: String(s.structureTeam).toLowerCase() }));
  // Hero victims only (filter out minion/structure entries the stream may carry).
  const killEvents: KillEvent[] = (m.heroKills ?? []).filter((k: any) => k.killedHero?.slug).map((k: any) => ({
    gameTime: k.gameTime, firstBlood: !!k.isFirstBlood,
    killerSlug: k.killerHero?.slug ?? null, killedSlug: k.killedHero?.slug ?? null,
    killerPid: k.killerPlayer?.uuid ?? null, killedPid: k.killedPlayer?.uuid ?? null,
    killerTeam: String(k.killerTeam).toLowerCase(), killedTeam: String(k.killedTeam).toLowerCase(),
    x: k.location?.x ?? null, y: k.location?.y ?? null,
  }));
  return { match, objectiveEvents, structureEvents, killEvents };
}

/** Empirical lane-matchup winrate from pred.gg (our hero vs the enemy laner,
 *  same role). Ground truth to sit beside our sim's kill-window THEORY. One
 *  query per unique our-hero (returns all opponents; we pick the laner). */
export async function fetchLaneMatchups(lanes: { ourSlug: string; theirSlug: string }[]): Promise<Map<string, { winrate: number; matchesPlayed: number; firstTowerDiff: number | null }>> {
  if (!hasCredentials()) return new Map();
  const out = new Map<string, { winrate: number; matchesPlayed: number; firstTowerDiff: number | null }>();
  for (const our of [...new Set(lanes.map((l) => l.ourSlug))]) {
    try {
      const d = await gql<any>(`{ hero(by:{slug:"${our}"}){ matchupStatistic(metric: WINRATE, sameRole: true, filter:{ gameModes:[RANKED] }){ results { matchupHero { slug } winrate matchesPlayed firstTowerTimeDiff } } } }`);
      const bySlug = new Map<string, any>((d.hero?.matchupStatistic?.results ?? []).map((r: any) => [r.matchupHero?.slug, r]));
      for (const l of lanes.filter((x) => x.ourSlug === our)) {
        const r = bySlug.get(l.theirSlug);
        if (r && r.matchesPlayed >= 30) out.set(`${our}|${l.theirSlug}`, { winrate: Math.round(r.winrate * 1000) / 10, matchesPlayed: r.matchesPlayed, firstTowerDiff: r.firstTowerTimeDiff != null ? Math.round(r.firstTowerTimeDiff) : null });
      }
    } catch { /* skip on error */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return out;
}
/**
 * Every ranked game the squad played TOGETHER, not just the lead's full stacks.
 * Unions each member's recent ranked feed (so a game the lead missed still shows),
 * dedupes by matchId, and keeps any game with >= minStack squad members on one
 * team — "our team" is whichever side has the most of us. Polite: sequential per
 * member with a delay; the caller skips already-reviewed games unless --force.
 */
export async function predggSquadMatches(
  leadUuid: string, memberUuids: Set<string>, nameByUuid: Map<string, string>,
  omedaHeroes: { id: number; slug: string }[], minStack: number, limit = 40,
): Promise<PredggGame[]> {
  if (!hasCredentials()) throw new Error('pred.gg credentials required (PREDGG_CLIENT_ID / PREDGG_CLIENT_SECRET)');
  const slugToId = new Map(omedaHeroes.map((h) => [h.slug, h.id]));
  const squad = new Set([leadUuid, ...memberUuids]);
  // Union the recent ranked feed of every squad member (raw match by uuid).
  const rawByMatch = new Map<string, any>();
  for (const uuid of squad) {
    try {
      const d = await gql<any>(`{ player(by: { uuid: "${uuid}" }) { matchesPaginated(limit: ${limit}, offset: 0, filter: { gameModes: [RANKED] }) { results { match { ${MATCH_FIELDS} } } } } }`);
      for (const r of (d.player?.matchesPaginated?.results ?? [])) {
        if (r.match?.uuid && !rawByMatch.has(r.match.uuid)) rawByMatch.set(r.match.uuid, r.match);
      }
    } catch { /* one member's feed failing shouldn't sink the pull */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  const out: PredggGame[] = [];
  for (const raw of rawByMatch.values()) {
    const { match, objectiveEvents, structureEvents, killEvents } = mapMatch(raw, slugToId);
    // Our side = the team carrying the most squad members; keep if >= minStack.
    const byTeam = new Map<string, string[]>();
    for (const p of match.players) if (squad.has(p.id)) (byTeam.get(p.team) ?? byTeam.set(p.team, []).get(p.team)!).push(p.id);
    const best = [...byTeam.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    if (!best || best[1].length < minStack) continue;
    const ourTeam = best[0];
    const members = match.players.filter((p) => p.team === ourTeam && squad.has(p.id)).map((p) => nameByUuid.get(p.id) ?? p.display_name);
    out.push({ match, ourTeam, members, objectiveEvents, structureEvents, killEvents });
  }
  // Newest first (the feed order isn't guaranteed once unioned).
  out.sort((a, b) => (a.match.start_time < b.match.start_time ? 1 : -1));
  return out;
}

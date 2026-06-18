// Post-game review: turn one ranked match (omeda match detail + per-player
// hero_statistics) into a structured set of FACTS — comp shape, lane matchups
// (from our kill-window matrix), each player's build vs our optimizer's pick and
// the field meta core, hero/role experience vs this game's output, and objective
// contribution. The qualitative coaching narrative is authored separately (the
// agent pass) from these facts; everything here is computed and traceable.
//
// All numbers come from the official omeda public API; nothing here reads
// winrate-as-truth — matchup edges are our own sim's kill-window verdicts.

import { completedItems } from './data.js';
import type { LoadedData } from './data.js';
import type { Item } from './types.js';

export interface OmedaPlayer {
  id: string; display_name: string; team: string; hero_id: number; role: string | null;
  kills: number; deaths: number; assists: number;
  performance_score: number; performance_title: string;
  gold_earned: number;
  total_damage_dealt_to_heroes: number; physical_damage_dealt_to_heroes: number; magical_damage_dealt_to_heroes: number;
  total_damage_dealt_to_objectives: number; total_damage_taken: number; total_damage_mitigated: number;
  total_healing_done: number; total_shielding_received: number;
  wards_placed: number; wards_destroyed: number;
  objective_kills: number; inventory_data: number[]; rank: number | null; vp_change: number | null;
}
export interface OmedaMatch {
  id: string; start_time: string; end_time: string; game_duration: number;
  game_mode: string; winning_team: string; players: OmedaPlayer[];
}
export interface HeroStatCell { hero_id: number; match_count: number; winrate: number; avg_performance_score: number; avg_kdar: number; }

// Optional match timeline (pred.gg only — omeda's feed has no event stream).
export interface MatchEvent { gameTime: number; type: string; team: string; } // team = DAWN/DUSK (objective: killer; structure: the side that LOST it)

const ROLES = ['carry', 'midlane', 'offlane', 'jungle', 'support'];
const JUNGLE_BUFF = /_BUFF$|BUFF_/i;  // RED/BLUE/GOLD/etc. camps — not "objectives" in the macro sense

export interface PlayerFacts {
  pid: string; name: string; team: string; us: boolean; role: string;
  heroSlug: string; heroName: string;
  kills: number; deaths: number; assists: number; kda: number;
  performanceScore: number; performanceTitle: string;
  goldEarned: number; damageToHeroes: number; damageToObjectives: number;
  damageTaken: number; mitigated: number; healingDone: number;
  wardsPlaced: number; wardsDestroyed: number; objectiveKills: number;
  vpChange: number | null;
  items: { slug: string; name: string }[];   // completed items only
  completedCount: number;
  optimalBuild: string[]; metaCore: string[]; missingCore: string[]; offMeta: string[];
  matchupItemFlags: string[];
  experience: { games: number; winrate: number; avgPerf: number } | null;
  experienceVerdict: string;
  perfVsAvg: number | null;   // this game's perf score minus the player's avg on this hero
}

export interface CounterPick { hero: string; slug: string; edge: number; inPool: boolean; games: number; }
export interface LaneMatchup {
  role: string; ourHero: string; ourSlug: string; theirHero: string; theirSlug: string;
  verdict: string;            // per-minute y/e/= from OUR perspective
  edge: 'favored' | 'even' | 'unfavored';
  summary: string;
  counters: CounterPick[];    // heroes that would have countered the enemy laner (pool picks first)
}

export interface PostGameFacts {
  matchId: string; startTime: string; durationMin: number; mode: string;
  ourTeam: string; result: 'win' | 'loss'; vpSwing: number | null;
  players: PlayerFacts[];
  lanes: LaneMatchup[];
  comp: {
    ourDamage: { physical: number; magical: number };
    theirDamage: { physical: number; magical: number };
    ourHealers: string[]; theirHealers: string[];
    ourFrontline: boolean; theirFrontline: boolean;
    flags: string[];
  };
  objectives: { ourKills: number; theirKills: number; ourObjDamage: number; theirObjDamage: number };
  // Macro timeline (pred.gg only): when the big neutral objectives fell and the
  // tower count by side. Null when sourced from omeda (no event stream).
  timeline: { majors: { minute: number; type: string; side: 'us' | 'them' }[]; towers: { us: number; them: number } } | null;
  // Authored later by the agent coaching pass; null until then.
  coaching: { headline: string; team: string; perPlayer: Record<string, string>; whatShiftedIt: string } | null;
}

function heroIdToSlug(data: LoadedData, omedaHeroes: { id: number; slug: string }[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const h of omedaHeroes) if (data.kits.has(h.slug)) m.set(h.id, h.slug);
  return m;
}
function gameIdToItem(data: LoadedData): Map<number, Item> {
  const m = new Map<number, Item>();
  for (const it of data.itemsBySlug.values()) if (it.gameId != null) m.set(it.gameId, it);
  return m;
}

/** Look up our kill-window verdict string vs an opponent, inverting when only the
 *  reverse pair is stored (the matrix keeps one direction; y<->e on inversion). */
function matchupVerdict(pairs: Record<string, string>, our: string, their: string): string | null {
  const direct = pairs[`${our}|${their}`];
  if (direct != null) return direct;
  const rev = pairs[`${their}|${our}`];
  if (rev == null) return null;
  return [...rev].map((c) => (c === 'y' ? 'e' : c === 'e' ? 'y' : '=')).join('');
}

/** Favorability of a verdict string from the first hero's view: #y - #e. */
function verdictEdge(v: string): number {
  return [...v].filter((c) => c === 'y').length - [...v].filter((c) => c === 'e').length;
}

/** Heroes that would have countered the enemy laner: role-eligible heroes whose
 *  kill-window beats the enemy, the player's own pool first (a counter you can
 *  actually pilot is worth more than a theoretical one). */
export function topCounters(
  data: LoadedData, matrix: { pairs: Record<string, string> }, role: string, enemySlug: string, ourSlug: string,
  slugToHeroId: Map<string, number>, ownHeroStats: HeroStatCell[],
): CounterPick[] {
  const poolGames = new Map<number, number>(ownHeroStats.filter((h) => h.match_count > 0).map((h) => [h.hero_id, h.match_count]));
  const cands: CounterPick[] = [];
  for (const kit of data.kits.values()) {
    if (kit.slug === enemySlug || kit.slug === ourSlug) continue;
    if (!kit.roles.includes(role)) continue;                 // realistic for this lane
    const v = matchupVerdict(matrix.pairs, kit.slug, enemySlug);
    if (!v) continue;
    const edge = verdictEdge(v);
    if (edge <= 0) continue;                                  // must actually beat them
    const games = poolGames.get(slugToHeroId.get(kit.slug) ?? -1) ?? 0;
    cands.push({ hero: kit.name, slug: kit.slug, edge, inPool: games > 0, games });
  }
  // Pool picks first (then by how many games), then theoretical counters by edge.
  cands.sort((a, b) => Number(b.inPool) - Number(a.inPool) || (b.inPool ? b.games - a.games : b.edge - a.edge) || b.edge - a.edge);
  return cands.slice(0, 4);
}

function edgeOf(verdict: string): 'favored' | 'even' | 'unfavored' {
  const y = [...verdict].filter((c) => c === 'y').length;
  const e = [...verdict].filter((c) => c === 'e').length;
  return y > e + 0 ? 'favored' : e > y ? 'unfavored' : 'even';
}

function verdictSummary(verdict: string, minutes: number[]): string {
  // Describe where the kill-window sits: early (<=15) vs late (>=20).
  const seg = (lo: number, hi: number) => {
    const idx = minutes.map((m, i) => [m, i] as [number, number]).filter(([m]) => m >= lo && m <= hi).map(([, i]) => i);
    const chars = idx.map((i) => verdict[i]).filter(Boolean);
    const y = chars.filter((c) => c === 'y').length, e = chars.filter((c) => c === 'e').length;
    return y > e ? 'yours' : e > y ? 'theirs' : 'even';
  };
  const early = seg(0, 15), late = seg(16, 99);
  if (early === late) return `${early === 'even' ? 'even all game' : `${early} all game`}`;
  return `${early} early, ${late} late`;
}

export interface PostGameInputs {
  match: OmedaMatch;
  ourTeam: string;                                   // 'dawn' | 'dusk'
  omedaHeroes: { id: number; slug: string }[];
  heroStats: Map<string, HeroStatCell[]>;            // pid -> that player's hero_statistics
  matrix: { minutes: number[]; pairs: Record<string, string> };
  artifacts: Map<string, any>;                       // slug -> hero artifact (for optimal build + meta core)
  objectiveEvents?: MatchEvent[];                     // pred.gg objective-kill stream (optional)
  structureEvents?: MatchEvent[];                     // pred.gg structure-destruction stream (optional)
}

export function computeMatchFacts(data: LoadedData, inp: PostGameInputs): PostGameFacts {
  const { match, ourTeam } = inp;
  const idToSlug = heroIdToSlug(data, inp.omedaHeroes);
  const idToItem = gameIdToItem(data);
  const completedSlugs = new Set(completedItems(data).map((i) => i.slug));
  const dur = Math.round(match.game_duration / 60);

  // Which enemies heal / deal physical — measured from the actual match, not assumed.
  const enemyTeam = ourTeam === 'dawn' ? 'dusk' : 'dawn';
  const healerThreshold = 8000;   // total_healing_done over a full game that marks a real healer

  const roleView = (slug: string, role: string): any => {
    const a = inp.artifacts.get(slug);
    if (!a) return null;
    return (a.roles || []).find((r: any) => r.role === role) || a;  // top-level mirrors primary
  };

  const players: PlayerFacts[] = match.players.map((p) => {
    const slug = idToSlug.get(p.hero_id) ?? `hero_id:${p.hero_id}`;
    const kit = data.kits.get(slug);
    const role = (p.role && ROLES.includes(p.role)) ? p.role : (kit?.roles[0] ?? 'midlane');
    const us = p.team === ourTeam;
    // Completed items only: at any game length the inventory carries components;
    // build assessment should judge the FINISHED items the player committed to.
    const items = [...new Set(p.inventory_data ?? [])]
      .map((gid) => idToItem.get(gid)).filter((x): x is Item => !!x && completedSlugs.has(x.slug))
      .map((it) => ({ slug: it.slug, name: it.name }));

    // Build comparison is by SLUG (artifact meta-core names are camelCase, item
    // names are not), then resolved back to proper names for display.
    const nameOf = (s: string) => data.itemsBySlug.get(s)?.name ?? s;
    const rv = roleView(slug, role);
    const optimalSlugs: string[] = (rv?.build?.items ?? []).map((i: any) => i.slug).filter(Boolean);
    const metaSlugs: string[] = (rv?.metaBuilds?.[0]?.items ?? []).map((i: any) => i.slug).filter(Boolean);
    const optimalBuild = optimalSlugs.map(nameOf);
    const metaCore = metaSlugs.map(nameOf);
    const builtSlugs = new Set(items.map((i) => i.slug));
    const optimalSet = new Set([...optimalSlugs, ...metaSlugs]);
    const missingCore = [...new Set([...metaSlugs, ...optimalSlugs.slice(0, 3)])]
      .filter((s) => !builtSlugs.has(s)).map(nameOf);
    const offMeta = items.filter((i) => !optimalSet.has(i.slug)).map((i) => i.name);
    const completedCount = items.length;

    // Matchup itemization flags (only meaningful for our players).
    const matchupItemFlags: string[] = [];
    if (us) {
      const enemyHealers = match.players.filter((q) => q.team === enemyTeam && q.total_healing_done >= healerThreshold);
      const builtItems = items.map((i) => data.itemsBySlug.get(i.slug)).filter((x): x is Item => !!x);
      const hasAntiHeal = builtItems.some((i) => i.antiHeal);
      if (enemyHealers.length >= 1 && !hasAntiHeal) {
        matchupItemFlags.push(`no anti-heal vs ${enemyHealers.length} enemy healer${enemyHealers.length > 1 ? 's' : ''} (${enemyHealers.map((h) => idToSlug.get(h.hero_id) ?? '?').join(', ')})`);
      }
      const enemyPhys = match.players.filter((q) => q.team === enemyTeam)
        .reduce((s, q) => s + (q.physical_damage_dealt_to_heroes > q.magical_damage_dealt_to_heroes ? 1 : 0), 0);
      const enemyMag = 5 - enemyPhys;
      const hasArmor = builtItems.some((i) => i.stats.physical_armor > 0);
      const hasMR = builtItems.some((i) => i.stats.magical_armor > 0);
      const defensiveKit = (kit?.roles[0] === 'support' || kit?.roles.includes('offlane') || kit?.roles.includes('jungle'));
      if (defensiveKit && enemyPhys >= 3 && !hasArmor) matchupItemFlags.push(`no armor vs a ${enemyPhys}-physical enemy comp`);
      if (defensiveKit && enemyMag >= 3 && !hasMR) matchupItemFlags.push(`no magic resist vs a ${enemyMag}-magical enemy comp`);
    }

    // Experience: this player's history on the hero they played.
    const hs = (inp.heroStats.get(p.id) ?? []).find((h) => h.hero_id === p.hero_id && h.match_count > 0) ?? null;
    const experience = hs ? { games: hs.match_count, winrate: Math.round(hs.winrate * 1000) / 10, avgPerf: Math.round(hs.avg_performance_score) } : null;
    let experienceVerdict: string;
    if (!experience || experience.games === 0) experienceVerdict = 'no recorded games on this hero — a blind pick';
    else if (experience.games < 5) experienceVerdict = `near first-time (${experience.games} games)`;
    else if (experience.games < 20) experienceVerdict = `light experience (${experience.games} games, ${experience.winrate}% wr)`;
    else experienceVerdict = `comfort pick (${experience.games} games, ${experience.winrate}% wr)`;
    const perfVsAvg = experience ? Math.round(p.performance_score - experience.avgPerf) : null;

    return {
      pid: p.id, name: p.display_name, team: p.team, us, role,
      heroSlug: slug, heroName: kit?.name ?? slug,
      kills: p.kills, deaths: p.deaths, assists: p.assists,
      kda: Math.round(((p.kills + p.assists) / Math.max(p.deaths, 1)) * 10) / 10,
      performanceScore: Math.round(p.performance_score),
      performanceTitle: p.performance_title,
      goldEarned: p.gold_earned,
      damageToHeroes: p.total_damage_dealt_to_heroes, damageToObjectives: p.total_damage_dealt_to_objectives,
      damageTaken: p.total_damage_taken, mitigated: p.total_damage_mitigated,
      healingDone: p.total_healing_done, wardsPlaced: p.wards_placed, wardsDestroyed: p.wards_destroyed,
      objectiveKills: p.objective_kills, vpChange: p.vp_change,
      items, completedCount, optimalBuild, metaCore, missingCore, offMeta, matchupItemFlags,
      experience, experienceVerdict, perfVsAvg,
    };
  });

  // Lane matchups: our player vs the enemy in the same role, plus the counters
  // our player could have brought against that enemy laner.
  const slugToHeroId = new Map(inp.omedaHeroes.filter((h) => data.kits.has(h.slug)).map((h) => [h.slug, h.id]));
  const lanes: LaneMatchup[] = [];
  for (const role of ROLES) {
    const ours = players.find((p) => p.us && p.role === role);
    const theirs = players.find((p) => !p.us && p.role === role);
    if (!ours || !theirs) continue;
    const verdict = matchupVerdict(inp.matrix.pairs, ours.heroSlug, theirs.heroSlug);
    if (!verdict) continue;
    const counters = topCounters(data, inp.matrix, role, theirs.heroSlug, ours.heroSlug, slugToHeroId, inp.heroStats.get(ours.pid) ?? []);
    lanes.push({
      role, ourHero: ours.heroName, ourSlug: ours.heroSlug, theirHero: theirs.heroName, theirSlug: theirs.heroSlug,
      verdict, edge: edgeOf(verdict), summary: verdictSummary(verdict, inp.matrix.minutes), counters,
    });
  }

  // Comp shape from the real match damage split + healing.
  const teamPhysMag = (team: string) => {
    let physical = 0, magical = 0;
    for (const p of match.players.filter((q) => q.team === team)) {
      if (p.physical_damage_dealt_to_heroes >= p.magical_damage_dealt_to_heroes) physical++; else magical++;
    }
    return { physical, magical };
  };
  const healersOf = (team: string) => match.players.filter((q) => q.team === team && q.total_healing_done >= healerThreshold)
    .map((q) => data.kits.get(idToSlug.get(q.hero_id) ?? '')?.name ?? '?');
  const frontlineOf = (team: string) => players.filter((p) => p.team === team).some((p) => {
    const kit = data.kits.get(p.heroSlug); return !!kit && (kit.roles.includes('offlane') || p.role === 'offlane') && kit.damageType !== 'magical';
  });

  const compFlags: string[] = [];
  const ourMix = teamPhysMag(ourTeam), theirMix = teamPhysMag(enemyTeam);
  if (ourMix.physical >= 4) compFlags.push(`our damage is ${ourMix.physical}/5 physical — one enemy armor item blunts most of it`);
  if (ourMix.magical >= 4) compFlags.push(`our damage is ${ourMix.magical}/5 magical — one enemy magic-resist item blunts most of it`);
  if (!frontlineOf(ourTeam)) compFlags.push('no natural frontline on our side — nobody to absorb the first engage');
  const ourHealers = healersOf(ourTeam), theirHealers = healersOf(enemyTeam);
  if (theirHealers.length >= 2) compFlags.push(`enemy ran ${theirHealers.length} healers (${theirHealers.join(', ')}) — anti-heal was mandatory, not optional`);

  const objDmg = (team: string) => match.players.filter((q) => q.team === team).reduce((s, q) => s + q.total_damage_dealt_to_objectives, 0);

  // Objectives + macro timeline. With a pred.gg event stream we count the big
  // neutral objectives (excluding jungle buffs) and towers by side, and expose
  // when they fell; without it we fall back to per-player objective_kills (omeda).
  let timeline: PostGameFacts['timeline'] = null;
  let ourObjKills: number, theirObjKills: number;
  if (inp.objectiveEvents?.length) {
    const majorsAll = inp.objectiveEvents.filter((e) => !JUNGLE_BUFF.test(e.type));
    ourObjKills = majorsAll.filter((e) => e.team === ourTeam).length;
    theirObjKills = majorsAll.filter((e) => e.team === enemyTeam).length;
    // structureTeam is the side that LOST the tower, so a tower we took has team=enemy.
    const towers = (inp.structureEvents ?? []).filter((e) => /TOWER|INHIBITOR|CORE|BASE/i.test(e.type));
    timeline = {
      majors: majorsAll.map((e) => ({ minute: Math.round(e.gameTime / 60), type: e.type, side: (e.team === ourTeam ? 'us' : 'them') as 'us' | 'them' }))
        .sort((a, b) => a.minute - b.minute),
      towers: { us: towers.filter((e) => e.team === enemyTeam).length, them: towers.filter((e) => e.team === ourTeam).length },
    };
  } else {
    ourObjKills = match.players.filter((q) => q.team === ourTeam).reduce((s, q) => s + q.objective_kills, 0);
    theirObjKills = match.players.filter((q) => q.team === enemyTeam).reduce((s, q) => s + q.objective_kills, 0);
  }

  const ourPlayers = players.filter((p) => p.us);
  const vpSwing = ourPlayers.map((p) => p.vpChange).filter((v): v is number => v != null);

  return {
    matchId: match.id, startTime: match.start_time, durationMin: dur, mode: match.game_mode,
    ourTeam, result: match.winning_team === ourTeam ? 'win' : 'loss',
    vpSwing: vpSwing.length ? Math.round(vpSwing.reduce((s, v) => s + v, 0) / vpSwing.length) : null,
    players,
    lanes,
    comp: {
      ourDamage: ourMix, theirDamage: theirMix,
      ourHealers, theirHealers,
      ourFrontline: frontlineOf(ourTeam), theirFrontline: frontlineOf(enemyTeam),
      flags: compFlags,
    },
    objectives: { ourKills: ourObjKills, theirKills: theirObjKills, ourObjDamage: objDmg(ourTeam), theirObjDamage: objDmg(enemyTeam) },
    timeline,
    coaching: null,
  };
}

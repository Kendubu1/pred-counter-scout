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
import { kitPowerType } from './sim.js';
import { detectSkirmishes, type Skirmish, type ObjEvent } from './skirmishes.js';
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
  wards_placed: number; wards_destroyed: number; minions_killed: number;
  objective_kills: number; inventory_data: number[]; rank: number | null; vp_change: number | null;
}
export interface OmedaMatch {
  id: string; start_time: string; end_time: string; game_duration: number;
  game_mode: string; winning_team: string; players: OmedaPlayer[];
}
export interface HeroStatCell {
  hero_id: number; match_count: number; winrate: number; avg_performance_score: number; avg_kdar: number;
  avg_kills?: number; avg_deaths?: number; avg_assists?: number; avg_minions_killed?: number;
  avg_gold_earned?: number; avg_damage_dealt_to_heroes?: number; avg_damage_mitigated?: number; avg_wards_placed?: number;
  total_game_duration?: number;
}

// Optional match timeline (pred.gg only — omeda's feed has no event stream).
export interface MatchEvent { gameTime: number; type: string; team: string; } // team = DAWN/DUSK (objective: killer; structure: the side that LOST it)
// Per-kill event stream (pred.gg `heroKills`). Teams are dawn/dusk; the engine
// normalises killer/killed to us/them once it knows ourTeam.
export interface KillEvent {
  gameTime: number; firstBlood: boolean;
  killerSlug: string | null; killedSlug: string | null;
  killerPid: string | null; killedPid: string | null;
  killerTeam: string; killedTeam: string;
  x: number | null; y: number | null;
}
// Normalised kill stored on the facts: killer/killed tagged us/them, time in seconds.
export interface FactKill {
  t: number; min: number; firstBlood: boolean;
  killerSide: 'us' | 'them'; killedSide: 'us' | 'them';
  killerSlug: string | null; killedSlug: string | null;
  killerPid: string | null; killedPid: string | null;
  x: number | null; y: number | null;
}

const ROLES = ['carry', 'midlane', 'offlane', 'jungle', 'support'];
// Evolved item -> the item it was bought as (build_paths sources). The end-game
// inventory shows the evolved form; the meta core references the bought source.
const EVOLVED_SOURCE: Record<string, string> = { 'orb-of-enlightenment': 'orb-of-growth', 'alternata': 'alternator', 'cybernetic-drive': 'catalytic-drive' };
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
  // Power timeline: each completed item's modeled "online" minute (when the
  // median player on this kit affords it, from the sim build), ascending. The
  // coach reads fights against these — e.g. a 1v1 taken before a key spike.
  spikes: { slug: string; name: string; spikeMinute: number }[];
  optimalBuild: string[]; metaCore: string[]; missingCore: string[]; offMeta: string[];
  winningCore?: { items: string[]; n: number; wr: number } | null;   // pred.gg most-played winning core
  matchupItemFlags: string[];
  experience: { games: number; winrate: number; avgPerf: number } | null;
  experienceVerdict: string;
  perfVsAvg: number | null;   // this game's perf score minus the player's avg on this hero
  // Diagnostics: THIS game vs the player's own season average on the hero —
  // what they can actually fix next game (deaths, farm, damage, vision).
  diagnostics?: { metrics: { key: string; label: string; value: number; avg: number; deltaPct: number; lowerBetter: boolean; flag: 'good' | 'bad' | 'normal' }[]; headline: string | null } | null;
  // Role-fit ("rightful lane"): the role they played vs their best/proven role,
  // plus whether it's a real CONCERN — only when they're on one of their WORST
  // two lanes (a flat pool means any lane is fine; don't nag).
  roleFit?: { played: string; playedWr: number | null; bestRole: string; bestWr: number; onBest: boolean; deltaWins100: number; concern: boolean } | null;
  // Constructive anti-heal pick for THIS player's build (vs a healer comp), with
  // what to swap. Null when not needed (no enemy healers, or already built it).
  antiHealRec?: { item: string; slug: string; swapOut: string | null } | null;
}

export interface CounterPick { hero: string; slug: string; edge: number; inPool: boolean; games: number; }
export interface LaneMatchup {
  role: string; ourHero: string; ourSlug: string; theirHero: string; theirSlug: string;
  verdict: string;            // per-minute y/e/= from OUR perspective
  edge: 'favored' | 'even' | 'unfavored';
  summary: string;
  counters: CounterPick[];    // heroes that would have countered the enemy laner (pool picks first)
  predggMatchup?: { winrate: number; matchesPlayed: number; firstTowerDiff: number | null } | null;  // empirical lane winrate (pred.gg)
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
  // Counter-build: enemy build vs meta + whether we itemized to answer them.
  counterBuild?: { enemyOnMeta: number; ourAntiHeal: number; notes: string[]; enemyBuilds: { hero: string; role: string; onMeta: boolean; missing: string[] }[] } | null;
  closingNote?: string | null;   // tempo: led objectives but didn't close / dragged the game
  draftNote?: string | null;     // team-level lane-fit note (demoted from per-player)
  // Macro timeline (pred.gg only): when the big neutral objectives fell and the
  // tower count by side. Null when sourced from omeda (no event stream).
  timeline: { majors: { minute: number; type: string; side: 'us' | 'them' }[]; towers: { us: number; them: number } } | null;
  // Per-kill stream (pred.gg only), killer/killed normalised to us/them. Empty
  // when omeda-sourced. Drives skirmish detection; stored so the algorithm can
  // be re-derived without re-pulling.
  kills: FactKill[];
  // The fights that shaped the game, clustered from the kill stream (us-perspective),
  // tagged game-defining / bad-trade. Empty when there's no kill stream.
  skirmishes: Skirmish[];
  kit?: (KitAnalysis & { ourKits?: HeroProfileLine[]; enemyKits?: HeroProfileLine[] }) | null;   // kit/ability synergy + enemy threats + per-hero profiles (augmented post-hoc)
  // Authored later by the agent coaching pass; null until then.
  coaching: { headline: string; team: string; perPlayer: Record<string, string>; whatShiftedIt: string } | null;
}

// ── Kit/ability comp analysis (grounded in hero-abilities.json: structured CC,
// heals, AoE, passives). Surfaces how OUR comp should synergize and what the
// ENEMY comp threatens (chain-CC, heal-stacking, damage profile). The deeper
// qualitative read (combos, win conditions, how-to-play-against) is layered on
// later by the agent kit-knowledge pass. ──
const HARD_CC = new Set(['knockup', 'knockback', 'root', 'silence', 'pull', 'suppress', 'stun', 'taunt', 'fear', 'sleep', 'immobilize', 'polymorph']);

export interface KitAbility { name: string; key: string; cc: { type: string; value: number | null; unit: string }[]; description?: string; }
export interface TeamKit {
  hardCC: { hero: string; ability: string; type: string; sec: number | null }[];
  slows: { hero: string; ability: string; pct: number | null }[];
  healers: string[]; damage: { physical: number; magical: number };
  frontline: string[]; aoeAbilities: number;
}
export interface HeroProfile { archetype?: string; combo?: string; winCondition?: string; powerSpike?: string; passive?: string; playWith?: string; playAgainst?: string; waveClear?: string; dive?: string; scaling?: string; }
export interface HeroProfileLine extends HeroProfile { hero: string; role: string; }
export interface KitAnalysis { our: TeamKit; enemy: TeamKit; threats: string[]; synergy: string[]; ourKits: HeroProfileLine[]; enemyKits: HeroProfileLine[]; }

function teamKit(facts: PostGameFacts, side: 'us' | 'them', abilities: Record<string, { abilities: KitAbility[] }>): TeamKit {
  const ps = facts.players.filter((p) => (side === 'us') === p.us);
  const hardCC: TeamKit['hardCC'] = []; const slows: TeamKit['slows'] = [];
  let aoeAbilities = 0; const frontline: string[] = [];
  for (const p of ps) {
    const abil = abilities[p.heroSlug]?.abilities ?? [];
    let hasEngage = false;
    for (const a of abil) {
      for (const c of a.cc ?? []) {
        if (HARD_CC.has(c.type)) { hardCC.push({ hero: p.heroName, ability: a.name, type: c.type, sec: c.unit === 's' ? c.value : null }); if (['knockup', 'pull', 'stun', 'suppress'].includes(c.type)) hasEngage = true; }
        else if (c.type === 'slow') slows.push({ hero: p.heroName, ability: a.name, pct: c.unit === '%' ? c.value : null });
      }
      if (/area|nearby|enemies|\baoe\b|cone|\bline\b|all enemies|around/i.test(a.description ?? '')) aoeAbilities++;
    }
    if (p.role === 'offlane' || hasEngage) frontline.push(p.heroName);
  }
  return {
    hardCC, slows,
    healers: side === 'us' ? facts.comp.ourHealers : facts.comp.theirHealers,
    damage: side === 'us' ? facts.comp.ourDamage : facts.comp.theirDamage,
    frontline: [...new Set(frontline)], aoeAbilities,
  };
}

export function computeKitAnalysis(facts: PostGameFacts, abilities: Record<string, { abilities: KitAbility[] }>, profiles: Record<string, HeroProfile> = {}): KitAnalysis {
  const our = teamKit(facts, 'us', abilities);
  const enemy = teamKit(facts, 'them', abilities);
  const kitsFor = (us: boolean): HeroProfileLine[] => facts.players.filter((p) => p.us === us)
    .map((p) => ({ hero: p.heroName, role: p.role, ...(profiles[p.heroSlug] ?? {}) }));
  const ourKits = kitsFor(true), enemyKits = kitsFor(false);
  const ccList = (t: TeamKit) => t.hardCC.map((c) => `${c.hero} ${c.ability} (${c.type}${c.sec ? ` ${c.sec}s` : ''})`).join(', ');

  const threats: string[] = [];
  if (enemy.hardCC.length) {
    const totalSec = enemy.hardCC.reduce((s, c) => s + (c.sec ?? 0.5), 0);
    threats.push(`Chain-CC risk (${enemy.hardCC.length} hard-CC abilities, ~${totalSec.toFixed(1)}s of lockdown): ${ccList(enemy)}. Don't group tight into it — stagger the engage and hold mobility/cleanse for the key one.`);
  }
  if (enemy.healers.length) threats.push(`Heal-stacking: ${enemy.healers.join(', ')}. Anti-heal is mandatory against this comp — you brought none.`);
  if (enemy.damage.physical >= 4) threats.push(`Enemy is ${enemy.damage.physical}/5 physical — a single armor item blunts most of their damage; itemize armor on anyone diveable.`);
  else if (enemy.damage.magical >= 4) threats.push(`Enemy is ${enemy.damage.magical}/5 magical — one magic-resist item goes a long way.`);
  if (!enemy.frontline.length) threats.push(`Enemy has no real frontline — they need to catch you; respect picks more than a straight 5v5.`);

  const synergy: string[] = [];
  if (our.hardCC.length) synergy.push(`Your engage/CC: ${ccList(our)}. Your kills come from landing burst INSIDE that CC window — whoever lands it, the rest must follow up immediately.`);
  else synergy.push(`Little hard CC on your side — you can't force a pick. Play for poke/objectives and punish their cooldowns, don't flip coin-toss 5v5s.`);
  if (!our.frontline.length) synergy.push(`No natural frontline — nobody absorbs the first engage. Play around vision and pick angles, not open-field fights.`);
  if (our.healers.length) synergy.push(`You have sustain (${our.healers.join(', ')}) — favor the longer fight where your heals out-grind them.`);
  if (our.damage.physical >= 4) synergy.push(`Your damage is ${our.damage.physical}/5 physical — predictable; the enemy itemizes one armor item against most of it. A magical pick would split their defenses.`);
  else if (our.damage.magical >= 4) synergy.push(`Your damage is ${our.damage.magical}/5 magical — predictable; one magic-resist item answers most of it. Mix in a physical threat.`);
  if (our.aoeAbilities >= 6) synergy.push(`Strong AoE/teamfight kit — group at choke points and fight on top of objectives.`);

  // Archetype-driven note: enemy dive/assassin pressure on our backline.
  const enemyDivers = enemyKits.filter((k) => k.dive === 'high' && /assassin|dive/i.test(k.archetype ?? ''));
  if (enemyDivers.length) threats.push(`Dive threat on your backline: ${enemyDivers.map((k) => k.hero).join(', ')}. Assign peel for your carry and ward your flanks.`);

  return { our, enemy, threats, synergy, ourKits, enemyKits };
}

/** The anti-heal item that fits THIS player's build, vs a healer comp. Returns
 *  null when there are no enemy healers or they already built one. swapOut names
 *  the weakest off-meta item they actually built (what to cut for it). */
export function antiHealRec(
  data: LoadedData, heroSlug: string, role: string, builtSlugs: string[], offMeta: string[], enemyHealers: number,
): PlayerFacts['antiHealRec'] {
  if (enemyHealers < 1) return null;
  const pool = completedItems(data);
  const byName = (n: string) => pool.find((i) => i.name === n);
  const built = builtSlugs.map((s) => data.itemsBySlug.get(s)).filter((x): x is Item => !!x);
  if (built.some((i) => i.antiHeal)) return null;            // already covered
  const kit = data.kits.get(heroSlug);
  const power = kit ? kitPowerType(kit) : 'physical';
  const aaCarry = !!kit && kit.damageType !== 'magical' && (kit.roles.includes('carry') || kit.basicScalingPct >= 90);
  let pick: Item | undefined;
  if (role === 'support') pick = byName('Tainted Charm');                 // hp + tenacity for peel/enchant
  else if (power === 'magical') pick = byName('Tainted Totem');           // magical power + haste
  else if (aaCarry) pick = byName('Tainted Rounds');                     // AS + crit for a marksman
  else pick = byName('Tainted Blade') ?? byName('Tainted Trident');      // physical bruiser/assassin
  if (!pick) return null;
  // What to cut: the cheapest off-meta completed item they built (least lost).
  const swap = offMeta.map((n) => byName(n)).filter((x): x is Item => !!x).sort((a, b) => a.totalPrice - b.totalPrice)[0];
  return { item: pick.name, slug: pick.slug, swapOut: swap?.name ?? null };
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
  killEvents?: KillEvent[];                           // pred.gg hero-kill stream (optional) — drives skirmishes
  roleStats?: Map<string, { role: string; games: number; shrunkWr: number }[]>;  // pid -> squad role winrates (for role-fit)
  heroPools?: Map<string, { slug: string; games: number; shrunkWr: number }[]>;  // pid -> pred.gg hero pool (fresher than omeda for experience)
}

/** Role-fit: the role they played vs their proven-best role (>=50 games, highest
 *  shrunk winrate). "Rightful lane" = where their own results say they belong. */
/** This game vs the player's own per-hero averages (omeda hero_statistics). The
 *  most actionable feedback: how this game deviated from how they normally play.
 *  Needs >=5 games for a stable baseline. Rates are per-minute to fairly compare
 *  games of different length; deaths/wards are per-game (how players think). */
function diagnosticsOf(cell: HeroStatCell | undefined, p: OmedaPlayer, durMin: number, role: string): PlayerFacts['diagnostics'] {
  if (!cell || cell.match_count < 5 || cell.avg_deaths == null) return null;
  const avgDur = (cell.total_game_duration && cell.match_count) ? cell.total_game_duration / cell.match_count / 60 : durMin;
  const pm = (v: number) => v / Math.max(durMin, 1);
  const avgPm = (v: number) => v / Math.max(avgDur, 1);
  const M: { key: string; label: string; value: number; avg: number; lowerBetter: boolean; roles?: string[] }[] = [
    { key: 'deaths', label: 'deaths', value: p.deaths, avg: cell.avg_deaths ?? 0, lowerBetter: true },
    { key: 'cs', label: 'CS/min', value: Math.round(pm(p.minions_killed) * 10) / 10, avg: Math.round(avgPm(cell.avg_minions_killed ?? 0) * 10) / 10, lowerBetter: false, roles: ['carry', 'midlane', 'offlane', 'jungle'] },
    { key: 'dmg', label: 'hero dmg/min', value: Math.round(pm(p.total_damage_dealt_to_heroes)), avg: Math.round(avgPm(cell.avg_damage_dealt_to_heroes ?? 0)), lowerBetter: false, roles: ['carry', 'midlane', 'jungle', 'offlane'] },
    { key: 'mit', label: 'dmg mitigated/min', value: Math.round(pm(p.total_damage_mitigated)), avg: Math.round(avgPm(cell.avg_damage_mitigated ?? 0)), lowerBetter: false, roles: ['offlane', 'support'] },
    { key: 'wards', label: 'wards', value: p.wards_placed, avg: Math.round((cell.avg_wards_placed ?? 0) * 10) / 10, lowerBetter: false, roles: ['support', 'jungle'] },
  ];
  const metrics = M.filter((m) => (!m.roles || m.roles.includes(role)) && m.avg > 0).map((m) => {
    const deltaPct = Math.round(((m.value - m.avg) / m.avg) * 100);
    const better = m.lowerBetter ? deltaPct < 0 : deltaPct > 0;
    const flag: 'good' | 'bad' | 'normal' = Math.abs(deltaPct) < 20 ? 'normal' : better ? 'good' : 'bad';
    return { key: m.key, label: m.label, value: m.value, avg: m.avg, deltaPct, lowerBetter: m.lowerBetter, flag };
  });
  // Headline = the biggest BAD deviation (most actionable); else the best good one.
  const bad = metrics.filter((m) => m.flag === 'bad').sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))[0];
  const good = metrics.filter((m) => m.flag === 'good').sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))[0];
  let headline: string | null = null;
  if (bad) headline = `${bad.label} ${bad.value} vs your ${bad.avg} norm (${bad.deltaPct > 0 ? '+' : ''}${bad.deltaPct}%)`;
  else if (good) headline = `${good.label} ${good.value} vs your ${good.avg} norm — above your level`;
  else headline = 'a normal game by your numbers';
  return { metrics, headline };
}

function roleFitOf(rs: { role: string; games: number; shrunkWr: number }[] | undefined, played: string): PlayerFacts['roleFit'] {
  if (!rs?.length) return null;
  const ranked = rs.filter((r) => r.games >= 50).sort((a, b) => b.shrunkWr - a.shrunkWr);
  if (ranked.length < 3) return null;                       // too few real roles to judge fit
  const best = ranked[0]!;
  const playedRole = rs.find((r) => r.role === played) ?? null;
  // Concern only if they're on one of their WORST two lanes AND a clearly better
  // option exists (>=2 wins/100). A flat pool (all lanes close) is never a concern.
  const playedRank = ranked.findIndex((r) => r.role === played);
  const worstTwo = playedRank >= ranked.length - 2;
  const delta = playedRole ? Math.round((best.shrunkWr - playedRole.shrunkWr) * 1000) / 10 : 0;
  return {
    played, playedWr: playedRole ? Math.round(playedRole.shrunkWr * 1000) / 10 : null,
    bestRole: best.role, bestWr: Math.round(best.shrunkWr * 1000) / 10, onBest: best.role === played,
    deltaWins100: delta, concern: worstTwo && delta >= 2 && !!playedRole,
  };
}

export function computeMatchFacts(data: LoadedData, inp: PostGameInputs): PostGameFacts {
  const { match, ourTeam } = inp;
  const idToSlug = heroIdToSlug(data, inp.omedaHeroes);
  const idToItem = gameIdToItem(data);
  const completedSlugs = new Set(completedItems(data).map((i) => i.slug));
  const dur = Math.round(match.game_duration / 60);

  // Which enemies heal / deal physical — measured from the actual match, not assumed.
  const enemyTeam = ourTeam === 'dawn' ? 'dusk' : 'dawn';
  const healerThreshold = 5000;   // healing over a full game that marks a real ALLY-healer (support)

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
    // Evolving items appear in the end-game inventory as their EVOLVED form
    // (Orb of Growth -> Orb of Enlightenment); count those and credit the source
    // they were bought as, so an evolved core isn't reported "missing".
    const items = [...new Set(p.inventory_data ?? [])]
      .map((gid) => idToItem.get(gid)).filter((x): x is Item => !!x && (completedSlugs.has(x.slug) || x.slug in EVOLVED_SOURCE))
      .map((it) => ({ slug: it.slug, name: it.name }));

    // Build comparison is by SLUG (artifact meta-core names are camelCase, item
    // names are not), then resolved back to proper names for display.
    const nameOf = (s: string) => data.itemsBySlug.get(s)?.name ?? s;
    const rv = roleView(slug, role);
    const optimalSlugs: string[] = (rv?.build?.items ?? []).map((i: any) => i.slug).filter(Boolean);
    // "Missing core" is grounded in the pred.gg WINNING build — the most-played
    // core that actually wins (not our sim THEORY). winningCore carries its
    // sample + winrate so the page can cite "the X%-over-N build".
    const winCore = rv?.metaBuilds?.[0];
    const metaSlugs: string[] = (winCore?.items ?? []).map((i: any) => i.slug).filter(Boolean);
    const optimalBuild = optimalSlugs.map(nameOf);
    const metaCore = metaSlugs.map(nameOf);
    const builtSlugs = new Set(items.flatMap((i) => EVOLVED_SOURCE[i.slug] ? [i.slug, EVOLVED_SOURCE[i.slug]!] : [i.slug]));
    const optimalSet = new Set([...optimalSlugs, ...metaSlugs]);
    const missingCore = metaSlugs.filter((s) => !builtSlugs.has(s)).map(nameOf);
    const winningCore = winCore && metaSlugs.length
      ? { items: metaCore, n: winCore.n ?? 0, wr: Math.round((winCore.shrunkWr ?? 0) * 1000) / 10 } : null;
    const offMeta = items.filter((i) => !optimalSet.has(i.slug) && !optimalSet.has(EVOLVED_SOURCE[i.slug] ?? '')).map((i) => i.name);
    const completedCount = items.length;

    // Power timeline: map each completed item to its modeled spike minute (sim
    // build carries spikeMinute per item; meta-core rows don't). Evolved items
    // credit their bought source. Ascending. Omit items with no modeled spike.
    const spikeBySlug = new Map<string, number>();
    for (const bi of (rv?.build?.items ?? [])) if (bi?.slug && typeof bi.spikeMinute === 'number') spikeBySlug.set(bi.slug, bi.spikeMinute);
    const spikes = items
      .map((i) => { const m = spikeBySlug.get(i.slug) ?? spikeBySlug.get(EVOLVED_SOURCE[i.slug] ?? ''); return m != null ? { slug: i.slug, name: i.name, spikeMinute: m } : null; })
      .filter((x): x is { slug: string; name: string; spikeMinute: number } => !!x)
      .sort((a, b) => a.spikeMinute - b.spikeMinute);

    // Matchup itemization flags (only meaningful for our players).
    const matchupItemFlags: string[] = [];
    if (us) {
      // Anti-heal is a TEAM itemization call — surfaced once as a team threat
      // (kit analysis), not repeated on every player here, so per-player flags
      // stay matchup-specific (armor/MR vs the enemy's damage profile).
      const builtItems = items.map((i) => data.itemsBySlug.get(i.slug)).filter((x): x is Item => !!x);
      const enemyPhys = match.players.filter((q) => q.team === enemyTeam)
        .reduce((s, q) => s + (q.physical_damage_dealt_to_heroes > q.magical_damage_dealt_to_heroes ? 1 : 0), 0);
      const enemyMag = 5 - enemyPhys;
      const hasArmor = builtItems.some((i) => i.stats.physical_armor > 0);
      const hasMR = builtItems.some((i) => i.stats.magical_armor > 0);
      const defensiveKit = (kit?.roles[0] === 'support' || kit?.roles.includes('offlane') || kit?.roles.includes('jungle'));
      if (defensiveKit && enemyPhys >= 3 && !hasArmor) matchupItemFlags.push(`no armor vs a ${enemyPhys}-physical enemy comp`);
      if (defensiveKit && enemyMag >= 3 && !hasMR) matchupItemFlags.push(`no magic resist vs a ${enemyMag}-magical enemy comp`);
    }

    // Experience: prefer the pred.gg pool (current) over omeda hero_statistics
    // (which lags weeks behind). A hero outside the tracked pool is low-sample,
    // not necessarily a "blind pick" — the trackers just haven't synced it.
    const poolHero = (inp.heroPools?.get(p.id) ?? []).find((h) => h.slug === slug && h.games > 0);
    const hs = (inp.heroStats.get(p.id) ?? []).find((h) => h.hero_id === p.hero_id && h.match_count > 0) ?? null;
    const experience = poolHero ? { games: poolHero.games, winrate: Math.round(poolHero.shrunkWr * 1000) / 10, avgPerf: 0 }
      : hs ? { games: hs.match_count, winrate: Math.round(hs.winrate * 1000) / 10, avgPerf: Math.round(hs.avg_performance_score) } : null;
    let experienceVerdict: string;
    if (!experience || experience.games === 0) experienceVerdict = 'low sample on this hero (outside the tracked pool)';
    else if (experience.games < 5) experienceVerdict = `near first-time (${experience.games} game${experience.games === 1 ? '' : 's'})`;   // too few for a meaningful winrate
    else if (experience.games < 10) experienceVerdict = `light experience (${experience.games} games, ${experience.winrate}% wr)`;
    else if (experience.games < 30) experienceVerdict = `solid pool (${experience.games} games, ${experience.winrate}% wr)`;
    else experienceVerdict = `comfort pick (${experience.games} games, ${experience.winrate}% wr)`;
    const perfVsAvg = experience && experience.avgPerf ? Math.round(p.performance_score - experience.avgPerf) : null;

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
      items, completedCount, spikes, optimalBuild, metaCore, missingCore, offMeta, winningCore, matchupItemFlags,
      experience, experienceVerdict, perfVsAvg,
      roleFit: us ? roleFitOf(inp.roleStats?.get(p.id), role) : null,
      diagnostics: us ? diagnosticsOf((inp.heroStats.get(p.id) ?? []).find((h) => h.hero_id === p.hero_id), p, dur, role) : null,
      antiHealRec: null,   // assigned team-aware below, only to fill a real coverage gap
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
  // A "healer" for the anti-heal call is an ALLY-healer (a support pumping team
  // heals), not a self-sustain bruiser (Feng Mao, Bayle lifesteal). Require the
  // support role so a high-lifesteal carry/bruiser isn't mislabelled a healer.
  const healersOf = (team: string) => match.players.filter((q) => q.team === team
      && q.total_healing_done >= healerThreshold
      && ((q.role && q.role.toLowerCase() === 'support') || (data.kits.get(idToSlug.get(q.hero_id) ?? '')?.roles[0] === 'support')))
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
  // (Heal-stacking / anti-heal is surfaced once in the kit-threat analysis, not
  // duplicated here — it was over-represented across every feedback surface.)

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

  // Normalise the kill stream to us/them (drives Phase-2 skirmish detection).
  const kills: FactKill[] = (inp.killEvents ?? []).map((k) => ({
    t: k.gameTime, min: Math.round((k.gameTime / 60) * 10) / 10, firstBlood: k.firstBlood,
    killerSide: (k.killerTeam === ourTeam ? 'us' : 'them') as 'us' | 'them',
    killedSide: (k.killedTeam === ourTeam ? 'us' : 'them') as 'us' | 'them',
    killerSlug: k.killerSlug, killedSlug: k.killedSlug, killerPid: k.killerPid, killedPid: k.killedPid,
    x: k.x, y: k.y,
  })).sort((a, b) => a.t - b.t);

  // Objective + tower events a fight may have been over, normalised to us/them.
  // objectiveEvents.team = killer; structureEvents.team = the side that LOST it,
  // so a tower WE took shows team=enemy.
  const objForSkirmish: ObjEvent[] = [
    ...(inp.objectiveEvents ?? []).filter((e) => !JUNGLE_BUFF.test(e.type))
      .map((e) => ({ sec: e.gameTime, type: e.type, side: (e.team === ourTeam ? 'us' : 'them') as 'us' | 'them', kind: 'objective' as const })),
    ...(inp.structureEvents ?? []).filter((e) => /TOWER|INHIBITOR|CORE|BASE/i.test(e.type))
      .map((e) => ({ sec: e.gameTime, type: e.type, side: (e.team === enemyTeam ? 'us' : 'them') as 'us' | 'them', kind: 'tower' as const })),
  ];
  const skirmishes = detectSkirmishes(kills, objForSkirmish, dur);

  const ourPlayers = players.filter((p) => p.us);
  const enemyPlayers = players.filter((p) => !p.us);
  const vpSwing = ourPlayers.map((p) => p.vpChange).filter((v): v is number => v != null);

  // Counter-build: did the enemy build to the meta, and did WE itemize to answer
  // their threats (anti-heal vs healers, armor/MR vs their main damage) — and did
  // it cost us? Grounded in their actual builds + damage.
  const hasArmor = (p: PlayerFacts, phys: boolean) => p.items.some((it) => { const I = data.itemsBySlug.get(it.slug); return !!I && (phys ? I.stats.physical_armor > 0 : I.stats.magical_armor > 0); });
  const ourAntiHeal = ourPlayers.filter((p) => p.items.some((it) => data.itemsBySlug.get(it.slug)?.antiHeal)).length;
  const topThreat = [...enemyPlayers].sort((a, b) => b.damageToHeroes - a.damageToHeroes)[0];
  const threatKit = topThreat ? data.kits.get(topThreat.heroSlug) : undefined;
  const threatPhys = threatKit ? kitPowerType(threatKit) === 'physical' : true;
  const ourDefVsThreat = ourPlayers.filter((p) => hasArmor(p, threatPhys)).length;
  // Team-aware anti-heal: a heal comp wants ~2 anti-heal (1 vs a single healer).
  // Only recommend to enough of our damage dealers to FILL the gap — not everyone,
  // and not at all when the team is already covered.
  const desiredAH = theirHealers.length >= 2 ? 2 : theirHealers.length >= 1 ? 1 : 0;
  let gap = desiredAH - ourAntiHeal;
  const carrierOrder = ['carry', 'midlane', 'jungle', 'offlane', 'support'];
  const candidates = ourPlayers
    .filter((p) => !p.items.some((it) => data.itemsBySlug.get(it.slug)?.antiHeal))
    .sort((a, b) => carrierOrder.indexOf(a.role) - carrierOrder.indexOf(b.role));
  for (const p of candidates) {
    if (gap <= 0) break;
    const rec = antiHealRec(data, p.heroSlug, p.role, p.items.map((i) => i.slug), p.offMeta, theirHealers.length);
    if (rec) { p.antiHealRec = rec; gap--; }
  }
  const enemyOnMetaList = enemyPlayers.map((p) => ({ hero: p.heroName, role: p.role, onMeta: p.missingCore.length <= 1, missing: p.missingCore }));
  const enemyOnMeta = enemyOnMetaList.filter((e) => e.onMeta).length;
  const cbNotes: string[] = [];
  if (theirHealers.length && ourAntiHeal === 0) cbNotes.push(`Enemy ran ${theirHealers.length} healer${theirHealers.length > 1 ? 's' : ''} (${theirHealers.join(', ')}) and your team built zero anti-heal — their sustain ran unchecked.`);
  else if (theirHealers.length && ourAntiHeal < 2) cbNotes.push(`Enemy had ${theirHealers.length} healer${theirHealers.length > 1 ? 's' : ''}; only ${ourAntiHeal} of you carried anti-heal — usually wants two vs a heal comp.`);
  if (topThreat) cbNotes.push(`Their main damage was ${topThreat.heroName} (${Math.round(topThreat.damageToHeroes / 1000)}k ${threatPhys ? 'physical' : 'magical'}); ${ourDefVsThreat}/5 of you itemized ${threatPhys ? 'armor' : 'magic resist'}${ourDefVsThreat <= 1 ? ' — that hurt' : ''}.`);
  cbNotes.push(`Enemy ran ${enemyOnMeta}/5 on or near their meta core${enemyOnMeta >= 4 ? ' — they drafted and built optimally; match it' : enemyOnMeta <= 1 ? ' — they were off-meta too, the win was there' : ''}.`);
  const counterBuild = { enemyOnMeta, ourAntiHeal, notes: cbNotes, enemyBuilds: enemyOnMetaList };

  // Lane-fit is a DRAFT-level note, not per-player nagging: how many queued off a
  // bottom-two lane (the only case worth raising).
  const offLane = ourPlayers.filter((p) => p.roleFit?.concern).map((p) => `${p.name} (${p.roleFit!.played}→${p.roleFit!.bestRole})`);
  const draftNote = offLane.length ? `${offLane.length} of five queued off a bottom-two lane: ${offLane.join(', ')}.` : null;

  // Closing / tempo: did we sit on a lead instead of ending it?
  const result = match.winning_team === ourTeam ? 'win' : 'loss';
  let closingNote: string | null = null;
  if (result === 'win' && dur >= 35 && ourObjKills >= theirObjKills) closingNote = `Closed slow — you led objectives but the game ran ${dur} minutes. Convert Fangtooth/tower leads into ending the game, don't farm the lead and risk a throw.`;
  else if (result === 'loss' && ourObjKills > theirObjKills) closingNote = `You won the objective count (${ourObjKills}–${theirObjKills}) and still lost — those leads never became towers/a close. Group and push after each Fangtooth.`;

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
    kills,
    skirmishes,
    counterBuild,
    closingNote,
    draftNote,
    coaching: null,
  };
}

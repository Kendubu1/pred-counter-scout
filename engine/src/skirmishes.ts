// Skirmish detection: turn the pred.gg per-kill stream into the FIGHTS that
// actually shaped the game. Pure + deterministic — clusters kills in time, scores
// each fight from OUR side, ties it to the objective on the line, and flags the
// two things the coach cares about: the game-defining teamfights and the dumb
// losing battles we took for nothing.
//
// "Where" is deliberately coarse and honest: we anchor a fight to a contemporaneous
// objective/tower (reliable) rather than claim a precise map position from raw x/y
// (which would need map calibration we don't have). Everything here is THEORY-light
// — it's measured kill data, but the game-defining / bad-trade *labels* are heuristics.

import type { FactKill } from './postgame.js';

/** Objective/tower event normalised to us/them, in seconds — what a fight was over. */
export interface ObjEvent { sec: number; type: string; side: 'us' | 'them'; kind: 'objective' | 'tower'; }

export interface Skirmish {
  startSec: number; endSec: number; startMin: number;   // when (startMin for display)
  ourKills: number; theirKills: number; net: number;    // from our side (net = our - their)
  result: 'won' | 'lost' | 'even';
  size: number;                                         // bodies that dropped in the fight
  kind: 'pick' | 'skirmish' | 'teamfight';
  ourHeroes: string[]; theirHeroes: string[];           // heroes involved per side (killer or victim)
  region: string | null;                                // where it happened, from kill x/y (THEORY); null if unlocatable
  place: string;                                        // the objective on the line, else the region, else "open map"
  nearObjective: { type: string; side: 'us' | 'them'; kind: 'objective' | 'tower' } | null;
  significance: number;                                 // ranking weight
  tag: 'game-defining' | 'bad-trade' | null;            // the headline classification
  macro?: SkirmishMacro | null;                         // cross-map read: rotations, numbers, trades (THEORY)
}

/** What the squad gives the detector to read the macro game around a fight:
 *  the five on our side, the enemy pids, lane verdict strings, the major timeline. */
export interface SkirmishContext {
  ourPlayers: { pid: string; name: string; heroSlug: string; role: string }[];
  enemyPids: string[];
  lanes: { role: string; verdict: string }[];
  majors?: { minute: number; type: string; side: 'us' | 'them' }[];
}

/** The macro picture of a fight — the part that's about the GAME, not the matchup:
 *  did we engage with the bodies, who was dead and couldn't help, who was alive and
 *  never rotated, and did the map trade somewhere else. All inferred from the kill
 *  stream + lane verdicts, so it's THEORY (respawn timing + lane pressure are modeled). */
export interface SkirmishMacro {
  ourAlive: number; theirAlive: number; manAdv: number;     // who was standing when it opened
  outnumbered: boolean;
  absent: { name: string; role: string; hero: string; lane: 'winning' | 'even' | 'losing' | 'unknown' }[];
  dead: { name: string; role: string; hero: string; agoSec: number }[];   // dead at engage — couldn't contest
  crossMap: { type: string; side: 'us' | 'them' }[];        // majors that fell in the same window
  notes: string[];                                          // ready-to-read macro reads (THEORY)
}

const GAP = 25;          // seconds: kills within GAP of the running cluster join the same fight
const OBJ_WINDOW = 45;   // seconds: an objective/tower within this of a fight is "on the line"
// "Major" = a game-swinging prize. The objective stream is noisy with frequent
// minor camps (river/seedling), so only Fangtooth/Prime/Orb and structures make a
// fight game-defining; minor objectives still colour `place`, just don't tag it.
const MAJOR_OBJ = /FANG|PRIME|ORB/i;
const isMajor = (e: ObjEvent) => e.kind === 'tower' || MAJOR_OBJ.test(e.type);

const titleCase = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const pct = (a: number[], t: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(t * s.length))]! : 0; };

// The map is a 45°-rotated diamond: depth = x+y runs base-to-base, cross = x-y is
// the flank axis (sides vs the central mid/river diagonal). We self-calibrate per
// game from the kill stream — we get kills pushing toward THEIR base and die toward
// OURS, so the side that kills deeper marks their corner. THEORY: approximate.
interface Orient { sign: number; lo: number; hi: number; crossP90: number; }
function orient(kills: FactKill[]): Orient | null {
  const loc = kills.filter((k) => k.x != null && k.y != null);
  const ours = loc.filter((k) => k.killerSide === 'us').map((k) => k.x! + k.y!);
  const theirs = loc.filter((k) => k.killerSide === 'them').map((k) => k.x! + k.y!);
  if (ours.length < 4 || theirs.length < 4) return null;
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const sep = mean(ours) - mean(theirs);
  if (Math.abs(sep) < 1500) return null;                 // ambiguous orientation -> don't claim a side
  const sign = sep >= 0 ? 1 : -1;
  const depths = loc.map((k) => sign * (k.x! + k.y!));    // + = toward their base
  const crosses = loc.map((k) => Math.abs(k.x! - k.y!));
  return { sign, lo: pct(depths, 0.08), hi: pct(depths, 0.92), crossP90: pct(crosses, 0.9) || 1 };
}
/** Coarse, honest location for a fight's centroid in the oriented frame. */
function regionOf(cx: number, cy: number, o: Orient): string {
  const td = o.sign * (cx + cy);
  const pos = o.hi > o.lo ? Math.max(0, Math.min(1, (td - o.lo) / (o.hi - o.lo))) : 0.5; // 0 = our base, 1 = theirs
  const flank = Math.min(1, Math.abs(cx - cy) / o.crossP90);
  const side = flank > 0.55 ? 'jungle' : 'lane';
  if (pos > 0.78) return `deep in their ${side === 'jungle' ? 'jungle' : 'half'}`;
  if (pos > 0.6) return `their ${side === 'jungle' ? 'jungle' : 'half'}`;
  if (pos < 0.22) return `deep in your ${side === 'jungle' ? 'jungle' : 'half'}`;
  if (pos < 0.4) return `your ${side === 'jungle' ? 'jungle' : 'half'}`;
  return flank > 0.55 ? 'midmap (a side)' : 'midmap / river';
}

// Respawn climbs with the game; without a per-frame level feed we model it off the
// death's own minute (THEORY): ~6s early, ~capped 60s late. Used only to decide if a
// teammate was still down when the next fight opened.
const respawnSec = (deathSec: number) => Math.min(60, Math.max(6, 4 + (deathSec / 60) * 1.6));
/** Seconds-since-death if `pid` is still respawning at `atSec`, else null (alive). */
function deadAt(pid: string, kills: FactKill[], atSec: number): number | null {
  let last = -1;
  for (const k of kills) if (k.killedPid === pid && k.t < atSec && k.t > last) last = k.t;
  if (last < 0) return null;
  return atSec - last < respawnSec(last) ? atSec - last : null;
}
const CHECKPOINTS = [5, 10, 15, 20, 25, 30];
/** A lane's kill-window verdict char nearest a minute → 'winning'/'even'/'losing'. */
function laneStateAt(role: string, lanes: SkirmishContext['lanes'], min: number): 'winning' | 'even' | 'losing' | 'unknown' {
  const l = lanes.find((x) => x.role === role);
  if (!l || !l.verdict) return 'unknown';
  let idx = 0, best = Infinity;
  for (let i = 0; i < l.verdict.length; i++) { const d = Math.abs(CHECKPOINTS[i]! - min); if (d < best) { best = d; idx = i; } }
  const c = l.verdict[idx];
  return c === 'y' ? 'winning' : c === 'e' ? 'losing' : 'even';
}

/** The macro read of one fight: numbers at the engage, who was dead/absent, cross-map
 *  trades — the part the coach should talk about instead of "your hero vs their hero". */
export function skirmishMacro(
  s: Pick<Skirmish, 'startSec' | 'endSec' | 'startMin' | 'ourKills' | 'theirKills' | 'net' | 'result'>,
  kills: FactKill[], ctx: SkirmishContext,
): SkirmishMacro {
  const win = kills.filter((k) => k.t >= s.startSec - 1 && k.t <= s.endSec + 1);
  const part = new Set<string>();
  for (const k of win) { if (k.killerSide === 'us' && k.killerPid) part.add(k.killerPid); if (k.killedSide === 'us' && k.killedPid) part.add(k.killedPid); }

  const ourDead = ctx.ourPlayers.map((p) => ({ p, ago: deadAt(p.pid, kills, s.startSec) })).filter((x) => x.ago != null);
  const ourAlive = ctx.ourPlayers.length - ourDead.length;
  const theirAlive = ctx.enemyPids.length - ctx.enemyPids.filter((pid) => deadAt(pid, kills, s.startSec) != null).length;
  const manAdv = ourAlive - theirAlive;

  const dead = ourDead.map((x) => ({ name: x.p.name, role: x.p.role, hero: x.p.heroSlug, agoSec: Math.round(x.ago!) }));
  const absent = ctx.ourPlayers
    .filter((p) => !part.has(p.pid) && deadAt(p.pid, kills, s.startSec) == null)
    .map((p) => ({ name: p.name, role: p.role, hero: p.heroSlug, lane: laneStateAt(p.role, ctx.lanes, s.startMin) }));
  // only a MAJOR prize elsewhere is a real "trade" — the timeline includes noisy
  // minor camps (River/Seedling) we must not read as a game-swinging objective.
  const crossMap = (ctx.majors ?? []).filter((m) => m.minute >= s.startMin - 0.3 && m.minute <= s.startMin + 2.5 && MAJOR_OBJ.test(m.type)).map((m) => ({ type: m.type, side: m.side }));

  const notes: string[] = [];
  const adverse = s.result === 'lost' || s.net < 0 || manAdv < 0;
  // numbers at the engage — the single biggest "why did we lose that"
  if (manAdv <= -1) notes.push(`You opened it a ${Math.abs(manAdv)}-body down (${ourAlive}v${theirAlive}) — the numbers were lost before the fight was.`);
  else if (manAdv >= 1 && s.result !== 'won') notes.push(`You had the bodies (${ourAlive}v${theirAlive}) and it still went ${s.ourKills}-${s.theirKills} — that's a fight you should win with the man up.`);
  // dead teammates: exculpatory — they literally couldn't be there
  for (const d of dead.slice(0, 2)) notes.push(`${d.name} (${d.role}) was dead — went down ${d.agoSec}s earlier, so this was never a full-strength fight.`);
  // rotations: only raise when the fight went badly (don't nag a clean win)
  if (adverse) for (const a of absent.slice(0, 2)) {
    if (a.lane === 'winning') notes.push(`${a.name} (${a.role}) was alive and ahead in lane — a shove-and-rotate there flips a ${s.ourKills}-${s.theirKills} into a numbers advantage.`);
    else if (a.lane === 'losing') notes.push(`${a.name} (${a.role}) was alive but losing lane and pinned — with them stuck across the map, this was the wrong fight to start.`);
    else notes.push(`${a.name} (${a.role}) was alive and never joined — get them to the fight and the count changes.`);
  }
  // cross-map trade: lost the fight but the map paid for it (or vice-versa)
  const seen = new Set<string>();
  for (const cm of crossMap) {
    const isTrade = (s.result === 'lost' && cm.side === 'us') || (s.result === 'won' && cm.side === 'them');
    if (!isTrade || seen.has(cm.type + cm.side)) continue;
    seen.add(cm.type + cm.side);
    notes.push(cm.side === 'us'
      ? `You took ${titleCase(cm.type)} in the same window — read it as a trade, not a clean loss.`
      : `They traded the fight for ${titleCase(cm.type)} across the map — you won bodies but gave the objective.`);
  }

  return { ourAlive, theirAlive, manAdv, outnumbered: manAdv < 0, absent, dead, crossMap, notes: notes.slice(0, 4) };
}

/** Cluster the kill stream into fights and classify each. `objEvents` are the
 *  objective + tower events (us/them, seconds) a fight may have been contesting.
 *  Pass `ctx` to attach the per-fight macro read (rotations / numbers / trades). */
export function detectSkirmishes(kills: FactKill[], objEvents: ObjEvent[], durationMin: number, ctx?: SkirmishContext): Skirmish[] {
  const sorted = [...kills].sort((a, b) => a.t - b.t);
  const o = orient(sorted);                              // per-game map orientation (null if unclear)
  // 1) greedy time-window clustering
  const clusters: FactKill[][] = [];
  for (const k of sorted) {
    const cur = clusters[clusters.length - 1];
    if (cur && k.t - cur[cur.length - 1]!.t <= GAP) cur.push(k);
    else clusters.push([k]);
  }

  const out: Skirmish[] = [];
  for (const c of clusters) {
    if (c.length < 2) continue;                          // a single trade isn't a skirmish
    const startSec = c[0]!.t, endSec = c[c.length - 1]!.t;
    const ourKills = c.filter((k) => k.killerSide === 'us').length;
    const theirKills = c.filter((k) => k.killerSide === 'them').length;
    const net = ourKills - theirKills;
    const size = c.length;
    const heroesOf = (side: 'us' | 'them') => [...new Set(
      c.flatMap((k) => [k.killerSide === side ? k.killerSlug : null, k.killedSide === side ? k.killedSlug : null]).filter((s): s is string => !!s),
    )];
    const ourHeroes = heroesOf('us'), theirHeroes = heroesOf('them');
    const kind: Skirmish['kind'] = size >= 4 ? 'teamfight' : size >= 2 ? 'skirmish' : 'pick';
    const result: Skirmish['result'] = net > 0 ? 'won' : net < 0 ? 'lost' : 'even';

    // objective/tower on the line. `place` reads from the nearest of ANY objective
    // (incl. minor camps); the TAG only counts a major prize on the line.
    const inWindow = objEvents.filter((e) => e.sec >= startSec - OBJ_WINDOW && e.sec <= endSec + OBJ_WINDOW);
    const mid = (startSec + endSec) / 2;
    const byProximity = (a: ObjEvent, b: ObjEvent) => Math.abs(a.sec - mid) - Math.abs(b.sec - mid);
    const nearAny = [...inWindow].sort(byProximity)[0] ?? null;
    const nearMajor = inWindow.filter(isMajor).sort(byProximity)[0] ?? null;
    const anchor = nearMajor ?? nearAny;
    const nearObjective = anchor ? { type: anchor.type, side: anchor.side, kind: anchor.kind } : null;

    // where it physically happened, from the fight's located-kill centroid (THEORY)
    const loc = c.filter((k) => k.x != null && k.y != null);
    const region = (o && loc.length)
      ? regionOf(loc.reduce((s, k) => s + k.x!, 0) / loc.length, loc.reduce((s, k) => s + k.y!, 0) / loc.length, o)
      : null;
    // place: the major prize on the line, else the location, else a minor objective.
    const place = nearMajor ? `${nearMajor.side === 'us' ? 'your' : 'their'} ${titleCase(nearMajor.type)}`
      : region ?? (anchor ? `${anchor.side === 'us' ? 'your' : 'their'} ${titleCase(anchor.type)}` : 'open map');

    // significance: bodies + decisiveness + a MAJOR prize on the line + lateness
    const lateness = durationMin > 0 ? Math.min(1, endSec / 60 / durationMin) : 0.5;
    const significance = size * 1.0 + Math.abs(net) * 1.5 + (nearMajor ? 3 : 0) + lateness * 2;

    // tags — the two the coach leads with. game-defining = a decisive fight over a
    // major prize; bad-trade = a fight we lost bodies in with no major prize won.
    let tag: Skirmish['tag'] = null;
    if ((size >= 4 || Math.abs(net) >= 2) && nearMajor && net !== 0) tag = 'game-defining';
    else if (net <= -2 && (!nearMajor || nearMajor.side === 'them')) tag = 'bad-trade';

    const base = {
      startSec, endSec, startMin: Math.round((startSec / 60) * 10) / 10,
      ourKills, theirKills, net, result, size, kind, ourHeroes, theirHeroes,
      region, place, nearObjective, significance: Math.round(significance * 10) / 10, tag,
    };
    out.push(ctx ? { ...base, macro: skirmishMacro(base, sorted, ctx) } : base);
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}

/** The handful of fights worth leading the review with: tagged ones first, then
 *  by significance. */
export function keySkirmishes(skirmishes: Skirmish[], limit = 3): Skirmish[] {
  return [...skirmishes]
    .filter((s) => s.tag || s.significance >= 6)
    .sort((a, b) => (b.tag ? 1 : 0) - (a.tag ? 1 : 0) || b.significance - a.significance)
    .slice(0, limit);
}

// Rotation read: when a laner shows up in someone else's lane, and whether the
// map expected it. Pure + deterministic over a film's own kill stream (located
// kills) and its located tower events (src/map-lanes.ts puts both on a lane).
//
// A rotation credit = one of our laners (carry, support, mid, offlane) credited
// with a kill or a death on a lane that is not their home lane. Jungle/river
// locations are not counted: a mid in the river next to mid lane is not a
// rotation, and the lane radius cannot tell a river crossing from a gank path.
//
// The context is what the maintainer asked for (2026-10-26): a rotation is
// EXPECTED once the player's own lane is pushed and opened, i.e. the enemy outer
// tower in their home lane is down. Before that, leaving lane is a proactive
// play that costs lane pressure, so the read carries both sides of the trade:
//   answered — the kill avenged an ally who died on that lane in the last 30s
//              (same enemy, or same lane)
//   payoff   — a major or enemy structure we took within 90s
//   homeCost — one of OUR structures on the player's home lane lost within 90s
// And the inverse: once a lane is open, a fight elsewhere with that laner alive
// and uncredited is a rotation window (unproven: assists have no timestamp).
//
// THEORY framing: kill location is where the victim died; lane edges are a
// tuned radius; wave state is not in the feed, so "pushed" means "outer tower
// down", nothing finer.

import { laneOfPoint, laneLabel, HOME_LANE, type MapLane } from './map-lanes.js';

interface Kill { t: number; min: number; killerSide: 'us' | 'them'; killedSide: 'us' | 'them'; killerPid: string | null; killedPid: string | null; killerSlug: string | null; killedSlug: string | null; x: number | null; y: number | null }
interface Ev { sec: number; type: string; side: 'us' | 'them'; kind: 'objective' | 'tower'; x?: number | null; y?: number | null; lane?: MapLane | null }
interface Player { pid: string; us: boolean; role: string; heroSlug: string; heroName: string; name: string; squadName?: string | null; assists?: number }
interface Sk { startSec: number; endSec: number; startMin: number; result: string; ourHeroes: string[] }

export interface RotationCredit {
  min: number; pid: string; name: string; hero: string; role: string;
  home: MapLane; at: MapLane; credit: 'kill' | 'death'; other: string;   // other = the victim (kill) or killer (death) hero
  expected: boolean;                         // home lane already opened (enemy outer tower down) when it happened
  answered: { ally: string; secAfter: number } | null;
  payoff: { type: string; min: number }[];    // our majors / their structures taken within 90s
  homeCost: { type: string; min: number }[];  // our structures on the home lane lost within 90s
}
export interface LaneState { lane: MapLane; theirOuterDownMin: number | null; ourOuterDownMin: number | null }
export interface RotationSummary {
  pid: string; name: string; hero: string; role: string; home: MapLane;
  laneOpenedMin: number | null;              // enemy outer tower on the home lane fell (by anyone on our side)
  rotationKills: number; rotationDeaths: number; beforeOpen: number; answered: number; paidOff: number; costHome: number;
  windowsAfterOpen: { startMin: number; at: MapLane; result: string }[];   // fights on other lanes after the lane opened, no kill/death credit (assists unknown)
  assists: number;
}
export interface RotationRead {
  note: string;
  located: boolean;                          // tower events carry locations (else lane states are unknown)
  lanes: LaneState[];
  credits: RotationCredit[];
  players: RotationSummary[];
}

const WINDOW = 90, ANSWER = 30;
const MAJOR = /FANG|PRIME|ORB/i;
const r1 = (sec: number) => Math.round(sec / 6) / 10;

export function readRotations(f: { players: Player[]; kills: Kill[]; events?: Ev[]; skirmishes?: Sk[] }): RotationRead | null {
  const kills = (f.kills ?? []).filter((k) => k.x != null && k.y != null);
  if (!kills.length) return null;
  const towers = (f.events ?? []).filter((e) => e.kind === 'tower').map((e) => ({ ...e, lane: e.lane ?? (e.x != null && e.y != null ? laneOfPoint(e.x, e.y) : null) }));
  const located = towers.length > 0 && towers.every((e) => e.lane);
  const outerDown = (lane: MapLane, side: 'us' | 'them') => {   // side = who TOOK it
    const e = towers.find((t) => t.lane === lane && t.type === 'OUTER_TOWER' && t.side === side);
    return e ? e.sec : null;
  };
  const lanes: LaneState[] = (['duo', 'mid', 'offlane'] as MapLane[]).map((lane) => {
    const a = located ? outerDown(lane, 'us') : null, b = located ? outerDown(lane, 'them') : null;
    return { lane, theirOuterDownMin: a != null ? r1(a) : null, ourOuterDownMin: b != null ? r1(b) : null };
  });
  const openedSec = (lane: MapLane) => (located ? outerDown(lane, 'us') : null);

  const us = f.players.filter((p) => p.us);
  const heroName = new Map(f.players.map((p) => [p.pid, p.heroName]));
  const at = (k: Kill) => laneOfPoint(k.x!, k.y!);
  const prizesAfter = (sec: number) => [
    ...(f.events ?? []).filter((e) => e.side === 'us' && (e.kind === 'tower' || MAJOR.test(e.type)) && e.sec >= sec && e.sec <= sec + WINDOW),
  ].map((e) => ({ type: e.type, min: r1(e.sec) }));

  const credits: RotationCredit[] = [];
  for (const p of us) {
    const home = HOME_LANE[p.role];
    if (!home) continue;
    for (const k of kills) {
      const credit = k.killerPid === p.pid && k.killerSide === 'us' ? 'kill' : k.killedPid === p.pid && k.killedSide === 'us' ? 'death' : null;
      if (!credit) continue;
      const lane = at(k);
      if (lane === 'jungle' || lane === home) continue;
      const opened = openedSec(home);
      // answered: an ally died on this lane in the prior 30s, and this kill
      // took down their killer or happened on the same lane
      let answered: RotationCredit['answered'] = null;
      if (credit === 'kill') {
        const allyDeath = kills.filter((d) => d.killedSide === 'us' && d.killedPid !== p.pid && d.t <= k.t && d.t >= k.t - ANSWER && (d.killerPid === k.killedPid || at(d) === lane)).pop();
        if (allyDeath) answered = { ally: heroName.get(allyDeath.killedPid!) ?? allyDeath.killedSlug ?? '?', secAfter: k.t - allyDeath.t };
      }
      const homeCost = located ? towers.filter((e) => e.side === 'them' && e.lane === home && e.sec >= k.t - 30 && e.sec <= k.t + WINDOW).map((e) => ({ type: e.type, min: r1(e.sec) })) : [];
      credits.push({
        min: k.min, pid: p.pid, name: p.squadName || p.name, hero: p.heroName, role: p.role, home, at: lane, credit,
        other: credit === 'kill' ? (heroName.get(k.killedPid!) ?? k.killedSlug ?? '?') : (heroName.get(k.killerPid!) ?? k.killerSlug ?? '?'),
        expected: opened != null && opened <= k.t,
        answered, payoff: credit === 'kill' ? prizesAfter(k.t) : [], homeCost,
      });
    }
  }
  credits.sort((a, b) => a.min - b.min);

  const sks = f.skirmishes ?? [];
  const fightLanes = (s: Sk) => [...new Set(kills.filter((k) => k.t >= s.startSec - 1 && k.t <= s.endSec + 1).map(at).filter((l) => l !== 'jungle'))];
  const players: RotationSummary[] = us.filter((p) => HOME_LANE[p.role]).map((p) => {
    const home = HOME_LANE[p.role]!;
    const mine = credits.filter((c) => c.pid === p.pid);
    const opened = openedSec(home);
    const windowsAfterOpen = opened == null ? [] : sks
      .filter((s) => s.startSec >= opened && !s.ourHeroes.includes(p.heroSlug))
      .map((s) => ({ s, ls: fightLanes(s) }))
      .filter(({ ls }) => ls.length && !(ls as MapLane[]).includes(home))
      .map(({ s, ls }) => ({ startMin: s.startMin, at: ls[0]!, result: s.result }));
    return {
      pid: p.pid, name: p.squadName || p.name, hero: p.heroName, role: p.role, home,
      laneOpenedMin: opened != null ? r1(opened) : null,
      rotationKills: mine.filter((c) => c.credit === 'kill').length,
      rotationDeaths: mine.filter((c) => c.credit === 'death').length,
      beforeOpen: mine.filter((c) => !c.expected).length,
      answered: mine.filter((c) => c.answered).length,
      paidOff: mine.filter((c) => c.payoff.length).length,
      costHome: mine.filter((c) => c.homeCost.length).length,
      windowsAfterOpen, assists: p.assists ?? 0,
    };
  });

  return {
    note: `rotation = a laner's kill/death credited on another lane (kill location, lane radius from data/postgame tower positions; jungle/river excluded). expected = the enemy outer tower on their home lane was already down. answered = an ally died on that lane within ${ANSWER}s before. payoff/homeCost = our prize / our home-lane structure lost within ${WINDOW}s. windowsAfterOpen lists fights elsewhere after the lane opened with no kill/death credit; assists are not timestamped, so presence there is unknown. THEORY at lane edges.${located ? '' : ' Tower events in this film carry no location, so lane-open state is unknown.'}`,
    located, lanes, credits, players,
  };
}

/** One plain sentence per rotation credit, for notes and the critic SOURCE. */
export function describeCredit(c: RotationCredit): string {
  const what = c.credit === 'kill' ? `killed ${c.other}` : `died to ${c.other}`;
  const why = c.answered ? `, ${c.answered.secAfter}s after ${c.answered.ally} died there` : '';
  const ctx = c.expected ? `their ${laneLabel(c.home)} outer tower was already down` : `before their ${laneLabel(c.home)} was opened`;
  const pay = c.payoff.length ? `; then took ${c.payoff.map((x) => x.type).join(', ')}` : '';
  const cost = c.homeCost.length ? `; lost ${c.homeCost.map((x) => x.type).join(', ')} on the ${laneLabel(c.home)}` : '';
  return `${c.min}m ${c.name} (${c.hero}, ${c.role}) ${what} on the ${laneLabel(c.at)}${why} (${ctx})${pay}${cost}`;
}

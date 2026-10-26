// Game flags: the few things that decided a game, computed from its own
// committed facts so the coach can only rank and phrase them, never invent
// them (maintainer ask 2026-10-26: "lead with the flags that went wrong").
//
// Each flag carries an id the review cites (`coaching.flags[].ref`), a tone
// (bad = what lost it, good = what won it / a standout), a one-line summary
// and evidence lines (times, who, where) that the page shows collapsed under
// the flags. Pure: no I/O, so it is unit-tested and reused by the critic.
//
// THEORY: location labels come from map geometry (src/map-lanes.ts) and fight
// numbers from global alive counts; neither proves who was in a fight.

import { halfOfPoint, laneLabel, laneOfPoint } from './map-lanes.js';

export interface GameFlag {
  id: string;
  kind: 'no-close' | 'objective-for-bodies' | 'fought-down' | 'struggling-player' | 'kills-no-gold' | 'closing-collapse' | 'standout';
  tone: 'bad' | 'good';
  summary: string;
  evidence: string[];
  pid?: string;
}

const MAJOR = /^(FANGTOOTH|PRIMAL_FANGTOOTH|ORB_PRIME|MINI_PRIME)$/;
const NAME: Record<string, string> = {
  FANGTOOTH: 'Fangtooth', PRIMAL_FANGTOOTH: 'Primal Fangtooth', ORB_PRIME: 'Orb Prime', MINI_PRIME: 'Mini Prime',
  OUTER_TOWER: 'outer tower', INNER_TOWER: 'inner tower', INHIBITOR: 'inhibitor', CORE: 'Core',
};
const PRIME_PIT: [number, number] = [6731, -746];
const FANG_PIT: [number, number] = [-5178, 3789];
const CORES = { dawn: [948, 16292] as [number, number], dusk: [582, -13172] as [number, number] };
const near = (x: number, y: number, p: [number, number], r: number) => Math.hypot(x - p[0], y - p[1]) <= r;
const m1 = (sec: number) => Math.round(sec / 6) / 10;
const fmt = (min: number) => `${min.toFixed(1)}m`;
const kGold = (g: number) => `${(g / 1000).toFixed(1)}k`;

/** "at the Orb Prime pit", "in our base", "on the offlane in their half". THEORY at the edges. */
export function placeOf(x: number, y: number, ourTeam: 'dawn' | 'dusk'): string {
  const theirTeam = ourTeam === 'dawn' ? 'dusk' : 'dawn';
  if (near(x, y, CORES[ourTeam], 5000)) return 'in our base';
  if (near(x, y, CORES[theirTeam], 5000)) return 'in their base';
  if (near(x, y, PRIME_PIT, 2200)) return 'at the Prime pit';
  if (near(x, y, FANG_PIT, 2200)) return 'at the Fangtooth pit';
  const half = halfOfPoint(y) === ourTeam ? 'our' : 'their';
  const lane = laneOfPoint(x, y);
  return lane === 'jungle' ? `in ${half} jungle` : `on the ${laneLabel(lane)} in ${half} half`;
}

export function gameFlags(f: any): GameFlag[] {
  const players = (f.players ?? []) as any[];
  const us = players.filter((p) => p.us), them = players.filter((p) => !p.us);
  if (!us.length || !them.length) return [];
  const ourTeam: 'dawn' | 'dusk' = f.ourTeam === 'dusk' ? 'dusk' : 'dawn';
  const hero = new Map(players.map((p) => [p.pid, p.heroName as string]));
  const kills = ([...(f.kills ?? [])] as any[]).sort((a, b) => a.t - b.t);
  const events = ([...(f.events ?? [])] as any[]).sort((a, b) => a.sec - b.sec);
  const sks = ([...(f.skirmishes ?? [])] as any[]).sort((a, b) => a.startSec - b.startSec);
  const endSec = Math.max((f.durationMin ?? 0) * 60, ...events.map((e) => e.sec), ...kills.map((k) => k.t));
  const loss = f.result === 'loss';
  const out: GameFlag[] = [];
  const ourDeaths = (from: number, to: number) => kills.filter((k) => k.killedSide === 'us' && k.t >= from && k.t <= to);
  const deathLine = (k: any) => `${fmt(k.min)}: ${hero.get(k.killedPid) ?? k.killedSlug} died to ${hero.get(k.killerPid) ?? k.killerSlug} ${placeOf(k.x, k.y, ourTeam)}`;
  const theirLosses = events.filter((e) => e.kind === 'tower' && e.side === 'them');

  // 1. Enemy inhibitor(s) down, game lost: what we did with the open base.
  const inhibs = events.filter((e) => e.kind === 'tower' && e.side === 'us' && e.type === 'INHIBITOR');
  if (loss && inhibs.length) {
    const first = inhibs[0]!;
    const after = events.filter((e) => e.sec > first.sec);
    const ourStructAfter = after.filter((e) => e.kind === 'tower' && e.side === 'us');
    const ourMajorsAfter = after.filter((e) => e.kind === 'objective' && e.side === 'us' && MAJOR.test(e.type));
    const lanes = inhibs.map((e) => `${e.lane ?? 'unknown'} (${fmt(m1(e.sec))})`).join(' and ');
    const ev = [`Took their ${inhibs.length === 1 ? 'inhibitor' : 'inhibitors'}: ${lanes}.`];
    const theirDown = events.filter((e) => e.kind === 'tower' && e.side === 'us' && e.sec <= first.sec && e.type !== 'INHIBITOR').map((e) => `${e.lane} ${NAME[e.type] ?? e.type}`);
    if (theirDown.length) ev.push(`Already down on their side by then: ${theirDown.join(', ')}.`);
    for (const m of ourMajorsAfter) {
      const next = ourStructAfter.find((e) => e.sec > m.sec);
      ev.push(`${NAME[m.type]} at ${fmt(m1(m.sec))}: ${next ? `next structure we took came at ${fmt(m1(next.sec))}, ${((next.sec - m.sec) / 60).toFixed(1)} min later` : 'no structure taken after it'}.`);
    }
    const lostAfter = theirLosses.filter((e) => e.sec > first.sec);
    if (lostAfter.length) ev.push(`Meanwhile they took ${lostAfter.length} of our structures, ending with the ${NAME[lostAfter[lostAfter.length - 1]!.type] ?? 'Core'}.`);
    ev.push(`The game ended ${((endSec - first.sec) / 60).toFixed(1)} min after the first inhibitor fell; we never hit their Core.`);
    out.push({ id: 'no-close', kind: 'no-close', tone: 'bad', summary: `${inhibs.length} enemy ${inhibs.length === 1 ? 'inhibitor' : 'inhibitors'} down and no finish`, evidence: ev });
  }

  // 2. A major objective bought with three or more allied deaths.
  for (const m of events.filter((e) => e.kind === 'objective' && e.side === 'us' && MAJOR.test(e.type))) {
    const dead = ourDeaths(m.sec - 60, m.sec + 60);
    if (new Set(dead.map((k) => k.killedPid)).size < 3) continue;
    const lost = theirLosses.filter((e) => e.sec > m.sec && e.sec <= m.sec + 150);
    out.push({
      id: `objective-for-bodies@${fmt(m1(m.sec))}`, kind: 'objective-for-bodies', tone: 'bad',
      summary: `${NAME[m.type]} cost ${new Set(dead.map((k) => k.killedPid)).size} allied deaths${lost.length ? ` and ${lost.length} structures right after` : ''}`,
      evidence: [`We took ${NAME[m.type]} at ${fmt(m1(m.sec))}.`, ...dead.map(deathLine),
        ...(lost.length ? [`Then they took ${lost.map((e) => `${e.lane === 'jungle' ? '' : `${e.lane} `}${NAME[e.type] ?? e.type} (${fmt(m1(e.sec))})`).join(', ')}.`] : [])],
    });
  }

  // 3. Late fights started a player down (global alive counts, not local attendance).
  const lastFights = sks.slice(-4);
  const down = lastFights.filter((s) => (s.macro?.manAdv ?? 0) < 0 || (s.macro?.dead ?? []).length > 0);
  if (down.length >= 2 && down.some((s) => s.result === 'lost')) {
    out.push({
      id: 'fought-down', kind: 'fought-down', tone: 'bad',
      summary: `${down.length} of the last ${lastFights.length} fights started with an ally already dead`,
      evidence: down.map((s) => `${fmt(s.startMin)}: ${s.macro.ourAlive}v${s.macro.theirAlive}, ${s.result} ${s.ourKills}-${s.theirKills}${(s.macro.dead ?? []).length ? `; ${s.macro.dead.map((d: any) => `${hero.get(players.find((p) => p.squadName === d.name || p.name === d.name)?.pid) ?? d.hero} died ${d.agoSec}s earlier`).join(', ')}` : ''}.`),
    });
  }

  // 4. A struggling player: deaths well over their own norm on this hero, or the most deaths in the game.
  const maxDeaths = Math.max(...players.map((p) => p.deaths ?? 0));
  for (const p of us) {
    const d = (p.diagnostics?.metrics ?? []).find((x: any) => x.key === 'deaths');
    const overNorm = d && d.flag === 'bad' && d.deltaPct >= 30;
    if ((p.deaths ?? 0) < 8 || !(overNorm || p.deaths === maxDeaths)) continue;
    const byKiller = new Map<string, number>();
    for (const k of kills) if (k.killedPid === p.pid) byKiller.set(k.killerPid, (byKiller.get(k.killerPid) ?? 0) + 1);
    const [topKiller, topN] = [...byKiller].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    const opp = them.find((q) => q.role === p.role);
    const ev = [`${p.deaths} deaths${p.deaths === maxDeaths ? ', the most in the game' : ''}${d ? ` (their norm on ${p.heroName}: ${d.avg})` : ''}.`];
    if (topKiller && topN >= 3) ev.push(`${topN} of them to ${hero.get(topKiller)}.`);
    if (opp?.goldEarned && p.goldEarned) ev.push(`Gold ${kGold(p.goldEarned)} vs ${opp.heroName} ${kGold(opp.goldEarned)}.`);
    out.push({ id: `struggling:${p.pid}`, kind: 'struggling-player', tone: 'bad', pid: p.pid, summary: `${p.heroName} died ${p.deaths} times`, evidence: ev });
  }

  // 5. Kill lead without a gold lead.
  let usK = 0, themK = 0, peak = 0, peakAt = 0;
  for (const k of kills) { k.killerSide === 'us' ? usK++ : themK++; if (usK - themK > peak) { peak = usK - themK; peakAt = k.min; } }
  const gold = (rows: any[]) => rows.reduce((s, p) => s + (p.goldEarned ?? 0), 0);
  const [gUs, gThem] = [gold(us), gold(them)];
  if (peak >= 4 && gUs && gThem && gUs <= gThem) {
    out.push({ id: 'kills-no-gold', kind: 'kills-no-gold', tone: 'bad', summary: `kill lead never became a gold lead`,
      evidence: [`Peak kill lead +${peak} at ${fmt(peakAt)}; kills ended ${usK}-${themK}.`, `Team gold ${kGold(gUs)} vs ${kGold(gThem)}.`] });
  }

  // 6. The game ended on an enemy kill streak.
  let streak = 0;
  for (let i = kills.length - 1; i >= 0 && kills[i]!.killerSide === 'them'; i--) streak++;
  if (loss && streak >= 5) {
    const s = kills[kills.length - streak]!;
    out.push({ id: 'closing-collapse', kind: 'closing-collapse', tone: 'bad', summary: `they scored the last ${streak} kills`,
      evidence: [`From ${fmt(s.min)} to ${fmt(kills[kills.length - 1]!.min)} every kill was theirs (kills stood ${usK}-${themK - streak} before the run).`] });
  }

  // 7. Standout: the most hero damage in the game, or hero damage far over their own norm.
  const topDmg = [...players].sort((a, b) => (b.damageToHeroes ?? 0) - (a.damageToHeroes ?? 0))[0];
  for (const p of us) {
    const dm = (p.diagnostics?.metrics ?? []).find((x: any) => x.key === 'dmg');
    const top = topDmg?.pid === p.pid;
    if (!top && !(dm && dm.flag === 'good' && dm.deltaPct >= 50)) continue;
    const ev = [`${p.kills}/${p.deaths}/${p.assists}, ${p.damageToHeroes} hero damage${top ? ', the most in the game' : ''}.`];
    if (dm) ev.push(`Hero damage per minute ${dm.value} vs their ${p.heroName} norm ${dm.avg}.`);
    out.push({ id: `standout:${p.pid}`, kind: 'standout', tone: 'good', pid: p.pid, summary: `${p.heroName} carried the damage`, evidence: ev });
  }
  return out;
}

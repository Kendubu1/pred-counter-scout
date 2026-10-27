// Game flags: the few things that decided a game, computed from its own
// committed facts so the coach can only rank and phrase them, never invent
// them (maintainer ask 2026-10-26: "lead with the flags that went wrong").
//
// Each flag carries an id the review cites (`coaching.flags[].ref`), a tone
// (bad = what lost it, good = what won it / a standout), a one-line summary
// and evidence lines (times, who, where) that the page shows collapsed under
// the flags. Pure: no I/O, so it is unit-tested and reused by the critic.
//
// `why` (2026-10-27, maintainer: "answer the why, not the statement we already
// know"): the causes the kill stream can prove behind a flag. Where and after
// what the deaths came, where each jungler spent the game and whether the
// enemy one was ever answered, who fell first before each lost window, what a
// kill lead was spent on. Totals (objective damage, team gold) are the result,
// so they stay in evidence; the review leads with the why.
//
// THEORY: location labels come from map geometry (src/map-lanes.ts) and fight
// numbers from global alive counts; neither proves who was in a fight.

import { halfOfPoint, laneLabel, laneOfPoint } from './map-lanes.js';

export interface GameFlag {
  id: string;
  kind: 'no-close' | 'objective-for-bodies' | 'fought-down' | 'struggling-player' | 'kills-no-gold' | 'closing-collapse' | 'standout' | 'jungle-run' | 'collapse' | 'opened-map';
  tone: 'bad' | 'good';
  summary: string;
  evidence: string[];
  /** Provable causes behind the flag, the lines a review builds its "because" from. */
  why?: string[];
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
const LOST = (e: any) => e.side === 'them' && (e.kind === 'tower' || MAJOR.test(e.type));
const tally = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
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
  const lostEv = events.filter(LOST);
  const lane = (k: any) => laneOfPoint(k.x, k.y);
  const ourHalf = (k: any) => halfOfPoint(k.y) === ourTeam;
  const jungler = (side: boolean) => players.find((p) => p.us === side && p.role === 'jungle');
  const credits = (pid: string) => kills.filter((k) => k.killerPid === pid || k.killedPid === pid);
  const lostName = (e: any) => `${e.lane && e.lane !== 'jungle' ? `${e.lane} ` : ''}${NAME[e.type] ?? e.type}`;

  // Why a player kept dying: which half, which lane, right after their own
  // kill, and where our jungler was each time the enemy jungler got them.
  function deathWhy(p: any, killer: string | null): string[] {
    const deaths = kills.filter((k) => k.killedPid === p.pid);
    if (!deaths.length) return [];
    const why: string[] = [];
    const theirs = deaths.filter((k) => !ourHalf(k)).length;
    if (theirs >= Math.ceil(deaths.length * 0.6)) why.push(`${theirs} of ${deaths.length} deaths came in their half of the map, past the river.`);
    else if (deaths.length - theirs >= Math.ceil(deaths.length * 0.6)) why.push(`${deaths.length - theirs} of ${deaths.length} deaths came in our half of the map, on our side of the river.`);
    if (killer) {
      const by = deaths.filter((k) => k.killerPid === killer);
      const [l, n] = tally(by.map((k) => laneLabel(lane(k))))[0]!;
      if (n >= 3) why.push(`${n === by.length ? 'All' : n} of the ${by.length} deaths to ${hero.get(killer)} came on the ${l}.`);
    }
    const traded = deaths.filter((d) => kills.some((k) => k.killerPid === p.pid && k.t < d.t && d.t - k.t <= 45));
    if (traded.length >= 2) why.push(`${traded.length} deaths came within 45s of a kill of their own: each kill was answered before the lead could be spent.`);
    const ej = jungler(false), oj = jungler(true);
    if (killer && ej && oj && killer === ej.pid && oj.pid !== p.pid) {
      let there = 0, away = 0, dead = 0;
      const awayLanes: string[] = [];
      for (const d of deaths.filter((k) => k.killerPid === killer)) {
        const near = credits(oj.pid).filter((k) => Math.abs(k.t - d.t) <= 45);
        if (near.some((k) => lane(k) === lane(d) && Math.abs(k.t - d.t) <= 30)) there++;
        else if (kills.some((k) => k.killedPid === oj.pid && k.t < d.t && d.t - k.t <= 60)) dead++;
        else if (near.length) { away++; awayLanes.push(laneLabel(lane(near[0]!))); }
      }
      const parts = [away && `fighting on another lane for ${away} (${list([...new Set(awayLanes)])})`, dead && `dead or respawning for ${dead}`, there && `on the same lane for ${there}`].filter(Boolean) as string[];
      const total = deaths.filter((k) => k.killerPid === killer).length;
      if (parts.length) why.push(`Of the ${total} deaths to ${hero.get(killer)}, ${oj.heroName} was ${list(parts)}${there + away + dead < total ? '; the rest leave no credit to place them' : ''}.`);
    }
    return why;
  }

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
      id: `objective-for-bodies@${m1(m.sec).toFixed(1)}`, kind: 'objective-for-bodies', tone: 'bad',
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
    out.push({ id: `struggling:${p.pid}`, kind: 'struggling-player', tone: 'bad', pid: p.pid, summary: `${p.heroName} died ${p.deaths} times`, evidence: ev, why: deathWhy(p, topN >= 3 ? topKiller : null) });
  }

  // 5. Kill lead without a gold lead.
  let usK = 0, themK = 0, peak = 0, peakAt = 0;
  for (const k of kills) { k.killerSide === 'us' ? usK++ : themK++; if (usK - themK > peak) { peak = usK - themK; peakAt = k.min; } }
  const gold = (rows: any[]) => rows.reduce((s, p) => s + (p.goldEarned ?? 0), 0);
  const [gUs, gThem] = [gold(us), gold(them)];
  if (peak >= 4 && gUs && gThem && gUs <= gThem) {
    out.push({ id: 'kills-no-gold', kind: 'kills-no-gold', tone: 'bad', summary: `kill lead never became a gold lead`,
      evidence: [`Peak kill lead +${peak} at ${fmt(peakAt)}; kills ended ${usK}-${themK}.`, `Team gold ${kGold(gUs)} vs ${kGold(gThem)}.`], why: leadWhy(peak, peakAt) });
  }

  // What the kill lead was spent on, who soaked our kills, and how it was thrown back.
  function leadWhy(peakN: number, peakMin: number): string[] {
    const why: string[] = [];
    let a = 0, b = 0, from = -1, to = -1;
    for (const k of kills) { k.killerSide === 'us' ? a++ : b++; if (a > b && from < 0) from = k.t; if (from >= 0 && to < 0 && a <= b) to = k.t; }
    if (from >= 0) {
      const end = to >= 0 ? to : endSec;
      const spent = events.filter((e) => e.side === 'us' && e.sec >= from && e.sec <= end && (e.kind === 'tower' || MAJOR.test(e.type)));
      why.push(`Ahead on kills from ${fmt(m1(from))} to ${to >= 0 ? fmt(m1(to)) : 'the end'} and the lead bought ${!spent.length ? 'no structure or major' : spent.length > 4 ? `${spent.length} structures and majors` : list(spent.map((e) => `${e.kind === 'tower' ? 'their ' : ''}${lostName(e)}`))}.`);
    }
    const ours = kills.filter((k) => k.killerSide === 'us');
    const [vic, n] = tally(ours.map((k) => k.killedPid))[0] ?? ['', 0];
    const v = players.find((p) => p.pid === vic), vOpp = v && us.find((q) => q.role === v.role);
    if (v && n >= 4 && n / ours.length >= 0.3) why.push(`${n} of our ${ours.length} kills were on ${v.heroName}${vOpp?.goldEarned && v.goldEarned >= vOpp.goldEarned ? `, who still out-earned ${vOpp.heroName} ${kGold(v.goldEarned)} to ${kGold(vOpp.goldEarned)}` : ''}: killing the same player again did not slow their gold.`);
    const after = kills.filter((k) => k.t > peakMin * 60 && k.t <= peakMin * 60 + 90);
    const lostAfter = lostEv.filter((e) => e.sec > peakMin * 60 && e.sec <= peakMin * 60 + 90);
    if (after.filter((k) => k.killerSide === 'them').length >= 2) why.push(`In the 90s after the +${peakN} peak: ${list(after.map((k) => `${hero.get(k.killerPid) ?? 'a minion or tower'} killed ${hero.get(k.killedPid) ?? k.killedSlug}`))}${lostAfter.length ? `, and they took the ${list(lostAfter.map(lostName))}` : ''}.`);
    const majorsThem = tally(events.filter((e) => e.kind === 'objective' && e.side === 'them' && (MAJOR.test(e.type) || /SEEDLING|GENESIS/.test(e.type))).map((e) => NAME[e.type] ?? e.type.replace(/_/g, ' ').toLowerCase()));
    if (majorsThem.length) why.push(`Their kills turned into objectives: ${list(majorsThem.map(([t, c]) => `${c} ${t}${c > 1 ? 's' : ''}`))}, plus ${theirLosses.length} of our structures.`);
    return why;
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

  // 8. A jungler ran the map: many kills, rarely or never answered. The why is
  // where each jungler spent the game.
  for (const side of [false, true]) {
    const j = jungler(side), other = jungler(!side);
    if (!j || !other) continue;
    const ks = kills.filter((k) => k.killerPid === j.pid), ds = kills.filter((k) => k.killedPid === j.pid);
    const last = ds[ds.length - 1];
    const free = ks.filter((k) => !last || k.t > last.t).length;
    const goldGap = (j.goldEarned ?? 0) - (other.goldEarned ?? 0);
    if (ks.length < 8 || (free < 6 && goldGap < 4000)) continue;
    const ev = [`${j.heroName} ${j.kills}/${j.deaths}/${j.assists}, ${kGold(j.goldEarned ?? 0)} gold vs ${other.heroName} ${kGold(other.goldEarned ?? 0)}.`];
    const sideRows = side ? us : them, otherRows = side ? them : us;
    const objSide = sideRows.reduce((s, p) => s + (p.damageToObjectives ?? 0), 0), objOther = otherRows.reduce((s, p) => s + (p.damageToObjectives ?? 0), 0);
    if (j.damageToObjectives) ev.push(`${j.heroName} objective damage ${j.damageToObjectives}; ${side ? 'their' : 'our'} whole team ${objOther}.`);
    const why: string[] = [];
    why.push(last ? `${j.heroName} was killed ${ds.length === 1 ? 'once' : `${ds.length} times`}, last at ${fmt(last.min)}; ${free} kills came after that with no death.` : `${j.heroName} never died: ${ks.length} kills without a death.`);
    const inVictimHalf = ks.filter((k) => ourHalf(k) !== side).length;
    why.push(`${j.heroName}'s kills by lane: ${list(tally(ks.map((k) => laneLabel(lane(k)))).map(([l, c]) => `${l} ${c}`))}, ${inVictimHalf} of them in ${side ? 'their' : 'our'} half; victims ${list(tally(ks.map((k) => hero.get(k.killedPid) ?? k.killedSlug)).map(([h, c]) => `${h} ${c}`))}.`);
    const oks = kills.filter((k) => k.killerPid === other.pid);
    if (oks.length) why.push(`${other.heroName}'s kills went elsewhere: ${list(tally(oks.map((k) => `${hero.get(k.killedPid) ?? k.killedSlug} on the ${laneLabel(lane(k))}`)).map(([h, c]) => `${h} ${c}`))}.`);
    const answered = ks.filter((k) => kills.some((r) => r.killedPid === j.pid && r.t > k.t && r.t - k.t <= 45)).length;
    why.push(answered ? `Only ${answered} of ${j.heroName}'s ${ks.length} kills ${answered === 1 ? 'was' : 'were'} answered with a kill on ${j.heroName} within 45s.` : `None of ${j.heroName}'s ${ks.length} kills was answered with a kill on ${j.heroName} within 45s.`);
    const seed = tally(events.filter((e) => e.kind === 'objective' && /SEEDLING|FANGTOOTH/.test(e.type)).map((e) => `${e.type === 'SEEDLING' ? 'seedling' : 'fang'}:${e.side === 'us' ? 'us' : 'them'}`));
    const c = (k: string) => seed.find(([x]) => x === k)?.[1] ?? 0;
    if (c('seedling:us') + c('seedling:them') + c('fang:us') + c('fang:them')) why.push(`Jungle prizes: Seedlings ${c('seedling:us')}-${c('seedling:them')}, Fangtooths ${c('fang:us')}-${c('fang:them')} (us-them).`);
    out.push({ id: `jungle-run:${side ? 'us' : 'them'}`, kind: 'jungle-run', tone: side ? 'good' : 'bad', pid: j.pid,
      summary: `${j.heroName} ran the map: ${ks.length} kills, ${free} after ${side ? 'their' : 'our'} last answer`, evidence: ev, why });
  }

  // 9. A collapse: four or more allies dead inside a minute for at most one
  // kill, then structures or majors fell. The why is who fell first and whether
  // it was one fight or two.
  let skipUntil = -1;
  for (const d of kills.filter((k) => k.killedSide === 'us')) {
    if (d.t <= skipUntil) continue;
    const dead = kills.filter((k) => k.killedSide === 'us' && k.t >= d.t && k.t <= d.t + 60);
    const ourK = kills.filter((k) => k.killerSide === 'us' && k.t >= d.t - 15 && k.t <= d.t + 60).length;
    const fell = lostEv.filter((e) => e.sec >= d.t && e.sec <= d.t + 150);
    if (new Set(dead.map((k) => k.killedPid)).size < 4 || ourK > 1 || !fell.length) continue;
    skipUntil = dead[dead.length - 1]!.t;
    const first = players.find((p) => p.pid === d.killedPid);
    const lanes = tally(dead.filter((k) => lane(k) !== 'jungle').map((k) => laneLabel(lane(k))));
    const sk = sks.find((s) => s.startSec <= d.t + 5 && s.endSec >= d.t - 5);
    const why = [`${first?.heroName ?? d.killedSlug} (${first?.role ?? 'ally'}) fell first, to ${hero.get(d.killerPid) ?? 'a minion or tower'} ${placeOf(d.x, d.y, ourTeam)}; ${dead.length - 1} more died in the next ${dead[dead.length - 1]!.t - d.t}s.`];
    if (lanes.length > 1) why.push(`The deaths split across ${list(lanes.map(([l, c]) => `the ${l} (${c})`))}: two fights at once, so neither side could help the other.`);
    if (sk?.macro && sk.macro.manAdv > 0) why.push(`It started ${sk.macro.ourAlive}v${sk.macro.theirAlive} in our favour by global alive count and still went ${sk.ourKills}-${sk.theirKills}.`);
    why.push(`Then they took the ${list(fell.map(lostName))}.`);
    out.push({ id: `collapse@${m1(d.t).toFixed(1)}`, kind: 'collapse', tone: 'bad', summary: `${new Set(dead.map((k) => k.killedPid)).size} allies died inside a minute for ${ourK} kill${ourK === 1 ? '' : 's'}, then ${fell.length} structures and majors fell`, evidence: dead.map(deathLine), why });
  }

  // 10. Who went down first before the losses: an ally whose death opened
  // two or more lost windows (structures or majors they took within 75s).
  const opened = new Map<string, { k: any; lost: any[] }[]>();
  for (const e of lostEv) {
    const first = kills.find((k) => k.killedSide === 'us' && k.t >= e.sec - 75 && k.t <= e.sec);
    if (!first) continue;
    const rows = opened.get(first.killedPid) ?? [];
    const row = rows.find((r) => r.k === first) ?? (rows.push({ k: first, lost: [] }), rows[rows.length - 1]!);
    row.lost.push(e);
    opened.set(first.killedPid, rows);
  }
  for (const [pid, rows] of opened) {
    const n = rows.reduce((s, r) => s + r.lost.length, 0);
    if (rows.length < 2 || n < 4) continue;
    const p = players.find((q) => q.pid === pid);
    out.push({ id: `opened-map:${pid}`, kind: 'opened-map', tone: 'bad', pid,
      summary: `${p?.heroName ?? 'An ally'} went down first before ${n} of the ${lostEv.length} structures and majors we lost`,
      evidence: rows.map((r) => `${deathLine(r.k)}; then the ${list(r.lost.map((e) => `${lostName(e)} (${fmt(m1(e.sec))})`))}.`),
      why: [`Each of those ${rows.length} windows opened with ${p?.heroName ?? 'them'} dead, so the team fought or defended with four at most.`] });
  }
  return out;
}

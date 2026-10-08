// The interrogation pass: deterministic answers to the causation questions a
// coach asks of the film (docs/coaching-methodology.md §4), computed from each
// review's OWN committed data so the numbers become citable facts — the honesty
// verifier only passes numbers present in the file, so derived sums (team ward
// totals, river-control counts) must live here before the coach can say them.
//
//   npm run postgame:interrogate            # add to reviews missing it
//   npm run postgame:interrogate -- --all   # recompute on every review
//
// Writes `f.interrogation`:
//   vision        — ward war: wards placed/destroyed, us vs them (team sums)
//   riverControl  — RIVER and SEEDLING takes by side (map income share)
//   concededMajors— every enemy non-river major with who on our side was dead
//                   in the prior 60s; nobody dead => `uncontested: true` (five
//                   alive and it fell anyway — an awareness read, THEORY)
//
// Pure local — NO API calls; fully reproducible from the committed kill stream,
// player rows, and objective timeline.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PostGameFacts } from '../postgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = path.join(ROOT, 'data/postgame');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;

export interface Interrogation {
  vision: { usWards: number; themWards: number; usDestroyed: number; themDestroyed: number };
  riverControl: { riverUs: number; riverThem: number; seedlingUs: number; seedlingThem: number };
  concededMajors: { type: string; minute: number; deadBefore: string[]; uncontested: boolean }[];
  /** The support's own yardstick (coach audit 2026-09-21): participation, wards, healing, early deaths, died-first count. */
  support?: { pid: string; hero: string; participation: number; assistShare: number; wardsPlaced: number; wardsDestroyed: number; wardsPerMin: number; enemySupportWards: number | null; healing: number; mitigated: number; deathsBefore10: number; diedFirst: number; carryDeathsBefore10: number } | null;
  /** The duo lane as a 2v2: the support row of lanes[] is a 1v1 sim and is NOT a lane read. THEORY. */
  /** Every structure THEY took, with what we were doing around it: our dead in the prior 60s, a major we took within 90s, the nearest fight within 60s. The structure story of a game, in order (2026-10-08). */
  structureLedger?: { min: number; type: string; ourDeadBefore: string[]; ourMajorInWindow: string | null; fightInWindow: { startMin: number; result: string; score: string } | null }[];
  structures?: { usTaken: number; themTaken: number; inhibitorsLost: number; theirPlayerObjDamage: number; ourPlayerObjDamage: number };
  /** A loss the stat sheet says we should have won. Deterministic triggers; when set, the coach owes a `deepDive`. */
  upset?: { isUpset: boolean; reasons: string[] };
  duoLane?: { ourCarry: string; ourSupport: string; theirCarry: string; theirSupport: string; carryRead: string | null; firstBlood: string | null; firstFangtooth: 'us' | 'them' | null; duoDeathsBefore10: { us: number; them: number }; read: 'ours' | 'theirs' | 'even' } | null;
}

function interrogate(f: PostGameFacts): Interrogation | null {
  const players = (f.players ?? []) as any[];
  const us = players.filter((p) => p.us);
  const them = players.filter((p) => !p.us);
  if (!us.length || !them.length) return null;
  const sum = (rows: any[], k: string) => rows.reduce((s, p) => s + (p[k] ?? 0), 0);
  const majors = ((f.timeline as any)?.majors ?? []) as { minute: number; type: string; side: string }[];
  const usedEv = new Set<any>();
  const kills = ((f as any).kills ?? []) as any[];
  const heroOf = new Map(us.map((p) => [p.pid, `${p.heroName} (${p.role})`]));
  const concededMajors = majors
    .filter((m) => m.side === 'them' && m.type !== 'RIVER' && m.type !== 'SEEDLING')
    .map((m) => {
      // timeline.majors carries a ROUNDED minute; the event stream has the
      // exact second. Use it, or the 60s window misses deaths that sit just
      // before a major (3a95c5eb: four deaths at 24.5-24.9 into Orb Prime at
      // 25.6, which the rounded 26m window read as "nobody dead").
      const ev = ((f as any).events ?? []).find((e: any) => e.type === m.type && e.side === m.side && Math.abs(e.sec / 60 - m.minute) <= 0.51 && !usedEv.has(e));
      if (ev) usedEv.add(ev);
      const t = ev ? ev.sec : m.minute * 60;
      const deadBefore = kills
        .filter((k) => k.killedSide === 'us' && heroOf.has(k.killedPid) && k.t >= t - 60 && k.t <= t + 10)
        .map((k) => heroOf.get(k.killedPid)!);
      return { type: m.type, minute: m.minute, deadBefore: [...new Set(deadBefore)], uncontested: deadBefore.length === 0 };
    });
  const teamKills = us.reduce((s, p) => s + (p.kills ?? 0), 0);
  const teamAssists = us.reduce((s, p) => s + (p.assists ?? 0), 0);
  const dur = Math.max(1, (f as any).durationMin ?? 1);
  const sks = ((f as any).skirmishes ?? []) as { startSec: number; endSec: number }[];
  const sup = us.find((p) => p.role === 'support');
  const carry = us.find((p) => p.role === 'carry');
  const theirSup = them.find((p) => p.role === 'support');
  const theirCarry = them.find((p) => p.role === 'carry');
  const deathsBefore10 = (pid: string | undefined) => (pid ? kills.filter((k) => k.killedPid === pid && k.min < 10).length : 0);
  const support = sup ? {
    pid: sup.pid, hero: sup.heroName,
    participation: Math.round(((sup.kills ?? 0) + (sup.assists ?? 0)) / Math.max(1, teamKills) * 100),
    assistShare: Math.round((sup.assists ?? 0) / Math.max(1, teamAssists) * 100),
    wardsPlaced: sup.wardsPlaced ?? 0, wardsDestroyed: sup.wardsDestroyed ?? 0,
    wardsPerMin: Math.round(((sup.wardsPlaced ?? 0) / dur) * 100) / 100,
    enemySupportWards: theirSup ? (theirSup.wardsPlaced ?? 0) : null,
    healing: sup.healingDone ?? 0, mitigated: sup.mitigated ?? 0,
    deathsBefore10: deathsBefore10(sup.pid),
    diedFirst: sks.filter((s) => { const first = kills.filter((k) => k.t >= s.startSec - 1 && k.t <= s.endSec + 1).sort((a, b) => a.t - b.t)[0]; return first && first.killedPid === sup.pid; }).length,
    carryDeathsBefore10: deathsBefore10(carry?.pid),
  } : null;
  let duoLane: Interrogation['duoLane'] = null;
  if (sup && carry && theirSup && theirCarry) {
    const fb = kills.find((k) => k.firstBlood);
    const duoPids = new Set([sup.pid, carry.pid, theirSup.pid, theirCarry.pid]);
    const firstBlood = fb ? `${fb.killerSide} (${fb.killerSlug} on ${fb.killedSlug}${duoPids.has(fb.killerPid) || duoPids.has(fb.killedPid) ? ', in the duo lane' : ''})` : null;
    const fang = majors.find((m) => /FANG/.test(m.type));
    const usD = deathsBefore10(sup.pid) + deathsBefore10(carry.pid);
    const themD = kills.filter((k) => (k.killedPid === theirSup.pid || k.killedPid === theirCarry.pid) && k.min < 10).length;
    const firstFangtooth = fang ? (fang.side as 'us' | 'them') : null;
    const read: 'ours' | 'theirs' | 'even' = usD < themD && firstFangtooth !== 'them' ? 'ours' : usD > themD && firstFangtooth !== 'us' ? 'theirs' : 'even';
    const carryLane = ((f as any).lanes ?? []).find((l: any) => l.role === 'carry');
    duoLane = { ourCarry: carry.heroName, ourSupport: sup.heroName, theirCarry: theirCarry.heroName, theirSupport: theirSup.heroName, carryRead: carryLane?.summary ?? null, firstBlood, firstFangtooth, duoDeathsBefore10: { us: usD, them: themD }, read };
  }
  const events = (((f as any).events ?? []) as { sec: number; type: string; side: string; kind: string }[]);
  const towerEv = events.filter((e) => e.kind === 'tower');
  const structureLedger = towerEv.filter((e) => e.side === 'them').map((e) => {
    const ourDeadBefore = [...new Set(kills.filter((k) => k.killedSide === 'us' && heroOf.has(k.killedPid) && k.t >= e.sec - 60 && k.t <= e.sec + 5).map((k) => heroOf.get(k.killedPid)!))];
    const maj = events.find((m) => m.kind === 'objective' && m.side === 'us' && !/RIVER|SEEDLING/.test(m.type) && Math.abs(m.sec - e.sec) <= 90);
    const fight = (((f as any).skirmishes ?? []) as { startSec: number; endSec: number; startMin: number; result: string; ourKills: number; theirKills: number }[])
      .find((s) => e.sec >= s.startSec - 60 && e.sec <= s.endSec + 60);
    return { min: Math.round(e.sec / 6) / 10, type: e.type, ourDeadBefore, ourMajorInWindow: maj ? `${maj.type}@${Math.round(maj.sec / 6) / 10}m` : null, fightInWindow: fight ? { startMin: fight.startMin, result: fight.result, score: `${fight.ourKills}-${fight.theirKills}` } : null };
  });
  const structures = towerEv.length ? {
    usTaken: towerEv.filter((e) => e.side === 'us').length, themTaken: towerEv.filter((e) => e.side === 'them').length,
    inhibitorsLost: towerEv.filter((e) => e.side === 'them' && /INHIB/.test(e.type)).length,
    theirPlayerObjDamage: sum(them, 'damageToObjectives'), ourPlayerObjDamage: sum(us, 'damageToObjectives'),
  } : undefined;
  const theirKills = them.reduce((s, p) => s + (p.kills ?? 0), 0);
  const conv = (f as any).fights?.conversion;
  const obj = (f as any).objectives ?? {};
  const upsetReasons: string[] = [];
  if ((f as any).result === 'loss') {
    if (teamKills >= 1.5 * Math.max(1, theirKills)) upsetReasons.push(`kills ${teamKills} to ${theirKills}`);
    if ((obj.ourKills ?? 0) > (obj.theirKills ?? 0)) upsetReasons.push(`majors ${obj.ourKills} to ${obj.theirKills}`);
    if (conv && conv.wonFights >= 2 * Math.max(1, conv.theirWonFights)) upsetReasons.push(`fights won ${conv.wonFights} to ${conv.theirWonFights}`);
    if (structures && structures.ourPlayerObjDamage >= 2 * Math.max(1, structures.theirPlayerObjDamage)) upsetReasons.push(`player objective damage ${structures.ourPlayerObjDamage} to ${structures.theirPlayerObjDamage}`);
  }
  const upset = { isUpset: upsetReasons.length >= 2, reasons: upsetReasons };
  return {
    support, duoLane, structureLedger, structures, upset,
    vision: {
      usWards: sum(us, 'wardsPlaced'), themWards: sum(them, 'wardsPlaced'),
      usDestroyed: sum(us, 'wardsDestroyed'), themDestroyed: sum(them, 'wardsDestroyed'),
    },
    riverControl: {
      riverUs: majors.filter((m) => m.type === 'RIVER' && m.side === 'us').length,
      riverThem: majors.filter((m) => m.type === 'RIVER' && m.side === 'them').length,
      seedlingUs: majors.filter((m) => m.type === 'SEEDLING' && m.side === 'us').length,
      seedlingThem: majors.filter((m) => m.type === 'SEEDLING' && m.side === 'them').length,
    },
    concededMajors,
  };
}

function main() {
  const all = process.argv.includes('--all');
  const files = readdirSync(OUT_DIR).filter((f) => UUID_RE.test(f));
  let touched = 0, skipped = 0;
  for (const fn of files) {
    const p = path.join(OUT_DIR, fn);
    const f = JSON.parse(readFileSync(p, 'utf8')) as PostGameFacts & { interrogation?: Interrogation | null };
    if (!all && f.interrogation) continue;
    const ig = interrogate(f);
    if (!ig) { skipped++; continue; }
    f.interrogation = ig;
    writeFileSync(p, JSON.stringify(f, null, 1));
    touched++;
  }
  console.log(`${touched} review(s) interrogated; ${skipped} skipped (no player rows).`);
}

main();

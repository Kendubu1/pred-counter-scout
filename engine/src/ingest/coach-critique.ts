import { reviewDigest, selectReviewScope, validateCoachContract } from '../coach-contract.js';
import { describeCredit } from '../rotations.js';
import { coachingPresetPrompt } from '../coaching-presets.js';
// Independent critic over post-game COACHING. A SEPARATE agent (NOT the author
// pred-scout-coach) reviews each game's coaching narrative against the match
// FACTS and flags any line that (a) coaches a player's hero/role PREFERENCE
// instead of the game & the draft, (b) isn't grounded in the facts, or (d) uses
// second-person voice — the review is read by the whole squad, so team lines say
// "we/the team" and per-player lines name the player. Each flag carries a rewrite. Rewrites are ground-checked (a fix can't
// add a number absent from the facts), applied back into the postgame coaching,
// and the per-round agreement rate feeds the convergence gate.
//
//   COPY_MODE=prepare npm run coach:critique:prepare   # emit critique tasks
//   (an INDEPENDENT pred-scout-coach-critic agent fills coach-critique.responses.json)
//   npm run coach:critique                              # aggregate + apply + report
//   npm run coach:loop:gate                             # CONTINUE / STOP

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine, stripReviewLineNumber } from '../copy-verify.js';
import { ask, flushTasks, isPrepare } from '../copy-session.js';

// What each player actually ran (players[i].loadout, npm run postgame:loadout):
// without it in the SOURCE, a coaching line naming someone's Eternal or augment
// would be flagged as invented.
const ranOf = (p: any): string => {
  const lo = p.loadout;
  if (!lo) return '';
  const parts = [lo.eternal ? `Eternal ${lo.eternal}${lo.minor1 || lo.minor2 ? ` (${[lo.minor1, lo.minor2].filter(Boolean).join(' + ')})` : ''}` : '', lo.augment ? `augment ${lo.augment.name}` : '', lo.crest ? `crest ${lo.crest}` : ''].filter(Boolean);
  return parts.length ? ` [ran: ${parts.join(', ')}]` : '';
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PG = path.join(ROOT, 'data/postgame');

interface Coaching { flags?: { ref: string; text: string }[]; playerBullets?: Record<string, string[]>; playerTestimony?: unknown; lossReflection?: string; visionEvidence?: Record<string, { tool: string; source: string; note: string }>; headline?: string; team?: string; whatShiftedIt?: string; whatWorked?: string; focus?: { title?: string; evidence?: string; action?: string }; perPlayer?: Record<string, string>; verdicts?: Record<string, { mood?: string; text?: string }>; moments?: Record<string, { call?: string }>; buildReads?: Record<string, Partial<Record<'matchup' | 'build' | 'eternal' | 'augment' | 'crest' | 'improvement', string | string[]>>>; ranking?: { pid?: string; grade?: string }[];  deepDive?: { verdict?: string; causes?: { claim?: string; receipt?: string }[]; ledger?: string; theCall?: string; rule?: string };  microReads?: Record<string, { keep?: string; change?: string; check?: string; receipt?: string; lastCheck?: { text?: string; result?: string; receipt?: string } }>; }
interface Facts { matchId: string; result: string; durationMin: number; vpSwing: number | null; players: any[]; lanes: any[]; comp: any; objectives: any; timeline?: any; skirmishes?: any[]; kills?: { killedPid: string | null; min: number }[]; coaching?: Coaching | null; }

/** Compact, factual source block the critic judges the coaching against. */
function sourceOf(f: Facts): string {
  const us = f.players.filter((p) => p.us);
  const sk = (f.skirmishes ?? []);
  const tagged = sk.filter((s) => s.tag);
  // macro reads on the fights that carry them — numbers at the engage, who was dead,
  // who was alive and never rotated, cross-map trades. The coach must use THIS, not
  // hero-vs-hero, to explain the fights.
  const withMacro = sk.filter((s) => s.macro && (s.macro.notes ?? []).length);
  return [
    `EVIDENCE LIMITS: Lane verdicts are simulations, not observed lane results. Missing kill/death credit does not establish absence. Alive counts are not local fight numbers. Chronology alone does not prove causation. Preserve grounded blunt coaching and adult humor; do not invent corrections.`,
    `JUNGLE VISION RULE: Current normalized loadouts do not supply ward-versus-sentry equipment or swap history. Placements and clears do not identify the equipped tool; completed items are not a vision-slot record. Require explicit match-linked equipment evidence or user testimony before saying someone ran wards or sentry. Unknown equipment alone does not justify a generic switch-to-sentry warning. Confirmed ward underuse can justify that denial-focused recommendation, considering duration, opportunities and team coverage, not a universal count threshold or guaranteed improvement. Do not fault a sentry user for low ward placements alone or assign ambiguous testimony to a guessed match.`,
    `CATALOG PASSIVES FOR ITEMS NAMED IN PLAYER ADVICE (mechanics, not observed activations): ${JSON.stringify(JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/items.json'), 'utf8')).filter((item: any) => [...Object.values(f.coaching?.perPlayer ?? {}), ...Object.values(f.coaching?.playerBullets ?? {}).flat(), ...Object.values(f.coaching?.buildReads ?? {}).flatMap(b => Object.values(b).flat())].some(text => text.toLowerCase().includes(String(item.display_name || item.name).toLowerCase()))).map((item: any) => ({name:item.display_name || item.name,effects:item.effects})))}.`,
    `MATCH-LINKED PLAYER ACCOUNT (user relaying friends, not independently verified telemetry): ${JSON.stringify(f.coaching?.playerTestimony ?? null)}. Preserve provenance internally. Visible advice may be prospective without naming friends; do not turn testimony into an independently observed claim. Never infer timestamps, counts or motives from this account.`,
    `MATCH-LINKED VISION TESTIMONY: ${JSON.stringify(f.coaching?.visionEvidence ?? {})}. Keys are player IDs in this match only. Credit confirmed sentry clearing; never recommend switching to the tool already used.`,
    `RESULT: ${f.result} in ${f.durationMin}m${f.vpSwing != null ? `, VP ${f.vpSwing >= 0 ? '+' : ''}${f.vpSwing}` : ''}.`,
    `DECISIVE FIGHTS: ${tagged.length ? tagged.map((s) => `${s.startMin}m ${s.kind} ${s.result} ${s.ourKills}-${s.theirKills} @ ${s.place} [${s.tag}]`).join('; ') : 'none tagged'}.`,
    `ALL SKIRMISHES (n=${sk.length}): ${sk.map((s) => `${s.startMin}m ${s.result} ${s.ourKills}-${s.theirKills} @ ${s.place} (${(s.ourHeroes ?? []).join('/')} v ${(s.theirHeroes ?? []).join('/')})`).join(', ') || 'none'}.`,
    `GLOBAL ALIVE COUNTS (not local attendance): ${withMacro.length ? withMacro.map((s) => `${s.startMin}m (${s.macro.ourAlive}v${s.macro.theirAlive}): attendance unknown`).join(' | ') : 'none'}.`,
    `OBJECTIVES: majors you ${f.objectives?.ourKills}-${f.objectives?.theirKills} them${f.timeline ? `, towers ${f.timeline.towers.us}-${f.timeline.towers.them}` : ''}${(f.objectives as any)?.ourObjDamage != null ? `, objective damage us ${(f.objectives as any).ourObjDamage} vs them ${(f.objectives as any).theirObjDamage}` : ''}.`,
    // Named-prize timeline (round-12 lesson: Genesis Core@29m WAS in the facts;
    // a SOURCE without the majors stream makes the critic flag true lines).
    `MAJOR TIMELINE: ${((f.timeline as any)?.majors ?? []).filter((m: any) => m.type !== 'RIVER').map((m: any) => `${m.type}@${m.minute}m ${m.side}`).join(', ') || 'none'}.`,
    `SIMULATED LANES (not observed results): ${f.lanes.map((l) => `${l.role} ${l.ourHero} vs ${l.theirHero} (${l.edge}${l.predggMatchup ? `, ${l.predggMatchup.winrate}%` : ''}${(l as any).summary ? `, lane read: ${(l as any).summary}` : ''})`).join('; ')}.`,
    `COMP: you ${f.comp?.ourDamage?.physical}P/${f.comp?.ourDamage?.magical}M, them ${f.comp?.theirDamage?.physical}P/${f.comp?.theirDamage?.magical}M; their healers ${f.comp?.theirHealers?.join(', ') || 'none'}.`,
    `RECORDED ETERNAL CATALOG (includes alternative minor choices, mechanics not measured uptime): ${JSON.stringify(JSON.parse(readFileSync(path.join(ROOT, 'data/game-data/eternals.json'), 'utf8')).eternals.filter((e: any) => us.some(p => p.loadout?.eternal === e.name)))}.`,
    `RECORDED AUGMENT CATALOG: ${JSON.stringify(us.map(p => ({pid:p.pid,augment:JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/predgg-augments.json'), 'utf8')).catalog[p.loadout?.augment?.id]})))}.`,
    `PLAYER HISTORICAL HERO BASELINES (descriptive, not proof of execution mistakes or role/patch-adjusted expectations): ${JSON.stringify(us.map(p => ({pid:p.pid,hero:p.heroName,metrics:p.diagnostics?.metrics ?? []})))}. Lower damage does not establish missed shots, poor reloads, or cancelled abilities.`,
    `OUR PLAYERS: ${us.map((p) => `${p.squadName || p.name} ${p.heroName} ${p.role}${ranOf(p)} ${p.kills}/${p.deaths}/${p.assists} (kill participation ${Math.round(((p.kills + p.assists) / Math.max(1, us.reduce((a, q) => a + q.kills, 0))) * 100)}% of ${us.reduce((a, q) => a + q.kills, 0)} team kills), ${(p as any).damageToHeroes ?? '?'} hero dmg, ${(p as any).damageToObjectives ?? '?'} obj dmg, ${(p as any).goldEarned ?? '?'} gold, ${(p as any).healingDone ?? '?'} healing, ${(p as any).mitigated ?? '?'} mitigated, ${(p as any).damageTaken ?? '?'} damage taken, ${(p as any).wardsPlaced ?? '?'} wards placed + ${(p as any).wardsDestroyed ?? 0} cleared, items [${((p as any).items ?? []).map((i: any) => i.name ?? i).join(', ')}]${((p as any).itemTimeline ?? []).length ? `, est online [${(p as any).itemTimeline.map((t: any) => `${t.name}~${t.estMin}m`).join(', ')}]` : ''}${((p as any).matchupItemFlags ?? []).length ? `, film flags [${(p as any).matchupItemFlags.join('; ')}]` : ''}${((p as any).missingCore ?? []).length ? `, missing meta core [${(p as any).missingCore.join(', ')}]` : ''}${(p as any).winningCore ? `, winning core [${(p as any).winningCore.items.join(', ')}] at ${(p as any).winningCore.wr}%` : ''}${(p.spikes ?? []).length ? ` (spikes ${p.spikes.map((s: any) => `${s.name}~${s.spikeMinute}m`).join(', ')})` : ''}${p.roleFit?.concern ? ` [off bottom-two lane]` : ''}`).join('; ')}.`,
    // Enemy rows too (round-13 lesson: enemy healing/damage figures cited from
    // the film — e.g. their Narbash's 70,180 healing — were flagged as invented
    // because the SOURCE only printed our side).
    `THEIR PLAYERS: ${f.players.filter((p) => !p.us).map((p) => `${p.heroName} ${p.role}${ranOf(p)} ${p.kills}/${p.deaths}/${p.assists}, ${(p as any).damageToHeroes ?? '?'} hero dmg, ${(p as any).damageToObjectives ?? '?'} obj dmg, ${(p as any).goldEarned ?? '?'} gold, ${(p as any).healingDone ?? '?'} healing, ${(p as any).mitigated ?? '?'} mitigated, ${(p as any).damageTaken ?? '?'} damage taken, ${(p as any).wardsPlaced ?? '?'} wards placed, items [${((p as any).items ?? []).map((i: any) => i.name ?? i).join(', ')}]`).join('; ')}.`,
    `FIGHT PRESENCE RULE: the macro "absent" signal is based on kill/death credits only; assists are not timestamped per fight, so it is not a complete participant list. Check match-wide assists, objective damage and credited skirmishes before any broad "never rotates" claim; those totals are context, not proof of where or when a rotation happened. Never turn one absent window into a repeat-pattern verdict. A support's lane read is a 1v1 sim that never happens; grade supports on participation, wards, healing/mitigation and deaths, not that lane row (coach audit 2026-09-21).`,
    `ROTATION / LANE TRADE CHECK: same-game credits by our player [${us.map((p) => { const n = sk.filter((s) => (s.ourHeroes ?? []).includes(p.heroSlug)).length; return `${p.squadName || p.name} ${p.heroName}: kill/death credited in ${n}/${sk.length} skirmishes, ${p.assists ?? 0} match assists, ${(p as any).damageToObjectives ?? 0} match objective damage`; }).join('; ')}]. Assists and objective damage are match-wide, not per-fight. Structure events (side = who took it; lane from pred.gg location when present): [${((f as any).events ?? []).filter((e: any) => e.kind === 'tower' || /INHIBITOR|CORE/.test(e.type)).map((e: any) => `${(e.sec / 60).toFixed(1)}m ${e.type}${e.lane ? ` ${e.lane}` : ''} side ${e.side}`).join('; ') || 'none'}]. Compare the lane read and opponent output; never assign a tower without a lane label to a lane, and never infer wave state or positions between kills.`,
    `ROTATIONS (rotations block, src/rotations.ts; kill locations on lanes, THEORY at lane edges): ${(f as any).rotations ? `${((f as any).rotations.credits ?? []).filter((c: any) => (f.players.find((p) => p.pid === c.pid) as any)?.us).map(describeCredit).join('; ') || 'no allied kill or death credited off a home lane'}. Lane opened (enemy outer tower down) per allied laner: ${((f as any).rotations.players ?? []).map((p: any) => `${p.name} ${p.home} ${p.laneOpenedMin ?? 'never'}${p.windowsAfterOpen.length ? `, fights elsewhere after it with no credit at ${p.windowsAfterOpen.map((w: any) => `${w.startMin}m ${w.at} ${w.result}`).join('/')}` : ''}`).join('; ')}` : 'not computed'}. RULE: a laner leaving an unopened lane is a proactive play to credit (with any homeCost); staying in it is expected and never an "absent" fault. Once their lane is open, a fight elsewhere without them is a rotation window, unproven when they have assists. A macro note saying "two separate plays, not one fight" means no one was absent from it.`,
    ...interrogationLines(f),
    ...fightEconLines(f),
    ...previousFilmLines(f),
  ].join('\n');
}


/** Cross-film callbacks (coach contract 2026-09-21): the coach may name a
 *  repeating pattern across a squad member's previous films, so the critic
 *  must see those films' facts. One compact line per member per prior film
 *  (up to three, newest first, by index.json order): date, hero/role, K/D/A,
 *  wards, deaths caught outside any fight, deaths before minute 10. */
function previousFilmLines(f: Facts): string[] {
  let idx: { matchId: string; startTime: string }[] = [];
  try { idx = (JSON.parse(readFileSync(path.join(PG, 'index.json'), 'utf8')).matches ?? []) as { matchId: string; startTime: string }[]; } catch { return []; }
  const mine = idx.find((m) => m.matchId === f.matchId);
  if (!mine) return [];
  const earlier = idx.filter((m) => m.startTime < mine.startTime).sort((a, b) => b.startTime.localeCompare(a.startTime));
  const us = f.players.filter((p) => p.us && (p as any).squadName);
  const out: string[] = [];
  for (const p of us) {
    const rows: string[] = [];
    for (const m of earlier) {
      if (rows.length >= 3) break;
      let g: Facts;
      try { g = JSON.parse(readFileSync(path.join(PG, `${m.matchId}.json`), 'utf8')) as Facts; } catch { continue; }
      const q = g.players.find((x) => x.pid === p.pid && x.us);
      if (!q) continue;
      const caught = ((g as any).fights?.caughtOut?.us ?? []).filter((c: any) => c.pid === p.pid).length;
      const early = (g.kills ?? []).filter((k) => k.killedPid === p.pid && k.min < 10).length;
      rows.push(`${m.startTime.slice(0, 10)} ${g.result} ${q.heroName} ${q.role} ${q.kills}/${q.deaths}/${q.assists}, ${(q as any).wardsPlaced ?? '?'} wards + ${(q as any).wardsDestroyed ?? 0} cleared, ${caught} deaths outside detected kill clusters (nearby allies unknown), ${early} deaths before 10, ${(q as any).damageToObjectives ?? '?'} obj dmg, items [${((q as any).items ?? []).map((i: any) => i.name ?? i).join(', ')}]`);
    }
    if (rows.length) out.push(`PREVIOUS FILMS ${(p as any).squadName || p.name}: ${rows.join(' | ')}`);
    // the previous film's Check for this player, so this review can grade it
    for (const m of earlier) {
      let g: any; try { g = JSON.parse(readFileSync(path.join(PG, `${m.matchId}.json`), 'utf8')); } catch { continue; }
      if (!g.players?.some((x: any) => x.pid === p.pid && x.us)) continue;
      const mr = g.coaching?.microReads?.[p.pid];
      // the most recent Check on record for this player, not merely the previous
      // film (films authored before the rule carry none)
      if (!mr?.check) continue;
      out.push(`PREVIOUS CHECK ${(p as any).squadName || p.name} (${m.startTime.slice(0, 10)} ${g.result}): "${mr.check}" — change asked: "${mr.change ?? ''}". Grade it against THIS film's facts in microReads.lastCheck (held / missed / not measurable).`);
      break;
    }
  }
  if (out.length) out.unshift('PREVIOUS FILMS (for cross-film callbacks; a pattern claim must match these rows exactly):');
  return out;
}

/** The interrogation pass (postgame:interrogate): citable causation facts —
 *  team ward sums, river/seedling control, and who was dead (or that NOBODY
 *  was) going into each enemy major. */
function interrogationLines(f: Facts & { interrogation?: any }): string[] {
  const ig = (f as any).interrogation;
  if (!ig) return [];
  const out: string[] = [];
  if (ig.vision) out.push(`VISION WAR: wards placed us ${ig.vision.usWards} vs them ${ig.vision.themWards}; destroyed us ${ig.vision.usDestroyed} vs them ${ig.vision.themDestroyed}.`);
  if (ig.support) out.push(`SUPPORT YARDSTICK (${ig.support.hero}): kill participation ${ig.support.participation}% of team kills, ${ig.support.assistShare}% of team assists, ${ig.support.wardsPlaced} wards placed (${ig.support.wardsPerMin}/min${ig.support.enemySupportWards != null ? ` vs their support's ${ig.support.enemySupportWards}` : ''}) + ${ig.support.wardsDestroyed} cleared, ${ig.support.healing} healing, ${ig.support.mitigated} mitigated, ${ig.support.deathsBefore10} deaths before minute 10, died first in ${ig.support.diedFirst} fights, carry deaths before 10: ${ig.support.carryDeathsBefore10}. Grade the support on THIS; the support row of LANES is a 1v1 sim and never a lane read.`);
  if (ig.duoLane) out.push(`DUO LANE (2v2 read, THEORY): ${ig.duoLane.ourCarry} + ${ig.duoLane.ourSupport} vs ${ig.duoLane.theirCarry} + ${ig.duoLane.theirSupport}; carry matchup read ${ig.duoLane.carryRead ?? 'n/a'}; first blood ${ig.duoLane.firstBlood ?? 'none'}; first Fangtooth ${ig.duoLane.firstFangtooth ?? 'none'}; duo deaths before 10: us ${ig.duoLane.duoDeathsBefore10.us} vs them ${ig.duoLane.duoDeathsBefore10.them}; duo read: ${ig.duoLane.read}.`);
  if ((ig.structureLedger ?? []).length) out.push(`STRUCTURE LEDGER (every structure THEY took, in order; what we were doing): ${ig.structureLedger.map((s: any) => `${s.type}@${s.min}m [our dead in prior 60s: ${s.ourDeadBefore.length ? s.ourDeadBefore.join(', ') : 'nobody'}${s.ourMajorInWindow ? `; we took ${s.ourMajorInWindow} in the same window` : ''}${s.fightInWindow ? `; fight at ${s.fightInWindow.startMin}m ${s.fightInWindow.result} ${s.fightInWindow.score}` : '; no fight within 60s'}]`).join(' | ')}. Structures taken us ${ig.structures?.usTaken} vs them ${ig.structures?.themTaken}; inhibitors we lost ${ig.structures?.inhibitorsLost}; PLAYER objective damage us ${ig.structures?.ourPlayerObjDamage} vs them ${ig.structures?.theirPlayerObjDamage} (aggregate objective damage does not identify structure attackers, wave damage or individual siege opportunities).`);
  if (ig.upset?.isUpset) out.push(`UPSET LOSS: the stat sheet says we should have won (${ig.upset.reasons.join('; ')}). Under the flags format the headline and flags must explain why; classic presets carry a deepDive (verdict, 3-5 causes each with a receipt, the structure story, the one call, a checkable rule). Flag a missing explanation as (e) method.`);
  if ((ig.gameFlags ?? []).length) out.push(`GAME FLAGS (deterministic, src/game-flags.ts; what lost or won it; locations and alive counts are THEORY): ${ig.gameFlags.map((g: any) => `[${g.id}] ${g.tone} · ${g.summary}: ${g.evidence.join(' ')}`).join(' | ')}. Each coaching flags[] line cites one of these ids as ref (or "other", which must still be proven by the facts above); flag a line whose wording overstates or does not match its ref's evidence, and an omitted bad flag that clearly outweighs a cited one.`);
  if (ig.riverControl) out.push(`RIVER/SEEDLING CONTROL: river buffs us ${ig.riverControl.riverUs} vs them ${ig.riverControl.riverThem}; seedlings us ${ig.riverControl.seedlingUs} vs them ${ig.riverControl.seedlingThem}.`);
  if ((ig.concededMajors ?? []).length) out.push(`CONCEDED MAJORS (their non-river takes, who on our side was dead in the prior 60s): ${ig.concededMajors.map((m: any) => `${m.type}@${m.minute}m ${m.uncontested ? 'NOBODY DEAD (uncontested — five alive)' : m.deadBefore.join(' + ') + ' dead'}`).join('; ')}.`);
  return out;
}

/** Fight-economics facts (postgame:fights pass): first deaths, caught-out picks,
 *  cash-in rate, death costs, item gaps. The coach should cite THESE for "who
 *  died first / what it cost" claims instead of eyeballing the kill stream. */
export function fightEconLines(f: Facts & { fights?: any; kills?: any[] }): string[] {
  const out: string[] = [];
  {
    const dc = ((f as any).fights?.deathCosts ?? []) as { min: number; hero: string; solo?: boolean; cost: { type: string; min: number }[] }[];
    if (dc.length && dc.some((d) => d.solo != null)) out.push(`DEATH COST SPLIT: deaths outside detected kill clusters before an enemy prize: ${dc.filter((d) => d.solo).map((d) => `${d.hero} ${d.min}m -> ${d.cost.map((c) => `${c.type}@${c.min}m`).join('+')}`).join('; ') || 'none'} | deaths inside a fight before an enemy prize: ${dc.filter((d) => !d.solo).map((d) => `${d.hero} ${d.min}m`).join(', ') || 'none'}. Neither category proves isolation, a preventable mistake or causation. Prize timing is an association, not a measured cost of that death.`);
  }
  const sk = (f.skirmishes ?? []);
  const kills = (f as any).kills ?? [];
  if (kills.length && sk.length) {
    const openers = sk.map((s: any) => kills.find((k: any) => k.t >= s.startSec - 1 && k.t <= s.endSec + 1)).filter(Boolean);
    const usFirst = openers.filter((k: any) => k.killedSide === 'us').length;
    out.push(`FIRST DEATHS: we gave up the opening kill in ${usFirst} of ${openers.length} fights.`);
  }
  const fx = (f as any).fights;
  if (fx) {
    // Print the killer on every caught-out death and the exact minute of every
    // cost — round 10 lesson: the author cites these (they ARE in the facts),
    // and a SOURCE that omits them makes the critic flag true lines as invented.
    if (fx.caughtOut) out.push(`DEATHS OUTSIDE DETECTED KILL CLUSTERS (not proof of being alone or caught): us ${fx.caughtOut.us.length}${fx.caughtOut.us.length ? ` (${fx.caughtOut.us.map((c: any) => `${c.hero} ${c.min}m by ${c.by}`).join(', ')})` : ''}, them ${fx.caughtOut.themCount}.`);
    if (fx.conversion) out.push(`CASHING WINS: we converted ${fx.conversion.cashed} of ${fx.conversion.wonFights} won fights into a prize within 90s; them ${fx.conversion.theirCashed} of ${fx.conversion.theirWonFights}.`);
    if ((fx.deathCosts ?? []).length) out.push(`DEATH COSTS: ${fx.deathCosts.map((d: any) => `${d.hero} ${d.min}m -> ${d.cost.map((c: any) => `${c.type}@${c.min}m`).join('+')}`).join('; ')}.`);
    if ((fx.itemGap ?? []).length) out.push(`ITEM COUNT AT ENGAGE (est., THEORY): ${fx.itemGap.map((g: any) => `${g.startMin}m us ${g.us} v them ${g.them}`).join(', ')}.`);
  }
  // Full kill ladder (killer>victim@min, us-side victims marked †) so killer
  // attributions and kill minutes are verifiable instead of flag bait.
  if (kills.length) {
    const heroName = (slug: string) => (((f as any).players ?? []).find((p: any) => p.heroSlug === slug) || {}).heroName || slug;
    out.push(`KILLS: ${kills.map((k: any) => `${heroName(k.killerSlug)}>${heroName(k.killedSlug)}${k.killedSide === 'us' ? '†' : ''}@${k.min}m`).join(', ')}.`);
  }
  // Tower/objective event times (newer films) — grounds structure timestamps.
  const evs = ((f as any).events ?? []).filter((e: any) => e.kind === 'tower' || /FANG|PRIME|ORB/i.test(e.type));
  if (evs.length) out.push(`EVENTS: ${evs.map((e: any) => `${e.side} ${String(e.type).replace(/_/g, ' ')}@${Math.round(e.sec / 6) / 10}m`).join(', ')}.`);
  return out;
}

const lineList = (co: Coaching): string[] => [co.headline, ...(co.flags ?? []).map((fl) => fl?.text), co.team, co.lossReflection, co.whatShiftedIt, co.whatWorked, co.focus?.title, co.focus?.evidence, co.focus?.action, co.deepDive?.verdict, ...((co.deepDive?.causes ?? []).flatMap((c) => [c?.claim, c?.receipt])), co.deepDive?.ledger, co.deepDive?.theCall, co.deepDive?.rule, ...Object.values(co.perPlayer ?? {}), ...Object.values(co.playerBullets ?? {}).flat(), ...Object.values(co.verdicts ?? {}).map((v) => v?.text), ...Object.values(co.moments ?? {}).map((m) => m?.call), ...Object.values(co.buildReads ?? {}).flatMap((b) => [b?.matchup, b?.build, b?.eternal, b?.augment, b?.crest, b?.improvement].flat()), ...(co.ranking ?? []).map((r) => r?.grade), ...Object.values(co.microReads ?? {}).flatMap((m) => [m?.keep, m?.change, m?.check, m?.receipt, m?.lastCheck?.text ? `last check: "${m.lastCheck.text}" → ${m.lastCheck.result ?? '?'}${m.lastCheck.receipt ? ` (${m.lastCheck.receipt})` : ''}` : undefined])].filter((s): s is string => !!s);

// Coaching perPlayer values are multi-sentence; the critic flags a sentence within
// one, so we SUBSTRING-replace (not whole-string). Guard on length so a short quote
// can't over-match.
function deepReplace(o: unknown, from: string, to: string): unknown {
  if (typeof o === 'string') return (from.length > 12 && o.includes(from)) ? o.split(from).join(to) : o;
  if (Array.isArray(o)) return o.map((x) => deepReplace(x, from, to));
  if (o && typeof o === 'object') { const r: Record<string, unknown> = {}; for (const k in o as Record<string, unknown>) r[k] = deepReplace((o as Record<string, unknown>)[k], from, to); return r; }
  return o;
}
// The prompt numbers each line ("3. <line>"); the critic echoes that prefix in
// both quote and rewrite. Strip it so the quote matches the actual coaching text.
const stripNum = stripReviewLineNumber;

async function main() {
  const files = readdirSync(PG).filter((f) => f.endsWith('.json') && f !== 'index.json');
  // COACH_GAMES=<id,id,...> scopes the loop to specific matches (prefix match),
  // so a re-author of a few games doesn't re-judge the whole film library.
  const scope = (process.env.COACH_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const inScope = (fn: string, id: string) => !scope.length || scope.some((s) => fn.startsWith(s) || id.startsWith(s));
  const games = files.map((fn) => ({ fn, f: JSON.parse(readFileSync(path.join(PG, fn), 'utf8')) as Facts })).filter((g) => g.f.coaching && inScope(g.fn, g.f.matchId ?? ''));

  if (scope.length) for (const f of selectReviewScope(games.map(g => g.f), scope)) validateCoachContract(ROOT, f);
  const reviewedDigests: Record<string, string> = {};

  const report: Record<string, { quote: string; severity: string; issue: string; rewrite: string | null }[]> = {};
  let reviewed = 0, flagged = 0, grounded = 0, dropped = 0, applied = 0, unmatched = 0;

  for (const { fn, f } of games) {
    const lines = lineList(f.coaching!);
    if (!lines.length) continue;
    const id = f.matchId || fn.replace('.json', '');
    const prompt = `${coachingPresetPrompt(ROOT)}\n\nYou are an INDEPENDENT reviewer of post-game COACHING for a Predecessor (MOBA) squad match. Another agent wrote the COPY; you did NOT. The coach's job is to critique the GAME and the DRAFT — the fights, the objectives, the picks — NOT a player's personal hero/role preference. Judge the copy against the SOURCE (match facts) ONLY.

SOURCE (match facts):
${sourceOf(f)}

COACHING UNDER REVIEW (one per line):
${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Flag ONLY real problems:
(j) ACTIONABILITY: Every player needs one explicit role-specific executable takeaway woven into the paragraph. Flag generic do-better advice, unsupported retrospective blame, or five restatements of the team plan. A lossReflection must explain a plausible alternative decision, not repeat totals or promise a win. Check item trigger conditions before suggesting build corrections. Do not order tower tanking or condemn a support/mage from low aggregate objective damage alone. Advice must remain sensible without inventing wave state, nearby allies or an available target. Do not force a correction after strong play. Totals do not prove ward coverage, missed CC, cancelled ultimates or unsafe movement.
(i) DUPLICATE / GENERIC FOCUS — the authored match focus repeats the scoreboard, headline, or an existing moment without adding a match-specific decision and concrete next action. Flag only clear repetition or stat-only filler.
(a) PREFERENCE — a line telling someone to play their main / comfort hero / best role, or judging a PICK by that player's own winrate/comfort rather than the matchup, draft, or what the game needed. The squad plays new heroes in new lanes; "play your main" is NOT coaching.
(b) UNGROUNDED — a line factually wrong vs the SOURCE, or that invents a fight/objective/number not present.
(c) WRONG REFERENCE — names the wrong hero, lane, fight, or objective.
(d) VOICE — uses second person ("you/your/you're") as if addressed to one reader, or uses the map side names dawn/dusk as the team's voice (rewrite to we/they). The review is read by the WHOLE squad: team lines must speak as "we/our/the team"; per-player lines must name the player (squad name or hero) in third person. Rewrite keeping the exact same facts and numbers, changing only the voice.
(e) METHOD — blames an ally's play instead of the decision made around them; judges a role by the wrong yardstick (a support on KDA/farm, a carry on wards, an offlaner on lane kills instead of survival); or makes an execution claim the SOURCE cannot show ("missed the combo") where it only proves a decision error (numbers, items-down, timing).
(f) CAUSATION — a game-deciding claim with no why attached when the SOURCE carries one (a lost stretch without its cause; an enemy objective without who was dead or that NOBODY was); a bare timestamp with no event named ("absent at 20.5" when the SOURCE says what the 20.5 fight was); or a "why" the SOURCE cannot support (a guessed teleport, wave state, or position).
(g) READABILITY — enforce the active preset, concise paragraphs and no duplicate advice, plus these patterns: ledger jargon other than "cashed" ("priced/pricing", "receipt", "banked", "ledger", "cost column"); three or more timestamps in one sentence; a scoreline used as a noun ("the 0-2 at 14.6" — should be "the fight at 14.6, lost 0-2"); a bare unitless number like "(13464)"; internal-artifact voice ("the file says", "the sheet"); more than one coined maxim or more than one "not X, but Y" formula in the same review; pretend-depth announcers ("the line to remember is"). Rewrite preserving every fact and exact number, changing only the wording.
(h) ROLE MISREAD (coach audit 2026-09-21) — a support graded on the 1v1 lane read ("lost the support lane", "pinned in a losing lane") or on its kill/death line; an "absent"/"never joined" claim about a player whose kill participation (printed per player) and the FIGHT PRESENCE RULE make it unprovable (an unproven absent entry is not absence); an Eternal "why this fits" paragraph for a support loadout the engine does not model (Vesh/Demiurge on an enchanter) instead of the one-line unmodeled read; a ranking grade with no receipt; a hedge the coach contract bans (arguably, likely, might have, could have, defensible, reasonable, a real, worth carrying forward); the stock phrases "the shape worth repeating", "the clearest strength", "the one throughline"; a second "cashed" or "on paper" in one review; or the Eternal-is-theoretical disclaimer. Rewrite to the participation/ward/peel yardstick, drop the hedge, or drop the line. Blunt lexicon (threw, donated, griefed, free kill, coin-flip, farmed while the team fought) is house style, never a flag when two SOURCE facts back it.
(i) LEGACY PLAYER CARD (only when active preset explicitly requires cards; otherwise ignore this rule) — microReads must exist for all five of our players with a non-empty "change" and "check" in every result; flag a missing one, a "change" that restates a stat or copies a build flag or would fit any game (not anchored to an event, minute, fight, structure or count in THIS SOURCE), a "check" the feed cannot measure (aim, spacing, timing, intent), a card that repeats another player's card or the previous film's card, and a "lastCheck" whose held/missed verdict contradicts the facts or that is missing when a PREVIOUS CHECK line exists for that player.
BLUNT IS THE HOUSE STYLE: a harsh verdict backed by two or more SOURCE facts is CORRECT — do not flag or soften it; flag a blunt line only when its receipts are not in the SOURCE.
ITEM MECHANICS REQUIRE VERIFICATION: verify item/Eternal mechanics against the current catalog before using them; if unavailable, omit that advice. Missing popular items is not proof of a bad build. General coaching concepts do not establish match events. Every number and match claim needs factual source support.
LATEST MAINTAINER OVERRIDE (2026-10-19): preserve blunt competitive coaching with occasional profanity and adult locker-room humor. A concise joke about play is allowed; reject personal/identity attacks or jokes replacing evidence. This overrides older metaphor/maxim restrictions. Do not force a mistake: a strong performance may get a maintainable standard instead. Reject simulated lane advantage as actual lane victory, missing kill/death credit as absence, alive counts as local fighting numbers, and chronological proximity as proven causation. Never reward a death as evidence of attendance; old invalid attendance checks are not measurable. Verify team-high comparisons against all players.
${coachingPresetPrompt(ROOT)}
Judge against the active preset. Empty optional concise sections are not omissions. Do NOT nitpick style beyond its rules. Return strict JSON: {"flags":[{"quote":"<the exact line text>","severity":"high|med|low","issue":"<what's wrong, one phrase>","rewrite":"<a game/draft/fight-focused corrected line grounded in the SOURCE, or null to drop the line>"}]}. If all fine, return {"flags":[]}.`;

    if (scope.length && !isPrepare()) {
      const taskPath = path.join(ROOT, 'engine/copy-tasks/coach-critique.tasks.json');
      const responsePath = path.join(ROOT, 'engine/copy-tasks/coach-critique.responses.json');
      const prepared = JSON.parse(readFileSync(taskPath, 'utf8'));
      if (!prepared.tasks?.some((t: any) => t.id === id && t.prompt === prompt) || statSync(responsePath).mtimeMs < statSync(taskPath).mtimeMs) throw new Error(`Stale critique task/response for ${id}; prepare and independently review again`);
    }
    const raw = (await ask('coach-critique', id, prompt)).trim().replace(/^```json?\s*|```$/g, '');
    reviewed += lines.length;
    if (isPrepare()) continue;
    try {
      const parsed = JSON.parse(raw) as { flags?: { quote?: string; severity?: string; issue?: string; rewrite?: string | null }[] };
      if (!Array.isArray(parsed.flags)) throw new Error('Critic response must contain flags');
      const { coaching: _copy, ...factsOnly } = f;
      const allowed = buildAllowed([], [JSON.stringify(factsOnly)]);   // numbers must exist in the facts
      const flags = (parsed.flags ?? []).filter((fl) => fl.quote).map((fl) => {
        const quote = stripNum(fl.quote!);
        let rewrite = fl.rewrite != null ? stripNum(fl.rewrite) : null;
        if (rewrite) { if (verifyLine(rewrite, allowed)) grounded++; else { rewrite = null; dropped++; } }
        return { quote, severity: fl.severity ?? 'low', issue: fl.issue ?? '', rewrite };
      });
      if (flags.length) { report[id] = flags; flagged += flags.length; }
      // apply grounded rewrites back into this game's coaching
      let co: unknown = f.coaching;
      for (const fl of flags) { if (!fl.rewrite) continue; const before = JSON.stringify(co); co = deepReplace(co, fl.quote, fl.rewrite); if (JSON.stringify(co) !== before) applied++; else unmatched++; }
      if (JSON.stringify(co) !== JSON.stringify(f.coaching)) { f.coaching = co as Coaching; if (scope.length) validateCoachContract(ROOT, f); writeFileSync(path.join(PG, fn), JSON.stringify(f, null, 1)); }
      reviewedDigests[id] = reviewDigest(f);
      process.stdout.write('.');
    } catch (error) { throw new Error(`Critique failed for ${id}: ${String(error)}`); }
  }

  flushTasks('coach-critique');
  if (isPrepare()) return;

  const agreement = reviewed ? (1 - flagged / reviewed) : 1;
  const agreementRate = Math.round(agreement * 1000) / 1000;
  writeFileSync(path.join(ROOT, 'data/aggregates/coach-critique.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'independent (non-author) pred-scout-coach-critic reviewing data/postgame/*.json coaching against the match facts; preference-based / ungrounded lines flagged; grounded rewrites applied back',
    reviewedDigests, reviewedLines: reviewed, flaggedLines: flagged, agreementRate, rewritesGrounded: grounded, rewritesDropped: dropped, applied, unmatched, games: report,
  }, null, 1));

  const histPath = path.join(ROOT, 'data/aggregates/coach-critique-history.json');
  const hist = readdirSync(path.dirname(histPath)).includes('coach-critique-history.json')
    ? (JSON.parse(readFileSync(histPath, 'utf8')) as { rounds: unknown[] }) : { rounds: [] };
  hist.rounds.push({ round: hist.rounds.length + 1, at: new Date().toISOString(), reviewedLines: reviewed, flaggedLines: flagged, agreementRate, applied });
  writeFileSync(histPath, JSON.stringify(hist, null, 1));

  console.log(`\n${flagged} lines flagged / ${reviewed} reviewed (agreement ${(agreement * 100).toFixed(1)}%); ${grounded} grounded rewrites; applied ${applied} to data/postgame/ (${unmatched} unmatched) -> data/aggregates/coach-critique.json`);
  console.log(`[loop] round ${hist.rounds.length} recorded -> coach-critique-history.json (run \`npm run coach:loop:gate\` to check convergence)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

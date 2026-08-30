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

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../copy-verify.js';
import { ask, flushTasks, isPrepare } from '../copy-session.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PG = path.join(ROOT, 'data/postgame');

interface Coaching { headline?: string; team?: string; whatShiftedIt?: string; whatWorked?: string; perPlayer?: Record<string, string>; verdicts?: Record<string, { mood?: string; text?: string }>; moments?: Record<string, { call?: string }>; buildReads?: Record<string, { build?: string; eternal?: string }>; }
interface Facts { matchId: string; result: string; durationMin: number; vpSwing: number | null; players: any[]; lanes: any[]; comp: any; objectives: any; timeline?: any; skirmishes?: any[]; coaching?: Coaching | null; }

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
    `RESULT: ${f.result} in ${f.durationMin}m${f.vpSwing != null ? `, VP ${f.vpSwing >= 0 ? '+' : ''}${f.vpSwing}` : ''}.`,
    `DECISIVE FIGHTS: ${tagged.length ? tagged.map((s) => `${s.startMin}m ${s.kind} ${s.result} ${s.ourKills}-${s.theirKills} @ ${s.place} [${s.tag}]`).join('; ') : 'none tagged'}.`,
    `ALL SKIRMISHES (n=${sk.length}): ${sk.map((s) => `${s.startMin}m ${s.result} ${s.ourKills}-${s.theirKills} @ ${s.place} (${(s.ourHeroes ?? []).join('/')} v ${(s.theirHeroes ?? []).join('/')})`).join(', ') || 'none'}.`,
    `MACRO READS (rotations/numbers/trades — THEORY): ${withMacro.length ? withMacro.map((s) => `${s.startMin}m (${s.macro.ourAlive}v${s.macro.theirAlive}): ${s.macro.notes.join(' ')}`).join(' | ') : 'none'}.`,
    `OBJECTIVES: majors you ${f.objectives?.ourKills}-${f.objectives?.theirKills} them${f.timeline ? `, towers ${f.timeline.towers.us}-${f.timeline.towers.them}` : ''}${(f.objectives as any)?.ourObjDamage != null ? `, objective damage us ${(f.objectives as any).ourObjDamage} vs them ${(f.objectives as any).theirObjDamage}` : ''}.`,
    // Named-prize timeline (round-12 lesson: Genesis Core@29m WAS in the facts;
    // a SOURCE without the majors stream makes the critic flag true lines).
    `MAJOR TIMELINE: ${((f.timeline as any)?.majors ?? []).filter((m: any) => m.type !== 'RIVER').map((m: any) => `${m.type}@${m.minute}m ${m.side}`).join(', ') || 'none'}.`,
    `LANES: ${f.lanes.map((l) => `${l.role} ${l.ourHero} vs ${l.theirHero} (${l.edge}${l.predggMatchup ? `, ${l.predggMatchup.winrate}%` : ''}${(l as any).summary ? `, lane read: ${(l as any).summary}` : ''})`).join('; ')}.`,
    `COMP: you ${f.comp?.ourDamage?.physical}P/${f.comp?.ourDamage?.magical}M, them ${f.comp?.theirDamage?.physical}P/${f.comp?.theirDamage?.magical}M; their healers ${f.comp?.theirHealers?.join(', ') || 'none'}.`,
    `OUR PLAYERS: ${us.map((p) => `${p.squadName || p.name} ${p.heroName} ${p.role} ${p.kills}/${p.deaths}/${p.assists}, ${(p as any).damageToHeroes ?? '?'} hero dmg, ${(p as any).damageToObjectives ?? '?'} obj dmg, ${(p as any).healingDone ?? '?'} healing, ${(p as any).mitigated ?? '?'} mitigated, ${(p as any).damageTaken ?? '?'} damage taken, ${(p as any).wardsPlaced ?? '?'} wards placed + ${(p as any).wardsDestroyed ?? 0} cleared, items [${((p as any).items ?? []).map((i: any) => i.name ?? i).join(', ')}]${((p as any).itemTimeline ?? []).length ? `, est online [${(p as any).itemTimeline.map((t: any) => `${t.name}~${t.estMin}m`).join(', ')}]` : ''}${((p as any).matchupItemFlags ?? []).length ? `, film flags [${(p as any).matchupItemFlags.join('; ')}]` : ''}${((p as any).missingCore ?? []).length ? `, missing meta core [${(p as any).missingCore.join(', ')}]` : ''}${(p as any).winningCore ? `, winning core [${(p as any).winningCore.items.join(', ')}] at ${(p as any).winningCore.wr}%` : ''}${(p.spikes ?? []).length ? ` (spikes ${p.spikes.map((s: any) => `${s.name}~${s.spikeMinute}m`).join(', ')})` : ''}${p.roleFit?.concern ? ` [off bottom-two lane]` : ''}`).join('; ')}.`,
    // Enemy rows too (round-13 lesson: enemy healing/damage figures cited from
    // the film — e.g. their Narbash's 70,180 healing — were flagged as invented
    // because the SOURCE only printed our side).
    `THEIR PLAYERS: ${f.players.filter((p) => !p.us).map((p) => `${p.heroName} ${p.role} ${p.kills}/${p.deaths}/${p.assists}, ${(p as any).damageToHeroes ?? '?'} hero dmg, ${(p as any).healingDone ?? '?'} healing, ${(p as any).mitigated ?? '?'} mitigated, ${(p as any).damageTaken ?? '?'} damage taken, ${(p as any).wardsPlaced ?? '?'} wards placed, items [${((p as any).items ?? []).map((i: any) => i.name ?? i).join(', ')}]`).join('; ')}.`,
    ...interrogationLines(f),
    ...fightEconLines(f),
  ].join('\n');
}


/** The interrogation pass (postgame:interrogate): citable causation facts —
 *  team ward sums, river/seedling control, and who was dead (or that NOBODY
 *  was) going into each enemy major. */
function interrogationLines(f: Facts & { interrogation?: any }): string[] {
  const ig = (f as any).interrogation;
  if (!ig) return [];
  const out: string[] = [];
  if (ig.vision) out.push(`VISION WAR: wards placed us ${ig.vision.usWards} vs them ${ig.vision.themWards}; destroyed us ${ig.vision.usDestroyed} vs them ${ig.vision.themDestroyed}.`);
  if (ig.riverControl) out.push(`RIVER/SEEDLING CONTROL: river buffs us ${ig.riverControl.riverUs} vs them ${ig.riverControl.riverThem}; seedlings us ${ig.riverControl.seedlingUs} vs them ${ig.riverControl.seedlingThem}.`);
  if ((ig.concededMajors ?? []).length) out.push(`CONCEDED MAJORS (their non-river takes, who on our side was dead in the prior 60s): ${ig.concededMajors.map((m: any) => `${m.type}@${m.minute}m ${m.uncontested ? 'NOBODY DEAD (uncontested — five alive)' : m.deadBefore.join(' + ') + ' dead'}`).join('; ')}.`);
  return out;
}

/** Fight-economics facts (postgame:fights pass): first deaths, caught-out picks,
 *  cash-in rate, death costs, item gaps. The coach should cite THESE for "who
 *  died first / what it cost" claims instead of eyeballing the kill stream. */
function fightEconLines(f: Facts & { fights?: any; kills?: any[] }): string[] {
  const out: string[] = [];
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
    if (fx.caughtOut) out.push(`CAUGHT OUT (deaths outside any fight): us ${fx.caughtOut.us.length}${fx.caughtOut.us.length ? ` (${fx.caughtOut.us.map((c: any) => `${c.hero} ${c.min}m by ${c.by}`).join(', ')})` : ''}, them ${fx.caughtOut.themCount}.`);
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

const lineList = (co: Coaching): string[] => [co.headline, co.team, co.whatShiftedIt, co.whatWorked, ...Object.values(co.perPlayer ?? {}), ...Object.values(co.verdicts ?? {}).map((v) => v?.text), ...Object.values(co.moments ?? {}).map((m) => m?.call), ...Object.values(co.buildReads ?? {}).flatMap((b) => [b?.build, b?.eternal])].filter((s): s is string => !!s);

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
const stripNum = (s: string) => s.replace(/^\s*\d+\.\s*/, '');

async function main() {
  const files = readdirSync(PG).filter((f) => f.endsWith('.json') && f !== 'index.json');
  // COACH_GAMES=<id,id,...> scopes the loop to specific matches (prefix match),
  // so a re-author of a few games doesn't re-judge the whole film library.
  const scope = (process.env.COACH_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const inScope = (fn: string, id: string) => !scope.length || scope.some((s) => fn.startsWith(s) || id.startsWith(s));
  const games = files.map((fn) => ({ fn, f: JSON.parse(readFileSync(path.join(PG, fn), 'utf8')) as Facts })).filter((g) => g.f.coaching && inScope(g.fn, g.f.matchId ?? ''));

  const report: Record<string, { quote: string; severity: string; issue: string; rewrite: string | null }[]> = {};
  let reviewed = 0, flagged = 0, grounded = 0, dropped = 0, applied = 0, unmatched = 0;

  for (const { fn, f } of games) {
    const lines = lineList(f.coaching!);
    if (!lines.length) continue;
    const id = f.matchId || fn.replace('.json', '');
    const prompt = `You are an INDEPENDENT reviewer of post-game COACHING for a Predecessor (MOBA) squad match. Another agent wrote the COPY; you did NOT. The coach's job is to critique the GAME and the DRAFT — the fights, the objectives, the picks — NOT a player's personal hero/role preference. Judge the copy against the SOURCE (match facts) ONLY.

SOURCE (match facts):
${sourceOf(f)}

COACHING UNDER REVIEW (one per line):
${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Flag ONLY real problems:
(a) PREFERENCE — a line telling someone to play their main / comfort hero / best role, or judging a PICK by that player's own winrate/comfort rather than the matchup, draft, or what the game needed. The squad plays new heroes in new lanes; "play your main" is NOT coaching.
(b) UNGROUNDED — a line factually wrong vs the SOURCE, or that invents a fight/objective/number not present.
(c) WRONG REFERENCE — names the wrong hero, lane, fight, or objective.
(d) VOICE — uses second person ("you/your/you're") as if addressed to one reader, or uses the map side names dawn/dusk as the team's voice (rewrite to we/they). The review is read by the WHOLE squad: team lines must speak as "we/our/the team"; per-player lines must name the player (squad name or hero) in third person. Rewrite keeping the exact same facts and numbers, changing only the voice.
(e) METHOD — blames an ally's play instead of the decision made around them; judges a role by the wrong yardstick (a support on KDA/farm, a carry on wards, an offlaner on lane kills instead of survival); or makes an execution claim the SOURCE cannot show ("missed the combo") where it only proves a decision error (numbers, items-down, timing).
(f) CAUSATION — a game-deciding claim with no why attached when the SOURCE carries one (a lost stretch without its cause; an enemy objective without who was dead or that NOBODY was); a bare timestamp with no event named ("absent at 20.5" when the SOURCE says what the 20.5 fight was); or a "why" the SOURCE cannot support (a guessed teleport, wave state, or position).
(g) READABILITY — SCOPED to exactly these patterns (never general style): ledger jargon other than "cashed" ("priced/pricing", "receipt", "banked", "ledger", "cost column"); three or more timestamps in one sentence; a scoreline used as a noun ("the 0-2 at 14.6" — should be "the fight at 14.6, lost 0-2"); a bare unitless number like "(13464)"; internal-artifact voice ("the file says", "the sheet"); more than one coined maxim or more than one "not X, but Y" formula in the same review; pretend-depth announcers ("the line to remember is"). Rewrite preserving every fact and exact number, changing only the wording.
BLUNT IS THE HOUSE STYLE: a harsh verdict backed by two or more SOURCE facts is CORRECT — do not flag or soften it; flag a blunt line only when its receipts are not in the SOURCE.
Do NOT nitpick style beyond the voice rule. Return strict JSON: {"flags":[{"quote":"<the exact line text>","severity":"high|med|low","issue":"<what's wrong, one phrase>","rewrite":"<a game/draft/fight-focused corrected line grounded in the SOURCE, or null to drop the line>"}]}. If all fine, return {"flags":[]}.`;

    const raw = (await ask('coach-critique', id, prompt)).trim().replace(/^```json?\s*|```$/g, '');
    reviewed += lines.length;
    if (isPrepare()) continue;
    try {
      const parsed = JSON.parse(raw) as { flags?: { quote?: string; severity?: string; issue?: string; rewrite?: string | null }[] };
      const allowed = buildAllowed([], [JSON.stringify(f)]);   // numbers must exist in the facts
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
      if (applied) { f.coaching = co as Coaching; writeFileSync(path.join(PG, fn), JSON.stringify(f, null, 1)); }
      process.stdout.write('.');
    } catch { process.stdout.write('x'); }
  }

  flushTasks('coach-critique');
  if (isPrepare()) return;

  const agreement = reviewed ? (1 - flagged / reviewed) : 1;
  const agreementRate = Math.round(agreement * 1000) / 1000;
  writeFileSync(path.join(ROOT, 'data/aggregates/coach-critique.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'independent (non-author) pred-scout-coach-critic reviewing data/postgame/*.json coaching against the match facts; preference-based / ungrounded lines flagged; grounded rewrites applied back',
    reviewedLines: reviewed, flaggedLines: flagged, agreementRate, rewritesGrounded: grounded, rewritesDropped: dropped, applied, unmatched, games: report,
  }, null, 1));

  const histPath = path.join(ROOT, 'data/aggregates/coach-critique-history.json');
  const hist = readdirSync(path.dirname(histPath)).includes('coach-critique-history.json')
    ? (JSON.parse(readFileSync(histPath, 'utf8')) as { rounds: unknown[] }) : { rounds: [] };
  hist.rounds.push({ round: hist.rounds.length + 1, at: new Date().toISOString(), reviewedLines: reviewed, flaggedLines: flagged, agreementRate, applied });
  writeFileSync(histPath, JSON.stringify(hist, null, 1));

  console.log(`\n${flagged} lines flagged / ${reviewed} reviewed (agreement ${(agreement * 100).toFixed(1)}%); ${grounded} grounded rewrites; applied ${applied} to data/postgame/ (${unmatched} unmatched) -> data/aggregates/coach-critique.json`);
  console.log(`[loop] round ${hist.rounds.length} recorded -> coach-critique-history.json (run \`npm run coach:loop:gate\` to check convergence)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

// Lean coach review CLI (src/coach-lean.ts holds the rules). Runs BESIDE the standard
// coach pipeline: it reads the same postgame facts and writes only film.coachLean, so the
// standard review (film.coaching, coach-critique.ts, coach:contract) is untouched and is the
// revert path. Zero-API; the author and critic are in-session agents.
//
//   npm run coach:lean:prepare             # author tasks -> engine/copy-tasks/coach-lean.tasks.json
//     (pred-scout-coach-lean agent writes coach-lean.responses.json: { "<matchId>": "<json>" })
//   npm run coach:lean:ingest              # contract + number check, writes film.coachLean (draft)
//   npm run coach:lean:critique:prepare    # critic tasks: only lines not yet approved
//     (an INDEPENDENT critic writes coach-lean-critique.responses.json)
//   npm run coach:lean:critique            # apply; publishes a review once every line is approved
//   npm run coach:lean:status              # where every lean review stands
//
// Scope: COACH_GAMES=<id prefix,...>. Without it, prepare picks the LEAN_LIMIT (default 5)
// newest films with a standard review and no lean one; the critique steps take every draft.
// Settings: data/coaching/lean.json (maxRounds). History: data/aggregates/coach-lean-history.json.
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildAllowed } from '../copy-verify.js';
import { sourceOf } from './coach-critique.js';
import { LEAN_VERSION, applyLeanCritique, hashLine, leanLines, validateLean, type CritiqueFlag, type LeanReview } from '../coach-lean.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PG = path.join(ROOT, 'data/postgame');
const TASKS = path.join(ROOT, 'engine/copy-tasks');
const cfg = JSON.parse(readFileSync(path.join(ROOT, 'data/coaching/lean.json'), 'utf8')) as { maxRounds: number };
const cmd = process.argv[2] ?? 'status';
const scope = (process.env.COACH_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean);

type Film = any;
const load = (id: string): Film => JSON.parse(readFileSync(path.join(PG, `${id}.json`), 'utf8'));
const save = (f: Film) => writeFileSync(path.join(PG, `${f.matchId}.json`), JSON.stringify(f, null, 1));
const index = (): { matchId: string; startTime: string }[] => (JSON.parse(readFileSync(path.join(PG, 'index.json'), 'utf8')).matches ?? []).slice().sort((a: any, b: any) => b.startTime.localeCompare(a.startTime));
function scoped(pred: (f: Film) => boolean, limit = Infinity): Film[] {
  const out: Film[] = [];
  for (const m of index()) {
    if (out.length >= limit) break;
    if (scope.length && !scope.some((s) => m.matchId.startsWith(s))) continue;
    if (!existsSync(path.join(PG, `${m.matchId}.json`))) continue;
    const f = load(m.matchId);
    if (pred(f)) out.push(f);
  }
  return out;
}
const writeTasks = (pass: string, tasks: unknown[]) => { mkdirSync(TASKS, { recursive: true }); writeFileSync(path.join(TASKS, `${pass}.tasks.json`), JSON.stringify({ pass, generatedAt: new Date().toISOString(), count: tasks.length, tasks }, null, 1)); };
function readResponses(pass: string): Record<string, unknown> {
  const t = path.join(TASKS, `${pass}.tasks.json`), r = path.join(TASKS, `${pass}.responses.json`);
  if (!existsSync(r)) throw new Error(`no ${pass}.responses.json; run the prepare step and the agent first`);
  if (statSync(r).mtimeMs < statSync(t).mtimeMs) throw new Error(`${pass}.responses.json is older than its tasks; answer the current tasks`);
  return JSON.parse(readFileSync(r, 'utf8'));
}
const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v.trim().replace(/^```json?\s*|```$/g, '')) : v);
const allowedFor = (f: Film) => { const { coaching: _c, coachLean: _l, ...facts } = f; return buildAllowed([], [JSON.stringify(facts)]); };
const pendingHash = (r: LeanReview) => { const ok = new Set(r.review.approved); return createHash('sha256').update(JSON.stringify(leanLines(r).filter((l) => !ok.has(hashLine(l.text))))).digest('hex').slice(0, 16); };
const roster = (f: Film) => f.players.filter((p: any) => p.us).map((p: any) => `${p.pid} = ${p.squadName || p.name} on ${p.heroName} (${p.role})`).join('; ');

function prepare() {
  const films = scoped((f) => !!f.coaching && !!f.interrogation && (scope.length > 0 || !f.coachLean), scope.length ? Infinity : Number(process.env.LEAN_LIMIT ?? 5));
  const tasks = films.map((f) => {
    const items = f.players.filter((p: any) => p.us).flatMap((p: any) => (p.items ?? []).map((i: any) => i.name ?? i));
    return { id: f.matchId, prompt: `Write the lean post-game review for this match. Follow .claude/agents/pred-scout-coach-lean.md exactly; it is the whole spec.

OUR PLAYER IDS: ${roster(f)}.
GAME FLAG IDS you may cite as ref: ${(f.interrogation?.gameFlags ?? []).map((g: any) => g.id).join(', ') || 'none (use "other")'}.

SOURCE (match facts; every number you write must appear here):
${sourceOf(f, { lean: true, texts: items })}

Return strict JSON only: {"headline":"","flags":[{"ref":"","text":""}],"focus":{"action":""},"playerBullets":{"<pid>":["",""]},"buildCall":{"<pid>":""}}` };
  });
  writeTasks('coach-lean', tasks);
  console.log(`${tasks.length} lean author task(s) -> engine/copy-tasks/coach-lean.tasks.json: ${films.map((f) => f.matchId.slice(0, 8)).join(', ')}`);
}

function ingest() {
  const res = readResponses('coach-lean');
  const tasks = JSON.parse(readFileSync(path.join(TASKS, 'coach-lean.tasks.json'), 'utf8')).tasks as { id: string }[];
  let ok = 0; const bad: string[] = [];
  for (const t of tasks) {
    if (!(t.id in res)) { bad.push(`${t.id.slice(0, 8)}: no response`); continue; }
    const f = load(t.id);
    const j = parse(res[t.id]) as any;
    const r: LeanReview = { version: LEAN_VERSION, authoredAt: new Date().toISOString(), headline: j.headline, flags: j.flags ?? [], focus: { action: j.focus?.action ?? '' }, playerBullets: j.playerBullets ?? {}, buildCall: j.buildCall ?? {}, review: { status: 'draft', round: 0, approved: [], dropped: [], rounds: [] } };
    const allowed = allowedFor(f);
    const problems = [...validateLean(f, r), ...leanLines(r).filter((l) => !/^\D*$/.test(l.text) && !allowedNumbers(l.text, allowed)).map((l) => `${l.key} cites a number not in the facts: "${l.text}"`)];
    if (problems.length) { bad.push(`${t.id.slice(0, 8)}: ${problems.join(' | ')}`); continue; }
    f.coachLean = r; save(f); ok++;
  }
  console.log(`lean reviews ingested: ${ok}/${tasks.length}`);
  if (bad.length) { console.error(bad.join('\n')); process.exitCode = 1; }
}
import { verifyLine } from '../copy-verify.js';
const allowedNumbers = (text: string, allowed: Set<string>) => verifyLine(text, allowed);

const RUBRIC = `You are an INDEPENDENT critic of a Predecessor squad's post-game review. Another agent wrote it; you did not. Judge each line under LINES TO JUDGE against the SOURCE only. Lines under APPROVED are context; never flag them.
Flag a line only when it breaks one of these:
1 GROUNDED: a number, hero, lane, fight, objective, item effect or ability not in the SOURCE, or the wrong one.
2 EVIDENCE LIMITS: simulated lanes are not lane results; missing kill credit is not absence; alive counts are not local numbers; time order is not cause; totals and kill clusters do not prove positioning, missed abilities, intent or being caught alone; ward counts do not show ward vs sentry (only testimony does; never tell someone to switch to the tool they ran); a practice target is never a detected miss; no promise that another plan wins.
3 ROLE YARDSTICK: supports on participation, wards, healing and mitigation and deaths (never their 1v1 lane row or kills); carries on deaths and damage; never "play your main" or judging a pick by comfort.
4 USEFUL: each player's bullets give a concrete next-game action fit for their role; the lesson answers the flags together; no generic do-better lines, no repeats of the scoreboard or of another line; buildCall must follow the BUILD NOTES and item mechanics (what to add or swap and when, or that the build was right), never a deferral to another page.
5 VOICE: team lines say we/they, never you; no ledger jargon (priced, receipt, banked, ledger), no scoreline used as a noun, no bare unitless numbers, no hedges (arguably, likely, might have, could have), no stock phrases; blunt is house style and is correct when two SOURCE facts back it.
Return strict JSON: {"flags":[{"key":"<the line's key>","issue":"<one phrase>","rewrite":"<corrected line within the same word limit, grounded in the SOURCE, or null to drop it>"}]}; {"flags":[]} when all pass. Limits: headline 25 words, flags 18, focus 35, bullet 30, build 25; no exact times, no em dashes, never the player's own name or hero in their bullet or build line.`;

function critiquePrepare() {
  const films = scoped((f) => f.coachLean?.review?.status === 'draft');
  const tasks = films.map((f) => {
    const r = f.coachLean as LeanReview;
    const ok = new Set(r.review.approved);
    const lines = leanLines(r);
    const judge = lines.filter((l) => !ok.has(hashLine(l.text)));
    return { id: f.matchId, round: r.review.round + 1, pendingHash: pendingHash(r), prompt: `${RUBRIC}

SOURCE (match facts):
${sourceOf(f, { lean: true, texts: lines.map((l) => l.text) })}
OUR PLAYER IDS: ${roster(f)}.
GAME FLAGS cited: ${r.flags.map((fl) => fl.ref).join(', ')}.

APPROVED (context only):
${lines.filter((l) => ok.has(hashLine(l.text))).map((l) => `[${l.key}] ${l.text}`).join('\n') || '(none yet)'}

LINES TO JUDGE (round ${r.review.round + 1} of ${cfg.maxRounds}${r.review.round + 1 >= cfg.maxRounds ? '; last round: a flagged line is dropped, so flag only real problems' : ''}):
${judge.map((l) => `[${l.key}] ${l.text}`).join('\n')}` };
  });
  writeTasks('coach-lean-critique', tasks);
  const n = tasks.reduce((a, t) => a + (t.prompt.split('LINES TO JUDGE')[1]!.match(/^\[/gm)?.length ?? 0), 0);
  console.log(`${tasks.length} critique task(s), ${n} line(s) to judge -> engine/copy-tasks/coach-lean-critique.tasks.json`);
}

function critique() {
  const res = readResponses('coach-lean-critique');
  const tasks = JSON.parse(readFileSync(path.join(TASKS, 'coach-lean-critique.tasks.json'), 'utf8')).tasks as { id: string; pendingHash: string }[];
  const histPath = path.join(ROOT, 'data/aggregates/coach-lean-history.json');
  const hist = existsSync(histPath) ? JSON.parse(readFileSync(histPath, 'utf8')) : { rounds: [] as unknown[] };
  for (const t of tasks) {
    if (!(t.id in res)) { console.error(`${t.id.slice(0, 8)}: no critic response; skipped`); continue; }
    const f = load(t.id);
    const r = f.coachLean as LeanReview;
    if (r.review.status !== 'draft' || pendingHash(r) !== t.pendingHash) throw new Error(`${t.id.slice(0, 8)}: the review changed since the critique was prepared; prepare again`);
    const flags = ((parse(res[t.id]) as any).flags ?? []) as CritiqueFlag[];
    const rec = applyLeanCritique(f, r, flags, allowedFor(f), cfg.maxRounds);
    save(f);
    hist.rounds.push({ matchId: f.matchId, ...rec, status: r.review.status });
    console.log(`${t.id.slice(0, 8)} round ${rec.round}: judged ${rec.judged}, flagged ${rec.flagged}, rewritten ${rec.rewritten}, dropped ${rec.dropped} -> ${r.review.status}${r.review.blockedReason ? ` (${r.review.blockedReason})` : ''}`);
  }
  writeFileSync(histPath, JSON.stringify(hist, null, 1));
}

function status() {
  for (const f of scoped((x) => !!x.coachLean)) {
    const r = f.coachLean as LeanReview;
    const words = leanLines(r).reduce((a, l) => a + l.text.split(/\s+/).length, 0);
    console.log(`${f.matchId.slice(0, 8)} ${r.review.status} round ${r.review.round} · ${leanLines(r).length} lines, ${words} words · dropped ${r.review.dropped.length}${r.review.blockedReason ? ` · ${r.review.blockedReason}` : ''}`);
  }
}

const run = ({ prepare, ingest, 'critique-prepare': critiquePrepare, critique, status } as Record<string, () => void>)[cmd];
if (!run) throw new Error(`unknown command ${cmd}`);
run();

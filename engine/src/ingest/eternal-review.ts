// "Why it's picked" copy for every Eternal and each of its minors — the plain
// line the Eternal popup and Learn Eternals show in accent text ("Aion: mana
// back for landing spells, plus gold for the damage you deal"). Same loop as
// every copy pass (docs/agent-loops.md):
//
//   PLAN    the facts block is built by code (eternalFacts: catalog text, the
//           mechanics parsed from it, who runs it from the ranked counts)
//   AUTHOR  COPY_MODE=prepare npm run review:eternals
//           -> pred-scout-coach fills engine/copy-tasks/eternals.responses.json
//           -> npm run review:eternals   (ground-check + write)
//   JUDGE   COPY_MODE=prepare npm run eternals:critique
//           -> an INDEPENDENT agent (not pred-scout-coach) fills
//              engine/copy-tasks/eternal-critique.responses.json
//           -> npm run eternals:critique (re-verify rewrites, apply, record round)
//   GATE    npm run eternals:loop:gate
//
// Every line may cite only numbers in its facts block (copy-verify), and minor
// lines are kept only under a minor that exists on that Eternal. Applied judge
// rewrites live in eternal-why-fixes.json and are re-applied on every ingest.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowed, verifyLine } from '../copy-verify.js';
import { ask, flushTasks, isPrepare, writeAggregate } from '../copy-session.js';
import { eternalFacts, type Eternal, type Usage } from '../eternal-usage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'data/aggregates/eternal-why.json');
const FIXES = path.join(ROOT, 'data/aggregates/eternal-why-fixes.json');
const HISTORY = path.join(ROOT, 'data/aggregates/eternal-why-critique-history.json');
const CRITIQUE = process.env.ETERNAL_CRITIQUE === '1';
const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

const cat = read<{ eternals: (Eternal & { archetype?: string })[] }>(path.join(ROOT, 'data/game-data/eternals.json'));
const usageDoc = read<{ source: string; eternals: Record<string, Usage> }>(path.join(ROOT, 'data/aggregates/eternal-usage.json'));
const sample = 'ranked games, current patch window';

interface Copy { why: string | null; minors: Record<string, string> }
const fixes = (): Record<string, Record<string, string>> => (existsSync(FIXES) ? read<{ eternals: Record<string, Record<string, string>> }>(FIXES).eternals : {});
const unfence = (s: string) => s.trim().replace(/^```json?\s*|```$/g, '');

function authorPrompt(e: Eternal, facts: string): string {
  return `You write the plain-language "why it's picked" copy for one Eternal in Predecessor (a 5v5 MOBA). A new player taps the Eternal and reads your lines next to the full blessing text.

SOURCE (use only this; cite no number that is not in it):
${facts}

Write:
1. "why": one or two short sentences (max 45 words). Say in plain words what the Eternal gives you and what kind of player or hero takes it — shape: "<what it gives, in plain words>: <who takes it and why>". If the major or any minor gives gold, say so (gold income is a reason people pick it). Name roles or hero types from WHO RUNS IT, but do not claim it is the best pick and do not lead with a statistic.
2. "minors": for EVERY minor listed above, one line (max 20 words) saying when you would take it over the other options in its slot, in plain words. Mention when it is the common pick only if WHO RUNS IT / the [taken in] share says so.

No jargon a new player would not know (no "DPS check", "proc", "snowball" without saying what it means). No second person ranking ("you must"). Return strict JSON only: {"why":"...","minors":{"<exact minor name>":"..."}}`;
}

function judgePrompt(e: Eternal, facts: string, lines: string[]): string {
  return `You are an INDEPENDENT reviewer of Eternal copy in Predecessor (a MOBA). Another agent wrote the COPY below; you did NOT write it. Judge it against the SOURCE only.

SOURCE (everything the author was allowed to use):
${facts}

COPY UNDER REVIEW (one per line; minor lines start with the minor's name):
${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Flag ONLY real problems: a line that (a) says the Eternal or a minor gives something its text does not (or misses what the line claims to explain), (b) is factually wrong vs the SOURCE (wrong role, wrong hero type, wrong slot), (c) claims a pick is best or wins more when the SOURCE does not show it, (d) uses jargon a brand-new player won't get, or (e) is broken English. Do not nitpick style.
Return strict JSON: {"flags":[{"quote":"<the exact line text WITHOUT the minor-name prefix>","severity":"high|med|low","issue":"<one phrase>","rewrite":"<corrected line, or null to drop>"}]}. If all fine, return {"flags":[]}.`;
}

async function author() {
  const out: Record<string, Copy> = {};
  const fx = fixes();
  let written = 0, rejected = 0, judged = 0;
  for (const e of cat.eternals) {
    const u = usageDoc.eternals[e.id];
    if (!u) continue;
    const facts = eternalFacts(e, u, sample);
    const raw = unfence(await ask('eternals', e.id, authorPrompt(e, facts)));
    if (isPrepare()) continue;
    try {
      const p = JSON.parse(raw) as { why?: string; minors?: Record<string, string> };
      const allowed = buildAllowed([], [facts]);
      const fix = fx[e.id] ?? {};
      const keep = (s?: string): string | null => {
        if (!s) return null;
        if (!verifyLine(s, allowed)) { rejected++; return null; }
        written++;
        const f = fix[s];
        if (f !== undefined && (f === '' || verifyLine(f, allowed))) { judged++; return f || null; }
        return s;
      };
      const names = new Set([...(e.minorSlot1 ?? []), ...(e.minorSlot2 ?? [])].map((m) => m.name));
      const minors: Record<string, string> = {};
      for (const [name, line] of Object.entries(p.minors ?? {})) {
        if (!names.has(name)) { rejected++; continue; }
        const k = keep(line);
        if (k) minors[name] = k;
      }
      out[e.id] = { why: keep(p.why), minors };
      process.stdout.write('.');
    } catch { process.stdout.write('x'); }
  }
  flushTasks('eternals');
  if (isPrepare()) return;
  if (!writeAggregate(OUT, {
    generatedAt: new Date().toISOString(),
    source: 'in-session Claude Code agent (pred-scout-coach) over each Eternal\'s catalog text, parsed mechanics and ranked usage (eternal-usage.json) only; every number ground-checked, independent-judge rewrites re-applied from eternal-why-fixes.json',
    written, rejected, eternals: out,
  })) return;
  console.log(`\n${written} Eternal lines written, ${rejected} rejected, ${judged} judged fixes re-applied -> data/aggregates/eternal-why.json`);
}

async function critique() {
  const doc = read<{ eternals: Record<string, Copy>; [k: string]: unknown }>(OUT);
  const fx = existsSync(FIXES) ? read<{ eternals: Record<string, Record<string, string>>; [k: string]: unknown }>(FIXES) : { source: 'applied rewrites from the independent judge, keyed to the authored line; re-applied and re-verified on every ingest', eternals: {} };
  let reviewed = 0, flagged = 0, applied = 0, dropped = 0, answered = 0, total = 0;
  const report: Record<string, unknown[]> = {};
  for (const e of cat.eternals) {
    const c = doc.eternals[e.id], u = usageDoc.eternals[e.id];
    if (!c || !u) continue;
    const facts = eternalFacts(e, u, sample);
    const lines = [c.why, ...Object.entries(c.minors).map(([n, l]) => `${n}: ${l}`)].filter(Boolean) as string[];
    const raw = unfence(await ask('eternal-critique', e.id, judgePrompt(e, facts, lines)));
    reviewed += lines.length; total++;
    if (isPrepare()) continue;
    if (raw && raw !== '{}') answered++;
    try {
      const p = JSON.parse(raw) as { flags?: { quote?: string; severity?: string; issue?: string; rewrite?: string | null }[] };
      const allowed = buildAllowed([], [facts]);
      for (const fl of p.flags ?? []) {
        if (!fl.quote) continue;
        flagged++;
        let rewrite = fl.rewrite ?? null;
        if (rewrite && !verifyLine(rewrite, allowed)) { rewrite = null; dropped++; continue; }
        (report[e.id] ??= []).push({ quote: fl.quote, severity: fl.severity ?? 'low', issue: fl.issue ?? '', rewrite });
        // The fix is keyed to the line as it stands NOW; the author's raw line
        // may differ if an earlier fix already applied, so key to the original.
        const orig = Object.entries(fx.eternals[e.id] ?? {}).find(([, v]) => v === fl.quote)?.[0] ?? fl.quote;
        let hit = false;
        if (c.why === fl.quote) { c.why = rewrite; hit = true; }
        for (const n in c.minors) if (c.minors[n] === fl.quote) { if (rewrite) c.minors[n] = rewrite; else delete c.minors[n]; hit = true; }
        if (hit) { applied++; (fx.eternals[e.id] ??= {})[orig] = rewrite ?? ''; }
      }
    } catch { /* unanswered or malformed: counted by coverage */ }
  }
  flushTasks('eternal-critique');
  if (isPrepare()) return;
  writeFileSync(OUT, JSON.stringify(doc, null, 1));
  writeFileSync(FIXES, JSON.stringify({ ...fx, generatedAt: new Date().toISOString() }, null, 1));
  const agreementRate = Math.round((reviewed ? 1 - flagged / reviewed : 1) * 1000) / 1000;
  const hist = existsSync(HISTORY) ? read<{ rounds: unknown[] }>(HISTORY) : { rounds: [] };
  hist.rounds.push({ round: hist.rounds.length + 1, at: new Date().toISOString(), generation: 1, scope: ['eternals'], judged: answered, ofTasks: total, reviewedLines: reviewed, flaggedLines: flagged, agreementRate, applied, report });
  writeFileSync(HISTORY, JSON.stringify(hist, null, 1));
  console.log(`[eternals] ${flagged} flagged / ${reviewed} reviewed (agreement ${(agreementRate * 100).toFixed(1)}%), applied ${applied}, ${dropped} ungrounded rewrites dropped; judged ${answered}/${total} -> eternal-why-critique-history.json`);
}

(CRITIQUE ? critique() : author()).catch((err) => { console.error(err); process.exit(1); });

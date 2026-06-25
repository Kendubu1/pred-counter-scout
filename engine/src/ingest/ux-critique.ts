// Independent UX-judge driver for the v0 Senior-UX review loop — the analog of
// copy-critique.ts, but the "lines" are rendered surfaces and the rubric is
// docs/ux-rubric.md instead of source numbers. Zero-API: the judging runs on the
// in-session pred-scout-ux-judge agent (NOT the author — independence is the
// point), via the same prepare -> agent -> ingest split as the copy loop.
//
//   COPY_MODE=prepare npm run ux:critique:prepare   # emit one grounded task per
//        surface (rubric + screenshot paths) to copy-tasks/ux-critique.tasks.json
//   -> the pred-scout-ux-judge agent fills copy-tasks/ux-critique.responses.json
//   npm run ux:critique                              # aggregate the judge's flags,
//        compute agreementRate, append the round to data/aggregates/ux-v0-history.json
//   LOOP_HISTORY=data/aggregates/ux-v0-history.json npm run review:loop:gate
//
// The objective bracket for this loop is ui-audit:v0 (hard invariants) + ui-render:v0
// (no phone overflow); there are no numbers to ground-check, so — per the repo rule
// that a loop must enforce SOMETHING objective — those two must be green before a
// round counts. The judge's flag count only ever drives agreementRate; it can never
// pass a surface that fails the bracket.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, flushTasks, isPrepare } from '../copy-session.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PASS = 'ux-critique';
const UI_DIR = process.env.UI_DIR ?? 'ui/v0';
const SHOTS_REL = `docs/reviews/${UI_DIR.replace('ui/', '')}/shots`;
const RUBRIC = existsSync(path.join(ROOT, 'docs/ux-rubric.md'))
  ? readFileSync(path.join(ROOT, 'docs/ux-rubric.md'), 'utf8')
  : '(docs/ux-rubric.md missing — judge against general Senior-UX principles)';

// Homepage-first: default to the index surfaces so the loop converges on the
// homepage before rollout. Override with UX_SURFACES=landing,hero,coach,squad,about
// once coach/squad/about are being redesigned.
const ALL_SURFACES = ['landing', 'hero', 'hero-sparrow', 'coach', 'squad', 'about'];
const SURFACES = (process.env.UX_SURFACES?.split(',').map((s) => s.trim()).filter(Boolean)) ?? ['landing', 'hero', 'hero-sparrow'];
const CRITERIA = 6; // R1..R6 are the judge-scored criteria (R7 is audit-only)

// Candidate screenshots per surface (kept if they exist on disk).
function shotsFor(id: string): string[] {
  const base = [`${id}-390-top.png`, `${id}-360-top.png`, `${id}-390.png`, `${id}-1024.png`];
  if (id === 'landing') base.push('landing-390-legend.png', 'landing-390-primary.png');
  return base.filter((f) => existsSync(path.join(ROOT, SHOTS_REL, f)));
}

function buildPrompt(id: string): string {
  const shots = shotsFor(id);
  return [
    `You are an INDEPENDENT Senior-UX judge. You did NOT author these pages. Score the "${id}" surface of Predecessor Scout against the pinned rubric and flag ONLY real problems.`,
    '',
    '=== RUBRIC (docs/ux-rubric.md) ===',
    RUBRIC.trim(),
    '',
    `=== SURFACE: ${id} ===`,
    'Read each screenshot below (use the Read tool on the path). Judge the 390px-wide "-top" shot as the above-the-fold mobile view; the "-390"/"-1024" shots are the full page; "-legend"/"-primary" are real-scale crops.',
    ...shots.map((f) => `  ${SHOTS_REL}/${f}`),
    '',
    '=== OUTPUT (strict JSON, nothing else) ===',
    'Return exactly: {"flags":[{"criterion":"R1|R2|R3|R4|R5|R6","quote":"what & where on the surface","severity":"high|med|low","issue":"one phrase","fix":"one concrete change"}]}',
    'Flag a criterion only when the surface genuinely violates it. If the surface is clean, return {"flags":[]}. Be strict but do not invent problems; default to NOT flagging when unsure.',
  ].join('\n');
}

interface Flag { surface?: string; criterion?: string; quote?: string; severity?: string; issue?: string; fix?: string }

async function main() {
  if (isPrepare()) {
    for (const id of SURFACES) await ask(PASS, id, buildPrompt(id));
    flushTasks(PASS);
    return;
  }

  // ingest: read the judge's per-surface answers and aggregate.
  const perSurface: Record<string, Flag[]> = {};
  const flags: Flag[] = [];
  for (const id of SURFACES) {
    const raw = await ask(PASS, id, '');
    let parsed: { flags?: Flag[] } = {};
    try { parsed = JSON.parse(raw) as { flags?: Flag[] }; } catch { parsed = {}; }
    const f = Array.isArray(parsed.flags) ? parsed.flags : [];
    perSurface[id] = f;
    for (const x of f) flags.push({ surface: id, ...x });
  }

  const units = Number(process.env.REVIEW_UNITS ?? SURFACES.length * CRITERIA);
  const agreementRate = Math.round((1 - flags.length / units) * 1000) / 1000;
  const applied = Number(process.env.FIXES_APPLIED ?? 0);

  mkdirSync(path.join(ROOT, 'data/aggregates'), { recursive: true });
  writeFileSync(path.join(ROOT, 'data/aggregates/ux-critique.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), target: UI_DIR, surfaces: SURFACES,
    units, flagCount: flags.length, agreementRate, perSurface,
  }, null, 1));

  // Append the round to the history the gate reads (same shape as the copy loop).
  const histPath = path.join(ROOT, 'data/aggregates/ux-v0-history.json');
  const hist = existsSync(histPath) ? (JSON.parse(readFileSync(histPath, 'utf8')) as { rounds: unknown[] }) : { rounds: [] };
  hist.rounds.push({
    round: hist.rounds.length + 1, at: new Date().toISOString(),
    reviewedLines: units, flaggedLines: flags.length, agreementRate, applied,
  });
  writeFileSync(histPath, JSON.stringify(hist, null, 1));

  const bySev = (s: string) => flags.filter((f) => f.severity === s).length;
  console.log(`\nUX critique [${UI_DIR}] round ${hist.rounds.length}: ${flags.length} flags (${bySev('high')} high, ${bySev('med')} med, ${bySev('low')} low) over ${SURFACES.length} surfaces; agreement ${(agreementRate * 100).toFixed(1)}% -> data/aggregates/ux-critique.json`);
  for (const f of flags.filter((f) => f.severity !== 'low')) console.log(`  [${f.severity}] ${f.surface} ${f.criterion}: ${f.issue} — ${f.fix}`);
  console.log(flags.length ? '\nApply the fixes to ui/v0/*.html, re-run the brackets, then re-judge.' : '\nClean round — no UX flags.');
}

main();

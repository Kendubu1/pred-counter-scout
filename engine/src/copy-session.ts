// Copy & analysis passes run on the IN-SESSION Claude Code agent
// (.claude/agents/pred-scout-coach.md), not the Anthropic API. This project no
// longer uses ANTHROPIC_API_KEY for any copy/analysis — only the existing
// session compute. (pred.gg/omeda snapshots still use their own PREDGG_* creds;
// that is unrelated.)
//
// Flow (per pass: "augments" | "items" | "abilities"):
//   1) COPY_MODE=prepare …  → each review script records its grounded prompts as
//      tasks in engine/copy-tasks/<pass>.tasks.json. No network, no key.
//   2) The pred-scout-coach agent reads <pass>.tasks.json and writes
//      <pass>.responses.json ({ "<id>": "<strict-JSON answer text>" }), using
//      session compute and full game knowledge (kit, items, eternals, augments).
//   3) default (ingest)  →  each review script reads the responses, runs the
//      SAME numeric ground-check (copy-verify), drops any line citing a number
//      absent from the source cell, and writes data/aggregates/*.json.
//
// The honesty bar is identical to the old API path: the verifier is unchanged,
// so session-authored copy can only cite numbers that exist in its source.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COPY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'copy-tasks');

export type CopyMode = 'prepare' | 'ingest';
export const COPY_MODE: CopyMode = process.env.COPY_MODE === 'prepare' ? 'prepare' : 'ingest';
export const isPrepare = (): boolean => COPY_MODE === 'prepare';

const pending: Record<string, { id: string; prompt: string }[]> = {};
const responsesCache: Record<string, Record<string, unknown>> = {};

const tasksPath = (pass: string) => path.join(COPY_DIR, `${pass}.tasks.json`);
const responsesPath = (pass: string) => path.join(COPY_DIR, `${pass}.responses.json`);

function loadResponses(pass: string): Record<string, unknown> {
  if (!responsesCache[pass]) {
    const p = responsesPath(pass);
    if (!existsSync(p)) {
      console.error(`\n[copy] no responses for "${pass}". Run \`COPY_MODE=prepare\` first, have the pred-scout-coach agent fill copy-tasks/${pass}.responses.json, then rerun.`);
      responsesCache[pass] = {};
    } else {
      responsesCache[pass] = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
    }
  }
  return responsesCache[pass]!;
}

/**
 * Drop-in replacement for the old Anthropic API `ask()`.
 *  - prepare mode: record the grounded prompt as a task, return '{}' so the
 *    caller's parse/verify becomes a harmless no-op.
 *  - ingest mode: return the in-session agent's stored answer for this id
 *    (or '{}' if the agent hasn't answered it yet — that cell is simply skipped).
 */
export async function ask(pass: string, id: string, prompt: string): Promise<string> {
  if (COPY_MODE === 'prepare') { (pending[pass] ??= []).push({ id, prompt }); return '{}'; }
  const r = loadResponses(pass);
  if (!(id in r)) return '{}';
  const v = r[id];
  // The agent may write each answer as a JSON string OR an inline JSON object;
  // normalize to a string so the caller's existing parse path is unchanged.
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/**
 * Write a copy pass's aggregate, refusing to replace committed copy with an
 * EMPTY result. `copy:ingest` runs every pass in a chain; a pass whose
 * responses file is missing gets `{}` from ask() for every cell and used to
 * write a zero-line aggregate over the good one. That is how
 * data/aggregates/item-reviews.json silently went from 182 lines to 0 on
 * 2026-08-07 and stayed blank on the hero page.
 *
 * Zero written lines + an existing non-empty file = a skipped pass, not a
 * result. Keep the file, say so loudly, and exit non-zero so a chained refresh
 * cannot report success. COPY_FORCE=1 allows a deliberate wipe.
 */
export function writeAggregate(file: string, doc: { written: number; [k: string]: unknown }): boolean {
  const prev = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { written?: number }) : null;
  if (doc.written === 0 && (prev?.written ?? 0) > 0 && process.env.COPY_FORCE !== '1') {
    console.error(`\n[copy] REFUSING to overwrite ${path.basename(file)}: this run produced 0 lines but the committed file has ${prev!.written}. The pass's responses are missing — author them first (COPY_MODE=prepare, then the pred-scout-coach agent), or set COPY_FORCE=1 to wipe deliberately.`);
    process.exitCode = 1;
    return false;
  }
  writeFileSync(file, JSON.stringify(doc, null, 1));
  return true;
}

/** In prepare mode, flush the recorded prompts to engine/copy-tasks/<pass>.tasks.json. */
export function flushTasks(pass: string): void {
  if (COPY_MODE !== 'prepare') return;
  mkdirSync(COPY_DIR, { recursive: true });
  const tasks = pending[pass] ?? [];
  writeFileSync(tasksPath(pass), JSON.stringify({
    pass,
    generatedAt: new Date().toISOString(),
    agent: 'pred-scout-coach',
    contract: `Answer each task.prompt EXACTLY as it specifies (strict JSON only). Use ONLY numbers that appear in that prompt's data block. Write { "<task.id>": "<your strict-JSON answer string>" } to ${pass}.responses.json.`,
    count: tasks.length,
    tasks,
  }, null, 2));
  console.log(`[copy] prepared ${tasks.length} "${pass}" tasks -> engine/copy-tasks/${pass}.tasks.json`);
}

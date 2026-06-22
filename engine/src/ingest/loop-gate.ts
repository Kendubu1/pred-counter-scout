// Convergence / stop gate for the self-correcting copy loop.
//
// The copy loop is author -> judge -> apply, repeated:
//   1) COPY_MODE=prepare npm run review:critique   (emit critique tasks)
//   2) the INDEPENDENT critic subagent fills critique.responses.json
//   3) npm run review:critique                      (apply grounded rewrites,
//      record the round's agreementRate in copy-critique-history.json)
//   4) npm run review:loop:gate                     (THIS) -> CONTINUE or STOP
//
// The gate reads the round history and decides whether another round is worth
// running. It is deliberately deterministic (no model) so the loop has a
// terminal state the orchestrator can trust. It STOPs on any of:
//   - target met       agreementRate >= TARGET (default 0.99)
//   - clean round       flaggedLines == 0 (judge found nothing)
//   - no-op round       applied == 0 (judge flagged, but nothing new to fix)
//   - plateau           gain over the previous round < EPSILON (default 0.002)
//   - max rounds        round >= MAX_ROUNDS (default 5)
// Otherwise it says CONTINUE. Exit code: 0 = STOP (done), 10 = CONTINUE.
//
// Thresholds are overridable via env so the same gate drives other loops:
//   LOOP_TARGET, LOOP_EPSILON, LOOP_MAX_ROUNDS, LOOP_HISTORY (path).

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const TARGET = Number(process.env.LOOP_TARGET ?? 0.99);
const EPSILON = Number(process.env.LOOP_EPSILON ?? 0.002);
const MAX_ROUNDS = Number(process.env.LOOP_MAX_ROUNDS ?? 5);
const HISTORY = process.env.LOOP_HISTORY
  ? path.resolve(ROOT, process.env.LOOP_HISTORY)
  : path.join(ROOT, 'data/aggregates/copy-critique-history.json');

interface Round { round: number; at: string; reviewedLines: number; flaggedLines: number; agreementRate: number; applied: number }

function main() {
  if (!existsSync(HISTORY)) {
    console.log(`[loop:gate] CONTINUE — no history yet at ${path.relative(ROOT, HISTORY)}; run a first round.`);
    process.exit(10);
  }
  const rounds = (JSON.parse(readFileSync(HISTORY, 'utf8')) as { rounds: Round[] }).rounds ?? [];
  if (!rounds.length) {
    console.log('[loop:gate] CONTINUE — history is empty; run a first round.');
    process.exit(10);
  }
  const last = rounds[rounds.length - 1]!;
  const prev = rounds.length > 1 ? rounds[rounds.length - 2]! : undefined;
  const gain = prev ? last.agreementRate - prev.agreementRate : Infinity;

  const traj = rounds.map((r) => `${(r.agreementRate * 100).toFixed(1)}%`).join(' -> ');
  console.log(`[loop:gate] rounds: ${traj}`);
  console.log(`[loop:gate] last round ${last.round}: agreement ${(last.agreementRate * 100).toFixed(1)}%, ${last.flaggedLines} flagged, ${last.applied} applied` + (prev ? ` (gain ${(gain * 100).toFixed(2)} pts)` : ''));

  const stop = (reason: string) => { console.log(`[loop:gate] STOP — ${reason}.`); process.exit(0); };
  const cont = (reason: string) => { console.log(`[loop:gate] CONTINUE — ${reason}.`); process.exit(10); };

  if (last.agreementRate >= TARGET) stop(`target met (>= ${(TARGET * 100).toFixed(0)}%)`);
  if (last.flaggedLines === 0) stop('clean round (judge flagged nothing)');
  if (last.applied === 0) stop('no-op round (nothing new could be applied)');
  if (rounds.length >= MAX_ROUNDS) stop(`max rounds reached (${MAX_ROUNDS})`);
  if (prev && gain < EPSILON) stop(`plateau (gain ${(gain * 100).toFixed(2)} pts < ${(EPSILON * 100).toFixed(2)} pt threshold)`);
  cont(`below ${(TARGET * 100).toFixed(0)}% and still improving — run another round`);
}

main();

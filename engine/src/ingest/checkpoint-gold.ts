// Re-derive the checkpoint GOLD in engine/fixtures/calibration.json from the
// latest aggregate snapshot (data/aggregates/<date>.json, npm run aggregate).
//
//   npm run checkpoints
//
// The fixture's gold column is MEASURED (per-role median item gold at each
// checkpoint minute), and test/aggregates.test.ts holds it within 15 gold of
// the snapshot it came from. Every refresh writes a new snapshot whose medians
// move by a few gold, so without this step the daily refresh went red on the
// first day the curve drifted past the bound (2026-10-18: midlane@15 6062 vs
// 6081). Levels are untouched: they stay PROVISIONAL (no level timeline in
// either feed). Pure local join — no API calls.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = path.join(ROOT, 'engine/fixtures/calibration.json');
const AGG_DIR = path.join(ROOT, 'data/aggregates');

type Snapshot = { meta: { matches: number; modes?: string[] }; goldByMinute: Record<string, Record<string, { p50: number }>> };

function main() {
  const latest = readdirSync(AGG_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().pop();
  if (!latest) { console.error('no aggregate snapshot in data/aggregates/ (run npm run aggregate)'); process.exit(1); }
  const agg = JSON.parse(readFileSync(path.join(AGG_DIR, latest), 'utf8')) as Snapshot;
  const meta = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/META.json'), 'utf8')) as { patch?: string };
  const cal = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const cp = cal.checkpoints;

  let changed = 0;
  for (const row of cp.table as { minute: number; gold: Record<string, number> }[]) {
    for (const role of Object.keys(row.gold)) {
      const measured = agg.goldByMinute[role]?.[String(row.minute)]?.p50;
      if (measured == null) continue; // keep the last measured value; the gate skips this cell too
      if (row.gold[role] !== measured) { console.log(`  ${role}@${row.minute}: ${row.gold[role]} -> ${measured}`); row.gold[role] = measured; changed++; }
    }
  }

  const modes = (agg.meta.modes ?? ['pvp', 'ranked']).join('+');
  const src = `data/aggregates/${latest}`;
  cp.goldSource = `${src} (npm run aggregate, pred.gg, ${modes}, patch ${meta.patch ?? '?'})`;
  cp.goldEconomyPatch = meta.patch ?? cp.goldEconomyPatch;
  // The note names the snapshot it was derived from; keep that clause current.
  cp._note = String(cp._note).replace(/data\/aggregates\/\d{4}-\d{2}-\d{2}\.json \([^)]*\)/, `${src} (pred.gg, patch ${meta.patch ?? '?'}, ${modes}, ${agg.meta.matches} matches)`);

  writeFileSync(FIXTURE, JSON.stringify(cal, null, 1));
  console.log(`checkpoint gold re-derived from ${src}: ${changed} cell(s) changed`);
}

main();

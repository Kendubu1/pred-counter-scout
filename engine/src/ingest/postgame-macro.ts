// Macro read for the post-game skirmishes. computeMatchFacts now attaches a per-fight
// `macro` (numbers at the engage, who was dead, who was alive-but-absent, cross-map
// trades) on every FRESH pull — but the committed reviews were generated before that,
// so this pass recomputes it from each file's OWN data: the kill stream (death timing),
// the five players (pid/role/hero), the lane verdict strings, and the major timeline.
//
//   npm run postgame:macro            # add macro to reviews missing it
//   npm run postgame:macro -- --all   # recompute macro on every review
//
// Pure local — NO API calls. The kill stream + lanes are already committed, so the
// macro read is fully reproducible (and re-deriving it can't drift from a re-pull).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { skirmishMacro, type Skirmish, type SkirmishContext } from '../skirmishes.js';
import type { PostGameFacts } from '../postgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = path.join(ROOT, 'data/postgame');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;

function main() {
  const all = process.argv.includes('--all');
  const files = readdirSync(OUT_DIR).filter((f) => UUID_RE.test(f));
  let touched = 0, fights = 0, skipped = 0;
  for (const fn of files) {
    const p = path.join(OUT_DIR, fn);
    const f = JSON.parse(readFileSync(p, 'utf8')) as PostGameFacts;
    const sks = (f.skirmishes ?? []) as Skirmish[];
    if (!sks.length || !(f.kills ?? []).length) { skipped++; continue; }       // old no-kill review — nothing to read
    if (!all && sks.every((s) => s.macro)) continue;                            // already done

    const ctx: SkirmishContext = {
      ourPlayers: f.players.filter((p) => p.us).map((p) => ({ pid: p.pid, name: p.name, heroSlug: p.heroSlug, role: p.role })),
      enemyPids: f.players.filter((p) => !p.us).map((p) => p.pid),
      lanes: f.lanes.map((l) => ({ role: l.role, verdict: l.verdict })),
      majors: f.timeline?.majors,
    };
    for (const s of sks) { s.macro = skirmishMacro(s, f.kills, ctx); fights++; }
    writeFileSync(p, JSON.stringify(f, null, 1));
    touched++;
    console.log(`  macro ${all ? 'refreshed' : 'added'} (${sks.length} fights) -> ${fn}`);
  }
  console.log(`${touched} review(s) updated, ${fights} fights read; ${skipped} skipped (no kill stream).`);
}

main();

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
}

function interrogate(f: PostGameFacts): Interrogation | null {
  const players = (f.players ?? []) as any[];
  const us = players.filter((p) => p.us);
  const them = players.filter((p) => !p.us);
  if (!us.length || !them.length) return null;
  const sum = (rows: any[], k: string) => rows.reduce((s, p) => s + (p[k] ?? 0), 0);
  const majors = ((f.timeline as any)?.majors ?? []) as { minute: number; type: string; side: string }[];
  const kills = ((f as any).kills ?? []) as any[];
  const heroOf = new Map(us.map((p) => [p.pid, `${p.heroName} (${p.role})`]));
  const concededMajors = majors
    .filter((m) => m.side === 'them' && m.type !== 'RIVER' && m.type !== 'SEEDLING')
    .map((m) => {
      const t = m.minute * 60;
      const deadBefore = kills
        .filter((k) => k.killedSide === 'us' && heroOf.has(k.killedPid) && k.t >= t - 60 && k.t <= t + 10)
        .map((k) => heroOf.get(k.killedPid)!);
      return { type: m.type, minute: m.minute, deadBefore: [...new Set(deadBefore)], uncontested: deadBefore.length === 0 };
    });
  return {
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

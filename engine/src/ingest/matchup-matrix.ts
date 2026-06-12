// Full hero-vs-hero kill-window matrix for the lane room's counter view.
// Per-artifact matchups only cover same-primary-role opponents, which
// makes off-meta flexes (an Iggy & Scorch offlane) invisible: they never
// appear as a selectable enemy and no lane hero holds a sim against them.
// This batch sims every unordered hero pair once — headline build vs
// headline build, each kit on its primary-role gold curve — and writes a
// compact verdict matrix. The UI inverts verdicts for the reverse
// direction. Zero API; pure simulator over committed data.
//
//   npm run matrix

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { headlineBuild } from '../artifacts.js';
import { completedItems, loadData } from '../data.js';
import { loadCalibration } from '../sim.js';
import { matchupCheckpoints } from '../matchup.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const data = loadData();
const cal = loadCalibration();
const pool = completedItems(data);
const kits = [...data.kits.values()].sort((a, b) => a.slug.localeCompare(b.slug));

// y = first hero's kill window is better, e = second hero's, '=' even.
const CODE = { you: 'y', enemy: 'e', even: '=' } as const;

const buildsOf = new Map(kits.map((k) => [k.slug, headlineBuild(k, pool, cal, 8).items.map((n) => data.items.get(n)!)]));

const pairs: Record<string, string> = {};
let minutes: number[] = [];
const t0 = Date.now();
let done = 0;
for (let i = 0; i < kits.length; i++) {
  for (let j = i + 1; j < kits.length; j++) {
    const a = kits[i]!, b = kits[j]!;
    const report = matchupCheckpoints(
      { kit: a, build: buildsOf.get(a.slug)!, role: a.roles[0] ?? 'midlane' },
      { kit: b, build: buildsOf.get(b.slug)!, role: b.roles[0] ?? 'midlane' },
      cal,
    );
    if (!minutes.length) minutes = report.checkpoints.map((c) => c.minute);
    pairs[`${a.slug}|${b.slug}`] = report.checkpoints.map((c) => CODE[c.verdict]).join('');
    done++;
  }
  process.stdout.write('.');
}

const out = {
  generatedAt: new Date().toISOString(),
  patch: cal.patch,
  minutes,
  note: 'kill-window verdicts per checkpoint minute, first-named hero’s perspective (y = theirs, e = opponent’s, = even); headline build vs headline build, each kit on its primary-role gold curve — a flexed hero’s real income may differ; THEORY until calibrated',
  pairs,
};
writeFileSync(path.join(ROOT, 'data/artifacts/matchup-matrix.json'), JSON.stringify(out));
console.log(`\n${done} pairs in ${Math.round((Date.now() - t0) / 1000)}s -> data/artifacts/matchup-matrix.json`);

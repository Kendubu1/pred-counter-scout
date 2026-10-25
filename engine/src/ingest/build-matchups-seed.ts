// One-off: seed data/aggregates/build-matchups.json from the Fork PoC extract
// (engine/copy-tasks/fork-poc/rows.jsonl + ladder.json), so the 2026-10-22..24
// sample is kept before the scratch extract is lost. Zero-API. Refuses to seed
// twice or into another patch's window.
//
//   npx tsx src/ingest/build-matchups-seed.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAT_TIER, addSegment, countMatch, loadState, saveState } from './build-matchups.js';
import type { ForkMatch } from '../forks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'engine/copy-tasks/fork-poc');

const meta = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/META.json'), 'utf8')) as { patch?: string; patchReleasedAt: string };
const st = loadState(meta.patch ?? null, meta.patchReleasedAt);
if (st.window.segments.some((s) => s.via === 'seed:fork-poc')) { console.log('already seeded from the fork PoC extract; nothing to do'); process.exit(0); }
const pull = JSON.parse(readFileSync(path.join(DIR, 'state.json'), 'utf8')) as { from: number; cursor: number };
if (pull.from * 1000 < Date.parse(meta.patchReleasedAt)) throw new Error('extract starts before the current patch; refusing to mix patches');
const tiers = JSON.parse(readFileSync(path.join(DIR, 'ladder.json'), 'utf8')) as Record<string, number>;
const matches = readFileSync(path.join(DIR, 'rows.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as ForkMatch);
for (const m of matches) {
  countMatch(st, m.players.map((p) => ({ hero: p.hero, role: p.role, team: p.team, core: p.cores.map((c) => c[0]), plat: (tiers[p.pid] ?? -1) >= PLAT_TIER })));
}
addSegment(st, new Date(pull.from * 1000).toISOString(), new Date(pull.cursor * 1000).toISOString(), 'seed:fork-poc');
st.window.segments.sort((a, b) => a.from.localeCompare(b.from));
saveState(st);
console.log(`seeded ${matches.length} matches (${st.window.segments.map((s) => `${s.via} ${s.from.slice(0, 16)}..${s.to.slice(0, 16)}`).join(', ')}); ${Object.keys(st.heroes).length} hero-roles`);

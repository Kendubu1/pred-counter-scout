// npm run norms (zero-API): what a normal game looks like for each hero in each role this patch,
// from the ranked lineups (data/aggregates/team-comps/<patch>/, every player's output totals).
// The build read (src/build-story.ts) places one player's game on these to pick the lead story:
// "more damage than normal" means a percentile here, not an impression.
//
// Out: data/aggregates/hero-role-norms.json
//   heroes["<hero>|<role>"] = { n, q: { <metric>: [p5, p10, ..., p95] } }   (19 cut points)
// Metrics (per minute unless noted): dpm (hero damage), share (of team hero damage), kp (kill
// participation), dp10 (deaths per 10 min), gpm (gold), hpm (healing), mpm (damage mitigated),
// tpm (damage taken from heroes), opm (objective damage). Games under 10 minutes are skipped;
// hero-roles under 30 games are left out.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAT_KEYS, patchDir, readRows } from './team-comps.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const meta = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/META.json'), 'utf8'));
const I = Object.fromEntries(STAT_KEYS.map((k, i) => [k, i])) as Record<(typeof STAT_KEYS)[number], number>;
export const NORM_METRICS = ['dpm', 'share', 'kp', 'dp10', 'gpm', 'hpm', 'mpm', 'tpm', 'opm'] as const;
const rows = readRows(patchDir(meta.patch));
const acc = new Map<string, Record<string, number[]>>();
for (const r of rows) {
  const min = r.dur / 60;
  if (min < 10) continue;
  for (const t of [0, 1] as const) {
    const team = r.teams[t].filter((s) => Array.isArray(s[5]) && s[5]!.length === STAT_KEYS.length);
    if (team.length !== r.teams[t].length) continue;
    const tk = team.reduce((a, s) => a + s[5]![I.kills], 0), td = team.reduce((a, s) => a + s[5]![I.dmgHeroes], 0);
    for (const s of team) {
      const st = s[5]!;
      if (st.some((v) => v < 0)) continue;
      const m = { dpm: st[I.dmgHeroes] / min, share: td ? st[I.dmgHeroes] / td : 0, kp: tk ? (st[I.kills] + st[I.assists]) / tk : 0, dp10: (st[I.deaths] / min) * 10, gpm: st[I.gold] / min, hpm: st[I.healing] / min, mpm: st[I.mitigated] / min, tpm: st[I.takenHeroes] / min, opm: st[I.dmgObjectives] / min };
      const k = `${s[0]}|${s[1]}`;
      const a = acc.get(k) ?? Object.fromEntries(NORM_METRICS.map((x) => [x, [] as number[]]));
      for (const x of NORM_METRICS) a[x]!.push(m[x]);
      acc.set(k, a);
    }
  }
}
const cut = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return Array.from({ length: 19 }, (_, i) => Math.round(s[Math.min(s.length - 1, Math.floor(((i + 1) * 0.05) * s.length))]! * 1000) / 1000); };
const heroes: Record<string, { n: number; q: Record<string, number[]> }> = {};
for (const [k, a] of acc) { const n = a.dpm!.length; if (n >= 30) heroes[k] = { n, q: Object.fromEntries(NORM_METRICS.map((x) => [x, cut(a[x]!)])) }; }
writeFileSync(path.join(ROOT, 'data/aggregates/hero-role-norms.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), patch: meta.patch, source: `ranked lineups in data/aggregates/team-comps/${meta.patch}/ (${rows.length} matches, games of 10+ minutes)`,
  note: 'q.<metric> = the 5th, 10th, ... 95th percentile of that metric for the hero in that role. Per minute unless named: share and kp are fractions of the team; dp10 is deaths per 10 minutes.',
  metrics: NORM_METRICS, heroes,
}));
console.log(`hero-role norms ${meta.patch}: ${Object.keys(heroes).length} hero-roles with 30+ games from ${rows.length} matches`);

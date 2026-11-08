// npm run comps [-- --patch 1.18] — zero-API team-comp report from the lineups
// the daily perks pull keeps (data/aggregates/team-comps/<patch>/). Writes
// data/aggregates/team-comp-report.json (all ranks, plus Plat+ where a team had
// 3+ players at Platinum or higher in that game) and prints the headline tables.
// Rules: src/team-comp.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, kitTraits, tagHero, teamTraits, type HeroTags, type KitProfile, type Side } from '../team-comp.js';
import { loadCoverage, patchDir, readRows } from './team-comps.js';
import { PLAT_TIER } from './build-matchups.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'data/aggregates/team-comp-report.json');

const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const meta = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/META.json'), 'utf8')) as { patch?: string; patchReleasedAt?: string };
const patch = arg('--patch') ?? meta.patch ?? 'unknown';
const dir = patchDir(patch);
const rows = readRows(dir);
if (!rows.length) { console.log(`no team-comp rows in ${path.relative(ROOT, dir)} — run npm run perks first`); process.exit(0); }
const coverage = loadCoverage(dir, patch, meta.patchReleasedAt ?? '');

const heroes = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/heroes.json'), 'utf8')) as { slug: string; classes: string[] }[];
const profiles = (JSON.parse(readFileSync(path.join(ROOT, 'data/game-data/kit-profiles.json'), 'utf8')).heroes ?? {}) as Record<string, KitProfile>;
const tags = new Map<string, HeroTags>(heroes.map((h) => [h.slug, tagHero(h, profiles[h.slug])]));
const kitIdx = JSON.parse(readFileSync(path.join(ROOT, 'data/game-data/kit-index.json'), 'utf8')).heroes;
const power = new Map<string, string>((JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/classifications.json'), 'utf8')).heroes ?? []).map((c: any) => [c.hero, c.powerType]));

const sides: Side[] = [];
let skipped = 0;
for (const r of rows) {
  const tr = r.teams.map((t) => (t.length === 5 ? teamTraits(t.map((s) => s[0]), tags) : null));
  if (!tr[0] || !tr[1]) { skipped++; continue; }
  const kt = r.teams.map((t) => kitTraits(t.map((s) => s[0]), kitIdx, power));
  for (const i of [0, 1] as const) {
    sides.push({
      ...(kt[0] && kt[1] ? { kit: kt[i]!, enemyKit: kt[1 - i]! } : {}),
      matchId: r.id, win: r.win === i, traits: tr[i]!, enemy: tr[1 - i]!,
      heroes: r.teams[i].map(([hero, role]) => ({ hero, role })),
      plat: r.teams[i].filter((s) => s[2] != null && s[2] >= PLAT_TIER).length >= 3,
    });
  }
}

const all = buildReport(sides);
const plat = buildReport(sides.filter((s) => s.plat), 30, 25);
writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(), patch,
  source: `data/aggregates/team-comps/${path.basename(dir)}/ (${rows.length} ranked matches; ${skipped} skipped for a missing role or unknown hero), rules in engine/src/team-comp.ts`,
  coverage: coverage.segments,
  note: 'Win rates per team side. ci95 = half-width of the 95% interval at a 50% rate, so a gap smaller than it is noise. byCount = teams with that many of the tag; byDiff = this team minus the enemy (clamped to +-2); kitByCount / kitByDiff = the same by kit features from data/game-data/kit-index.json (hardCC = abilities with hard CC, longCC = those lasting 1s+, mobility = abilities that move the hero, unstoppable / healers / cleanse = heroes with one, magical = magic-damage heroes); ccWithinTanks = the hard-CC gap read inside each tank gap, so CC is not just tanks again. styles: dive = 3+ high-dive kits, brawl = 3+ tanks/bruisers, engage-peel = 2+ engage kits and an enchanter, else mixed. platPlus = teams with 3+ players Platinum or higher in that game. Descriptive, not a recommendation.',
  all, platPlus: plat,
}, null, 1) + '\n');

const fmt = (o: Record<string, { n: number; wr: number; ci95: number }>) => Object.entries(o).map(([k, v]) => `${k}=${v.wr}% (n${v.n} ±${v.ci95})`).join('  ');
console.log(`team comps ${patch}: ${all.matches} matches, ${all.sides} team sides (${skipped} skipped); coverage ${coverage.segments.map((s) => `${s.via} ${s.from.slice(0, 10)}..${s.to.slice(0, 10)} (${s.matches})`).join(', ')}`);
for (const [k, v] of Object.entries(all.byCount)) console.log(`  ${k.padEnd(10)} ${fmt(v)}`);
console.log('  vs enemy:');
for (const [k, v] of Object.entries(all.byDiff)) console.log(`  ${k.padEnd(10)} ${fmt(v)}`);
console.log(`  styles     ${fmt(all.styles)}`);
for (const [k, v] of Object.entries(all.styleVsStyle)) console.log(`  ${k.padEnd(11)}vs ${fmt(v)}`);
console.log('  kit vs enemy:');
for (const [k, v] of Object.entries(all.kitByDiff)) console.log(`  ${k.padEnd(11)} ${fmt(v)}`);
for (const [k, v] of Object.entries(all.ccWithinTanks)) console.log(`  ${k.padEnd(11)} ${fmt(v)}`);
console.log(`  Plat+ teams: ${plat.sides} sides`);
console.log(`wrote ${path.relative(ROOT, OUT)}`);

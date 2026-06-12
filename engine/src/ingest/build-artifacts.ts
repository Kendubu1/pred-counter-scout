// Concept A `engine` stage: emit per-hero artifacts to data/artifacts/.
//   npm run artifacts             (all heroes)
//   npm run artifacts -- gideon murdock

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadData } from '../data.js';
import { buildHeroArtifact } from '../artifacts.js';
import { loadCalibration } from '../sim.js';
import { loadAggregates } from '../aggregates.js';
import { momPriorStrength } from '../evidence.js';
import { hasCredentials, topPlayersPerLane } from './predgg.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'data/artifacts');

const requested = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const data = loadData();
const cal = loadCalibration();
mkdirSync(OUT, { recursive: true });

const slugs = requested.length ? requested : [...data.kits.keys()].sort();
const index: { slug: string; name: string; role: string }[] = [];
const t0 = Date.now();
for (const slug of slugs) {
  const kit = data.kits.get(slug);
  if (!kit) { console.error(`skip unknown slug ${slug}`); continue; }
  const artifact = buildHeroArtifact(kit, data, cal);
  writeFileSync(path.join(OUT, `${slug}.json`), JSON.stringify(artifact, null, 1));
  index.push({ slug, name: kit.name, role: artifact.role });
  process.stdout.write('.');
}
writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ patch: cal.patch, generatedAt: new Date().toISOString(), heroes: index }, null, 1));

// Meta board: most played per lane with empirical-Bayes shrunk winrates.
// Pure evidence display for the landing page; never feeds the generator.
const agg = loadAggregates();
if (agg) {
  const roles: Record<string, { slug: string; name: string; games: number; rawWr: number; shrunkWr: number }[]> = {};
  for (const role of ['carry', 'midlane', 'offlane', 'jungle', 'support']) {
    const cells = Object.entries(agg.heroes)
      // unmapped hero_id:* entries are excluded: no kit, no portrait, no
      // page to link to (one such id is tracked in lessons.md)
      .map(([slug, h]) => ({ slug, cell: h.byRole?.[role] }))
      .filter((x): x is { slug: string; cell: { n: number; w: number } } => data.kits.has(x.slug) && !!x.cell && x.cell.n >= 30);
    const k = momPriorStrength(cells.map((c) => c.cell), 0.5);
    roles[role] = cells
      .sort((a, b) => b.cell.n - a.cell.n)
      .slice(0, 8)
      .map(({ slug, cell }) => ({
        slug,
        name: data.kits.get(slug)?.name ?? slug,
        games: cell.n,
        rawWr: Math.round((cell.w / cell.n) * 1000) / 1000,
        shrunkWr: Math.round(((cell.w + k * 0.5) / (cell.n + k)) * 1000) / 1000,
      }));
  }
  // Top ranked pilots per lane from the pred.gg split leaderboard.
  // Env-gated: without PREDGG_* credentials the board ships without them.
  let topPlayers: Awaited<ReturnType<typeof topPlayersPerLane>> = null;
  if (hasCredentials()) {
    try {
      topPlayers = await topPlayersPerLane(5);
      console.log('top players per lane fetched from pred.gg');
    } catch (e) {
      console.error('pred.gg leaderboard fetch failed, shipping without:', (e as Error).message);
    }
  } else {
    console.log('no PREDGG_CLIENT_ID/SECRET in env; meta.json ships without top players');
  }

  writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({
    patch: cal.patch,
    generatedAt: new Date().toISOString(),
    matches: agg.meta.matches,
    note: 'most played per lane, shrunk winrate (method-of-moments EB toward 50%); all ranks, current-patch window',
    roles,
    topPlayers,
    topPlayersNote: topPlayers ? 'current ranked split leaderboard via the pred.gg API (favRole filter); VP = victory points' : null,
  }, null, 1));
  console.log('meta.json written');
}
console.log(`\n${index.length} artifacts in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${OUT}`);

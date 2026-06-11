// Concept A `engine` stage: emit per-hero artifacts to data/artifacts/.
//   npm run artifacts             (all heroes)
//   npm run artifacts -- gideon murdock

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadData } from '../data.js';
import { buildHeroArtifact } from '../artifacts.js';
import { loadCalibration } from '../sim.js';

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
console.log(`\n${index.length} artifacts in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${OUT}`);

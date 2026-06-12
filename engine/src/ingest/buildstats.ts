// pred.gg core-build evidence: top core item orders per hero with full-patch
// played/won counts, batched via GraphQL aliases (6 heroes per request,
// ~9 requests for the roster). Written to data/aggregates/predgg-builds.json
// and consumed by artifacts.ts to explain WHY meta builds win.
//
//   npm run buildstats

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';
import { loadData } from '../data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BATCH = 6;

const norm = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// pred.gg internal spellings that differ from display names. Only obvious
// one-letter/codename variants; anything else stays unmapped and is shown
// evidence-only rather than guessed.
const ALIASES: Record<string, string> = {
  fistofjazuul: 'fist-of-razuul',
  enmasblessing: 'enras-blessing',
};

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  const data = loadData();
  const slugs = [...data.kits.keys()].sort();
  const nameToSlug = new Map<string, string>();
  for (const i of data.items.values()) nameToSlug.set(norm(i.name), i.slug);

  const out: Record<string, { core: string[]; coreSlugs: (string | null)[]; n: number; w: number }[]> = {};
  let unmapped = new Set<string>();
  for (let b = 0; b < slugs.length; b += BATCH) {
    const batch = slugs.slice(b, b + BATCH);
    const q = `{ ${batch.map((s, i) =>
      `h${i}: hero(by: { slug: "${s}" }) { coreBuild(limit: 6) { results {
        core1Item { name } core2Item { name } core3Item { name }
        matchesPlayedBuildOrder matchesWonBuildOrder } } }`).join(' ')} }`;
    const d = await gql<Record<string, { coreBuild: { results: { core1Item: { name: string } | null; core2Item: { name: string } | null; core3Item: { name: string } | null; matchesPlayedBuildOrder: number; matchesWonBuildOrder: number }[] } }>>(q);
    batch.forEach((slug, i) => {
      const rows = d[`h${i}`]?.coreBuild?.results ?? [];
      out[slug] = rows
        .filter((r) => r.core1Item && r.core2Item && r.core3Item && r.matchesPlayedBuildOrder >= 20)
        .map((r) => {
          const core = [r.core1Item!.name, r.core2Item!.name, r.core3Item!.name];
          const coreSlugs = core.map((n) => {
            const s = nameToSlug.get(norm(n)) ?? ALIASES[norm(n)] ?? null;
            if (!s) unmapped.add(n);
            return s;
          });
          return { core, coreSlugs, n: r.matchesPlayedBuildOrder, w: r.matchesWonBuildOrder };
        });
    });
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 250));
  }
  const file = path.join(ROOT, 'data/aggregates/predgg-builds.json');
  writeFileSync(file, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'pred.gg coreBuild (full current-patch evidence, ordered 3-item cores, 20+ games each)',
    heroes: out,
  }, null, 1));
  const total = Object.values(out).reduce((s, v) => s + v.length, 0);
  console.log(`\n${total} evidence cores across ${Object.keys(out).length} heroes -> ${file}`);
  if (unmapped.size) console.log('unmapped item names:', [...unmapped].join(', '));
}

main().catch((e) => { console.error(e); process.exit(1); });

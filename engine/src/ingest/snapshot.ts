// Snapshot omeda.city reference data (heroes with base stats, items with
// game IDs) into data/omeda/. These are slow-changing per-patch facts; the
// snapshot keeps the engine deterministic and the site buildable offline.
// Re-run after each balance patch. Sanctioned source: the official Omeda
// public API via omeda.city (see docs/v5-engine-design.md, section 2).

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'data/omeda');
const UA = { 'User-Agent': 'pred-counter-scout (github.com/Kendubu1/pred-counter-scout)' };

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const heroes = await fetchJson('https://omeda.city/heroes.json');
  const items = await fetchJson('https://omeda.city/items.json');
  writeFileSync(path.join(OUT, 'heroes.json'), JSON.stringify(heroes, null, 1));
  writeFileSync(path.join(OUT, 'items.json'), JSON.stringify(items, null, 1));
  writeFileSync(path.join(OUT, 'META.json'), JSON.stringify({
    source: 'https://omeda.city (official Omeda Studios public API)',
    attribution: 'Data courtesy of the Omeda Studios public API via omeda.city',
    fetchedAt: new Date().toISOString(),
    files: {
      'heroes.json': `${(heroes as unknown[]).length} heroes with 18-level base_stats arrays`,
      'items.json': `${(items as unknown[]).length} items with structured stats and game_id (maps match inventory_data)`,
    },
  }, null, 2));
  console.log(`Snapshot written to ${OUT}: ${(heroes as unknown[]).length} heroes, ${(items as unknown[]).length} items`);
}

main().catch((e) => { console.error(e); process.exit(1); });

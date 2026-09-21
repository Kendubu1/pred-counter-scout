// Snapshot omeda.city reference data (heroes with base stats, items with
// game IDs) into data/omeda/. These are slow-changing per-patch facts; the
// snapshot keeps the engine deterministic and the site buildable offline.
// Re-run after each balance patch. Sanctioned source: the official Omeda
// public API via omeda.city (see docs/v5-engine-design.md, section 2).

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

  // A fetch timestamp records when we ASKED, never what we got. When upstream
  // stops publishing, fetchedAt keeps advancing while the numbers stand still,
  // and every surface that prints it starts overstating how fresh the data is.
  // So hash the payload and carry the date the CONTENT last changed: if the
  // hash matches what we already hold, contentChangedAt is preserved.
  const contentHash = createHash('sha256')
    .update(JSON.stringify(heroes)).update(JSON.stringify(items)).digest('hex').slice(0, 16);
  const metaPath = path.join(OUT, 'META.json');
  let contentChangedAt = new Date().toISOString();
  if (existsSync(metaPath)) {
    const prev = JSON.parse(readFileSync(metaPath, 'utf8')) as
      { contentHash?: string; contentChangedAt?: string };
    if (prev.contentHash === contentHash && prev.contentChangedAt) {
      contentChangedAt = prev.contentChangedAt;
    }
  }
  const staleDays = Math.floor((Date.now() - Date.parse(contentChangedAt)) / 86400000);
  writeFileSync(metaPath, JSON.stringify({
    source: 'https://omeda.city (official Omeda Studios public API)',
    attribution: 'Data courtesy of the Omeda Studios public API via omeda.city',
    fetchedAt: new Date().toISOString(),
    contentHash,
    contentChangedAt,
    contentAgeDays: staleDays,
    contentNote: 'fetchedAt is when we asked; contentChangedAt is when the payload last actually differed. Surfaces that describe data freshness must use contentChangedAt.',
    files: {
      'heroes.json': `${(heroes as unknown[]).length} heroes with 18-level base_stats arrays`,
      'items.json': `${(items as unknown[]).length} items with structured stats and game_id (maps match inventory_data)`,
    },
  }, null, 2));
  console.log(`Snapshot written to ${OUT}: ${(heroes as unknown[]).length} heroes, ${(items as unknown[]).length} items`);
  console.log(staleDays >= 3
    ? `  NOTE: upstream content is UNCHANGED for ${staleDays} days (last changed ${contentChangedAt.slice(0, 10)}). The fetch succeeded; omeda is not publishing.`
    : `  content last changed ${contentChangedAt.slice(0, 10)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

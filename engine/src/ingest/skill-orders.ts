// Per-hero ability leveling order — the authoritative recommended skill
// path from pred.gg (hero.data.recommendedSkills): an 18-entry array, one
// AbilityKey per level. We map keys to the omeda RMB/Q/E/R slots, derive
// the max-priority order of the three basics (which reaches 5 points
// first), and surface the ult levels. One call per hero; covers all 52.
//
//   PREDGG_CLIENT_ID=... PREDGG_CLIENT_SECRET=... npm run skills

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';
import { loadData } from '../data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TO_OMEDA: Record<string, string> = { BASIC: 'LMB', PRIMARY: 'RMB', SECONDARY: 'Q', ALTERNATE: 'E', ULTIMATE: 'R', PASSIVE: 'Passive' };
const BASIC_KEYS = ['RMB', 'Q', 'E'];

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  const data = loadData();
  const index = JSON.parse(readFileSync(path.join(ROOT, 'data/artifacts/index.json'), 'utf8')) as { heroes: { slug: string }[] };
  const rawHeroes = (() => { const h = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8')); return Array.isArray(h) ? h : h.heroes; })() as { slug: string; abilities: { key: string; display_name: string }[] }[];
  const nameOf = new Map(rawHeroes.map((h) => [h.slug, new Map(h.abilities.map((a) => [a.key, a.display_name]))]));

  const out: Record<string, { sequence: string[]; maxOrder: { key: string; name: string; maxedAt: number }[]; ultLevels: number[] }> = {};
  const missing: string[] = [];
  let calls = 0;
  for (const { slug } of index.heroes) {
    const names = nameOf.get(slug);
    if (!names) continue;
    let rec: string[] | null = null;
    try {
      const d = await gql<{ hero: { data: { recommendedSkills: string[] } | null } }>(`{ hero(by: { slug: "${slug}" }) { data { recommendedSkills } } }`);
      rec = d.hero.data?.recommendedSkills ?? null;
      calls++;
    } catch { /* counted as missing below */ }
    if (!rec || rec.length < 18) { missing.push(slug); continue; }
    const sequence = rec.map((k) => TO_OMEDA[k] ?? k);
    // max-priority: order in which each basic hits its 5th point
    const fifthAt = new Map<string, number>();
    const counts = new Map<string, number>();
    sequence.forEach((okey, i) => {
      if (!BASIC_KEYS.includes(okey)) return;
      const c = (counts.get(okey) ?? 0) + 1;
      counts.set(okey, c);
      if (c === 5 && !fifthAt.has(okey)) fifthAt.set(okey, i + 1);
    });
    const maxOrder = BASIC_KEYS
      .filter((k) => names.has(k))
      .map((k) => ({ key: k, name: names.get(k)!, maxedAt: fifthAt.get(k) ?? (99 + sequence.indexOf(k)) }))
      .sort((a, b) => a.maxedAt - b.maxedAt);
    const ultLevels = sequence.map((k, i) => (k === 'R' ? i + 1 : 0)).filter(Boolean);
    out[slug] = { sequence, maxOrder, ultLevels };
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 150));
  }
  writeFileSync(path.join(ROOT, 'data/aggregates/skill-orders.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'pred.gg hero.data.recommendedSkills (in-game recommended skill path), current patch; AbilityKey mapped to omeda RMB/Q/E/R slots',
    note: 'sequence = the recommended ability to level at each of 18 levels; maxOrder = which basic reaches 5 points first; ult levels read straight from the path',
    coverage: { covered: Object.keys(out).length, missing },
    heroes: out,
  }, null, 1));
  console.log(`\n${calls} calls · ${Object.keys(out).length}/${index.heroes.length} heroes covered${missing.length ? ` · MISSING: ${missing.join(', ')}` : ''} -> data/aggregates/skill-orders.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });

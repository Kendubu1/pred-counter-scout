// Tower locations for the committed post-game films. The film pull used to keep
// only a structure's time, type and side, so a tower could not be tied to a lane
// (docs/coaching-methodology.md, "Rotation verdicts need both sides of the
// trade"). pred.gg's StructureDestruction also carries `location` and the
// destroying hero/player; new pulls ask for them (predgg-match.ts). This pass
// backfills them onto `events[]` tower rows of films pulled before that.
//
//   npm run postgame:structures            # films with unlocated tower events
//   npm run postgame:structures -- --all   # re-fetch every film
//
// LIVE pred.gg (needs PREDGG creds): aliased match(by: { id }) queries, 10
// films per request, sequential with a delay (data policy). Writes x/y and
// byPid/bySlug per tower event; the lane is derived later (postgame-rotations).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = path.join(ROOT, 'data/postgame');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;
const BATCH = 10;
const FIELDS = 'structureDestructions { gameTime structureEntityType location { x y } destructionHero { slug } destructionPlayer { uuid } }';

async function main() {
  if (!hasCredentials()) { console.error('pred.gg credentials required (PREDGG_CLIENT_ID / PREDGG_CLIENT_SECRET)'); process.exit(2); }
  const all = process.argv.includes('--all');
  const todo = readdirSync(OUT_DIR).filter((f) => UUID_RE.test(f)).filter((fn) => {
    const ev = (JSON.parse(readFileSync(path.join(OUT_DIR, fn), 'utf8')).events ?? []) as any[];
    const towers = ev.filter((e) => e.kind === 'tower');
    return towers.length && (all || towers.some((e) => e.x == null));
  });
  let filled = 0, films = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const q = `{ ${batch.map((fn, k) => `m${k}: match(by: { id: "${fn.slice(0, -5)}" }) { ${FIELDS} }`).join(' ')} }`;
    let d: Record<string, any>;
    try { d = await gql<Record<string, any>>(q); } catch (e) { console.warn(`  batch ${i / BATCH}: ${(e as Error).message} — skipped`); continue; }
    batch.forEach((fn, k) => {
      const sds = (d[`m${k}`]?.structureDestructions ?? []) as any[];
      if (!sds.length) return;
      const p = path.join(OUT_DIR, fn);
      const f = JSON.parse(readFileSync(p, 'utf8'));
      const used = new Set<any>();
      let n = 0;
      for (const e of (f.events ?? []).filter((x: any) => x.kind === 'tower')) {
        const sd = sds.find((s) => !used.has(s) && s.gameTime === e.sec && s.structureEntityType === e.type);
        if (!sd?.location) continue;
        used.add(sd);
        Object.assign(e, { x: sd.location.x, y: sd.location.y, byPid: sd.destructionPlayer?.uuid ?? null, bySlug: sd.destructionHero?.slug ?? null });
        n++;
      }
      if (n) { writeFileSync(p, JSON.stringify(f, null, 1)); filled += n; films++; }
    });
    await new Promise((r) => setTimeout(r, 1200));
  }
  console.log(`${filled} tower event(s) located across ${films} film(s) (${todo.length} needed it).`);
}

main();

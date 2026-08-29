// Names our surfaces print must match the names the patch notes use.
//
// The 1.16 Eternal "Satariel" was hand-entered into the Eternals catalog as
// "Satatriel" and, because the name doubles as the join key, the typo spread to
// 62 committed files — the published patch review, the Learn Eternals page, hero
// artifacts and the effect fixture all agreed with each other and all were wrong.
// Internal consistency could never catch that; only checking against the notes
// can. The patch digests are hand-captured from the official notes and had the
// spelling right the whole time.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

interface Digest { patch?: string; eternals?: { changes?: { name: string; dir?: string }[] }; heroes?: { slug: string }[] }

const digests: Digest[] = readdirSync(path.join(ROOT, 'data/patches'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(path.join(ROOT, 'data/patches', f), 'utf8')) as Digest);

describe('names match the patch notes', () => {
  it('every Eternal or blessing a patch digest introduces exists under that exact name', () => {
    // A digest's eternals section lists both new Eternals and new minor
    // blessings (1.16 added Mechadrive as a minor), so both pools count.
    const cat = JSON.parse(readFileSync(path.join(ROOT, 'data/game-data/eternals.json'), 'utf8')) as
      { eternals: { name: string; minorSlot1?: unknown[]; minorSlot2?: unknown[] }[] };
    const known = new Set<string>();
    for (const e of cat.eternals) {
      known.add(e.name);
      for (const slot of [e.minorSlot1, e.minorSlot2]) {
        for (const m of slot ?? []) known.add(typeof m === 'string' ? m : (m as { name: string }).name);
      }
    }
    const missing: string[] = [];
    for (const d of digests) {
      for (const c of d.eternals?.changes ?? []) {
        if (c.dir !== 'new') continue;
        if (!known.has(c.name)) missing.push(`${d.patch}: notes name "${c.name}", the catalog has no Eternal or blessing spelled that way`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every hero a patch digest names is on the roster', () => {
    const roster = new Set((JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8')) as
      { slug: string }[]).map((h) => h.slug));
    // Digests can name a hero the catalog had not published yet (Scarlett was in
    // the 1.16 notes days before omeda listed her), so this reports rather than
    // fails on the newest digest only.
    const unknown: string[] = [];
    for (const d of digests) {
      for (const h of d.heroes ?? []) if (!roster.has(h.slug)) unknown.push(`${d.patch}: ${h.slug}`);
    }
    expect(unknown, 'a digest names a hero slug the roster does not have — check the spelling').toEqual([]);
  });
});

// Icon sync: snapshot every image the site renders into ui/img/ so pages stay
// zero-API at render time.
//
//   npm run icons                       (omeda images only: heroes, abilities, items, crests)
//   PREDGG_CLIENT_ID=... PREDGG_CLIENT_SECRET=... npm run icons   (+ Eternals, minors, augments)
//
// Sources:
//   - data/omeda/heroes.json + items.json carry an `image` hash per hero,
//     ability and item; it resolves at https://omeda.city<image>. Heroes and
//     items are saved by slug, abilities by hash (what the hero pages link).
//   - pred.gg perks catalog carries an `icon` hash per perk; it resolves at
//     https://pred.gg/assets/<hash>.webp. ETERNAL_1 perks -> ui/img/eternals/
//     (by catalog id when data/game-data/eternals.json names it, else by
//     slugified display name); BLESSING_MINOR_* and COMMON_* perks (the minors
//     under each Eternal, keyed by slugified name because the catalog names
//     them) -> ui/img/blessings/; HERO_SPECIFIC_1 perks -> ui/img/augments/<perkId>.
//
// Skip-if-exists, sequential, delayed, UA-identified: only files the repo is
// missing are fetched, so a normal run makes zero requests. Run it after
// `npm run snapshot` (new hero / item / Eternal) and it fills the gaps.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const UA = { 'User-Agent': 'pred-counter-scout (github.com/Kendubu1/pred-counter-scout)' };
const DELAY_MS = 150;

type Job = { url: string; dest: string; label: string };

function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// A 404 means the upstream catalog points at an asset it does not serve
// (seen for one augment); that is a warning, not a pipeline failure. Anything
// else (network, 5xx) fails the run so a refresh never silently ships gaps.
async function fetchMissing(jobs: Job[]): Promise<{ fetched: number; missing: string[]; failed: string[] }> {
  let fetched = 0;
  const missing: string[] = [];
  const failed: string[] = [];
  for (const job of jobs) {
    if (existsSync(job.dest)) continue;
    mkdirSync(path.dirname(job.dest), { recursive: true });
    try {
      const res = await fetch(job.url, { headers: UA });
      if (res.status === 404) { missing.push(`${job.label}: upstream 404`); continue; }
      if (!res.ok) { failed.push(`${job.label}: HTTP ${res.status}`); continue; }
      writeFileSync(job.dest, Buffer.from(await res.arrayBuffer()));
      fetched++;
      console.log(`  + ${job.label} -> ${path.relative(ROOT, job.dest)}`);
    } catch (e) {
      failed.push(`${job.label}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  return { fetched, missing, failed };
}

type OmedaHero = { slug: string; image: string | null; abilities?: { display_name: string; image: string | null }[] };
type OmedaItem = { slug: string; image: string | null; slot_type?: string };

function omedaJobs(): Job[] {
  const heroes = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/heroes.json'), 'utf8')) as OmedaHero[];
  const items = JSON.parse(readFileSync(path.join(ROOT, 'data/omeda/items.json'), 'utf8')) as OmedaItem[];
  const jobs: Job[] = [];
  const omeda = (image: string) => `https://omeda.city${image}`;
  for (const h of heroes) {
    if (h.image) jobs.push({ url: omeda(h.image), dest: path.join(ROOT, 'ui/img/heroes', `${h.slug}.webp`), label: `hero ${h.slug}` });
    for (const a of h.abilities ?? []) {
      const hash = a.image?.match(/([0-9a-f]{16})\.webp$/)?.[1];
      if (hash) jobs.push({ url: omeda(a.image!), dest: path.join(ROOT, 'ui/img/abilities', `${hash}.webp`), label: `ability ${h.slug}/${a.display_name}` });
    }
  }
  for (const i of items) {
    if (!i.image) continue;
    jobs.push({ url: omeda(i.image), dest: path.join(ROOT, 'ui/img/items', `${i.slug}.webp`), label: `item ${i.slug}` });
    if (i.slot_type === 'Crest') jobs.push({ url: omeda(i.image), dest: path.join(ROOT, 'ui/img/crests', `${i.slug}.webp`), label: `crest ${i.slug}` });
  }
  return jobs;
}

type Perk = { id: string; data: { slot: string; displayName: string; icon: string | null } | null };

async function predggJobs(): Promise<Job[]> {
  const catalogPath = path.join(ROOT, 'data/game-data/eternals.json');
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { eternals: { id: string; name: string }[] };
  const idByName = new Map(catalog.eternals.map((e) => [e.name.toLowerCase(), e.id]));
  const d = await gql<{ perks: Perk[] }>('{ perks { id data { slot displayName icon } } }');
  const jobs: Job[] = [];
  const seen = new Set<string>();
  for (const p of d.perks) {
    if (!p.data?.icon) continue;
    const url = `https://pred.gg/assets/${p.data.icon}.webp`;
    if (p.data.slot === 'ETERNAL_1') {
      const slug = slugify(p.data.displayName);
      const id = idByName.get(p.data.displayName.toLowerCase());
      if (id && id !== slug) console.log(`  note: catalog id "${id}" differs from pred.gg name "${p.data.displayName}"; saving both`);
      for (const name of new Set([slug, id].filter(Boolean) as string[])) {
        jobs.push({ url, dest: path.join(ROOT, 'ui/img/eternals', `${name}.webp`), label: `eternal ${p.data.displayName}` });
      }
      seen.add(p.data.displayName.toLowerCase());
    } else if (p.data.slot.startsWith('BLESSING_MINOR') || p.data.slot.startsWith('COMMON')) {
      jobs.push({ url, dest: path.join(ROOT, 'ui/img/blessings', `${slugify(p.data.displayName)}.webp`), label: `blessing ${p.data.displayName}` });
    } else if (p.data.slot === 'HERO_SPECIFIC_1') {
      jobs.push({ url, dest: path.join(ROOT, 'ui/img/augments', `${p.id}.webp`), label: `augment ${p.id} ${p.data.displayName}` });
    }
  }
  const notInFeed = catalog.eternals.filter((e) => !seen.has(e.name.toLowerCase())).map((e) => e.name);
  if (notInFeed.length) console.log(`  catalog Eternals absent from the pred.gg perks feed (no icon source): ${notInFeed.join(', ')}`);
  const notInCatalog = [...seen].filter((n) => !idByName.has(n));
  if (notInCatalog.length) console.log(`  pred.gg Eternals not in data/game-data/eternals.json yet: ${notInCatalog.join(', ')}`);
  return jobs;
}

async function main() {
  console.log('omeda.city images (heroes, abilities, items, crests):');
  const omeda = await fetchMissing(omedaJobs());
  console.log(`  ${omeda.fetched} fetched`);

  let predgg = { fetched: 0, missing: [] as string[], failed: [] as string[] };
  if (hasCredentials()) {
    console.log('pred.gg perk icons (Eternals, minor blessings, augments):');
    predgg = await fetchMissing(await predggJobs());
    console.log(`  ${predgg.fetched} fetched`);
  } else {
    console.log('pred.gg perk icons: skipped (no PREDGG_CLIENT_ID/SECRET in env)');
  }

  const missing = [...omeda.missing, ...predgg.missing];
  if (missing.length) console.warn(`upstream has no file for (${missing.length}):\n  ${missing.join('\n  ')}`);
  const failed = [...omeda.failed, ...predgg.failed];
  if (failed.length) {
    console.error(`failed (${failed.length}):\n  ${failed.join('\n  ')}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

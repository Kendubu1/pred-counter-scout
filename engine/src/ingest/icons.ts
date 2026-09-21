// Icon sync: snapshot every image the site renders into ui/img/ so pages stay
// zero-API at render time.
//
//   PREDGG_CLIENT_ID=... PREDGG_CLIENT_SECRET=... npm run icons
//
// Source: the pred.gg catalog (omeda.city stopped publishing on 2026-08-28,
// see lessons.md 2026-09-21, so it is no longer consulted). Every entity
// carries an `icon` hash that resolves at https://pred.gg/assets/<hash>.webp:
//   - heroes            -> ui/img/heroes/<slug>.webp
//   - items             -> ui/img/items/<slug>.webp (+ ui/img/crests/ for CREST slot)
//   - ETERNAL_1 perks   -> ui/img/eternals/<catalog id or slugified name>.webp
//   - BLESSING_MINOR_* and COMMON_* perks (the minors under each Eternal,
//     keyed by slugified name because the catalog names them)
//                       -> ui/img/blessings/<slug>.webp
//   - HERO_SPECIFIC_1   -> ui/img/augments/<perkId>.webp
// Ability icons (ui/img/abilities/<hash>.webp) are keyed by the omeda hashes
// the frozen kit snapshot links; they are committed and have no live source.
//
// Skip-if-exists, sequential, delayed, UA-identified: only files the repo is
// missing are fetched, so a normal run makes zero requests. Run it after any
// catalog change (new hero / item / Eternal) and it fills the gaps.

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

type Perk = { id: string; data: { slot: string; displayName: string; icon: string | null } | null };

type PredHero = { slug: string; data: { icon: string | null } | null };
type PredItem = { slug: string; data: { icon: string | null; slotType: string | null; isHidden: boolean } | null };

const ASSET = (hash: string) => `https://pred.gg/assets/${hash}.webp`;

async function catalogJobs(): Promise<Job[]> {
  const d = await gql<{ heroes: PredHero[]; items: PredItem[] }>('{ heroes { slug data { icon } } items { slug data { icon slotType isHidden } } }');
  const jobs: Job[] = [];
  for (const h of d.heroes) {
    if (h.data?.icon) jobs.push({ url: ASSET(h.data.icon), dest: path.join(ROOT, 'ui/img/heroes', `${h.slug}.webp`), label: `hero ${h.slug}` });
  }
  for (const i of d.items) {
    if (!i.data?.icon || i.data.isHidden) continue;
    jobs.push({ url: ASSET(i.data.icon), dest: path.join(ROOT, 'ui/img/items', `${i.slug}.webp`), label: `item ${i.slug}` });
    if (i.data.slotType === 'CREST') jobs.push({ url: ASSET(i.data.icon), dest: path.join(ROOT, 'ui/img/crests', `${i.slug}.webp`), label: `crest ${i.slug}` });
  }
  return jobs;
}

async function perkJobs(): Promise<Job[]> {
  const catalogPath = path.join(ROOT, 'data/game-data/eternals.json');
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { eternals: { id: string; name: string }[] };
  const idByName = new Map(catalog.eternals.map((e) => [e.name.toLowerCase(), e.id]));
  const d = await gql<{ perks: Perk[] }>('{ perks { id data { slot displayName icon } } }');
  const jobs: Job[] = [];
  const seen = new Set<string>();
  for (const p of d.perks) {
    if (!p.data?.icon) continue;
    const url = ASSET(p.data.icon);
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
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  console.log('pred.gg catalog icons (heroes, items, crests):');
  const catalog = await fetchMissing(await catalogJobs());
  console.log(`  ${catalog.fetched} fetched`);
  console.log('pred.gg perk icons (Eternals, minor blessings, augments):');
  const perks = await fetchMissing(await perkJobs());
  console.log(`  ${perks.fetched} fetched`);

  const missing = [...catalog.missing, ...perks.missing];
  if (missing.length) console.warn(`upstream has no file for (${missing.length}):\n  ${missing.join('\n  ')}`);
  const failed = [...catalog.failed, ...perks.failed];
  if (failed.length) {
    console.error(`failed (${failed.length}):\n  ${failed.join('\n  ')}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

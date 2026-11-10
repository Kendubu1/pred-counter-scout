// Past-patch hero builds for the hero page's patch filter:
// data/artifacts/past-hero-builds.json. Zero-API. Reads every archived patch in
// data/aggregates/past-patches/<patch>/ that holds a predgg-builds.json (the
// perks archive, kept from 1.17.2 on) and scores its 3-item cores with the same
// rules as the current-patch hero artifacts (shrunkCores, bandEvidence in
// src/artifacts.ts), per lane and per rank band (All ranks / Plat+).
//
// Field evidence only: no simulator text. The kit math runs on the CURRENT
// catalog, so it cannot say why a core won on an older patch.
//
//   npm run past-hero-builds      (part of npm run artifacts)

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../data.js';
import { bandEvidence, RANK_BANDS, shrunkCores, type PredggBuilds } from '../artifacts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PAST = path.join(ROOT, 'data/aggregates/past-patches');
const data = loadData();
const currentPatch = String((JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/predgg-lane-stats.json'), 'utf8')) as { patch: string }).patch);

const verKey = (p: string) => p.split('.').map((x) => x.padStart(4, '0')).join('.');
const dirs = existsSync(PAST) ? readdirSync(PAST).filter((d) => existsSync(path.join(PAST, d, 'predgg-builds.json'))) : [];

const patches = dirs.map((d) => {
  if (d === currentPatch) throw new Error(`past-patches/${d} holds the CURRENT patch; archive only patches the perks count has moved past`);
  const pg = JSON.parse(readFileSync(path.join(PAST, d, 'predgg-builds.json'), 'utf8')) as PredggBuilds & { source?: string };
  const heroes: Record<string, Record<string, Record<string, { builds: unknown[]; baseline: { n: number; w: number } | null }>>> = {};
  for (const [slug, byRole] of Object.entries(pg.byRole ?? {})) {
    for (const role of Object.keys(byRole)) {
      for (const band of RANK_BANDS) {
        const e = bandEvidence(pg, slug, role, band);
        if (!e.rows?.length) continue;
        const { cores, coreGamesTotal, shrunkWr } = shrunkCores(e.rows);
        const builds = cores.slice(0, 3).map((c) => ({
          items: c.core.map((name, i) => ({
            name: (c.coreSlugs[i] && data.itemsBySlug.get(c.coreSlugs[i]!)?.name) ?? name.replace(/([a-z])([A-Z])/g, '$1 $2'),
            slug: c.coreSlugs[i] ?? null,
          })),
          ...(c.anyOrder ? { anyOrder: true } : {}),
          n: c.n,
          ...(c.otherOrderGames ? { otherOrderGames: c.otherOrderGames } : {}),
          shareOfCores: coreGamesTotal ? Math.round((c.n / coreGamesTotal) * 1000) / 1000 : 0,
          shrunkWr: Math.round(shrunkWr(c) * 1000) / 1000,
        }));
        ((heroes[slug] ??= {})[role] ??= {})[band] = { builds, baseline: e.baseline ? { n: e.baseline.n, w: e.baseline.w } : null };
      }
    }
  }
  // The window the cores were counted over, as the archived file states it.
  const win = /counted (\d{4}-\d{2}-\d{2})T[\d:]+ -> (\d{4}-\d{2}-\d{2})T/.exec(pg.source ?? '');
  const picks = `data/aggregates/past-patches/${d}/predgg-augments.json`;
  return {
    patch: d,
    countedFrom: win?.[1] ?? null,
    countedTo: win?.[2] ?? null,
    // Opening picks (augment / Eternal / crest counts) for the same patch, same
    // shape as the live predgg-augments.json; the page fetches it on demand.
    picksFile: existsSync(path.join(ROOT, picks)) ? picks : null,
    heroes,
  };
}).sort((a, b) => verKey(b.patch).localeCompare(verKey(a.patch)));

writeFileSync(path.join(ROOT, 'data/artifacts/past-hero-builds.json'), JSON.stringify({
  note: 'Field 3-item cores per hero-role for earlier patches, scored like the current-patch metaBuilds (shrunkCores / bandEvidence in src/artifacts.ts): bands all and plat+ (rank at match time). Evidence only, no simulator text. Newest first.',
  patches,
}) + '\n');
console.log(`past-hero-builds.json written: ${patches.map((p) => `${p.patch} (${Object.keys(p.heroes).length} heroes)`).join(', ') || 'no archived perks patches'}`);

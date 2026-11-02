// Past-patch boards for the homepage's patch picker: data/artifacts/past-boards.json.
// Zero-API. Reads every archived patch in data/aggregates/past-patches/<patch>/
// (predgg-lane-stats.json, plus predgg-bans.json when that patch has a bans pull)
// and scores it with the same src/boards.ts rules as the current-patch meta.json
// and bans.json, so switching patch never switches method.
//
//   npm run past-boards      (part of npm run artifacts)
//
// ARCHIVING A PATCH: when a refresh moves lanestats to a new patch, copy the
// outgoing data/aggregates/predgg-lane-stats.json and predgg-bans.json into
// data/aggregates/past-patches/<old patch>/ first. 1.16 was restored from the
// final 1.16 lanestats commit (0a5f338c, 2026-09-23, the day before 1.17) and
// its bans were pulled once with npm run bans -- --dir <that folder>.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../data.js';
import { buildBanBoard, buildMetaBoards, lanePriorK, type BanPull, type LaneStatsFile } from '../boards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PAST = path.join(ROOT, 'data/aggregates/past-patches');
const data = loadData();
const names = new Map((JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/heroes.json'), 'utf8')) as { slug: string; display_name: string }[])
  .map((h) => [h.slug, h.display_name]));
const current = JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/predgg-lane-stats.json'), 'utf8')) as LaneStatsFile;

const verKey = (p: string) => p.split('.').map((x) => x.padStart(4, '0')).join('.');
const dirs = existsSync(PAST) ? readdirSync(PAST).filter((d) => existsSync(path.join(PAST, d, 'predgg-lane-stats.json'))) : [];

const patches = dirs.map((d) => {
  const lane = JSON.parse(readFileSync(path.join(PAST, d, 'predgg-lane-stats.json'), 'utf8')) as LaneStatsFile;
  if (lane.patch === current.patch) throw new Error(`past-patches/${d} holds the CURRENT patch ${lane.patch}; archive only patches lanestats has moved past`);
  const bands = (lane.rankBands ?? []).map((b) => ({ key: b.key, label: b.label }));
  const { roles, rolesByBand, laneWr, laneWrByBand } = buildMetaBoards({
    laneCells: lane.heroes,
    matches: lane.matchesApprox,
    bands,
    matchesByBand: lane.matchesApproxByBand,
    priorK: lanePriorK(lane.heroes),
    nameOf: (slug) => (data.kits.has(slug) ? data.kits.get(slug)?.name ?? slug : undefined),
  });
  const bansPath = path.join(PAST, d, 'predgg-bans.json');
  const bans = existsSync(bansPath) ? buildBanBoard(JSON.parse(readFileSync(bansPath, 'utf8')) as BanPull, lane, names) : null;
  return {
    patch: lane.patch,
    scope: lane.scopeLabel,
    pulledAt: lane.generatedAt,
    versionIds: lane.versionIds,
    matches: lane.matchesApprox,
    rankBands: bands.length ? bands : undefined,
    matchesByBand: bands.length ? lane.matchesApproxByBand : undefined,
    roles,
    rolesByBand: bands.length ? rolesByBand : undefined,
    laneWr,
    laneWrByBand: bands.length ? laneWrByBand : undefined,
    bans,
  };
}).sort((a, b) => verKey(b.patch).localeCompare(verKey(a.patch)));

writeFileSync(path.join(ROOT, 'data/artifacts/past-boards.json'), JSON.stringify({
  note: 'Meta board + Most banned for earlier patches, same shape and scoring as meta.json / bans.json (src/boards.ts). Newest first. Hero pages, builds and matchups always use the current patch.',
  patches,
}, null, 1) + '\n');
console.log(`past-boards.json written: ${patches.map((p) => `${p.patch} (${p.matches.toLocaleString()} matches${p.bans ? ', bans' : ''})`).join(', ') || 'no archived patches'}`);

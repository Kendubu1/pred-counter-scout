// Most-banned board: data/artifacts/bans.json, read by the homepage's top-5
// strip and ui/v6/bans.html. Zero-API: ban counts from npm run bans, picks and
// wins from the same lane-stats cells the meta board uses, so every rate shares
// one match count. Runs as part of npm run artifacts (after build-artifacts).
//
//   npm run ban-board
//
// LANES: a ban removes a hero, not a lane, so a hero is listed under the lane
// it is played in MOST at that rank band (lane + laneShare on each row). The
// page's by-lane view is the overall list grouped by that lane.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBanBoard, type BanPull, type LaneStatsFile } from '../boards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const bansPath = path.join(ROOT, 'data/aggregates/predgg-bans.json');
if (!existsSync(bansPath)) { console.log('no data/aggregates/predgg-bans.json yet (npm run bans); bans.json not built'); process.exit(0); }
const banSrc = JSON.parse(readFileSync(bansPath, 'utf8')) as BanPull;
const lane = JSON.parse(readFileSync(path.join(ROOT, 'data/aggregates/predgg-lane-stats.json'), 'utf8')) as LaneStatsFile;
const names = new Map((JSON.parse(readFileSync(path.join(ROOT, 'data/catalog/heroes.json'), 'utf8')) as { slug: string; display_name: string }[])
  .map((h) => [h.slug, h.display_name]));
if (banSrc.patch !== lane.patch) console.warn(`bans.json: ban pull is patch ${banSrc.patch}, lane stats ${lane.patch} — run npm run bans`);

// Scoring lives in src/boards.ts, shared with the past-patch boards.
writeFileSync(path.join(ROOT, 'data/artifacts/bans.json'), JSON.stringify(buildBanBoard(banSrc, lane, names), null, 1));
console.log('bans.json written');

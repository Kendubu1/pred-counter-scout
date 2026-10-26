// Rotation pass: labels every located tower event with its lane and writes
// `f.rotations` (src/rotations.ts) on each film, then the cross-game squad
// tally in data/aggregates/rotation-habits.json.
//
//   npm run postgame:rotations
//
// Pure local, NO API calls. Tower locations come from the film pull (new
// films) or `npm run postgame:structures` (backfill).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { laneOfPoint } from '../map-lanes.js';
import { readRotations } from '../rotations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = path.join(ROOT, 'data/postgame');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;

function main() {
  const habits: Record<string, { games: number; rotationKills: number; rotationDeaths: number; beforeOpen: number; answered: number; paidOff: number; costHome: number; windowsAfterOpen: number }> = {};
  let touched = 0, films = 0;
  for (const fn of readdirSync(OUT_DIR).filter((f) => UUID_RE.test(f))) {
    const p = path.join(OUT_DIR, fn);
    const raw = readFileSync(p, 'utf8');
    const f = JSON.parse(raw);
    for (const e of f.events ?? []) if (e.kind === 'tower' && e.x != null && e.y != null) e.lane = laneOfPoint(e.x, e.y);
    const rot = readRotations(f);
    if (rot) f.rotations = rot; else delete f.rotations;
    const out = JSON.stringify(f, null, 1);
    if (out !== raw) { writeFileSync(p, out); touched++; }
    if (!rot?.located) continue;
    films++;
    const squad = new Set(f.players.filter((q: any) => q.us && q.squadName).map((q: any) => q.pid));
    for (const s of rot.players.filter((x) => squad.has(x.pid))) {
      const h = (habits[s.name] ??= { games: 0, rotationKills: 0, rotationDeaths: 0, beforeOpen: 0, answered: 0, paidOff: 0, costHome: 0, windowsAfterOpen: 0 });
      h.games++; h.rotationKills += s.rotationKills; h.rotationDeaths += s.rotationDeaths; h.beforeOpen += s.beforeOpen;
      h.answered += s.answered; h.paidOff += s.paidOff; h.costHome += s.costHome; h.windowsAfterOpen += s.windowsAfterOpen.length;
    }
  }
  writeFileSync(path.join(ROOT, 'data/aggregates/rotation-habits.json'), JSON.stringify({
    source: `derived from data/postgame/*.json rotations blocks (${films} films with located towers); counts are per squad member as a laner in that film`,
    note: 'rotation credits are kill/death credits on another lane; assists are not located, so a rotation that ended in an assist is invisible here (THEORY framing applies)',
    films, members: habits,
  }, null, 1) + '\n');
  console.log(`${touched} film(s) updated; rotation habits over ${films} located film(s) -> data/aggregates/rotation-habits.json`);
}

main();

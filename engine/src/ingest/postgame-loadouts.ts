// Backfill the RECORDED Eternal loadout (major + minors + augment + commons) on
// already-reviewed films. New films get `players[].loadout` from the pred.gg
// match pull itself (predgg-match.ts); films reviewed before 2026-09-22 carry
// no loadout, and the lobby then shows the ENGINE'S PICK labelled as such.
// This pass patches ONLY `players[].loadout` in place — coaching, fights,
// interrogation and the rest of the film are untouched.
//
//   npm run postgame:loadouts              # films missing loadouts (one pred.gg call each)
//   npm run postgame:loadouts -- --all     # re-pull every film's loadouts
//   COACH_GAMES=<id,id> npm run postgame:loadouts   # scope by match-id prefix
//
// Needs PREDGG_CLIENT_ID / PREDGG_CLIENT_SECRET (credentials gate, CLAUDE.md
// autonomy rule 4): exits 2 and does nothing without them. Sequential with a
// delay; a match pred.gg no longer serves is skipped, not invented.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';
import { mapPerks } from './predgg-match.js';
import { loadoutFromPerks } from '../postgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'data/postgame');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!hasCredentials()) {
    console.error('postgame:loadouts needs PREDGG_CLIENT_ID / PREDGG_CLIENT_SECRET in the env (credentials gate) — nothing changed');
    process.exit(2);
  }
  const all = process.argv.includes('--all');
  const scope = (process.env.COACH_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && UUID_RE.test(f.replace('.json', '')))
    .filter((f) => !scope.length || scope.some((s) => f.startsWith(s)));
  let patched = 0, skipped = 0, missing = 0;
  for (const file of files) {
    const p = path.join(DIR, file);
    const j = JSON.parse(readFileSync(p, 'utf8'));
    if (!Array.isArray(j.players)) continue;
    if (!all && j.players.every((pl: any) => pl.loadout)) { skipped++; continue; }
    const id = j.matchId ?? file.replace('.json', '');
    let d: any;
    try {
      d = await gql<any>(`{ match(by:{id:"${id}"}) { uuid matchPlayers { player { uuid } hero { slug } perks { id name data { slot displayName } } } } }`);
    } catch (e) {
      console.error(`  ${id.slice(0, 8)} · pred.gg error (${(e as Error).message.slice(0, 60)}) — left as is`);
      missing++; await sleep(400); continue;
    }
    const rows: any[] = d?.match?.matchPlayers ?? [];
    if (!rows.length) { console.log(`  ${id.slice(0, 8)} · not on pred.gg — left as is`); missing++; await sleep(250); continue; }
    // Join by player uuid first (private profiles still carry a uuid in the
    // match), then by hero slug for the rare row without one.
    const byPid = new Map<string, any>(rows.filter((r) => r.player?.uuid).map((r) => [r.player.uuid, r]));
    const byHero = new Map<string, any>(rows.filter((r) => r.hero?.slug).map((r) => [r.hero.slug, r]));
    let filled = 0;
    for (const pl of j.players) {
      const r = byPid.get(pl.pid) ?? byHero.get(pl.heroSlug);
      const lo = r ? loadoutFromPerks(mapPerks(r.perks)) : null;
      if (lo) { pl.loadout = lo; filled++; } else if (pl.loadout === undefined) pl.loadout = null;
    }
    writeFileSync(p, JSON.stringify(j, null, 1));
    patched++;
    console.log(`  ${id.slice(0, 8)} · loadouts recorded for ${filled}/${j.players.length} players`);
    await sleep(250);
  }
  console.log(`\n${patched} film(s) patched, ${skipped} already had loadouts, ${missing} unavailable (${files.length} in scope) -> data/postgame/`);
}

main().catch((e) => { console.error(e); process.exit(1); });

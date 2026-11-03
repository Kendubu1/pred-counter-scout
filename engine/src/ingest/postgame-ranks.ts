// Rank and VP for all ten players of each committed post-game film, squad and
// randoms on both teams, so a review can show where every player stood after the
// game (players[i].rankVp).
//
//   npm run postgame:ranks            # films with a player missing rankVp
//   npm run postgame:ranks -- --all   # re-fetch every film
//
// LIVE pred.gg (needs PREDGG creds): aliased match(by: { id }) queries, 10 films
// per request, sequential with a delay (data policy). MatchPlayerRating gives the
// rank held going INTO the game (rank), VP before (points) and after (newPoints),
// and isRankup. pred.gg does not report the rank after the game, so `after.rank`
// is derived: the entry rank when the new VP is still inside its band, otherwise
// the ladder division whose VP band holds the new VP (Paragon only when the
// player entered as Paragon, since its band overlaps Diamond I). `afterDerived`
// marks that, and a rank-up flagged by pred.gg is kept as reported.
// Unranked/unplaced players get rankVp: null.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, hasCredentials } from './predgg.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = path.join(ROOT, 'data/postgame');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;
const BATCH = 10;
const RANK = 'name tierIdx divisionIdx ratingMin ratingMax';
const FIELDS = `matchPlayers { player { uuid } rating { points newPoints isRankup rank { ${RANK} } rating { ranks { ${RANK} } } } }`;

type Rank = { name: string; tierIdx: number; divisionIdx: number; ratingMin: number; ratingMax: number };
type Rating = { points: number | null; newPoints: number | null; isRankup: boolean | null; rank: Rank | null; rating: { ranks: Rank[] | null } | null } | null;

export type RankVp = {
  before: { rank: string; tierIdx: number; vp: number };
  after: { rank: string; tierIdx: number; vp: number };
  change: number;
  rankUp: boolean;
  afterDerived: true;
};

const inBand = (r: Rank, vp: number) => vp >= r.ratingMin && vp < r.ratingMax;

/** One player's rank and VP before and after the game, or null when unranked. */
export function rankVpOf(rt: Rating): RankVp | null {
  if (!rt?.rank || rt.points == null || rt.newPoints == null) return null;
  const ladder = (rt.rating?.ranks ?? []).filter((r) => r && r.name);
  const entry = rt.rank;
  const vp = Math.round(rt.newPoints);
  let after: Rank = entry;
  if (!inBand(entry, vp)) {
    const pool = ladder.filter((r) => entry.tierIdx === 5 ? true : r.tierIdx !== 5);
    after = pool.find((r) => inBand(r, vp)) ?? entry;
  }
  return {
    before: { rank: entry.name, tierIdx: entry.tierIdx, vp: Math.round(rt.points) },
    after: { rank: after.name, tierIdx: after.tierIdx, vp },
    change: vp - Math.round(rt.points),
    rankUp: !!rt.isRankup,
    afterDerived: true,
  };
}

async function main() {
  if (!hasCredentials()) { console.error('pred.gg credentials required (PREDGG_CLIENT_ID / PREDGG_CLIENT_SECRET)'); process.exit(2); }
  const all = process.argv.includes('--all');
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const todo = readdirSync(OUT_DIR).filter((f) => UUID_RE.test(f))
    .filter((fn) => !only.length || only.some((id) => fn.startsWith(id)))
    .filter((fn) => {
      const f = JSON.parse(readFileSync(path.join(OUT_DIR, fn), 'utf8'));
      return all || (f.players ?? []).some((p: any) => !('rankVp' in p));
    });
  let films = 0, ranked = 0, players = 0, pending = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const q = `{ ${batch.map((fn, k) => `m${k}: match(by: { id: "${fn.slice(0, -5)}" }) { ${FIELDS} }`).join(' ')} }`;
    let d: Record<string, any>;
    try { d = await gql<Record<string, any>>(q); } catch (e) { console.warn(`  batch ${i / BATCH}: ${(e as Error).message}; skipped`); continue; }
    batch.forEach((fn, k) => {
      const mps = (d[`m${k}`]?.matchPlayers ?? []) as { player: { uuid: string } | null; rating: Rating }[];
      if (!mps.length) return;
      const byPid = new Map(mps.filter((m) => m.player?.uuid).map((m) => [m.player!.uuid, m.rating]));
      // No rating on any of the ten: pred.gg has not posted this game's ranks
      // yet (seen on a fresh patch's first games). Leave the film unmarked so a
      // later run retries it, instead of recording ten unranked players.
      if (![...byPid.values()].some((rt) => rankVpOf(rt))) { pending++; return; }
      const p = path.join(OUT_DIR, fn);
      const f = JSON.parse(readFileSync(p, 'utf8'));
      let n = 0;
      for (const pl of f.players ?? []) {
        if (!byPid.has(pl.pid)) continue;
        pl.rankVp = rankVpOf(byPid.get(pl.pid) ?? null);
        n++;
        players++;
        if (pl.rankVp) ranked++;
      }
      if (n) { writeFileSync(p, JSON.stringify(f, null, 1)); films++; }
    });
    await new Promise((r) => setTimeout(r, 1200));
  }
  console.log(`rank/VP written for ${players} player(s) across ${films} film(s), ${ranked} ranked; ${pending} film(s) with no ranks posted yet, left for the next run (${todo.length} needed it).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

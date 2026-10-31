// Stack reviews for the post-game page (src/stack-review.ts holds the rules).
//
//   npm run review:stacks
//
// Pure local, NO API calls. Reads every film (data/postgame/*.json), scores each
// hero-game with the standouts scorer (same hero-role norm as npm run standouts),
// and for each 2- to 4-stack film checks the lanes the squad members played
// against their best seats (data/artifacts/squad.json roleScores + duoLane).
// Writes data/artifacts/stack-reviews.json. Rerun after new films or `npm run squad`.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { metricsOf, scoreRows, type Row, type StandoutFilm } from '../standouts.js';
import { reviewStack, ROUGH_Z, LANE_GAP_PER100, type StackMemberGame, type Role } from '../stack-review.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PG = path.join(ROOT, 'data/postgame');
const OUT = path.join(ROOT, 'data/artifacts/stack-reviews.json');
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

function main() {
  const squad = read('data/artifacts/squad.json');
  const films = readdirSync(PG).filter((f) => /^[0-9a-f-]{36}\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(path.join(PG, f), 'utf8')))
    .filter((f) => Array.isArray(f.players) && f.players.length === 10);
  // Score over every film so the hero-role norm matches the standouts report.
  const rows: Row[] = films.flatMap((film: StandoutFilm) => film.players.map((p) => ({ film, p, m: metricsOf(p, film) })));
  const scores = scoreRows(rows);
  const scoreOf = new Map(rows.map((r, i) => [`${r.film.matchId}|${r.p.pid}`, scores[i]!]));

  const memberUuids = new Set<string>(squad.members.map((m: { uuid: string }) => m.uuid));
  const nameToUuid = new Map<string, string>(squad.members.map((m: { uuid: string; name: string }) => [m.name, m.uuid]));
  const games: Record<string, unknown> = {};
  let n = 0, recs = 0;
  for (const f of films) {
    const size = f.squad?.stackSize;
    if (!(size >= 2 && size <= 4)) continue;
    const ours: StackMemberGame[] = f.players
      .filter((p: any) => p.us && (memberUuids.has(p.pid) || (p.squadName && nameToUuid.has(p.squadName))))
      .map((p: any) => {
        const s = scoreOf.get(`${f.matchId}|${p.pid}`);
        return {
          uuid: memberUuids.has(p.pid) ? p.pid : nameToUuid.get(p.squadName)!,
          name: p.squadName ?? p.name, role: p.role as Role, heroSlug: p.heroSlug, heroName: p.heroName,
          kills: p.kills ?? 0, deaths: p.deaths ?? 0, assists: p.assists ?? 0,
          score: s ? s.score : null, z: s?.z,
        };
      });
    const r = reviewStack({ matchId: f.matchId, result: f.result, stackSize: size }, ours, squad.roleScores, squad.duoLane ?? {});
    if (!r) continue;
    games[f.matchId] = r;
    n++; if (r.recommend) recs++;
  }
  const out = {
    generatedAt: new Date().toISOString(),
    source: `${films.length} reviewed films (data/postgame) + squad role records (data/artifacts/squad.json, ${String(squad.generatedAt).slice(0, 10)})`,
    method: [
      'Lanes: the squad picker\'s set scoring (shrunk career role win rates + the carry/support duo-lane record) for the members who queued, played seats vs best seats.',
      `This game: the standouts score, a role-weighted z against that hero-role's norm in our films; at or below -${ROUGH_Z} is a rough game.`,
      `A lane suggestion only after a loss, when the best seats beat the played ones by ${LANE_GAP_PER100}+ wins per 100 games or someone had a rough game.`,
    ],
    games,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`stack reviews: ${n} partial-stack films, ${recs} with a lane suggestion → ${path.relative(ROOT, OUT)}`);
}

main();

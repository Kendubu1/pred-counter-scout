// Fork PoC: tag players by CURRENT ranked tier from the ladder (pred.gg GraphQL,
// sorted by points; paged until the first row below MIN_TIER). Writes
// engine/copy-tasks/fork-poc/ladder.json = { [playerUuid]: tierIdx }.
// tierIdx: 0 Bronze .. 4 Diamond, 5 Paragon. Current rank, not rank at match time.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql, currentRatingId } from './predgg.js';
import { sleep } from './match-stream.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'engine/copy-tasks/fork-poc/ladder.json');
const MIN_TIER = Number(process.env.MIN_TIER ?? 2); // Gold+, so Diamond+ and Gold+ bands both come from one pass

async function main() {
  const ratingId = await currentRatingId();
  const tiers: Record<string, number> = {};
  let total = 0, calls = 0;
  for (let offset = 0; ; offset += 500) {
    const d = await gql<{ leaderboardPaginated: { totalCount: number; results: { rank: { tierIdx: number } | null; player: { uuid: string | null } | null }[] } }>(
      `{ leaderboardPaginated(ratingId: "${ratingId}", limit: 500, offset: ${offset}) { totalCount results { rank { tierIdx } player { uuid } } } }`);
    calls++;
    total = d.leaderboardPaginated.totalCount;
    const rows = d.leaderboardPaginated.results;
    let below = false;
    for (const r of rows) {
      const t = r.rank?.tierIdx ?? -1;
      if (t < MIN_TIER) { below = true; break; }
      if (r.player?.uuid) tiers[r.player.uuid] = t;
    }
    if (below || rows.length < 500 || offset + 500 >= total) break;
    await sleep(300);
  }
  writeFileSync(OUT, JSON.stringify(tiers));
  const by: Record<number, number> = {};
  for (const t of Object.values(tiers)) by[t] = (by[t] ?? 0) + 1;
  console.log(`ladder ${ratingId}: ${total} placed players, ${calls} calls; tier counts ${JSON.stringify(by)} -> ${path.relative(ROOT, OUT)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

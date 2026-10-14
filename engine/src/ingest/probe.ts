// Field probe for the live match source (pred.gg, via src/ingest/predgg-feed.ts).
// Run before building anything on an assumed field: prints what the API
// actually returns today for a handful of fresh matches.
//
//   npm run probe -- [hours=3]          (needs PREDGG creds)
//
// History: this probed the omeda.city match feed (oldest-first, no patch field,
// no augment/Eternal fields) until that feed went to HTTP 503 in 2026-09. pred.gg
// matches DO carry their version, so patch partitioning no longer needs
// start_time arithmetic.

import { hasCredentials } from './predgg.js';
import { sampleMatches, type FeedPlayer } from './predgg-feed.js';

function enrichment(p: FeedPlayer | undefined): string {
  if (!p) return 'no players';
  const fields: (keyof FeedPlayer)[] = ['inventory_data', 'role', 'rank', 'level', 'gold_earned_at_interval', 'largest_critical_strike'];
  return fields.map((f) => {
    const v = p[f];
    return `${f}=${v == null || (Array.isArray(v) && !v.length) ? 'NULL' : 'ok'}`;
  }).join(' ');
}

async function main() {
  if (!hasCredentials()) { console.error('needs PREDGG_CLIENT_ID/SECRET in env'); process.exit(1); }
  const hours = Number(process.argv[2] ?? 3);
  const to = new Date();
  const { matches } = await sampleMatches({
    from: new Date(to.getTime() - hours * 3600_000), to, gameModes: ['RANKED'], perHero: 3, heroes: ['grux', 'gideon'],
  });
  for (const m of matches.slice(-6)) {
    console.log(`${m.start_time} ${m.game_mode} v${m.version ?? '?'} ${m.id.slice(0, 8)} winner=${m.winning_team || 'NULL'} players=${m.players.length}  ${enrichment(m.players[0])}`);
  }
  if (!matches.length) console.log(`no ranked matches in the last ${hours}h for the probe heroes`);
}

main().catch((e) => { console.error(e); process.exit(1); });
